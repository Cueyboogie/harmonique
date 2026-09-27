/**
 * Tiny preview synth. Every chord is a "voice group" with an id, so a scheduled
 * note-off can never cut a newer chord that happens to share notes.
 * Times are performance.now() milliseconds, converted to the audio clock.
 */
export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private groups = new Map<string, { osc: OscillatorNode[]; gains: GainNode[] }>();
  enabled = true;

  private audio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.createDynamicsCompressor()).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a click/keypress so the browser allows sound. */
  unlock() { this.audio(); }

  private toCtx(at?: number) {
    const ac = this.audio();
    if (at === undefined) return ac.currentTime;
    return Math.max(ac.currentTime, ac.currentTime + (at - performance.now()) / 1000);
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
      g.gain.linearRampToValueAtTime(level, t + 0.01);
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
      g.gain.setTargetAtTime(0.0001, t, 0.12);
    }
    grp.osc.forEach((o) => o.stop(t + 0.7));
  }

  allOff() {
    for (const id of [...this.groups.keys()]) this.off(id);
  }
}
