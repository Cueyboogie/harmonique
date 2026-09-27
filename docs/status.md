# Harmonic — Build Status

**Approach:** Option B. TypeScript engine + web prototype first (Web MIDI → IAC Driver → Ableton), JUCE plugin later.
**Roles:** Diego owns UX, spec decisions and listening tests. Claude writes engine code and tests.
**Hardware target:** Arturia 49-key controller (KeyLab 49 range), Ableton Live.

## Done
- **Phase 0:** music spec generated from the engine (`docs/music-spec.md`)
- **Phase 1:** scale + diatonic chord engine: 10 scales, 12 roots, triad → 13th, roman numerals, correct spelling
- **Key map:** a chord on every key. White = 7 scale chords, black = 5 color chords (borrowed chords and secondary dominants, rule-picked, each with a reason)
- **Phase 2:** voicing engine: octave follows the key, inversions, close/open(drop 2)/wide, trimming for 11ths/13ths
- **Phase 3 (code):** Web MIDI bridge: Arturia in → chords → IAC out, reference-counted notes (no stuck or cut notes), loop protection, sustain/mod/pitch-bend pass-through, panic
- 306 automated tests
- Review build: https://claude.ai/artifact/HLa4a4wpGA6HR4Xzt69rT9 (MIDI works only in the local version)

## Decisions (Diego)
- Ship the 10 scales in the Explorer
- Every key plays a chord, black keys included
- Default chord size: 7th (switchable)
- UI direction for later: basic but attractive, Ableton-like clarity with some sex appeal. Redesign in its own session.

## Next
1. **Phase 3 test on Diego's Mac:** needs a project folder connected to Cowork. Then `npm install && npm run build && npm start`, open http://localhost:5173 in Chrome, turn on the IAC Driver, route in Ableton.
2. **Phase 6: voice leading.** Pick the inversion that moves least from the previous chord ("Connected ↔ Independent" control).
3. **Phase 7: progressions.** Explore learning chord-to-chord probabilities from Bach chorales (public domain) for "what comes next" suggestions.
4. **UI session:** Diego-led redesign.

## Repo
`engine/` (notes, scales, chords, chordmap, voicing) · `explorer/` (app.ts, midi.ts, template.html) · `tests/` · `scripts/` · `docs/`
Commands: `npm test` · `npm run build` · `npm start`
Source is mirrored in this project under `src/`.
