import { describe, expect, it } from 'vitest';
import {
  euclid, patternSteps, patternHits, toggleStep, cycleBeats, GROOVES, grooveName,
  detectTempo, takeFromRecording, reinterpret, takeFromChords, takeToMidiEvents, writeMidi, quantizeTake, setLoopBars,
  type Pattern,
} from '../engine';

const str = (b: boolean[]) => b.map((x) => (x ? 'x' : '.')).join('');

describe('euclid', () => {
  it('E(3,8) = tresillo x..x..x.', () => expect(str(euclid(8, 3))).toBe('x..x..x.'));
  it('E(4,8) = four on the floor', () => expect(str(euclid(8, 4))).toBe('x.x.x.x.'));
  it('E(5,8) has 5 evenly spread hits', () => {
    const p = euclid(8, 5);
    expect(p.filter(Boolean).length).toBe(5);
    expect(str(p)).not.toMatch(/\.\.\./);
  });
  it('rotate shifts the pattern', () => expect(str(euclid(8, 3, 1))).toBe('..x..x.x'));
  it('0 hits and all hits', () => {
    expect(str(euclid(4, 0))).toBe('....');
    expect(str(euclid(4, 4))).toBe('xxxx');
  });
  it('hit counts are exact for every steps/hits combo', () => {
    for (let n = 1; n <= 16; n++) for (let k = 0; k <= n; k++) expect(euclid(n, k).filter(Boolean).length).toBe(k);
  });
});

describe('patterns', () => {
  const tres: Pattern = { steps: 8, hits: 3, rotate: 0, rate: '1/8', gate: 1 };
  it('hits are in beats; gate 1 holds until the next hit', () =>
    expect(patternHits(tres)).toEqual([{ start: 0, length: 1.5 }, { start: 1.5, length: 1.5 }, { start: 3, length: 1 }]));
  it('gate 0.5 halves each hit', () => expect(patternHits({ ...tres, gate: 0.5 })[0].length).toBe(0.75));
  it('cycle = steps × rate', () => {
    expect(cycleBeats(tres)).toBe(4);
    expect(cycleBeats({ ...tres, steps: 16, rate: '1/16' })).toBe(4);
    expect(cycleBeats({ ...tres, rate: '1/4' })).toBe(8);
  });
  it('tapping a dot makes it custom', () => {
    const t = toggleStep(tres, 1);
    expect(str(patternSteps(t))).toBe('xx.x..x.');
    expect(t.hits).toBe(4);
    expect(grooveName(t)).toBeNull();
  });
  it('named grooves are recognised', () => {
    for (const g of GROOVES) expect(grooveName(g.pattern)).toBe(g.name);
  });
});

describe('tempo detection', () => {
  const beat = (bpm: number) => 60000 / bpm;
  it('4 bars at 120, chords on bars 1,2,3 and beat 3 of bar 3', () => {
    const b = beat(120);
    const r = detectTempo([0, 4 * b, 8 * b, 10 * b, 12 * b], 16 * b);
    expect(r.bars).toBe(4);
    expect(r.bpm).toBeCloseTo(120, 0);
  });
  it('118 BPM with human timing (±30 ms)', () => {
    const b = beat(118);
    const jitter = [0, 25, -30, 18, -12];
    const r = detectTempo([0, 4 * b + jitter[1], 8 * b + jitter[2], 10 * b + jitter[3], 12 * b + jitter[4]], 16 * b + 20);
    expect(r.bars).toBe(4);
    expect(Math.abs(r.bpm - 118)).toBeLessThan(1.5);
  });
  it('slow ballad at 76 BPM: 2 bars at 76, or the equally valid double-time reading (×2/÷2 fixes it)', () => {
    const b = beat(76);
    const r = detectTempo([0, 4 * b], 8 * b);
    const ok = (r.bars === 2 && Math.abs(r.bpm - 76) < 1) || (r.bars === 4 && Math.abs(r.bpm - 152) < 1);
    expect(ok).toBe(true);
  });
  it('fast 150 BPM, 8 bars, a change every bar', () => {
    const b = beat(150);
    const r = detectTempo(Array.from({ length: 8 }, (_, i) => i * 4 * b), 32 * b);
    expect(r.bars).toBe(8);
    expect(r.bpm).toBeCloseTo(150, 0);
  });
});

describe('takes', () => {
  const b = 60000 / 118;
  const raw = [
    { startMs: 0, lengthMs: 4 * b - 40, notes: [60, 64, 67, 71], velocity: 90, keyPc: 0 },
    { startMs: 4 * b + 15, lengthMs: 4 * b - 60, notes: [57, 60, 64, 67], velocity: 80, keyPc: 9 },
    { startMs: 8 * b - 20, lengthMs: 2 * b, notes: [53, 57, 60, 64], velocity: 85, keyPc: 5 },
    { startMs: 10 * b + 10, lengthMs: 2 * b - 30, notes: [55, 59, 62, 65], velocity: 100, keyPc: 7 },
  ];
  const take = takeFromRecording(raw, 12 * b + 10);
  it('finds 3 bars at about 118 and keeps every event', () => {
    expect(take.beats).toBe(12);
    expect(Math.abs(take.bpm - 118)).toBeLessThan(1.5);
    expect(take.events.length).toBe(4);
    expect(take.tempoSource).toBe('detected');
  });
  it('keeps the feel: events stay slightly off the grid', () => {
    expect(take.events[1].start).not.toBe(4);
    expect(Math.abs(take.events[1].start - 4)).toBeLessThan(0.1);
  });
  it('fixed tempo (Euclidean on) keeps that tempo', () => {
    const t = takeFromRecording(raw, 12 * b, 118);
    expect(t.bpm).toBe(118);
    expect(t.tempoSource).toBe('fixed');
  });
  it('×2 and ÷2 reinterpret without changing the sound', () => {
    const d = reinterpret(take, 2);
    expect(d.beats).toBe(24);
    const msA = (take.events[2].start * 60000) / take.bpm;
    const msB = (d.events[2].start * 60000) / d.bpm;
    expect(Math.abs(msA - msB)).toBeLessThan(2);
  });
  it('÷2 refuses to make a fraction of a bar', () => {
    const t = takeFromChords([{ notes: [60], beats: 4 }], 120);
    expect(reinterpret(t, 0.5)).toBe(t);
  });
  it('chords list → take → MIDI file', () => {
    const t = takeFromChords([{ notes: [60, 64, 67], beats: 4 }, { notes: [65, 69, 72], beats: 2 }], 100);
    expect(t.beats).toBe(8);
    const bytes = writeMidi(takeToMidiEvents(t), t.bpm);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
  });
});

describe('quantize', () => {
  const sloppy = {
    beats: 16, bpm: 120, tempoSource: 'detected' as const,
    events: [
      { start: 0.04, length: 3.9, notes: [60], velocity: 90 },
      { start: 4.11, length: 3.7, notes: [62], velocity: 90 },   // a bit late
      { start: 7.86, length: 2.3, notes: [64], velocity: 90 },   // early, and overlaps the next one
      { start: 10.02, length: 5.9, notes: [65], velocity: 90 },
    ],
  };
  it('1/16 snaps starts to the nearest sixteenth', () => {
    const q = quantizeTake(sloppy, '1/16');
    expect(q.events.map((e) => e.start)).toEqual([0, 4, 7.75, 10]);
  });
  it('1/4 snaps to beats', () => expect(quantizeTake(sloppy, '1/4').events.map((e) => e.start)).toEqual([0, 4, 8, 10]));
  it('no chord overlaps the next after quantizing', () => {
    const q = quantizeTake(sloppy, '1/16');
    q.events.slice(0, -1).forEach((e, i) => expect(e.start + e.length).toBeLessThanOrEqual(q.events[i + 1].start));
  });
  it('every chord keeps at least one grid step and stays inside the loop', () => {
    const q = quantizeTake({ ...sloppy, events: [{ start: 15.99, length: 0.01, notes: [60], velocity: 90 }] }, '1/16');
    expect(q.events[0].length).toBeGreaterThanOrEqual(0.25);
    expect(q.events[0].start + q.events[0].length).toBeLessThanOrEqual(16);
  });
  it('off leaves the take untouched', () => expect(quantizeTake(sloppy, 'off')).toBe(sloppy));
});

describe('loop length', () => {
  const t = takeFromChords([{ notes: [60], beats: 4 }, { notes: [65], beats: 4 }], 120);
  it('longer loop repeats the take', () => {
    const l = setLoopBars(t, 4);
    expect(l.beats).toBe(16);
    expect(l.events.map((e) => e.start)).toEqual([0, 4, 8, 12]);
  });
  it('shorter loop cuts it', () => {
    const s = setLoopBars(t, 1);
    expect(s.beats).toBe(4);
    expect(s.events.length).toBe(1);
  });
  it('odd lengths repeat and trim cleanly (2-bar take in 3 bars)', () => {
    const l = setLoopBars(t, 3);
    expect(l.events.map((e) => [e.start, e.length])).toEqual([[0, 4], [4, 4], [8, 4]]);
  });
});

describe('fixed tempo (Live owns it): no stretching', () => {
  it('keeps every chord exactly on the host grid', () => {
    const beat = 60000 / 118;
    // played 4 chords, one per bar, but pressed STOP a bit early (3.8 bars)
    const raw = [0, 4, 8, 12].map((b, i) => ({ startMs: b * beat, lengthMs: 4 * beat - 20, notes: [60 + i], velocity: 100, keyPc: 0, label: 'C' }));
    const t = takeFromRecording(raw, 15.2 * beat, 118);
    expect(t.bpm).toBe(118);
    expect(t.beats).toBe(16);
    expect(t.events.map((e) => Math.round(e.start * 1000) / 1000)).toEqual([0, 4, 8, 12]);
  });
});
