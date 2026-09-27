/**
 * Web MIDI bridge (Phase 3).
 *
 *   Arturia (MIDI in) ──► app decides chord ──► MIDI out (IAC Driver) ──► Ableton
 *
 * Responsibilities kept here, away from music logic:
 *   - device discovery + selection
 *   - loop protection: never listen to the port we send to
 *   - pass-through of sustain, mod wheel, pitch bend, aftertouch
 *   - reference-counted note sending, so two chords sharing a note don't cut each other off
 *   - panic (all notes off)
 */

export interface MidiPort { id: string; name: string }

export interface MidiCallbacks {
  noteOn(note: number, velocity: number, channel: number): void;
  noteOff(note: number, channel: number): void;
  devicesChanged(): void;
}

/** What the app needs from a MIDI connection: Web MIDI in the browser, or the Max for Live host. */
export interface MidiIO {
  status: 'unsupported' | 'blocked' | 'ready' | 'pending';
  inputId: string;
  outputId: string;
  readonly outputName: string;
  readonly hasOutput: boolean;
  init(): Promise<void>;
  inputs(): MidiPort[];
  outputs(): MidiPort[];
  setInput(id: string): void;
  setOutput(id: string): void;
  isLoopInput(id: string): boolean;
  send(note: number, velocity: number, ch?: number, at?: number): void;
  release(note: number, ch?: number, at?: number): void;
  raw(data: number[], at?: number): void;
  panic(): void;
}

export class MidiBridge implements MidiIO {
  private access: MIDIAccess | null = null;
  private out: MIDIOutput | null = null;
  inputId = 'all';
  outputId = '';
  status: 'unsupported' | 'blocked' | 'ready' | 'pending' = 'pending';
  private sounding = new Map<number, number>(); // `${ch}:${note}` packed → refcount

  constructor(private cb: MidiCallbacks) {}

  async init() {
    if (!('requestMIDIAccess' in navigator)) { this.status = 'unsupported'; this.cb.devicesChanged(); return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.status = 'ready';
      this.access.onstatechange = () => { this.bindInputs(); this.cb.devicesChanged(); };
      // Default output: the macOS IAC bus if present.
      const iac = this.outputs().find((o) => /iac|bus/i.test(o.name));
      if (iac) this.setOutput(iac.id);
      this.bindInputs();
    } catch {
      this.status = 'blocked';
    }
    this.cb.devicesChanged();
  }

  inputs(): MidiPort[] {
    return this.access ? [...this.access.inputs.values()].map((p) => ({ id: p.id, name: p.name ?? p.id })) : [];
  }
  outputs(): MidiPort[] {
    return this.access ? [...this.access.outputs.values()].map((p) => ({ id: p.id, name: p.name ?? p.id })) : [];
  }
  get outputName() { return this.out?.name ?? ''; }

  setOutput(id: string) {
    this.panic();
    this.outputId = id;
    this.out = (id && this.access?.outputs.get(id)) || null;
    this.bindInputs();
  }
  setInput(id: string) { this.inputId = id; this.bindInputs(); }

  /** An input is a loop risk if it's the same virtual cable we send on. */
  private isLoop(p: MIDIInput) {
    if (!this.out) return false;
    return p.name === this.out.name || (/iac/i.test(p.name ?? '') && /iac/i.test(this.out.name ?? ''));
  }
  isLoopInput(id: string) {
    const p = this.access?.inputs.get(id);
    return p ? this.isLoop(p) : false;
  }

  private bindInputs() {
    if (!this.access) return;
    for (const p of this.access.inputs.values()) {
      const listen = (this.inputId === 'all' || this.inputId === p.id) && !this.isLoop(p);
      p.onmidimessage = listen ? (e) => this.handle(e.data!) : null;
    }
  }

  private handle(d: Uint8Array) {
    const type = d[0] & 0xf0;
    const ch = d[0] & 0x0f;
    if (type === 0x90 && d[2] > 0) this.cb.noteOn(d[1], d[2], ch);
    else if (type === 0x80 || (type === 0x90 && d[2] === 0)) this.cb.noteOff(d[1], ch);
    else if (type === 0xb0 || type === 0xe0 || type === 0xd0 || type === 0xa0) this.out?.send(d); // CC, bend, aftertouch
  }

  /**
   * Send a note-on unless it's already sounding (then just count it).
   * `at`: optional performance.now() time for sample-tight scheduling.
   */
  send(note: number, velocity: number, ch = 0, at?: number) {
    const k = ch * 128 + note;
    const n = this.sounding.get(k) ?? 0;
    this.sounding.set(k, n + 1);
    if (n === 0) this.raw([0x90 | ch, note, velocity], at);
  }
  /** Send a note-off only when the last chord using this note lets go. */
  release(note: number, ch = 0, at?: number) {
    const k = ch * 128 + note;
    const n = this.sounding.get(k) ?? 0;
    if (n <= 1) { this.sounding.delete(k); this.raw([0x80 | ch, note, 0], at); }
    else this.sounding.set(k, n - 1);
  }
  /** Any message (MIDI Clock 0xF8, Start 0xFA, Stop 0xFC …), optionally scheduled. */
  raw(data: number[], at?: number) {
    if (!this.out) return;
    if (at === undefined) this.out.send(data);
    else this.out.send(data, at);
  }
  get hasOutput() { return !!this.out; }

  panic() {
    for (const k of this.sounding.keys()) this.out?.send([0x80 | Math.floor(k / 128), k % 128, 0]);
    this.sounding.clear();
    for (let ch = 0; ch < 16; ch++) { this.out?.send([0xb0 | ch, 123, 0]); this.out?.send([0xb0 | ch, 64, 0]); }
  }
}
