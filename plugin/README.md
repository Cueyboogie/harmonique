# Harmonique plugin (Audio Unit + VST3)

The same Harmonique as the browser and Max for Live versions, as a plugin for any DAW:
every key plays a chord that fits, REC/STOP loops, Euclidean mode, NOTES mode. It is a **MIDI
generator**: it makes no sound itself — it sends chords (Ch 1) and notes (Ch 2) to an instrument.

| Build | Format | Use it in |
|---|---|---|
| **Harmonique** | VST3, AU instrument with MIDI out | Ableton Live (VST3), Bitwig, Reaper, Cubase, Studio One, FL Studio |
| **Harmonique MIDI FX** | AU MIDI effect (macOS) | Logic Pro, GarageBand's MIDI FX slot |

## Routing
- **Ableton Live** (use the **VST3**: Live may not pass on MIDI coming out of an Audio Unit instrument): put Harmonique on MIDI track 1 and arm it.
  On MIDI track 2 with your instrument: *MIDI From* → track 1 → *Harmonique*, Monitor *In*. For NOTES mode, add a
  third track listening on Ch 2. Same routing as Cthulhu-style plugins.
- **Logic Pro**: Software Instrument track → MIDI FX slot → Audio Units → Oscillate Audioworks → *Harmonique MIDI FX*.
- **Bitwig / Reaper / Cubase / Studio One**: load Harmonique as an instrument and route its MIDI output to an instrument track
  (Reaper: put the instrument after it on the same track).

## Tempo and transport
- The project is the clock. When it plays, the loop and Euclidean steps lock to its bars and beats, and recordings use
  its tempo. Starting the project starts your loop on bar 1; stopping it stops the loop.
- With the project stopped, REC → play → STOP still detects your tempo. A plugin can't change the project's tempo, so
  the tempo line says **SET PROJECT TO …**; when the project plays, its tempo wins.
- Settings and your loop are saved with the project.
- No MIDI file export in the plugin: record Harmonique's MIDI on the instrument track (as with the Live device).

## Build
Needs CMake ≥ 3.22, a C++17 compiler (Xcode on macOS), Node 18+ (for the web part), and internet on first configure
(downloads JUCE 8 and QuickJS-ng).
```
npm install
npm run build      # tests + dist/plugin/harmonique-engine.js + harmonique-ui.html (embedded in the plugin)
npm run plugin     # cmake configure + build → plugin/build/Harmonique_artefacts/Release/{AU,VST3}
```
By default the build also installs into `~/Library/Audio/Plug-Ins/{Components,VST3}` (macOS); turn that off with
`-DHARMONIQUE_COPY_AFTER_BUILD=OFF`. Windows needs the WebView2 SDK (see `.github/workflows/plugin.yml`).

The **Plugin** GitHub workflow builds the macOS AU + VST3 (universal) and the Windows VST3 on every push, runs Apple's
`auval` and pluginval on them, and uploads `Harmonique-macOS.zip` under the run's *Artifacts* (install steps in
`INSTALL-mac.txt`).

Tests: `npm test` covers the plugin engine (`tests/plugin-engine.test.ts`). The real plugin, engine thread and timing
are tested headless in real time:
```
cmake -S plugin -B plugin/build -DHARMONIQUE_TESTS=ON && cmake --build plugin/build --target harmonique_plugin_test
plugin/build/harmonique_plugin_test_artefacts/Release/harmonique_plugin_test
```

## How it works
```
 track MIDI ─► processor ─notes─► Engine thread: QuickJS running app/plugin/engine.ts ─timestamped MIDI─► processor ─► MIDI out
 project transport (tempo, playing, beat 0) ───────►      (the same Controller + engine/ as the web app)
                                    plugin window (web view, app/plugin/ui.ts) ◄─snapshots / actions─►
```
- `Source/Engine.*`: runs the bundled engine (`dist/plugin/harmonique-engine.js`) in QuickJS on its own thread, so
  Harmonique keeps playing with the window closed. Lock-free queues to and from the audio thread.
- `Source/PluginProcessor.*`: notes in → engine; CC / pitch bend / aftertouch pass through; each engine message is
  placed on its exact sample (the engine schedules the loop 120 ms ahead). Live keys come out one audio block later.
- `Source/PluginEditor.*`: the monitor screen (`dist/plugin/harmonique-ui.html`) in a JUCE web view; it draws the
  engine's snapshots and sends every click and key back as an action (`app/plugin/protocol.ts`).

Known limits: MIDI is generated in real time, so an offline bounce/freeze of the Harmonique track itself won't be
sample-accurate (record its MIDI onto the instrument track instead). Builds aren't notarized yet.
