#include "PluginEditor.h"
#include <BinaryData.h>

namespace
{
    constexpr int screenW = 1240, screenH = 790;   // the monitor's design size; the page scales to fit
}

HarmoniqueEditor::HarmoniqueEditor (HarmoniqueProcessor& p)
    : AudioProcessorEditor (p), engine (p.getEngine()), browser (options (p.getEngine()))
{
    addAndMakeVisible (browser);
   #if JUCE_LINUX
    // JUCE's Linux web view runs in a helper process and can't pass it a resource bigger than a pipe
    // buffer (64 KB), so on Linux the page loads from a file instead.
    const auto page = juce::File::getSpecialLocation (juce::File::tempDirectory)
                          .getChildFile ("harmonique-ui-" JucePlugin_VersionString ".html");
    page.replaceWithData (BinaryData::harmoniqueui_html, (size_t) BinaryData::harmoniqueui_htmlSize);
    browser.goToURL (juce::URL (page).toString (false));
   #else
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
   #endif

    setResizable (true, true);
    setResizeLimits (screenW / 2, screenH / 2, screenW * 2, screenH * 2);
    if (auto* c = getConstrainer())
        c->setFixedAspectRatio ((double) screenW / screenH);
    setSize (screenW, screenH);
    startTimerHz (60);
}

HarmoniqueEditor::~HarmoniqueEditor()
{
    stopTimer();
}

juce::WebBrowserComponent::Options HarmoniqueEditor::options (Engine& engine)
{
    using Options = juce::WebBrowserComponent::Options;
    return Options{}
       #if JUCE_WINDOWS
        .withBackend (Options::Backend::webview2)
        .withWinWebView2Options (Options::WinWebView2{}
                                     .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory)
                                                              .getChildFile ("Harmonique")))
       #endif
        .withNativeIntegrationEnabled()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider ([] (const juce::String& url) { return resource (url); })
        .withEventListener ("hqCall",  [&engine] (const juce::var& json) { engine.call (json.toString()); })
        .withEventListener ("hqReady", [&engine] (const juce::var&)      { engine.requestSnapshot(); });
}

std::optional<juce::WebBrowserComponent::Resource> HarmoniqueEditor::resource (const juce::String& url)
{
    if (url != "/" && url != "/index.html")
        return std::nullopt;
    const auto* data = reinterpret_cast<const std::byte*> (BinaryData::harmoniqueui_html);
    return juce::WebBrowserComponent::Resource { { data, data + BinaryData::harmoniqueui_htmlSize }, "text/html" };
}

void HarmoniqueEditor::timerCallback()
{
    const auto snapshot = engine.takeSnapshot();
    if (snapshot.isNotEmpty())
        browser.emitEventIfBrowserIsVisible ("hq", snapshot);
}

void HarmoniqueEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff160a03));
}

void HarmoniqueEditor::resized()
{
    browser.setBounds (getLocalBounds());
}
