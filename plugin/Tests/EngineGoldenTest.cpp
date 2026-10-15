/*
    The C++ engine must play exactly what the TypeScript engine plays.
    Golden data: npx tsx scripts/golden-engine.ts golden.json   (every key × scale × size × spread × inversion)
    Run:         harmonique_engine_test golden.json
*/
#include "Music.h"
#include <juce_core/juce_core.h>
#include <iostream>

using namespace hq;

namespace
{
    int failures = 0, checks = 0;
    void fail (const juce::String& what)
    {
        if (++failures <= 25) std::cout << "  MISMATCH " << what << "\n";
    }

    ScaleId scaleFromKey (const juce::String& k)
    {
        for (auto& d : scaleDefs()) if (k == d.key) return d.id;
        jassertfalse;
        return ScaleId::ionian;
    }

    ChordSize sizeFromKey (const juce::String& k)
    {
        for (int i = 0; i < numSizes; ++i) if (k == sizeKey ((ChordSize) i)) return (ChordSize) i;
        jassertfalse;
        return ChordSize::seventh;
    }

    Spread spreadFromKey (const juce::String& k) { return k == "open" ? Spread::open : k == "wide" ? Spread::wide : Spread::close; }

    juce::String str (const Notes& n)
    {
        juce::StringArray s;
        for (int x : n) s.add (juce::String (x));
        return "[" + s.joinIntoString (",") + "]";
    }

    bool same (const Notes& n, const juce::var& arr)
    {
        if (! arr.isArray() || arr.size() != n.count) return false;
        for (int i = 0; i < n.count; ++i) if ((int) arr[i] != n.v[i]) return false;
        return true;
    }

    juce::String utf8 (const std::string& s) { return juce::String::fromUTF8 (s.c_str()); }
}

int main (int argc, char** argv)
{
    if (argc < 2) { std::cout << "usage: harmonique_engine_test golden.json\n"; return 2; }
    const auto golden = juce::JSON::parse (juce::File (juce::File::getCurrentWorkingDirectory().getChildFile (argv[1])));
    if (! golden.isObject()) { std::cout << "can't read " << argv[1] << "\n"; return 2; }
    const int keysLo = golden["keysLo"], keysHi = golden["keysHi"];

    // Chord maps + next-chord hints
    for (auto& m : *golden["maps"].getArray())
    {
        const auto scale = scaleFromPitchClass (m["root"], scaleFromKey (m["scale"]));
        const auto map = buildChordMap (scale, sizeFromKey (m["size"]));
        const auto where = juce::String ((int) m["root"]) + " " + m["scale"].toString() + " " + m["size"].toString();
        for (int k = 0; k < 12; ++k)
        {
            const auto& s = map[(size_t) k];
            const auto& g = m["slots"][k];
            ++checks;
            bool ok = utf8 (s.chord.symbol) == g["symbol"].toString() && utf8 (s.chord.roman) == g["roman"].toString()
                   && utf8 (s.role) == g["role"].toString() && s.rootOffset == (int) g["rootOffset"]
                   && s.degree == (int) g["degree"] && s.resolvesTo == (int) g["resolvesTo"]
                   && s.color == (g["kind"].toString() == "color") && g["iv"].size() == s.chord.count;
            for (int i = 0; ok && i < s.chord.count; ++i)
                ok = (int) g["iv"][i] == s.chord.intervals[(size_t) i] && (int) g["pcs"][i] == s.chord.pcs[(size_t) i];
            if (! ok) fail (where + " key " + juce::String (k) + ": got " + utf8 (s.chord.symbol) + " " + utf8 (s.chord.roman) + " (" + utf8 (s.role)
                            + "), want " + g["symbol"].toString() + " " + g["roman"].toString() + " (" + g["role"].toString() + ")");

            const auto next = suggestNext (scale, map, k);
            const auto& gn = m["next"][k];
            ++checks;
            bool nok = gn.size() == (int) next.size();
            for (int i = 0; nok && i < (int) next.size(); ++i)
                nok = next[(size_t) i].keyPc == (int) gn[i]["k"] && std::abs (next[(size_t) i].weight - (double) gn[i]["w"]) < 1e-12
                   && next[(size_t) i].spice == (gn[i]["s"].toString() == "spice");
            if (! nok) fail (where + " next after key " + juce::String (k));
        }
    }
    std::cout << "chord maps + hints checked\n";

    // FIXED voicing on every key
    for (auto& f : *golden["fixed"].getArray())
    {
        const auto scale = scaleFromPitchClass (f["root"], scaleFromKey (f["scale"]));
        const auto map = buildChordMap (scale, sizeFromKey (f["size"]));
        const auto spread = spreadFromKey (f["spread"]);
        const int inv = f["inversion"];
        for (int key = keysLo; key <= keysHi; ++key)
        {
            const auto hit = chordForKey (key, scale, map);
            const auto notes = voiceChord (shapeOf (map[(size_t) hit.keyPc].chord), hit.rootMidi, inv, spread);
            ++checks;
            if (! same (notes, f["notes"][key - keysLo]))
                fail ("fixed " + juce::String ((int) f["root"]) + " " + f["scale"].toString() + " " + f["size"].toString() + " "
                      + f["spread"].toString() + " inv " + juce::String (inv) + " key " + juce::String (key) + ": got " + str (notes)
                      + " want " + juce::JSON::toString (f["notes"][key - keysLo], true));
        }
    }
    std::cout << "fixed voicing checked\n";

    // SMOOTH voicing over a walk of keys
    for (auto& s : *golden["smooth"].getArray())
    {
        const auto scale = scaleFromPitchClass (s["root"], scaleFromKey (s["scale"]));
        const auto map = buildChordMap (scale, sizeFromKey (s["size"]));
        const auto spread = spreadFromKey (s["spread"]);
        const int inv = s["inversion"];
        Notes prev;
        for (int i = 0; i < s["keys"].size(); ++i)
        {
            const auto hit = chordForKey (s["keys"][i], scale, map);
            prev = voiceLead (shapeOf (map[(size_t) hit.keyPc].chord), hit.rootMidi, prev, inv, spread);
            ++checks;
            if (! same (prev, s["notes"][i]))
            {
                fail ("smooth " + juce::String ((int) s["root"]) + " " + s["scale"].toString() + " step " + juce::String (i) + ": got " + str (prev));
                break;
            }
        }
    }
    std::cout << "smooth voicing checked\n";

    // NOTES mode
    for (auto& n : *golden["snap"].getArray())
    {
        const auto scale = scaleFromPitchClass (n["root"], scaleFromKey (n["scale"]));
        ++checks;
        if (utf8 (keyName (scale)) != n["name"].toString()) fail ("key name " + utf8 (keyName (scale)) + " want " + n["name"].toString());
        for (int m = 0; m < 128; ++m)
        {
            ++checks;
            if (snapToScale (m, scale.pcs) != (int) n["out"][m]) fail ("snap " + n["name"].toString() + " " + juce::String (m));
        }
        for (int k = 0; k < 12; ++k)
        {
            ++checks;
            if (utf8 (scaleNoteLabel (mod (snapToScale (60 + k, scale.pcs), 12), scale)) != n["labels"][k].toString())
                fail ("note label " + n["name"].toString() + " " + juce::String (k));
        }
    }
    std::cout << "notes mode checked\n";

    // Humanize, same random generator
    for (auto& h : *golden["humanize"].getArray())
    {
        Mulberry32 rnd ((uint32_t) (int) h["seed"]);
        std::vector<int> notes;
        for (auto& x : *h["notes"].getArray()) notes.push_back (x);
        for (int p = 0; p < h["presses"].size(); ++p)
        {
            HumanNote out[16];
            humanize (notes.data(), (int) notes.size(), 20 + p * 21, (double) h["amount"], rnd, out);
            for (int i = 0; i < (int) notes.size(); ++i)
            {
                const auto& g = h["presses"][p][i];
                ++checks;
                if (out[i].note != (int) g["n"] || out[i].velocity != (int) g["v"] || std::abs (out[i].delayMs - (double) g["d"]) > 1e-9)
                    fail ("humanize seed " + h["seed"].toString() + " amount " + h["amount"].toString() + " press " + juce::String (p));
            }
        }
    }
    std::cout << "humanize checked\n";

    std::cout << checks << " checks, " << failures << " mismatches\n";
    return failures == 0 ? 0 : 1;
}
