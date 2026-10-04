/**
 * Human feel: gives every note of a chord its own loudness, the way a player's hand does.
 *
 *   VOICING   the hand's shape. The top note sings a little louder, the bass stays solid,
 *             inner notes sit back. Predictable: the same chord shape always leans the same way.
 *   DYNAMICS  small random differences from note to note (no two fingers land exactly alike).
 *   DRIFT     the whole chord gets a bit louder or softer from hit to hit, and it wanders slowly
 *             instead of jumping: each hit stays close to the last (a mean-reverting random walk).
 *             Players' variations are correlated over time like this, which is why plain
 *             per-hit randomness sounds jittery rather than human.
 *
 * AMOUNT scales all three. Each detail control is 0..1 with 0.5 = the standard amount, so with
 * AMOUNT on its own the defaults give a natural "pianist" feel, and the details can push past it.
 * The played velocity stays the centre: a MIDI keyboard's touch is shaped, never replaced.
 */

export interface HumanFeel {
  on: boolean;
  /** 0..1, the one knob. */
  amount: number;
  /** 0..1 each, 0.5 = standard. */
  voicing: number;
  dynamics: number;
  drift: number;
}

export const HUMAN_DEFAULT: HumanFeel = { on: false, amount: 0.5, voicing: 0.5, dynamics: 0.5, drift: 0.5 };

/** At full strength (amount 1, detail 0.5): how much each part moves the velocity. */
const TOP_BOOST = 0.15; // top note +15 %
const BASS_BOOST = 0.06; // bass +6 %
const INNER_CUT = 0.15; // inner notes −15 %
const JITTER_SD = 7; // velocity units, per note
const DRIFT_DEPTH = 0.1; // ±10 % (one standard deviation of the walk)
/** Walk memory: each hit keeps 80 % of the last one's lean; the rest is new. Stationary spread = 1. */
const DRIFT_KEEP = 0.8;
const DRIFT_STEP = Math.sqrt(1 - DRIFT_KEEP * DRIFT_KEEP);

/** Strength of one part: AMOUNT × detail, where detail 0.5 → ×1 and 1 → ×2. */
const strength = (f: HumanFeel, detail: number) => (f.on ? clamp01(f.amount) * clamp01(detail) * 2 : 0);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Standard normal from a uniform source (Box–Muller). */
function gauss(rand: () => number) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export class Humanizer {
  /** The drift walk's current lean, roughly −2..2. */
  private walk = 0;
  constructor(private rand: () => number = Math.random) {}

  /** One velocity per note (same order as `notes`), centred on `velocity`. Off: all equal to it. */
  velocities(notes: number[], velocity: number, feel: HumanFeel): number[] {
    if (!feel.on || !notes.length) return notes.map(() => velocity);
    const sv = strength(feel, feel.voicing);
    const sd = strength(feel, feel.dynamics);
    const sw = strength(feel, feel.drift);

    this.walk = DRIFT_KEEP * this.walk + DRIFT_STEP * gauss(this.rand);
    const lean = 1 + DRIFT_DEPTH * sw * Math.max(-2.5, Math.min(2.5, this.walk));

    const lo = Math.min(...notes);
    const hi = Math.max(...notes);
    const raw = notes.map((n) => {
      let shape = 1;
      if (notes.length > 1) {
        if (n === hi) shape = 1 + TOP_BOOST * sv;
        else if (n === lo) shape = 1 + BASS_BOOST * sv;
        else shape = 1 - INNER_CUT * sv;
      }
      return velocity * lean * shape + JITTER_SD * sd * gauss(this.rand);
    });
    // A loud hit keeps its shape: if the top would pass 127, lower the whole chord rather than flatten it.
    const over = Math.max(0, Math.max(...raw) - 127);
    return raw.map((v) => Math.max(1, Math.min(127, Math.round(v - over))));
  }

  /** Forget the drift (e.g. when the feel is switched on again). */
  reset() { this.walk = 0; }
}
