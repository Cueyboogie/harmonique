#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "ChordPlayer.h"

/*
    Harmonique Mini: a MIDI-generating plugin (like Cthulhu / Scaler). It loads as an instrument on its
    own MIDI track; another track listens to it (MIDI From → Harmonique). It makes no sound itself.

        keys (Live's computer MIDI keyboard / a controller / the on-screen keyboard)
          → chord per key (Ch 1) or scale note (Ch 2), humanized, reference-counted → MIDI out
        sustain, mod wheel, pitch bend, other CCs → passed through unchanged
*/
class HarmoniqueProcessor final : public juce::AudioProcessor,
                                  public juce::ChangeBroadcaster   // settings changed (state restored, or the window changed them)
{
public:
    /** Everything the user sets; saved with the project. Changed on the message thread only. */
    struct Settings
    {
        int rootPc = 0;
        hq::ScaleId scale = hq::ScaleId::ionian;
        hq::ChordSize size = hq::ChordSize::seventh;
        bool smooth = false;
        hq::Spread spread = hq::Spread::close;
        int inversion = 0;
        bool notesMode = false;
        int humanize = 0;          // 0 = OFF, 1..10 = 10%..100%
        int theme = 0;             // AMBER, TEAL, ROSE, CREAM
        bool operator== (const Settings&) const = default;
    };

    HarmoniqueProcessor();
    ~HarmoniqueProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void reset() override;
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlockBypassed (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;
    using AudioProcessor::processBlockBypassed;

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

    //==============================================================================
    Settings getSettings() const;
    void setSettings (const Settings&);

    /** On-screen keyboard (message thread). */
    void screenKey (int note, bool down);
    const hq::PlayerDisplay& getDisplay() const { return display; }

    static juce::String settingsToString (const Settings&);
    static Settings settingsFromString (const juce::String&, Settings defaults);

private:
    static BusesProperties buses();
    void rebuildPlayMap();
    void sendPanic (juce::MidiBuffer&, int pos);

    juce::CriticalSection settingsLock;
    Settings settings;

    // Settings → audio thread: written under the spin lock, copied by the audio thread when the version moves.
    juce::SpinLock mapLock;
    hq::PlayMap sharedMap;
    hq::PlayMap audioMap;
    std::atomic<int> mapVersion { 0 };

    // On-screen keys → audio thread
    juce::AbstractFifo screenFifo { 256 };
    std::array<std::pair<int, bool>, 256> screenEvents {};

    hq::ChordPlayer player;
    hq::PlayerDisplay display;
    std::atomic<bool> panicRequested { false };
    bool wasPlaying = false;
    bool lastNotesMode = false;
    juce::MidiBuffer scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HarmoniqueProcessor)
};
