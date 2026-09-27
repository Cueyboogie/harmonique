/**
 * The "H" layout: Orbit on cream, in Diego's palette.
 * Pure view: reads Controller state, calls Controller actions. Swap this file for another
 * layout without touching behaviour.
 */
import {
  SCALES, CHORD_SIZES, SPREADS, PRESETS, GROOVES, RATES, WHITE_PCS, BLACK_PCS, noteLabel,
  scaleFromPitchClass, patternSteps, toggleStep, grooveName, cycleBeats,
  type Pattern, type Rate, type ScaleId, type ChordSize, type Spread, type TriadQuality,
} from '../engine';
import type { Controller } from './controller';

const PAL = { char: '#565656', rose: '#C2847A', cream: '#EEE0CB', sky: '#A0C1D1', teal: '#47A8BD' };
const QC: Record<TriadQuality, string> = { major: PAL.rose, minor: PAL.teal, diminished: PAL.sky, augmented: PAL.sky };
const KEY_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const COMPUTER_KEYS = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK'];
const ORBIT = { w: 620, h: 500, cx: 310, cy: 246, r: 188 };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** Replace a select's options only when they actually change (keeps an open dropdown open). */
function setOptions(el: HTMLSelectElement, html: string, value: string) {
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  if (document.activeElement !== el) el.value = value;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function mountView(c: Controller) {
  let kbOctave = 4; // computer keys start at C3 (Ableton names)
  const pointerSrc = new Map<number, string>();

  /* ---------- top bar ---------- */
  function renderTop() {
    setOptions($<HTMLSelectElement>('sel-root'), Array.from({ length: 12 }, (_, pc) => `<option value="${pc}">${noteLabel(scaleFromPitchClass(pc, c.scaleId).root)}</option>`).join(''), String(c.rootPc));
    setOptions($<HTMLSelectElement>('sel-scale'), SCALES.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join(''), c.scaleId);
    setOptions($<HTMLSelectElement>('sel-size'), CHORD_SIZES.map((s) => `<option value="${s}">${s === 'triad' ? 'Triads' : s}</option>`).join(''), c.size);
    $('scale-mood').textContent = c.scale.def.mood;

    segs('seg-inv', [0, 1, 2, 3], c.inversion, (i) => ['Root', '1st', '2nd', '3rd'][i], (i) => c.set('inversion', i), (i) => c.size === 'triad' && i === 3);
    segs('seg-spread', SPREADS, c.spread, (s) => s[0].toUpperCase() + s.slice(1), (s) => c.set('spread', s as Spread));
    segs('seg-smooth', [true, false], c.smooth, (v) => (v ? 'Smooth' : 'Off'), (v) => c.set('smooth', v));
    segs('seg-style', ['pop', 'bach'] as const, c.style, (s) => (s === 'pop' ? 'Pop' : 'Bach'), (s) => c.set('style', s));

    const bpm = $<HTMLInputElement>('bpm');
    if (document.activeElement !== bpm) bpm.value = String(c.bpm);
    const detected = !!c.take && c.take.tempoSource === 'detected';
    $('bpm-badge').hidden = !detected;
    $('bpm-x2').hidden = $('bpm-half').hidden = !c.take;
    const clock = $('clock');
    clock.setAttribute('aria-pressed', String(c.clockOut));
    clock.textContent = c.clockOut ? 'Sync: on' : 'Sync: off';

    // MIDI
    const m = c.midi;
    const status = $('midi-status');
    if (m.status !== 'ready') {
      status.textContent = m.status === 'pending' ? 'MIDI: allow access' : 'MIDI: local app only';
      $('midi-fields').hidden = true;
      $('midi-note').hidden = false;
    } else {
      status.textContent = m.outputName ? 'MIDI → ' + m.outputName : 'MIDI: no output';
      $('midi-fields').hidden = false;
      $('midi-note').hidden = true;
      setOptions($<HTMLSelectElement>('midi-in'), `<option value="all">All inputs</option>` + m.inputs().map((p) =>
        `<option value="${esc(p.id)}" ${m.isLoopInput(p.id) ? 'disabled' : ''}>${esc(p.name)}${m.isLoopInput(p.id) ? ' (Harmonique output)' : ''}</option>`).join(''), m.inputId);
      setOptions($<HTMLSelectElement>('midi-out'), `<option value="">None</option>` + m.outputs().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''), m.outputId);
    }
    const snd = $('sound');
    snd.setAttribute('aria-pressed', String(c.synth.enabled));
    snd.textContent = c.synth.enabled ? 'Browser sound on' : 'Browser sound off';
  }

  function segs<T>(id: string, items: readonly T[], cur: T, label: (v: T) => string, pick: (v: T) => void, disabled: (v: T) => boolean = () => false) {
    const el = $(id);
    el.innerHTML = '';
    items.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg';
      b.textContent = label(v);
      b.disabled = disabled(v);
      b.setAttribute('aria-pressed', String(v === cur));
      b.onclick = () => pick(v);
      el.appendChild(b);
    });
  }

  /* ---------- orbit ---------- */
  function pos(pc: number) {
    const a = ((pc * 30 - 90) * Math.PI) / 180;
    return { x: ORBIT.cx + ORBIT.r * Math.cos(a), y: ORBIT.cy + ORBIT.r * Math.sin(a) };
  }
  function hintMap() {
    const m = new Map<number, { pct: number; rank: number; spice: boolean }>();
    c.hints.forEach((h, i) => m.set(h.keyPc, { pct: Math.round(h.weight * 100), rank: i + 1, spice: h.kind === 'spice' }));
    return m;
  }
  function soundingPcs() {
    const s = new Set<number>();
    for (const o of c.sounding.values()) s.add(o.keyPc);
    return s;
  }

  function renderOrbit() {
    const hm = hintMap();
    const lit = soundingPcs();
    const cur = c.current?.keyPc;
    const lines = [...hm.entries()].filter(([, h]) => !h.spice).map(([pc, h]) => {
      const p = pos(pc);
      return `<line x1="${ORBIT.cx}" y1="${ORBIT.cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${PAL.char}" stroke-width="${(1.5 + h.pct / 10).toFixed(1)}" stroke-opacity="${(0.25 + h.pct / 120).toFixed(2)}" stroke-linecap="round"/>`;
    }).join('');
    $('orbit-svg').innerHTML = `<circle cx="${ORBIT.cx}" cy="${ORBIT.cy}" r="${ORBIT.r}" fill="none" stroke="rgba(86,86,86,.25)"/>` + (cur !== undefined ? lines : '');

    const nodes = c.map.map((slot) => {
      const pc = slot.keyPc;
      const p = pos(pc);
      const black = BLACK_PCS.includes(pc);
      const size = black ? 62 : 82;
      const h = cur !== undefined ? hm.get(pc) : undefined;
      const q = QC[slot.chord.triad];
      const cls = ['node', black ? 'node-color' : 'node-scale', h ? 'is-hint' : '', lit.has(pc) ? 'is-lit' : '', pc === cur ? 'is-cur' : ''].join(' ');
      const glow = h && !h.spice ? `box-shadow:0 0 0 ${Math.round(3 + h.pct / 6)}px ${q}55, 0 0 ${Math.round(16 + h.pct)}px ${q};` : '';
      return `<button type="button" class="${cls}" data-key="${pc}" aria-label="${esc(slot.chord.symbol)}, ${esc(slot.role)}, key ${KEY_NAMES[pc]}"
        style="left:${(p.x - size / 2).toFixed(1)}px;top:${(p.y - size / 2).toFixed(1)}px;width:${size}px;height:${size}px;--q:${q};${glow}">
        <span class="node-sym">${esc(slot.chord.symbol)}</span><span class="node-key">key ${KEY_NAMES[pc]}</span>
        ${h ? `<span class="node-pct">${h.spice ? '✦' : h.pct + '%'}</span>` : ''}</button>`;
    }).join('');
    $('orbit-nodes').innerHTML = nodes;

    const core = $('core');
    if (c.current) {
      const s = c.current.slot;
      core.style.setProperty('--q', QC[s.chord.triad]);
      core.innerHTML = `<span class="core-now">Now</span><span class="core-sym">${esc(s.chord.symbol)}</span><span class="core-sub">${esc(s.chord.roman)} · key ${KEY_NAMES[s.keyPc]}</span>`;
      core.classList.remove('is-empty');
    } else {
      core.innerHTML = `<span class="core-sub">Play any key</span>`;
      core.classList.add('is-empty');
    }
  }

  /* ---------- keyboard strip ---------- */
  function renderStrip() {
    const hm = hintMap();
    const lit = soundingPcs();
    const cur = c.current?.keyPc;
    const key = (pc: number) => {
      const slot = c.map[pc];
      const black = BLACK_PCS.includes(pc);
      const h = cur !== undefined ? hm.get(pc) : undefined;
      const w = WHITE_PCS.indexOf(pc);
      const bi = [1, 2, 4, 5, 6][BLACK_PCS.indexOf(pc)];
      const style = black ? `left:calc(${(bi * 100) / 7}% - 30px)` : `left:${(w * 100) / 7}%`;
      return `<button type="button" class="k ${black ? 'k-black' : 'k-white'}${lit.has(pc) ? ' is-lit' : ''}${pc === cur ? ' is-cur' : ''}${h ? ' is-hint' : ''}"
        data-key="${pc}" style="${style};--q:${QC[slot.chord.triad]}" aria-label="Key ${KEY_NAMES[pc]}: ${esc(slot.chord.symbol)}">
        ${h ? `<span class="k-hint">${h.spice ? '✦' : h.rank}</span>` : ''}
        <span class="k-sym">${esc(slot.chord.symbol)}</span><span class="k-name">${KEY_NAMES[pc]}</span></button>`;
    };
    $('strip').innerHTML = WHITE_PCS.map(key).join('') + BLACK_PCS.map(key).join('');
  }

  /* ---------- rhythm ---------- */
  function renderRhythm() {
    const on = c.euclidOn;
    const p = c.pattern;
    const card = $('rhythm');
    card.classList.toggle('is-off', !on);
    const sw = $('eu-switch');
    sw.setAttribute('aria-checked', String(on));
    $('eu-state').textContent = on ? 'On' : 'Off';
    $('eu-help').textContent = on
      ? 'Hold a chord: it plays in this pattern. Change keys any time.'
      : 'Off: chords play when you press keys. Turn on to play them in a pattern.';

    const steps = patternSteps(p);
    const R = 120, C = 150;
    const pts = steps.map((hit, i) => {
      const a = ((i / steps.length) * 360 - 90) * (Math.PI / 180);
      return { hit, i, x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
    });
    const hits = pts.filter((q) => q.hit);
    const poly = hits.length > 1 ? `<polygon points="${hits.map((q) => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ')}" fill="${PAL.rose}" fill-opacity=".16" stroke="${PAL.rose}" stroke-width="2" stroke-linejoin="round"/>` : '';
    $('ring-svg').innerHTML = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="rgba(86,86,86,.3)"/>${poly}
      <line id="ring-hand" x1="${C}" y1="${C}" x2="${C}" y2="${C - R + 16}" stroke="${PAL.char}" stroke-width="2" stroke-linecap="round" opacity="0"/>
      <circle cx="${C}" cy="${C}" r="4" fill="${PAL.char}"/>`;
    $('ring-dots').innerHTML = pts.map((q) => `<button type="button" class="dot${q.hit ? ' is-hit' : ''}" data-step="${q.i}"
      style="left:${(q.x - 14).toFixed(1)}px;top:${(q.y - 14).toFixed(1)}px" aria-pressed="${q.hit}" aria-label="Step ${q.i + 1}${q.hit ? ', hit' : ''}"></button>`).join('');

    const name = grooveName(p);
    $('grooves').innerHTML = GROOVES.map((g, i) => `<button type="button" class="chip" data-groove="${i}" aria-pressed="${name === g.name}">${g.name}</button>`).join('')
      + (name ? '' : `<span class="chip chip-static" aria-current="true">Custom</span>`);
    $('v-steps').textContent = String(steps.length);
    $('v-hits').textContent = String(steps.filter(Boolean).length);
    $('v-rot').textContent = String(p.rotate);
    segs('seg-rate', RATES, p.rate, (r) => r, (r) => c.setPattern({ ...p, rate: r as Rate }));
    const gate = $<HTMLInputElement>('gate');
    if (document.activeElement !== gate) gate.value = String(p.gate);
    $('cycle-info').textContent = `${steps.length} steps of ${p.rate} = ${cycleBeats(p) / 4 === 1 ? '1 bar' : cycleBeats(p) / 4 + ' bars'}`;
  }

  function editPattern(field: 'steps' | 'hits' | 'rotate', delta: number) {
    const p = c.pattern;
    const steps = patternSteps(p).length;
    const base: Pattern = { steps, hits: patternSteps(p).filter(Boolean).length, rotate: p.rotate, rate: p.rate, gate: p.gate };
    if (field === 'steps') { base.steps = Math.max(2, Math.min(16, steps + delta)); base.hits = Math.min(base.hits, base.steps); }
    if (field === 'hits') base.hits = Math.max(1, Math.min(base.steps, base.hits + delta));
    if (field === 'rotate') base.rotate = ((base.rotate + delta) % base.steps + base.steps) % base.steps;
    c.setPattern(base);
  }

  /* ---------- loop ---------- */
  function renderLoop() {
    const rec = $('rec');
    rec.dataset.state = c.rec;
    rec.setAttribute('aria-label', c.rec === 'idle' ? 'Record' : c.rec === 'armed' ? 'Cancel record' : 'Stop recording');
    const t = c.take;
    $('loop-title').textContent = c.rec === 'armed' ? 'Ready…' : c.rec === 'recording' ? 'Recording' : t ? c.takeName : 'No loop yet';
    $('loop-sub').textContent = c.rec === 'armed' ? 'Starts with your first chord'
      : c.rec === 'recording' ? 'Press stop when the loop should end'
      : t ? `${t.beats / 4} ${t.beats === 4 ? 'bar' : 'bars'} · ${Math.round(t.bpm)} BPM${t.tempoSource === 'detected' ? ' from your playing' : ''}`
      : 'Press record and play';
    const lane = $('loop-lane');
    if (!t || c.rec !== 'idle') {
      lane.innerHTML = `<div class="loop-empty">${c.rec === 'idle' ? 'Record a take, or pick an idea' : c.rec === 'armed' ? 'Waiting for your first chord' : '● recording what you play'}</div>`;
    } else {
      const bars = t.beats / 4;
      const grid = Array.from({ length: bars }, (_, i) => `<span class="bar" style="left:${(i * 100) / bars}%"><span>${i + 1}</span></span>`).join('');
      const ev = t.events.map((e) => {
        const q = e.keyPc !== undefined ? QC[c.map[e.keyPc].chord.triad] : PAL.char;
        return `<div class="ev" style="left:${(e.start / t.beats) * 100}%;width:max(3px, calc(${(e.length / t.beats) * 100}% - 2px));--q:${q}"><span>${esc(e.label ?? '')}</span></div>`;
      }).join('');
      lane.innerHTML = grid + ev + `<div id="playhead" class="playhead"></div>`;
    }
    const play = $('play');
    play.setAttribute('aria-label', c.playing ? 'Stop loop' : 'Play loop');
    play.dataset.state = c.playing ? 'playing' : 'stopped';
    ($('play') as HTMLButtonElement).disabled = !t;
    ($('save') as HTMLButtonElement).disabled = !t;
    ($('clear') as HTMLButtonElement).disabled = !t;
    $('save').hidden = window.self !== window.top; // downloads are blocked in shared pages
    $('presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}" title="${esc(p.mood)}">${esc(p.name)}</button>`).join('');
  }

  function render() {
    renderTop();
    renderOrbit();
    renderStrip();
    renderRhythm();
    renderLoop();
  }

  /* ---------- animation: playhead + ring hand ---------- */
  function frame() {
    const ph = document.getElementById('playhead');
    const lp = c.loopPosition();
    if (ph) { ph.style.left = `${Math.max(0, lp) * 100}%`; ph.style.opacity = lp < 0 ? '0' : '1'; }
    const hand = document.getElementById('ring-hand');
    const cp = c.cyclePosition();
    if (hand) {
      hand.setAttribute('opacity', cp < 0 || !c.euclidOn ? '0' : '.85');
      hand.setAttribute('transform', `rotate(${(Math.max(0, cp) * 360).toFixed(1)} 150 150)`);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- wiring ---------- */
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
    if (!el) return;
    e.preventDefault();
    const pc = Number(el.dataset.key);
    const src = `ptr:${e.pointerId}`;
    pointerSrc.set(e.pointerId, src);
    c.keyDown(src, (kbOctave + 1) * 12 + pc, 100);
  });
  const up = (e: PointerEvent) => {
    const src = pointerSrc.get(e.pointerId);
    if (!src) return;
    pointerSrc.delete(e.pointerId);
    c.keyUp(src);
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const dot = t.closest<HTMLElement>('[data-step]');
    if (dot) { c.setPattern(toggleStep(c.pattern, Number(dot.dataset.step))); return; }
    const g = t.closest<HTMLElement>('[data-groove]');
    if (g) { c.setPattern({ ...GROOVES[Number(g.dataset.groove)].pattern }); return; }
    const pr = t.closest<HTMLElement>('[data-preset]');
    if (pr) { c.loadPreset(PRESETS[Number(pr.dataset.preset)]); ($('ideas') as HTMLDetailsElement).open = false; return; }
    const ed = t.closest<HTMLElement>('[data-edit]');
    if (ed) { const [f, d] = ed.dataset.edit!.split(':'); editPattern(f as 'steps', Number(d)); }
  });

  const held = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
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

  $<HTMLSelectElement>('sel-root').onchange = (e) => c.set('rootPc', Number((e.target as HTMLSelectElement).value));
  $<HTMLSelectElement>('sel-scale').onchange = (e) => c.set('scaleId', (e.target as HTMLSelectElement).value as ScaleId);
  $<HTMLSelectElement>('sel-size').onchange = (e) => c.set('size', (e.target as HTMLSelectElement).value as ChordSize);
  $<HTMLInputElement>('bpm').onchange = (e) => c.setBpm(Number((e.target as HTMLInputElement).value) || c.bpm);
  $('bpm-x2').onclick = () => c.reinterpretTake(2);
  $('bpm-half').onclick = () => c.reinterpretTake(0.5);
  $('clock').onclick = () => c.set('clockOut', !c.clockOut);
  $('sound').onclick = () => { c.synth.enabled = !c.synth.enabled; if (!c.synth.enabled) c.synth.allOff(); render(); };
  $<HTMLSelectElement>('midi-in').onchange = (e) => { c.midi.setInput((e.target as HTMLSelectElement).value); render(); };
  $<HTMLSelectElement>('midi-out').onchange = (e) => {
    c.midi.setOutput((e.target as HTMLSelectElement).value);
    if (c.midi.outputId && c.synth.enabled) { c.synth.enabled = false; c.synth.allOff(); }
    render();
  };
  $('panic').onclick = () => c.panic();
  $('eu-switch').onclick = () => c.setEuclid(!c.euclidOn);
  $<HTMLInputElement>('gate').oninput = (e) => c.setPattern({ ...c.pattern, gate: Number((e.target as HTMLInputElement).value) });
  $('rec').onclick = () => { c.synth.unlock(); c.pressRecord(); };
  $('play').onclick = () => (c.playing ? c.stop() : c.play());
  $('clear').onclick = () => c.clearTake();
  $('generate').onclick = () => { c.generate(); ($('ideas') as HTMLDetailsElement).open = false; };
  $('save').onclick = () => {
    const f = c.midiFile();
    if (!f) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.bytes], { type: 'audio/midi' }));
    a.download = f.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  let queued = false;
  c.subscribe(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });
  render();
  requestAnimationFrame(frame);
  void c.midi.init().then(() => {
    if (c.midi.outputId && c.synth.enabled) { c.synth.enabled = false; }
    render();
  });
}
