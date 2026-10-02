/**
 * The plugin engine (app/plugin/engine.ts) as the AU / VST3 plugin runs it: bundled, in a bare JS
 * context with no browser (like QuickJS), driven by a fake host clock through __native / harmonique.*.
 */
import { describe, it, expect } from 'vitest';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const bundle = buildSync({ entryPoints: ['app/plugin/engine.ts'], bundle: true, format: 'iife', write: false, target: 'es2020' }).outputFiles[0].text;

interface Engine {
  pump(): void;
  noteIn(note: number, vel: number): void;
  host(bpm: number, playing: boolean, zero: number): void;
  call(json: string): void;
  poll(force?: boolean): string;
  saveState(): string;
  loadState(json: string): void;
}

function boot() {
  const clock = { t: 1000 };
  const out: { s: number; d1: number; d2: number; at: number }[] = [];
  const logs: string[] = [];
  const ctx = vm.createContext({
    __native: {
      now: () => clock.t,
      midi: (s: number, d1: number, d2: number, at: number) => out.push({ s, d1, d2, at }),
      log: (m: string) => logs.push(m),
    },
    Math, JSON, Date, Map, Set, Array, Object, Number, String, Error, Promise,
  });
  vm.runInContext(bundle, ctx);
  const e = (ctx as unknown as { harmonique: Engine }).harmonique;
  /** Advance the host clock, pumping every 2 ms like the plugin's engine thread. */
  const run = (ms: number) => { for (let i = 0; i < ms; i += 2) { clock.t += 2; e.pump(); } };
  const call = (m: string, ...a: unknown[]) => e.call(JSON.stringify({ m, a }));
  return { e, clock, out, logs, run, call };
}

describe('plugin engine (runs inside the AU / VST3)', () => {
  it('a note from the track plays its chord on Ch 1, stamped with the host clock', () => {
    const { e, out, clock, logs } = boot();
    e.noteIn(60, 100);
    expect(out.map((m) => [m.s, m.d1, m.d2])).toEqual([[0x90, 60, 100], [0x90, 64, 100], [0x90, 67, 100], [0x90, 71, 100]]);
    expect(out.every((m) => m.at === clock.t)).toBe(true);
    out.length = 0;
    e.noteIn(60, 0);
    expect(out.map((m) => m.s)).toEqual([0x80, 0x80, 0x80, 0x80]);
    expect(logs).toEqual([]);
  });

  it('NOTES mode plays one in-scale note on Ch 2', () => {
    const { e, out, call } = boot();
    call('setPlayMode', 'notes');
    e.noteIn(61, 90); // C♯ snaps down to C in C major
    expect(out.map((m) => [m.s, m.d1, m.d2])).toEqual([[0x91, 60, 90]]);
  });

  it('screen actions change settings, and snapshots only go out when something changed', () => {
    const { e, call } = boot();
    expect(JSON.parse(e.poll()).rootPc).toBe(0);
    expect(e.poll()).toBe('');
    call('set', 'rootPc', 7);
    const s = JSON.parse(e.poll());
    expect(s.rootPc).toBe(7);
    expect(s.io.outCount).toBe(0);
    call('notAMethod');
    expect(e.poll()).toBe('');
  });

  it('a preset loops on the project grid while the project plays, at the project tempo', () => {
    const { e, out, clock, run, call } = boot();
    call('loadPreset', 0);
    const zero = clock.t + 500; // the project's beat 0
    e.host(100, true, zero);
    run(5000);
    const beat = 60000 / 100;
    const ons = out.filter((m) => (m.s & 0xf0) === 0x90 && m.at >= zero);
    expect(ons.length).toBeGreaterThan(4);
    for (const m of ons) {
      const beats = (m.at - zero) / beat;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6);
    }
    expect(JSON.parse(e.poll(true)).bpm).toBe(100);
    // Stopping the project stops the loop and releases its notes.
    out.length = 0;
    e.host(100, false, NaN);
    run(2000);
    const s = JSON.parse(e.poll(true));
    expect(s.playing).toBe(false);
    expect(s.sounding).toEqual([]);
    const offs = out.filter((m) => (m.s & 0xf0) === 0x80).length;
    const ons2 = out.filter((m) => (m.s & 0xf0) === 0x90).length;
    expect(ons2).toBe(0);
    expect(offs).toBeGreaterThan(0);
  });

  it('starting the project plays the loop from its first chord, even though that beat has just passed', () => {
    const { e, out, clock, run, call } = boot();
    e.host(120, false, NaN);
    call('loadPreset', 0); // plays on its own while the project is stopped
    run(300);
    out.length = 0;
    const zero = clock.t - 4; // the host reports beat 0 a few ms after it happened
    e.host(120, true, zero);
    run(20);
    const first = out.filter((m) => (m.s & 0xf0) === 0x90);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((m) => m.at === zero)).toBe(true);
  });

  it('your playing sets the tempo while the project is stopped; the project wins when it plays', () => {
    const { e, run, call } = boot();
    e.host(120, false, NaN);
    call('setBpm', 96);
    expect(JSON.parse(e.poll(true)).bpm).toBe(96);
    e.host(120, true, 5000);
    run(10);
    const s = JSON.parse(e.poll(true));
    expect(s.bpm).toBe(120);
    expect(s.host).toEqual({ bpm: 120, playing: true });
  });

  it('messages to the window are plain ASCII (chord names with ♯ / ♭ survive the trip)', () => {
    const { e, call, run } = boot();
    call('set', 'rootPc', 1); // C♯ / D♭ major
    call('loadPreset', 0);
    run(50);
    const raw = e.poll(true);
    expect(/^[\x20-\x7e]*$/.test(raw)).toBe(true);
    const labels = JSON.parse(raw).take.events.map((ev: { label: string }) => ev.label).join(' ');
    expect(/[♯♭]/.test(labels)).toBe(true);
    expect(/^[\x20-\x7e]*$/.test(e.saveState())).toBe(true);
  });

  it('state saved with the project comes back in a fresh plugin', () => {
    const a = boot();
    a.call('set', 'rootPc', 2);
    a.call('loadPreset', 1); // presets bring their own scale
    a.call('set', 'size', '9th');
    a.call('setQuantize', '1/8');
    a.call('setLoopLength', 8);
    const saved = a.e.saveState();

    const b = boot();
    b.e.loadState(saved);
    const s = JSON.parse(b.e.poll(true));
    const was = JSON.parse(a.e.poll(true));
    expect([s.rootPc, s.size, s.quantize, s.loopBars]).toEqual([2, '9th', '1/8', 8]);
    expect([s.scaleId, s.takeName]).toEqual([was.scaleId, was.takeName]);
    expect(s.take).toEqual(was.take);
    expect(b.logs).toEqual([]);
  });
});
