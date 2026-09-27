/**
 * Takes: what Record captures, and how its tempo is found.
 *
 * A take is exactly what came out of Harmonic between the first chord and Stop:
 * every chord, when it started, how long it sounded, how hard it was hit.
 * It is never re-sequenced afterwards.
 *
 * Tempo detection (when you played freely):
 *   The loop runs from your first chord to the moment you pressed Stop, so it is a
 *   whole number of bars. For each possible bar count, work out the tempo that implies,
 *   snap your chord changes to that beat grid, fine-tune the tempo to fit them best
 *   (least squares), and score how well everything lines up. Musically sensible
 *   tempos (around 80–160 BPM) and 1/2/4/8/16-bar loops are preferred.
 *   Double/half-time ambiguity is left to the user: ×2 and ÷2 reinterpret the take
 *   without changing how it sounds.
 */
import type { NoteEvent } from './midifile';

export interface TakeEvent {
  /** Start, in beats from the top of the loop. */
  start: number;
  /** Length in beats. */
  length: number;
  notes: number[];
  velocity: number;
  /** Which key (0 = C … 11 = B) produced it, for display. */
  keyPc?: number;
  /** Chord name at the time it was played, e.g. "Fmaj7". */
  label?: string;
}

export interface Take {
  events: TakeEvent[];
  /** Loop length in beats (always whole bars of 4/4). */
  beats: number;
  bpm: number;
  /** How the tempo was set: found from your playing, or the tempo that was running (Euclidean on / preset). */
  tempoSource: 'detected' | 'fixed';
}

/** An event as captured live, in milliseconds from the first chord. */
export interface RawEvent {
  startMs: number;
  lengthMs: number;
  notes: number[];
  velocity: number;
  keyPc?: number;
  label?: string;
}

export interface TempoResult {
  bpm: number;
  bars: number;
  /** Average distance of your changes from the grid, in beats (0 = perfectly on). */
  error: number;
}

const isPow2 = (n: number) => (n & (n - 1)) === 0;

/** Find tempo and bar count from chord start times (ms) and the loop length (ms). */
export function detectTempo(onsetsMs: number[], durationMs: number, min = 70, max = 170): TempoResult {
  if (durationMs <= 0) throw new Error('Loop length must be positive');
  const onsets = [...new Set(onsetsMs.filter((t) => t > 0 && t < durationMs))].sort((a, b) => a - b);
  let best: TempoResult & { score: number } | null = null;

  for (let bars = 1; bars <= 32; bars++) {
    const beat0 = durationMs / (4 * bars);
    const bpm0 = 60000 / beat0;
    if (bpm0 < min * 0.97 || bpm0 > max * 1.03) continue;

    // Snap each change to the nearest half-beat, then refine the beat length by least squares.
    const pts = onsets.map((t) => ({ t, k: Math.round((t / beat0) * 2) / 2 }));
    pts.push({ t: durationMs, k: 4 * bars });
    const num = pts.reduce((s, p) => s + p.k * p.t, 0);
    const den = pts.reduce((s, p) => s + p.k * p.k, 0);
    const beat = den > 0 ? num / den : beat0;
    const bpm = 60000 / beat;

    const errs = onsets.map((t) => {
      const x = t / beat;
      const onBeat = Math.abs(x - Math.round(x));
      const onHalf = Math.abs(x - Math.round(x * 2) / 2) + 0.08; // half-beat changes are fine, slightly less likely
      return Math.min(onBeat, onHalf);
    });
    const error = errs.length ? Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length) : 0;
    const score = error + 0.25 * Math.abs(Math.log2(bpm / 115)) + (isPow2(bars) ? 0 : 0.12);
    if (!best || score < best.score) best = { bpm, bars, error, score };
  }

  if (!best) {
    // Nothing fits the range: fall back to the closest bar count.
    const bars = Math.max(1, Math.round((durationMs / 60000) * 115 / 4));
    return { bpm: 60000 / (durationMs / (4 * bars)), bars, error: 1 };
  }
  return { bpm: Math.round(best.bpm * 10) / 10, bars: best.bars, error: best.error };
}

/**
 * Turn a recording into a take.
 * `fixedBpm`: the tempo that was running (e.g. Euclidean mode on); otherwise it's detected.
 */
export function takeFromRecording(raw: RawEvent[], durationMs: number, fixedBpm?: number): Take {
  let bpm: number;
  let bars: number;
  if (fixedBpm) {
    bpm = fixedBpm;
    bars = Math.max(1, Math.round(durationMs / ((60000 / bpm) * 4)));
  } else {
    const t = detectTempo(raw.map((e) => e.startMs), durationMs);
    bpm = t.bpm;
    bars = t.bars;
  }
  // Detected tempo: scale so the loop is exactly `bars` long, keeping the feel of what was played.
  // Fixed tempo (Live, or Euclidean on): never stretch. The grid is the host's, so times stay exact.
  const msPerBeat = fixedBpm ? 60000 / fixedBpm : durationMs / (bars * 4);
  const beats = bars * 4;
  const events = raw.filter((e) => e.startMs / msPerBeat < bars * 4).map((e) => ({
    start: e.startMs / msPerBeat,
    length: Math.max(0.05, Math.min(e.lengthMs / msPerBeat, beats - e.startMs / msPerBeat)),
    notes: e.notes.slice(),
    velocity: e.velocity,
    keyPc: e.keyPc,
    label: e.label,
  }));
  return { events, beats, bpm: fixedBpm ? bpm : Math.round((60000 / msPerBeat) * 10) / 10, tempoSource: fixedBpm ? 'fixed' : 'detected' };
}

/**
 * ×2 / ÷2: same sound, different reading. At ×2 the take spans twice as many beats at
 * twice the tempo (useful when Harmonic guessed half-time).
 */
export function reinterpret(take: Take, factor: 2 | 0.5): Take {
  const beats = take.beats * factor;
  if (beats < 4 || beats % 4 !== 0) return take; // must stay whole bars
  return {
    ...take,
    bpm: Math.round(take.bpm * factor * 10) / 10,
    beats,
    events: take.events.map((e) => ({ ...e, start: e.start * factor, length: e.length * factor })),
  };
}

/** A take made from a list of chords, each held for a number of beats (presets, generator). */
export function takeFromChords(chords: { notes: number[]; beats: number; keyPc?: number; label?: string }[], bpm: number): Take {
  let t = 0;
  const events = chords.map((c) => {
    const e = { start: t, length: c.beats, notes: c.notes, velocity: 96, keyPc: c.keyPc, label: c.label };
    t += c.beats;
    return e;
  });
  return { events, beats: Math.max(4, Math.ceil(t / 4) * 4), bpm, tempoSource: 'fixed' };
}

export function takeToMidiEvents(take: Take): NoteEvent[] {
  return take.events.map((e) => ({ notes: e.notes, start: e.start, length: e.length, velocity: e.velocity }));
}

/* ---------------- quantize & loop length ---------------- */

export type Quantize = 'off' | '1/16' | '1/8' | '1/4';
export const QUANTIZES: readonly Quantize[] = ['1/16', '1/8', '1/4', 'off'];
export const QUANTIZE_BEATS: Record<Exclude<Quantize, 'off'>, number> = { '1/16': 0.25, '1/8': 0.5, '1/4': 1 };

/**
 * Snap every chord's start and end to the grid (e.g. 1/16 = a quarter of a beat), so a
 * slightly early or late change still lands where you meant it. Chords never overlap the
 * next one afterwards, and every chord keeps at least one grid step. Non-destructive:
 * keep the original take and quantize a copy.
 */
export function quantizeTake(take: Take, q: Quantize): Take {
  if (q === 'off') return take;
  const g = QUANTIZE_BEATS[q];
  const snap = (b: number) => Math.round(b / g) * g;
  const events = take.events
    .map((e) => {
      const start = Math.min(snap(e.start), take.beats - g);
      const end = Math.max(start + g, Math.min(take.beats, snap(e.start + e.length)));
      return { ...e, start, length: end - start };
    })
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < events.length - 1; i++) {
    const next = events[i + 1];
    if (next.start > events[i].start && events[i].start + events[i].length > next.start) {
      events[i] = { ...events[i], length: next.start - events[i].start };
    }
  }
  return { ...take, events };
}

/**
 * Set the loop to a number of bars. Longer: the take repeats to fill it.
 * Shorter: the loop is cut, chords past the end are dropped.
 */
export function setLoopBars(take: Take, bars: number): Take {
  const beats = Math.max(1, Math.round(bars)) * 4;
  if (beats === take.beats) return take;
  const events: TakeEvent[] = [];
  for (let offset = 0; offset < beats; offset += take.beats) {
    for (const e of take.events) {
      const start = e.start + offset;
      if (start >= beats) continue;
      events.push({ ...e, start, length: Math.min(e.length, beats - start) });
    }
  }
  return { ...take, beats, events };
}
