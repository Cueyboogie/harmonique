import { describe, it, expect } from 'vitest';
import { scaleFromPitchClass, snapToScale, noteKeyMap } from '../engine';

describe('notes mode: snap to scale', () => {
  const cMaj = scaleFromPitchClass(0, 'ionian');
  it('scale notes play as themselves', () => {
    for (const n of [60, 62, 64, 65, 67, 69, 71, 72]) expect(snapToScale(n, cMaj)).toBe(n);
  });
  it('black keys in C major snap down (ties go down)', () => {
    expect([61, 63, 66, 68, 70].map((n) => snapToScale(n, cMaj))).toEqual([60, 62, 65, 67, 69]);
  });
  it('every key lands in the scale, for every root and scale', () => {
    for (const id of ['ionian', 'dorian', 'aeolian', 'harmonicMinor', 'phrygianDominant', 'melodicMinor', 'locrian'] as const) {
      for (let r = 0; r < 12; r++) {
        const s = scaleFromPitchClass(r, id);
        for (let n = 48; n < 84; n++) {
          const out = snapToScale(n, s);
          expect(s.pitchClasses).toContain(((out % 12) + 12) % 12);
          expect(Math.abs(out - n)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('the key map names notes with the scale spelling', () => {
    const cMin = scaleFromPitchClass(0, 'aeolian');
    const m = noteKeyMap(cMin);
    expect(m[3].label).toBe('E♭');
    expect(m[4].label).toBe('E♭'); // E snaps down to E♭
    expect(m[4].inScale).toBe(false);
  });
});
