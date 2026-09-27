/**
 * Scale engine.
 *
 * A scale is defined purely by its intervals: semitones above the root.
 * Every v1 scale has exactly 7 notes, so each letter name is used once
 * (C D E F G A B, shifted to start on the root). That rule is what gives
 * correct spellings like "C D Eb F G A Bb" instead of "C D D# F G A A#".
 */
import { LETTER_PC, mod, noteName, parseNote, pitchClass, type SpelledNote } from './notes';

export type ScaleId =
  | 'lydian'
  | 'ionian'
  | 'mixolydian'
  | 'dorian'
  | 'aeolian'
  | 'phrygian'
  | 'locrian'
  | 'harmonicMinor'
  | 'melodicMinor'
  | 'phrygianDominant';

export interface ScaleDef {
  id: ScaleId;
  name: string;
  aka?: string;
  family: 'Major modes' | 'Minor variants';
  /** Semitones above the root for each of the 7 degrees. */
  intervals: readonly number[];
  /** One-line plain-English character, for the UI and for learning. */
  mood: string;
  /** How it differs from plain major or minor — the fastest way to learn a mode. */
  recipe: string;
}

export const SCALES: readonly ScaleDef[] = [
  // Major modes, ordered brightest → darkest.
  { id: 'lydian', name: 'Lydian', family: 'Major modes', intervals: [0, 2, 4, 6, 7, 9, 11],
    mood: 'Dreamy, floating, wide-eyed. Film scores and space.', recipe: 'Major with a raised 4th (♯4).' },
  { id: 'ionian', name: 'Major', aka: 'Ionian', family: 'Major modes', intervals: [0, 2, 4, 5, 7, 9, 11],
    mood: 'Bright, resolved, happy.', recipe: 'The reference scale.' },
  { id: 'mixolydian', name: 'Mixolydian', family: 'Major modes', intervals: [0, 2, 4, 5, 7, 9, 10],
    mood: 'Bright but loose. Rock, funk, anthems.', recipe: 'Major with a lowered 7th (♭7).' },
  { id: 'dorian', name: 'Dorian', family: 'Major modes', intervals: [0, 2, 3, 5, 7, 9, 10],
    mood: 'Minor but hopeful. Soul, house, neo-soul.', recipe: 'Natural minor with a raised 6th (♮6).' },
  { id: 'aeolian', name: 'Minor', aka: 'Aeolian / natural minor', family: 'Major modes', intervals: [0, 2, 3, 5, 7, 8, 10],
    mood: 'Sad, serious, emotional.', recipe: 'The reference minor scale.' },
  { id: 'phrygian', name: 'Phrygian', family: 'Major modes', intervals: [0, 1, 3, 5, 7, 8, 10],
    mood: 'Dark, tense, Spanish/metal edge.', recipe: 'Natural minor with a lowered 2nd (♭2).' },
  { id: 'locrian', name: 'Locrian', family: 'Major modes', intervals: [0, 1, 3, 5, 6, 8, 10],
    mood: 'Unstable, uneasy — the tonic chord itself is diminished.', recipe: 'Natural minor with ♭2 and ♭5.' },
  // Minor variants.
  { id: 'harmonicMinor', name: 'Harmonic Minor', family: 'Minor variants', intervals: [0, 2, 3, 5, 7, 8, 11],
    mood: 'Dramatic, classical, exotic pull back home.', recipe: 'Natural minor with a raised 7th (♮7).' },
  { id: 'melodicMinor', name: 'Melodic Minor', aka: 'jazz minor', family: 'Minor variants', intervals: [0, 2, 3, 5, 7, 9, 11],
    mood: 'Sophisticated, jazzy, bittersweet.', recipe: 'Major with a lowered 3rd (♭3).' },
  { id: 'phrygianDominant', name: 'Phrygian Dominant', aka: 'Spanish / Hijaz', family: 'Minor variants', intervals: [0, 1, 4, 5, 7, 8, 10],
    mood: 'Cinematic, Middle-Eastern / flamenco heat.', recipe: 'Phrygian with a major 3rd. Mode 5 of harmonic minor.' },
];

export const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;

export function getScaleDef(id: ScaleId): ScaleDef {
  const def = SCALES.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown scale: ${id}`);
  return def;
}

/** Candidate spellings for each of the 12 roots. First entry is the default. */
export const ROOT_SPELLINGS: readonly (readonly string[])[] = [
  ['C'], ['Db', 'C#'], ['D'], ['Eb', 'D#'], ['E'], ['F'],
  ['F#', 'Gb'], ['G'], ['Ab', 'G#'], ['A'], ['Bb', 'A#'], ['B'],
];

export interface Scale {
  def: ScaleDef;
  root: SpelledNote;
  /** The 7 spelled notes, degree 1..7 at index 0..6. */
  notes: SpelledNote[];
  /** Pitch classes (0..11) of the 7 notes. */
  pitchClasses: number[];
}

/** Build a scale from an explicitly spelled root, e.g. buildScale('Eb', 'dorian'). */
export function buildScale(root: string | SpelledNote, id: ScaleId): Scale {
  const def = getScaleDef(id);
  const r = typeof root === 'string' ? parseNote(root) : root;
  const rootPc = pitchClass(r);
  const notes = def.intervals.map((semis, i) => {
    const letter = (r.letter + i) % 7;
    const targetPc = mod(rootPc + semis, 12);
    let accidental = mod(targetPc - LETTER_PC[letter], 12);
    if (accidental > 6) accidental -= 12;
    return { letter, accidental };
  });
  return { def, root: r, notes, pitchClasses: notes.map(pitchClass) };
}

const accidentalCount = (s: Scale) => s.notes.reduce((n, x) => n + Math.abs(x.accidental), 0);

/**
 * Build a scale from a pitch class (0..11), choosing the root spelling that
 * gives the fewest sharps/flats (ties → the default spelling).
 * e.g. pitch class 1 + Locrian → "C# Locrian" (not "Db Locrian", which needs double flats).
 */
export function scaleFromPitchClass(rootPc: number, id: ScaleId): Scale {
  const options = ROOT_SPELLINGS[mod(rootPc, 12)].map((name) => buildScale(name, id));
  return options.reduce((best, s) => (accidentalCount(s) < accidentalCount(best) ? s : best));
}

export function scaleNoteNames(s: Scale): string[] {
  return s.notes.map(noteName);
}

/**
 * Degree labels relative to the major scale, e.g. Dorian → ["1","2","♭3","4","5","6","♭7"].
 * Anything with a ♭/♯ is where this scale differs from major.
 */
export function degreeLabels(def: ScaleDef): string[] {
  return def.intervals.map((semis, i) => {
    const off = mod(semis - MAJOR_INTERVALS[i] + 6, 12) - 6;
    return (off < 0 ? '♭'.repeat(-off) : '♯'.repeat(off)) + (i + 1);
  });
}
