/*
    The stuck-key test (spec section 9), automated: the real processor and window, driven block by block
    like a host, with a model synth on "track 2" that listens to everything Harmonique sends.
    Pass = no note ever outlives its key, in every step.

        harmonique_plugin_test [screenshot-dir]
*/
#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <iostream>
#include <map>

using Hit = HarmoniqueEditor::Hit;

namespace
{
    constexpr double sr = 48000.0;
    constexpr int block = 256;
    int failures = 0;

    void check (bool ok, const juce::String& what)
    {
        std::cout << (ok ? "  ok   " : "  FAIL ") << what << "\n";
        if (! ok) ++failures;
    }

    struct Head final : juce::AudioPlayHead
    {
        bool playing = false;
        juce::Optional<PositionInfo> getPosition() const override
        {
            PositionInfo p;
            p.setIsPlaying (playing);
            p.setBpm (120.0);
            return p;
        }
    };

    /** The synth on track 2: which notes are sounding, and everything it received. */
    struct Synth
    {
        std::map<std::pair<int, int>, int> on;            // (ch, note) → note-ons without their note-off
        std::map<std::pair<int, int>, int64_t> since;
        int doubleOns = 0, strayOffs = 0, notes = 0;
        std::vector<juce::MidiMessage> other;
        std::vector<std::tuple<int64_t, int, int, int>> starts;   // time, ch, note, velocity

        void receive (const juce::MidiMessage& m, int64_t t)
        {
            const auto k = std::make_pair (m.getChannel(), m.getNoteNumber());
            if (m.isNoteOn())
            {
                if (on[k] > 0) ++doubleOns;
                ++on[k];
                since[k] = t;
                ++notes;
                starts.emplace_back (t, m.getChannel(), m.getNoteNumber(), m.getVelocity());
            }
            else if (m.isNoteOff())
            {
                if (on[k] <= 0) ++strayOffs;
                else --on[k];
            }
            else other.push_back (m);
        }
        int sounding() const
        {
            int n = 0;
            for (auto& [k, v] : on) n += v;
            return n;
        }
    };

    struct Rig
    {
        HarmoniqueProcessor p;
        Head head;
        Synth synth;
        juce::AudioBuffer<float> audio { 2, block };
        int64_t now = 0;
        bool bypass = false;

        Rig() { p.setPlayHead (&head); p.prepareToPlay (sr, block); run (1); }

        void run (int blocks, juce::MidiBuffer in = {})
        {
            for (int b = 0; b < blocks; ++b)
            {
                juce::MidiBuffer midi;
                if (b == 0) midi.swapWith (in);
                if (bypass) p.processBlockBypassed (audio, midi);
                else        p.processBlock (audio, midi);
                for (const auto m : midi) synth.receive (m.getMessage(), now + m.samplePosition);
                now += block;
            }
        }
        void ms (double t, juce::MidiBuffer in = {}) { run (juce::jmax (1, (int) std::ceil (t * sr / 1000.0 / block)), std::move (in)); }

        void down (int note, int vel = 100, int ch = 1, int pos = 0)
        {
            juce::MidiBuffer in;
            in.addEvent (juce::MidiMessage::noteOn (ch, note, (juce::uint8) vel), pos);
            run (1, in);
        }
        void up (int note, int ch = 1, int pos = 0)
        {
            juce::MidiBuffer in;
            in.addEvent (juce::MidiMessage::noteOff (ch, note), pos);
            run (1, in);
        }
        /** Let delayed notes land, then: nothing may be sounding. */
        bool silentAfterRelease()
        {
            ms (80);
            return synth.sounding() == 0 && synth.doubleOns == 0 && synth.strayOffs == 0;
        }
    };

    // Live's computer keyboard: A S D … play C D E … in octave 4 (C4 = 60)
    constexpr int A = 60, S = 62, D = 64;
}

int main (int argc, char** argv)
{
    juce::ScopedJuceInitialiser_GUI gui;
    if (argc > 1 && juce::String (argv[1]) == "--bench")
    {
        // How long one screen update takes (a click, a key, a hover), at 1x and on a Retina / 5K display (2x).
        HarmoniqueProcessor p;
        std::unique_ptr<HarmoniqueEditor> ed (dynamic_cast<HarmoniqueEditor*> (p.createEditor()));
        for (float sc : { 1.0f, 2.0f })
        {
            ed->testScale = sc;
            ed->snapshot();
            const int n = 20;
            const double t0 = juce::Time::getMillisecondCounterHiRes();
            for (int i = 0; i < n; ++i) ed->clickAt (ed->centreOf ((int) Hit::invert));
            std::cout << "  update at " << sc << "x: " << (juce::Time::getMillisecondCounterHiRes() - t0) / n << " ms\n";
            juce::Image frame (juce::Image::ARGB, 900 * (int) sc, 420 * (int) sc, true);
            const double t1 = juce::Time::getMillisecondCounterHiRes();
            for (int i = 0; i < n; ++i) { juce::Graphics g (frame); g.addTransform (juce::AffineTransform::scale (sc)); ed->paint (g); }
            std::cout << "  repaint (flicker) at " << sc << "x: " << (juce::Time::getMillisecondCounterHiRes() - t1) / n << " ms\n";
        }
        return 0;
    }
    const juce::File shots = argc > 1 ? juce::File::getCurrentWorkingDirectory().getChildFile (argv[1]) : juce::File();

    std::cout << "1. hold A for 2 s\n";
    {
        Rig r;
        r.down (A);
        const int started = r.synth.sounding();
        check (started == 4, "C key plays 4 notes (Cmaj7) on Ch 1");
        r.ms (2000);
        check (r.synth.sounding() == 4, "they sound for the whole 2 s");
        r.up (A);
        check (r.synth.sounding() == 0, "and stop on release (same block)");
        check (r.silentAfterRelease(), "nothing left, no double note-ons, no stray note-offs");
    }

    std::cout << "2–3. click every control in the window, then play A S D (short and long holds)\n";
    {
        Rig r;
        std::unique_ptr<HarmoniqueEditor> ed (dynamic_cast<HarmoniqueEditor*> (r.p.createEditor()));
        ed->snapshot();
        check (! ed->getWantsKeyboardFocus() && ! ed->getMouseClickGrabsKeyboardFocus(), "the window never takes keyboard focus");

        struct Ctl { Hit hit; int arg; const char* name; };
        const Ctl controls[] = {
            { Hit::theme, 0, "PHOSPHOR" }, { Hit::humanizeNext, 0, "HUMANIZE \xE2\x96\xB8" }, { Hit::humanizePrev, 0, "HUMANIZE \xE2\x97\x82" },
            { Hit::humanizeValue, 0, "HUMANIZE list" }, { Hit::listItem, 3, "HUMANIZE 30%" },
            { Hit::keyNext, 0, "KEY \xE2\x96\xB8" }, { Hit::keyPrev, 0, "KEY \xE2\x97\x82" }, { Hit::keyValue, 0, "KEY list" }, { Hit::listItem, 7, "KEY G" },
            { Hit::scaleNext, 0, "SCALE \xE2\x96\xB8" }, { Hit::scalePrev, 0, "SCALE \xE2\x97\x82" }, { Hit::scaleValue, 0, "SCALE list" }, { Hit::listItem, 3, "SCALE Dorian" },
            { Hit::chords, 0, "CHORDS" }, { Hit::voicing, 0, "VOICING" }, { Hit::spread, 0, "SPREAD" }, { Hit::invert, 0, "INVERT" },
            { Hit::modeNotes, 0, "NOTES" }, { Hit::modeChords, 0, "CHORDS (mode)" }, { Hit::pianoKey, 65, "an on-screen key" },
        };
        bool allFound = true, allClean = true;
        for (auto& c : controls)
        {
            ed->snapshot();
            const auto pt = ed->centreOf ((int) c.hit, c.arg);
            if (pt.x < 0) { allFound = false; std::cout << "         not found: " << c.name << "\n"; continue; }
            ed->clickAt (pt);
            r.ms (20);
            // short and long holds
            r.down (A); r.ms (30); r.up (A);
            r.down (S); r.ms (600); r.up (S);
            r.down (D); r.run (1); r.up (D);
            const bool clean = r.silentAfterRelease();
            if (! clean) std::cout << "         after " << c.name << ": " << r.synth.sounding() << " notes still on\n";
            allClean &= clean;
        }
        check (allFound, "every control is on screen");
        check (allClean, "after every click, every chord stops on release");
        const auto s = r.p.getSettings();
        check (s.rootPc == 7 && s.scale == hq::ScaleId::dorian && s.humanize == 3, "the clicks changed the settings (G Dorian, humanize 30%)");
        if (shots != juce::File())
        {
            shots.createDirectory();
            for (int theme = 0; theme < 4; ++theme)
            {
                auto st = r.p.getSettings();
                st.theme = theme;
                r.p.setSettings (st);
                juce::MessageManager::getInstance()->runDispatchLoopUntil (20);
                r.down (A); r.run (2);
                juce::PNGImageFormat png;
                juce::FileOutputStream os (shots.getChildFile ("mini-" + juce::String (theme) + ".png"));
                os.setPosition (0); os.truncate();
                ed->snapshot();
                png.writeImageToStream (ed->snapshot(), os);
                r.up (A); r.ms (60);
            }
            std::cout << "         screenshots → " << shots.getFullPathName() << "\n";
        }
        ed.reset();
        check (r.silentAfterRelease(), "closing the window leaves nothing on");
    }

    std::cout << "4. hold A, change the key while holding, release\n";
    {
        Rig r;
        r.down (A);
        auto s = r.p.getSettings();
        s.rootPc = 3; s.scale = hq::ScaleId::aeolian; s.size = hq::ChordSize::ninth; s.spread = hq::Spread::wide; s.inversion = 2; s.smooth = true;
        r.p.setSettings (s);
        r.ms (100);
        r.up (A);
        check (r.synth.sounding() == 0, "everything A started stops, though key / scale / chords / voicing changed");
        r.down (A); r.ms (50); r.up (A);
        check (r.silentAfterRelease(), "and the next chord uses the new settings cleanly");
    }

    std::cout << "5. hold several keys and stop the transport\n";
    {
        Rig r;
        r.head.playing = true;
        r.run (2);
        r.down (A); r.down (S); r.down (D);
        r.ms (200);
        r.head.playing = false;
        r.run (1);
        check (r.synth.sounding() == 0, "everything stops when the transport stops");
        r.up (A); r.up (S); r.up (D);
        check (r.silentAfterRelease(), "releasing the keys afterwards sends nothing stray");
    }

    std::cout << "6. overlapping notes, repeated note-ons, two channels, pass-through\n";
    {
        Rig r;
        r.down (A);          // Cmaj7: C E G B
        r.down (D);          // Em7:   E G B D  (shares E G B)
        r.up (A);
        check (r.synth.sounding() == 4, "letting go of C keeps the shared notes of Em7 sounding");
        r.up (D);
        check (r.silentAfterRelease(), "letting go of E stops the rest");
        r.down (A); r.down (A); r.up (A);
        check (r.silentAfterRelease(), "a repeated note-on without its note-off doesn't hang");
        r.down (A, 100, 1); r.down (A, 100, 2); r.up (A, 1);
        check (r.synth.sounding() == 4, "the same key on two MIDI channels counts as two keys");
        r.up (A, 2);
        check (r.silentAfterRelease(), "both released: silent");
        juce::MidiBuffer in;
        in.addEvent (juce::MidiMessage::controllerEvent (1, 64, 127), 3);
        in.addEvent (juce::MidiMessage::pitchWheel (1, 9000), 5);
        in.addEvent (juce::MidiMessage::controllerEvent (1, 1, 50), 7);
        r.run (1, in);
        check (r.synth.other.size() == 3, "sustain, pitch bend and mod wheel pass through unchanged");
    }

    std::cout << "6b. HUMANIZE 100%: steps 1–5 again, plus rapid taps\n";
    {
        Rig r;
        auto s = r.p.getSettings();
        s.humanize = 10;
        r.p.setSettings (s);
        r.run (1);
        int64_t worstLate = 0;
        int worstVel = 0;
        bool velsVary = false;
        for (int k = 0; k < 40; ++k)
        {
            const int64_t pressAt = r.now;
            r.synth.starts.clear();
            r.down (A, 90);
            r.ms (60);
            for (auto& [t, ch, note, vel] : r.synth.starts)
            {
                worstLate = std::max (worstLate, t - pressAt);
                worstVel = std::max (worstVel, std::abs (vel - 90));
                velsVary |= vel != 90;
                if (t < pressAt) worstLate = 1 << 30;   // never early
            }
            r.up (A);
        }
        check (r.silentAfterRelease(), "every humanized chord stops on release");
        std::cout << "         latest note " << worstLate * 1000.0 / sr << " ms after its key, velocity off by up to " << worstVel << "\n";
        check (worstLate <= (int64_t) (30.0 * sr / 1000.0) + 1, "no note is more than 30 ms late, none early");
        check (worstVel <= 12 && velsVary, "velocities vary, by at most \xC2\xB1" "12");

        // rapid taps: 10 per second for 5 s, across three keys, some shorter than the humanize delay
        for (int k = 0; k < 50; ++k)
        {
            const int key = k % 3 == 0 ? A : k % 3 == 1 ? S : D;
            juce::MidiBuffer in;
            in.addEvent (juce::MidiMessage::noteOn (1, key, (juce::uint8) 100), 10);
            in.addEvent (juce::MidiMessage::noteOff (1, key), k % 2 ? 40 : 200);   // 0.6 ms or 4 ms later
            r.run (1, in);
            r.ms (100);
        }
        check (r.silentAfterRelease(), "rapid taps leave nothing hanging");

        r.down (A); r.down (S); r.ms (5);           // some notes still waiting in the humanize queue
        r.head.playing = true; r.run (1); r.head.playing = false; r.run (1);
        check (r.silentAfterRelease(), "transport stop also clears notes still waiting to start");
        r.up (A); r.up (S);
        r.down (A); r.ms (5);
        s = r.p.getSettings(); s.notesMode = true; r.p.setSettings (s); r.run (1);
        check (r.silentAfterRelease(), "CHORDS \xE2\x86\x92 NOTES while holding: everything stops");
        r.up (A);
        r.down (61, 80);
        r.ms (60);
        check (r.synth.sounding() == 1, "NOTES mode: one note");
        r.up (61);
        check (r.silentAfterRelease(), "and it stops on release");
    }

    std::cout << "bypass, reset, state\n";
    {
        Rig r;
        r.down (A);
        r.bypass = true;
        r.run (1);
        check (r.synth.sounding() == 0, "bypass releases what Harmonique started");
        r.up (A);
        r.bypass = false;
        r.run (2);
        r.down (S);
        r.p.reset();
        r.run (1);
        check (r.synth.sounding() == 0, "a host reset releases everything");
        r.up (S);

        auto s = r.p.getSettings();
        s.rootPc = 1; s.scale = hq::ScaleId::mixolydian; s.size = hq::ChordSize::eleventh; s.smooth = true;
        s.spread = hq::Spread::open; s.inversion = 3; s.notesMode = true; s.humanize = 7; s.theme = 2;
        r.p.setSettings (s);
        juce::MemoryBlock saved;
        r.p.getStateInformation (saved);
        HarmoniqueProcessor fresh;
        fresh.setStateInformation (saved.getData(), (int) saved.getSize());
        check (fresh.getSettings() == s, "every setting comes back with the Live set (" + saved.toString() + ")");
    }

    std::cout << (failures == 0 ? "all passed\n" : "FAILED\n");
    return failures == 0 ? 0 : 1;
}
