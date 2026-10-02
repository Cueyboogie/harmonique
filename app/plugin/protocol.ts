/**
 * What passes between the plugin's engine (QuickJS, inside the plugin) and its screen (the web view).
 *
 *   engine ─► screen   Snapshot (JSON) whenever something changes, and a few times a second while running
 *   screen ─► engine   Call: a Controller method name + its arguments
 *
 * The screen keeps no state of its own: it draws the last snapshot and forwards every action.
 */
import type {
  ScaleId, ChordSize, Spread, Style, Pattern, Quantize, Take, Suggestion,
} from '../../engine';
import type { PlayMode, RecState } from '../controller';

export interface SoundingOut { notes: number[]; keyPc: number; source: string; label: string; ch: number }

export interface Snapshot {
  rootPc: number;
  scaleId: ScaleId;
  size: ChordSize;
  inversion: number;
  spread: Spread;
  smooth: boolean;
  style: Style;
  bpm: number;
  euclidOn: boolean;
  playMode: PlayMode;
  pattern: Pattern;
  quantize: Quantize;
  loopBars: 'auto' | number;
  playing: boolean;
  rec: RecState;
  take: Take | null;
  takeName: string;
  current: { keyPc: number; notes: number[] } | null;
  hints: Suggestion[];
  sounding: SoundingOut[];
  /** Where the loop / Euclidean cycle were (0..1, −1 = not running) when this snapshot was taken. */
  loopPos: number;
  cyclePos: number;
  host: { bpm: number; playing: boolean };
  io: { inCount: number; outCount: number; lastIn: string };
}

/** Controller methods the screen may call. */
export const CALLS = [
  'set', 'setBpm', 'setPattern', 'setPlayMode', 'setEuclid', 'setQuantize', 'setLoopLength',
  'keyDown', 'keyUp', 'pressRecord', 'play', 'stop', 'reinterpretTake', 'loadPreset', 'generate', 'panic',
] as const;
export type CallName = typeof CALLS[number];
export interface Call { m: CallName; a: unknown[] }

/** Saved with the DAW project. */
export interface SavedState {
  v: 1;
  rootPc: number; scaleId: ScaleId; size: ChordSize; inversion: number; spread: Spread; smooth: boolean; style: Style;
  bpm: number; euclidOn: boolean; playMode: PlayMode; pattern: Pattern; quantize: Quantize; loopBars: 'auto' | number;
  rawTake: Take | null; takeName: string;
}

/**
 * JSON with every non-ASCII character escaped (\u266f for ♯ …). Same value once parsed; it keeps
 * messages byte-for-byte the same length as their text, which JUCE's Linux web view bridge relies on.
 */
export const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
