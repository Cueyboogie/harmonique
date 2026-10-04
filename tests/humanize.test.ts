import { describe, it, expect } from 'vitest';
import { Humanizer, HUMAN_DEFAULT, rng, takeFromRecording, takeToMidiEvents, writeMidi, quantizeTake, setLoopBars, takeFromChords, type HumanFeel } from '../engine';

const on = (p: Partial<HumanFeel> = {}): HumanFeel => ({ ...HUMAN_DEFAULT, on: true, ...p });
const CHORD = [48, 55, 60, 64, 67]; // C bass, inner G C E, top G

describe('Humanizer', () => {
  it('off: every note gets the played velocity', () => {
    expect(new Humanizer(rng(1)).velocities(CHORD, 90, HUMAN_DEFAULT)).toEqual([90, 90, 90, 90, 90]);
  });

  it('amount 0: no change, even when on', () => {
    expect(new Humanizer(rng(1)).velocities(CHORD, 90, on({ amount: 0 }))).toEqual([90, 90, 90, 90, 90]);
  });

  it('voicing alone: top sings, bass holds, inner notes sit back (predictable)', () => {
    const v = new Humanizer(rng(1)).velocities(CHORD, 100, on({ amount: 1, dynamics: 0, drift: 0 }));
    expect(v).toEqual([106, 85, 85, 85, 115]);
    expect(new Humanizer(rng(99)).velocities(CHORD, 100, on({ amount: 1, dynamics: 0, drift: 0 }))).toEqual(v);
  });

  it('works in any note order: shape follows pitch, not position', () => {
    const v = new Humanizer(rng(1)).velocities([67, 48, 60], 100, on({ amount: 1, dynamics: 0, drift: 0 }));
    expect(v).toEqual([115, 106, 85]);
  });

  it('single notes: no voicing shape', () => {
    expect(new Humanizer(rng(1)).velocities([60], 100, on({ amount: 1, dynamics: 0, drift: 0 }))).toEqual([100]);
  });

  it('stays in 1..127 and keeps the shape on a hard hit', () => {
    const v = new Humanizer(rng(3)).velocities(CHORD, 127, on({ amount: 1, voicing: 1, dynamics: 0, drift: 0 }));
    expect(Math.max(...v)).toBe(127);
    expect(v[4]).toBeGreaterThan(v[2]); // top still above the inner notes
    const soft = new Humanizer(rng(3)).velocities(CHORD, 2, on({ amount: 1, voicing: 1, dynamics: 1, drift: 1 }));
    soft.forEach((x) => expect(x).toBeGreaterThanOrEqual(1));
  });

  it('dynamics: notes differ, centred on the played velocity', () => {
    const h = new Humanizer(rng(7));
    const all: number[] = [];
    for (let i = 0; i < 400; i++) all.push(...h.velocities([60, 64, 67], 80, on({ voicing: 0, drift: 0 })));
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    expect(Math.abs(mean - 80)).toBeLessThan(1);
    expect(new Set(all).size).toBeGreaterThan(10);
    all.forEach((x) => expect(Math.abs(x - 80)).toBeLessThan(35));
  });

  it('drift wanders: neighbouring hits are closer than random hits', () => {
    const h = new Humanizer(rng(11));
    const lvl: number[] = [];
    for (let i = 0; i < 2000; i++) lvl.push(h.velocities([60], 90, on({ amount: 1, voicing: 0, dynamics: 0, drift: 1 }))[0]);
    const step = lvl.slice(1).reduce((s, x, i) => s + Math.abs(x - lvl[i]), 0) / (lvl.length - 1);
    const far = lvl.slice(50).reduce((s, x, i) => s + Math.abs(x - lvl[i]), 0) / (lvl.length - 50);
    expect(step).toBeLessThan(far * 0.8);
    expect(Math.max(...lvl) - Math.min(...lvl)).toBeGreaterThan(20);
  });

  it('same seed, same feel', () => {
    const a = new Humanizer(rng(5)), b = new Humanizer(rng(5));
    for (let i = 0; i < 5; i++) expect(a.velocities(CHORD, 100, on())).toEqual(b.velocities(CHORD, 100, on()));
  });
});

describe('per-note velocities survive the take', () => {
  const raw = [
    { startMs: 0, lengthMs: 900, notes: [60, 64, 67], velocity: 101, velocities: [92, 84, 101], keyPc: 0, label: 'C' },
    { startMs: 1000, lengthMs: 900, notes: [65, 69, 72], velocity: 100, keyPc: 5, label: 'F' },
  ];
  const take = takeFromRecording(raw, 2000, 120);

  it('recording keeps them; quantize and loop length keep them', () => {
    expect(take.events[0].velocities).toEqual([92, 84, 101]);
    expect(take.events[1].velocities).toBeUndefined();
    expect(quantizeTake(take, '1/16').events[0].velocities).toEqual([92, 84, 101]);
    expect(setLoopBars(take, 2).events.filter((e) => e.velocities).length).toBe(2);
  });

  it('the MIDI file has each note at its own velocity', () => {
    const bytes = writeMidi(takeToMidiEvents(take), 120);
    const ons: [number, number][] = [];
    for (let i = 0; i < bytes.length - 2; i++) if (bytes[i] === 0x90) ons.push([bytes[i + 1], bytes[i + 2]]);
    expect(ons).toEqual([[60, 92], [64, 84], [67, 101], [65, 100], [69, 100], [72, 100]]);
  });

  it('presets/generator can carry a feel', () => {
    const t = takeFromChords([{ notes: [60, 64], beats: 4, velocities: [90, 80] }, { notes: [62], beats: 4 }], 100);
    expect(t.events[0].velocities).toEqual([90, 80]);
    expect(t.events[1].velocities).toBeUndefined();
  });
});
