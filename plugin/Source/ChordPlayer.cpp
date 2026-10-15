#include "ChordPlayer.h"

namespace hq
{
    namespace
    {
        /** A note let go before its humanize delay ran out still sounds this long, so short taps are heard. */
        constexpr double briefMs = 12.0;
    }

    void ChordPlayer::prepare (double sr)
    {
        sampleRate = sr > 0 ? sr : 44100.0;
    }

    int ChordPlayer::heldKeys() const
    {
        int n = 0;
        for (auto& h : held) n += h.active ? 1 : 0;
        return n;
    }

    void ChordPlayer::schedule (int64_t t, bool on, int ch, int note, int vel)
    {
        if (numQueued >= queueSize) return;
        Event e { t, seq++, (uint8_t) on, (uint8_t) ch, (uint8_t) note, (uint8_t) vel };
        // Keep the queue in time order; the same time keeps the order things were scheduled in.
        int i = numQueued;
        while (i > 0 && (queue[(size_t) i - 1].t > t)) { queue[(size_t) i] = queue[(size_t) i - 1]; --i; }
        queue[(size_t) i] = e;
        ++numQueued;
    }

    void ChordPlayer::keyDown (int source, int note, int velocity, int pos, const PlayMap& m)
    {
        if (source < 0 || source >= numSources) return;
        if (held[(size_t) source].active) keyUp (source, pos);     // a repeated note-on: close the first one
        if (m.version != lastMapVersion) { lastChord = {}; lastMapVersion = m.version; }
        ++inEvents;
        lastInputNote = note;

        Notes notes;
        int ch = 0;
        if (m.notesMode)
        {
            notes.count = 1;
            notes.v[0] = snapToScale (note, m.scalePcs);
            ch = 1;
            lastNote = notes.v[0];
            lastWasNote = true;
        }
        else
        {
            const int pc = mod (note, 12);
            const int rootMidi = note - pc + m.tonicCentered + m.rootOffset[(size_t) pc];
            const auto& shape = m.shapes[(size_t) pc];
            notes = m.smooth ? voiceLead (shape, rootMidi, lastChord, m.inversion, m.spread)
                             : voiceChord (shape, rootMidi, m.inversion, m.spread);
            lastChord = notes;
            lastKeyPc = pc;
            lastWasNote = false;
        }

        HumanNote h[16];
        humanize (notes.v, notes.count, velocity, m.humanize, random, h);

        auto& k = held[(size_t) source];
        k.active = true;
        k.count = 0;
        const int64_t t0 = now + pos;
        for (int i = 0; i < notes.count && k.count < maxVoices; ++i)
        {
            if (h[i].note < 0 || h[i].note > 127) continue;
            const int64_t t = t0 + (int64_t) (h[i].delayMs * sampleRate / 1000.0);
            schedule (t, true, ch, h[i].note, h[i].velocity);
            k.voices[k.count++] = { (uint8_t) ch, (uint8_t) h[i].note, t };
        }
    }

    void ChordPlayer::keyUp (int source, int pos)
    {
        if (source < 0 || source >= numSources) return;
        auto& k = held[(size_t) source];
        if (! k.active) return;
        const int64_t t = now + pos;
        const int64_t brief = (int64_t) (briefMs * sampleRate / 1000.0);
        for (int i = 0; i < k.count; ++i)
        {
            const auto& v = k.voices[i];
            // Exactly the notes this key started; never before its own note-on.
            schedule (v.onTime < t ? t : v.onTime + brief, false, v.ch, v.note, 0);
        }
        k.active = false;
        k.count = 0;
    }

    void ChordPlayer::panic (juce::MidiBuffer& out, int pos)
    {
        numQueued = 0;
        for (auto& h : held) { h.active = false; h.count = 0; }
        for (int ch = 0; ch < 2; ++ch)
            for (int n = 0; n < 128; ++n)
                if (refs[ch][n] > 0)
                {
                    refs[ch][n] = 0;
                    out.addEvent (juce::MidiMessage::noteOff (ch + 1, n), pos);
                    ++outEvents;
                }
        lastChord = {};
    }

    void ChordPlayer::flush (juce::MidiBuffer& out, int numSamples)
    {
        const int64_t end = now + numSamples;
        int done = 0;
        for (; done < numQueued && queue[(size_t) done].t < end; ++done)
        {
            const auto& e = queue[(size_t) done];
            const int pos = (int) juce::jlimit<int64_t> (0, juce::jmax (0, numSamples - 1), e.t - now);
            auto& r = refs[e.ch][e.note];
            if (e.on)
            {
                if (r++ == 0) { out.addEvent (juce::MidiMessage::noteOn (e.ch + 1, e.note, (juce::uint8) e.vel), pos); ++outEvents; }
            }
            else if (r > 0 && --r == 0)
            {
                out.addEvent (juce::MidiMessage::noteOff (e.ch + 1, e.note), pos);
                ++outEvents;
            }
        }
        if (done > 0)
        {
            std::move (queue.begin() + done, queue.begin() + numQueued, queue.begin());
            numQueued -= done;
        }
        now = end;
    }

    void ChordPlayer::publish (PlayerDisplay& d) const
    {
        uint32_t lit[4] {}, pressed[4] {};
        for (int ch = 0; ch < 2; ++ch)
            for (int n = 0; n < 128; ++n)
                if (refs[ch][n]) lit[n >> 5] |= 1u << (n & 31);
        for (int s = 0; s < numSources; ++s)
            if (held[(size_t) s].active)
            {
                const int n = s % 128;
                pressed[n >> 5] |= 1u << (n & 31);
            }
        bool changed = false;
        auto set = [&] (auto& a, auto v) { if (a.load (std::memory_order_relaxed) != v) { a.store (v, std::memory_order_relaxed); changed = true; } };
        for (int i = 0; i < 4; ++i) { set (d.lit[i], lit[i]); set (d.pressed[i], pressed[i]); }
        set (d.lastKeyPc, lastKeyPc);
        set (d.lastNote, lastNote);
        set (d.lastWasNote, lastWasNote ? 1 : 0);
        set (d.lastInputNote, lastInputNote);
        set (d.inCount, inEvents);
        set (d.outCount, outEvents);
        if (changed) d.version.fetch_add (1, std::memory_order_release);
    }
}
