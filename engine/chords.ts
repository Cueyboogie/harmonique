/**
 * Diatonic chord engine.
 *
 * Rule: a diatonic chord on degree N is built by stacking every other scale
 * note ("stacking thirds"): N, N+2, N+4 (triad), +6 (7th), +8 (9th), +10 (11th), +12 (13th).
 * The chord's quality (major, minor, ...) is never chosen — it falls out of
 * the scale. That's what "harmonic" means in this app.
 */
import { mod, noteLabel, noteName, pitchClass, type SpelledNote } from './notes';
import { MAJOR_INTERVALS, type Scale } from './scales';

export type ChordSize = 'triad' | '7th' | '9th' | '11th' | '13th';
export const CHORD_SIZES: readonly ChordSize[] = ['triad', '7th', '9th', '11th', '13th'];
const SIZE_NOTES: Record<ChordSize, number> = { triad: 3, '7th': 4, '9th': 5, '11th': 6, '13th': 7 };

export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented';
export type SeventhQuality =
  | 'maj7' | 'dom7' | 'min7' | 'minMaj7' | 'halfDim7' | 'dim7' | 'augMaj7' | 'aug7';

const TRIAD_BY_INTERVALS: Record<string, TriadQuality> = {
  '4,7': 'major', '3,7': 'minor', '3,6': 'diminished', '4,8': 'augmented',
};
const SEVENTH_BY: Record<string, SeventhQuality> = {
  'major,11': 'maj7', 'major,10': 'dom7', 'minor,10': 'min7', 'minor,11': 'minMaj7',
  'diminished,10': 'halfDim7', 'diminished,9': 'dim7', 'augmented,11': 'augMaj7', 'augmented,10': 'aug7',
};

const TRIAD_SYMBOL: Record<TriadQuality, string> = { major: '', minor: 'm', diminished: '°', augmented: '+' };
const SEVENTH_SYMBOL: Record<SeventhQuality, string> = {
  maj7: 'maj7', dom7: '7', min7: 'm7', minMaj7: 'm(maj7)', halfDim7: 'm7♭5', dim7: '°7', augMaj7: '+maj7', aug7: '+7',
};
const SEVENTH_ROMAN_SUFFIX: Record<SeventhQuality, string> = {
  maj7: 'maj7', dom7: '7', min7: '7', minMaj7: '(maj7)', halfDim7: 'ø7', dim7: '°7', augMaj7: '+maj7', aug7: '+7',
};
export const QUALITY_LABEL: Record<TriadQuality, string> = {
  major: 'Major', minor: 'Minor', diminished: 'Diminished', augmented: 'Augmented',
};

/** Tension names by semitones above the chord root (compound intervals). */
const TENSION_NAME: Record<number, string> = {
  13: '♭9', 14: '9', 15: '♯9', 16: '♭11', 17: '11', 18: '♯11', 20: '♭13', 21: '13', 22: '♯13',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export interface Chord {
  /** 1..7 */
  degree: number;
  size: ChordSize;
  /** Spelled chord tones, root first, in stacking order. */
  notes: SpelledNote[];
  pitchClasses: number[];
  /** Semitones above the chord root for each tone, stacked upward (0, 3, 7, 10, 14, ...). */
  intervals: number[];
  triad: TriadQuality;
  seventh?: SeventhQuality;
  /** Tension names for 9th/11th/13th, e.g. ["9", "11"] or ["♭9"]. */
  tensions: string[];
  /** Chord symbol, e.g. "Cm", "Fmaj7", "Dm7(9,11)". */
  symbol: string;
  /** Roman numeral relative to the MAJOR scale on the same root, e.g. "♭III", "iv", "vii°". */
  roman: string;
}

/**
 * Build the diatonic chord on `degree` (1..7) of `scale`.
 * Acceptance: diatonicChord(buildScale('C','dorian'), 4) → F A C (F major).
 */
export function diatonicChord(scale: Scale, degree: number, size: ChordSize = 'triad'): Chord {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new Error(`Degree must be 1..7, got ${degree}`);
  const count = SIZE_NOTES[size];
  const idx = Array.from({ length: count }, (_, k) => (degree - 1 + 2 * k) % 7);
  const notes = idx.map((i) => scale.notes[i]);
  const pcs = notes.map(pitchClass);

  // Stack intervals upward: each tone sits above the previous one.
  const intervals = [0];
  for (let k = 1; k < count; k++) {
    const step = mod(pcs[k] - pcs[k - 1], 12);
    intervals.push(intervals[k - 1] + step);
  }

  const triad = TRIAD_BY_INTERVALS[`${intervals[1]},${intervals[2]}`];
  if (!triad) throw new Error(`Unclassifiable triad intervals ${intervals.slice(0, 3)}`);
  const seventh = count >= 4 ? SEVENTH_BY[`${triad},${intervals[3]}`] : undefined;
  if (count >= 4 && !seventh) throw new Error(`Unclassifiable seventh ${triad},${intervals[3]}`);
  const tensions = intervals.slice(4).map((s) => TENSION_NAME[s] ?? `?${s}`);

  const rootLabel = noteLabel(notes[0]);
  let symbol = rootLabel + (seventh ? SEVENTH_SYMBOL[seventh] : TRIAD_SYMBOL[triad]);
  if (tensions.length) symbol += `(${tensions.join(',')})`;

  // Roman numeral: compare this degree to the same degree of the major scale.
  const offset = mod(scale.def.intervals[degree - 1] - MAJOR_INTERVALS[degree - 1] + 6, 12) - 6;
  const acc = offset < 0 ? '♭'.repeat(-offset) : '♯'.repeat(offset);
  const upper = triad === 'major' || triad === 'augmented';
  let numeral = upper ? ROMAN[degree - 1] : ROMAN[degree - 1].toLowerCase();
  if (seventh) numeral += SEVENTH_ROMAN_SUFFIX[seventh];
  else if (triad === 'diminished') numeral += '°';
  else if (triad === 'augmented') numeral += '+';
  const roman = acc + numeral;

  return { degree, size, notes, pitchClasses: pcs, intervals, triad, seventh, tensions, symbol, roman };
}

export function diatonicChords(scale: Scale, size: ChordSize = 'triad'): Chord[] {
  return [1, 2, 3, 4, 5, 6, 7].map((d) => diatonicChord(scale, d, size));
}

export function chordNoteNames(c: Chord): string[] {
  return c.notes.map(noteName);
}

/**
 * PREVIEW ONLY (real voicing engine arrives in Phase 2):
 * root-position close stack starting at the chord root in the given octave.
 */
export function previewMidi(c: Chord, octave = 3): number[] {
  const base = (octave + 1) * 12 + c.pitchClasses[0];
  return c.intervals.map((i) => base + i);
}
