/**
 * Harmonic — engine review build (Phases 0–7).
 * Real engine + chord map + voicing + voice leading + progressions,
 * a tiny Web Audio synth, a chord player, and a Web MIDI bridge.
 * Not the product UI: a window onto the engine for review, learning, and playing.
 */
import {
  SCALES, CHORD_SIZES, SPREADS, scaleFromPitchClass, degreeLabels, noteLabel,
  buildChordMap, chordForKey, voiceLead, QUALITY_LABEL, WHITE_PCS, BLACK_PCS,
  PRESETS, resolvePreset, generateProgression, suggestNext, writeMidi,
  type ScaleId, type ChordSize, type Spread, type Scale, type ChordSlot, type Style, type Suggestion, type Preset,
} from '../engine';
import { MidiBridge } from './midi';

const state = {
  rootPc: 0,
  scaleId: 'ionian' as ScaleId,
  size: '7th' as ChordSize,
  inversion: 0,
  spread: 'close' as Spread,
  sound: true,
  kbOctave: 4,
  /** Voice leading: each chord moves as little as possible from the last one. */
  smooth: true,
  /** Glow the keys most likely to come next. */
  hints: true,
  style: 'pop' as Style,
};
const KB_LOW = 36; // C2 — 49 keys, like a KeyLab 49
const KB_HIGH = 84; // C6
const KEY_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK = new Set(BLACK_PCS);
/** Ableton-style computer keyboard: A W S E D F T G Y H U J K. */
const COMPUTER_KEYS = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK'];

/** Ableton note names: middle C (MIDI 60) = C3. */
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = (m: number) => SHARPS[m % 12] + (Math.floor(m / 12) - 2);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let scale: Scale;
let map: ChordSlot[];

/* ================= audio: per-note synth, reference counted ================= */
let ctx: AudioContext | null = null;
let master: GainNode;
const voices = new Map<number, { osc: OscillatorNode[]; gain: GainNode; count: number }>();

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function synthOn(note: number, velocity: number) {
  const v = voices.get(note);
  if (v) { v.count++; return; }
  const ac = audio();
  const t = ac.currentTime;
  const level = 0.16 * (0.4 + (velocity / 127) * 0.6);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(level * 0.55, t + 0.6);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3400, t);
  filter.frequency.exponentialRampToValueAtTime(1200, t + 0.9);
  const f = 440 * Math.pow(2, (note - 69) / 12);
  const osc = (['triangle', 'sawtooth'] as OscillatorType[]).map((type, i) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = i ? 7 : -7;
    o.connect(filter);
    o.start(t);
    return o;
  });
  filter.connect(gain).connect(master);
  voices.set(note, { osc, gain, count: 1 });
}

function synthOff(note: number) {
  const v = voices.get(note);
  if (!v || !ctx) return;
  if (--v.count > 0) return;
  voices.delete(note);
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  v.osc.forEach((o) => o.stop(t + 0.55));
}

/* ================= note routing: every input goes through here ================= */
interface Held { notes: number[]; keyMidi: number; slot: ChordSlot; ch: number; synth: boolean }
const held = new Map<string, Held>();
let last: { slot: ChordSlot; notes: number[]; keyMidi: number } | null = null;
/** Notes of the most recent chord, for voice leading. */
let lastNotes: number[] | null = null;
let hints: Suggestion[] = [];

const midi = new MidiBridge({
  noteOn: (note, vel, ch) => triggerOn(`midi:${ch}:${note}`, note, vel, ch),
  noteOff: (note, ch) => triggerOff(`midi:${ch}:${note}`),
  devicesChanged: () => renderMidi(),
});

function triggerOn(src: string, keyMidi: number, velocity = 100, ch = 0) {
  if (held.has(src)) triggerOff(src);
  const hit = chordForKey(keyMidi, scale, map);
  const notes = voiceLead(hit.slot.chord, hit.rootMidi, state.smooth ? lastNotes : null, {
    inversion: state.inversion, spread: state.spread,
  });
  lastNotes = notes;
  const synth = state.sound;
  held.set(src, { notes, keyMidi, slot: hit.slot, ch, synth });
  for (const n of notes) {
    if (synth) synthOn(n, velocity);
    midi.send(n, velocity, ch);
  }
  last = { slot: hit.slot, notes, keyMidi };
  hints = suggestNext(scale, map, hit.slot.keyPc, state.style);
  if (src !== 'seq') captureChord(hit.slot.keyPc);
  renderLive();
}

function triggerOff(src: string) {
  const h = held.get(src);
  if (!h) return;
  held.delete(src);
  for (const n of h.notes) {
    if (h.synth) synthOff(n);
    midi.release(n, h.ch);
  }
  renderLive();
}

function releaseAll() {
  for (const src of [...held.keys()]) triggerOff(src);
}

/* ================= rendering ================= */
function compute() {
  scale = scaleFromPitchClass(state.rootPc, state.scaleId);
  map = buildChordMap(scale, state.size);
}

function segmented<T extends string | number>(
  el: HTMLElement, items: readonly T[], current: T, label: (v: T) => string, onPick: (v: T) => void, idPrefix: string,
  disabled: (v: T) => boolean = () => false,
) {
  el.innerHTML = '';
  for (const v of items) {
    const b = document.createElement('button');
    b.className = 'seg';
    b.id = `${idPrefix}-${v}`;
    b.textContent = label(v);
    b.disabled = disabled(v);
    b.setAttribute('aria-pressed', String(v === current));
    b.onclick = () => onPick(v);
    el.appendChild(b);
  }
}

function renderControls() {
  const roots = $('roots');
  roots.innerHTML = '';
  for (let pc = 0; pc < 12; pc++) {
    const b = document.createElement('button');
    b.className = 'root' + (BLACK.has(pc) ? ' is-black' : '');
    b.id = `root-${pc}`;
    b.textContent = noteLabel(scaleFromPitchClass(pc, state.scaleId).root);
    b.setAttribute('aria-pressed', String(pc === state.rootPc));
    b.onclick = () => { state.rootPc = pc; update(); };
    roots.appendChild(b);
  }

  const scales = $('scales');
  scales.innerHTML = '';
  for (const family of ['Major modes', 'Minor variants'] as const) {
    const group = document.createElement('div');
    group.className = 'scale-group';
    group.innerHTML = `<span class="sublabel">${family === 'Major modes' ? 'Modes · bright → dark' : 'Minor variants'}</span>`;
    const row = document.createElement('div');
    row.className = 'chips';
    for (const def of SCALES.filter((s) => s.family === family)) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.id = `scale-${def.id}`;
      b.textContent = def.name;
      b.setAttribute('aria-pressed', String(def.id === state.scaleId));
      b.onclick = () => { state.scaleId = def.id; update(); };
      row.appendChild(b);
    }
    group.appendChild(row);
    scales.appendChild(group);
  }

  segmented($('sizes'), CHORD_SIZES, state.size, (s) => (s === 'triad' ? 'Triad' : s), (s) => { state.size = s; update(); }, 'size');
  const maxInv = state.size === 'triad' ? 2 : 3;
  segmented($('inversions'), [0, 1, 2, 3], state.inversion, (i) => ['Root', '1st', '2nd', '3rd'][i],
    (i) => { state.inversion = i; update(); }, 'inv', (i) => i > maxInv);
  segmented($('spreads'), SPREADS, state.spread, (s) => s[0].toUpperCase() + s.slice(1), (s) => { state.spread = s; update(); }, 'spread');
  segmented($('vl'), ['smooth', 'off'] as const, state.smooth ? 'smooth' : 'off', (v) => (v === 'smooth' ? 'Smooth' : 'Off'),
    (v) => { state.smooth = v === 'smooth'; update(); }, 'vl');
}

function renderInfo() {
  const def = scale.def;
  const labels = degreeLabels(def);
  $('scale-name').textContent = `${noteLabel(scale.root)} ${def.name}`;
  $('scale-aka').textContent = def.aka ? `also: ${def.aka}` : '';
  $('scale-mood').textContent = def.mood;
  $('scale-recipe').textContent = def.recipe;
  const notes = $('scale-notes');
  notes.innerHTML = '';
  scale.notes.forEach((n, i) => {
    const d = document.createElement('div');
    d.className = 'sn' + (/[♭♯]/.test(labels[i]) ? ' is-altered' : '');
    d.innerHTML = `<span class="sn-note">${noteLabel(n)}</span><span class="sn-deg">${labels[i]}</span>`;
    notes.appendChild(d);
  });
}

function holdable(el: HTMLElement, src: () => string, keyMidi: () => number) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    triggerOn(`${src()}:${e.pointerId}`, keyMidi());
  });
  const up = (e: PointerEvent) => triggerOff(`${src()}:${e.pointerId}`);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); triggerOn(`${src()}:kb`, keyMidi()); }
  });
  el.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') triggerOff(`${src()}:kb`); });
}

function renderMap() {
  const el = $('keymap');
  el.innerHTML = '';
  const cell = (pc: number) => {
    const slot = map[pc];
    const c = slot.chord;
    const b = document.createElement('button');
    const isBlack = BLACK.has(pc);
    b.className = `cell ${isBlack ? 'cell-black' : 'cell-white'} q-${c.triad}`;
    b.id = `cell-${pc}`;
    b.dataset.pc = String(pc);
    const w = WHITE_PCS.indexOf(pc);
    const bi = [0, 1, 3, 4, 5][BLACK_PCS.indexOf(pc)];
    b.style.gridColumn = isBlack ? `${bi * 2 + 2} / span 2` : `${w * 2 + 1} / span 2`;
    b.style.gridRow = isBlack ? '1' : '2';
    b.setAttribute('aria-label', `${KEY_NAMES[pc]} key plays ${c.symbol}, ${slot.role}`);
    b.innerHTML = `
      <span class="cell-top"><span class="cell-key">${KEY_NAMES[pc]}</span><span class="cell-roman">${c.roman}</span></span>
      <span class="cell-symbol">${c.symbol}</span>
      <span class="cell-role">${slot.kind === 'color' ? slot.role : QUALITY_LABEL[c.triad]}</span>`;
    holdable(b, () => `map:${pc}`, () => state.kbOctave * 12 + 12 + pc);
    el.appendChild(b);
  };
  BLACK_PCS.forEach(cell);
  WHITE_PCS.forEach(cell);
}

function renderKeyboard() {
  const el = $('keys');
  el.innerHTML = '';
  const whites: number[] = [];
  for (let m = KB_LOW; m <= KB_HIGH; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const w = 100 / whites.length;
  for (let m = KB_LOW; m <= KB_HIGH; m++) {
    const pc = m % 12;
    const black = BLACK.has(pc);
    const k = document.createElement('div');
    k.className = `key ${black ? 'black' : 'white'}`;
    k.id = `key-${m}`;
    k.dataset.midi = String(m);
    if (black) {
      const wi = whites.filter((x) => x < m).length;
      k.style.left = `calc(${wi * w}% - ${w * 0.33}%)`;
      k.style.width = `${w * 0.66}%`;
    } else {
      k.style.width = `${w}%`;
      if (pc === 0) k.innerHTML = `<span class="oct">C${Math.floor(m / 12) - 2}</span>`;
    }
    holdable(k, () => `key:${m}`, () => m);
    el.appendChild(k);
  }
  paintKeyboard();
}

/** Cheap repaint of lit/pressed state without rebuilding the keyboard. */
function paintKeyboard() {
  const lit = new Map<number, string>();
  const pressed = new Set<number>();
  for (const h of held.values()) {
    pressed.add(h.keyMidi);
    for (const n of h.notes) lit.set(n, h.slot.chord.triad);
  }
  document.querySelectorAll<HTMLElement>('.key').forEach((k) => {
    const m = Number(k.dataset.midi);
    const q = lit.get(m);
    k.className = k.className.replace(/\s?(lit|q-\w+|pressed)/g, '');
    if (q) k.classList.add('lit', `q-${q}`);
    if (pressed.has(m)) k.classList.add('pressed');
  });
  const heldPcs = new Set([...held.values()].map((h) => h.keyMidi % 12));
  const rank = new Map<number, string>();
  if (state.hints && last) hints.forEach((h, i) => rank.set(h.keyPc, h.kind === 'spice' ? 'spice' : String(i + 1)));
  document.querySelectorAll<HTMLElement>('.cell').forEach((c) => {
    const pc = Number(c.dataset.pc);
    c.classList.toggle('is-on', heldPcs.has(pc));
    const r = heldPcs.size ? undefined : rank.get(pc);
    if (r) c.dataset.hint = r; else delete c.dataset.hint;
  });
}

function renderLive() {
  paintKeyboard();
  const now = $('now');
  if (!last) {
    now.innerHTML = `<span class="now-hint">Play a key: click, use your MIDI keyboard, or type <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>D</kbd> … (<kbd>Z</kbd>/<kbd>X</kbd> octave)</span>`;
    return;
  }
  const { slot, notes, keyMidi } = last;
  now.innerHTML = `
    <b class="q-${slot.chord.triad}">${slot.chord.symbol}</b>
    <span class="now-roman">${slot.chord.roman}</span>
    <span class="now-role">${slot.kind === 'color' ? `${slot.role} · ${slot.reason}` : `${slot.role} of ${slot.reason}`}</span>
    <span class="now-notes mono">key ${midiName(keyMidi)} → ${notes.map(midiName).join(' ')}</span>`;
}

function renderMidi() {
  const status = $('midi-status');
  const panel = $('midi-panel');
  if (midi.status !== 'ready') {
    const pending = midi.status === 'pending';
    status.textContent = pending ? 'MIDI: waiting for permission' : 'MIDI: local app only';
    status.dataset.state = 'off';
    panel.hidden = true;
    $('midi-off').hidden = false;
    $('midi-off').textContent = pending
      ? 'Waiting for MIDI access. In the local app on your Mac, click Allow when Chrome asks. Shared pages can’t use MIDI, so there this stays off; everything else works the same.'
      : 'MIDI input and output run in the local version of this page on your Mac. Browsers block MIDI inside shared pages. Everything else here works the same.';
    return;
  }
  $('midi-off').hidden = true;
  panel.hidden = false;
  const ins = midi.inputs();
  const outs = midi.outputs();
  const inSel = $<HTMLSelectElement>('midi-in');
  const outSel = $<HTMLSelectElement>('midi-out');
  inSel.innerHTML = `<option value="all">All inputs</option>` +
    ins.map((p) => `<option value="${p.id}" ${midi.isLoopInput(p.id) ? 'disabled' : ''}>${p.name}${midi.isLoopInput(p.id) ? ' (output, ignored)' : ''}</option>`).join('');
  inSel.value = midi.inputId;
  outSel.innerHTML = `<option value="">None (browser sound only)</option>` + outs.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  outSel.value = midi.outputId;
  const ok = !!midi.outputId;
  status.textContent = ok ? `MIDI → ${midi.outputName}` : `MIDI: ${ins.length} in · no output`;
  status.dataset.state = ok ? 'on' : 'warn';
}

function update() {
  releaseAll();
  lastNotes = null;
  compute();
  state.inversion = Math.min(state.inversion, state.size === 'triad' ? 2 : 3);
  renderControls();
  renderInfo();
  renderMap();
  renderKeyboard();
  renderLive();
  renderProg();
}

/* ================= progressions: presets, generator, player, recorder ================= */
const prog = {
  keys: [0, 7, 9, 5] as number[],
  label: 'Pop anthem',
  length: 4,
  tension: 0.4,
  color: 0.25,
  seed: 0,
  bpm: 96,
  playing: false,
  step: -1,
  capture: false,
};
let seqTimer = 0;
let gateTimer = 0;
let nextTime = 0;

const keyMidiFor = (pc: number) => (state.kbOctave + 1) * 12 + pc;

function renderProg() {
  const presets = $('presets');
  presets.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'chip chip-sm';
    b.id = `preset-${p.id}`;
    b.title = p.mood;
    b.innerHTML = `${p.name}`;
    b.setAttribute('aria-pressed', String(prog.label === p.name));
    b.onclick = () => loadPreset(p);
    presets.appendChild(b);
  }
  segmented($('gen-length'), [4, 8], prog.length, (n) => `${n} chords`, (n) => { prog.length = n; renderProg(); }, 'len');
  segmented($('gen-style'), ['pop', 'bach'] as const, state.style, (s) => (s === 'pop' ? 'Pop' : 'Bach'),
    (s) => { state.style = s; renderProg(); }, 'style');

  const strip = $('prog-strip');
  strip.innerHTML = '';
  strip.style.setProperty('--n', String(Math.max(4, prog.keys.length)));
  if (!prog.keys.length) {
    strip.innerHTML = `<p class="strip-empty">${prog.capture ? 'Recording: play chords on your keyboard (up to 8).' : 'Empty. Pick a famous progression, press Generate, or Record from keys.'}</p>`;
  }
  prog.keys.forEach((pc, i) => {
    const slot = map[pc];
    const b = document.createElement('button');
    b.className = `pcell q-${slot.chord.triad}` + (slot.kind === 'color' ? ' is-color' : '') + (prog.step === i ? ' is-step' : '');
    b.id = `pcell-${i}`;
    b.innerHTML = `<span class="pcell-top"><span class="pcell-n">${i + 1}</span><span class="pcell-roman">${slot.chord.roman}</span></span>
      <span class="pcell-symbol">${slot.chord.symbol}</span><span class="pcell-key">${KEY_NAMES[pc]} key</span>`;
    holdable(b, () => `prog:${i}`, () => keyMidiFor(pc));
    strip.appendChild(b);
  });
  $('prog-label').textContent = prog.label;
  $('prog-play').textContent = prog.playing ? 'Stop' : 'Play';
  $('prog-play').setAttribute('aria-pressed', String(prog.playing));
  $<HTMLButtonElement>('prog-play').disabled = !prog.keys.length;
  $('prog-capture').setAttribute('aria-pressed', String(prog.capture));
  $('prog-capture').textContent = prog.capture ? 'Recording…' : 'Record from keys';
}

function loadPreset(p: Preset) {
  state.scaleId = p.scale;
  update();
  prog.keys = resolvePreset(p, map);
  prog.label = p.name;
  prog.capture = false;
  renderProg();
  if (!prog.playing) play();
}

function generate() {
  prog.seed += 1;
  const g = generateProgression(scale, map, {
    length: prog.length, style: state.style, tension: prog.tension, color: prog.color, seed: prog.seed,
  });
  prog.keys = g.keys;
  prog.label = `Generated · ${state.style === 'pop' ? 'Pop' : 'Bach'} #${prog.seed}`;
  prog.capture = false;
  renderProg();
  if (!prog.playing) play();
}

function captureChord(pc: number) {
  if (!prog.capture || prog.playing) return;
  if (prog.label !== 'Recorded') { prog.keys = []; prog.label = 'Recorded'; }
  prog.keys.push(pc);
  if (prog.keys.length >= 8) prog.capture = false;
  renderProg();
}

function play() {
  if (!prog.keys.length) return;
  prog.playing = true;
  prog.step = -1;
  lastNotes = null;
  nextTime = performance.now() + 30;
  seqTimer = window.setTimeout(tick, 30);
  renderProg();
}

function tick() {
  if (!prog.playing || !prog.keys.length) return stop();
  const stepMs = (4 * 60000) / prog.bpm; // one chord per bar of 4/4
  prog.step = (prog.step + 1) % prog.keys.length;
  triggerOn('seq', keyMidiFor(prog.keys[prog.step]), 96);
  document.querySelectorAll('.pcell').forEach((c, i) => c.classList.toggle('is-step', i === prog.step));
  window.clearTimeout(gateTimer);
  gateTimer = window.setTimeout(() => triggerOff('seq'), stepMs * 0.94);
  nextTime += stepMs;
  seqTimer = window.setTimeout(tick, Math.max(0, nextTime - performance.now()));
}

function stop() {
  prog.playing = false;
  prog.step = -1;
  window.clearTimeout(seqTimer);
  window.clearTimeout(gateTimer);
  triggerOff('seq');
  renderProg();
}

function saveMidi() {
  let prev: number[] | null = null;
  const events = prog.keys.map((pc, i) => {
    const hit = chordForKey(keyMidiFor(pc), scale, map);
    prev = voiceLead(hit.slot.chord, hit.rootMidi, state.smooth ? prev : null, { inversion: state.inversion, spread: state.spread });
    return { notes: prev, start: i * 4, length: 4, velocity: 96 };
  });
  const name = `${noteLabel(scale.root)} ${scale.def.name} - ${prog.label}`;
  const blob = new Blob([writeMidi(events, prog.bpm, name)], { type: 'audio/midi' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `harmonic-${name.replace(/[^\w#♭♯ -]+/g, '').replace(/\s+/g, '-').toLowerCase()}.mid`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= wiring ================= */
const downKeys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (['SELECT', 'INPUT'].includes((e.target as HTMLElement).tagName)) return;
  if (e.code === 'Space' && (e.target as HTMLElement) === document.body) { e.preventDefault(); prog.playing ? stop() : play(); return; }
  if (e.code === 'KeyZ' || e.code === 'KeyX') {
    state.kbOctave = Math.max(1, Math.min(7, state.kbOctave + (e.code === 'KeyX' ? 1 : -1)));
    $('kb-octave').textContent = `C${state.kbOctave - 1}`;
    return;
  }
  const i = COMPUTER_KEYS.indexOf(e.code);
  if (i < 0) return;
  e.preventDefault();
  downKeys.add(e.code);
  triggerOn(`ck:${e.code}`, (state.kbOctave + 1) * 12 + i);
});
window.addEventListener('keyup', (e) => {
  if (!downKeys.has(e.code)) return;
  downKeys.delete(e.code);
  triggerOff(`ck:${e.code}`);
});
window.addEventListener('blur', releaseAll);

$('sound').addEventListener('click', () => {
  state.sound = !state.sound;
  $('sound').setAttribute('aria-pressed', String(state.sound));
  $('sound').textContent = state.sound ? 'Browser sound on' : 'Browser sound off';
});
$<HTMLSelectElement>('midi-in').addEventListener('change', (e) => { midi.setInput((e.target as HTMLSelectElement).value); renderMidi(); });
$<HTMLSelectElement>('midi-out').addEventListener('change', (e) => {
  releaseAll();
  midi.setOutput((e.target as HTMLSelectElement).value);
  // When sending to a DAW, the browser synth would double the sound.
  if (midi.outputId && state.sound) $('sound').click();
  renderMidi();
});
$('panic').addEventListener('click', () => { stop(); releaseAll(); midi.panic(); });

$('gen-go').addEventListener('click', generate);
$('prog-play').addEventListener('click', () => (prog.playing ? stop() : play()));
$('prog-clear').addEventListener('click', () => { stop(); prog.keys = []; prog.label = 'Empty'; renderProg(); });
$('prog-capture').addEventListener('click', () => {
  if (prog.playing) stop();
  prog.capture = !prog.capture;
  if (prog.capture) { prog.keys = []; prog.label = 'Recorded'; }
  renderProg();
});
$('prog-midi').addEventListener('click', saveMidi);
// Downloads are blocked inside shared (framed) pages; only offer the file in the local app.
$('prog-midi').hidden = window.self !== window.top;
const tensionInput = $<HTMLInputElement>('gen-tension');
const colorInput = $<HTMLInputElement>('gen-color');
const bpmInput = $<HTMLInputElement>('prog-bpm');
tensionInput.value = String(prog.tension);
colorInput.value = String(prog.color);
bpmInput.value = String(prog.bpm);
tensionInput.addEventListener('input', () => { prog.tension = Number(tensionInput.value); });
colorInput.addEventListener('input', () => { prog.color = Number(colorInput.value); });
bpmInput.addEventListener('change', () => {
  prog.bpm = Math.max(50, Math.min(200, Number(bpmInput.value) || 96));
  bpmInput.value = String(prog.bpm);
});
$('hints').addEventListener('click', () => {
  state.hints = !state.hints;
  $('hints').setAttribute('aria-pressed', String(state.hints));
  paintKeyboard();
});

update();
renderMidi();
void midi.init().then(() => {
  if (midi.outputId && state.sound) $('sound').click();
});
