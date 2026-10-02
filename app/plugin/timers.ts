/**
 * The plugin's engine runs in QuickJS inside the plugin (no browser), so there is no event loop.
 * The host provides `__native.now()` (ms, its own clock) and calls `harmonique.pump()` every couple
 * of ms; this file supplies performance.now / setTimeout / setInterval on top of that.
 * Imported first by engine.ts so the globals exist before the Controller runs.
 */
interface Native {
  now(): number;
  midi(status: number, d1: number, d2: number, at: number): void;
  log(msg: string): void;
}
export const native = (globalThis as unknown as { __native: Native }).__native;

interface Timer { id: number; due: number; fn: () => void; every: number }
const timers = new Map<number, Timer>();
let nextId = 1;

function add(fn: () => void, ms: number | undefined, every: boolean) {
  const id = nextId++;
  const d = Math.max(0, Number(ms) || 0);
  timers.set(id, { id, due: native.now() + d, fn, every: every ? Math.max(1, d) : 0 });
  return id;
}

/** Run every timer that is due, earliest first (a timer may add more). */
export function runTimers() {
  for (let guard = 0; guard < 10000; guard++) {
    const now = native.now();
    let next: Timer | null = null;
    for (const t of timers.values()) if (t.due <= now && (!next || t.due < next.due || (t.due === next.due && t.id < next.id))) next = t;
    if (!next) return;
    if (next.every) next.due = Math.max(next.due + next.every, now);
    else timers.delete(next.id);
    try { next.fn(); } catch (e) { native.log(`timer: ${String(e)}`); }
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
g.performance = { now: () => native.now() };
g.setTimeout = (fn: () => void, ms?: number) => add(fn, ms, false);
g.setInterval = (fn: () => void, ms?: number) => add(fn, ms, true);
g.clearTimeout = g.clearInterval = (id?: number) => { if (id !== undefined) timers.delete(id); };
g.console = { log: (...a: unknown[]) => native.log(a.join(' ')), warn: (...a: unknown[]) => native.log(a.join(' ')), error: (...a: unknown[]) => native.log(a.join(' ')) };
