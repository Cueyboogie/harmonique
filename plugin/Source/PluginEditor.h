#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "PluginProcessor.h"

/*
    Harmonique Mini's window (spec section 7): the backlit monitor, Layout B · Hero, 900 × 420.
    Drawn natively, one component, no text fields. It never takes keyboard focus, so Live's computer
    MIDI keyboard keeps playing while you click here.
*/
class HarmoniqueEditor final : public juce::AudioProcessorEditor,
                               public juce::TooltipClient,
                               private juce::Timer,
                               private juce::ChangeListener
{
public:
    explicit HarmoniqueEditor (HarmoniqueProcessor&);
    ~HarmoniqueEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseMove (const juce::MouseEvent&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;
    void mouseExit (const juce::MouseEvent&) override;
    juce::String getTooltip() override;

    /** For the tests: render one frame of the screen at 1×. */
    juce::Image snapshot();
    /** For the tests: click at a point of the 900 × 420 screen. */
    void clickAt (juce::Point<float>);
    /** For the tests: where a control is (centre), or (−1, −1). */
    juce::Point<float> centreOf (int hit, int arg = 0) const;

    enum class Hit { none, theme, humanizePrev, humanizeValue, humanizeNext, modeChords, modeNotes,
                     keyPrev, keyValue, keyNext, scalePrev, scaleValue, scaleNext,
                     chords, voicing, spread, invert, pianoKey, listItem, listBox };

private:
    struct Region { juce::Rectangle<float> r; Hit hit; int arg; juce::String tip; };
    enum class List { none, humanize, key, scale };

    void timerCallback() override;
    void changeListenerCallback (juce::ChangeBroadcaster*) override;

    void refreshModel();
    bool pullDisplay();
    void rebuild();
    void drawBackground (juce::Graphics&);
    void drawOverlay (juce::Graphics&);
    void drawContent (juce::Graphics&);
    void drawStatus (juce::Graphics&);
    void drawWordmarkRow (juce::Graphics&);
    void drawHeadline (juce::Graphics&);
    void drawSettings (juce::Graphics&);
    void drawKeyboard (juce::Graphics&);
    void drawFooter (juce::Graphics&);
    void drawList (juce::Graphics&);

    const Region* regionAt (juce::Point<float>) const;
    void press (const Region&);
    void clickList (juce::Point<float>);
    void releaseScreenKey();
    void apply (const std::function<void (HarmoniqueProcessor::Settings&)>&);
    float flickerOpacity() const;

    HarmoniqueProcessor& processor;
    HarmoniqueProcessor::Settings settings;
    hq::Scale scale;
    hq::ChordMap map;

    // what the audio thread last showed
    uint32_t lit[4] {}, pressed[4] {};
    int lastKeyPc = -1, lastNote = -1, lastInputNote = -1, inCount = 0, outCount = 0;
    bool lastWasNote = false;
    uint32_t seenVersion = ~0u;

    std::vector<Region> regions, listRegions;
    Hit hoverHit = Hit::none;
    int hoverArg = -1;
    juce::Point<float> mousePos;
    List openList = List::none;
    juce::Rectangle<float> listAnchor;
    int screenNote = -1;

    juce::Image background, overlay, composite;
    float renderScale = 1.0f;
    bool reduceMotion = false;
    double startMs = juce::Time::getMillisecondCounterHiRes();
    juce::TooltipWindow tooltips { this, 500 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HarmoniqueEditor)
};
