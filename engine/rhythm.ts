/**
 * Euclidean rhythm (Phase 8). Knows nothing about chords: it only answers
 * "on which steps does something happen, and for how long?"
 *
 *   Steps  – slots in one cycle (2–16)
 *   Hits   – how many slots play; spread as evenly as possible (that's the "Euclidean" part)
 *   Rotate – shifts where the cycle starts
 *   Rate   – how long one step is (1/4, 1/8 or 1/16 note)
 *   Gate   – how long each hit sounds, as a share of the gap to the next hit
 *            (1 = hold until the next hit, 0.25 = short stab)
 *
 * A pattern can also be "custom": any on/off list, e.g. after tapping dots by hand.
 */

export type Rate = '1/4' | '1/8' | '1/16';
export const RATES: readonly Rate[] = ['1/4', '1/8', '1/16'];
/** Beats (quarter notes) per step. */
export const RATE_BEATS: Record<Rate, number> = { '1/4': 1, '1/8': 0.5, '1/16': 0.25 };

export interface Pattern {
  steps: number;
  hits: number;
  rotate: number;
  rate: Rate;
  gate: number;
  /** Set when edited by hand; overrides steps/hits/rotate. */
  custom?: boolean[];
}

/** Evenly distribute `hits` over `steps`, then rotate. Always starts on a hit when rotate = 0. */
export function euclid(steps: number, hits: number, rotate = 0): boolean[] {
  const n = Math.max(1, Math.min(32, Math.round(steps)));
  const k = Math.max(0, Math.min(n, Math.round(hits)));
  const base = Array.from({ length: n }, (_, i) => (i * k) % n < k);
  const r = ((Math.round(rotate) % n) + n) % n;
  return base.map((_, i) => base[(i + r) % n]);
}

export function patternSteps(p: Pattern): boolean[] {
  return p.custom && p.custom.length ? p.custom.slice() : euclid(p.steps, p.hits, p.rotate);
}

/** Toggle one step by hand: the pattern becomes custom. */
export function toggleStep(p: Pattern, index: number): Pattern {
  const steps = patternSteps(p);
  steps[index] = !steps[index];
  return { ...p, custom: steps, steps: steps.length, hits: steps.filter(Boolean).length };
}

export interface Hit {
  /** Beat offset from the start of the cycle. */
  start: number;
  /** Length in beats. */
  length: number;
}

/** The hits of one cycle, in beats. Cycle length = steps × rate. */
export function patternHits(p: Pattern): Hit[] {
  const on = patternSteps(p);
  const stepBeats = RATE_BEATS[p.rate];
  const idx = on.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  return idx.map((i, j) => {
    const next = j + 1 < idx.length ? idx[j + 1] : idx[0] + on.length; // wraps to the next cycle
    const gap = (next - i) * stepBeats;
    return { start: i * stepBeats, length: Math.max(stepBeats * 0.1, gap * Math.max(0.05, Math.min(1, p.gate))) };
  });
}

export function cycleBeats(p: Pattern): number {
  return patternSteps(p).length * RATE_BEATS[p.rate];
}

export const GROOVES: readonly { name: string; pattern: Pattern }[] = [
  { name: 'Hold', pattern: { steps: 8, hits: 1, rotate: 0, rate: '1/8', gate: 1 } },
  { name: 'Pulse', pattern: { steps: 8, hits: 4, rotate: 0, rate: '1/8', gate: 0.6 } },
  { name: 'Tresillo', pattern: { steps: 8, hits: 3, rotate: 0, rate: '1/8', gate: 0.8 } },
  { name: 'Cinquillo', pattern: { steps: 8, hits: 5, rotate: 0, rate: '1/8', gate: 0.7 } },
  { name: 'Offbeat', pattern: { steps: 8, hits: 4, rotate: 1, rate: '1/8', gate: 0.5 } },
  { name: 'Busy', pattern: { steps: 16, hits: 7, rotate: 2, rate: '1/16', gate: 0.6 } },
];

/** Name of the groove this pattern matches, or null for a user-made one. */
export function grooveName(p: Pattern): string | null {
  if (p.custom) return null;
  const g = GROOVES.find((x) => x.pattern.steps === p.steps && x.pattern.hits === p.hits &&
    ((x.pattern.rotate - p.rotate) % p.steps === 0) && x.pattern.rate === p.rate);
  return g ? g.name : null;
}
