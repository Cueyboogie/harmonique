/**
 * Harmonic controller: every behaviour of the app, with no knowledge of the screen.
 * A layout (the H "Orbit on cream" view, or any future one) reads its public state,
 * calls its actions, and re-renders when it notifies.
 *
 *   keys (Arturia / mouse / computer)  ─┐
 *                                        ├─► chord map + voice leading ─► OUTPUT ─► synth
 *   Euclidean mode (live, on the grid) ─┤                                        ├─► MIDI out (+ MIDI Clock)
 *   loop playback of a take ────────────┘                                        └─► recorder (captures what comes out)
 *
 * Timing: a look-ahead scheduler (every 25 ms, 120 ms ahead) stamps every MIDI
 * message and synth note with an exact time, so the clock and the loop don't wobble.
 */
import {
  scaleFromPitchClass, buildChordMap, chordForKey, voiceLead, suggestNext, generateProgression,
  resolvePreset, PRESETS, GROOVES, patternHits, cycleBeats, takeFromRecording, takeFromChords,
  reinterpret, takeToMidiEvents, writeMidi, noteLabel, quantizeTake, setLoopBars, snapToScale, scaleNoteLabel,
  type Scale, type ChordSlot, type ScaleId, type ChordSize, type Spread, type Suggestion,
  type Pattern, type Take, type RawEvent, type Style, type Preset, type Quantize,
} from '../engine';
import { MidiBridge, type MidiIO, type MidiCallbacks } from '../explorer/midi';
import { Synth } from './synth';

export type RecState = 'idle' | 'armed' | 'recording';
export type PlayMode = 'chords' | 'notes';
/** MIDI channels (0-based): chords on Ch 1, single notes on Ch 2, so Ableton tracks can pick one. */
export const CHORD_CH = 0;
export const NOTE_CH = 1;
type Source = 'live' | 'euclid' | 'loop';

interface Out { notes: number[]; keyPc: number; source: Source; label: string; ch: number }
interface Held { keyPc: number; notes: number[]; velocity: number; label: string; ch: number }

const LOOKAHEAD_MS = 120;
const TICK_MS = 25;

export class Controller {
  /* ---------- settings ---------- */
  rootPc = 0;
  scaleId: ScaleId = 'ionian';
  size: ChordSize = '7th';
  inversion = 0;
  spread: Spread = 'close';
  smooth = true;
  style: Style = 'pop';
  bpm = 118;
  clockOut = true;
  euclidOn = false;
  /** CHORDS: each key plays a chord. NOTES: each key plays one note snapped to the scale. */
  playMode: PlayMode = 'chords';
  pattern: Pattern = { ...GROOVES[2].pattern };

  /* ---------- derived ---------- */
  scale!: Scale;
  map!: ChordSlot[];

  /* ---------- performance ---------- */
  current: { slot: ChordSlot; notes: number[]; keyPc: number } | null = null;
  hints: Suggestion[] = [];
  /** What is sounding right now, for lighting the UI. */
  sounding = new Map<string, Out>();
  /** The loop that plays: derived from rawTake + quantize + loopBars. */
  take: Take | null = null;
  /** Exactly what was captured (never modified by quantize / length). */
  rawTake: Take | null = null;
  takeName = '';
  /** Snap recorded takes to this grid. Default 1/16. */
  quantize: Quantize = '1/16';
  /** Loop length: 'auto' = as recorded, or a fixed number of bars. */
  loopBars: 'auto' | number = 'auto';
  playing = false;
  rec: RecState = 'idle';

  readonly midi: MidiIO;
  /** The host owns the tempo: recordings keep it instead of detecting one. (Also true whenever Live is playing.) */
  tempoLocked = false;
  /** Called when Harmonique changes the tempo itself (detected from a take, ÷2 ×2, typed), so a host can follow. */
  onTempo: ((bpm: number) => void) | null = null;
  /** Host timeline (Live): performance.now() time of the song's beat 0 while the host plays, else null. */
  private hostZero: number | null = null;
  /** Host beat where the loop's beat 0 sits (the bar you started recording on), so it replays where you played it. */
  private loopOffset = 0;
  readonly synth = new Synth();

  private held = new Map<string, Held>();
  private lastNotes: number[] | null = null;
  private active = new Map<string, Out>(); // scheduled/playing outputs by id
  private running = false;
  private transportStart = 0;
  private scheduledTo = 0;
  private timer = 0;
  private recT0 = 0;
  private recOpen = new Map<string, RawEvent>();
  private recEvents: RawEvent[] = [];
  private seq = 0;
  private listeners = new Set<() => void>();

  constructor(makeMidi: (cb: MidiCallbacks) => MidiIO = (cb) => new MidiBridge(cb)) {
    this.midi = makeMidi({
      noteOn: (note, vel) => this.keyDown(`midi:${note}`, note, vel),
      noteOff: (note) => this.keyUp(`midi:${note}`),
      devicesChanged: () => this.notify(),
    });
    this.recompute();
  }

  /* ================= subscription ================= */
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private notify() { this.listeners.forEach((f) => f()); }

  /* ================= settings ================= */
  private recompute() {
    this.scale = scaleFromPitchClass(this.rootPc, this.scaleId);
    this.map = buildChordMap(this.scale, this.size);
    if (this.current) {
      this.current = { ...this.current, slot: this.map[this.current.keyPc] };
      this.hints = suggestNext(this.scale, this.map, this.current.keyPc, this.style);
    }
  }
  set<K extends 'rootPc' | 'scaleId' | 'size' | 'inversion' | 'spread' | 'smooth' | 'style' | 'clockOut'>(key: K, value: this[K]) {
    this[key] = value;
    if (key !== 'clockOut') this.lastNotes = null;
    this.recompute();
    this.notify();
  }
  get keyName() { return `${noteLabel(this.scale.root)} ${this.scale.def.name}`; }

  setBpm(bpm: number, fromHost = false) {
    const next = Math.max(40, Math.min(240, Math.round(bpm * 10) / 10));
    if (this.running && this.hostZero === null) {
      const now = performance.now();
      const beat = this.beatAt(now);
      this.bpm = next;
      this.transportStart = now - (beat * 60000) / next; // keep the beat position continuous
    } else this.bpm = next;
    if (this.rawTake) { this.rawTake = { ...this.rawTake, bpm: this.bpm }; this.derive(); }
    if (!fromHost) this.onTempo?.(this.bpm);
    this.notify();
  }

  /* ================= host clock (Live) ================= */
  /**
   * Lock to the host's song position: its beat 0 happened at `zero` (performance.now() ms).
   * Loop bars and Euclidean steps then land on Live's grid, and recordings are measured from it.
   */
  setHostClock(zero: number | null) {
    this.hostZero = zero;
    if (zero !== null && this.running) this.transportStart = zero;
  }
  get hostLocked() { return this.hostZero !== null; }

  /* ================= live playing ================= */
  keyDown(src: string, keyMidi: number, velocity = 100) {
    this.synth.unlock();
    if (this.playMode === 'notes') {
      const note = snapToScale(keyMidi, this.scale);
      const keyPc = ((keyMidi % 12) + 12) % 12;
      const label = scaleNoteLabel(note, this.scale);
      this.held.delete(src);
      this.held.set(src, { keyPc, notes: [note], velocity, label, ch: NOTE_CH });
      if (this.euclidOn) this.ensureTransport();
      else this.emitOn(`live:${src}`, [note], velocity, keyPc, label, 'live', undefined, NOTE_CH);
      this.notify();
      return;
    }
    const hit = chordForKey(keyMidi, this.scale, this.map);
    const notes = voiceLead(hit.slot.chord, hit.rootMidi, this.smooth ? this.lastNotes : null, {
      inversion: this.inversion, spread: this.spread,
    });
    this.lastNotes = notes;
    const keyPc = hit.slot.keyPc;
    this.current = { slot: hit.slot, notes, keyPc };
    this.hints = suggestNext(this.scale, this.map, keyPc, this.style);
    this.held.delete(src); // re-insert so it becomes the most recent
    this.held.set(src, { keyPc, notes, velocity, label: hit.slot.chord.symbol, ch: CHORD_CH });
    if (this.euclidOn) this.ensureTransport();
    else this.emitOn(`live:${src}`, notes, velocity, keyPc, hit.slot.chord.symbol, 'live');
    this.notify();
  }

  keyUp(src: string) {
    if (!this.held.delete(src)) return;
    if (!this.euclidOn) this.emitOff(`live:${src}`);
    this.notify();
  }

  /** The chord Euclidean mode plays: the most recently pressed key still held. */
  private get euclidChord() {
    let last: Held | undefined;
    for (const h of this.held.values()) last = h;
    return last;
  }

  /* ================= Euclidean ================= */
  setEuclid(on: boolean) {
    if (on === this.euclidOn) return;
    // Release live notes so nothing hangs when switching modes.
    for (const src of this.held.keys()) this.emitOff(`live:${src}`);
    this.euclidOn = on;
    if (on) this.ensureTransport();
    else {
      this.stopOutputs('euclid');
      if (!this.playing) this.stopTransport();
    }
    this.notify();
  }
  setPattern(p: Pattern) { this.pattern = p; this.notify(); }

  /* ================= chords / notes ================= */
  setPlayMode(m: PlayMode) {
    if (m === this.playMode) return;
    for (const src of this.held.keys()) this.emitOff(`live:${src}`);
    this.stopOutputs('euclid');
    this.held.clear();
    if (this.rec !== 'idle') { if (this.rec === 'recording') this.finishRecording(); else this.rec = 'idle'; }
    this.playMode = m;
    this.notify();
  }

  /* ================= recording ================= */
  pressRecord() {
    if (this.rec === 'idle') {
      if (this.playMode === 'notes') return; // the loop records chords
      this.stop();
      this.rec = 'armed';
      this.recEvents = [];
      this.recOpen.clear();
    } else if (this.rec === 'armed') {
      this.rec = 'idle'; // nothing played yet: cancel
    } else {
      this.finishRecording();
    }
    this.notify();
  }

  private finishRecording() {
    const now = performance.now();
    for (const [, e] of this.recOpen) {
      e.lengthMs = now - this.recT0 - e.startMs;
      this.recEvents.push(e);
    }
    this.recOpen.clear();
    this.rec = 'idle';
    const events = this.recEvents.sort((a, b) => a.startMs - b.startMs);
    if (!events.length) return;
    const fixed = this.euclidOn || this.tempoLocked || this.hostZero !== null;
    let take = takeFromRecording(events, now - this.recT0, fixed ? this.bpm : undefined);
    if (!fixed) take = { ...take, bpm: Math.round(take.bpm) }; // a clean whole-number tempo for the DAW (≤0.5% change)
    this.loopOffset = this.hostZero !== null ? Math.round(((this.recT0 - this.hostZero) * this.bpm) / 60000) : 0;
    this.rawTake = take;
    this.loopBars = 'auto';
    this.derive();
    this.takeName = 'Your take';
    if (take.bpm !== this.bpm) { this.bpm = take.bpm; this.onTempo?.(this.bpm); }
    this.play(); // looper-style: the loop starts right away
  }

  /** ×2 / ÷2: fix a double- or half-time guess without changing the sound. */
  reinterpretTake(factor: 2 | 0.5) {
    if (!this.rawTake) return;
    this.rawTake = reinterpret(this.rawTake, factor);
    this.loopBars = 'auto';
    this.derive();
    const wasPlaying = this.playing;
    if (wasPlaying) this.stop();
    this.bpm = this.rawTake.bpm;
    this.onTempo?.(this.bpm);
    if (wasPlaying) this.play();
    this.notify();
  }

  /* ================= ideas: presets & generator ================= */
  loadPreset(p: Preset) {
    this.scaleId = p.scale;
    this.recompute();
    this.loadKeys(resolvePreset(p, this.map), p.name);
  }
  generate(opts: { length?: number; tension?: number; color?: number } = {}) {
    this.seq += 1;
    const g = generateProgression(this.scale, this.map, { ...opts, style: this.style, seed: Date.now() % 100000 + this.seq });
    this.loadKeys(g.keys, `Generated (${this.style === 'pop' ? 'Pop' : 'Bach'})`);
  }
  private loadKeys(keys: number[], name: string) {
    let prev: number[] | null = null;
    const chords = keys.map((pc) => {
      const hit = chordForKey(60 + pc, this.scale, this.map);
      prev = voiceLead(hit.slot.chord, hit.rootMidi, this.smooth ? prev : null, { inversion: this.inversion, spread: this.spread });
      return { notes: prev, beats: 4, keyPc: pc, label: hit.slot.chord.symbol };
    });
    this.stop();
    this.loopOffset = 0;
    this.rawTake = takeFromChords(chords, this.bpm);
    this.loopBars = 'auto';
    this.derive();
    this.takeName = name;
    this.play();
  }

  /* ================= loop transport ================= */
  play() {
    if (!this.take) return;
    this.synth.unlock();
    this.playing = true;
    this.restartTransport();
    this.notify();
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.stopOutputs('loop');
    if (!this.euclidOn) this.stopTransport();
    this.notify();
  }
  clearTake() { this.stop(); this.take = this.rawTake = null; this.takeName = ''; this.notify(); }

  /** Rebuild the playing loop from the raw take (quantize + length). Keeps playing seamlessly. */
  private derive() {
    if (!this.rawTake) { this.take = null; return; }
    let t = quantizeTake(this.rawTake, this.quantize);
    if (this.loopBars !== 'auto') t = setLoopBars(t, this.loopBars);
    this.take = t;
  }
  setQuantize(q: Quantize) { this.quantize = q; this.derive(); this.notify(); }
  setLoopLength(bars: 'auto' | number) { this.loopBars = bars; this.derive(); this.notify(); }
  /** Bars the loop has right now. */
  get bars() { return this.take ? this.take.beats / 4 : 0; }

  /** 0..1 position in the loop, for the playhead. */
  loopPosition(): number {
    if (!this.playing || !this.take || !this.running) return -1;
    const L = this.take.beats;
    const b = this.beatAt(performance.now()) - this.loopOffset;
    return (((b % L) + L) % L) / L;
  }
  /** 0..1 position in the Euclidean cycle, for the ring's hand. */
  cyclePosition(): number {
    if (!this.running) return -1;
    const b = this.beatAt(performance.now());
    const c = cycleBeats(this.pattern);
    return b < 0 ? 0 : (b % c) / c;
  }

  midiFile(): { bytes: Uint8Array<ArrayBuffer>; filename: string } | null {
    if (!this.take) return null;
    const name = `${this.keyName} ${this.takeName} ${Math.round(this.bpm)}bpm`;
    return {
      bytes: writeMidi(takeToMidiEvents(this.take), this.take.bpm, name),
      filename: 'harmonique-' + name.toLowerCase().replace(/[^a-z0-9#♭♯]+/g, '-').replace(/^-|-$/g, '') + '.mid',
    };
  }

  panic() {
    this.stop();
    this.setEuclid(false);
    for (const id of [...this.active.keys()]) this.emitOff(id);
    this.held.clear();
    this.synth.allOff();
    this.midi.panic();
    this.notify();
  }

  /* ================= output funnel ================= */
  private emitOn(id: string, notes: number[], velocity: number, keyPc: number, label: string, source: Source, at?: number, ch = CHORD_CH) {
    if (this.active.has(id)) this.emitOff(id, at);
    const out: Out = { notes, keyPc, source, label, ch };
    this.active.set(id, out);
    this.synth.on(id, notes, velocity, at);
    for (const n of notes) this.midi.send(n, velocity, ch, at);
    const t = at ?? performance.now();
    if (source !== 'loop' && ch === CHORD_CH) { // the loop records chords; notes go straight to Ableton
      if (this.rec === 'armed') { this.rec = 'recording'; this.recT0 = this.recordAnchor(t); this.notify(); }
      if (this.rec === 'recording') this.recOpen.set(id, { startMs: Math.max(0, t - this.recT0), lengthMs: 0, notes, velocity, keyPc, label });
    }
    this.later(t, () => { this.sounding.set(id, out); if (source === 'loop') this.showLoopChord(out); this.notify(); });
  }

  private emitOff(id: string, at?: number) {
    const out = this.active.get(id);
    if (!out) return;
    this.active.delete(id);
    this.synth.off(id, at);
    for (const n of out.notes) this.midi.release(n, out.ch, at);
    const t = at ?? performance.now();
    const open = this.recOpen.get(id);
    if (open) {
      open.lengthMs = t - this.recT0 - open.startMs;
      this.recEvents.push(open);
      this.recOpen.delete(id);
    }
    this.later(t, () => { this.sounding.delete(id); this.notify(); });
  }

  /** Where a recording's beat 0 is: your first chord, or with Live playing, the bar line nearest to it. */
  private recordAnchor(t: number) {
    if (this.hostZero === null) return t;
    const barMs = (4 * 60000) / this.bpm;
    return this.hostZero + Math.round((t - this.hostZero) / barMs) * barMs;
  }

  private showLoopChord(out: Out) {
    if ([...this.held.values()].some((h) => h.ch === CHORD_CH)) return; // live chords win
    const slot = this.map[out.keyPc];
    this.current = { slot, notes: out.notes, keyPc: out.keyPc };
    this.hints = suggestNext(this.scale, this.map, out.keyPc, this.style);
  }

  private stopOutputs(source: Source) {
    for (const [id, o] of [...this.active]) if (o.source === source) this.emitOff(id);
  }

  private later(t: number, fn: () => void) {
    const d = t - performance.now();
    if (d <= 1) fn();
    else setTimeout(fn, d);
  }

  /* ================= scheduler ================= */
  private beatAt(t: number) { return ((t - this.transportStart) * this.bpm) / 60000; }
  private timeAt(beat: number) { return this.transportStart + (beat * 60000) / this.bpm; }

  private ensureTransport() { if (!this.running) this.startTransport(performance.now() + 30); }
  private restartTransport() {
    this.stopOutputs('loop');
    this.stopOutputs('euclid');
    if (this.running) this.stopTransport(false);
    this.startTransport(performance.now() + 30);
  }

  private startTransport(at: number) {
    this.running = true;
    this.transportStart = this.hostZero ?? at; // on Live's grid when Live is playing
    this.scheduledTo = at;
    if (this.clockOut) this.midi.raw([0xfa], at); // MIDI Start
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private stopTransport(sendStop = true) {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    if (this.clockOut && sendStop) this.midi.raw([0xfc]); // MIDI Stop
  }

  private tick() {
    if (!this.running) return;
    const to = performance.now() + LOOKAHEAD_MS;
    const from = this.scheduledTo;
    if (to <= from) return;
    const b0 = this.beatAt(from);
    const b1 = this.beatAt(to);
    const jobs: { t: number; run: () => void; order: number }[] = [];

    if (this.clockOut) {
      for (let i = Math.ceil(b0 * 24); i < b1 * 24; i++) {
        const t = this.timeAt(i / 24);
        jobs.push({ t, order: 0, run: () => this.midi.raw([0xf8], t) });
      }
    }

    if (this.playing && this.take) {
      const L = this.take.beats;
      const off = this.loopOffset;
      for (let c = Math.floor((b0 - off) / L); c <= Math.floor((b1 - off) / L); c++) {
        this.take.events.forEach((e, i) => {
          const b = c * L + e.start + off;
          if (b < b0 || b >= b1 || b < 0) return;
          const id = `loop:${c}:${i}`;
          const tOn = this.timeAt(b);
          const tOff = this.timeAt(b + e.length);
          jobs.push({ t: tOn, order: 2, run: () => {
            this.emitOn(id, e.notes, e.velocity, e.keyPc ?? 0, e.label ?? '', 'loop', tOn);
            this.emitOffAt(id, tOff);
          } });
        });
      }
    }

    if (this.euclidOn) {
      const C = cycleBeats(this.pattern);
      const hits = patternHits(this.pattern);
      for (let c = Math.floor(b0 / C); c <= Math.floor(b1 / C); c++) {
        hits.forEach((h, j) => {
          const b = c * C + h.start;
          if (b < b0 || b >= b1 || b < 0) return;
          const tOn = this.timeAt(b);
          const tOff = this.timeAt(b + h.length);
          const id = `eu:${c}:${j}`;
          jobs.push({ t: tOn, order: 2, run: () => {
            const chord = this.euclidChord;
            if (!chord) return;
            this.emitOn(id, chord.notes, chord.velocity, chord.keyPc, chord.label, 'euclid', tOn, chord.ch);
            this.emitOffAt(id, tOff);
          } });
        });
      }
    }

    jobs.sort((a, b) => a.t - b.t || a.order - b.order).forEach((j) => j.run());
    this.scheduledTo = to;
  }

  /** Note-offs far in the future are handed over just before they're due, keeping MIDI messages in time order. */
  private emitOffAt(id: string, t: number) {
    const due = t - performance.now() - LOOKAHEAD_MS;
    if (due <= 0) this.emitOff(id, t);
    else setTimeout(() => this.emitOff(id, Math.max(t, performance.now())), due);
  }
}

export { PRESETS, GROOVES };
