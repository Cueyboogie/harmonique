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
  reinterpret, takeToMidiEvents, writeMidi, noteLabel,
  type Scale, type ChordSlot, type ScaleId, type ChordSize, type Spread, type Suggestion,
  type Pattern, type Take, type RawEvent, type Style, type Preset,
} from '../engine';
import { MidiBridge } from '../explorer/midi';
import { Synth } from './synth';

export type RecState = 'idle' | 'armed' | 'recording';
type Source = 'live' | 'euclid' | 'loop';

interface Out { notes: number[]; keyPc: number; source: Source; label: string }

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
  pattern: Pattern = { ...GROOVES[2].pattern };

  /* ---------- derived ---------- */
  scale!: Scale;
  map!: ChordSlot[];

  /* ---------- performance ---------- */
  current: { slot: ChordSlot; notes: number[]; keyPc: number } | null = null;
  hints: Suggestion[] = [];
  /** What is sounding right now, for lighting the UI. */
  sounding = new Map<string, Out>();
  take: Take | null = null;
  takeName = '';
  playing = false;
  rec: RecState = 'idle';

  readonly midi: MidiBridge;
  readonly synth = new Synth();

  private held = new Map<string, { keyPc: number; notes: number[]; velocity: number; label: string }>();
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

  constructor() {
    this.midi = new MidiBridge({
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

  setBpm(bpm: number) {
    const next = Math.max(40, Math.min(240, Math.round(bpm * 10) / 10));
    if (this.running) {
      const now = performance.now();
      const beat = this.beatAt(now);
      this.bpm = next;
      this.transportStart = now - (beat * 60000) / next; // keep the beat position continuous
    } else this.bpm = next;
    if (this.take) this.take = { ...this.take, bpm: this.bpm };
    this.notify();
  }

  /* ================= live playing ================= */
  keyDown(src: string, keyMidi: number, velocity = 100) {
    this.synth.unlock();
    const hit = chordForKey(keyMidi, this.scale, this.map);
    const notes = voiceLead(hit.slot.chord, hit.rootMidi, this.smooth ? this.lastNotes : null, {
      inversion: this.inversion, spread: this.spread,
    });
    this.lastNotes = notes;
    const keyPc = hit.slot.keyPc;
    this.current = { slot: hit.slot, notes, keyPc };
    this.hints = suggestNext(this.scale, this.map, keyPc, this.style);
    this.held.delete(src); // re-insert so it becomes the most recent
    this.held.set(src, { keyPc, notes, velocity, label: hit.slot.chord.symbol });
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
    let last: { keyPc: number; notes: number[]; velocity: number; label: string } | undefined;
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

  /* ================= recording ================= */
  pressRecord() {
    if (this.rec === 'idle') {
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
    const take = takeFromRecording(events, now - this.recT0, this.euclidOn ? this.bpm : undefined);
    this.take = take;
    this.takeName = 'Your take';
    this.bpm = take.bpm;
    this.play(); // looper-style: the loop starts right away
  }

  /** ×2 / ÷2: fix a double- or half-time guess without changing the sound. */
  reinterpretTake(factor: 2 | 0.5) {
    if (!this.take) return;
    this.take = reinterpret(this.take, factor);
    const wasPlaying = this.playing;
    if (wasPlaying) this.stop();
    this.bpm = this.take.bpm;
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
    this.take = takeFromChords(chords, this.bpm);
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
  clearTake() { this.stop(); this.take = null; this.takeName = ''; this.notify(); }

  /** 0..1 position in the loop, for the playhead. */
  loopPosition(): number {
    if (!this.playing || !this.take || !this.running) return -1;
    const b = this.beatAt(performance.now());
    return b < 0 ? 0 : (b % this.take.beats) / this.take.beats;
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
      filename: 'harmonic-' + name.toLowerCase().replace(/[^a-z0-9#♭♯]+/g, '-').replace(/^-|-$/g, '') + '.mid',
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
  private emitOn(id: string, notes: number[], velocity: number, keyPc: number, label: string, source: Source, at?: number) {
    if (this.active.has(id)) this.emitOff(id, at);
    const out: Out = { notes, keyPc, source, label };
    this.active.set(id, out);
    this.synth.on(id, notes, velocity, at);
    for (const n of notes) this.midi.send(n, velocity, 0, at);
    const t = at ?? performance.now();
    if (source !== 'loop') {
      if (this.rec === 'armed') { this.rec = 'recording'; this.recT0 = t; this.notify(); }
      if (this.rec === 'recording') this.recOpen.set(id, { startMs: t - this.recT0, lengthMs: 0, notes, velocity, keyPc, label });
    }
    this.later(t, () => { this.sounding.set(id, out); if (source === 'loop') this.showLoopChord(out); this.notify(); });
  }

  private emitOff(id: string, at?: number) {
    const out = this.active.get(id);
    if (!out) return;
    this.active.delete(id);
    this.synth.off(id, at);
    for (const n of out.notes) this.midi.release(n, 0, at);
    const t = at ?? performance.now();
    const open = this.recOpen.get(id);
    if (open) {
      open.lengthMs = t - this.recT0 - open.startMs;
      this.recEvents.push(open);
      this.recOpen.delete(id);
    }
    this.later(t, () => { this.sounding.delete(id); this.notify(); });
  }

  private showLoopChord(out: Out) {
    if (this.held.size) return; // live playing wins
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
    this.transportStart = at;
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
      for (let c = Math.floor(b0 / L); c <= Math.floor(b1 / L); c++) {
        this.take.events.forEach((e, i) => {
          const b = c * L + e.start;
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
            this.emitOn(id, chord.notes, chord.velocity, chord.keyPc, chord.label, 'euclid', tOn);
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
