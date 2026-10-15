#include "Music.h"
#include <algorithm>
#include <cmath>
#include <numeric>

namespace hq
{
    //==============================================================================
    // Notes  (engine/notes.ts)
    namespace
    {
        constexpr const char* letters[7] = { "C", "D", "E", "F", "G", "A", "B" };
        constexpr int letterPc[7] = { 0, 2, 4, 5, 7, 9, 11 };

        const char* accidentalSymbol (int a)
        {
            switch (a)
            {
                case -2: return "\xF0\x9D\x84\xAB";   // 𝄫
                case -1: return "\xE2\x99\xAD";       // ♭
                case  1: return "\xE2\x99\xAF";       // ♯
                case  2: return "\xF0\x9D\x84\xAA";   // 𝄪
                default: return "";
            }
        }

        /** Parse "C", "Db", "F#" (the root spellings below). */
        Spelled parse (const char* s)
        {
            const char* l = "CDEFGAB";
            Spelled n;
            n.letter = (int) (std::find (l, l + 7, s[0]) - l);
            n.accidental = s[1] == 'b' ? -1 : s[1] == '#' ? 1 : 0;
            return n;
        }
    }

    int pitchClass (Spelled n)          { return mod (letterPc[n.letter] + n.accidental, 12); }
    std::string noteLabel (Spelled n)   { return std::string (letters[n.letter]) + accidentalSymbol (n.accidental); }

    //==============================================================================
    // Scales  (engine/scales.ts)
    const std::array<ScaleDef, numScales>& scaleDefs()
    {
        static const std::array<ScaleDef, numScales> defs { {
            { ScaleId::lydian,           "lydian",           "Lydian",            "Major modes",    { 0, 2, 4, 6, 7, 9, 11 } },
            { ScaleId::ionian,           "ionian",           "Major",             "Major modes",    { 0, 2, 4, 5, 7, 9, 11 } },
            { ScaleId::mixolydian,       "mixolydian",       "Mixolydian",        "Major modes",    { 0, 2, 4, 5, 7, 9, 10 } },
            { ScaleId::dorian,           "dorian",           "Dorian",            "Major modes",    { 0, 2, 3, 5, 7, 9, 10 } },
            { ScaleId::aeolian,          "aeolian",          "Minor",             "Major modes",    { 0, 2, 3, 5, 7, 8, 10 } },
            { ScaleId::phrygian,         "phrygian",         "Phrygian",          "Major modes",    { 0, 1, 3, 5, 7, 8, 10 } },
            { ScaleId::locrian,          "locrian",          "Locrian",           "Major modes",    { 0, 1, 3, 5, 6, 8, 10 } },
            { ScaleId::harmonicMinor,    "harmonicMinor",    "Harmonic Minor",    "Minor variants", { 0, 2, 3, 5, 7, 8, 11 } },
            { ScaleId::melodicMinor,     "melodicMinor",     "Melodic Minor",     "Minor variants", { 0, 2, 3, 5, 7, 9, 11 } },
            { ScaleId::phrygianDominant, "phrygianDominant", "Phrygian Dominant", "Minor variants", { 0, 1, 4, 5, 7, 8, 10 } },
        } };
        return defs;
    }

    const ScaleDef& scaleDef (ScaleId id) { return scaleDefs()[(size_t) id]; }

    static constexpr int majorIntervals[7] = { 0, 2, 4, 5, 7, 9, 11 };

    bool Scale::contains (int pc) const { return indexOf (pc) >= 0; }
    int Scale::indexOf (int pc) const
    {
        for (int i = 0; i < 7; ++i)
            if (pcs[(size_t) i] == mod (pc, 12)) return i;
        return -1;
    }

    Scale buildScale (Spelled r, ScaleId id)
    {
        Scale s;
        s.def = &scaleDef (id);
        s.root = r;
        const int rootPc = pitchClass (r);
        for (int i = 0; i < 7; ++i)
        {
            const int letter = (r.letter + i) % 7;
            const int target = mod (rootPc + s.def->intervals[i], 12);
            int acc = mod (target - letterPc[letter], 12);
            if (acc > 6) acc -= 12;
            s.notes[(size_t) i] = { letter, acc };
            s.pcs[(size_t) i] = pitchClass (s.notes[(size_t) i]);
        }
        return s;
    }

    static int accidentalCount (const Scale& s)
    {
        int n = 0;
        for (auto& x : s.notes) n += std::abs (x.accidental);
        return n;
    }

    Scale scaleFromPitchClass (int rootPc, ScaleId id)
    {
        static const std::vector<std::vector<const char*>> spellings {
            { "C" }, { "Db", "C#" }, { "D" }, { "Eb", "D#" }, { "E" }, { "F" },
            { "F#", "Gb" }, { "G" }, { "Ab", "G#" }, { "A" }, { "Bb", "A#" }, { "B" } };
        const auto& options = spellings[(size_t) mod (rootPc, 12)];
        Scale best = buildScale (parse (options[0]), id);
        for (size_t i = 1; i < options.size(); ++i)
        {
            auto s = buildScale (parse (options[i]), id);
            if (accidentalCount (s) < accidentalCount (best)) best = s;
        }
        return best;
    }

    std::string keyName (const Scale& s) { return noteLabel (s.root) + " " + s.def->name; }

    //==============================================================================
    // Chords  (engine/chords.ts)
    const char* sizeKey (ChordSize s)
    {
        constexpr const char* k[] = { "triad", "7th", "9th", "11th", "13th" };
        return k[(int) s];
    }

    namespace
    {
        enum Seventh { maj7, dom7, min7, minMaj7, halfDim7, dim7, augMaj7, aug7 };
        const char* seventhSymbol[] = { "maj7", "7", "m7", "m(maj7)", "m7\xE2\x99\xAD" "5", "\xC2\xB0" "7", "+maj7", "+7" };
        const char* seventhRoman[]  = { "maj7", "7", "7", "(maj7)", "\xC3\xB8" "7", "\xC2\xB0" "7", "+maj7", "+7" };
        const char* triadSymbol[]   = { "", "m", "\xC2\xB0", "+" };
        const char* roman[] = { "I", "II", "III", "IV", "V", "VI", "VII" };
        const char* flat = "\xE2\x99\xAD";
        const char* sharp = "\xE2\x99\xAF";

        int seventhOf (Triad t, int seventhInterval)
        {
            switch (t)
            {
                case Triad::major:      return seventhInterval == 11 ? maj7 : seventhInterval == 10 ? dom7 : -1;
                case Triad::minor:      return seventhInterval == 10 ? min7 : seventhInterval == 11 ? minMaj7 : -1;
                case Triad::diminished: return seventhInterval == 10 ? halfDim7 : seventhInterval == 9 ? dim7 : -1;
                case Triad::augmented:  return seventhInterval == 11 ? augMaj7 : seventhInterval == 10 ? aug7 : -1;
            }
            return -1;
        }

        std::string tensionName (int s)
        {
            switch (s)
            {
                case 13: return std::string (flat) + "9";
                case 14: return "9";
                case 15: return std::string (sharp) + "9";
                case 16: return std::string (flat) + "11";
                case 17: return "11";
                case 18: return std::string (sharp) + "11";
                case 20: return std::string (flat) + "13";
                case 21: return "13";
                case 22: return std::string (sharp) + "13";
                default: return "?" + std::to_string (s);
            }
        }

        std::string repeat (const char* s, int n) { std::string r; while (n-- > 0) r += s; return r; }
        std::string lower (std::string s) { for (auto& c : s) c = (char) std::tolower ((unsigned char) c); return s; }
    }

    Chord diatonicChord (const Scale& scale, int degree, ChordSize size)
    {
        Chord c;
        c.degree = degree;
        c.count = 3 + (int) size;
        for (int k = 0; k < c.count; ++k)
        {
            c.notes[(size_t) k] = scale.notes[(size_t) ((degree - 1 + 2 * k) % 7)];
            c.pcs[(size_t) k] = pitchClass (c.notes[(size_t) k]);
        }
        c.intervals[0] = 0;
        for (int k = 1; k < c.count; ++k)
            c.intervals[(size_t) k] = c.intervals[(size_t) k - 1] + mod (c.pcs[(size_t) k] - c.pcs[(size_t) k - 1], 12);

        const int i1 = c.intervals[1], i2 = c.intervals[2];
        c.triad = (i1 == 4 && i2 == 7) ? Triad::major : (i1 == 3 && i2 == 7) ? Triad::minor
                : (i1 == 3 && i2 == 6) ? Triad::diminished : Triad::augmented;
        if (c.count >= 4) c.seventh = seventhOf (c.triad, c.intervals[3]);

        std::string symbol = noteLabel (c.notes[0]) + (c.seventh >= 0 ? seventhSymbol[c.seventh] : triadSymbol[(int) c.triad]);
        if (c.count > 4)
        {
            symbol += "(";
            for (int k = 4; k < c.count; ++k)
                symbol += (k > 4 ? "," : "") + tensionName (c.intervals[(size_t) k]);
            symbol += ")";
        }
        c.symbol = symbol;

        const int offset = mod (scale.def->intervals[degree - 1] - majorIntervals[degree - 1] + 6, 12) - 6;
        const std::string acc = offset < 0 ? repeat (flat, -offset) : repeat (sharp, offset);
        const bool upper = c.triad == Triad::major || c.triad == Triad::augmented;
        std::string numeral = upper ? roman[degree - 1] : lower (roman[degree - 1]);
        if (c.seventh >= 0) numeral += seventhRoman[c.seventh];
        else if (c.triad == Triad::diminished) numeral += "\xC2\xB0";
        else if (c.triad == Triad::augmented) numeral += "+";
        c.roman = acc + numeral;
        return c;
    }

    //==============================================================================
    // Chord map  (engine/chordmap.ts)
    namespace
    {
        int accidentals (const std::array<Spelled, 7>& notes, int count)
        {
            int n = 0;
            for (int i = 0; i < count; ++i) n += std::abs (notes[(size_t) i].accidental);
            return n;
        }

        std::vector<Spelled> enharmonics (Spelled n)
        {
            const int pc = pitchClass (n);
            std::vector<Spelled> out { n };
            for (int d : { -1, 1 })
            {
                const int letter = mod (n.letter + d, 7);
                int acc = mod (pc - letterPc[letter], 12);
                if (acc > 6) acc -= 12;
                if (std::abs (acc) <= 2) out.push_back ({ letter, acc });
            }
            return out;
        }

        bool hasDouble (const Scale& s)
        {
            for (auto& n : s.notes) if (std::abs (n.accidental) > 1) return true;
            return false;
        }

        Scale cleanScale (Spelled root, ScaleId id)
        {
            auto roots = enharmonics (root);
            Scale best = buildScale (roots[0], id);
            for (size_t i = 1; i < roots.size(); ++i)
            {
                auto s = buildScale (roots[i], id);
                if (hasDouble (best) != hasDouble (s)) { if (! hasDouble (s)) best = s; continue; }
                if (accidentals (s.notes, 7) < accidentals (best.notes, 7)) best = s;
            }
            return best;
        }

        int triadKey (const Chord& c) { return c.pcs[0] * 144 + c.pcs[1] * 12 + c.pcs[2]; }

        struct Recipe { bool borrow; ScaleId from; int degree; const char* role; };   // borrow, or secondary dominant of `degree`

        const std::vector<Recipe>& majorRecipes()
        {
            static const std::vector<Recipe> r {
                { true,  ScaleId::aeolian, 4, "Minor iv" },
                { true,  ScaleId::aeolian, 7, "\xE2\x99\xAD" "VII" },
                { true,  ScaleId::aeolian, 6, "\xE2\x99\xAD" "VI" },
                { false, ScaleId::ionian,  5, "V of V" },
                { false, ScaleId::ionian,  6, "V of vi" },
                { true,  ScaleId::aeolian, 3, "\xE2\x99\xAD" "III" },
                { false, ScaleId::ionian,  2, "V of ii" },
                { true,  ScaleId::phrygian, 2, "\xE2\x99\xAD" "II (Neapolitan)" },
                { true,  ScaleId::ionian,  5, "Major V" },
                { false, ScaleId::ionian,  4, "V of IV" },
            };
            return r;
        }

        const std::vector<Recipe>& minorRecipes()
        {
            static const std::vector<Recipe> r {
                { true,  ScaleId::harmonicMinor, 5, "Major V" },
                { true,  ScaleId::dorian,  4, "Major IV" },
                { true,  ScaleId::phrygian, 2, "\xE2\x99\xAD" "II (Neapolitan)" },
                { true,  ScaleId::ionian,  1, "Major I (Picardy)" },
                { false, ScaleId::ionian,  4, "V of iv" },
                { true,  ScaleId::aeolian, 7, "\xE2\x99\xAD" "VII" },
                { true,  ScaleId::aeolian, 6, "\xE2\x99\xAD" "VI" },
                { false, ScaleId::ionian,  5, "V of V" },
                { true,  ScaleId::aeolian, 4, "Minor iv" },
                { true,  ScaleId::aeolian, 5, "Minor v" },
                { true,  ScaleId::aeolian, 3, "\xE2\x99\xAD" "III" },
            };
            return r;
        }

        struct Pick { Chord chord; std::string role, reason; int degree = 1, resolvesTo = 0; int score = 0; };

        bool applyRecipe (const Recipe& r, const Scale& scale, ChordSize size, Pick& out)
        {
            const auto tonic = noteLabel (scale.root);
            if (r.borrow)
            {
                const auto parallel = cleanScale (scale.root, r.from);
                out = { diatonicChord (parallel, r.degree, size), r.role, "Borrowed from " + tonic + " " + scaleDef (r.from).name, r.degree, 0, 0 };
                return true;
            }
            const auto target = diatonicChord (scale, r.degree, ChordSize::triad);
            if (target.triad == Triad::diminished || target.triad == Triad::augmented) return false;
            const auto home = cleanScale (target.notes[0], target.triad == Triad::major ? ScaleId::ionian : ScaleId::harmonicMinor);
            out = { diatonicChord (home, 5, size), r.role, "Secondary dominant \xE2\x86\x92 " + target.symbol, r.degree, r.degree, 0 };
            return true;
        }

        int qualityWeight (Triad t) { return t == Triad::augmented ? -2 : t == Triad::diminished ? 0 : 2; }

        std::vector<Pick> fallbackPicks (const Scale& scale, ChordSize size)
        {
            std::vector<Pick> out;
            for (auto& def : scaleDefs())
            {
                if (def.id == scale.def->id) continue;
                int closeness = 0;
                for (int i : def.intervals)
                    if (std::find (scale.def->intervals, scale.def->intervals + 7, i) != scale.def->intervals + 7) ++closeness;
                const auto parallel = cleanScale (scale.root, def.id);
                for (int d = 1; d <= 7; ++d)
                {
                    const auto triad = diatonicChord (parallel, d, ChordSize::triad);
                    int common = 0;
                    for (int k = 0; k < 3; ++k) if (scale.contains (triad.pcs[(size_t) k])) ++common;
                    out.push_back ({ diatonicChord (parallel, d, size), "Borrowed " + triad.roman,
                                     "Borrowed from " + noteLabel (scale.root) + " " + def.name, d, 0,
                                     closeness + qualityWeight (triad.triad) + 2 * common });
                }
            }
            std::stable_sort (out.begin(), out.end(), [] (const Pick& a, const Pick& b) { return b.score < a.score; });
            return out;
        }

        std::vector<Pick> colorChords (const Scale& scale, ChordSize size)
        {
            std::vector<int> taken;
            for (int d = 1; d <= 7; ++d) taken.push_back (triadKey (diatonicChord (scale, d, ChordSize::triad)));
            auto isTaken = [&] (int k) { return std::find (taken.begin(), taken.end(), k) != taken.end(); };
            std::vector<Pick> picks;
            auto consider = [&] (const Pick& p)
            {
                if (picks.size() >= 5) return;
                const int k = triadKey (p.chord);
                if (isTaken (k)) return;
                for (int i = 0; i < p.chord.count; ++i)
                    if (std::abs (p.chord.notes[(size_t) i].accidental) > 1) return;
                taken.push_back (k);
                picks.push_back (p);
            };
            const auto& recipes = scale.def->intervals[2] == 4 ? majorRecipes() : minorRecipes();
            for (auto& r : recipes)
            {
                Pick t, p;
                if (applyRecipe (r, scale, ChordSize::triad, t) && ! isTaken (triadKey (t.chord)))
                    if (applyRecipe (r, scale, size, p)) consider (p);
            }
            if (picks.size() < 5)
                for (auto& p : fallbackPicks (scale, size)) consider (p);
            return picks;
        }

        /** String.prototype.localeCompare for chord symbols (ICU root collation: letters, then symbols). */
        int symbolCompare (const std::string& a, const std::string& b) { return a.compare (b); }
    }

    ChordMap buildChordMap (const Scale& scale, ChordSize size)
    {
        ChordMap map;
        const int tonicPc = scale.pcs[0];
        auto rootOffset = [&] (const Chord& c) { return mod (c.pcs[0] - tonicPc, 12); };
        for (int i = 0; i < 7; ++i)
        {
            auto& s = map[(size_t) whitePcs[i]];
            s.keyPc = whitePcs[i];
            s.color = false;
            s.chord = diatonicChord (scale, i + 1, size);
            s.role = "Degree " + std::to_string (i + 1);
            s.reason = keyName (scale);
            s.rootOffset = rootOffset (s.chord);
            s.degree = i + 1;
        }
        auto colors = colorChords (scale, size);
        std::stable_sort (colors.begin(), colors.end(), [&] (const Pick& a, const Pick& b)
        {
            const int d = rootOffset (a.chord) - rootOffset (b.chord);
            return d != 0 ? d < 0 : symbolCompare (a.chord.symbol, b.chord.symbol) < 0;
        });
        for (int i = 0; i < 5 && i < (int) colors.size(); ++i)
        {
            auto& s = map[(size_t) blackPcs[i]];
            const auto& p = colors[(size_t) i];
            s.keyPc = blackPcs[i];
            s.color = true;
            s.chord = p.chord;
            s.role = p.role;
            s.reason = p.reason;
            s.rootOffset = rootOffset (p.chord);
            s.degree = p.degree;
            s.resolvesTo = p.resolvesTo;
        }
        return map;
    }

    KeyHit chordForKey (int midi, const Scale& scale, const ChordMap& map)
    {
        const int pc = mod (midi, 12);
        const int tonicPc = scale.pcs[0];
        const int centered = tonicPc > 6 ? tonicPc - 12 : tonicPc;
        return { pc, midi - pc + centered + map[(size_t) pc].rootOffset };
    }

    //==============================================================================
    // Voicing  (engine/voicing.ts, engine/voiceleading.ts)
    bool Notes::operator== (const Notes& o) const
    {
        return count == o.count && std::equal (v, v + count, o.v);
    }

    ChordShape shapeOf (const Chord& c)
    {
        ChordShape s;
        s.count = c.count;
        for (int i = 0; i < c.count; ++i) s.intervals[i] = c.intervals[(size_t) i];
        return s;
    }

    Notes trimmedIntervals (const ChordShape& c)
    {
        Notes out;
        if (c.count < 6)
        {
            for (int i = 0; i < c.count; ++i) out.v[out.count++] = c.intervals[i];
            return out;
        }
        const bool majorThird = c.intervals[1] == 4;
        for (int i = 0; i < c.count; ++i)
        {
            const int semis = c.intervals[i];
            if (i == 2) continue;                       // 5th
            if (i == 5)
            {
                const bool keep = semis == 18 || (c.count != 7 && ! majorThird);
                if (! keep) continue;
            }
            out.v[out.count++] = semis;
        }
        return out;
    }

    int maxInversion (const ChordShape& c) { return c.count >= 4 ? 3 : 2; }

    Notes voiceChord (const ChordShape& chord, int rootMidi, int inversion, Spread spread)
    {
        Notes n = trimmedIntervals (chord);
        for (int i = 0; i < n.count; ++i) n.v[i] += rootMidi;
        const int inv = std::max (0, std::min ({ inversion, maxInversion (chord), n.count - 1 }));
        for (int k = 0; k < inv; ++k)
        {
            std::sort (n.v, n.v + n.count);
            n.v[0] += 12;
        }
        std::sort (n.v, n.v + n.count);

        if (spread != Spread::close && n.count >= 3)
        {
            if (n.count == 3) n.v[1] += 12;
            else n.v[n.count - 2] -= 12;
            std::sort (n.v, n.v + n.count);
        }
        if (spread == Spread::wide)
        {
            std::move_backward (n.v, n.v + n.count, n.v + n.count + 1);
            n.v[0] = n.v[1] - 12;
            ++n.count;
        }
        while (n.v[0] < 0)               for (int i = 0; i < n.count; ++i) n.v[i] += 12;
        while (n.v[n.count - 1] > 127)   for (int i = 0; i < n.count; ++i) n.v[i] -= 12;

        std::sort (n.v, n.v + n.count);
        n.count = (int) (std::unique (n.v, n.v + n.count) - n.v);
        return n;
    }

    namespace
    {
        double movement (const Notes& a, const Notes& b)
        {
            if (a.count == 0 || b.count == 0) return 0;
            auto nearest = [] (int x, const Notes& set)
            {
                int best = std::abs (x - set.v[0]);
                for (int i = 1; i < set.count; ++i) best = std::min (best, std::abs (x - set.v[i]));
                return best;
            };
            double ab = 0, ba = 0;
            for (int i = 0; i < b.count; ++i) ab += nearest (b.v[i], a);
            for (int i = 0; i < a.count; ++i) ba += nearest (a.v[i], b);
            return (ab + ba) / 2;
        }

        double center (const Notes& n)
        {
            double s = 0;
            for (int i = 0; i < n.count; ++i) s += n.v[i];
            return s / n.count;
        }
    }

    Notes voiceLead (const ChordShape& chord, int rootMidi, const Notes& prev, int inversion, Spread spread)
    {
        const Notes home = voiceChord (chord, rootMidi, inversion, spread);
        if (prev.count == 0) return home;
        const double homeCenter = center (home);
        if (std::abs (center (prev) - homeCenter) > 9) return home;

        Notes best = home;
        double bestCost = movement (prev, home);
        for (int shift : { 0, -12, 12 })
            for (int inv = 0; inv <= maxInversion (chord); ++inv)
            {
                const Notes cand = voiceChord (chord, rootMidi + shift, inv, spread);
                const double off = std::abs (center (cand) - homeCenter);
                if (off > 6) continue;
                const double cost = movement (prev, cand) + 1.0 * off;
                if (cost < bestCost - 1e-9) { best = cand; bestCost = cost; }
            }
        return best;
    }

    //==============================================================================
    // Notes mode  (engine/notemode.ts)
    int snapToScale (int midi, const std::array<int, 7>& pcs)
    {
        auto in = [&] (int m) { return std::find (pcs.begin(), pcs.end(), mod (m, 12)) != pcs.end(); };
        for (int d = 0; d <= 6; ++d)
        {
            if (in (midi - d)) return midi - d;
            if (in (midi + d)) return midi + d;
        }
        return midi;
    }

    std::string scaleNoteLabel (int pc, const Scale& s)
    {
        const int i = s.indexOf (pc);
        return i >= 0 ? noteLabel (s.notes[(size_t) i]) : std::string();
    }

    //==============================================================================
    // Next-chord hints  (engine/progression.ts, pop style)
    namespace
    {
        /** Numeric steps of the PRESETS and whether each preset's scale is a major one. */
        struct PresetSteps { bool major; std::vector<int> steps; };   // 0 = a colour-chord step

        const std::vector<PresetSteps>& presetSteps()
        {
            static const std::vector<PresetSteps> p {
                { true, { 1, 5, 6, 4 } }, { true, { 6, 4, 1, 5 } }, { true, { 1, 6, 4, 5 } }, { true, { 4, 5, 3, 6 } },
                { true, { 2, 5, 1, 1 } }, { true, { 4, 3, 2, 1 } }, { true, { 1, 5, 6, 3, 4, 1, 4, 5 } }, { true, { 1, 0, 4, 0 } },
                { false, { 1, 6, 3, 7 } }, { false, { 1, 4, 7, 3 } }, { false, { 1, 7, 6, 0 } }, { false, { 1, 4, 5, 1 } },
                { false, { 1, 4, 1, 4 } }, { true, { 1, 7, 4, 1 } }, { true, { 1, 2, 1, 2 } }, { false, { 1, 2, 1, 7 } },
            };
            return p;
        }

        std::array<std::array<double, 7>, 7> popTable (bool major)
        {
            std::array<std::array<double, 7>, 7> m {};
            for (auto& p : presetSteps())
            {
                if (p.major != major) continue;
                const size_t n = p.steps.size();
                for (size_t i = 0; i < n; ++i)
                {
                    const int a = p.steps[i], b = p.steps[(i + 1) % n];
                    if (a > 0 && b > 0 && a != b) m[(size_t) a - 1][(size_t) b - 1] += 10;
                }
            }
            for (size_t i = 0; i < 7; ++i)
            {
                double total = 0;
                for (double x : m[i]) total += x;
                const double floor = std::max (1.0, total * 0.02) / 6;
                double sum = 0;
                for (size_t j = 0; j < 7; ++j) { m[i][j] = i == j ? 0 : m[i][j] + floor; sum += m[i][j]; }
                for (size_t j = 0; j < 7; ++j) m[i][j] = m[i][j] / sum;
            }
            return m;
        }
    }

    std::vector<Suggestion> suggestNext (const Scale& scale, const ChordMap& map, int fromKeyPc)
    {
        static const auto majorTable = popTable (true), minorTable = popTable (false);
        const auto& P = scale.def->intervals[2] == 4 ? majorTable : minorTable;
        const auto& from = map[(size_t) fromKeyPc];
        auto row = P[(size_t) from.degree - 1];
        if (from.resolvesTo) row[(size_t) from.resolvesTo - 1] += 2;

        struct R { int keyPc; double w; int degree; };
        std::vector<R> ranked;
        for (int j = 0; j < 7; ++j)
            if (whitePcs[j] != fromKeyPc) ranked.push_back ({ whitePcs[j], row[(size_t) j], j + 1 });
        std::stable_sort (ranked.begin(), ranked.end(), [] (const R& a, const R& b) { return b.w < a.w; });
        if (ranked.size() > 3) ranked.resize (3);

        std::vector<Suggestion> out;
        for (auto& r : ranked) out.push_back ({ r.keyPc, r.w, false });
        for (auto& s : map)
        {
            if (! s.color || s.keyPc == fromKeyPc || s.resolvesTo) continue;
            if (std::any_of (ranked.begin(), ranked.end(), [&] (const R& r) { return r.degree == s.degree; }))
            {
                out.push_back ({ s.keyPc, ranked.back().w * 0.8, true });
                break;
            }
        }
        return out;
    }

    //==============================================================================
    // Humanize  (engine/humanize.ts)
    double Mulberry32::next()
    {
        a += 0x6d2b79f5u;
        uint32_t t = a;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        return (double) (t ^ (t >> 14)) / 4294967296.0;
    }

    static int jsRound (double x) { return (int) std::floor (x + 0.5); }

    void humanize (const int* notes, int count, int velocity, double amount, Mulberry32& rnd, HumanNote* out)
    {
        const double a = std::max (0.0, std::min (1.0, amount));
        const int vel = std::max (1, std::min (127, jsRound ((double) velocity)));
        if (a <= 0)
        {
            for (int i = 0; i < count; ++i) out[i] = { notes[i], vel, 0.0 };
            return;
        }
        const double maxDelay = humanizeMaxDelayMs * a;
        const double maxVel = humanizeMaxVelocity * a;

        int order[16], rank[16];
        for (int i = 0; i < count; ++i) order[i] = i;
        std::stable_sort (order, order + count, [&] (int x, int y) { return notes[x] < notes[y]; });
        for (int r = 0; r < count; ++r) rank[order[r]] = r;

        for (int i = 0; i < count; ++i)
        {
            const double strum = count > 1 ? ((double) rank[i] / (count - 1)) * 0.5 : 0.0;
            const double jitter = rnd.next() * (count > 1 ? 0.5 : 0.35);
            const double delay = std::min (maxDelay, (strum + jitter) * maxDelay);
            const int dv = jsRound ((rnd.next() * 2 - 1) * maxVel);
            out[i] = { notes[i], std::max (1, std::min (127, vel + dv)), delay };
        }
    }
}
