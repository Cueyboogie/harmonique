# Harmonic — Music Specification

> Source of truth for what the app means musically. **Tables are generated from the engine** (`npm run spec`); prose is hand-written. If a table here looks wrong, the engine is wrong — file it as a bug.

## 1. Vocabulary

| Term | Meaning in this app | Status |
|---|---|---|
| **Pitch class** | A note without octave. 12 of them: C=0, C♯/D♭=1 … B=11. | Built |
| **Scale** | A root plus 7 intervals (semitones above the root). Each letter A–G is used exactly once, which fixes spelling (E♭ not D♯). | Built |
| **Scale degree** | Position 1–7 in the scale. Degree 1 is the root ("tonic"). | Built |
| **Chord (diatonic)** | Built on a degree by stacking every other scale note: 1-3-5 (triad), +7, +9, +11, +13. Only scale notes are used. | Built |
| **Chord quality** | Derived, never chosen: major (4+3 semitones), minor (3+4), diminished (3+3), augmented (4+4). 7th adds maj7 / 7 / m7 / m(maj7) / m7♭5 / °7 / +maj7. | Built |
| **Extension** | The 9th, 11th, 13th stacked above a 7th chord. Altered ones (♭9, ♯11, ♭13) appear automatically when the scale contains them. | Built |
| **Roman numeral** | Degree label relative to the MAJOR scale on the same root. Upper-case = major, lower-case = minor, ° = diminished, + = augmented, ♭/♯ = differs from major. So Dorian shows ♭III, ♭VII. | Built |
| **Chord map** | What each of the 12 keys in an octave plays. White keys = 7 diatonic chords, black keys = 5 color chords. Repeats every octave. | Built |
| **Color chord** | A chord from outside the scale that is commonly used in it: a borrowed chord (from a scale with the same tonic) or a secondary dominant (V7 of one of the scale’s chords). | Built |
| **Inversion** | Which chord tone is lowest. Root position, 1st (3rd in bass), 2nd (5th in bass), 3rd (7th in bass). | Built |
| **Voicing** | The actual MIDI notes: octave, inversion, spread (close / open = drop 2 / wide = open + bass), and which notes are trimmed. | Built |
| **Voice leading** | Choosing the voicing of the next chord that moves the fewest total semitones from the current one. | Phase 6 |
| **Progression** | An ordered list of chord events (degree + size + voicing + duration). | Phase 7 |
| **Euclidean rhythm** | Distribute K hits as evenly as possible over N steps, then rotate by R. Knows nothing about chords. | Phase 8 |
| **Harmonic tension** | A 0–1 score per chord. Draft: diminished/augmented > dominant 7th > minor > major; more extensions and altered tensions raise it; distance from degree 1 raises it. To be finalised with you. | Phase 7 (draft) |

## 2. Core rule

> When the user selects **root + scale + degree + size**, the engine stacks every other scale note starting at that degree. The chord quality is a consequence of the scale, never an input.

Acceptance: **C Dorian, degree 4 → F – A – C (F major)**. Tested in `tests/engine.test.ts`.

## 3. Scales (all shown on C)

Ordered brightest → darkest for the major modes, then the minor variants. "Recipe" is the fastest way to learn each one: how it differs from plain major or minor.

### C Lydian

*Dreamy, floating, wide-eyed. Film scores and space.* — Major with a raised 4th (♯4).

Notes: **C D E F♯ G A B** · Intervals: `0 2 4 6 7 9 11`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | I | II | iii | ♯iv° | V | vi | vii |
| Triad | **C** | **D** | **Em** | **F♯°** | **G** | **Am** | **Bm** |
| Notes | C-E-G | D-F♯-A | E-G-B | F♯-A-C | G-B-D | A-C-E | B-D-F♯ |
| 7th | Cmaj7 | D7 | Em7 | F♯m7♭5 | Gmaj7 | Am7 | Bm7 |

### C Major (Ionian)

*Bright, resolved, happy.* — The reference scale.

Notes: **C D E F G A B** · Intervals: `0 2 4 5 7 9 11`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | I | ii | iii | IV | V | vi | vii° |
| Triad | **C** | **Dm** | **Em** | **F** | **G** | **Am** | **B°** |
| Notes | C-E-G | D-F-A | E-G-B | F-A-C | G-B-D | A-C-E | B-D-F |
| 7th | Cmaj7 | Dm7 | Em7 | Fmaj7 | G7 | Am7 | Bm7♭5 |

### C Mixolydian

*Bright but loose. Rock, funk, anthems.* — Major with a lowered 7th (♭7).

Notes: **C D E F G A B♭** · Intervals: `0 2 4 5 7 9 10`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | I | ii | iii° | IV | v | vi | ♭VII |
| Triad | **C** | **Dm** | **E°** | **F** | **Gm** | **Am** | **B♭** |
| Notes | C-E-G | D-F-A | E-G-B♭ | F-A-C | G-B♭-D | A-C-E | B♭-D-F |
| 7th | C7 | Dm7 | Em7♭5 | Fmaj7 | Gm7 | Am7 | B♭maj7 |

### C Dorian

*Minor but hopeful. Soul, house, neo-soul.* — Natural minor with a raised 6th (♮6).

Notes: **C D E♭ F G A B♭** · Intervals: `0 2 3 5 7 9 10`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | i | ii | ♭III | IV | v | vi° | ♭VII |
| Triad | **Cm** | **Dm** | **E♭** | **F** | **Gm** | **A°** | **B♭** |
| Notes | C-E♭-G | D-F-A | E♭-G-B♭ | F-A-C | G-B♭-D | A-C-E♭ | B♭-D-F |
| 7th | Cm7 | Dm7 | E♭maj7 | F7 | Gm7 | Am7♭5 | B♭maj7 |

### C Minor (Aeolian / natural minor)

*Sad, serious, emotional.* — The reference minor scale.

Notes: **C D E♭ F G A♭ B♭** · Intervals: `0 2 3 5 7 8 10`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | i | ii° | ♭III | iv | v | ♭VI | ♭VII |
| Triad | **Cm** | **D°** | **E♭** | **Fm** | **Gm** | **A♭** | **B♭** |
| Notes | C-E♭-G | D-F-A♭ | E♭-G-B♭ | F-A♭-C | G-B♭-D | A♭-C-E♭ | B♭-D-F |
| 7th | Cm7 | Dm7♭5 | E♭maj7 | Fm7 | Gm7 | A♭maj7 | B♭7 |

### C Phrygian

*Dark, tense, Spanish/metal edge.* — Natural minor with a lowered 2nd (♭2).

Notes: **C D♭ E♭ F G A♭ B♭** · Intervals: `0 1 3 5 7 8 10`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | i | ♭II | ♭III | iv | v° | ♭VI | ♭vii |
| Triad | **Cm** | **D♭** | **E♭** | **Fm** | **G°** | **A♭** | **B♭m** |
| Notes | C-E♭-G | D♭-F-A♭ | E♭-G-B♭ | F-A♭-C | G-B♭-D♭ | A♭-C-E♭ | B♭-D♭-F |
| 7th | Cm7 | D♭maj7 | E♭7 | Fm7 | Gm7♭5 | A♭maj7 | B♭m7 |

### C Locrian

*Unstable, uneasy — the tonic chord itself is diminished.* — Natural minor with ♭2 and ♭5.

Notes: **C D♭ E♭ F G♭ A♭ B♭** · Intervals: `0 1 3 5 6 8 10`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | i° | ♭II | ♭iii | iv | ♭V | ♭VI | ♭vii |
| Triad | **C°** | **D♭** | **E♭m** | **Fm** | **G♭** | **A♭** | **B♭m** |
| Notes | C-E♭-G♭ | D♭-F-A♭ | E♭-G♭-B♭ | F-A♭-C | G♭-B♭-D♭ | A♭-C-E♭ | B♭-D♭-F |
| 7th | Cm7♭5 | D♭maj7 | E♭m7 | Fm7 | G♭maj7 | A♭7 | B♭m7 |

### C Harmonic Minor

*Dramatic, classical, exotic pull back home.* — Natural minor with a raised 7th (♮7).

Notes: **C D E♭ F G A♭ B** · Intervals: `0 2 3 5 7 8 11`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | i | ii° | ♭III+ | iv | V | ♭VI | vii° |
| Triad | **Cm** | **D°** | **E♭+** | **Fm** | **G** | **A♭** | **B°** |
| Notes | C-E♭-G | D-F-A♭ | E♭-G-B | F-A♭-C | G-B-D | A♭-C-E♭ | B-D-F |
| 7th | Cm(maj7) | Dm7♭5 | E♭+maj7 | Fm7 | G7 | A♭maj7 | B°7 |

### C Melodic Minor (jazz minor)

*Sophisticated, jazzy, bittersweet.* — Major with a lowered 3rd (♭3).

Notes: **C D E♭ F G A B** · Intervals: `0 2 3 5 7 9 11`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | i | ii | ♭III+ | IV | V | vi° | vii° |
| Triad | **Cm** | **Dm** | **E♭+** | **F** | **G** | **A°** | **B°** |
| Notes | C-E♭-G | D-F-A | E♭-G-B | F-A-C | G-B-D | A-C-E♭ | B-D-F |
| 7th | Cm(maj7) | Dm7 | E♭+maj7 | F7 | G7 | Am7♭5 | Bm7♭5 |

### C Phrygian Dominant (Spanish / Hijaz)

*Cinematic, Middle-Eastern / flamenco heat.* — Phrygian with a major 3rd. Mode 5 of harmonic minor.

Notes: **C D♭ E F G A♭ B♭** · Intervals: `0 1 4 5 7 8 10`

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Numeral | I | ♭II | iii° | iv | v° | ♭VI+ | ♭vii |
| Triad | **C** | **D♭** | **E°** | **Fm** | **G°** | **A♭+** | **B♭m** |
| Notes | C-E-G | D♭-F-A♭ | E-G-B♭ | F-A♭-C | G-B♭-D♭ | A♭-C-E | B♭-D♭-F |
| 7th | C7 | D♭maj7 | E°7 | Fm(maj7) | Gm7♭5 | A♭+maj7 | B♭m7 |

## 4. Rules for other roots

- Any of the 12 roots works; every scale is transposed by adding the root to its intervals.
- For the 5 black-key roots the engine picks the spelling (e.g. D♭ vs C♯) that gives the fewest sharps/flats. Ties go to the flat name, except F♯. Verified: no scale on any root needs a double sharp or flat.
- All 12 roots × 10 scales × 5 chord sizes are checked automatically for: 7 distinct letters, correct pitch classes, every chord tone in the scale.

## 5. Key map: a chord on every key

Designed for a 49-key controller (Arturia KeyLab 49). The map repeats every octave; the octave you play in sets the register.

- **White keys C D E F G A B** play degrees 1–7 of the chosen scale, in any key. A player never needs to know which notes are in the scale.
- **Black keys C♯ D♯ F♯ G♯ A♯** play 5 color chords, placed low → high by root.
- Color chords are picked by walking a priority list (most-used moves first) and skipping anything already in the scale. Scales with a major 3rd use the *major list*, scales with a minor 3rd the *minor list*. If the list runs out, borrowed chords are scored by: shared notes between source scale and current scale + quality (major/minor 2, dim 0, aug −2) + 2 × triad notes already in the scale.
- The choice is made on triads, so switching chord size never changes which chord a key plays.
- Every chord says why it is there (e.g. *Minor iv · Borrowed from C Minor*, *V of V · Secondary dominant → G*).

**Major list:** minor iv, ♭VII, ♭VI, V of V, V of vi, ♭III, V of ii, ♭II (Neapolitan), major V, V of IV.

**Minor list:** major V, major IV, ♭II (Neapolitan), major I (Picardy), V of iv, ♭VII, ♭VI, V of V, minor iv, minor v, ♭III.

| Scale (on C) | C♯ key | D♯ key | F♯ key | G♯ key | A♯ key |
|---|---|---|---|---|---|
| Lydian | **E♭maj7** <br>♭III | **E7** <br>V of vi | **Fm7** <br>Minor iv | **A♭maj7** <br>♭VI | **B♭7** <br>♭VII |
| Major | **D7** <br>V of V | **E7** <br>V of vi | **Fm7** <br>Minor iv | **A♭maj7** <br>♭VI | **B♭7** <br>♭VII |
| Mixolydian | **D7** <br>V of V | **E♭maj7** <br>♭III | **E7** <br>V of vi | **Fm7** <br>Minor iv | **A♭maj7** <br>♭VI |
| Dorian | **Cmaj7** <br>Major I (Picardy) | **D♭maj7** <br>♭II (Neapolitan) | **D7** <br>V of V | **G7** <br>Major V | **A♭maj7** <br>♭VI |
| Minor | **Cmaj7** <br>Major I (Picardy) | **D♭maj7** <br>♭II (Neapolitan) | **D7** <br>V of V | **F7** <br>Major IV | **G7** <br>Major V |
| Phrygian | **Cmaj7** <br>Major I (Picardy) | **F7** <br>Major IV | **G7** <br>Major V | **Gm7** <br>Minor v | **B♭7** <br>♭VII |
| Locrian | **Cmaj7** <br>Major I (Picardy) | **F7** <br>Major IV | **G7** <br>Major V | **Gm7** <br>Minor v | **B♭7** <br>♭VII |
| Harmonic Minor | **Cmaj7** <br>Major I (Picardy) | **D♭maj7** <br>♭II (Neapolitan) | **D7** <br>V of V | **F7** <br>Major IV | **B♭7** <br>♭VII |
| Melodic Minor | **Cmaj7** <br>Major I (Picardy) | **D♭maj7** <br>♭II (Neapolitan) | **D7** <br>V of V | **A♭maj7** <br>♭VI | **B♭7** <br>♭VII |
| Phrygian Dominant | **Cm7** <br>Borrowed i | **E♭maj7** <br>♭III | **G7** <br>Major V | **A♭maj7** <br>♭VI | **B♭7** <br>♭VII |

## 6. Voicing rules

- The chord root lands in the octave of the key you press (the tonic sits within 6 semitones of that octave’s C key).
- **Inversion** raises the lowest note an octave, 1–3 times. Triads stop at 2nd inversion.
- **Spread:** close = tightest stack · open = drop 2 (2nd-highest note down an octave; triads raise the middle note) · wide = open + the bass note doubled an octave below.
- **Trim** (on by default): 11th and 13th chords drop the 5th. An 11th chord with a major 3rd drops a natural 11 (half-step clash). 13th chords drop the 11th unless it is ♯11.

| Example | MIDI notes (60 = middle C) |
|---|---|
| C triad, close | 60 64 67 |
| C triad, 1st inversion | 64 67 72 |
| Cmaj7, open (drop 2) | 55 60 64 71 |
| Cmaj7, wide | 43 55 60 64 71 |
| G13, close (trimmed) | 55 59 65 69 76 |

## 7. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | v1 scales: the 10 above. Pentatonic/blues later (5–6 notes need their own chord rule). | Decided (Diego) |
| 2 | Every key plays a chord, black keys included: white = scale, black = color chords. | Decided (Diego) |
| 3 | Default chord size: 7th. Size is switchable. | Decided (Diego) |
| 4 | Numerals relative to the major scale (♭III, ♭VII). | Default, not yet reviewed |
| 5 | Harmonic tension scoring (draft in §1). | Open, Phase 7 |
| 6 | Progression engine may learn chord-to-chord probabilities from Bach chorales (public domain). | Idea, Phase 7 |
| 7 | Real-pitch layout (the key you press is the chord root) as an option. | Idea, later |
| 8 | Swap a key’s color chord from a ranked list of alternatives. | Idea, UI phase |
