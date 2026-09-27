/**
 * Chord map: a chord on EVERY key of the keyboard.
 *
 * Layout (repeats every octave):
 *   White keys C D E F G A B → the 7 diatonic chords of the chosen scale (degrees 1–7).
 *   Black keys C♯ D♯ F♯ G♯ A♯ → 5 "color" chords: chords from OUTSIDE the scale
 *   that musicians commonly use in that key.
 *
 * Color chords come from two proven sources:
 *   - Borrowed chords: diatonic chords of a parallel scale (same tonic).
 *     e.g. in C major, Fm is borrowed from C minor ("minor iv").
 *   - Secondary dominants: the V7 of one of the scale's own chords.
 *     e.g. in C major, D7 is "V of V" and pulls toward G.
 *
 * Selection is deterministic: walk a priority list (most-used first), skip
 * anything already in the scale or already picked, take the first 5.
 * If the list runs dry, fall back to borrowed chords scored by closeness.
 * Chosen chords are placed on the black keys low → high by root.
 */
import { LETTER_PC, mod, noteLabel, pitchClass, type SpelledNote } from './notes';
import { SCALES, buildScale, getScaleDef, type Scale, type ScaleDef, type ScaleId } from './scales';
import { diatonicChord, type Chord, type ChordSize, type TriadQuality } from './chords';

export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const BLACK_PCS = [1, 3, 6, 8, 10];

export interface ChordSlot {
  /** Pitch class of the physical key in the octave, 0 = C key … 11 = B key. */
  keyPc: number;
  kind: 'diatonic' | 'color';
  chord: Chord;
  /** Short name for the move, e.g. "Degree 4", "Minor iv", "V of V". */
  role: string;
  /** Where it comes from, e.g. "C Dorian", "Borrowed from C Minor", "Secondary dominant → G". */
  reason: string;
  /** Semitones from the tonic to the chord root, 0..11. */
  rootOffset: number;
  /**
   * Harmonic function, as a scale degree 1..7:
   * diatonic → its own degree; borrowed → the degree it stands in for (Minor iv → 4);
   * secondary dominant → the degree it pulls toward (V of V → 5, see `resolvesTo`).
   */
  degree: number;
  /** Secondary dominants only: the degree this chord wants to resolve to next. */
  resolvesTo?: number;
}

/* ---------- spelling helpers ---------- */

const accidentals = (notes: SpelledNote[]) => notes.reduce((n, x) => n + Math.abs(x.accidental), 0);

/** Same pitch, different letters: e.g. D♭ ↔ C♯. */
function enharmonics(n: SpelledNote): SpelledNote[] {
  const pc = pitchClass(n);
  const out = [n];
  for (const d of [-1, 1]) {
    const letter = mod(n.letter + d, 7);
    let acc = mod(pc - LETTER_PC[letter], 12);
    if (acc > 6) acc -= 12;
    if (Math.abs(acc) <= 2) out.push({ letter, accidental: acc });
  }
  return out;
}

/** Build a scale on `root`, re-spelling the root if that avoids double sharps/flats. */
function cleanScale(root: SpelledNote, id: ScaleId): Scale {
  return enharmonics(root)
    .map((r) => buildScale(r, id))
    .reduce((best, s) => {
      const dbl = (x: Scale) => x.notes.some((n) => Math.abs(n.accidental) > 1);
      if (dbl(best) !== dbl(s)) return dbl(s) ? best : s;
      return accidentals(s.notes) < accidentals(best.notes) ? s : best;
    });
}

const triadKey = (c: Chord) => c.pitchClasses.slice(0, 3).join(',');

/* ---------- recipes ---------- */

type Recipe =
  | { kind: 'borrow'; from: ScaleId; degree: number; role: string }
  | { kind: 'secdom'; target: number; role: string };

const b = (from: ScaleId, degree: number, role: string): Recipe => ({ kind: 'borrow', from, degree, role });
const sd = (target: number, role: string): Recipe => ({ kind: 'secdom', target, role });

/** For scales with a major 3rd. Most-used first. */
const MAJOR_RECIPES: Recipe[] = [
  b('aeolian', 4, 'Minor iv'),
  b('aeolian', 7, '♭VII'),
  b('aeolian', 6, '♭VI'),
  sd(5, 'V of V'),
  sd(6, 'V of vi'),
  b('aeolian', 3, '♭III'),
  sd(2, 'V of ii'),
  b('phrygian', 2, '♭II (Neapolitan)'),
  b('ionian', 5, 'Major V'),
  sd(4, 'V of IV'),
];

/** For scales with a minor 3rd. Most-used first. */
const MINOR_RECIPES: Recipe[] = [
  b('harmonicMinor', 5, 'Major V'),
  b('dorian', 4, 'Major IV'),
  b('phrygian', 2, '♭II (Neapolitan)'),
  b('ionian', 1, 'Major I (Picardy)'),
  sd(4, 'V of iv'),
  b('aeolian', 7, '♭VII'),
  b('aeolian', 6, '♭VI'),
  sd(5, 'V of V'),
  b('aeolian', 4, 'Minor iv'),
  b('aeolian', 5, 'Minor v'),
  b('aeolian', 3, '♭III'),
];

interface Pick { chord: Chord; role: string; reason: string; degree: number; resolvesTo?: number }

function applyRecipe(r: Recipe, scale: Scale, size: ChordSize): Pick | null {
  const tonic = noteLabel(scale.root);
  if (r.kind === 'borrow') {
    const parallel = cleanScale(scale.root, r.from);
    const chord = diatonicChord(parallel, r.degree, size);
    return { chord, role: r.role, reason: `Borrowed from ${tonic} ${getScaleDef(r.from).name}`, degree: r.degree };
  }
  const target = diatonicChord(scale, r.target, 'triad');
  if (target.triad === 'diminished' || target.triad === 'augmented') return null; // no stable target
  // V7 of X = degree 5 of X major (or X harmonic minor when X is minor): correct spelling + extensions for free.
  const home = cleanScale(target.notes[0], target.triad === 'major' ? 'ionian' : 'harmonicMinor');
  const chord = diatonicChord(home, 5, size);
  return { chord, role: r.role, reason: `Secondary dominant → ${target.symbol}`, degree: r.target, resolvesTo: r.target };
}

const QUALITY_WEIGHT: Record<TriadQuality, number> = { major: 2, minor: 2, diminished: 0, augmented: -2 };

/** Fallback pool: every borrowed chord, scored by source closeness + quality + shared notes. */
function fallbackPicks(scale: Scale, size: ChordSize): Pick[] {
  const out: (Pick & { score: number })[] = [];
  for (const def of SCALES) {
    if (def.id === scale.def.id) continue;
    const closeness = def.intervals.filter((i) => scale.def.intervals.includes(i)).length;
    const parallel = cleanScale(scale.root, def.id);
    for (let d = 1; d <= 7; d++) {
      const triad = diatonicChord(parallel, d, 'triad');
      const common = triad.pitchClasses.filter((p) => scale.pitchClasses.includes(p)).length;
      out.push({
        chord: diatonicChord(parallel, d, size),
        role: `Borrowed ${triad.roman}`,
        reason: `Borrowed from ${noteLabel(scale.root)} ${def.name}`,
        score: closeness + QUALITY_WEIGHT[triad.triad] + 2 * common,
        degree: d,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The 5 color chords for a scale, in priority order (before placement). */
export function colorChords(scale: Scale, size: ChordSize = '7th'): Pick[] {
  const taken = new Set(
    [1, 2, 3, 4, 5, 6, 7].map((d) => triadKey(diatonicChord(scale, d, 'triad'))),
  );
  const recipes = scale.def.intervals[2] === 4 ? MAJOR_RECIPES : MINOR_RECIPES;
  const picks: Pick[] = [];
  const consider = (p: Pick | null) => {
    if (!p || picks.length >= 5) return;
    const k = triadKey(p.chord);
    if (taken.has(k)) return;
    if (p.chord.notes.some((n) => Math.abs(n.accidental) > 1)) return;
    taken.add(k);
    picks.push(p);
  };
  // Decide on triads so the choice never changes when switching triad ↔ 7th ↔ 13th.
  for (const r of recipes) {
    const t = applyRecipe(r, scale, 'triad');
    if (t && !taken.has(triadKey(t.chord))) consider(applyRecipe(r, scale, size));
  }
  if (picks.length < 5) for (const p of fallbackPicks(scale, size)) consider(p);
  return picks;
}

/** 12 slots, indexed by the key's pitch class (C key = 0 … B key = 11). */
export function buildChordMap(scale: Scale, size: ChordSize = '7th'): ChordSlot[] {
  const tonicPc = scale.pitchClasses[0];
  const rootOffset = (c: Chord) => mod(c.pitchClasses[0] - tonicPc, 12);
  const slots: ChordSlot[] = new Array(12);
  WHITE_PCS.forEach((pc, i) => {
    const chord = diatonicChord(scale, i + 1, size);
    slots[pc] = {
      keyPc: pc, kind: 'diatonic', chord, role: `Degree ${i + 1}`,
      reason: `${noteLabel(scale.root)} ${scale.def.name}`, rootOffset: rootOffset(chord), degree: i + 1,
    };
  });
  const colors = colorChords(scale, size).sort(
    (a, b) => rootOffset(a.chord) - rootOffset(b.chord) || a.chord.symbol.localeCompare(b.chord.symbol),
  );
  BLACK_PCS.forEach((pc, i) => {
    const p = colors[i];
    slots[pc] = {
      keyPc: pc, kind: 'color', chord: p.chord, role: p.role, reason: p.reason,
      rootOffset: rootOffset(p.chord), degree: p.degree, resolvesTo: p.resolvesTo,
    };
  });
  return slots;
}

/**
 * Which chord a physical key plays, and where its root lands.
 * The tonic sits near the C key of each octave (−5..+6 semitones) so roots rise with the keys.
 */
export function chordForKey(midi: number, scale: Scale, map: ChordSlot[]): { slot: ChordSlot; rootMidi: number } {
  const pc = mod(midi, 12);
  const tonicPc = scale.pitchClasses[0];
  const centered = tonicPc > 6 ? tonicPc - 12 : tonicPc;
  const slot = map[pc];
  return { slot, rootMidi: midi - pc + centered + slot.rootOffset };
}

export type { ScaleDef };
