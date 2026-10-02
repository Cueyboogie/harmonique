/**
 * Harmonique's engine inside the AU / VST3 plugin. Runs in QuickJS on the plugin's own thread,
 * so it keeps playing while the plugin window is closed; the window (app/plugin/ui.ts) is a remote screen.
 *
 *   host → engine:  harmonique.noteIn(pitch, velocity)       notes from the track
 *                   harmonique.host(bpm, playing, zeroMs)     the project's tempo / transport / beat-0 time
 *                   harmonique.call(json)                    an action from the screen (protocol.ts)
 *                   harmonique.pump()                        every ~2 ms: runs due timers (the scheduler)
 *   engine → host:  __native.midi(status, d1, d2, atMs)      MIDI out, stamped with the host's clock
 *                   harmonique.poll() → snapshot JSON for the screen ('' if nothing changed)
 *                   harmonique.saveState() / loadState(json) the plugin state saved with the project
 *
 * The plugin can't change the project's tempo: while the project plays, its tempo wins; while it's stopped,
 * your playing can still set a tempo, and the screen says "SET PROJECT TO …".
 */
import { native, runTimers } from './timers';
import { Controller, PRESETS } from '../controller';
import type { MidiIO, MidiCallbacks, MidiPort } from '../../explorer/midi';
import { CALLS, asciiJson, type Call, type Snapshot, type SavedState } from './protocol';

class HostBridge implements MidiIO {
  status: MidiIO['status'] = 'ready';
  inputId = 'host';
  outputId = 'host';
  readonly outputName = 'HOST';
  readonly hasOutput = true;
  private sounding = new Map<number, number>();
  inCount = 0;
  outCount = 0;
  lastIn = '';

  constructor(readonly cb: MidiCallbacks) {}
  async init() { /* always connected */ }
  inputs(): MidiPort[] { return []; }
  outputs(): MidiPort[] { return []; }
  setInput() { /* the track's input */ }
  setOutput() { /* the plugin's output */ }
  isLoopInput() { return false; }

  noteIn(note: number, vel: number) {
    this.inCount++;
    this.lastIn = `${note}/${vel}`;
    if (vel > 0) this.cb.noteOn(note, vel, 0); else this.cb.noteOff(note, 0);
  }
  send(note: number, velocity: number, ch = 0, at?: number) {
    const k = ch * 128 + note;
    const n = this.sounding.get(k) ?? 0;
    this.sounding.set(k, n + 1);
    if (n === 0) this.raw([0x90 | ch, note, velocity], at);
  }
  release(note: number, ch = 0, at?: number) {
    const k = ch * 128 + note;
    const n = this.sounding.get(k) ?? 0;
    if (n <= 1) { this.sounding.delete(k); this.raw([0x80 | ch, note, 0], at); }
    else this.sounding.set(k, n - 1);
  }
  raw(data: number[], at?: number) {
    if (data.length !== 3) return; // clock / start / stop: the host is the clock
    this.outCount++;
    native.midi(data[0], data[1], data[2], at ?? native.now()); // the plugin places it on the right sample
  }
  panic() {
    for (const k of this.sounding.keys()) this.raw([0x80 | Math.floor(k / 128), k % 128, 0]);
    this.sounding.clear();
    for (let ch = 0; ch < 2; ch++) { this.raw([0xb0 | ch, 123, 0]); this.raw([0xb0 | ch, 64, 0]); }
  }
}

let bridge!: HostBridge;
const c = new Controller((cb) => (bridge = new HostBridge(cb)));
c.clockOut = false;            // the host is the clock
c.synth.enabled = false;       // the track's instrument makes the sound
c.synth.unlock = () => {};     // no Web Audio in here

let dirty = true;
let lastSent = 0;
c.subscribe(() => { dirty = true; });

/* ---------------- host transport ---------------- */
const host = { bpm: c.bpm, playing: false, zero: NaN };
let pendingPlay = false;
const round = (bpm: number) => Math.round(bpm * 10) / 10;

function onHost(bpm: number, playing: boolean, zero: number) {
  const tempoMoved = bpm > 0 && Math.abs(bpm - host.bpm) > 0.001;
  if (bpm > 0) host.bpm = bpm;
  if (playing && !host.playing) { pendingPlay = true; host.zero = NaN; dirty = true; }
  if (!playing && host.playing) {
    pendingPlay = false;
    host.zero = NaN;
    c.setHostClock(null);
    c.stop();
    dirty = true;
  }
  host.playing = playing;
  // The project's tempo wins whenever it changes, and always while the project plays.
  if (tempoMoved || (playing && round(host.bpm) !== c.bpm)) c.setBpm(host.bpm, true);
  if (playing && Number.isFinite(zero)) {
    if (!(Math.abs(zero - host.zero) < 0.5)) { host.zero = zero; c.setHostClock(zero); }
    if (pendingPlay) { pendingPlay = false; if (c.take) c.play(); }
  }
}

/* ---------------- snapshot for the screen ---------------- */
function snapshot(): Snapshot {
  return {
    rootPc: c.rootPc, scaleId: c.scaleId, size: c.size, inversion: c.inversion, spread: c.spread,
    smooth: c.smooth, style: c.style, bpm: c.bpm, euclidOn: c.euclidOn, playMode: c.playMode,
    pattern: c.pattern, quantize: c.quantize, loopBars: c.loopBars, playing: c.playing, rec: c.rec,
    take: c.take, takeName: c.takeName,
    current: c.current ? { keyPc: c.current.keyPc, notes: c.current.notes } : null,
    hints: c.hints,
    sounding: [...c.sounding.values()],
    loopPos: c.loopPosition(), cyclePos: c.cyclePosition(),
    host: { bpm: host.bpm, playing: host.playing },
    io: { inCount: bridge.inCount, outCount: bridge.outCount, lastIn: bridge.lastIn },
  };
}

function saveState(): SavedState {
  return {
    v: 1, rootPc: c.rootPc, scaleId: c.scaleId, size: c.size, inversion: c.inversion, spread: c.spread,
    smooth: c.smooth, style: c.style, bpm: c.bpm, euclidOn: c.euclidOn, playMode: c.playMode,
    pattern: c.pattern, quantize: c.quantize, loopBars: c.loopBars, rawTake: c.rawTake, takeName: c.takeName,
  };
}

function loadState(s: SavedState) {
  if (!s || s.v !== 1) return;
  c.panic();
  c.set('rootPc', s.rootPc);
  c.set('scaleId', s.scaleId);
  c.set('size', s.size);
  c.set('inversion', s.inversion);
  c.set('spread', s.spread);
  c.set('smooth', s.smooth);
  c.set('style', s.style);
  c.setPlayMode(s.playMode);
  c.setPattern(s.pattern);
  c.setBpm(s.bpm, true);
  c.rawTake = s.rawTake;
  c.takeName = s.rawTake ? s.takeName : '';
  c.setQuantize(s.quantize);  // rebuilds the loop from rawTake
  c.setLoopLength(s.loopBars);
  c.setEuclid(s.euclidOn);
}

function call({ m, a }: Call) {
  if (!CALLS.includes(m)) return;
  const args = m === 'loadPreset' ? [PRESETS[Number(a[0])]] : a;
  if (m === 'loadPreset' && !args[0]) return;
  (c as unknown as Record<string, (...x: unknown[]) => unknown>)[m].apply(c, args);
}

const safe = <A extends unknown[]>(name: string, fn: (...a: A) => unknown) => (...a: A) => {
  try { return fn(...a); } catch (e) { native.log(`${name}: ${String(e)}${e instanceof Error && e.stack ? `\n${e.stack}` : ''}`); return ''; }
};

(globalThis as unknown as { harmonique: unknown }).harmonique = {
  pump: safe('pump', () => runTimers()),
  noteIn: safe('noteIn', (note: number, vel: number) => bridge.noteIn(note, vel)),
  host: safe('host', (bpm: number, playing: boolean, zero: number) => onHost(bpm, playing, zero)),
  call: safe('call', (json: string) => call(JSON.parse(json) as Call)),
  /** Snapshot JSON when something changed (or every 500 ms while the loop / Euclidean runs), else ''. */
  poll: safe('poll', (force = false) => {
    const now = native.now();
    const moving = c.playing || c.euclidOn;
    if (!force && !dirty && !(moving && now - lastSent > 500)) return '';
    dirty = false;
    lastSent = now;
    return asciiJson(snapshot());
  }),
  saveState: safe('saveState', () => asciiJson(saveState())),
  loadState: safe('loadState', (json: string) => loadState(JSON.parse(json) as SavedState)),
  panic: safe('panic', () => c.panic()),
};
