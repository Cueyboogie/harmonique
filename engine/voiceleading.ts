/**
 * Voice leading (Phase 6).
 *
 *   previous chord's notes ──► try every inversion × octave (−12, 0, +12)
 *                          ──► pick the voicing that moves the least
 *                              while staying near the key you pressed
 *
 * Movement = for each new note, distance to the nearest previous note, plus for
 * each previous note, distance to the nearest new note, halved. This works even
 * when the two chords have different numbers of notes.
 *
 * Register anchoring: the key you press decides the register. Candidates must stay within
 * half an octave of the "home" voicing (the one you'd get without voice leading), and a move
 * of more than ~an octave between hands (you jumped up or down the keyboard) starts fresh
 * from home. So the sound follows your hand, and a looping progression can't creep.
 */
import type { Chord } from './chords';
import { voiceChord, maxInversion, type Spread } from './voicing';

export interface VoiceLeadOptions {
  spread?: Spread;
  trim?: boolean;
  /** Inversion to use when there is no previous chord (and the "home" register). */
  inversion?: number;
  /** How strongly to stay near home register. Default 0.5. */
  registerPull?: number;
}

export function movement(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const nearest = (x: number, set: number[]) => Math.min(...set.map((y) => Math.abs(x - y)));
  const ab = b.reduce((s, x) => s + nearest(x, a), 0);
  const ba = a.reduce((s, x) => s + nearest(x, b), 0);
  return (ab + ba) / 2;
}

const center = (n: number[]) => n.reduce((s, x) => s + x, 0) / n.length;

/** Voice `chord` so it connects smoothly to `prev`. With no `prev`, this is plain voiceChord. */
export function voiceLead(chord: Chord, rootMidi: number, prev: number[] | null, opts: VoiceLeadOptions = {}): number[] {
  const { spread = 'close', trim = true, inversion = 0, registerPull = 1 } = opts;
  const home = voiceChord(chord, rootMidi, { inversion, spread, trim });
  if (!prev || !prev.length) return home;
  const homeCenter = center(home);
  // You moved to another part of the keyboard: follow your hand, don't drag the old register along.
  if (Math.abs(center(prev) - homeCenter) > 9) return home;

  let best = home;
  let bestCost = movement(prev, home);
  for (const shift of [0, -12, 12]) {
    for (let inv = 0; inv <= maxInversion(chord); inv++) {
      const cand = voiceChord(chord, rootMidi + shift, { inversion: inv, spread, trim });
      const off = Math.abs(center(cand) - homeCenter);
      if (off > 6) continue; // stay within half an octave of where your hand is
      const cost = movement(prev, cand) + registerPull * off;
      if (cost < bestCost - 1e-9) {
        best = cand;
        bestCost = cost;
      }
    }
  }
  return best;
}
