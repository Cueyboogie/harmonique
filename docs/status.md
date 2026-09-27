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
- Next look being explored: backlit CRT / patient-monitor style, two colours (Diego's reference).

## Next
1. **Diego listens:** presets, Generate (Pop vs Bach, Tension, Color), hints, Smooth on/off. What sounds great, what doesn't.
2. **Phase 8–9: Euclidean rhythm + harmonic sequencer.** Rhythm patterns applied to the progression (chords, bass, arps). Sync tempo to Ableton later.
3. **UI session:** Diego-led redesign ("basic but attractive, Ableton-like, a little sexy"). Progression-building flow is the centrepiece.
4. Later: swap a key's color chord, real-pitch layout option, AI prompt → parameters.

## Repo
`engine/` (notes, scales, chords, chordmap, voicing) · `explorer/` (app.ts, midi.ts, template.html) · `tests/` · `scripts/` · `docs/`
Commands: `npm test` · `npm run build` · `npm start`
Source is mirrored in this project under `src/`.
