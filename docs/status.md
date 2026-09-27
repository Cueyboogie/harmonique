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

## Next
1. **Diego listens:** presets, Generate (Pop vs Bach, Tension, Color), hints, Smooth on/off. What sounds great, what doesn't.
2. **Phase 8–9: Euclidean rhythm + harmonic sequencer.** Rhythm patterns applied to the progression (chords, bass, arps). Sync tempo to Ableton later.
3. **UI session:** Diego-led redesign ("basic but attractive, Ableton-like, a little sexy"). Progression-building flow is the centrepiece.
4. Later: swap a key's color chord, real-pitch layout option, AI prompt → parameters.

## Repo
`engine/` (notes, scales, chords, chordmap, voicing) · `explorer/` (app.ts, midi.ts, template.html) · `tests/` · `scripts/` · `docs/`
Commands: `npm test` · `npm run build` · `npm start`
Source is mirrored in this project under `src/`.
