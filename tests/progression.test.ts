import { describe, expect, it } from 'vitest';
import {
  buildScale, scaleFromPitchClass, buildChordMap, diatonicChord, voiceChord, voiceLead, movement,
  PRESETS, resolvePreset, generateProgression, suggestNext, transitionTable, chordTension, writeMidi,
  WHITE_PCS, BLACK_PCS,
} from '../engine';

const C = buildScale('C', 'ionian');
const Cmap = buildChordMap(C, 'triad');

describe('voice leading', () => {
  it('C → F moves to C–F–A (2nd inversion), 3 semitones total', () => {
    const prev = voiceChord(diatonicChord(C, 1, 'triad'), 60);
    const next = voiceLead(diatonicChord(C, 4, 'triad'), 65, prev);
    expect(next).toEqual([60, 65, 69]);
    expect(movement(prev, next)).toBe(3);
  });
  it('always moves less than (or same as) plain root position', () => {
    let prev = voiceChord(diatonicChord(C, 1, '7th'), 60);
    for (const d of [6, 2, 5, 1, 4, 7, 3]) {
      const chord = diatonicChord(C, d, '7th');
      const root = 60 + [0, 2, 4, 5, 7, 9, 11][d - 1];
      const led = voiceLead(chord, root, prev);
      expect(movement(prev, led)).toBeLessThanOrEqual(movement(prev, voiceChord(chord, root)));
      prev = led;
    }
  });
  it('does not drift out of register over a long progression', () => {
    let prev: number[] | null = null;
    for (let i = 0; i < 64; i++) {
      const d = [1, 5, 6, 4][i % 4];
      prev = voiceLead(diatonicChord(C, d, '7th'), 60 + [0, 2, 4, 5, 7, 9, 11][d - 1], prev);
    }
    expect(Math.min(...prev!)).toBeGreaterThan(48);
    expect(Math.max(...prev!)).toBeLessThan(84);
  });
  it('no previous chord → home voicing', () =>
    expect(voiceLead(diatonicChord(C, 1, 'triad'), 60, null, { inversion: 1 })).toEqual([64, 67, 72]));
});

describe('Bach table (learned from chorales)', () => {
  it('V → I is the strongest move in major', () => {
    const P = transitionTable(C, 'bach');
    expect(P[4].indexOf(Math.max(...P[4]))).toBe(0);
  });
  it('ii → V is the strongest move from ii', () => {
    const P = transitionTable(C, 'bach');
    expect(P[1].indexOf(Math.max(...P[1]))).toBe(4);
  });
  it('rows are probabilities with no self-moves', () => {
    for (const style of ['bach', 'pop'] as const) for (const row of transitionTable(C, style)) {
      expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
      expect(row.every((x) => x >= 0)).toBe(true);
    }
    transitionTable(C, 'bach').forEach((row, i) => expect(row[i]).toBe(0));
  });
});

describe('presets', () => {
  it('resolve in every key', () => {
    for (let pc = 0; pc < 12; pc++) for (const p of PRESETS) {
      const s = scaleFromPitchClass(pc, p.scale);
      const keys = resolvePreset(p, buildChordMap(s, '7th'));
      expect(keys.length).toBe(p.steps.length);
    }
  });
  it('Pop anthem in C = C G Am F', () => {
    const keys = resolvePreset(PRESETS.find((p) => p.id === 'axis')!, Cmap);
    expect(keys.map((k) => Cmap[k].chord.symbol)).toEqual(['C', 'G', 'Am', 'F']);
  });
  it('Bittersweet uses the black keys for E and Fm', () => {
    const keys = resolvePreset(PRESETS.find((p) => p.id === 'creep')!, Cmap);
    expect(keys.map((k) => Cmap[k].chord.symbol)).toEqual(['C', 'E', 'F', 'Fm']);
  });
});

describe('generator', () => {
  it('is deterministic per seed and starts on the tonic', () => {
    const a = generateProgression(C, Cmap, { seed: 7 });
    const b = generateProgression(C, Cmap, { seed: 7 });
    expect(a).toEqual(b);
    expect(a.keys[0]).toBe(0);
    expect(a.keys.length).toBe(4);
  });
  it('different seeds explore different progressions', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, s) => generateProgression(C, Cmap, { seed: s }).keys.join()));
    expect(seen.size).toBeGreaterThan(5);
  });
  it('8-chord mode, no immediate repeats', () => {
    for (let s = 0; s < 20; s++) {
      const { keys } = generateProgression(C, Cmap, { seed: s, length: 8 });
      expect(keys.length).toBe(8);
      keys.forEach((k, i) => expect(k).not.toBe(keys[(i + 1) % 8]));
    }
  });
  it('color 0 → only white keys; color 1 → black keys show up', () => {
    const noColor = Array.from({ length: 20 }, (_, s) => generateProgression(C, Cmap, { seed: s, color: 0 }).keys).flat();
    expect(noColor.every((k) => WHITE_PCS.includes(k))).toBe(true);
    const lots = Array.from({ length: 20 }, (_, s) => generateProgression(C, Cmap, { seed: s, color: 1 }).keys).flat();
    expect(lots.some((k) => BLACK_PCS.includes(k))).toBe(true);
  });
  it('tension slider moves the result', () => {
    const avg = (t: number) =>
      Array.from({ length: 30 }, (_, s) => generateProgression(C, Cmap, { seed: s, tension: t, color: 0 }).tension)
        .reduce((a, b) => a + b, 0) / 30;
    expect(avg(0.9)).toBeGreaterThan(avg(0.1) + 0.1);
  });
  it('works in every scale and root, both styles', () => {
    for (let pc = 0; pc < 12; pc += 5) for (const id of ['dorian', 'phrygianDominant', 'locrian', 'lydian'] as const) {
      const s = scaleFromPitchClass(pc, id);
      const m = buildChordMap(s, '7th');
      for (const style of ['pop', 'bach'] as const) {
        const g = generateProgression(s, m, { style, seed: pc, color: 0.5 });
        g.keys.forEach((k) => expect(m[k]).toBeDefined());
      }
    }
  });
});

describe('suggestions', () => {
  it('after V (G key), Bach says I (C key) first', () =>
    expect(suggestNext(C, Cmap, 7, 'bach')[0].keyPc).toBe(0));
  it('after a secondary dominant, its target comes first', () => {
    const vOfV = Cmap.find((s) => s.role === 'V of V')!;
    expect(suggestNext(C, Cmap, vOfV.keyPc)[0].keyPc).toBe(7);
  });
  it('never suggests the chord you are on', () =>
    WHITE_PCS.forEach((k) => expect(suggestNext(C, Cmap, k).some((s) => s.keyPc === k)).toBe(false)));
  it('tension: tonic calm, dominant tense', () =>
    expect(chordTension(Cmap[0])).toBeLessThan(chordTension(Cmap[7])));
});

describe('MIDI file', () => {
  const bytes = writeMidi([{ notes: [60, 64, 67], start: 0, length: 4 }, { notes: [65, 69, 72], start: 4, length: 4 }], 100);
  const str = (a: number, n: number) => String.fromCharCode(...bytes.slice(a, a + n));
  it('has valid header and track chunk', () => {
    expect(str(0, 4)).toBe('MThd');
    expect(str(14, 4)).toBe('MTrk');
    const len = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
    expect(22 + len).toBe(bytes.length);
    expect([...bytes.slice(-4)]).toEqual([0, 0xff, 0x2f, 0]);
  });
  it('contains 6 note-ons and 6 note-offs', () => {
    const arr = [...bytes];
    const ons = arr.filter((b, i) => b === 0x90 && arr[i + 2] > 0).length;
    expect(ons).toBe(6);
  });
});

describe('voice leading follows your hand', () => {
  const C = buildScale('C', 'ionian');
  const center = (n: number[]) => n.reduce((a, b) => a + b, 0) / n.length;
  it('coming back down two octaves plays the low register again', () => {
    let prev: number[] | null = null;
    for (const [d, root] of [[1, 84], [6, 81], [4, 77], [5, 79]] as const) prev = voiceLead(diatonicChord(C, d, '7th'), root, prev);
    const low = voiceLead(diatonicChord(C, 1, '7th'), 60, prev);
    const home = voiceChord(diatonicChord(C, 1, '7th'), 60);
    expect(Math.abs(center(low) - center(home))).toBeLessThanOrEqual(6);
  });
  it('a looping progression settles and never creeps', () => {
    const prog = [[1, 60], [6, 57], [4, 65], [5, 67]] as const;
    let prev: number[] | null = null;
    const cycles: string[] = [];
    for (let c = 0; c < 10; c++) {
      const v = prog.map(([d, root]) => {
        prev = voiceLead(diatonicChord(C, d, '7th'), root, prev);
        const home = voiceChord(diatonicChord(C, d, '7th'), root);
        expect(Math.abs(center(prev) - center(home))).toBeLessThanOrEqual(6);
        return prev.join(',');
      });
      cycles.push(v.join('|'));
    }
    expect(new Set(cycles.slice(2)).size).toBe(1); // same voicings every time around
  });
});
