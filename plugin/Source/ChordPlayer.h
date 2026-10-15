#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include "Music.h"
#include <atomic>

/*
    The audio-thread half of Harmonique Mini: keys in → chords (Ch 1) or scale notes (Ch 2) out.
    Real-time safe: no allocation, no locks.

    Note-off guarantees (spec section 6):
      · each held key remembers exactly the notes it started, so releasing it sends those, whatever
        changed in between (key, scale, chords, voicing…)
      · overlapping notes are reference-counted: two keys sharing a note never cut each other off
      · humanize delays live in our own sample-accurate queue; a note-off is always after its note-on
      · panic() (transport stop, bypass, CHORDS ↔ NOTES, reset) releases everything we started,
        including notes still waiting in the queue
*/

namespace hq
{
    /** Everything the audio thread needs to play the current settings (plain data, copied per block). */
    struct PlayMap
    {
        int version = 0;
        int tonicCentered = 0;
        std::array<int, 12> rootOffset {};
        std::array<ChordShape, 12> shapes {};
        std::array<int, 7> scalePcs {};
        int inversion = 0;
        Spread spread = Spread::close;
        bool smooth = false;
        bool notesMode = false;
        double humanize = 0.0;     // 0..1
    };

    /** What the screen shows, published by the audio thread (lock-free). */
    struct PlayerDisplay
    {
        std::atomic<uint32_t> lit[4] {};        // output notes sounding (both channels)
        std::atomic<uint32_t> pressed[4] {};    // input keys held
        std::atomic<int> lastKeyPc { -1 };      // key (0..11) of the last chord played, −1 none
        std::atomic<int> lastNote { -1 };       // last NOTES-mode note played, −1 none
        std::atomic<int> lastWasNote { 0 };
        std::atomic<int> lastInputNote { -1 };
        std::atomic<int> inCount { 0 }, outCount { 0 };
        std::atomic<uint32_t> version { 0 };
    };

    class ChordPlayer
    {
    public:
        static constexpr int maxVoices = 16;
        static constexpr int mouseSource = 16 * 128;          // on-screen keys: sources 2048..2175
        static constexpr int numSources = 16 * 128 + 128;

        void prepare (double sampleRate);
        /** Release everything we started at `pos`, and forget pending (humanize-delayed) notes. */
        void panic (juce::MidiBuffer& out, int pos);
        /** A key went down / up. `source` identifies the key (channel × 128 + note, or mouseSource + note). */
        void keyDown (int source, int note, int velocity, int pos, const PlayMap&);
        void keyUp (int source, int pos);
        /** Emit everything due in this block into `out`, then advance the clock. */
        void flush (juce::MidiBuffer& out, int numSamples);
        void publish (PlayerDisplay&) const;

        /** For the tests: notes currently sounding (reference count > 0) on a channel. */
        int soundingCount (int ch, int note) const { return refs[ch][note]; }
        int pendingEvents() const { return numQueued; }
        int heldKeys() const;

        int inEvents = 0, outEvents = 0;
        int lastKeyPc = -1, lastNote = -1, lastInputNote = -1;
        bool lastWasNote = false;

    private:
        struct Event { int64_t t; uint32_t seq; uint8_t on, ch, note, vel; };
        struct Voice { uint8_t ch, note; int64_t onTime; };
        struct Held { bool active = false; int count = 0; Voice voices[maxVoices]; };

        void schedule (int64_t t, bool on, int ch, int note, int vel);

        double sampleRate = 44100.0;
        int64_t now = 0;                                      // sample time of the current block's start
        uint32_t seq = 0;
        Mulberry32 random { 0x9e3779b9u };
        Notes lastChord;                                      // for SMOOTH voicing
        int lastMapVersion = -1;

        std::array<Held, numSources> held {};
        uint8_t refs[2][128] {};
        static constexpr int queueSize = 4096;
        std::array<Event, queueSize> queue {};
        int numQueued = 0;
    };
}
