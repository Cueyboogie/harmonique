# Harmonique

A chord instrument for musicians: pick a key and scale, and every key on your keyboard — black keys included — plays a chord that fits. Record a progression, loop it in time, sequence it with Euclidean rhythms, and play melodies over it. Runs in the browser, inside Ableton Live as a Max for Live device, and in any DAW as an Audio Unit / VST3 plugin.

Designed & built by Diego Cuevas · Oscillate Audioworks · [theavidobserver.com](https://theavidobserver.com)

## What it does
- **Chord map:** white keys are the 7 chords of the key; black keys are 5 "color" chords (borrowed chords, secondary dominants), each picked by rule. 10 scales, 12 keys, triads to 13ths, inversions, spread, optional voice leading.
- **Next-chord hints:** the scope shows which chords tend to come next, learned from pop progressions or from 368 J.S. Bach chorales.
- **Capture-style recording:** press REC, play, press STOP. Tempo and loop length are read from your chords (not from when you pressed STOP); quantize is optional.
- **Euclidean mode:** hold a chord and it plays in a Euclidean rhythm (steps, hits, rotate, grooves).
- **Notes mode:** every key plays one in-scale note (like Ableton's Scale device) on MIDI channel 2, to play melodies over the loop.
- **Plugin (AU + VST3):** the same instrument in Logic, Ableton, Bitwig, Reaper, Cubase… It follows the project's tempo and transport, saves with the project, and keeps playing with its window closed. See [`plugin/README.md`](plugin/README.md).
- **Ableton:** as a Max for Live MIDI effect it follows Live's transport and grid, and the tempo you play becomes Live's tempo. In the browser it sends MIDI to Ableton over the IAC Driver, with MIDI Clock.

## Run it
- **In the browser:** open `dist/web/index.html` (or `Harmonic.html`) in Chrome. Play with A S D F G H J K and W E T Y U, or a MIDI keyboard.
- **On a Mac with Ableton (browser version):** double-click `Start Harmonic.command`, then route the IAC Driver into a track (steps are in the app's MIDI panel).
- **As a plugin (any DAW):** download `Harmonique-macOS.zip` from the latest *Plugin* workflow run (GitHub → Actions), or build it with `npm run plugin`. Install + routing: [`plugin/README.md`](plugin/README.md).
- **In Ableton (Max for Live, Live Suite):** drag `Harmonique.amxd` onto a MIDI track. Note: the device currently loads its screen from `dist/m4l/harmonique-m4l.html` at this repo's path on the author's Mac; set `HARMONIQUE_ROOT` and rebuild to point it elsewhere.

## Develop
```
npm install
npm test         # 378 tests
npm run build    # tests + spec + all builds into dist/
npm start        # http://localhost:5173
npm run plugin   # AU + VST3 (needs CMake; see plugin/README.md)
```

## Layout
- `engine/` music logic with no UI: notes, scales, chords, chord map, voicing, voice leading, progressions (incl. the Bach table), rhythm, takes/tempo capture, MIDI files
- `app/controller.ts` all app behaviour; `app/monitor/` the CRT-monitor interface; `app/m4l/` the Max for Live bridge; `app/plugin/` the AU/VST3 engine + window; `app/web/`, `app/portfolio/` entry points
- `plugin/` the AU / VST3 plugin (JUCE + QuickJS, C++)
- `explorer/` the engine review tool + Web MIDI bridge
- `scripts/` builds (incl. the `.amxd` generator), spec generator, local server, Bach extraction
- `docs/` music spec and build log · `portfolio/` the site integration
