#include "PluginProcessor.h"
#include "PluginEditor.h"

using namespace hq;

namespace
{
    /** The last-used colour theme is the default for new instances. */
    juce::PropertiesFile::Options prefsOptions()
    {
        juce::PropertiesFile::Options o;
        o.applicationName = "Harmonique Mini";
        o.filenameSuffix = ".settings";
        o.folderName = "Oscillate Audioworks";
        o.osxLibrarySubFolder = "Application Support";
        return o;
    }

    int lastTheme()
    {
        juce::PropertiesFile prefs (prefsOptions());
        return juce::jlimit (0, 3, prefs.getIntValue ("theme", 0));
    }

    void rememberTheme (int theme)
    {
        juce::PropertiesFile prefs (prefsOptions());
        if (prefs.getIntValue ("theme", -1) != theme)
        {
            prefs.setValue ("theme", theme);
            prefs.saveIfNeeded();
        }
    }

    const char* spreadKey (Spread s) { return s == Spread::open ? "open" : s == Spread::wide ? "wide" : "close"; }
}

juce::AudioProcessor::BusesProperties HarmoniqueProcessor::buses()
{
   #if JucePlugin_IsMidiEffect
    return {};
   #else
    // Hosts only load instruments that have an audio output; it stays silent.
    return BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true);
   #endif
}

HarmoniqueProcessor::HarmoniqueProcessor() : AudioProcessor (buses())
{
    settings.theme = lastTheme();
    rebuildPlayMap();
}

HarmoniqueProcessor::~HarmoniqueProcessor() = default;

bool HarmoniqueProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
   #if JucePlugin_IsMidiEffect
    juce::ignoreUnused (layouts);
    return true;
   #else
    const auto out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
   #endif
}

//==============================================================================
HarmoniqueProcessor::Settings HarmoniqueProcessor::getSettings() const
{
    const juce::ScopedLock sl (settingsLock);
    return settings;
}

void HarmoniqueProcessor::setSettings (const Settings& s)
{
    int oldTheme;
    {
        const juce::ScopedLock sl (settingsLock);
        if (s == settings) return;
        oldTheme = settings.theme;
        settings = s;
    }
    rebuildPlayMap();
    if (s.theme != oldTheme) rememberTheme (s.theme);
    sendChangeMessage();   // the window redraws (async, on the message thread)
}

void HarmoniqueProcessor::rebuildPlayMap()
{
    const auto s = getSettings();
    const auto scale = scaleFromPitchClass (s.rootPc, s.scale);
    const auto map = buildChordMap (scale, s.size);

    PlayMap m;
    m.tonicCentered = scale.pcs[0] > 6 ? scale.pcs[0] - 12 : scale.pcs[0];
    for (size_t k = 0; k < 12; ++k)
    {
        m.rootOffset[k] = map[k].rootOffset;
        m.shapes[k] = shapeOf (map[k].chord);
    }
    m.scalePcs = scale.pcs;
    m.inversion = s.inversion;
    m.spread = s.spread;
    m.smooth = s.smooth;
    m.notesMode = s.notesMode;
    m.humanize = s.humanize / 10.0;

    const juce::SpinLock::ScopedLockType sl (mapLock);
    m.version = sharedMap.version + 1;
    sharedMap = m;
    mapVersion.store (m.version, std::memory_order_release);
}

void HarmoniqueProcessor::screenKey (int note, bool down)
{
    const auto scope = screenFifo.write (1);
    if (scope.blockSize1 > 0)
        screenEvents[(size_t) scope.startIndex1] = { note, down };
}

//==============================================================================
void HarmoniqueProcessor::prepareToPlay (double sr, int)
{
    player.prepare (sr);
    scratch.ensureSize (8192);
    panicRequested = true;
}

void HarmoniqueProcessor::releaseResources()   { panicRequested = true; }
void HarmoniqueProcessor::reset()              { panicRequested = true; }

void HarmoniqueProcessor::sendPanic (juce::MidiBuffer& out, int pos)
{
    player.panic (out, pos);
}

void HarmoniqueProcessor::processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    audio.clear();
    const int n = juce::jmax (1, audio.getNumSamples());
    auto& out = scratch;
    out.clear();

    // Latest settings (never blocks: if the window is writing right now, use last block's copy).
    if (mapVersion.load (std::memory_order_acquire) != audioMap.version)
    {
        const juce::SpinLock::ScopedTryLockType sl (mapLock);
        if (sl.isLocked()) audioMap = sharedMap;
    }

    // Everything we started stops on: CHORDS ↔ NOTES, transport stop, reset / re-prepare.
    bool playing = false;
    if (auto* head = getPlayHead())
        if (auto pos = head->getPosition())
            playing = pos->getIsPlaying();
    if (panicRequested.exchange (false) || audioMap.notesMode != lastNotesMode || (wasPlaying && ! playing))
        sendPanic (out, 0);
    lastNotesMode = audioMap.notesMode;
    wasPlaying = playing;

    // On-screen keys (they land at the start of the block).
    {
        const auto scope = screenFifo.read (screenFifo.getNumReady());
        auto run = [&] (int start, int size)
        {
            for (int i = start; i < start + size; ++i)
            {
                const auto [note, down] = screenEvents[(size_t) i];
                if (down) player.keyDown (ChordPlayer::mouseSource + note, note, 100, 0, audioMap);
                else      player.keyUp (ChordPlayer::mouseSource + note, 0);
            }
        };
        run (scope.startIndex1, scope.blockSize1);
        run (scope.startIndex2, scope.blockSize2);
    }

    // Keys from the track; everything that isn't a note passes through unchanged.
    for (const auto meta : midi)
    {
        const auto msg = meta.getMessage();
        const int pos = juce::jlimit (0, n - 1, meta.samplePosition);
        const int source = (msg.getChannel() - 1) * 128 + msg.getNoteNumber();
        if (msg.isNoteOn())       player.keyDown (source, msg.getNoteNumber(), msg.getVelocity(), pos, audioMap);
        else if (msg.isNoteOff()) player.keyUp (source, pos);
        else                      out.addEvent (msg, meta.samplePosition);
    }

    player.flush (out, n);
    player.publish (display);
    midi.swapWith (out);
}

void HarmoniqueProcessor::processBlockBypassed (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    // Bypassed: release whatever we started, then let the keys through untouched.
    audio.clear();
    auto& out = scratch;
    out.clear();
    sendPanic (out, 0);
    player.flush (out, juce::jmax (1, audio.getNumSamples()));
    player.publish (display);
    for (const auto meta : midi)
        out.addEvent (meta.getMessage(), meta.samplePosition);
    midi.swapWith (out);
}

//==============================================================================
juce::String HarmoniqueProcessor::settingsToString (const Settings& s)
{
    juce::XmlElement x ("HarmoniqueMini");
    x.setAttribute ("v", 1);
    x.setAttribute ("key", s.rootPc);
    x.setAttribute ("scale", scaleDef (s.scale).key);
    x.setAttribute ("chords", sizeKey (s.size));
    x.setAttribute ("voicing", s.smooth ? "smooth" : "fixed");
    x.setAttribute ("spread", spreadKey (s.spread));
    x.setAttribute ("invert", s.inversion);
    x.setAttribute ("mode", s.notesMode ? "notes" : "chords");
    x.setAttribute ("humanize", s.humanize * 10);
    x.setAttribute ("theme", s.theme);
    return x.toString (juce::XmlElement::TextFormat().singleLine().withoutHeader());
}

HarmoniqueProcessor::Settings HarmoniqueProcessor::settingsFromString (const juce::String& text, Settings s)
{
    const auto x = juce::parseXML (text);
    if (x == nullptr || ! x->hasTagName ("HarmoniqueMini")) return s;
    s.rootPc = juce::jlimit (0, 11, x->getIntAttribute ("key", s.rootPc));
    const auto sc = x->getStringAttribute ("scale");
    for (auto& d : scaleDefs()) if (sc == d.key) s.scale = d.id;
    const auto sz = x->getStringAttribute ("chords");
    for (int i = 0; i < numSizes; ++i) if (sz == sizeKey ((ChordSize) i)) s.size = (ChordSize) i;
    s.smooth = x->getStringAttribute ("voicing") == "smooth";
    const auto sp = x->getStringAttribute ("spread");
    s.spread = sp == "open" ? Spread::open : sp == "wide" ? Spread::wide : Spread::close;
    s.inversion = juce::jlimit (0, 3, x->getIntAttribute ("invert", s.inversion));
    s.notesMode = x->getStringAttribute ("mode") == "notes";
    s.humanize = juce::jlimit (0, 10, x->getIntAttribute ("humanize", s.humanize * 10) / 10);
    s.theme = juce::jlimit (0, 3, x->getIntAttribute ("theme", s.theme));
    return s;
}

void HarmoniqueProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    const auto text = settingsToString (getSettings());
    dest.replaceAll (text.toRawUTF8(), text.getNumBytesAsUTF8());
}

void HarmoniqueProcessor::setStateInformation (const void* data, int size)
{
    if (data == nullptr || size <= 0) return;
    setSettings (settingsFromString (juce::String::fromUTF8 (static_cast<const char*> (data), size), getSettings()));
}

juce::AudioProcessorEditor* HarmoniqueProcessor::createEditor()
{
    return new HarmoniqueEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new HarmoniqueProcessor();
}
