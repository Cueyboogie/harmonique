#include "Engine.h"
#include <BinaryData.h>
#include <cmath>
#include <string>
#include <utility>

namespace
{
    constexpr size_t threadStack = 8 * 1024 * 1024;   // QuickJS gets most of it (see boot)
    constexpr double pollEveryMs = 15.0;               // snapshots for the window, at most ~60 per second
}

Engine::Engine() : juce::Thread ("Harmonique engine", threadStack)
{
    startThread (juce::Thread::Priority::high);
}

Engine::~Engine()
{
    stopThread (4000);
}

//==============================================================================
void Engine::noteIn (int note, int velocity)
{
    const auto scope = notesFifo.write (1);
    if (scope.blockSize1 > 0)
        notes[(size_t) scope.startIndex1] = { (uint8_t) note, (uint8_t) velocity };
}

void Engine::setTransport (double bpm, bool playing, double zeroMs)
{
    hostBpm.store (bpm);
    hostZero.store (zeroMs);
    hostPlaying.store (playing);
}

bool Engine::popMidi (MidiOut& out)
{
    const auto scope = midiFifo.read (1);
    if (scope.blockSize1 == 0)
        return false;
    out = midi[(size_t) scope.startIndex1];
    return true;
}

void Engine::pushMidi (double atMs, int status, int d1, int d2)
{
    const auto scope = midiFifo.write (1);
    if (scope.blockSize1 > 0)
        midi[(size_t) scope.startIndex1] = { atMs, { (uint8_t) status, (uint8_t) d1, (uint8_t) d2 } };
}

//==============================================================================
void Engine::call (const juce::String& json)
{
    const juce::ScopedLock sl (lock);
    calls.add (json);
}

juce::String Engine::takeSnapshot()
{
    const juce::ScopedLock sl (lock);
    return std::exchange (snapshot, {});
}

juce::String Engine::getState()
{
    const juce::ScopedLock sl (lock);
    return state;
}

void Engine::setState (const juce::String& json)
{
    const juce::ScopedLock sl (lock);
    state = pendingState = json;
}

juce::String Engine::getError()
{
    const juce::ScopedLock sl (lock);
    return error;
}

//==============================================================================
// Functions the engine calls: __native.now() / .midi(status, d1, d2, atMs) / .log(text)

JSValue Engine::jsNow (JSContext* c, JSValue, int, JSValue*)
{
    return JS_NewFloat64 (c, nowMs());
}

JSValue Engine::jsMidi (JSContext* c, JSValue, int argc, JSValue* argv)
{
    if (argc < 4)
        return JS_UNDEFINED;
    int32_t s = 0, d1 = 0, d2 = 0;
    double at = 0;
    JS_ToInt32 (c, &s, argv[0]);
    JS_ToInt32 (c, &d1, argv[1]);
    JS_ToInt32 (c, &d2, argv[2]);
    JS_ToFloat64 (c, &at, argv[3]);
    static_cast<Engine*> (JS_GetContextOpaque (c))->pushMidi (at, s & 0xff, d1 & 0x7f, d2 & 0x7f);
    return JS_UNDEFINED;
}

JSValue Engine::jsLog (JSContext* c, JSValue, int argc, JSValue* argv)
{
    if (argc > 0)
        if (const char* text = JS_ToCString (c, argv[0]))
        {
            DBG ("[harmonique] " << text);
            JS_FreeCString (c, text);
        }
    return JS_UNDEFINED;
}

//==============================================================================
bool Engine::boot()
{
    rt = JS_NewRuntime();
    if (rt == nullptr)
        return false;
    JS_SetMaxStackSize (rt, threadStack / 2);
    JS_UpdateStackTop (rt);
    JS_SetMemoryLimit (rt, 256 * 1024 * 1024);

    ctx = JS_NewContext (rt);
    if (ctx == nullptr)
        return false;
    JS_SetContextOpaque (ctx, this);

    JSValue global = JS_GetGlobalObject (ctx);
    JSValue native = JS_NewObject (ctx);
    JS_SetPropertyStr (ctx, native, "now",  JS_NewCFunction (ctx, jsNow,  "now",  0));
    JS_SetPropertyStr (ctx, native, "midi", JS_NewCFunction (ctx, jsMidi, "midi", 4));
    JS_SetPropertyStr (ctx, native, "log",  JS_NewCFunction (ctx, jsLog,  "log",  1));
    JS_SetPropertyStr (ctx, global, "__native", native);
    JS_FreeValue (ctx, global);

    const std::string source (BinaryData::harmoniqueengine_js, (size_t) BinaryData::harmoniqueengine_jsSize);
    JSValue result = JS_Eval (ctx, source.c_str(), source.size(), "harmonique-engine.js", JS_EVAL_TYPE_GLOBAL);
    const bool ok = ! JS_IsException (result);
    if (! ok)
        logException();
    JS_FreeValue (ctx, result);
    return ok;
}

void Engine::shutdown()
{
    if (ctx != nullptr) JS_FreeContext (ctx);
    if (rt != nullptr)  JS_FreeRuntime (rt);
    ctx = nullptr;
    rt = nullptr;
}

void Engine::logException()
{
    JSValue ex = JS_GetException (ctx);
    juce::String text;
    if (const char* s = JS_ToCString (ctx, ex))
    {
        text = juce::String::fromUTF8 (s);
        JS_FreeCString (ctx, s);
    }
    JSValue stack = JS_GetPropertyStr (ctx, ex, "stack");
    if (! JS_IsUndefined (stack))
        if (const char* s = JS_ToCString (ctx, stack))
        {
            text << "\n" << juce::String::fromUTF8 (s);
            JS_FreeCString (ctx, s);
        }
    JS_FreeValue (ctx, stack);
    JS_FreeValue (ctx, ex);
    DBG ("[harmonique] " << text);
    const juce::ScopedLock sl (lock);
    error = text;
}

/** Calls harmonique.<fn>(...argv) and frees the arguments. Returns the result (caller frees). */
static JSValue callEngine (JSContext* ctx, const char* fn, int argc, JSValue* argv)
{
    JSValue global = JS_GetGlobalObject (ctx);
    JSValue api = JS_GetPropertyStr (ctx, global, "harmonique");
    JSValue f = JS_GetPropertyStr (ctx, api, fn);
    JSValue result = JS_IsFunction (ctx, f) ? JS_Call (ctx, f, api, argc, argv) : JS_UNDEFINED;
    for (int i = 0; i < argc; ++i)
        JS_FreeValue (ctx, argv[i]);
    JS_FreeValue (ctx, f);
    JS_FreeValue (ctx, api);
    JS_FreeValue (ctx, global);
    return result;
}

void Engine::invoke (const char* fn, int argc, JSValue* argv)
{
    JSValue r = callEngine (ctx, fn, argc, argv);
    if (JS_IsException (r))
        logException();
    JS_FreeValue (ctx, r);
}

juce::String Engine::invokeString (const char* fn, int argc, JSValue* argv)
{
    JSValue r = callEngine (ctx, fn, argc, argv);
    juce::String out;
    if (JS_IsException (r))
        logException();
    else if (JS_IsString (r))
        if (const char* s = JS_ToCString (ctx, r))
        {
            out = juce::String::fromUTF8 (s);
            JS_FreeCString (ctx, s);
        }
    JS_FreeValue (ctx, r);
    return out;
}

//==============================================================================
void Engine::pumpOnce()
{
    // 1. State restored from the project (applied once the engine is up).
    juce::String toLoad;
    juce::StringArray actions;
    {
        const juce::ScopedLock sl (lock);
        toLoad = std::exchange (pendingState, {});
        actions.swapWith (calls);
    }
    if (toLoad.isNotEmpty())
    {
        JSValue a[] = { JS_NewString (ctx, toLoad.toRawUTF8()) };
        invoke ("loadState", 1, a);
    }

    // 2. The project's tempo / transport.
    {
        const bool playing = hostPlaying.load();
        JSValue a[] = { JS_NewFloat64 (ctx, hostBpm.load()), JS_NewBool (ctx, playing),
                        JS_NewFloat64 (ctx, playing ? hostZero.load() : std::nan ("")) };
        invoke ("host", 3, a);
    }

    // 3. Notes from the track.
    {
        const auto scope = notesFifo.read (notesFifo.getNumReady());
        auto play = [&] (int start, int size)
        {
            for (int i = start; i < start + size; ++i)
            {
                JSValue a[] = { JS_NewInt32 (ctx, notes[(size_t) i].note), JS_NewInt32 (ctx, notes[(size_t) i].velocity) };
                invoke ("noteIn", 2, a);
            }
        };
        play (scope.startIndex1, scope.blockSize1);
        play (scope.startIndex2, scope.blockSize2);
    }

    // 4. Actions from the window.
    for (auto& json : actions)
    {
        JSValue a[] = { JS_NewString (ctx, json.toRawUTF8()) };
        invoke ("call", 1, a);
    }

    // 5. The scheduler (loop, Euclidean, note-offs).
    invoke ("pump", 0, nullptr);
    for (JSContext* c = nullptr; JS_ExecutePendingJob (rt, &c) > 0;) {}

    // 6. Snapshot for the window + state for the project.
    const double now = nowMs();
    const bool force = forceSnapshot.exchange (false);
    if (force || now - lastPoll >= pollEveryMs)
    {
        lastPoll = now;
        JSValue a[] = { JS_NewBool (ctx, force) };
        auto snap = invokeString ("poll", 1, a);
        if (snap.isNotEmpty())
        {
            auto saved = invokeString ("saveState", 0, nullptr);
            const juce::ScopedLock sl (lock);
            snapshot = std::move (snap);
            if (saved.isNotEmpty() && pendingState.isEmpty())
                state = std::move (saved);
        }
    }
}

void Engine::run()
{
    if (! boot())
    {
        shutdown();
        return;
    }
    ready = true;
    while (! threadShouldExit())
    {
        pumpOnce();
        wait (1);
    }
    shutdown();
}
