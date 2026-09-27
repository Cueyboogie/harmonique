/**
 * Progression engine (Phase 7). Deterministic: no AI, same seed → same result.
 *
 * Three ways to get a progression:
 *   1. PRESETS: famous progressions, written as scale degrees, so they work in any key.
 *   2. generateProgression(): a seeded random walk over a chord-to-chord probability table,
 *      run a few hundred times and scored for musicality, tension and variety.
 *   3. suggestNext(): the chords most likely to come next, for live playing.
 *
 * Probability tables ("style"):
 *   - 'bach': learned from 368 J.S. Bach chorales (see scripts/extract-bach.py).
 *   - 'pop':  learned from the PRESETS below (modern progressions, looped).
 */
import { BACH_MAJOR, BACH_MINOR } from './bach-data';
import { WHITE_PCS, type ChordSlot } from './chordmap';
import type { Scale, ScaleId } from './scales';

export type Style = 'pop' | 'bach';

/* ---------------- presets ---------------- */

/** A step is a scale degree (1..7 → white keys) or the role name of a color chord (→ black key). */
export type Step = number | string;

export interface Preset {
  id: string;
  name: string;
  mood: string;
  /** Scale the preset is written for. Loading it switches to this scale (root is kept). */
  scale: ScaleId;
  steps: Step[];
}

export const PRESETS: readonly Preset[] = [
  { id: 'axis', name: 'Pop anthem', mood: 'Uplifting, stadium', scale: 'ionian', steps: [1, 5, 6, 4] },
  { id: 'sensitive', name: 'Sensitive', mood: 'Emotional pop ballad', scale: 'ionian', steps: [6, 4, 1, 5] },
  { id: 'doowop', name: '50s', mood: 'Sweet, nostalgic', scale: 'ionian', steps: [1, 6, 4, 5] },
  { id: 'royal', name: 'Royal road', mood: 'Anime, J-pop lift', scale: 'ionian', steps: [4, 5, 3, 6] },
  { id: 'twofive', name: 'ii–V–I', mood: 'Jazz, smooth resolve', scale: 'ionian', steps: [2, 5, 1, 1] },
  { id: 'neosoul', name: 'Neo-soul fall', mood: 'Warm, laid-back (try 9ths)', scale: 'ionian', steps: [4, 3, 2, 1] },
  { id: 'canon', name: 'Canon', mood: 'Classical, wedding', scale: 'ionian', steps: [1, 5, 6, 3, 4, 1, 4, 5] },
  { id: 'creep', name: 'Bittersweet', mood: 'Alt-rock, major-to-minor ache', scale: 'ionian', steps: [1, 'V of vi', 4, 'Minor iv'] },
  { id: 'epic', name: 'Epic minor', mood: 'Cinematic, heroic', scale: 'aeolian', steps: [1, 6, 3, 7] },
  { id: 'sadloop', name: 'Minor loop', mood: 'Moody, trap/lofi', scale: 'aeolian', steps: [1, 4, 7, 3] },
  { id: 'andalusian', name: 'Andalusian', mood: 'Flamenco, dramatic descent', scale: 'aeolian', steps: [1, 7, 6, 'Major V'] },
  { id: 'drama', name: 'Minor drama', mood: 'Classical tension and release', scale: 'harmonicMinor', steps: [1, 4, 5, 1] },
  { id: 'dorianvamp', name: 'Dorian vamp', mood: 'Funk, house, hypnotic', scale: 'dorian', steps: [1, 4, 1, 4] },
  { id: 'mixorock', name: 'Mixolydian rock', mood: 'Anthemic, open', scale: 'mixolydian', steps: [1, 7, 4, 1] },
  { id: 'lydianfloat', name: 'Lydian float', mood: 'Dreamy, weightless', scale: 'lydian', steps: [1, 2, 1, 2] },
  { id: 'phrygiandark', name: 'Phrygian menace', mood: 'Dark, metal, tension', scale: 'phrygian', steps: [1, 2, 1, 7] },
];

/** Turn a preset into keys (pitch classes of the keys to press, 0 = C key). */
export function resolvePreset(p: Preset, map: ChordSlot[]): number[] {
  return p.steps.map((s) => {
    if (typeof s === 'number') return WHITE_PCS[s - 1];
    const slot = map.find((x) => x.kind === 'color' && x.role === s);
    if (!slot) throw new Error(`Preset ${p.id}: no color chord "${s}" in this scale`);
    return slot.keyPc;
  });
}

/* ---------------- probability tables ---------------- */

const isMajorScale = (scale: Scale) => scale.def.intervals[2] === 4;

function popCounts(major: boolean): number[][] {
  const m = Array.from({ length: 7 }, () => new Array(7).fill(0));
  for (const p of PRESETS) {
    const presetMajor = ['ionian', 'lydian', 'mixolydian'].includes(p.scale);
    if (presetMajor !== major) continue;
    const n = p.steps.length;
    for (let i = 0; i < n; i++) {
      const a = p.steps[i];
      const b = p.steps[(i + 1) % n]; // progressions loop
      if (typeof a === 'number' && typeof b === 'number' && a !== b) m[a - 1][b - 1] += 10;
    }
  }
  return m;
}

/** Row-normalised probabilities P[from-1][to-1], smoothed so no move is impossible. No self-moves. */
export function transitionTable(scale: Scale, style: Style): number[][] {
  const major = isMajorScale(scale);
  const counts = style === 'bach' ? (major ? BACH_MAJOR : BACH_MINOR) : popCounts(major);
  return counts.map((row, i) => {
    const total = row.reduce((s, x) => s + x, 0);
    const floor = Math.max(1, total * 0.02) / 6;
    const smoothed = row.map((x, j) => (i === j ? 0 : x + floor));
    const sum = smoothed.reduce((s, x) => s + x, 0);
    return smoothed.map((x) => x / sum);
  });
}

/* ---------------- tension ---------------- */

/** How much a degree pulls away from home, 0..1 (tonic 0, dominant high). */
const FUNCTION_TENSION = [0, 0.45, 0.3, 0.35, 0.7, 0.2, 0.85];

/** 0..1: how unresolved a chord feels. Function + quality + being from outside the scale. */
export function chordTension(slot: ChordSlot): number {
  let t = slot.resolvesTo ? 0.75 : FUNCTION_TENSION[slot.degree - 1];
  if (slot.chord.triad === 'diminished') t += 0.2;
  if (slot.chord.triad === 'augmented') t += 0.25;
  if (slot.kind === 'color') t += 0.15;
  return Math.max(0, Math.min(1, t));
}

/* ---------------- generator ---------------- */

/** Small, fast seeded PRNG (mulberry32). Same seed → same sequence. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  /** Number of chords. Default 4. */
  length?: number;
  style?: Style;
  /** 0 = calm and resolved … 1 = restless. Default 0.4. */
  tension?: number;
  /** 0 = only scale chords … 1 = lots of black-key color chords. Default 0.25. */
  color?: number;
  seed?: number;
}

export interface GeneratedProgression {
  /** Keys to press (0 = C key … 11 = B key). */
  keys: number[];
  /** Mean tension 0..1 of the result. */
  tension: number;
}

const pick = (weights: number[], r: number) => {
  const total = weights.reduce((s, x) => s + x, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) <= 0) return i;
  return weights.length - 1;
};

export function generateProgression(scale: Scale, map: ChordSlot[], opts: GenerateOptions = {}): GeneratedProgression {
  const { length = 4, style = 'pop', tension = 0.4, color = 0.25, seed = 1 } = opts;
  const P = transitionTable(scale, style);
  const rand = rng(seed);
  const slotOf = (degree: number) => map[WHITE_PCS[degree - 1]];
  const unstable = (d: number) => ['diminished', 'augmented'].includes(slotOf(d).chord.triad);

  // 1. Sample many walks from the tonic, score them, then pick one of the best
  //    (weighted by score) so every "regenerate" is good but different.
  const scored = new Map<string, { degs: number[]; score: number }>();
  for (let n = 0; n < 240; n++) {
    const degs = [1];
    while (degs.length < length) {
      const row = P[degs[degs.length - 1] - 1].map((p, j) => (unstable(j + 1) ? p * (0.1 + 0.5 * tension) : p));
      degs.push(pick(row, rand()) + 1);
    }
    let logp = 0;
    for (let i = 0; i < length; i++) logp += Math.log(P[degs[i] - 1][degs[(i + 1) % length] - 1] || 1e-6);
    const meanT = degs.reduce((s, d) => s + chordTension(slotOf(d)), 0) / length;
    const distinct = new Set(degs).size;
    const minDistinct = Math.min(length, length >= 8 ? 4 : 3);
    const unstableCount = degs.filter(unstable).length;
    const score = logp / length - 4 * Math.abs(meanT - tension) - (distinct < minDistinct ? 2 : 0)
      - unstableCount * 0.6 * (1 - tension); // diminished/augmented chords: rarer when calm
    scored.set(degs.join(), { degs, score });
  }
  const top = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  const TEMPERATURE = 0.35;
  const best = top[pick(top.map((c) => Math.exp((c.score - top[0].score) / TEMPERATURE)), rand())].degs;

  // 2. Color pass: swap some chords for black-key chords that do the same job.
  const keys = best.map((d) => WHITE_PCS[d - 1]);
  for (let i = 1; i < length; i++) {
    if (rand() >= color * 0.6) continue;
    const nextDeg = best[(i + 1) % length];
    const options = map.filter((s) => s.kind === 'color' && (
      (!s.resolvesTo && s.degree === best[i]) || // borrowed stand-in for this degree
      (s.resolvesTo === nextDeg && best[i] !== 1) // secondary dominant into the next chord
    ));
    if (!options.length) continue;
    const choice = options[Math.floor(rand() * options.length)].keyPc;
    if (choice !== keys[i - 1] && choice !== keys[(i + 1) % length]) keys[i] = choice;
  }

  const meanTension = keys.reduce((s, k) => s + chordTension(map[k]), 0) / length;
  return { keys, tension: meanTension };
}

/* ---------------- live suggestions ---------------- */

export interface Suggestion { keyPc: number; weight: number; kind: 'likely' | 'spice' }

/**
 * What to play after `fromKeyPc`: the 3 likeliest scale chords, plus one color chord
 * that can stand in for one of them. A secondary dominant always suggests its target first.
 */
export function suggestNext(scale: Scale, map: ChordSlot[], fromKeyPc: number, style: Style = 'pop'): Suggestion[] {
  const P = transitionTable(scale, style);
  const from = map[fromKeyPc];
  const row = [...P[from.degree - 1]];
  if (from.resolvesTo) row[from.resolvesTo - 1] += 2; // resolve the pull
  const ranked = row
    .map((w, j) => ({ keyPc: WHITE_PCS[j], weight: w, kind: 'likely' as const, degree: j + 1 }))
    .filter((s) => s.keyPc !== fromKeyPc)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const out: Suggestion[] = ranked.map(({ keyPc, weight, kind }) => ({ keyPc, weight, kind }));
  const spice = map.find((s) => s.kind === 'color' && s.keyPc !== fromKeyPc && !s.resolvesTo && ranked.some((r) => r.degree === s.degree));
  if (spice) out.push({ keyPc: spice.keyPc, weight: ranked[ranked.length - 1].weight * 0.8, kind: 'spice' });
  return out;
}
