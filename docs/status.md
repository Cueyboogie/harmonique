# Harmonic — Build Status

**Approach:** Option B. TypeScript engine + web prototype first (Web MIDI → IAC Driver → Ableton), JUCE plugin later.
**Roles:** Diego owns UX, spec decisions and listening tests. Claude writes engine code and tests.
**Repo on Diego’s Mac:** ~/Documents/harmonic (git, first commit b4da515). Launch: double-click `Start Harmonic.command`.
**Hardware target:** Arturia 49-key controller (KeyLab 49 range), Ableton Live.

## Done
- **Phase 0:** music spec generated from the engine (`docs/music-spec.md`)
- **Phase 1:** scale + diatonic chord engine: 10 scales, 12 roots, triad → 13th, roman numerals, correct spelling
- **Key map:** a chord on every key. White = 7 scale chords, black = 5 color chords (borrowed chords and secondary dominants, rule-picked, each with a reason)
- **Phase 2:** voicing engine: octave follows the key, inversions, close/open(drop 2)/wide, trimming for 11ths/13ths
- **Phase 3 (code):** Web MIDI bridge: Arturia in → chords → IAC out, reference-counted notes (no stuck or cut notes), loop protection, sustain/mod/pitch-bend pass-through, panic
- **Phase 3 verified on real hardware** (Diego, Arturia → Chrome → Ableton): works and sounds good
- **Phase 6:** voice leading ("Smooth", on by default): least movement between chords, with a pull back to home register
- **Phase 7:** progression engine: 16 famous presets, seeded generator (length 4/8, Pop or Bach style, Tension, Color), next-chord hints on the key map
  - Bach style learned from 368 J.S. Bach chorales (music21 corpus): `scripts/extract-bach.py` → `engine/bach-data.ts`
- **Chord player:** loops the progression one chord per bar at a set BPM, through the browser synth and MIDI out; Record from keys; Save MIDI file (local app)
- 328 automated tests
- Review build: https://claude.ai/artifact/HLa4a4wpGA6HR4Xzt69rT9 (MIDI works only in the local version)

## Decisions (Diego)
- Ship the 10 scales in the Explorer
- Every key plays a chord, black keys included
- Default chord size: 7th (switchable)
- UI direction for later: basic but attractive, Ableton-like clarity with some sex appeal. Redesign in its own session.
- Tempo to Ableton (prototype): **MIDI Clock** over IAC. Ableton set to follow external sync. (VST later: the DAW owns tempo, so show "set project to X BPM" / fit to project.)
- Recording: **Record button turns into Stop**; Stop closes the loop. Timing kept as played; tempo detected from the take (×2 ÷2 to fix).
- Order: 1) timeline with variable chord lengths + timing-aware recording + tempo detection + MIDI Clock, 2) Euclidean rhythm lanes, 3) integrate into the chosen UI.
- **UI: H (Orbit on cream) chosen for now.** Add a one-octave keyboard strip that mirrors the orbit's hints on real keys.
- **Loop:** Record button required (Record → Stop). Captures chords + timing. No chord-length editing in Harmonic; edit the exported MIDI in Ableton.
- **Euclidean = a live performance mode, off by default** (revised with Diego). Turn it on, hold chords, and they play in the pattern at the current tempo. It never re-rhythms a finished take. **Record always captures exactly what comes out**: your chords + timing, including the Euclidean hits if it was on while recording.
- **Routing (plugin version, like Cthulhu):** Harmonic on MIDI track 1 → instrument track 2 set to MIDI From: Track 1 / Harmonic; record there or drag the MIDI out. Optional bass/arp lanes would use separate MIDI channels so other tracks can pick them up.
- **Palette (Diego):** charcoal #565656 · dusty rose #C2847A · cream #EEE0CB · sky #A0C1D1 · teal #47A8BD
- UI direction: Diego likes **Orbit** (novel) but it must be easy to grasp and accessible. Iterations D (guided, light) and E (studio, 1-2-3 steps, charcoal) use the palette; chords grouped by feel: Home (teal) / Away (sky) / Tension (rose)
- UI directions under review (design canvas): A Rack (device chain), B Arrange (timeline first, light theme), C Orbit (chord orbit + Euclidean rings): https://claude.ai/artifact/9cC2UwKs2EsJiGbzFEdsNe

## Built (session 3)
- **App in the H layout** (`app/`): Orbit on cream + keyboard strip with hints, Record/Stop with timing kept, tempo detection (tested: 118 BPM from real key timing), ×2/÷2, MIDI Clock + Start/Stop so Ableton follows, loop playback, live Euclidean mode (chords only) with Steps/Hits/Rotate/Step length/Note length + grooves + tap-to-edit dots, Ideas (famous + generate), Save MIDI.
- Architecture: `app/controller.ts` = all behaviour (no UI); `app/view.ts` = the H layout. A new look = a new view file.
- Shared page: https://claude.ai/artifact/M5U3XcqW5RDWPNyzKYyuHe · Mac: http://localhost:5173 (explorer at /explorer)
- 349 tests.
- **Look: backlit CRT monitor, two colours (Diego likes it).** Not a literal heart monitor: the aesthetic + a clear layout. I = first take (keep). J = clear layout: header settings (Key/Scale/Chords/Sync with ◂ ▸), 01 Play (keyboard is where you pick chords, numbered hints + Try next), tempo box, 02 Rhythm (optional; the pulse trace draws the real pattern), 03 Loop. "Harmonic" is a placeholder name.

## Built (session 4)
- **Monitor look (I) is now a working app view** (`app/monitor/`), the default at http://localhost:5173 (Orbit look at /orbit, explorer at /explorer). Shared page: https://claude.ai/artifact/T7CsaJw5YRnk2XxmoKKciL
  - Big "C · MAJOR" = key/scale (◂ ▸); sub line = chord size · voice leading · spread · inversion (click to cycle)
  - LOOP trace = your take (steps with each chord, sweep = playhead); EUCLIDEAN trace = real pattern (spike per hit, tap the ticks to edit), steppers + groove + step length + note length
  - Tempo box (type BPM, ÷2 ×2), NOW / NEXT / ODDS; SCOPE = playable chord circle with hints; IDEAS + MIDI panels; phosphor colour switch
  - "Rhythm" renamed **Euclidean** everywhere.
  - Layout v3 (Diego): left side = just the two visualizers, each with its own control on top (REC/PLAY on the LOOP trace, ON/OFF switch on the EUCLIDEAN trace; Ideas/Save MIDI as small text links). All settings live in the right-hand readout box as compartments: KEY | SCALE, TEMPO, CHORDS | VOICING | SPREAD | INVERT, NOW | NEXT | ODDS; then the SCOPE.

- Layout v4 (Diego): no rings or pills. One control language: terminal text, dashed underline = pressable, hover/focus/on = inverse video. LOOP gets **LENGTH** (AUTO · 1 · 2 · 4 · 8 · 16 bars; longer repeats the take, shorter cuts it) and **QUANTIZE** (1/16 default · 1/8 · 1/4 · OFF) under its trace. Euclidean = [OFF|ON]. Readout: slim TEMPO line on top, big KEY | SCALE, options, NOW/NEXT/ODDS; roomier SCOPE ([ ] marks good next chords).
- Takes keep the raw recording; quantize + length are applied on top, so both can be changed any time without losing what you played. 357 tests.

- Layout v5 (Diego): removed NOW / NEXT / ODDS and the "from your playing" label; bigger KEY | SCALE; loop trace stretches to fill its height so both traces sit the same distance under their controls; roomier scope.
- **KEYS PLAY [CHORDS | NOTES]** (above the scope). NOTES works like Ableton's Scale device: every key (black and white) plays its real pitch, and keys outside the scale snap to the nearest scale note (ties go down), so some repeat. Chords go out on **MIDI Ch 1**, notes on **Ch 2**, so a chord track and a melody/bass track in Ableton can both stay armed (MIDI From: IAC, Ch. 1 / Ch. 2). The loop keeps playing chords while you play notes; [ ] on the scope marks notes that are in the chord playing. REC records chords only (notes are recorded in Ableton). Euclidean plays held notes too. `engine/notemode.ts`, 361 tests.

## Built (session 5) — V1
- Name: **Harmonique** (French spelling) on screen, in titles and in saved MIDI file names. Repo/folder names unchanged for now.
- **Max for Live device** (`dist/m4l/Harmonique.amxd`, generated by `scripts/m4l-device.mjs`): a MIDI Effect for a MIDI track, like Cthulhu. OPEN WINDOW shows the full screen in a floating window ([jweb] running `dist/m4l/harmonique-m4l.html`). Notes in from the track → chords/notes out of the device; sustain/CC/bend pass through. Tempo comes from Live (read-only), recordings keep Live's tempo, Live's play/stop starts/stops the loop. No MIDI Clock (Live is the clock).
- **Web / portfolio version** (`dist/web/index.html`): one self-contained file to host anywhere. Opens with a how-to, browser sound on, no Ableton sync.
- Controller takes any MIDI connection (`MidiIO`): Web MIDI or the Max host.
- Note: the same key can sound different because velocity comes from the keyboard (touch) and VOICING SMOOTH re-voices each chord to move as little as possible from the previous one.
- **Sync with Live fixed (Diego found takes drifting off Live's grid):** (1) with a fixed tempo, recordings were still stretched to whole bars, so a take at 118 wasn't really 118: now never stretched. (2) The device now reads Live's song position (`current_song_time`), so the loop and Euclidean steps land on Live's beats; a recording is measured from the bar line nearest your first chord and replays on that same bar. Simulated Live test: chords land within ~4–8 ms of the grid after ±30 ms sloppy playing. 362 tests.
- **Tempo in Live is two-way (Diego):** with Live stopped, REC → play at any speed → STOP detects your tempo (rounded to a whole BPM) and **sets Live's tempo** ([live.object] `set tempo`). With Live playing, you're playing along, so Live's tempo holds. Typing a BPM or ÷2 ×2 also sets Live's tempo; changing tempo in Live updates Harmonique. Logo 40% smaller (22 px) with matching 9 px text.
- **Capture-style loops (Diego: loops cut off oddly, like when STOP was pressed):** the loop no longer depends on when you press STOP. Like Ableton's Capture MIDI: your first chord is bar 1 beat 1; the tempo is read from the chord changes only (`captureTempo`: every tempo 70–170 tried, changes snapped to the 16th grid, scored by grid distance + how musical the positions are + a pull toward ~110); the loop is a whole number of bars set by your last chord (its start, and roughly where you let go). Simulation over 480 random takes (72–162 BPM, ±35 ms timing, 8 patterns): 80–95% exact tempo per pattern, most of the rest a ×2/÷2 reading. Late STOP (0 / 0.7 / 1.6 s) → same 100 BPM, 4 bars. 366 tests.

- **Quantize now OFF by default (Diego):** takes play back exactly as played, errors included, like Ableton's Capture; fix details in Live. 1/16, 1/8, 1/4 still one click away.

- **Voice leading follows your hand (Diego: chords stayed high after moving down the keyboard, and pitch drifted when looping):** SMOOTH now only chooses among voicings within half an octave of where the key you pressed puts the chord, and jumping more than ~an octave starts fresh. A looping progression settles on the same voicings every time around. **VOICING now defaults to FIXED** (a key always plays the same notes); SMOOTH is opt-in. 368 tests.

- **Timing pass (from the portfolio-side review note):** (1) browser synth now maps scheduled times through a smoothed clock offset instead of re-reading `ac.currentTime` per event, so a busy main thread no longer bunches notes (test: 350 ms stall mid-loop, chord spacing stays 2.034 s); compressor (≈6 ms look-ahead) replaced with a soft clip; note tails 0.5 s. (2) UI: animation loop stops when nothing moves; SVG/scope markup only re-written when it changes. (3) **Loops close without dead air:** the loop ends where the phrase would come round (one "last step" after the last chord), and the last chord rings until the loop restarts. Simulation: right length whenever the tempo is right, no dead air, 9 patterns. Synth changes are web-only; loop closing + UI savings apply to the plugin too. 370 tests.

- **Capture fits the loop to the phrase (Diego, screen recording: free-played chords looped as 2 bars at 88 with ~2 s of the last chord ringing before it came round):** tempo used to be read from the chord changes alone, then rounded up to whole bars, so a phrase played freely (not to a click) could end mid-bar and get padded. Now tempo and loop length are fitted together, like Ableton's Capture: the loop must close on a bar line somewhere between where you let go of the last chord and one "last step" after it (or just after you let go, if you held it long), and the tempo is the one that makes that true while keeping the changes on the grid. Still never depends on when STOP is pressed. Simulation over 500 random free-time takes: loops waiting >0.4 s too long went 285 → 18; well-timed takes unchanged. 373 tests.

- Latency: smallest audio buffer (`latencyHint: 0`), 3 ms attack, audio wakes on the first click/key, SOUND label shows the output delay in ms. Diego confirmed the lag was his AirPods (fine on speakers); the how-to panel now says wireless headphones add delay.

## Next
1. **Diego listens:** presets, Generate (Pop vs Bach, Tension, Color), hints, Smooth on/off. What sounds great, what doesn't.
2. **Phase 8–9: Euclidean rhythm + harmonic sequencer.** Rhythm patterns applied to the progression (chords, bass, arps). Sync tempo to Ableton later.
3. **UI session:** Diego-led redesign ("basic but attractive, Ableton-like, a little sexy"). Progression-building flow is the centrepiece.
4. Later: swap a key's color chord, real-pitch layout option, AI prompt → parameters.

## Repo
`engine/` (notes, scales, chords, chordmap, voicing) · `explorer/` (app.ts, midi.ts, template.html) · `tests/` · `scripts/` · `docs/`
Commands: `npm test` · `npm run build` · `npm start`
Source is mirrored in this project under `src/`.
