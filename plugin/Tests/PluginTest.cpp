/*
    Headless test of the plugin: the real HarmoniqueProcessor (engine thread + QuickJS + timing),
    called block by block in real time like a host would, with a fake playhead.
    Exit code 0 = all checks passed.
*/
#include "PluginProcessor.h"
#include <iostream>

namespace
{
    constexpr double sr = 48000.0;
    constexpr int block = 256;

    struct FakeHead final : juce::AudioPlayHead
    {
        double bpm = 120.0, ppq = 0.0;
        bool playing = false;
        juce::Optional<PositionInfo> getPosition() const override
        {
            PositionInfo p;
            p.setBpm (bpm);
            p.setIsPlaying (playing);
            p.setPpqPosition (ppq);
            return p;
        }
    };

    struct Event { int64_t sample; juce::MidiMessage msg; };

    struct Rig
    {
        HarmoniqueProcessor p;
        FakeHead head;
        juce::AudioBuffer<float> audio { 2, block };
        int64_t sample = 0;
        double t0 = juce::Time::getMillisecondCounterHiRes();

        Rig() { p.setPlayHead (&head); p.prepareToPlay (sr, block); }

        /** Run `ms` of blocks in real time; returns the MIDI that came out, with absolute sample positions. */
        std::vector<Event> run (double ms, juce::MidiBuffer in = {})
        {
            std::vector<Event> out;
            const int blocks = (int) std::ceil (ms / (block * 1000.0 / sr));
            for (int b = 0; b < blocks; ++b)
            {
                const double due = t0 + (double) sample * 1000.0 / sr;
                while (juce::Time::getMillisecondCounterHiRes() < due)
                    juce::Thread::sleep (1);
                juce::MidiBuffer midi;
                if (b == 0) midi.swapWith (in);
                p.processBlock (audio, midi);
                for (const auto m : midi)
                    out.push_back ({ sample + m.samplePosition, m.getMessage() });
                sample += block;
                if (head.playing) head.ppq += block / sr * head.bpm / 60.0;
            }
            return out;
        }
    };

    int failures = 0;
    void check (bool ok, const juce::String& what)
    {
        std::cout << (ok ? "  ok   " : "  FAIL ") << what << "\n";
        if (! ok) ++failures;
    }

    std::vector<int> notesOn (const std::vector<Event>& ev, int channel)
    {
        std::vector<int> n;
        for (auto& e : ev)
            if (e.msg.isNoteOn() && e.msg.getChannel() == channel) n.push_back (e.msg.getNoteNumber());
        return n;
    }
}

/** --window <seconds>: open the plugin window, play a chord through the engine, keep it open (for a screenshot). */
static int showWindow (double seconds)
{
    HarmoniqueProcessor p;
    p.prepareToPlay (sr, block);
    std::unique_ptr<juce::AudioProcessorEditor> editor (p.createEditor());
    juce::DocumentWindow window ("Harmonique", juce::Colours::black, 0);
    window.setUsingNativeTitleBar (true);
    window.setContentNonOwned (editor.get(), true);
    window.setVisible (true);
    p.getEngine().call (R"({"m":"loadPreset","a":[0]})");
    const auto end = juce::Time::getMillisecondCounterHiRes() + seconds * 1000.0;
    juce::AudioBuffer<float> audio (2, block);
    while (juce::Time::getMillisecondCounterHiRes() < end)
    {
        juce::MessageManager::getInstance()->runDispatchLoopUntil (5);
        juce::MidiBuffer midi;
        p.processBlock (audio, midi);
    }
    window.clearContentComponent();
    const auto error = p.getEngine().getError();
    std::cout << (error.isEmpty() ? "window ok\n" : ("engine error: " + error + "\n").toStdString());
    return error.isEmpty() ? 0 : 1;
}

#if JUCE_LINUX
extern "C" int juce_gtkWebkitMain (int argc, const char* const* argv);
#endif

int main (int argc, char** argv)
{
   #if JUCE_LINUX
    if (argc >= 2 && juce::String (argv[1]) == "--juce-gtkwebkitfork-child")
        return juce_gtkWebkitMain (argc, argv); // the web view's helper process on Linux
   #endif
    juce::ScopedJuceInitialiser_GUI juce;
    if (argc > 2 && juce::String (argv[1]) == "--window")
        return showWindow (juce::String (argv[2]).getDoubleValue());
    Rig rig;
    rig.run (500); // engine boots

    std::cout << "live chords\n";
    {
        juce::MidiBuffer in;
        in.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        in.addEvent (juce::MidiMessage::controllerEvent (1, 64, 127), 10);
        const int64_t pressed = rig.sample;
        auto ev = rig.run (60, in);
        check (notesOn (ev, 1) == std::vector<int> { 60, 64, 67, 71 }, "C key plays Cmaj7 on Ch 1");
        bool sustain = false;
        for (auto& e : ev) sustain |= e.msg.isController() && e.msg.getControllerNumber() == 64;
        check (sustain, "sustain pedal passes through");
        int64_t first = -1;
        for (auto& e : ev) if (e.msg.isNoteOn()) { first = e.sample; break; }
        const double latencyMs = (double) (first - pressed) * 1000.0 / sr;
        std::cout << "         key → chord: " << latencyMs << " ms\n";
        check (first >= 0 && latencyMs <= 2.0 * block * 1000.0 / sr + 1.0, "chord comes out within two blocks");
        juce::MidiBuffer off;
        off.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
        ev = rig.run (60, off);
        int offs = 0;
        for (auto& e : ev) offs += e.msg.isNoteOff() ? 1 : 0;
        check (offs == 4, "releasing the key releases the chord");
    }

    std::cout << "notes mode\n";
    {
        rig.p.getEngine().call (R"({"m":"setPlayMode","a":["notes"]})");
        rig.run (30);
        juce::MidiBuffer in;
        in.addEvent (juce::MidiMessage::noteOn (1, 66, (juce::uint8) 90), 0); // F# → F in C major
        auto ev = rig.run (40, in);
        check (notesOn (ev, 2) == std::vector<int> { 65 }, "F# plays F on Ch 2");
        juce::MidiBuffer off;
        off.addEvent (juce::MidiMessage::noteOff (1, 66), 0);
        rig.run (30, off);
        rig.p.getEngine().call (R"({"m":"setPlayMode","a":["chords"]})");
    }

    std::cout << "loop on the project grid\n";
    {
        rig.p.getEngine().call (R"({"m":"loadPreset","a":[0]})"); // plays on its own while the project is stopped
        rig.run (300);
        rig.head.bpm = 120.0;
        rig.head.ppq = 0.0;
        rig.head.playing = true;
        const int64_t startSample = rig.sample;
        auto ev = rig.run (4200);
        int64_t first = -1;
        for (auto& e : ev) if (e.msg.isNoteOn()) { first = e.sample - startSample; break; }
        std::cout << "         first chord " << (double) first * 1000.0 / sr << " ms after the project's beat 1\n";
        check (first >= 0 && first <= 2 * block, "starting the project plays the loop from its first chord (within two blocks)");
        double worstMs = 0.0;
        int ons = 0;
        for (auto& e : ev)
            if (e.msg.isNoteOn())
            {
                ++ons;
                if (e.sample - startSample < 2 * block) continue; // the first chord, checked above
                const double beats = (double) (e.sample - startSample) / sr * 2.0; // 120 BPM = 2 beats / s
                worstMs = std::max (worstMs, std::abs (beats - std::round (beats)) * 500.0);
                if (std::getenv ("HQ_VERBOSE")) std::cout << "         note " << e.msg.getNoteNumber() << " at beat " << beats << "\n";
            }
        std::cout << "         " << ons << " note-ons, worst distance from the beat " << worstMs << " ms\n";
        check (ons >= 12, "the preset loops");
        check (worstMs < 1.5, "every chord lands on the project's beat (< 1.5 ms)");

        rig.head.playing = false;
        ev = rig.run (300);
        int offs = 0, lateOns = 0;
        for (auto& e : ev) { offs += e.msg.isNoteOff(); lateOns += e.msg.isNoteOn(); }
        check (offs > 0 && lateOns == 0, "stopping the project stops the loop and releases its notes");
    }

    std::cout << "state\n";
    {
        juce::MemoryBlock saved;
        rig.p.getStateInformation (saved);
        const auto json = juce::JSON::parse (saved.toString());
        check (json.getProperty ("v", 0).operator int() == 1 && json.getProperty ("rawTake", {}).isObject(), "state saved with the project (settings + loop)");

        Rig fresh;
        fresh.p.setStateInformation (saved.getData(), (int) saved.getSize());
        fresh.run (500);
        juce::MemoryBlock again;
        fresh.p.getStateInformation (again);
        check (juce::JSON::parse (again.toString()).getProperty ("rawTake", {}).isObject(), "a new plugin instance restores it");
        check (fresh.p.getEngine().getError().isEmpty(), "no engine errors (restored instance)");
    }

    check (rig.p.getEngine().getError().isEmpty(), "no engine errors");
    std::cout << (failures == 0 ? "all passed\n" : "FAILED\n");
    return failures == 0 ? 0 : 1;
}
