/**
 * Humanize: loosens timing and velocity so chords don't sound robotic.
 * It changes only what Harmonique sends out, never what you played.
 *
 *   amount 0 (OFF) … 1 (100%)
 *   timing    each note is DELAYED (never earlier) by up to 30 ms × amount.
 *             The lowest note tends to land first (a slight strum); the order is randomised a little.
 *   velocity  each note varies by up to ±12 × amount around what you played, clamped to 1..127.
 *
 * Fresh random values on every press. The random source is passed in, so tests (and the C++ port in
 * plugin/Source/Music.cpp, which uses the same mulberry32 generator) can reproduce a press exactly.
 */
export const HUMANIZE_MAX_DELAY_MS = 30;
export const HUMANIZE_MAX_VELOCITY = 12;
/** OFF, 10% … 100%. */
export const HUMANIZE_STEPS: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export interface HumanNote { note: number; velocity: number; delayMs: number }

/** Mulberry32: small, fast, seeded. Returns floats in [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One press: `notes` (any order) played at `velocity` → each note with its velocity and delay.
 * Output is in the same order as `notes`. amount ≤ 0 returns the notes unchanged, no delay.
 */
export function humanize(notes: readonly number[], velocity: number, amount: number, random: () => number): HumanNote[] {
  const a = Math.max(0, Math.min(1, amount));
  const vel = Math.max(1, Math.min(127, Math.round(velocity)));
  if (a <= 0) return notes.map((note) => ({ note, velocity: vel, delayMs: 0 }));
  const maxDelay = HUMANIZE_MAX_DELAY_MS * a;
  const maxVel = HUMANIZE_MAX_VELOCITY * a;
  // Rank by pitch, low → high: the strum position of each note.
  const order = notes.map((n, i) => ({ n, i })).sort((x, y) => x.n - y.n || x.i - y.i);
  const rank = new Array<number>(notes.length);
  order.forEach((o, r) => { rank[o.i] = r; });
  const n = notes.length;
  return notes.map((note, i) => {
    const strum = n > 1 ? (rank[i] / (n - 1)) * 0.5 : 0;       // 0 … ½ of the range, lowest first
    const jitter = random() * (n > 1 ? 0.5 : 0.35);             // a little randomness on top
    const delayMs = Math.min(maxDelay, (strum + jitter) * maxDelay);
    const dv = Math.round((random() * 2 - 1) * maxVel);
    return { note, velocity: Math.max(1, Math.min(127, vel + dv)), delayMs };
  });
}
