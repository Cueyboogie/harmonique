#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "Engine.h"

/*
    Harmonique as an AU / VST3 plugin: a MIDI generator, like the Max for Live device.

        notes from the track ─► Engine (chords / notes / loop / Euclidean) ─► MIDI out (Ch 1 chords, Ch 2 notes)
        CC, pitch bend, aftertouch ──────────── pass straight through ──────► MIDI out

    Two builds share this code:
      · "Harmonique"          an instrument with MIDI out (AU + VST3) — Ableton Live, Bitwig, Reaper, Cubase, FL…
                              It makes no sound itself: route its MIDI to an instrument track.
      · "Harmonique MIDI FX"  an AU MIDI effect for Logic Pro / GarageBand's MIDI FX slot.
*/
class HarmoniqueProcessor final : public juce::AudioProcessor
{
public:
    HarmoniqueProcessor();
    ~HarmoniqueProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override                     { return true; }

    const juce::String getName() const override         { return JucePlugin_Name; }
    bool acceptsMidi() const override                   { return true; }
    bool producesMidi() const override                  { return true; }
    bool isMidiEffect() const override                  { return JucePlugin_IsMidiEffect != 0; }
    double getTailLengthSeconds() const override        { return 0.0; }

    int getNumPrograms() override                       { return 1; }
    int getCurrentProgram() override                    { return 0; }
    void setCurrentProgram (int) override               {}
    const juce::String getProgramName (int) override    { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    Engine& getEngine() { return engine; }

private:
    static BusesProperties buses();
    /** Wall-clock time (Engine::nowMs) of this block's first sample, smoothed so host jitter doesn't move notes. */
    double blockStartMs (int numSamples);
    void scheduleOut (juce::MidiBuffer& out, double startMs, int numSamples);

    Engine engine;
    double sampleRate = 44100.0;
    int64_t samplesDone = 0;
    double clockOffset = 0.0;    // nowMs − sample time, ms
    bool clockValid = false;

    /** MIDI from the engine that is due in a later block. Kept in time order. */
    std::vector<Engine::MidiOut> pending;
    juce::MidiBuffer scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HarmoniqueProcessor)
};
