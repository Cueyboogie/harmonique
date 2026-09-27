/**
 * Notes mode: every key on the keyboard plays one note that belongs to the scale,
 * like Ableton's Scale MIDI effect. Keys keep their real pitch; a key outside the
 * scale snaps to the nearest scale note (a tie goes down), so some keys repeat.
 */
import { noteLabel } from './notes';
import type { Scale } from './scales';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** MIDI note → the nearest note of the scale (ties go down). */
export function snapToScale(midi: number, scale: Scale): number {
  const pcs = scale.pitchClasses;
  for (let d = 0; d <= 6; d++) {
    if (pcs.includes(mod(midi - d, 12))) return midi - d;
    if (pcs.includes(mod(midi + d, 12))) return midi + d;
  }
  return midi;
}

/** Spelled name of a scale pitch class, using the scale's own spelling (E♭, not D♯, in C minor). */
export function scaleNoteLabel(pc: number, scale: Scale): string {
  const i = scale.pitchClasses.indexOf(mod(pc, 12));
  return i >= 0 ? noteLabel(scale.notes[i]) : '';
}

/** What each of the 12 keys plays in notes mode: pitch class + name. */
export function noteKeyMap(scale: Scale): { keyPc: number; pc: number; label: string; inScale: boolean }[] {
  return Array.from({ length: 12 }, (_, k) => {
    const pc = mod(snapToScale(60 + k, scale), 12);
    return { keyPc: k, pc, label: scaleNoteLabel(pc, scale), inScale: scale.pitchClasses.includes(k) };
  });
}
