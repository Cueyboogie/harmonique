/**
 * Voicing engine (Phase 2): turns a Chord into actual MIDI notes.
 *
 *   Chord ──► trim (drop clashing/redundant notes) ──► stack from root
 *         ──► inversion ──► spread ──► MIDI notes
 *
 * Trim rules (standard piano/jazz practice), on by default:
 *   - 11th & 13th chords drop the 5th (it adds mud, not color).
 *   - An 11th chord with a MAJOR 3rd drops a natural 11 (a half-step clash
 *     with the 3rd, the classic "avoid note"). A ♯11 is kept (Lydian color).
 *   - 13th chords drop the 11th unless it's ♯11.
 */
import type { Chord } from './chords';

export type Spread = 'close' | 'open' | 'wide';
export const SPREADS: readonly Spread[] = ['close', 'open', 'wide'];

export interface VoicingOptions {
  /** 0 = root position, 1 = 3rd in the bass, 2 = 5th, 3 = 7th. Clamped to what the chord has. */
  inversion?: number;
  /**
   * close: notes stacked as tightly as possible.
   * open:  triads move the middle note up an octave; 4+ notes use "drop 2"
   *        (2nd-highest note down an octave), the go-to keys/guitar voicing.
   * wide:  open + the bass note doubled an octave below. Big, cinematic.
   */
  spread?: Spread;
  /** Apply the trim rules above. Default true. */
  trim?: boolean;
}

/** Chord tones as semitones above the root, after trim rules. */
export function trimmedIntervals(chord: Chord, trim = true): number[] {
  const iv = chord.intervals;
  if (!trim || iv.length < 6) return [...iv];
  const majorThird = iv[1] === 4;
  const keep = iv.filter((semis, i) => {
    if (i === 2) return false; // 5th
    if (i === 5) {
      const sharp11 = semis === 18;
      if (sharp11) return true;
      if (iv.length === 7) return false; // 13th chord: drop natural/♭11
      return !majorThird; // 11th chord: drop natural 11 over a major 3rd
    }
    return true;
  });
  return keep;
}

export function maxInversion(chord: Chord): number {
  return chord.intervals.length >= 4 ? 3 : 2;
}

/** Voice a chord with its root at `rootMidi` (before inversion). Returns ascending MIDI notes. */
export function voiceChord(chord: Chord, rootMidi: number, opts: VoicingOptions = {}): number[] {
  const { inversion = 0, spread = 'close', trim = true } = opts;
  let notes = trimmedIntervals(chord, trim).map((s) => rootMidi + s);

  // Inversion: raise the lowest note an octave, k times.
  const inv = Math.max(0, Math.min(inversion, maxInversion(chord), notes.length - 1));
  for (let k = 0; k < inv; k++) {
    notes.sort((a, b) => a - b);
    notes[0] += 12;
  }
  notes.sort((a, b) => a - b);

  if (spread !== 'close' && notes.length >= 3) {
    if (notes.length === 3) notes[1] += 12;
    else notes[notes.length - 2] -= 12;
    notes.sort((a, b) => a - b);
  }
  if (spread === 'wide') notes.unshift(notes[0] - 12);

  // Keep inside the MIDI range.
  while (notes[0] < 0) notes = notes.map((n) => n + 12);
  while (notes[notes.length - 1] > 127) notes = notes.map((n) => n - 12);
  return [...new Set(notes)].sort((a, b) => a - b);
}
