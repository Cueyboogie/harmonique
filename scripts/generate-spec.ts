/**
 * Generates docs/music-spec.md. All tables come from the engine, so the spec
 * can never drift from what the code actually does. Run: npm run spec
 */
import { writeFileSync } from 'node:fs';
import { SCALES, buildScale, diatonicChords, noteLabel, buildChordMap, BLACK_PCS, WHITE_PCS, voiceChord, diatonicChord, voiceLead, PRESETS, resolvePreset, scaleFromPitchClass, transitionTable, BACH_CHORALES } from '../engine';

const lines: string[] = [];
const w = (s = '') => lines.push(s);

w('# Harmonic — Music Specification');
w();
w('> Source of truth for what the app means musically. **Tables are generated from the engine** (`npm run spec`); prose is hand-written. If a table here looks wrong, the engine is wrong — file it as a bug.');
w();
w('## 1. Vocabulary');
w();
w('| Term | Meaning in this app | Status |');
w('|---|---|---|');
const vocab: [string, string, string][] = [
  ['Pitch class', 'A note without octave. 12 of them: C=0, C♯/D♭=1 … B=11.', 'Built'],
  ['Scale', 'A root plus 7 intervals (semitones above the root). Each letter A–G is used exactly once, which fixes spelling (E♭ not D♯).', 'Built'],
  ['Scale degree', 'Position 1–7 in the scale. Degree 1 is the root ("tonic").', 'Built'],
  ['Chord (diatonic)', 'Built on a degree by stacking every other scale note: 1-3-5 (triad), +7, +9, +11, +13. Only scale notes are used.', 'Built'],
  ['Chord quality', 'Derived, never chosen: major (4+3 semitones), minor (3+4), diminished (3+3), augmented (4+4). 7th adds maj7 / 7 / m7 / m(maj7) / m7♭5 / °7 / +maj7.', 'Built'],
  ['Extension', 'The 9th, 11th, 13th stacked above a 7th chord. Altered ones (♭9, ♯11, ♭13) appear automatically when the scale contains them.', 'Built'],
  ['Roman numeral', 'Degree label relative to the MAJOR scale on the same root. Upper-case = major, lower-case = minor, ° = diminished, + = augmented, ♭/♯ = differs from major. So Dorian shows ♭III, ♭VII.', 'Built'],
  ['Chord map', 'What each of the 12 keys in an octave plays. White keys = 7 diatonic chords, black keys = 5 color chords. Repeats every octave.', 'Built'],
  ['Color chord', 'A chord from outside the scale that is commonly used in it: a borrowed chord (from a scale with the same tonic) or a secondary dominant (V7 of one of the scale’s chords).', 'Built'],
  ['Inversion', 'Which chord tone is lowest. Root position, 1st (3rd in bass), 2nd (5th in bass), 3rd (7th in bass).', 'Built'],
  ['Voicing', 'The actual MIDI notes: octave, inversion, spread (close / open = drop 2 / wide = open + bass), and which notes are trimmed.', 'Built'],
  ['Voice leading', 'Choosing the voicing of the next chord that moves the fewest total semitones from the current one, while staying near the key you pressed.', 'Built'],
  ['Progression', 'An ordered list of keys (0 = C key … 11 = B key). Stored as keys, so changing root or scale re-harmonises it.', 'Built'],
  ['Euclidean rhythm', 'Distribute K hits as evenly as possible over N steps, then rotate by R. Knows nothing about chords.', 'Phase 8'],
  ['Harmonic tension', 'A 0–1 score per chord: by function (I 0, vi .2, iii .3, IV .35, ii .45, V .7, vii .85), +.2 diminished, +.25 augmented, +.15 color chord; secondary dominants .75.', 'Built'],
];
for (const [t, m, s] of vocab) w(`| **${t}** | ${m} | ${s} |`);
w();
w('## 2. Core rule');
w();
w('> When the user selects **root + scale + degree + size**, the engine stacks every other scale note starting at that degree. The chord quality is a consequence of the scale, never an input.');
w();
w('Acceptance: **C Dorian, degree 4 → F – A – C (F major)**. Tested in `tests/engine.test.ts`.');
w();
w('## 3. Scales (all shown on C)');
w();
w('Ordered brightest → darkest for the major modes, then the minor variants. "Recipe" is the fastest way to learn each one: how it differs from plain major or minor.');
w();
for (const def of SCALES) {
  const s = buildScale('C', def.id);
  const triads = diatonicChords(s, 'triad');
  const sevenths = diatonicChords(s, '7th');
  w(`### C ${def.name}${def.aka ? ` (${def.aka})` : ''}`);
  w();
  w(`*${def.mood}* — ${def.recipe}`);
  w();
  w(`Notes: **${s.notes.map(noteLabel).join(' ')}** · Intervals: \`${def.intervals.join(' ')}\``);
  w();
  w('| Degree | ' + triads.map((c) => c.degree).join(' | ') + ' |');
  w('|---|' + triads.map(() => '---').join('|') + '|');
  w('| Numeral | ' + triads.map((c) => c.roman).join(' | ') + ' |');
  w('| Triad | ' + triads.map((c) => `**${c.symbol}**`).join(' | ') + ' |');
  w('| Notes | ' + triads.map((c) => c.notes.map(noteLabel).join('-')).join(' | ') + ' |');
  w('| 7th | ' + sevenths.map((c) => c.symbol).join(' | ') + ' |');
  w();
}
w('## 4. Rules for other roots');
w();
w('- Any of the 12 roots works; every scale is transposed by adding the root to its intervals.');
w('- For the 5 black-key roots the engine picks the spelling (e.g. D♭ vs C♯) that gives the fewest sharps/flats. Ties go to the flat name, except F♯. Verified: no scale on any root needs a double sharp or flat.');
w('- All 12 roots × 10 scales × 5 chord sizes are checked automatically for: 7 distinct letters, correct pitch classes, every chord tone in the scale.');
w();
w('## 5. Key map: a chord on every key');
w();
w('Designed for a 49-key controller (Arturia KeyLab 49). The map repeats every octave; the octave you play in sets the register.');
w();
w('- **White keys C D E F G A B** play degrees 1–7 of the chosen scale, in any key. A player never needs to know which notes are in the scale.');
w('- **Black keys C♯ D♯ F♯ G♯ A♯** play 5 color chords, placed low → high by root.');
w('- Color chords are picked by walking a priority list (most-used moves first) and skipping anything already in the scale. Scales with a major 3rd use the *major list*, scales with a minor 3rd the *minor list*. If the list runs out, borrowed chords are scored by: shared notes between source scale and current scale + quality (major/minor 2, dim 0, aug −2) + 2 × triad notes already in the scale.');
w('- The choice is made on triads, so switching chord size never changes which chord a key plays.');
w('- Every chord says why it is there (e.g. *Minor iv · Borrowed from C Minor*, *V of V · Secondary dominant → G*).');
w();
w('**Major list:** minor iv, ♭VII, ♭VI, V of V, V of vi, ♭III, V of ii, ♭II (Neapolitan), major V, V of IV.');
w();
w('**Minor list:** major V, major IV, ♭II (Neapolitan), major I (Picardy), V of iv, ♭VII, ♭VI, V of V, minor iv, minor v, ♭III.');
w();
w('| Scale (on C) | ' + BLACK_PCS.map((pc) => ['C♯', 'D♯', '', 'F♯', '', 'G♯', '', 'A♯'][[1, 3, 0, 6, 0, 8, 0, 10].indexOf(pc)] + ' key').join(' | ') + ' |');
w('|---|' + BLACK_PCS.map(() => '---').join('|') + '|');
for (const def of SCALES) {
  const m = buildChordMap(buildScale('C', def.id), '7th');
  w(`| ${def.name} | ` + BLACK_PCS.map((pc) => `**${m[pc].chord.symbol}** <br>${m[pc].role}`).join(' | ') + ' |');
}
w();
w('## 6. Voicing rules');
w();
w('- The chord root lands in the octave of the key you press (the tonic sits within 6 semitones of that octave’s C key).');
w('- **Inversion** raises the lowest note an octave, 1–3 times. Triads stop at 2nd inversion.');
w('- **Spread:** close = tightest stack · open = drop 2 (2nd-highest note down an octave; triads raise the middle note) · wide = open + the bass note doubled an octave below.');
w('- **Trim** (on by default): 11th and 13th chords drop the 5th. An 11th chord with a major 3rd drops a natural 11 (half-step clash). 13th chords drop the 11th unless it is ♯11.');
w();
const C = buildScale('C', 'ionian');
const ex: [string, number[]][] = [
  ['C triad, close', voiceChord(diatonicChord(C, 1, 'triad'), 60)],
  ['C triad, 1st inversion', voiceChord(diatonicChord(C, 1, 'triad'), 60, { inversion: 1 })],
  ['Cmaj7, open (drop 2)', voiceChord(diatonicChord(C, 1, '7th'), 60, { spread: 'open' })],
  ['Cmaj7, wide', voiceChord(diatonicChord(C, 1, '7th'), 60, { spread: 'wide' })],
  ['G13, close (trimmed)', voiceChord(diatonicChord(C, 5, '13th'), 55)],
];
w('| Example | MIDI notes (60 = middle C) |');
w('|---|---|');
for (const [name, notes] of ex) w(`| ${name} | ${notes.join(' ')} |`);
w();
w('## 7. Voice leading and progressions');
w();
w('**Voice leading** (on by default, "Smooth"): for each new chord, try every inversion in three octaves and keep the one with the least movement from the last chord, plus half the distance from the home register (stops the chords creeping up or down).');
w();
{
  const C = buildScale('C', 'ionian');
  const roots = [60, 67, 69, 65];
  let prev: number[] | null = null;
  const rows = [1, 5, 6, 4].map((d, i) => {
    const c = diatonicChord(C, d, '7th');
    const plain = voiceChord(c, roots[i]);
    prev = voiceLead(c, roots[i], prev);
    return `| ${c.symbol} | ${plain.join(' ')} | ${prev.join(' ')} |`;
  });
  w('| C major, I–V–vi–IV | Without voice leading | Smooth |');
  w('|---|---|---|');
  rows.forEach((r) => w(r));
  w();
}
w(`**Chord-to-chord probabilities.** Two styles: *Bach*, learned from ${BACH_CHORALES.major + BACH_CHORALES.minor} J.S. Bach chorales (${BACH_CHORALES.major} major, ${BACH_CHORALES.minor} minor) via the music21 corpus, and *Pop*, learned from the famous-progression presets below (looped). Major-3rd scales use the major table, minor-3rd scales the minor table.`);
w();
{
  const P = transitionTable(buildScale('C', 'ionian'), 'bach');
  const R = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  w('Bach, major keys: probability of the next chord (rows = from).');
  w();
  w('| from \\ to | ' + R.join(' | ') + ' |');
  w('|---|' + R.map(() => '---').join('|') + '|');
  P.forEach((row, i) => w(`| **${R[i]}** | ` + row.map((x) => (x >= 0.3 ? `**${Math.round(x * 100)}%**` : `${Math.round(x * 100)}%`)).join(' | ') + ' |'));
  w();
}
w('**Generator** (deterministic, seeded): sample 240 random walks from the tonic, score each on likelihood (including the loop back to the start), closeness to the Tension target, variety, and fewer diminished chords when calm. Pick one of the top 12, weighted by score, so every press is good but different. Then a Color pass swaps some chords for black-key chords doing the same job (a borrowed stand-in for the same degree, or a secondary dominant into the next chord).');
w();
w('**Next-chord hints:** after each chord, the 3 likeliest next scale chords glow (1–3), plus one color chord that can stand in for one of them (✦). A secondary dominant always suggests its target first.');
w();
w('**Famous progressions** (written as degrees, so they work in any key; loading one switches to its scale):');
w();
w('| Name | Mood | Scale | In C |');
w('|---|---|---|---|');
for (const p of PRESETS) {
  const s = scaleFromPitchClass(0, p.scale);
  const m = buildChordMap(s, 'triad');
  w(`| ${p.name} | ${p.mood} | ${SCALES.find((x) => x.id === p.scale)!.name} | ${resolvePreset(p, m).map((k) => m[k].chord.symbol).join(' – ')} |`);
}
w();
w('## 8. Decisions');
w();
w('| # | Decision | Status |');
w('|---|---|---|');
const decisions: [string, string][] = [
  ['v1 scales: the 10 above. Pentatonic/blues later (5–6 notes need their own chord rule).', 'Decided (Diego)'],
  ['Every key plays a chord, black keys included: white = scale, black = color chords.', 'Decided (Diego)'],
  ['Default chord size: 7th. Size is switchable.', 'Decided (Diego)'],
  ['Numerals relative to the major scale (♭III, ♭VII).', 'Default, not yet reviewed'],
  ['Harmonic tension scoring (§1).', 'Built, tune by ear'],
  ['Progression engine learns chord-to-chord probabilities from Bach chorales (public domain).', 'Built'],
  ['Voice leading on by default.', 'Default, not yet reviewed'],
  ['Progressions play one chord per bar; rhythm comes from the Euclidean sequencer (Phase 8).', 'Next'],
  ['Real-pitch layout (the key you press is the chord root) as an option.', 'Idea, later'],
  ['Swap a key’s color chord from a ranked list of alternatives.', 'Idea, UI phase'],
];
decisions.forEach(([q, d], i) => w(`| ${i + 1} | ${q} | ${d} |`));
w();

writeFileSync(new URL('../docs/music-spec.md', import.meta.url), lines.join('\n'));
console.log(`Wrote docs/music-spec.md (${lines.length} lines)`);
