# Harmonique Mini — native plugin (VST3 + AU)

Every key plays a chord that fits. A real native plugin (JUCE 8, C++): no web view, so clicking the window never
takes the keyboard from Live, and a chord sounds exactly as long as its key is held.

| Build | Format | Use it in |
|---|---|---|
| **Harmonique Mini** | VST3 + AU instrument with MIDI out | Ableton Live, Bitwig, Reaper, Cubase, Studio One |
| **Harmonique Mini MIDI FX** | AU MIDI effect (macOS) | Logic Pro's MIDI FX slot |

## In Live
Live doesn't load third-party plugins in the MIDI Effect slot, so Harmonique loads like Cthulhu or Scaler:
1. **Track 1 "Harmonique"**: a MIDI track with Harmonique Mini. Arm it. Your controller or Live's computer
   MIDI keyboard goes in; Harmonique's MIDI comes out.
2. **Track 2 (your synth)**: *MIDI From* = Track 1 → *Harmonique Mini*, *Monitor* = In.
3. Record on track 2, or drag the MIDI out. CHORDS go out on Ch 1, NOTES on Ch 2.

## What it does (spec: Harmonique Mini)
KEY (12) · SCALE (10) · CHORDS triad…13th · VOICING FIXED / SMOOTH · SPREAD CLOSE / OPEN / WIDE · INVERT ·
CHORDS | NOTES · **HUMANIZE** OFF…100% (each note up to 30 ms late, never early; velocity ±12) · PHOSPHOR themes.
Sustain, mod wheel, pitch bend and other CCs pass through. Everything is saved with the Live set.

**No stuck notes:** each key remembers exactly the notes it started; overlapping notes are reference-counted;
humanize delays are queued sample-accurately and a note-off always follows its own note-on; transport stop,
bypass, CHORDS ↔ NOTES and host reset release everything Harmonique started (including notes still waiting).

## Build
CMake ≥ 3.22, a C++20 compiler (Xcode on macOS). JUCE 8 downloads on first configure.
```
npm run plugin       # → plugin/build/HarmoniqueMini_artefacts/Release/{VST3,AU}, installed into ~/Library/Audio/Plug-Ins
```
The **Plugin** GitHub workflow builds the universal macOS AU + VST3 and the Windows VST3 on every push, runs the tests,
`auval` and pluginval (strictness 10), and uploads `Harmonique-Mini-macOS.zip` under the run's *Artifacts*.

### Signing + notarization (no more "Not Opened" warnings)
Needs an Apple Developer account. Add these repository secrets (GitHub → Settings → Secrets → Actions) and the
workflow signs with your Developer ID and notarizes:
`MACOS_CERT_P12` (Developer ID Application certificate, .p12, base64), `MACOS_CERT_PASSWORD`,
`MACOS_SIGN_IDENTITY` (e.g. `Developer ID Application: Your Name (TEAMID)`), `APPLE_ID`, `APPLE_TEAM_ID`,
`APPLE_APP_PASSWORD` (an app-specific password).

## Tests
```
npx tsx scripts/golden-engine.ts golden.json                       # what the TypeScript engine plays
cmake -S plugin -B plugin/build -DHARMONIQUE_TESTS=ON && cmake --build plugin/build
plugin/build/harmonique_engine_test_artefacts/Release/harmonique_engine_test golden.json   # 641,730 checks, must be 0 mismatches
plugin/build/harmonique_plugin_test_artefacts/Release/harmonique_plugin_test shots/       # the stuck-key test + screenshots
```
- **Engine parity**: the C++ engine (`Source/Music.*`) is checked against the TypeScript engine over every key ×
  scale × size × spread × inversion, FIXED and SMOOTH, NOTES snap, next-chord hints and humanize.
- **Stuck-key test** (spec section 9, automated): the real processor and window, driven like a host, with a model
  synth listening. Clicks every control then plays short and long holds, changes settings while holding, stops the
  transport, bypasses, humanize 100% with rapid taps, overlapping keys, two channels, state save/restore.

## Layout
- `Source/Music.*` the engine (port of `engine/`) · `Source/ChordPlayer.*` the audio-thread note handling
- `Source/PluginProcessor.*` host side: settings, state, transport, bypass · `Source/PluginEditor.*` the screen
- `Fonts/` Barlow Semi Condensed, JetBrains Mono, Righteous (SIL Open Font License)
