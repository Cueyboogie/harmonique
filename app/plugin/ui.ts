/**
 * The plugin window: the same monitor screen as the browser and Max for Live versions, drawing a
 * remote controller. The real Controller runs in the plugin's engine (engine.ts), so playing never
 * depends on this window being open; here we draw its snapshots and forward every action.
 *
 * Talks to the plugin through JUCE's web view bridge (window.__JUCE__.backend):
 *   plugin → page:  "hq"      snapshot JSON (protocol.ts)
 *   page → plugin:  "hqCall"  {m, a} JSON   ·   "hqReady" when the page has loaded
 */
import {
  scaleFromPitchClass, buildChordMap, noteLabel, cycleBeats, PRESETS,
  type Scale, type ChordSlot, type Preset,
} from '../../engine';
import type { Controller } from '../controller';
import type { MidiIO } from '../../explorer/midi';
import { mountMonitor } from '../monitor/view';
import { asciiJson, type Call, type CallName, type Snapshot } from './protocol';

interface JuceBackend {
  emitEvent(id: string, payload: unknown): void;
  addEventListener(id: string, fn: (payload: unknown) => void): unknown;
}
const backend = (): JuceBackend | null =>
  (window as unknown as { __JUCE__?: { backend?: JuceBackend } }).__JUCE__?.backend ?? null;

const send = (m: CallName, ...a: unknown[]) => backend()?.emitEvent('hqCall', asciiJson({ m, a } satisfies Call));

class RemoteMidi {
  status: MidiIO['status'] = backend() ? 'ready' : 'unsupported';
  inputId = 'host';
  outputId = 'host';
  readonly outputName = 'HOST';
  readonly hasOutput = true;
  inCount = 0;
  outCount = 0;
  lastIn = '';
  async init() { /* the plugin's ports */ }
  inputs() { return []; }
  outputs() { return []; }
  setInput() {}
  setOutput() {}
  isLoopInput() { return false; }
  send() {}
  release() {}
  raw() {}
  panic() { send('panic'); }
}

/** Mirrors the Controller's public surface that the monitor view reads and calls. */
class RemoteController {
  private s!: Snapshot;
  private at = 0; // performance.now() when the snapshot arrived
  private listeners = new Set<() => void>();
  scale!: Scale;
  map!: ChordSlot[];
  readonly midi = new RemoteMidi();
  readonly synth = { enabled: false, latencyMs: 0, unlock() {}, allOff() {} };
  readonly clockOut = false;
  /** The project's tempo and transport, for the "SET PROJECT TO …" hint. */
  host = { bpm: 0, playing: false };

  constructor(first: Snapshot) { this.apply(first); }

  apply(s: Snapshot) {
    const rebuild = !this.s || s.rootPc !== this.s.rootPc || s.scaleId !== this.s.scaleId || s.size !== this.s.size;
    this.s = s;
    this.at = performance.now();
    if (rebuild) {
      this.scale = scaleFromPitchClass(s.rootPc, s.scaleId);
      this.map = buildChordMap(this.scale, s.size);
    }
    this.host = s.host;
    Object.assign(this.midi, s.io);
    this.listeners.forEach((f) => f());
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get rootPc() { return this.s.rootPc; }
  get scaleId() { return this.s.scaleId; }
  get size() { return this.s.size; }
  get inversion() { return this.s.inversion; }
  get spread() { return this.s.spread; }
  get smooth() { return this.s.smooth; }
  get style() { return this.s.style; }
  get bpm() { return this.s.bpm; }
  get euclidOn() { return this.s.euclidOn; }
  get playMode() { return this.s.playMode; }
  get pattern() { return this.s.pattern; }
  get quantize() { return this.s.quantize; }
  get loopBars() { return this.s.loopBars; }
  get playing() { return this.s.playing; }
  get rec() { return this.s.rec; }
  get take() { return this.s.take; }
  get takeName() { return this.s.takeName; }
  get hints() { return this.s.hints; }
  get sounding() { return new Map(this.s.sounding.map((o, i) => [String(i), o])); }
  get current() {
    const cur = this.s.current;
    return cur ? { slot: this.map[cur.keyPc], notes: cur.notes, keyPc: cur.keyPc } : null;
  }
  get keyName() { return `${noteLabel(this.scale.root)} ${this.scale.def.name}`; }
  get bars() { return this.s.take ? this.s.take.beats / 4 : 0; }
  get hostLocked() { return this.s.host.playing; }

  /** Positions move on between snapshots at the current tempo. */
  private beatsSince() { return ((performance.now() - this.at) * this.s.bpm) / 60000; }
  loopPosition() {
    const { loopPos, take } = this.s;
    if (loopPos < 0 || !take) return -1;
    const L = take.beats;
    return (((loopPos * L + this.beatsSince()) % L) + L) % L / L;
  }
  cyclePosition() {
    if (this.s.cyclePos < 0) return -1;
    const C = cycleBeats(this.s.pattern);
    return ((this.s.cyclePos * C + this.beatsSince()) % C) / C;
  }
  midiFile() { return null; }

  set(key: string, value: unknown) { send('set', key, value); }
  setBpm(bpm: number) { send('setBpm', bpm); }
  setPattern(p: unknown) { send('setPattern', p); }
  setPlayMode(m: unknown) { send('setPlayMode', m); }
  setEuclid(on: boolean) { send('setEuclid', on); }
  setQuantize(q: unknown) { send('setQuantize', q); }
  setLoopLength(b: unknown) { send('setLoopLength', b); }
  keyDown(src: string, key: number, vel = 100) { send('keyDown', src, key, vel); }
  keyUp(src: string) { send('keyUp', src); }
  pressRecord() { send('pressRecord'); }
  play() { send('play'); }
  stop() { send('stop'); }
  reinterpretTake(f: 2 | 0.5) { send('reinterpretTake', f); }
  loadPreset(p: Preset) { send('loadPreset', PRESETS.indexOf(p)); }
  generate(opts = {}) { send('generate', opts); }
  panic() { send('panic'); }
}

let remote: RemoteController | null = null;
const b = backend();
if (!b) {
  document.body.insertAdjacentHTML('beforeend', '<p style="color:#FF9E2C;font:14px monospace;padding:24px">This page is the Harmonique plugin window: open it from the plugin in your DAW.</p>');
} else {
  b.addEventListener('hq', (payload) => {
    const s = JSON.parse(String(payload)) as Snapshot;
    if (remote) { remote.apply(s); return; }
    remote = new RemoteController(s);
    mountMonitor(remote as unknown as Controller, { mode: 'plugin' });
  });
  b.emitEvent('hqReady', '');
}
