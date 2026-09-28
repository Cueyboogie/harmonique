/**
 * Tiny preview synth. Every chord is a "voice group" with an id, so a scheduled
 * note-off can never cut a newer chord that happens to share notes.
 * Times are performance.now() milliseconds (the same clock Web MIDI uses), converted to the
 * audio clock through a steady, smoothed mapping. Reading ac.currentTime on every event is
 * jittery (it only moves once per audio block and can be stale on the main thread), which made
 * scheduled notes wobble or bunch up after a busy moment; a fixed mapping keeps their spacing.
 */
export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private groups = new Map<string, { osc: OscillatorNode[]; gains: GainNode[] }>();
  /** performance.now()/1000 − audio time, smoothed. null until measured. */
  private offset: number | null = null;
  enabled = true;

  private audio() {
    if (!this.ctx) {
      // Smallest buffer the browser allows ('interactive' can still pick a larger one on some systems).
      try { this.ctx = new AudioContext({ latencyHint: 0 }); } catch { this.ctx = new AudioContext({ latencyHint: 'interactive' }); }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.2;
      // Soft clip instead of a compressor: a compressor adds ~6 ms of look-ahead delay to every note.
      const clip = this.ctx.createWaveShaper();
      const curve = new Float32Array(1025);
      for (let i = 0; i < curve.length; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5); }
      clip.curve = curve;
      this.master.connect(clip).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** What the browser reports it adds between "play" and your speakers, in ms (0 until sound has started). */
  get latencyMs() {
    if (!this.ctx) return 0;
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round(((this.ctx.baseLatency ?? 0) + out) * 1000);
  }

  /** Call from a click/keypress so the browser allows sound. */
  unlock() { this.audio(); }

  /** Keep a smoothed performance.now() ↔ audio-clock mapping. */
  private syncClock(ac: AudioContext) {
    // ac.currentTime only advances once per audio block, so each reading is a little stale;
    // average the readings instead of trusting any single one.
    const cand = performance.now() / 1000 - ac.currentTime;
    if (this.offset === null || Math.abs(cand - this.offset) > 0.05) this.offset = cand; // first reading, or the context was resumed
    else this.offset += (cand - this.offset) * 0.05;
    return this.offset;
  }

  private toCtx(at?: number) {
    const ac = this.audio();
    const offset = this.syncClock(ac);
    if (at === undefined) return ac.currentTime; // live key: as soon as possible
    const t = at / 1000 - offset;
    return t > ac.currentTime ? t : ac.currentTime; // only a stall longer than the look-ahead lands here
  }

  on(id: string, notes: number[], velocity: number, at?: number) {
    if (!this.enabled) return;
    this.off(id, at);
    const ac = this.audio();
    const t = this.toCtx(at);
    const level = (0.14 * (0.4 + (velocity / 127) * 0.6)) / Math.sqrt(Math.max(1, notes.length / 3));
    const osc: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (const note of notes) {
      const f = 440 * Math.pow(2, (note - 69) / 12);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.003); // near-instant attack (the lowpass keeps it click-free)
      g.gain.exponentialRampToValueAtTime(level * 0.55, t + 0.6);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, t);
      filter.frequency.exponentialRampToValueAtTime(1200, t + 0.9);
      (['triangle', 'sawtooth'] as OscillatorType[]).forEach((type, i) => {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = i ? 7 : -7;
        o.connect(filter);
        o.start(t);
        osc.push(o);
      });
      filter.connect(g).connect(this.master);
      gains.push(g);
    }
    this.groups.set(id, { osc, gains });
  }

  off(id: string, at?: number) {
    const grp = this.groups.get(id);
    if (!grp || !this.ctx) return;
    this.groups.delete(id);
    const t = this.toCtx(at);
    for (const g of grp.gains) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.1);
    }
    grp.osc.forEach((o) => o.stop(t + 0.5)); // ~5 time constants: silent by then, fewer live voices
  }

  allOff() {
    for (const id of [...this.groups.keys()]) this.off(id);
  }
}
