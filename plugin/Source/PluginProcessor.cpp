#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
    constexpr size_t maxPending = 8192;
}

juce::AudioProcessor::BusesProperties HarmoniqueProcessor::buses()
{
   #if JucePlugin_IsMidiEffect
    return {};
   #else
    // Hosts only load instruments that have an audio output; Harmonique leaves it silent.
    return BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true);
   #endif
}

HarmoniqueProcessor::HarmoniqueProcessor() : AudioProcessor (buses())
{
    pending.reserve (maxPending);
}

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

void HarmoniqueProcessor::prepareToPlay (double sr, int)
{
    sampleRate = sr > 0 ? sr : 44100.0;
    samplesDone = 0;
    clockValid = false;
    pending.clear();
    scratch.ensureSize (4096);
}

//==============================================================================
double HarmoniqueProcessor::blockStartMs (int numSamples)
{
    const double sampleMs = (double) samplesDone * 1000.0 / sampleRate;
    const double candidate = Engine::nowMs() - sampleMs;
    samplesDone += numSamples;

    // A block can be called late (host jitter) but its audio is never due earlier than the earliest call
    // suggests: follow the earliest, drift up slowly (clock drift), and start over after a gap.
    if (! clockValid || candidate > clockOffset + 250.0)
        clockOffset = candidate;
    else if (candidate < clockOffset)
        clockOffset = candidate;
    else
        clockOffset += (candidate - clockOffset) * 0.002;
    clockValid = true;
    return clockOffset + sampleMs;
}

void HarmoniqueProcessor::scheduleOut (juce::MidiBuffer& out, double startMs, int numSamples)
{
    // Collect what the engine produced, in time order (the same time keeps the order it was sent in).
    Engine::MidiOut m;
    while (engine.popMidi (m))
    {
        if (pending.size() >= maxPending)
            continue;
        auto at = std::upper_bound (pending.begin(), pending.end(), m.atMs,
                                    [] (double t, const Engine::MidiOut& e) { return t < e.atMs; });
        pending.insert (at, m);
    }

    const double msPerSample = 1000.0 / sampleRate;
    const double endMs = startMs + numSamples * msPerSample;
    size_t done = 0;
    for (; done < pending.size() && pending[done].atMs < endMs; ++done)
    {
        const auto& e = pending[done];
        const int pos = juce::jlimit (0, juce::jmax (0, numSamples - 1), (int) ((e.atMs - startMs) / msPerSample));
        const int len = juce::MidiMessage::getMessageLengthFromFirstByte (e.bytes[0]);
        out.addEvent (e.bytes, len, pos);
    }
    pending.erase (pending.begin(), pending.begin() + (std::ptrdiff_t) done);
}

void HarmoniqueProcessor::processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    audio.clear();
    const int n = audio.getNumSamples() > 0 ? audio.getNumSamples() : 1;
    const double startMs = blockStartMs (n);

    // The project's tempo, transport and where its beat 0 was (so the loop lands on the grid).
    double bpm = 0.0, zero = 0.0;
    bool playing = false;
    if (auto* head = getPlayHead())
        if (auto pos = head->getPosition())
        {
            bpm = pos->getBpm().orFallback (0.0);
            const auto ppq = pos->getPpqPosition();
            playing = pos->getIsPlaying() && ppq.hasValue() && bpm > 0.0;
            if (playing)
                zero = startMs - *ppq * 60000.0 / bpm;
        }
    engine.setTransport (bpm, playing, zero);

    // Notes go to the engine; everything else (sustain, mod wheel, pitch bend, aftertouch) passes through.
    auto& out = scratch;
    out.clear();
    for (const auto meta : midi)
    {
        const auto msg = meta.getMessage();
        if (msg.isNoteOn())
            engine.noteIn (msg.getNoteNumber(), msg.getVelocity());
        else if (msg.isNoteOff())
            engine.noteIn (msg.getNoteNumber(), 0);
        else
            out.addEvent (msg, meta.samplePosition);
    }

    scheduleOut (out, startMs, n);
    midi.swapWith (out);
}

//==============================================================================
void HarmoniqueProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    const auto state = engine.getState();
    dest.replaceAll (state.toRawUTF8(), state.getNumBytesAsUTF8());
}

void HarmoniqueProcessor::setStateInformation (const void* data, int size)
{
    if (data != nullptr && size > 0)
        engine.setState (juce::String::fromUTF8 (static_cast<const char*> (data), size));
}

juce::AudioProcessorEditor* HarmoniqueProcessor::createEditor()
{
    return new HarmoniqueEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new HarmoniqueProcessor();
}
