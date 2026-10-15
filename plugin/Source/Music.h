#pragma once

/*
    Harmonique's music engine in C++: a line-for-line port of engine/ (notes, scales, chords, chord map,
    voicing, voice leading, notes mode, next-chord hints, humanize). No JUCE, no allocation in the
    parts the audio thread uses (voicing, voice leading, snap, humanize).

    plugin/Tests/EngineGoldenTest.cpp checks it against the TypeScript engine over every
    key × scale × size × spread × inversion (scripts/golden-engine.ts): it must match exactly.
*/

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace hq
{
    inline int mod (int n, int m) { return ((n % m) + m) % m; }

    //==============================================================================
    // Notes
    struct Spelled { int letter = 0; int accidental = 0; };   // letter 0..6 = C..B, accidental −2..2
    int pitchClass (Spelled);
    std::string noteLabel (Spelled);                          // "E♭", "F♯"

    //==============================================================================
    // Scales
    enum class ScaleId { lydian, ionian, mixolydian, dorian, aeolian, phrygian, locrian,
                         harmonicMinor, melodicMinor, phrygianDominant };
    constexpr int numScales = 10;

    struct ScaleDef
    {
        ScaleId id;
        const char* key;      // the TypeScript id, e.g. "harmonicMinor"
        const char* name;     // "Major", "Harmonic Minor"
        const char* family;   // "Major modes" / "Minor variants"
        int intervals[7];
    };
    const std::array<ScaleDef, numScales>& scaleDefs();
    const ScaleDef& scaleDef (ScaleId);

    struct Scale
    {
        const ScaleDef* def = nullptr;
        Spelled root;
        std::array<Spelled, 7> notes {};
        std::array<int, 7> pcs {};
        bool contains (int pc) const;
        int indexOf (int pc) const;
    };
    Scale buildScale (Spelled root, ScaleId);
    Scale scaleFromPitchClass (int rootPc, ScaleId);
    std::string keyName (const Scale&);                       // "D♭ Mixolydian"

    //==============================================================================
    // Chords
    enum class ChordSize { triad, seventh, ninth, eleventh, thirteenth };
    constexpr int numSizes = 5;
    const char* sizeKey (ChordSize);                          // "triad", "7th" …
    enum class Triad { major, minor, diminished, augmented };

    struct Chord
    {
        int degree = 1;
        int count = 3;                                        // notes in the chord (3..7)
        std::array<Spelled, 7> notes {};
        std::array<int, 7> pcs {};
        std::array<int, 7> intervals {};                      // semitones above the root, stacked upward
        Triad triad = Triad::major;
        int seventh = -1;                                     // index into the seventh qualities, −1 = none
        std::string symbol, roman;
    };
    Chord diatonicChord (const Scale&, int degree, ChordSize);

    //==============================================================================
    // Chord map: a chord on every key
    constexpr int whitePcs[7] = { 0, 2, 4, 5, 7, 9, 11 };
    constexpr int blackPcs[5] = { 1, 3, 6, 8, 10 };

    struct Slot
    {
        int keyPc = 0;
        bool color = false;
        Chord chord;
        std::string role, reason;
        int rootOffset = 0, degree = 1, resolvesTo = 0;      // resolvesTo 0 = none
    };
    using ChordMap = std::array<Slot, 12>;
    ChordMap buildChordMap (const Scale&, ChordSize);

    struct KeyHit { int keyPc; int rootMidi; };
    KeyHit chordForKey (int midi, const Scale&, const ChordMap&);

    //==============================================================================
    // Voicing (real-time safe)
    enum class Spread { close, open, wide };

    struct Notes
    {
        int count = 0;
        int v[16] {};
        bool operator== (const Notes& o) const;
        const int* begin() const { return v; }
        const int* end() const   { return v + count; }
    };

    /** What the audio thread needs to voice a chord: its intervals, nothing else. */
    struct ChordShape
    {
        int count = 3;
        int intervals[7] {};
    };
    ChordShape shapeOf (const Chord&);

    Notes trimmedIntervals (const ChordShape&);
    int maxInversion (const ChordShape&);
    Notes voiceChord (const ChordShape&, int rootMidi, int inversion, Spread);
    /** SMOOTH voicing: least movement from `prev` (may be empty), within half an octave of the key's register. */
    Notes voiceLead (const ChordShape&, int rootMidi, const Notes& prev, int inversion, Spread);

    //==============================================================================
    // Notes mode
    int snapToScale (int midi, const std::array<int, 7>& scalePcs);
    std::string scaleNoteLabel (int pc, const Scale&);

    //==============================================================================
    // Next-chord hints (pop style)
    struct Suggestion { int keyPc; double weight; bool spice; };
    std::vector<Suggestion> suggestNext (const Scale&, const ChordMap&, int fromKeyPc);

    //==============================================================================
    // Humanize (real-time safe)
    struct Mulberry32
    {
        uint32_t a;
        explicit Mulberry32 (uint32_t seed = 1) : a (seed) {}
        double next();
    };

    constexpr double humanizeMaxDelayMs = 30.0;
    constexpr double humanizeMaxVelocity = 12.0;
    struct HumanNote { int note; int velocity; double delayMs; };
    /** One press: `count` notes at `velocity` → velocity + delay per note (same order). */
    void humanize (const int* notes, int count, int velocity, double amount, Mulberry32&, HumanNote* out);
}
