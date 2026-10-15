import { describe, it, expect } from 'vitest';
import { humanize, mulberry32, HUMANIZE_STEPS, HUMANIZE_MAX_DELAY_MS, HUMANIZE_MAX_VELOCITY } from '../engine/humanize';

const chord = [60, 64, 67, 71];

describe('humanize', () => {
  it('OFF changes nothing', () => {
    expect(humanize(chord, 100, 0, mulberry32(1))).toEqual(chord.map((note) => ({ note, velocity: 100, delayMs: 0 })));
  });

  it('delays stay within 0 … 30 ms × amount and velocities within ±12 × amount, clamped to 1..127', () => {
    const rnd = mulberry32(42);
    for (const amount of HUMANIZE_STEPS) {
      for (const vel of [1, 2, 64, 120, 127]) {
        for (let k = 0; k < 300; k++) {
          for (const h of humanize(chord, vel, amount, rnd)) {
            expect(h.delayMs).toBeGreaterThanOrEqual(0);
            expect(h.delayMs).toBeLessThanOrEqual(HUMANIZE_MAX_DELAY_MS * amount + 1e-9);
            expect(Math.abs(h.velocity - vel)).toBeLessThanOrEqual(Math.ceil(HUMANIZE_MAX_VELOCITY * amount));
            expect(h.velocity).toBeGreaterThanOrEqual(1);
            expect(h.velocity).toBeLessThanOrEqual(127);
          }
        }
      }
    }
  });

  it('at 100% it actually loosens things, and the lowest note tends to land first', () => {
    const rnd = mulberry32(7);
    let lowFirst = 0;
    let maxDelay = 0;
    const vels = new Set<number>();
    for (let k = 0; k < 500; k++) {
      const h = humanize(chord, 100, 1, rnd);
      maxDelay = Math.max(maxDelay, ...h.map((x) => x.delayMs));
      h.forEach((x) => vels.add(x.velocity));
      if (h[0].delayMs <= Math.min(...h.slice(1).map((x) => x.delayMs))) lowFirst++;
    }
    expect(maxDelay).toBeGreaterThan(20);
    expect(vels.size).toBeGreaterThan(15);
    expect(lowFirst / 500).toBeGreaterThan(0.5);
    expect(lowFirst / 500).toBeLessThan(1); // the order is randomised a little
  });

  it('every press is different; the same seed reproduces a press exactly', () => {
    const rnd = mulberry32(3);
    expect(humanize(chord, 90, 0.5, rnd)).not.toEqual(humanize(chord, 90, 0.5, rnd));
    expect(humanize(chord, 90, 0.5, mulberry32(9))).toEqual(humanize(chord, 90, 0.5, mulberry32(9)));
  });

  it('a single note (NOTES mode) gets a small offset only', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 200; k++) {
      const [h] = humanize([62], 80, 1, rnd);
      expect(h.delayMs).toBeLessThanOrEqual(0.35 * HUMANIZE_MAX_DELAY_MS + 1e-9);
    }
  });
});
