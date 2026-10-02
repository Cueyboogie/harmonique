#pragma once

#include <juce_core/juce_core.h>
#include <array>
#include <atomic>
#include <cstdint>
#include "quickjs.h"

/*
    Harmonique's engine inside the plugin.

    The music logic is the same TypeScript Controller the browser and Max for Live versions use,
    bundled to dist/plugin/harmonique-engine.js and run here in QuickJS on its own thread. It keeps
    running whether or not the plugin window is open.

        audio thread ──notes, transport──►  Engine thread (QuickJS)  ──timestamped MIDI──►  audio thread
        window ────────actions (JSON)────►                           ──snapshots (JSON)──►  window

    Times are milliseconds on one clock, Engine::nowMs(). The engine schedules the loop ~120 ms ahead;
    the processor turns each timestamp into a sample position.
*/
class Engine : private juce::Thread
{
public:
    struct MidiOut { double atMs; uint8_t bytes[3]; };

    Engine();
    ~Engine() override;

    static double nowMs() { return juce::Time::getMillisecondCounterHiRes(); }

    //==============================================================================
    // Audio thread (lock-free)
    void noteIn (int note, int velocity);
    void setTransport (double bpm, bool playing, double zeroMs);
    /** Next MIDI message the engine produced, in the order produced. */
    bool popMidi (MidiOut& out);

    //==============================================================================
    // Message thread
    void call (const juce::String& json);
    /** Ask for a full snapshot (the window just opened). */
    void requestSnapshot()                      { forceSnapshot = true; notify(); }
    /** The latest snapshot for the window, once; empty if there's nothing new. */
    juce::String takeSnapshot();
    /** Plugin state to save with the project (JSON). */
    juce::String getState();
    void setState (const juce::String& json);
    /** Last error from the engine, for the window ("" if all is well). */
    juce::String getError();

private:
    void run() override;
    bool boot();
    void shutdown();
    void pumpOnce();
    void invoke (const char* fn, int argc, JSValue* argv);
    juce::String invokeString (const char* fn, int argc, JSValue* argv);
    void logException();
    void pushMidi (double atMs, int status, int d1, int d2);

    static JSValue jsNow  (JSContext*, JSValue, int, JSValue*);
    static JSValue jsMidi (JSContext*, JSValue, int, JSValue*);
    static JSValue jsLog  (JSContext*, JSValue, int, JSValue*);

    JSRuntime* rt = nullptr;
    JSContext* ctx = nullptr;

    // notes in: audio → engine
    struct NoteIn { uint8_t note, velocity; };
    juce::AbstractFifo notesFifo { 1024 };
    std::array<NoteIn, 1024> notes {};

    // MIDI out: engine → audio
    juce::AbstractFifo midiFifo { 8192 };
    std::array<MidiOut, 8192> midi {};

    // transport: audio → engine
    std::atomic<double> hostBpm { 0.0 }, hostZero { 0.0 };
    std::atomic<bool> hostPlaying { false };

    // actions, snapshots and state: message thread ↔ engine
    juce::CriticalSection lock;
    juce::StringArray calls;
    juce::String snapshot, state, pendingState, error;
    std::atomic<bool> forceSnapshot { true }, ready { false };
    double lastPoll = 0.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Engine)
};
