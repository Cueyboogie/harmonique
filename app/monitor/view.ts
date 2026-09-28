/**
 * "I" — the backlit monitor look. Two colours, phosphor glow, every visible element is live:
 *   big key line      → key + scale (◂ ▸)
 *   sub line          → chord size · voice leading · spread · inversion (click to cycle)
 *   LOOP trace        → your take: a line that steps with each chord, sweep = playhead
 *   EUCLIDEAN trace   → the real pattern, one spike per hit, sweep = where the cycle is
 *   TEMPO box         → tempo (type it), ÷2 ×2 for a take, NOW / NEXT / ODDS
 *   SCOPE             → the 12 chords of your keyboard octave; tap or hold to play; hints glow
 * Same Controller as every other layout: this file only draws and forwards.
 */
import {
  SCALES, CHORD_SIZES, SPREADS, PRESETS, GROOVES, RATES, BLACK_PCS, noteLabel,
  patternSteps, grooveName, QUANTIZES, noteKeyMap, type Pattern, type ScaleId, type Quantize,
} from '../../engine';
import type { Controller } from '../controller';

const KEY_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const COMPUTER_KEYS = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK'];
const PHOSPHORS = [
  { name: 'AMBER', p: '#FF9E2C', bg: '#160A03' },
  { name: 'TEAL', p: '#47A8BD', bg: '#04100F' },
  { name: 'ROSE', p: '#C2847A', bg: '#140807' },
  { name: 'CREAM', p: '#EEE0CB', bg: '#12100C' },
];
const GATES = [0.25, 0.5, 0.8, 1];
const LOOP = { w: 640, h: 170, base: 154 };
const EU = { w: 640, h: 110, base: 82 };
const SCOPE = { cx: 197, cy: 112, r: 104, top: 64 };
const BAR_CHOICES: ('auto' | number)[] = ['auto', 1, 2, 4, 8, 16];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const up = (s: string) => s.toUpperCase();

export type HostMode = 'app' | 'web' | 'live';

export function mountMonitor(c: Controller, opts: { mode?: HostMode } = {}) {
  const mode: HostMode = opts.mode ?? 'app';
  let kbOctave = 4;
  let phos = 0;
  try { phos = Math.max(0, PHOSPHORS.findIndex((x) => x.name === localStorage.getItem('harmonic.phosphor'))); } catch { /* storage unavailable */ }
  const pointerSrc = new Map<number, string>();

  /* ---------- fit the fixed-size screen to the window ---------- */
  function fit() {
    const s = Math.min(window.innerWidth / 1240, window.innerHeight / 790, 1.35);
    $('fit').style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', fit);

  function applyPhosphor() {
    const ph = PHOSPHORS[phos];
    document.documentElement.style.setProperty('--p', ph.p);
    document.documentElement.style.setProperty('--bg', ph.bg);
    $('st-phos').textContent = `PHOSPHOR ${ph.name}`;
    try { localStorage.setItem('harmonic.phosphor', ph.name); } catch { /* ignore */ }
  }

  /* ---------- geometry helpers ---------- */
  // The loop's chord levels stretch to fill the trace, whatever keys the take uses.
  let lvRange = { lo: 0, hi: 11 };
  const levelOf = (keyPc: number | undefined) => {
    if (keyPc === undefined) return LOOP.base;
    const span = lvRange.hi - lvRange.lo;
    return span ? 146 - ((keyPc - lvRange.lo) / span) * 110 : 91;
  };
  const scopePos = (pc: number) => {
    const a = ((pc * 30 - 90) * Math.PI) / 180;
    return { x: SCOPE.cx + SCOPE.r * Math.cos(a), y: SCOPE.cy + SCOPE.r * Math.sin(a) };
  };

  /* ---------- render ---------- */
  function renderStatus() {
    const m = c.midi;
    if (mode === 'live') {
      const d = m as unknown as { inCount?: number; outCount?: number; lastIn?: string };
      $('st-midi').textContent = m.status !== 'ready' ? 'ABLETON ▸ NO MAX LINK' : `ABLETON ▸ IN ${d.inCount ?? 0}${d.lastIn ? ` (${d.lastIn})` : ''} · OUT ${d.outCount ?? 0}`;
      $('st-sync').hidden = $('st-sound').hidden = true;
      return;
    }
    $('st-sync').hidden = mode === 'web';
    if (mode === 'web' && m.status !== 'ready') { $('st-midi').textContent = 'MIDI KEYBOARD ▸ OPTIONAL (CHROME)'; $('st-sound').textContent = `SOUND ${c.synth.enabled ? 'ON' : 'OFF'}`; return; }
    $('st-midi').textContent = m.status === 'ready'
      ? `MIDI ▸ ${m.outputName ? up(m.outputName) : 'NO OUTPUT'}`
      : m.status === 'pending' ? 'MIDI ▸ ALLOW ACCESS' : 'MIDI ▸ LOCAL APP ONLY';
    $('st-sync').textContent = `SYNC ▸ ABLETON ${c.clockOut ? 'ON' : 'OFF'}`;
    $('st-sound').textContent = `BROWSER SOUND ${c.synth.enabled ? 'ON' : 'OFF'}`;
  }

  function renderKeyline() {
    $('root').textContent = noteLabel(c.scale.root);
    const scaleName = up(c.scale.def.name);
    $('scale').textContent = scaleName;
    $('scale').style.fontSize = scaleName.length > 14 ? '18px' : scaleName.length > 10 ? '22px' : scaleName.length > 7 ? '28px' : '';
    $('size').textContent = c.size === 'triad' ? 'TRIADS' : up(c.size);
    $('smooth').textContent = c.smooth ? 'SMOOTH' : 'FIXED';
    $('spread').textContent = up(c.spread);
    $('inv').textContent = ['ROOT', '1ST', '2ND', '3RD'][c.inversion];

  }

  function renderLoop() {
    const t = c.take;
    const svg = $('loop-svg');
    const note = $('loop-note');
    if (c.rec === 'armed') note.textContent = 'READY · PLAY YOUR FIRST CHORD';
    else if (c.rec === 'recording') note.textContent = 'RECORDING · STOP CLOSES THE LOOP';
    else note.textContent = t ? up(c.takeName) : 'PRESS REC, THEN PLAY CHORDS';
    const bars = c.bars;
    const barsTxt = (n: number) => `${n} ${n === 1 ? 'BAR' : 'BARS'}`;
    $('v-bars').textContent = !t ? 'AUTO' : c.loopBars === 'auto' ? `AUTO · ${barsTxt(bars)}` : barsTxt(bars);
    $('v-q').textContent = c.quantize === 'off' ? 'OFF' : c.quantize;
    for (const id of ['bars-prev', 'v-bars', 'bars-next']) ($(id) as HTMLButtonElement).disabled = !t || c.rec !== 'idle';
    if (!t || c.rec !== 'idle') {
      svg.innerHTML = `<path d="M0 ${LOOP.base} L${LOOP.w} ${LOOP.base}" stroke="var(--p)" stroke-width="2" stroke-opacity=".5" stroke-dasharray="${c.rec === 'idle' ? '4 6' : '0'}" fill="none"/>`;
      return;
    }
    const pcs = t.events.map((e) => e.keyPc ?? 0);
    lvRange = { lo: Math.min(...pcs), hi: Math.max(...pcs) };
    const W = LOOP.w;
    const x = (b: number) => (b / t.beats) * W;
    let d = `M0 ${LOOP.base}`;
    let labels = '';
    let cursor = 0;
    t.events.forEach((e) => {
      const xs = x(e.start), xe = x(e.start + e.length);
      const lv = levelOf(e.keyPc);
      if (xs > cursor + 1) d += ` L${xs.toFixed(1)} ${LOOP.base}`;
      d += ` L${xs.toFixed(1)} ${lv.toFixed(1)} L${(xs + 5).toFixed(1)} ${(lv - 22).toFixed(1)} L${(xs + 10).toFixed(1)} ${lv.toFixed(1)} L${Math.max(xs + 10, xe - 3).toFixed(1)} ${lv.toFixed(1)}`;
      if (xe - xs > 44) labels += `<text x="${(xs + 14).toFixed(1)}" y="${(lv - 10).toFixed(1)}" fill="var(--p)" stroke="none" style="font:400 16px var(--cond);letter-spacing:.04em">${esc(e.label ?? '')}</text>`;
      cursor = xe;
    });
    d += ` L${cursor.toFixed(1)} ${LOOP.base} L${W} ${LOOP.base}`;
    const ticks = Array.from({ length: bars + 1 }, (_, i) => `<line x1="${(i / bars) * W}" y1="${LOOP.h - 6}" x2="${(i / bars) * W}" y2="${LOOP.h + 2}" stroke="var(--p)" stroke-width="1.5"/>`).join('');
    svg.innerHTML = `<path d="${d}" fill="none" stroke="var(--p)" stroke-width="2" stroke-linejoin="round"/>${labels}${ticks}`;
  }

  function renderEuclid() {
    const p = c.pattern;
    const steps = patternSteps(p);
    const n = steps.length;
    const cw = EU.w / n;
    const b = EU.base;
    let d = `M0 ${b}`;
    steps.forEach((on, i) => {
      const x0 = i * cw;
      if (on) d += ` L${(x0 + cw * 0.18).toFixed(1)} ${b} L${(x0 + cw * 0.28).toFixed(1)} ${b + 8} L${(x0 + cw * 0.42).toFixed(1)} ${14} L${(x0 + cw * 0.56).toFixed(1)} ${b + 14} L${(x0 + cw * 0.68).toFixed(1)} ${b}`;
      d += ` L${(x0 + cw).toFixed(1)} ${b}`;
    });
    const ticks = steps.map((on, i) => `<rect data-step="${i}" x="${(i * cw + 2).toFixed(1)}" y="${EU.h - 6}" width="${(cw - 4).toFixed(1)}" height="6" rx="1.5" fill="var(--p)" fill-opacity="${on ? 1 : 0.22}" style="cursor:pointer"/>`).join('');
    $('eu-svg').innerHTML = `<path d="${d}" fill="none" stroke="var(--p)" stroke-width="2" stroke-linejoin="round" stroke-opacity="${c.euclidOn ? 1 : 0.3}"/>${ticks}`;
    const hits = steps.filter(Boolean).length;
    const name = grooveName(p);
    $('eu-title').textContent = `EUCLIDEAN E(${hits},${n})`;
    $('eu-note').textContent = c.euclidOn ? 'HOLD A CHORD: IT PLAYS ON EVERY SPIKE' : 'OFF · CHORDS PLAY WHEN YOU PRESS KEYS';
    $('v-steps').textContent = String(n);
    $('v-hits').textContent = String(hits);
    $('v-rot').textContent = String(p.rotate);
    $('v-rate').textContent = p.rate;
    $('v-gate').textContent = `${Math.round(p.gate * 100)}%`;
    $('v-groove').textContent = name ? up(name) : 'CUSTOM';
    $('eu-ctl').classList.toggle('dim', !c.euclidOn);
    $('eu-on').setAttribute('aria-checked', String(c.euclidOn));
    $('eu-off').setAttribute('aria-checked', String(!c.euclidOn));
  }

  function renderButtons() {
    const rec = $('rec');
    rec.dataset.state = c.rec;
    rec.classList.toggle('on', c.rec !== 'idle');
    rec.classList.toggle('blink', c.rec !== 'idle');
    $('rec-label').textContent = c.rec === 'idle' ? '● REC' : c.rec === 'armed' ? '● READY' : '■ STOP';
    rec.setAttribute('aria-label', c.rec === 'idle' ? 'Record' : c.rec === 'armed' ? 'Cancel recording' : 'Stop recording');
    const play = $<HTMLButtonElement>('play');
    play.disabled = !c.take;
    (rec as HTMLButtonElement).disabled = c.playMode === 'notes';
    rec.title = c.playMode === 'notes' ? 'The loop records chords. Switch KEYS PLAY to CHORDS to record.' : '';
    play.classList.toggle('on', c.playing);
    $('play-label').textContent = c.playing ? '■ STOP' : '▶ PLAY';
    ($('ideas') as HTMLButtonElement).disabled = false;
    const save = $<HTMLButtonElement>('save');
    save.disabled = !c.take;
    save.hidden = window.self !== window.top || mode === 'live'; // downloads are blocked inside shared pages; in Live, record the track
  }

  function renderTempo() {
    const bpm = $<HTMLInputElement>('bpm');
    if (document.activeElement !== bpm) bpm.value = String(Math.round(c.bpm));
    $('tempo-host').hidden = mode !== 'live';
    $('half').hidden = $('dbl').hidden = !c.take;
  }

  function renderScope() {
    const notes = c.playMode === 'notes';
    $('mode-chords').setAttribute('aria-checked', String(!notes));
    $('mode-notes').setAttribute('aria-checked', String(notes));
    $('scope-note').textContent = notes
      ? `EVERY KEY IN ${up(c.keyName)} · CH 2 · [ ] = IN THE CHORD`
      : 'TAP OR HOLD A CHORD · CH 1 · [ ] = GOOD NEXT';
    const cur = c.current?.keyPc;
    const lit = new Set<number>();
    for (const o of c.sounding.values()) if ((o.ch === 1) === notes) lit.add(o.keyPc);
    const hint = new Map<number, number>();
    const noteMap = noteKeyMap(c.scale);
    if (notes) {
      const tones = c.current?.slot.chord.pitchClasses ?? [];
      noteMap.forEach((k) => { if (tones.includes(k.pc)) hint.set(k.keyPc, 0); });
    } else if (cur !== undefined) c.hints.forEach((h) => { if (h.kind === 'likely') hint.set(h.keyPc, h.weight); });
    const lines = notes ? '' : [...hint.entries()].map(([pc, w]) => {
      const q = scopePos(pc);
      return `<line x1="${SCOPE.cx}" y1="${SCOPE.cy}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="var(--p)" stroke-width="${(1 + w * 6).toFixed(1)}" stroke-opacity="${(0.35 + w).toFixed(2)}"/>`;
    }).join('');
    let center = c.current ? esc(c.current.slot.chord.symbol) : '';
    if (notes) { const last = [...c.sounding.values()].reverse().find((o) => o.ch === 1); if (last) center = esc(last.label); }
    $('scope-svg').innerHTML = `<circle cx="${SCOPE.cx}" cy="${SCOPE.cy}" r="${SCOPE.r}" fill="none" stroke="var(--p)" stroke-opacity=".35" stroke-dasharray="2 5"/>
      <line x1="${SCOPE.cx - SCOPE.r}" y1="${SCOPE.cy}" x2="${SCOPE.cx + SCOPE.r}" y2="${SCOPE.cy}" stroke="var(--p)" stroke-opacity=".16"/>
      <line x1="${SCOPE.cx}" y1="${SCOPE.cy - SCOPE.r}" x2="${SCOPE.cx}" y2="${SCOPE.cy + SCOPE.r}" stroke="var(--p)" stroke-opacity=".16"/>
      ${lines}<circle cx="${SCOPE.cx}" cy="${SCOPE.cy}" r="40" fill="var(--bg)" stroke="var(--p)" stroke-width="2"/>
      <text x="${SCOPE.cx}" y="${SCOPE.cy + 6}" text-anchor="middle" fill="var(--p)" style="font:500 17px var(--cond)">${center}</text>`;
    $('scope-nodes').innerHTML = c.map.map((slot) => {
      const k = slot.keyPc;
      const q = scopePos(k);
      const nk = noteMap[k];
      const dimKey = notes ? !nk.inScale : BLACK_PCS.includes(k);
      const cls = ['node', notes ? 'sm' : '', dimKey ? 'black' : '', hint.has(k) ? 'hint' : '', lit.has(k) ? 'lit' : '', !notes && k === cur ? 'cur' : ''].join(' ');
      const main = notes ? nk.label : slot.chord.symbol;
      const aria = notes ? `${nk.label}, key ${KEY_NAMES[k]}` : `${slot.chord.symbol}, key ${KEY_NAMES[k]}`;
      return `<button type="button" class="${cls}" data-key="${k}" style="left:${q.x.toFixed(1)}px;top:${(q.y + SCOPE.top).toFixed(1)}px" aria-label="${esc(aria)}">${esc(main)}<small>${KEY_NAMES[k]}</small></button>`;
    }).join('');
  }

  function renderPanels() {
    const m = c.midi;
    $('midi-note').hidden = m.status === 'ready';
    $('midi-fields').hidden = m.status !== 'ready';
    if (m.status === 'ready') {
      const ins = $<HTMLSelectElement>('midi-in');
      const insHtml = `<option value="all">All inputs</option>` + m.inputs().map((p) => `<option value="${esc(p.id)}" ${m.isLoopInput(p.id) ? 'disabled' : ''}>${esc(p.name)}</option>`).join('');
      if (ins.dataset.html !== insHtml) { ins.innerHTML = insHtml; ins.dataset.html = insHtml; }
      if (document.activeElement !== ins) ins.value = m.inputId;
      const outs = $<HTMLSelectElement>('midi-out');
      const outsHtml = `<option value="">None</option>` + m.outputs().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
      if (outs.dataset.html !== outsHtml) { outs.innerHTML = outsHtml; outs.dataset.html = outsHtml; }
      if (document.activeElement !== outs) outs.value = m.outputId;
    }
    $('style').textContent = c.style === 'pop' ? 'POP ⇄' : 'BACH ⇄';
    const pr = $('presets');
    if (!pr.childElementCount) pr.innerHTML = PRESETS.map((p, i) => `<button type="button" data-preset="${i}" title="${esc(p.mood)}">${esc(p.name)}</button>`).join('');
  }

  function render() {
    renderStatus();
    renderKeyline();
    renderLoop();
    renderEuclid();
    renderButtons();
    renderTempo();
    renderScope();
    renderPanels();
  }

  /* ---------- animation: sweeps follow the real transport ---------- */
  function frame() {
    const lp = c.loopPosition();
    const ld = $('loop-dot');
    if (lp >= 0 && c.take && c.rec === 'idle') {
      const beat = lp * c.take.beats;
      const e = c.take.events.find((ev) => beat >= ev.start && beat < ev.start + ev.length);
      ld.style.left = `${lp * LOOP.w}px`;
      ld.style.top = `${e ? levelOf(e.keyPc) : LOOP.base}px`;
      ld.style.opacity = '1';
    } else ld.style.opacity = '0';
    const cp = c.cyclePosition();
    const ed = $('eu-dot');
    if (cp >= 0 && c.euclidOn) {
      ed.style.left = `${cp * EU.w}px`;
      ed.style.top = `${EU.base}px`;
      ed.style.opacity = '1';
    } else ed.style.opacity = '0';
    requestAnimationFrame(frame);
  }

  /* ---------- pattern edits ---------- */
  function edit(field: string, delta: number) {
    const p = c.pattern;
    const cur = patternSteps(p);
    const next: Pattern = { steps: cur.length, hits: cur.filter(Boolean).length, rotate: p.rotate, rate: p.rate, gate: p.gate };
    if (field === 'steps') { next.steps = Math.max(2, Math.min(16, next.steps + delta)); next.hits = Math.max(1, Math.min(next.hits, next.steps)); }
    if (field === 'hits') next.hits = Math.max(1, Math.min(next.steps, next.hits + delta));
    if (field === 'rotate') next.rotate = (((next.rotate + delta) % next.steps) + next.steps) % next.steps;
    c.setPattern(next);
  }
  function stepGroove(d: number) {
    const name = grooveName(c.pattern);
    const i = GROOVES.findIndex((g) => g.name === name);
    const j = (((i < 0 ? 0 : i) + d) % GROOVES.length + GROOVES.length) % GROOVES.length;
    c.setPattern({ ...GROOVES[j].pattern });
  }
  function toggleStep(i: number) {
    const s = patternSteps(c.pattern);
    s[i] = !s[i];
    c.setPattern({ ...c.pattern, custom: s, steps: s.length, hits: s.filter(Boolean).length });
  }

  /* ---------- wiring ---------- */
  const cycle = <T>(list: readonly T[], cur: T, d: number) => list[((list.indexOf(cur) + d) % list.length + list.length) % list.length];
  $('root-prev').onclick = () => c.set('rootPc', (c.rootPc + 11) % 12);
  $('root-next').onclick = () => c.set('rootPc', (c.rootPc + 1) % 12);
  const scaleIds = SCALES.map((s) => s.id) as ScaleId[];
  $('scale-prev').onclick = () => c.set('scaleId', cycle(scaleIds, c.scaleId, -1));
  $('scale-next').onclick = () => c.set('scaleId', cycle(scaleIds, c.scaleId, 1));
  $('opt-size').onclick = () => c.set('size', cycle(CHORD_SIZES, c.size, 1));
  $('opt-smooth').onclick = () => c.set('smooth', !c.smooth);
  $('opt-spread').onclick = () => c.set('spread', cycle(SPREADS, c.spread, 1));
  $('opt-inv').onclick = () => c.set('inversion', (c.inversion + 1) % (c.size === 'triad' ? 3 : 4));
  $('v-rate').onclick = () => c.setPattern({ ...c.pattern, rate: cycle(RATES, c.pattern.rate, 1) });
  $('v-gate').onclick = () => c.setPattern({ ...c.pattern, gate: GATES[(GATES.findIndex((g) => g >= c.pattern.gate - 0.01) + 1) % GATES.length] });
  $('groove-prev').onclick = () => stepGroove(-1);
  $('groove-next').onclick = () => stepGroove(1);
  $('eu-on').onclick = () => { c.synth.unlock(); c.setEuclid(true); };
  $('eu-off').onclick = () => c.setEuclid(false);
  $('mode-chords').onclick = () => c.setPlayMode('chords');
  $('mode-notes').onclick = () => c.setPlayMode('notes');
  const stepBars = (d: number) => {
    // From AUTO, move to the nearest length above/below what was played; past either end, back to AUTO.
    const nums = BAR_CHOICES.filter((x): x is number => x !== 'auto');
    const cur = c.loopBars === 'auto' ? c.bars : c.loopBars;
    const n = d > 0 ? nums.find((x) => x > cur) : [...nums].reverse().find((x) => x < cur);
    c.setLoopLength(n ?? 'auto');
  };
  $('bars-prev').onclick = () => stepBars(-1);
  $('bars-next').onclick = () => stepBars(1);
  $('v-bars').onclick = () => stepBars(1);
  const stepQ = (d: number) => c.setQuantize(cycle(QUANTIZES, c.quantize, d) as Quantize);
  $('q-prev').onclick = () => stepQ(-1);
  $('q-next').onclick = () => stepQ(1);
  $('v-q').onclick = () => stepQ(1);
  $('rec').onclick = () => { c.synth.unlock(); c.pressRecord(); };
  $('play').onclick = () => (c.playing ? c.stop() : c.play());
  $<HTMLInputElement>('bpm').onchange = (e) => c.setBpm(Number((e.target as HTMLInputElement).value) || c.bpm);
  $('half').onclick = () => c.reinterpretTake(0.5);
  $('dbl').onclick = () => c.reinterpretTake(2);
  $('st-sync').onclick = () => c.set('clockOut', !c.clockOut);
  $('st-sound').onclick = () => { c.synth.enabled = !c.synth.enabled; if (!c.synth.enabled) c.synth.allOff(); render(); };
  $('st-phos').onclick = () => { phos = (phos + 1) % PHOSPHORS.length; applyPhosphor(); };
  const openPanel = (id: string) => { for (const pid of ['panel-midi', 'panel-ideas']) $(pid).hidden = pid !== id || !$(pid).hidden; };
  $('st-midi').onclick = () => { if (mode !== 'live') openPanel('panel-midi'); };
  if (mode === 'web') {
    $('panel-intro').hidden = false;
    $('intro-go').onclick = () => { c.synth.unlock(); $('panel-intro').hidden = true; };
  }
  $('ideas').onclick = () => openPanel('panel-ideas');
  $('style').onclick = () => c.set('style', c.style === 'pop' ? 'bach' : 'pop');
  $('generate').onclick = () => { c.generate(); $('panel-ideas').hidden = true; };
  $('panic').onclick = () => c.panic();
  $<HTMLSelectElement>('midi-in').onchange = (e) => { c.midi.setInput((e.target as HTMLSelectElement).value); render(); };
  $<HTMLSelectElement>('midi-out').onchange = (e) => {
    c.midi.setOutput((e.target as HTMLSelectElement).value);
    if (c.midi.outputId && c.synth.enabled) { c.synth.enabled = false; c.synth.allOff(); }
    render();
  };
  $('save').onclick = () => {
    const f = c.midiFile();
    if (!f) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.bytes], { type: 'audio/midi' }));
    a.download = f.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const ed = t.closest<HTMLElement>('[data-edit]');
    if (ed) { const [f, d] = ed.dataset.edit!.split(':'); edit(f, Number(d)); return; }
    const st = t.closest<SVGElement>('[data-step]');
    if (st) { toggleStep(Number(st.getAttribute('data-step'))); return; }
    const pr = t.closest<HTMLElement>('[data-preset]');
    if (pr) { c.loadPreset(PRESETS[Number(pr.dataset.preset)]); $('panel-ideas').hidden = true; return; }
    if (t.closest('[data-close]')) { $('panel-midi').hidden = $('panel-ideas').hidden = $('panel-intro').hidden = true; }
  });

  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
    if (!el) return;
    e.preventDefault();
    const src = `ptr:${e.pointerId}`;
    pointerSrc.set(e.pointerId, src);
    c.keyDown(src, (kbOctave + 1) * 12 + Number(el.dataset.key), 100);
  });
  const release = (e: PointerEvent) => {
    const src = pointerSrc.get(e.pointerId);
    if (!src) return;
    pointerSrc.delete(e.pointerId);
    c.keyUp(src);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  const held = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (e.code === 'Escape') { $('panel-midi').hidden = $('panel-ideas').hidden = $('panel-intro').hidden = true; return; }
    if (e.code === 'Space' && (e.target as HTMLElement) === document.body) { e.preventDefault(); c.playing ? c.stop() : c.play(); return; }
    if (e.code === 'KeyZ' || e.code === 'KeyX') { kbOctave = Math.max(1, Math.min(7, kbOctave + (e.code === 'KeyX' ? 1 : -1))); return; }
    const i = COMPUTER_KEYS.indexOf(e.code);
    if (i < 0) return;
    e.preventDefault();
    held.add(e.code);
    c.keyDown(`ck:${e.code}`, (kbOctave + 1) * 12 + i, 100);
  });
  window.addEventListener('keyup', (e) => { if (held.delete(e.code)) c.keyUp(`ck:${e.code}`); });
  window.addEventListener('blur', () => { for (const k of held) c.keyUp(`ck:${k}`); held.clear(); });

  let queued = false;
  c.subscribe(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });
  applyPhosphor();
  fit();
  render();
  requestAnimationFrame(frame);
  void c.midi.init().then(() => {
    if (c.midi.outputId && c.synth.enabled) c.synth.enabled = false;
    render();
  });
}
