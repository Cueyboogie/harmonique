/**
 * MIDI inside Ableton (Max for Live). The page runs in the device's [jweb]; it talks to Max with
 * window.max.bindInlet / window.max.outlet:
 *   Max → page:  note <pitch> <velocity>  ·  tempo <bpm>  ·  liveplay <0|1>
 *   page → Max:  midi <status> <data1> <data2>   → [iter] → [midiout]
 * Scheduled events are held here with a timer until they're due, then sent.
 */
import type { MidiIO, MidiCallbacks, MidiPort } from '../../explorer/midi';

interface MaxApi {
  outlet(...args: (string | number)[]): void;
  bindInlet(name: string, fn: (...args: number[]) => void): void;
}
export const maxApi = (): MaxApi | null => (window as unknown as { max?: MaxApi }).max ?? null;

export class MaxBridge implements MidiIO {
  status: MidiIO['status'] = 'ready';
  inputId = 'live';
  outputId = 'live';
  readonly outputName = 'ABLETON';
  readonly hasOutput = true;
  private sounding = new Map<number, number>();
  /** Diagnostics shown on screen: notes received from the track, messages sent to Live. */
  inCount = 0;
  outCount = 0;
  lastIn = '';

  constructor(private cb: MidiCallbacks) {}

  async init() {
    const m = maxApi();
    if (!m) { this.status = 'unsupported'; return; }
    m.bindInlet('note', (note, vel) => {
      this.inCount++;
      this.lastIn = `${note}/${vel}`;
      if (vel > 0) this.cb.noteOn(note, vel, 0); else this.cb.noteOff(note, 0);
    });
  }
  inputs(): MidiPort[] { return []; }
  outputs(): MidiPort[] { return []; }
  setInput() { /* the track's input */ }
  setOutput() { /* the device's output */ }
  isLoopInput() { return false; }

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
    if (data.length !== 3) return; // clock/start/stop: Live is the clock here
    const m = maxApi();
    if (!m) return;
    const go = () => { this.outCount++; m.outlet('midi', data[0], data[1], data[2]); };
    const delay = at === undefined ? 0 : at - performance.now();
    if (delay > 2) setTimeout(go, delay); else go();
  }
  panic() {
    for (const k of this.sounding.keys()) this.raw([0x80 | Math.floor(k / 128), k % 128, 0]);
    this.sounding.clear();
    for (let ch = 0; ch < 2; ch++) { this.raw([0xb0 | ch, 123, 0]); this.raw([0xb0 | ch, 64, 0]); }
  }
}
