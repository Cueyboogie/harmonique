/**
 * Notes and pitch classes.
 *
 * A "pitch class" is a note with no octave: 0 = C, 1 = C#/Db, ... 11 = B.
 * A "spelled note" also knows its letter name, so we can tell Eb from D#.
 * Spelling matters for readability: in C Dorian the 3rd is "Eb", never "D#".
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** Pitch class of each natural letter. */
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;

export interface SpelledNote {
  /** 0..6 index into LETTERS */
  letter: number;
  /** -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp */
  accidental: number;
}

export const mod = (n: number, m: number) => ((n % m) + m) % m;

export function pitchClass(n: SpelledNote): number {
  return mod(LETTER_PC[n.letter] + n.accidental, 12);
}

const ACCIDENTAL_TEXT: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };
const ACCIDENTAL_SYMBOL: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/** ASCII name, e.g. "Eb", "F#". */
export function noteName(n: SpelledNote): string {
  return LETTERS[n.letter] + ACCIDENTAL_TEXT[n.accidental];
}

/** Display name with real music symbols, e.g. "E♭". */
export function noteLabel(n: SpelledNote): string {
  return LETTERS[n.letter] + ACCIDENTAL_SYMBOL[n.accidental];
}

/** Parse "C", "Eb", "F#", "Bbb", "C##". Throws on bad input. */
export function parseNote(name: string): SpelledNote {
  const m = /^([A-Ga-g])(bb|b|##|#|♭|♯)?$/.exec(name.trim());
  if (!m) throw new Error(`Invalid note name: "${name}"`);
  const letter = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number]);
  const acc = m[2] ?? '';
  const accidental =
    acc === 'bb' ? -2 : acc === 'b' || acc === '♭' ? -1 : acc === '##' ? 2 : acc === '#' || acc === '♯' ? 1 : 0;
  return { letter, accidental };
}

/** MIDI note number → octave-aware name (MIDI 60 = C4). Uses sharps; for display only. */
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiName(midi: number): string {
  return SHARP_NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
}
