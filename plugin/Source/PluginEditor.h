#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

/*
    The plugin window: the Harmonique monitor screen (dist/plugin/harmonique-ui.html) in a web view.
    It draws the engine's snapshots and sends every click / key back as an action; closing it
    doesn't stop anything (the engine lives in the processor).
*/
class HarmoniqueEditor final : public juce::AudioProcessorEditor,
                               private juce::Timer
{
public:
    explicit HarmoniqueEditor (HarmoniqueProcessor&);
    ~HarmoniqueEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    static juce::WebBrowserComponent::Options options (Engine&);
    static std::optional<juce::WebBrowserComponent::Resource> resource (const juce::String& url);

    Engine& engine;
    juce::WebBrowserComponent browser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HarmoniqueEditor)
};
