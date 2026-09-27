# Harmonic

A chord instrument: pick a key and scale, and every key on your MIDI keyboard plays a chord that fits.
Built phase by phase; see `docs/status.md` and `docs/music-spec.md`.

## Run it on your Mac (with your MIDI keyboard)
**Easiest:** double-click `Start Harmonic.command`. It opens Harmonic in Chrome at http://localhost:5173. Close the Terminal window to stop it.
(Or drag `Harmonic.html` into Chrome.)

**For development:**
```
npm install      # first time only
npm run build    # tests + spec + app
npm start        # → open http://localhost:5173 in Chrome
```
Then follow "First-time setup on Mac" inside the app to route chords into Ableton via the IAC Driver.

## Layout
- `engine/` music logic, no UI (notes, scales, chords, chord map, voicing)
- `explorer/` the review app (UI + Web Audio + Web MIDI bridge)
- `tests/` automated checks (`npm test`)
- `scripts/` spec generator, app bundler, local server
- `docs/` spec and status
