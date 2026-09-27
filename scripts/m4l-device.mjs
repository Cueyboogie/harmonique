// Writes the Max for Live MIDI Effect (.amxd) that hosts the Harmonique page in a [jweb].
//
//   track MIDI ─► [midiin] ─► [midiparse] ─ notes ─► page ("note p v")
//                                └ CC / bend / aftertouch ─► [midiformat] ─► [midiout]   (pass-through)
//   page ─ "midi status d1 d2 delay" ─► [pipe] ─► [pack] ─► [iter] ─► [midiout]
//   Live set ─► [live.observer tempo / is_playing] ─► page ("tempo", "liveplay")
//
// The page lives in a floating window (a device is only 169 px tall), opened from the device's OPEN button.
// .amxd = "ampf" header + device type + meta + "ptch" chunk holding the patcher JSON.

let n = 0;
const mk = () => {
  const boxes = [], lines = [];
  const box = (maxclass, text, rect, extra = {}) => {
    const id = `obj-${++n}`;
    boxes.push({ box: { id, maxclass, ...(text !== null ? { text } : {}), patching_rect: rect, ...extra } });
    return id;
  };
  const obj = (text, x, y, ins, outs, extra = {}) => box('newobj', text, [x, y, Math.max(40, text.length * 7 + 16), 22], { numinlets: ins, numoutlets: outs, ...extra });
  const msg = (text, x, y, extra = {}) => box('message', text, [x, y, Math.max(40, text.length * 7 + 16), 22], { numinlets: 2, numoutlets: 1, outlettype: [''], ...extra });
  const link = (a, ao, b, bi) => lines.push({ patchline: { source: [a, ao], destination: [b, bi] } });
  return { boxes, lines, box, obj, msg, link };
};

const base = (extra) => ({
  fileversion: 1,
  appversion: { major: 8, minor: 6, revision: 0, architecture: 'x64', modernui: 1 },
  classnamespace: 'box',
  default_fontsize: 12, default_fontface: 0, default_fontname: 'Arial Bold',
  gridonopen: 1, gridsize: [15, 15], gridsnaponopen: 1, toolbarvisible: 1,
  ...extra,
});

export function buildDevice(htmlUrl) {
  /* ---------- the floating window: [jweb] running Harmonique ---------- */
  const w = mk();
  const inl = w.box('inlet', null, [20, 800, 30, 30], { numinlets: 0, numoutlets: 1, outlettype: [''], comment: '' });
  const rIn = w.obj('r ---harmIn', 20, 850, 0, 1, { outlettype: [''] });
  const web = w.box('jweb', null, [0, 0, 1200, 760], {
    numinlets: 1, numoutlets: 1, outlettype: [''], presentation: 1, presentation_rect: [0, 0, 1200, 760], rendermode: 0,
  });
  const sOut = w.obj('s ---harmOut', 20, 900, 1, 0);
  const lb = w.obj('loadbang', 200, 800, 1, 1, { outlettype: ['bang'] });
  const url = w.msg(`url ${htmlUrl}`, 200, 850);
  const win = w.msg('window size 60 80 1260 840, window flags nogrow, window flags nozoom, window exec', 200, 900);
  const tp = w.obj('thispatcher', 200, 950, 1, 2, { outlettype: ['', ''], save: ['#N', 'thispatcher', ';', '#Q', 'end', ';'] });
  void inl;
  w.link(rIn, 0, web, 0);
  w.link(web, 0, sOut, 0);
  w.link(lb, 0, url, 0);
  w.link(url, 0, web, 0);
  w.link(lb, 0, win, 0);
  w.link(win, 0, tp, 0);
  const windowPatcher = base({
    rect: [60, 80, 1260, 840], openinpresentation: 1, toolbarvisible: 0, statusbarvisible: 0,
    boxes: w.boxes, lines: w.lines,
  });

  /* ---------- the device ---------- */
  const d = mk();
  const midiin = d.obj('midiin', 20, 20, 1, 1, { outlettype: ['int'] });
  const parse = d.obj('midiparse', 20, 60, 1, 8, { outlettype: ['', '', '', 'int', 'int', '', 'int', ''] });
  const prep = d.obj('prepend note', 20, 110, 1, 1, { outlettype: [''] });
  const sIn = d.obj('s ---harmIn', 20, 150, 1, 0);
  const fmt = d.obj('midiformat', 200, 110, 7, 1, { outlettype: ['int'] });
  const out1 = d.obj('midiout', 200, 150, 1, 0);
  d.link(midiin, 0, parse, 0);
  d.link(parse, 0, prep, 0);
  d.link(prep, 0, sIn, 0);
  for (let i = 1; i <= 5; i++) d.link(parse, i, fmt, i);
  d.link(fmt, 0, out1, 0);

  const rOut = d.obj('r ---harmOut', 20, 220, 0, 1, { outlettype: [''] });
  const route = d.obj('route midi', 20, 260, 2, 2, { outlettype: ['', ''] });
  const iter = d.obj('iter', 20, 380, 1, 1, { outlettype: [''] });
  const out2 = d.obj('midiout', 20, 420, 1, 0);
  d.link(rOut, 0, route, 0);
  d.link(route, 0, iter, 0);
  // Activity lights on the device: IN = notes from the track reached the window, OUT = the window sent MIDI.
  const light = (label, x) => {
    const b = d.box('button', null, [x, 470, 24, 24], { numinlets: 1, numoutlets: 1, outlettype: ['bang'], presentation: 1, presentation_rect: [x === 20 ? 10 : 90, 140, 18, 18], blinkcolor: [1, 0.62, 0.17, 1], outlinecolor: [1, 0.62, 0.17, 0.6], bgcolor: [0.086, 0.039, 0.012, 1] });
    d.box('comment', label, [x + 30, 470, 40, 20], { numinlets: 1, numoutlets: 0, presentation: 1, presentation_rect: [x === 20 ? 32 : 112, 140, 40, 18], fontsize: 10, fontname: 'Arial Bold', textcolor: [1, 0.62, 0.17, 1] });
    return b;
  };
  const inLight = light('IN', 20);
  const outLight = light('OUT', 120);
  const tbIn = d.obj('t b', 120, 110, 1, 1, { outlettype: ['bang'] });
  const tbOut = d.obj('t b', 120, 300, 1, 1, { outlettype: ['bang'] });
  d.link(prep, 0, tbIn, 0);
  d.link(tbIn, 0, inLight, 0);
  d.link(route, 0, tbOut, 0);
  d.link(tbOut, 0, outLight, 0);
  d.link(iter, 0, out2, 0);

  const dev = d.obj('live.thisdevice', 400, 20, 1, 3, { outlettype: ['bang', 'int', 'int'] });
  const tbb = d.obj('t b b', 400, 60, 1, 2, { outlettype: ['bang', 'bang'] });
  const pTempo = d.msg('property tempo', 520, 100);
  const pPlay = d.msg('property is_playing', 650, 100);
  const path = d.msg('path live_set', 400, 100);
  const lpath = d.obj('live.path', 400, 140, 1, 3, { outlettype: ['', '', ''] });
  const obsT = d.obj('live.observer', 520, 180, 2, 2, { outlettype: ['', ''] });
  const obsP = d.obj('live.observer', 650, 180, 2, 2, { outlettype: ['', ''] });
  const prT = d.obj('prepend tempo', 520, 220, 1, 1, { outlettype: [''] });
  const prP = d.obj('prepend liveplay', 650, 220, 1, 1, { outlettype: [''] });
  const sIn2 = d.obj('s ---harmIn', 580, 260, 1, 0);
  d.link(dev, 0, tbb, 0);
  d.link(tbb, 1, pTempo, 0);
  d.link(tbb, 1, pPlay, 0);
  d.link(pTempo, 0, obsT, 0);
  d.link(pPlay, 0, obsP, 0);
  d.link(tbb, 0, path, 0);
  d.link(path, 0, lpath, 0);
  d.link(lpath, 0, obsT, 1);
  d.link(lpath, 0, obsP, 1);
  d.link(obsT, 0, prT, 0);
  d.link(obsP, 0, prP, 0);
  d.link(prT, 0, sIn2, 0);
  d.link(prP, 0, sIn2, 0);
  // Re-send the tempo / play state a moment after the page has loaded.
  const del = d.obj('delay 2500', 400, 260, 2, 1, { outlettype: ['bang'] });
  d.link(dev, 0, del, 0);
  d.link(del, 0, tbb, 0);

  // OPEN button → floating window (also opens once when the device loads).
  const title = d.box('comment', 'HARMONIQUE', [800, 20, 150, 24], {
    numinlets: 1, numoutlets: 0, presentation: 1, presentation_rect: [10, 8, 170, 26], fontsize: 18, fontname: 'Arial Bold', textcolor: [1, 0.62, 0.17, 1],
  });
  const sub = d.box('comment', 'chords · notes · euclidean', [800, 50, 170, 20], {
    numinlets: 1, numoutlets: 0, presentation: 1, presentation_rect: [10, 34, 170, 20], fontsize: 10, fontname: 'Arial', textcolor: [1, 0.62, 0.17, 0.8],
  });
  const btn = d.box('live.text', 'OPEN WINDOW', [800, 90, 120, 30], {
    numinlets: 1, numoutlets: 2, outlettype: ['', ''], mode: 0, parameter_enable: 0, text: 'OPEN WINDOW', texton: 'OPEN WINDOW',
    presentation: 1, presentation_rect: [10, 70, 160, 34],
    activebgcolor: [0.086, 0.039, 0.012, 1], bgcolor: [0.086, 0.039, 0.012, 1], textcolor: [1, 0.62, 0.17, 1], activetextcolor: [0.086, 0.039, 0.012, 1], bordercolor: [1, 0.62, 0.17, 1],
  });
  const hint = d.box('comment', 'tempo & play follow Live', [800, 130, 170, 20], {
    numinlets: 1, numoutlets: 0, presentation: 1, presentation_rect: [10, 112, 170, 20], fontsize: 10, fontname: 'Arial', textcolor: [1, 0.62, 0.17, 0.7],
  });
  void title; void sub; void hint;
  const tb = d.obj('t b', 800, 170, 1, 1, { outlettype: ['bang'] });
  const lb2 = d.obj('loadbang', 950, 90, 1, 1, { outlettype: ['bang'] });
  const del2 = d.obj('delay 400', 950, 130, 2, 1, { outlettype: ['bang'] });
  const open = d.msg('open', 800, 210);
  const pc = d.obj('pcontrol', 800, 250, 1, 1, { outlettype: [''] });
  const p = d.box('newobj', 'p harmonique_window', [800, 290, 160, 22], { numinlets: 1, numoutlets: 0, patcher: windowPatcher, saved_object_attributes: { description: '', digest: '', globalpatchername: '', tags: '' } });
  d.link(btn, 0, tb, 0);
  d.link(lb2, 0, del2, 0);
  d.link(del2, 0, tb, 0);
  d.link(tb, 0, open, 0);
  d.link(open, 0, pc, 0);
  d.link(pc, 0, p, 0);

  const patcher = base({
    rect: [100, 100, 1100, 600], openinpresentation: 1, devicewidth: 190,
    boxes: d.boxes, lines: d.lines, dependency_cache: [], latency: 0, is_mpe: 0, oscreceiveudpport: 0, oscsendudpport: 0,
  });
  const json = Buffer.from(JSON.stringify({ patcher }, null, '\t') + '\n', 'utf8');
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  return Buffer.concat([
    Buffer.from('ampf'), u32(4), Buffer.from('mmmm'),
    Buffer.from('meta'), u32(4), u32(0),
    Buffer.from('ptch'), u32(json.length), json,
  ]);
}
