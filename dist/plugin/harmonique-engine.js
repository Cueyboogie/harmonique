"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // app/plugin/timers.ts
  var native = globalThis.__native;
  var timers = /* @__PURE__ */ new Map();
  var nextId = 1;
  function add(fn, ms, every) {
    const id = nextId++;
    const d = Math.max(0, Number(ms) || 0);
    timers.set(id, { id, due: native.now() + d, fn, every: every ? Math.max(1, d) : 0 });
    return id;
  }
  function runTimers() {
    for (let guard = 0; guard < 1e4; guard++) {
      const now = native.now();
      let next = null;
      for (const t of timers.values()) if (t.due <= now && (!next || t.due < next.due || t.due === next.due && t.id < next.id)) next = t;
      if (!next) return;
      if (next.every) next.due = Math.max(next.due + next.every, now);
      else timers.delete(next.id);
      try {
        next.fn();
      } catch (e) {
        native.log(`timer: ${String(e)}`);
      }
    }
  }
  var g = globalThis;
  g.window = globalThis;
  g.performance = { now: () => native.now() };
  g.setTimeout = (fn, ms) => add(fn, ms, false);
  g.setInterval = (fn, ms) => add(fn, ms, true);
  g.clearTimeout = g.clearInterval = (id) => {
    if (id !== void 0) timers.delete(id);
  };
  g.console = { log: (...a) => native.log(a.join(" ")), warn: (...a) => native.log(a.join(" ")), error: (...a) => native.log(a.join(" ")) };

  // engine/notes.ts
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  var mod = (n, m) => (n % m + m) % m;
  function pitchClass(n) {
    return mod(LETTER_PC[n.letter] + n.accidental, 12);
  }
  var ACCIDENTAL_SYMBOL = { [-2]: "\u{1D12B}", [-1]: "\u266D", 0: "", 1: "\u266F", 2: "\u{1D12A}" };
  function noteLabel(n) {
    return LETTERS[n.letter] + ACCIDENTAL_SYMBOL[n.accidental];
  }
  function parseNote(name) {
    const m = /^([A-Ga-g])(bb|b|##|#|♭|♯)?$/.exec(name.trim());
    if (!m) throw new Error(`Invalid note name: "${name}"`);
    const letter = LETTERS.indexOf(m[1].toUpperCase());
    const acc = m[2] ?? "";
    const accidental = acc === "bb" ? -2 : acc === "b" || acc === "\u266D" ? -1 : acc === "##" ? 2 : acc === "#" || acc === "\u266F" ? 1 : 0;
    return { letter, accidental };
  }

  // engine/scales.ts
  var SCALES = [
    // Major modes, ordered brightest → darkest.
    {
      id: "lydian",
      name: "Lydian",
      family: "Major modes",
      intervals: [0, 2, 4, 6, 7, 9, 11],
      mood: "Dreamy, floating, wide-eyed. Film scores and space.",
      recipe: "Major with a raised 4th (\u266F4)."
    },
    {
      id: "ionian",
      name: "Major",
      aka: "Ionian",
      family: "Major modes",
      intervals: [0, 2, 4, 5, 7, 9, 11],
      mood: "Bright, resolved, happy.",
      recipe: "The reference scale."
    },
    {
      id: "mixolydian",
      name: "Mixolydian",
      family: "Major modes",
      intervals: [0, 2, 4, 5, 7, 9, 10],
      mood: "Bright but loose. Rock, funk, anthems.",
      recipe: "Major with a lowered 7th (\u266D7)."
    },
    {
      id: "dorian",
      name: "Dorian",
      family: "Major modes",
      intervals: [0, 2, 3, 5, 7, 9, 10],
      mood: "Minor but hopeful. Soul, house, neo-soul.",
      recipe: "Natural minor with a raised 6th (\u266E6)."
    },
    {
      id: "aeolian",
      name: "Minor",
      aka: "Aeolian / natural minor",
      family: "Major modes",
      intervals: [0, 2, 3, 5, 7, 8, 10],
      mood: "Sad, serious, emotional.",
      recipe: "The reference minor scale."
    },
    {
      id: "phrygian",
      name: "Phrygian",
      family: "Major modes",
      intervals: [0, 1, 3, 5, 7, 8, 10],
      mood: "Dark, tense, Spanish/metal edge.",
      recipe: "Natural minor with a lowered 2nd (\u266D2)."
    },
    {
      id: "locrian",
      name: "Locrian",
      family: "Major modes",
      intervals: [0, 1, 3, 5, 6, 8, 10],
      mood: "Unstable, uneasy \u2014 the tonic chord itself is diminished.",
      recipe: "Natural minor with \u266D2 and \u266D5."
    },
    // Minor variants.
    {
      id: "harmonicMinor",
      name: "Harmonic Minor",
      family: "Minor variants",
      intervals: [0, 2, 3, 5, 7, 8, 11],
      mood: "Dramatic, classical, exotic pull back home.",
      recipe: "Natural minor with a raised 7th (\u266E7)."
    },
    {
      id: "melodicMinor",
      name: "Melodic Minor",
      aka: "jazz minor",
      family: "Minor variants",
      intervals: [0, 2, 3, 5, 7, 9, 11],
      mood: "Sophisticated, jazzy, bittersweet.",
      recipe: "Major with a lowered 3rd (\u266D3)."
    },
    {
      id: "phrygianDominant",
      name: "Phrygian Dominant",
      aka: "Spanish / Hijaz",
      family: "Minor variants",
      intervals: [0, 1, 4, 5, 7, 8, 10],
      mood: "Cinematic, Middle-Eastern / flamenco heat.",
      recipe: "Phrygian with a major 3rd. Mode 5 of harmonic minor."
    }
  ];
  var MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
  function getScaleDef(id) {
    const def = SCALES.find((s) => s.id === id);
    if (!def) throw new Error(`Unknown scale: ${id}`);
    return def;
  }
  var ROOT_SPELLINGS = [
    ["C"],
    ["Db", "C#"],
    ["D"],
    ["Eb", "D#"],
    ["E"],
    ["F"],
    ["F#", "Gb"],
    ["G"],
    ["Ab", "G#"],
    ["A"],
    ["Bb", "A#"],
    ["B"]
  ];
  function buildScale(root, id) {
    const def = getScaleDef(id);
    const r = typeof root === "string" ? parseNote(root) : root;
    const rootPc = pitchClass(r);
    const notes = def.intervals.map((semis, i) => {
      const letter = (r.letter + i) % 7;
      const targetPc = mod(rootPc + semis, 12);
      let accidental = mod(targetPc - LETTER_PC[letter], 12);
      if (accidental > 6) accidental -= 12;
      return { letter, accidental };
    });
    return { def, root: r, notes, pitchClasses: notes.map(pitchClass) };
  }
  var accidentalCount = (s) => s.notes.reduce((n, x) => n + Math.abs(x.accidental), 0);
  function scaleFromPitchClass(rootPc, id) {
    const options = ROOT_SPELLINGS[mod(rootPc, 12)].map((name) => buildScale(name, id));
    return options.reduce((best, s) => accidentalCount(s) < accidentalCount(best) ? s : best);
  }

  // engine/chords.ts
  var SIZE_NOTES = { triad: 3, "7th": 4, "9th": 5, "11th": 6, "13th": 7 };
  var TRIAD_BY_INTERVALS = {
    "4,7": "major",
    "3,7": "minor",
    "3,6": "diminished",
    "4,8": "augmented"
  };
  var SEVENTH_BY = {
    "major,11": "maj7",
    "major,10": "dom7",
    "minor,10": "min7",
    "minor,11": "minMaj7",
    "diminished,10": "halfDim7",
    "diminished,9": "dim7",
    "augmented,11": "augMaj7",
    "augmented,10": "aug7"
  };
  var TRIAD_SYMBOL = { major: "", minor: "m", diminished: "\xB0", augmented: "+" };
  var SEVENTH_SYMBOL = {
    maj7: "maj7",
    dom7: "7",
    min7: "m7",
    minMaj7: "m(maj7)",
    halfDim7: "m7\u266D5",
    dim7: "\xB07",
    augMaj7: "+maj7",
    aug7: "+7"
  };
  var SEVENTH_ROMAN_SUFFIX = {
    maj7: "maj7",
    dom7: "7",
    min7: "7",
    minMaj7: "(maj7)",
    halfDim7: "\xF87",
    dim7: "\xB07",
    augMaj7: "+maj7",
    aug7: "+7"
  };
  var TENSION_NAME = {
    13: "\u266D9",
    14: "9",
    15: "\u266F9",
    16: "\u266D11",
    17: "11",
    18: "\u266F11",
    20: "\u266D13",
    21: "13",
    22: "\u266F13"
  };
  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
  function diatonicChord(scale, degree, size = "triad") {
    if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new Error(`Degree must be 1..7, got ${degree}`);
    const count = SIZE_NOTES[size];
    const idx = Array.from({ length: count }, (_, k) => (degree - 1 + 2 * k) % 7);
    const notes = idx.map((i) => scale.notes[i]);
    const pcs = notes.map(pitchClass);
    const intervals = [0];
    for (let k = 1; k < count; k++) {
      const step = mod(pcs[k] - pcs[k - 1], 12);
      intervals.push(intervals[k - 1] + step);
    }
    const triad = TRIAD_BY_INTERVALS[`${intervals[1]},${intervals[2]}`];
    if (!triad) throw new Error(`Unclassifiable triad intervals ${intervals.slice(0, 3)}`);
    const seventh = count >= 4 ? SEVENTH_BY[`${triad},${intervals[3]}`] : void 0;
    if (count >= 4 && !seventh) throw new Error(`Unclassifiable seventh ${triad},${intervals[3]}`);
    const tensions = intervals.slice(4).map((s) => TENSION_NAME[s] ?? `?${s}`);
    const rootLabel = noteLabel(notes[0]);
    let symbol = rootLabel + (seventh ? SEVENTH_SYMBOL[seventh] : TRIAD_SYMBOL[triad]);
    if (tensions.length) symbol += `(${tensions.join(",")})`;
    const offset = mod(scale.def.intervals[degree - 1] - MAJOR_INTERVALS[degree - 1] + 6, 12) - 6;
    const acc = offset < 0 ? "\u266D".repeat(-offset) : "\u266F".repeat(offset);
    const upper = triad === "major" || triad === "augmented";
    let numeral = upper ? ROMAN[degree - 1] : ROMAN[degree - 1].toLowerCase();
    if (seventh) numeral += SEVENTH_ROMAN_SUFFIX[seventh];
    else if (triad === "diminished") numeral += "\xB0";
    else if (triad === "augmented") numeral += "+";
    const roman = acc + numeral;
    return { degree, size, notes, pitchClasses: pcs, intervals, triad, seventh, tensions, symbol, roman };
  }

  // engine/chordmap.ts
  var WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  var BLACK_PCS = [1, 3, 6, 8, 10];
  var accidentals = (notes) => notes.reduce((n, x) => n + Math.abs(x.accidental), 0);
  function enharmonics(n) {
    const pc = pitchClass(n);
    const out = [n];
    for (const d of [-1, 1]) {
      const letter = mod(n.letter + d, 7);
      let acc = mod(pc - LETTER_PC[letter], 12);
      if (acc > 6) acc -= 12;
      if (Math.abs(acc) <= 2) out.push({ letter, accidental: acc });
    }
    return out;
  }
  function cleanScale(root, id) {
    return enharmonics(root).map((r) => buildScale(r, id)).reduce((best, s) => {
      const dbl = (x) => x.notes.some((n) => Math.abs(n.accidental) > 1);
      if (dbl(best) !== dbl(s)) return dbl(s) ? best : s;
      return accidentals(s.notes) < accidentals(best.notes) ? s : best;
    });
  }
  var triadKey = (c2) => c2.pitchClasses.slice(0, 3).join(",");
  var b = (from, degree, role) => ({ kind: "borrow", from, degree, role });
  var sd = (target, role) => ({ kind: "secdom", target, role });
  var MAJOR_RECIPES = [
    b("aeolian", 4, "Minor iv"),
    b("aeolian", 7, "\u266DVII"),
    b("aeolian", 6, "\u266DVI"),
    sd(5, "V of V"),
    sd(6, "V of vi"),
    b("aeolian", 3, "\u266DIII"),
    sd(2, "V of ii"),
    b("phrygian", 2, "\u266DII (Neapolitan)"),
    b("ionian", 5, "Major V"),
    sd(4, "V of IV")
  ];
  var MINOR_RECIPES = [
    b("harmonicMinor", 5, "Major V"),
    b("dorian", 4, "Major IV"),
    b("phrygian", 2, "\u266DII (Neapolitan)"),
    b("ionian", 1, "Major I (Picardy)"),
    sd(4, "V of iv"),
    b("aeolian", 7, "\u266DVII"),
    b("aeolian", 6, "\u266DVI"),
    sd(5, "V of V"),
    b("aeolian", 4, "Minor iv"),
    b("aeolian", 5, "Minor v"),
    b("aeolian", 3, "\u266DIII")
  ];
  function applyRecipe(r, scale, size) {
    const tonic = noteLabel(scale.root);
    if (r.kind === "borrow") {
      const parallel = cleanScale(scale.root, r.from);
      const chord2 = diatonicChord(parallel, r.degree, size);
      return { chord: chord2, role: r.role, reason: `Borrowed from ${tonic} ${getScaleDef(r.from).name}`, degree: r.degree };
    }
    const target = diatonicChord(scale, r.target, "triad");
    if (target.triad === "diminished" || target.triad === "augmented") return null;
    const home = cleanScale(target.notes[0], target.triad === "major" ? "ionian" : "harmonicMinor");
    const chord = diatonicChord(home, 5, size);
    return { chord, role: r.role, reason: `Secondary dominant \u2192 ${target.symbol}`, degree: r.target, resolvesTo: r.target };
  }
  var QUALITY_WEIGHT = { major: 2, minor: 2, diminished: 0, augmented: -2 };
  function fallbackPicks(scale, size) {
    const out = [];
    for (const def of SCALES) {
      if (def.id === scale.def.id) continue;
      const closeness = def.intervals.filter((i) => scale.def.intervals.includes(i)).length;
      const parallel = cleanScale(scale.root, def.id);
      for (let d = 1; d <= 7; d++) {
        const triad = diatonicChord(parallel, d, "triad");
        const common = triad.pitchClasses.filter((p) => scale.pitchClasses.includes(p)).length;
        out.push({
          chord: diatonicChord(parallel, d, size),
          role: `Borrowed ${triad.roman}`,
          reason: `Borrowed from ${noteLabel(scale.root)} ${def.name}`,
          score: closeness + QUALITY_WEIGHT[triad.triad] + 2 * common,
          degree: d
        });
      }
    }
    return out.sort((a, b2) => b2.score - a.score);
  }
  function colorChords(scale, size = "7th") {
    const taken = new Set(
      [1, 2, 3, 4, 5, 6, 7].map((d) => triadKey(diatonicChord(scale, d, "triad")))
    );
    const recipes = scale.def.intervals[2] === 4 ? MAJOR_RECIPES : MINOR_RECIPES;
    const picks = [];
    const consider = (p) => {
      if (!p || picks.length >= 5) return;
      const k = triadKey(p.chord);
      if (taken.has(k)) return;
      if (p.chord.notes.some((n) => Math.abs(n.accidental) > 1)) return;
      taken.add(k);
      picks.push(p);
    };
    for (const r of recipes) {
      const t = applyRecipe(r, scale, "triad");
      if (t && !taken.has(triadKey(t.chord))) consider(applyRecipe(r, scale, size));
    }
    if (picks.length < 5) for (const p of fallbackPicks(scale, size)) consider(p);
    return picks;
  }
  function buildChordMap(scale, size = "7th") {
    const tonicPc = scale.pitchClasses[0];
    const rootOffset = (c2) => mod(c2.pitchClasses[0] - tonicPc, 12);
    const slots = new Array(12);
    WHITE_PCS.forEach((pc, i) => {
      const chord = diatonicChord(scale, i + 1, size);
      slots[pc] = {
        keyPc: pc,
        kind: "diatonic",
        chord,
        role: `Degree ${i + 1}`,
        reason: `${noteLabel(scale.root)} ${scale.def.name}`,
        rootOffset: rootOffset(chord),
        degree: i + 1
      };
    });
    const colors = colorChords(scale, size).sort(
      (a, b2) => rootOffset(a.chord) - rootOffset(b2.chord) || a.chord.symbol.localeCompare(b2.chord.symbol)
    );
    BLACK_PCS.forEach((pc, i) => {
      const p = colors[i];
      slots[pc] = {
        keyPc: pc,
        kind: "color",
        chord: p.chord,
        role: p.role,
        reason: p.reason,
        rootOffset: rootOffset(p.chord),
        degree: p.degree,
        resolvesTo: p.resolvesTo
      };
    });
    return slots;
  }
  function chordForKey(midi, scale, map) {
    const pc = mod(midi, 12);
    const tonicPc = scale.pitchClasses[0];
    const centered = tonicPc > 6 ? tonicPc - 12 : tonicPc;
    const slot = map[pc];
    return { slot, rootMidi: midi - pc + centered + slot.rootOffset };
  }

  // engine/voicing.ts
  function trimmedIntervals(chord, trim = true) {
    const iv = chord.intervals;
    if (!trim || iv.length < 6) return [...iv];
    const majorThird = iv[1] === 4;
    const keep = iv.filter((semis, i) => {
      if (i === 2) return false;
      if (i === 5) {
        const sharp11 = semis === 18;
        if (sharp11) return true;
        if (iv.length === 7) return false;
        return !majorThird;
      }
      return true;
    });
    return keep;
  }
  function maxInversion(chord) {
    return chord.intervals.length >= 4 ? 3 : 2;
  }
  function voiceChord(chord, rootMidi, opts = {}) {
    const { inversion = 0, spread = "close", trim = true } = opts;
    let notes = trimmedIntervals(chord, trim).map((s) => rootMidi + s);
    const inv = Math.max(0, Math.min(inversion, maxInversion(chord), notes.length - 1));
    for (let k = 0; k < inv; k++) {
      notes.sort((a, b2) => a - b2);
      notes[0] += 12;
    }
    notes.sort((a, b2) => a - b2);
    if (spread !== "close" && notes.length >= 3) {
      if (notes.length === 3) notes[1] += 12;
      else notes[notes.length - 2] -= 12;
      notes.sort((a, b2) => a - b2);
    }
    if (spread === "wide") notes.unshift(notes[0] - 12);
    while (notes[0] < 0) notes = notes.map((n) => n + 12);
    while (notes[notes.length - 1] > 127) notes = notes.map((n) => n - 12);
    return [...new Set(notes)].sort((a, b2) => a - b2);
  }

  // engine/voiceleading.ts
  function movement(a, b2) {
    if (!a.length || !b2.length) return 0;
    const nearest = (x, set) => Math.min(...set.map((y) => Math.abs(x - y)));
    const ab = b2.reduce((s, x) => s + nearest(x, a), 0);
    const ba = a.reduce((s, x) => s + nearest(x, b2), 0);
    return (ab + ba) / 2;
  }
  var center = (n) => n.reduce((s, x) => s + x, 0) / n.length;
  function voiceLead(chord, rootMidi, prev, opts = {}) {
    const { spread = "close", trim = true, inversion = 0, registerPull = 1 } = opts;
    const home = voiceChord(chord, rootMidi, { inversion, spread, trim });
    if (!prev || !prev.length) return home;
    const homeCenter = center(home);
    if (Math.abs(center(prev) - homeCenter) > 9) return home;
    let best = home;
    let bestCost = movement(prev, home);
    for (const shift of [0, -12, 12]) {
      for (let inv = 0; inv <= maxInversion(chord); inv++) {
        const cand = voiceChord(chord, rootMidi + shift, { inversion: inv, spread, trim });
        const off = Math.abs(center(cand) - homeCenter);
        if (off > 6) continue;
        const cost = movement(prev, cand) + registerPull * off;
        if (cost < bestCost - 1e-9) {
          best = cand;
          bestCost = cost;
        }
      }
    }
    return best;
  }

  // engine/bach-data.ts
  var BACH_MAJOR = [[0, 334, 61, 471, 618, 240, 56], [217, 0, 112, 40, 510, 147, 34], [63, 52, 0, 98, 38, 261, 8], [322, 143, 48, 0, 184, 48, 67], [952, 187, 121, 96, 0, 212, 8], [135, 337, 116, 95, 202, 0, 51], [104, 6, 59, 12, 22, 21, 0]];
  var BACH_MINOR = [[0, 290, 87, 437, 512, 123, 152], [136, 0, 74, 21, 352, 43, 23], [208, 63, 0, 194, 79, 166, 229], [246, 92, 113, 0, 163, 28, 297], [826, 83, 86, 106, 0, 108, 34], [57, 101, 131, 87, 58, 0, 58], [122, 20, 446, 93, 88, 24, 0]];

  // engine/progression.ts
  var PRESETS = [
    { id: "axis", name: "Pop anthem", mood: "Uplifting, stadium", scale: "ionian", steps: [1, 5, 6, 4] },
    { id: "sensitive", name: "Sensitive", mood: "Emotional pop ballad", scale: "ionian", steps: [6, 4, 1, 5] },
    { id: "doowop", name: "50s", mood: "Sweet, nostalgic", scale: "ionian", steps: [1, 6, 4, 5] },
    { id: "royal", name: "Royal road", mood: "Anime, J-pop lift", scale: "ionian", steps: [4, 5, 3, 6] },
    { id: "twofive", name: "ii\u2013V\u2013I", mood: "Jazz, smooth resolve", scale: "ionian", steps: [2, 5, 1, 1] },
    { id: "neosoul", name: "Neo-soul fall", mood: "Warm, laid-back (try 9ths)", scale: "ionian", steps: [4, 3, 2, 1] },
    { id: "canon", name: "Canon", mood: "Classical, wedding", scale: "ionian", steps: [1, 5, 6, 3, 4, 1, 4, 5] },
    { id: "creep", name: "Bittersweet", mood: "Alt-rock, major-to-minor ache", scale: "ionian", steps: [1, "V of vi", 4, "Minor iv"] },
    { id: "epic", name: "Epic minor", mood: "Cinematic, heroic", scale: "aeolian", steps: [1, 6, 3, 7] },
    { id: "sadloop", name: "Minor loop", mood: "Moody, trap/lofi", scale: "aeolian", steps: [1, 4, 7, 3] },
    { id: "andalusian", name: "Andalusian", mood: "Flamenco, dramatic descent", scale: "aeolian", steps: [1, 7, 6, "Major V"] },
    { id: "drama", name: "Minor drama", mood: "Classical tension and release", scale: "harmonicMinor", steps: [1, 4, 5, 1] },
    { id: "dorianvamp", name: "Dorian vamp", mood: "Funk, house, hypnotic", scale: "dorian", steps: [1, 4, 1, 4] },
    { id: "mixorock", name: "Mixolydian rock", mood: "Anthemic, open", scale: "mixolydian", steps: [1, 7, 4, 1] },
    { id: "lydianfloat", name: "Lydian float", mood: "Dreamy, weightless", scale: "lydian", steps: [1, 2, 1, 2] },
    { id: "phrygiandark", name: "Phrygian menace", mood: "Dark, metal, tension", scale: "phrygian", steps: [1, 2, 1, 7] }
  ];
  function resolvePreset(p, map) {
    return p.steps.map((s) => {
      if (typeof s === "number") return WHITE_PCS[s - 1];
      const slot = map.find((x) => x.kind === "color" && x.role === s);
      if (!slot) throw new Error(`Preset ${p.id}: no color chord "${s}" in this scale`);
      return slot.keyPc;
    });
  }
  var isMajorScale = (scale) => scale.def.intervals[2] === 4;
  function popCounts(major) {
    const m = Array.from({ length: 7 }, () => new Array(7).fill(0));
    for (const p of PRESETS) {
      const presetMajor = ["ionian", "lydian", "mixolydian"].includes(p.scale);
      if (presetMajor !== major) continue;
      const n = p.steps.length;
      for (let i = 0; i < n; i++) {
        const a = p.steps[i];
        const b2 = p.steps[(i + 1) % n];
        if (typeof a === "number" && typeof b2 === "number" && a !== b2) m[a - 1][b2 - 1] += 10;
      }
    }
    return m;
  }
  function transitionTable(scale, style) {
    const major = isMajorScale(scale);
    const counts = style === "bach" ? major ? BACH_MAJOR : BACH_MINOR : popCounts(major);
    return counts.map((row, i) => {
      const total = row.reduce((s, x) => s + x, 0);
      const floor = Math.max(1, total * 0.02) / 6;
      const smoothed = row.map((x, j) => i === j ? 0 : x + floor);
      const sum = smoothed.reduce((s, x) => s + x, 0);
      return smoothed.map((x) => x / sum);
    });
  }
  var FUNCTION_TENSION = [0, 0.45, 0.3, 0.35, 0.7, 0.2, 0.85];
  function chordTension(slot) {
    let t = slot.resolvesTo ? 0.75 : FUNCTION_TENSION[slot.degree - 1];
    if (slot.chord.triad === "diminished") t += 0.2;
    if (slot.chord.triad === "augmented") t += 0.25;
    if (slot.kind === "color") t += 0.15;
    return Math.max(0, Math.min(1, t));
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var pick = (weights, r) => {
    const total = weights.reduce((s, x2) => s + x2, 0);
    let x = r * total;
    for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) <= 0) return i;
    return weights.length - 1;
  };
  function generateProgression(scale, map, opts = {}) {
    const { length = 4, style = "pop", tension = 0.4, color = 0.25, seed = 1 } = opts;
    const P = transitionTable(scale, style);
    const rand = rng(seed);
    const slotOf = (degree) => map[WHITE_PCS[degree - 1]];
    const unstable = (d) => ["diminished", "augmented"].includes(slotOf(d).chord.triad);
    const scored = /* @__PURE__ */ new Map();
    for (let n = 0; n < 240; n++) {
      const degs = [1];
      while (degs.length < length) {
        const row = P[degs[degs.length - 1] - 1].map((p, j) => unstable(j + 1) ? p * (0.1 + 0.5 * tension) : p);
        degs.push(pick(row, rand()) + 1);
      }
      let logp = 0;
      for (let i = 0; i < length; i++) logp += Math.log(P[degs[i] - 1][degs[(i + 1) % length] - 1] || 1e-6);
      const meanT = degs.reduce((s, d) => s + chordTension(slotOf(d)), 0) / length;
      const distinct = new Set(degs).size;
      const minDistinct = Math.min(length, length >= 8 ? 4 : 3);
      const unstableCount = degs.filter(unstable).length;
      const score = logp / length - 4 * Math.abs(meanT - tension) - (distinct < minDistinct ? 2 : 0) - unstableCount * 0.6 * (1 - tension);
      scored.set(degs.join(), { degs, score });
    }
    const top = [...scored.values()].sort((a, b2) => b2.score - a.score).slice(0, 12);
    const TEMPERATURE = 0.35;
    const best = top[pick(top.map((c2) => Math.exp((c2.score - top[0].score) / TEMPERATURE)), rand())].degs;
    const keys = best.map((d) => WHITE_PCS[d - 1]);
    for (let i = 1; i < length; i++) {
      if (rand() >= color * 0.6) continue;
      const nextDeg = best[(i + 1) % length];
      const options = map.filter((s) => s.kind === "color" && (!s.resolvesTo && s.degree === best[i] || // borrowed stand-in for this degree
      s.resolvesTo === nextDeg && best[i] !== 1));
      if (!options.length) continue;
      const choice = options[Math.floor(rand() * options.length)].keyPc;
      if (choice !== keys[i - 1] && choice !== keys[(i + 1) % length]) keys[i] = choice;
    }
    const meanTension = keys.reduce((s, k) => s + chordTension(map[k]), 0) / length;
    return { keys, tension: meanTension };
  }
  function suggestNext(scale, map, fromKeyPc, style = "pop") {
    const P = transitionTable(scale, style);
    const from = map[fromKeyPc];
    const row = [...P[from.degree - 1]];
    if (from.resolvesTo) row[from.resolvesTo - 1] += 2;
    const ranked = row.map((w, j) => ({ keyPc: WHITE_PCS[j], weight: w, kind: "likely", degree: j + 1 })).filter((s) => s.keyPc !== fromKeyPc).sort((a, b2) => b2.weight - a.weight).slice(0, 3);
    const out = ranked.map(({ keyPc, weight, kind }) => ({ keyPc, weight, kind }));
    const spice = map.find((s) => s.kind === "color" && s.keyPc !== fromKeyPc && !s.resolvesTo && ranked.some((r) => r.degree === s.degree));
    if (spice) out.push({ keyPc: spice.keyPc, weight: ranked[ranked.length - 1].weight * 0.8, kind: "spice" });
    return out;
  }

  // engine/midifile.ts
  var vlq = (n) => {
    const bytes = [n & 127];
    while (n >>= 7) bytes.unshift(n & 127 | 128);
    return bytes;
  };
  var u32 = (n) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  var text = (s) => [...s].map((c2) => c2.charCodeAt(0));
  function writeMidi(events, bpm = 120, name = "Harmonic", ppq = 480) {
    const raw = [];
    for (const e of events) {
      const on = Math.round(e.start * ppq);
      const off = Math.round((e.start + e.length) * ppq);
      for (const n of e.notes) {
        raw.push({ tick: on, order: 1, data: [144, n, e.velocity ?? 100] });
        raw.push({ tick: off, order: 0, data: [128, n, 0] });
      }
    }
    raw.sort((a, b2) => a.tick - b2.tick || a.order - b2.order);
    const usPerBeat = Math.round(6e7 / bpm);
    const track = [
      0,
      255,
      3,
      ...vlq(name.length),
      ...text(name),
      // track name
      0,
      255,
      81,
      3,
      usPerBeat >> 16 & 255,
      usPerBeat >> 8 & 255,
      usPerBeat & 255,
      // tempo
      0,
      255,
      88,
      4,
      4,
      2,
      24,
      8
      // 4/4
    ];
    let t = 0;
    for (const ev of raw) {
      track.push(...vlq(ev.tick - t), ...ev.data);
      t = ev.tick;
    }
    track.push(0, 255, 47, 0);
    return new Uint8Array([
      ...text("MThd"),
      ...u32(6),
      0,
      0,
      0,
      1,
      ppq >> 8 & 255,
      ppq & 255,
      ...text("MTrk"),
      ...u32(track.length),
      ...track
    ]);
  }

  // engine/rhythm.ts
  var RATE_BEATS = { "1/4": 1, "1/8": 0.5, "1/16": 0.25 };
  function euclid(steps, hits, rotate = 0) {
    const n = Math.max(1, Math.min(32, Math.round(steps)));
    const k = Math.max(0, Math.min(n, Math.round(hits)));
    const base = Array.from({ length: n }, (_, i) => i * k % n < k);
    const r = (Math.round(rotate) % n + n) % n;
    return base.map((_, i) => base[(i + r) % n]);
  }
  function patternSteps(p) {
    return p.custom && p.custom.length ? p.custom.slice() : euclid(p.steps, p.hits, p.rotate);
  }
  function patternHits(p) {
    const on = patternSteps(p);
    const stepBeats = RATE_BEATS[p.rate];
    const idx = on.map((v, i) => v ? i : -1).filter((i) => i >= 0);
    return idx.map((i, j) => {
      const next = j + 1 < idx.length ? idx[j + 1] : idx[0] + on.length;
      const gap = (next - i) * stepBeats;
      return { start: i * stepBeats, length: Math.max(stepBeats * 0.1, gap * Math.max(0.05, Math.min(1, p.gate))) };
    });
  }
  function cycleBeats(p) {
    return patternSteps(p).length * RATE_BEATS[p.rate];
  }
  var GROOVES = [
    { name: "Hold", pattern: { steps: 8, hits: 1, rotate: 0, rate: "1/8", gate: 1 } },
    { name: "Pulse", pattern: { steps: 8, hits: 4, rotate: 0, rate: "1/8", gate: 0.6 } },
    { name: "Tresillo", pattern: { steps: 8, hits: 3, rotate: 0, rate: "1/8", gate: 0.8 } },
    { name: "Cinquillo", pattern: { steps: 8, hits: 5, rotate: 0, rate: "1/8", gate: 0.7 } },
    { name: "Offbeat", pattern: { steps: 8, hits: 4, rotate: 1, rate: "1/8", gate: 0.5 } },
    { name: "Busy", pattern: { steps: 16, hits: 7, rotate: 2, rate: "1/16", gate: 0.6 } }
  ];

  // engine/take.ts
  function captureTempo(onsetsMs, fallbackBpm = 110, min = 70, max = 170) {
    const on = [...new Set(onsetsMs.map((t) => Math.round(t)))].filter((t) => t > 90).sort((a, b2) => a - b2);
    if (!on.length) return { bpm: fallbackBpm, confident: false };
    const posCost = (k) => {
      const p = (k % 4 + 4) % 4;
      if (p === 0) return 0;
      if (p === 2) return 0.25;
      if (Number.isInteger(p)) return 0.5;
      if (Number.isInteger(p * 2)) return 0.8;
      return 1.2;
    };
    let best = { bpm: fallbackBpm, score: Infinity };
    for (let t = min; t <= max; t += 0.25) {
      const beat0 = 6e4 / t;
      const ks = on.map((x) => Math.max(0.25, Math.round(x / beat0 * 4) / 4));
      const beat = ks.reduce((s, k, i) => s + k * on[i], 0) / ks.reduce((s, k) => s + k * k, 0);
      const bpm = 6e4 / beat;
      if (bpm < min * 0.98 || bpm > max * 1.02) continue;
      const errMs = on.map((x, i) => x - ks[i] * beat);
      const timing = errMs.reduce((s, e) => s + (e / 35) ** 2, 0) / on.length;
      const metric = ks.reduce((s, k) => s + posCost(k), 0) / ks.length;
      const prior = 0.8 * Math.log2(bpm / 110) ** 2;
      const score = timing + metric + prior;
      if (score < best.score) best = { bpm, score };
    }
    return { bpm: Math.round(best.bpm * 10) / 10, confident: on.length >= 2 };
  }
  function phraseEnd(raw) {
    const on = [...new Set(raw.map((e) => Math.round(e.startMs)))].sort((a, b2) => a - b2).filter((t, i, a) => i === 0 || t - a[i - 1] > 90);
    const last = raw.reduce((m, e) => e.startMs >= m.startMs ? e : m, raw[0]);
    const lastRelease = Math.max(...raw.map((e) => e.startMs + e.lengthMs));
    if (on.length < 2) return lastRelease;
    return last.startMs + (on[on.length - 1] - on[on.length - 2]);
  }
  function takeFromRecording(raw, _durationMs, fixedBpm, fallbackBpm = 110) {
    const t0 = fixedBpm || !raw.length ? 0 : Math.min(...raw.map((e) => e.startMs));
    const evs = raw.map((e) => ({ ...e, startMs: e.startMs - t0 }));
    const endMs = evs.length ? phraseEnd(evs) : 0;
    const bpm = fixedBpm ?? captureTempo(evs.map((e) => e.startMs), fallbackBpm).bpm;
    const beatMs = 6e4 / bpm;
    const lastOnset = Math.max(0, ...evs.map((e) => e.startMs / beatMs));
    const lastRelease = Math.max(0, ...evs.map((e) => (e.startMs + e.lengthMs) / beatMs));
    const bars = Math.max(1, Math.ceil((lastOnset + 0.25) / 4), Math.round(endMs / beatMs / 4), Math.round((lastRelease - 1) / 4));
    const beats = bars * 4;
    const events = evs.filter((e) => e.startMs / beatMs < beats).map((e) => ({
      start: e.startMs / beatMs,
      length: Math.max(0.05, Math.min(e.lengthMs / beatMs, beats - e.startMs / beatMs)),
      notes: e.notes.slice(),
      velocity: e.velocity,
      keyPc: e.keyPc,
      label: e.label
    }));
    const lastEv = events.reduce((m, e) => !m || e.start >= m.start ? e : m, null);
    if (lastEv) {
      const gap = beats - (lastEv.start + lastEv.length);
      if (gap > 0 && gap <= 4) lastEv.length = beats - lastEv.start;
    }
    return { events, beats, bpm, tempoSource: fixedBpm ? "fixed" : "detected" };
  }
  function reinterpret(take, factor) {
    const beats = take.beats * factor;
    if (beats < 4 || beats % 4 !== 0) return take;
    return {
      ...take,
      bpm: Math.round(take.bpm * factor * 10) / 10,
      beats,
      events: take.events.map((e) => ({ ...e, start: e.start * factor, length: e.length * factor }))
    };
  }
  function takeFromChords(chords, bpm) {
    let t = 0;
    const events = chords.map((c2) => {
      const e = { start: t, length: c2.beats, notes: c2.notes, velocity: 96, keyPc: c2.keyPc, label: c2.label };
      t += c2.beats;
      return e;
    });
    return { events, beats: Math.max(4, Math.ceil(t / 4) * 4), bpm, tempoSource: "fixed" };
  }
  function takeToMidiEvents(take) {
    return take.events.map((e) => ({ notes: e.notes, start: e.start, length: e.length, velocity: e.velocity }));
  }
  var QUANTIZE_BEATS = { "1/16": 0.25, "1/8": 0.5, "1/4": 1 };
  function quantizeTake(take, q) {
    if (q === "off") return take;
    const g2 = QUANTIZE_BEATS[q];
    const snap = (b2) => Math.round(b2 / g2) * g2;
    const events = take.events.map((e) => {
      const start = Math.min(snap(e.start), take.beats - g2);
      const end = Math.max(start + g2, Math.min(take.beats, snap(e.start + e.length)));
      return { ...e, start, length: end - start };
    }).sort((a, b2) => a.start - b2.start);
    for (let i = 0; i < events.length - 1; i++) {
      const next = events[i + 1];
      if (next.start > events[i].start && events[i].start + events[i].length > next.start) {
        events[i] = { ...events[i], length: next.start - events[i].start };
      }
    }
    return { ...take, events };
  }
  function setLoopBars(take, bars) {
    const beats = Math.max(1, Math.round(bars)) * 4;
    if (beats === take.beats) return take;
    const events = [];
    for (let offset = 0; offset < beats; offset += take.beats) {
      for (const e of take.events) {
        const start = e.start + offset;
        if (start >= beats) continue;
        events.push({ ...e, start, length: Math.min(e.length, beats - start) });
      }
    }
    return { ...take, beats, events };
  }

  // engine/notemode.ts
  var mod2 = (n, m) => (n % m + m) % m;
  function snapToScale(midi, scale) {
    const pcs = scale.pitchClasses;
    for (let d = 0; d <= 6; d++) {
      if (pcs.includes(mod2(midi - d, 12))) return midi - d;
      if (pcs.includes(mod2(midi + d, 12))) return midi + d;
    }
    return midi;
  }
  function scaleNoteLabel(pc, scale) {
    const i = scale.pitchClasses.indexOf(mod2(pc, 12));
    return i >= 0 ? noteLabel(scale.notes[i]) : "";
  }

  // explorer/midi.ts
  var MidiBridge = class {
    // `${ch}:${note}` packed → refcount
    constructor(cb) {
      __publicField(this, "cb", cb);
      __publicField(this, "access", null);
      __publicField(this, "out", null);
      __publicField(this, "inputId", "all");
      __publicField(this, "outputId", "");
      __publicField(this, "status", "pending");
      __publicField(this, "sounding", /* @__PURE__ */ new Map());
    }
    async init() {
      if (!("requestMIDIAccess" in navigator)) {
        this.status = "unsupported";
        this.cb.devicesChanged();
        return;
      }
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: false });
        this.status = "ready";
        this.access.onstatechange = () => {
          this.bindInputs();
          this.cb.devicesChanged();
        };
        const iac = this.outputs().find((o) => /iac|bus/i.test(o.name));
        if (iac) this.setOutput(iac.id);
        this.bindInputs();
      } catch {
        this.status = "blocked";
      }
      this.cb.devicesChanged();
    }
    inputs() {
      return this.access ? [...this.access.inputs.values()].map((p) => ({ id: p.id, name: p.name ?? p.id })) : [];
    }
    outputs() {
      return this.access ? [...this.access.outputs.values()].map((p) => ({ id: p.id, name: p.name ?? p.id })) : [];
    }
    get outputName() {
      return this.out?.name ?? "";
    }
    setOutput(id) {
      this.panic();
      this.outputId = id;
      this.out = id && this.access?.outputs.get(id) || null;
      this.bindInputs();
    }
    setInput(id) {
      this.inputId = id;
      this.bindInputs();
    }
    /** An input is a loop risk if it's the same virtual cable we send on. */
    isLoop(p) {
      if (!this.out) return false;
      return p.name === this.out.name || /iac/i.test(p.name ?? "") && /iac/i.test(this.out.name ?? "");
    }
    isLoopInput(id) {
      const p = this.access?.inputs.get(id);
      return p ? this.isLoop(p) : false;
    }
    bindInputs() {
      if (!this.access) return;
      for (const p of this.access.inputs.values()) {
        const listen = (this.inputId === "all" || this.inputId === p.id) && !this.isLoop(p);
        p.onmidimessage = listen ? (e) => this.handle(e.data) : null;
      }
    }
    handle(d) {
      const type = d[0] & 240;
      const ch = d[0] & 15;
      if (type === 144 && d[2] > 0) this.cb.noteOn(d[1], d[2], ch);
      else if (type === 128 || type === 144 && d[2] === 0) this.cb.noteOff(d[1], ch);
      else if (type === 176 || type === 224 || type === 208 || type === 160) this.out?.send(d);
    }
    /**
     * Send a note-on unless it's already sounding (then just count it).
     * `at`: optional performance.now() time for sample-tight scheduling.
     */
    send(note, velocity, ch = 0, at) {
      const k = ch * 128 + note;
      const n = this.sounding.get(k) ?? 0;
      this.sounding.set(k, n + 1);
      if (n === 0) this.raw([144 | ch, note, velocity], at);
    }
    /** Send a note-off only when the last chord using this note lets go. */
    release(note, ch = 0, at) {
      const k = ch * 128 + note;
      const n = this.sounding.get(k) ?? 0;
      if (n <= 1) {
        this.sounding.delete(k);
        this.raw([128 | ch, note, 0], at);
      } else this.sounding.set(k, n - 1);
    }
    /** Any message (MIDI Clock 0xF8, Start 0xFA, Stop 0xFC …), optionally scheduled. */
    raw(data, at) {
      if (!this.out) return;
      if (at === void 0) this.out.send(data);
      else this.out.send(data, at);
    }
    get hasOutput() {
      return !!this.out;
    }
    panic() {
      for (const k of this.sounding.keys()) this.out?.send([128 | Math.floor(k / 128), k % 128, 0]);
      this.sounding.clear();
      for (let ch = 0; ch < 16; ch++) {
        this.out?.send([176 | ch, 123, 0]);
        this.out?.send([176 | ch, 64, 0]);
      }
    }
  };

  // app/synth.ts
  var Synth = class {
    constructor() {
      __publicField(this, "ctx", null);
      __publicField(this, "master");
      __publicField(this, "groups", /* @__PURE__ */ new Map());
      /** performance.now()/1000 − audio time, smoothed. null until measured. */
      __publicField(this, "offset", null);
      __publicField(this, "enabled", true);
    }
    audio() {
      if (!this.ctx) {
        try {
          this.ctx = new AudioContext({ latencyHint: 0 });
        } catch {
          this.ctx = new AudioContext({ latencyHint: "interactive" });
        }
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.2;
        const clip = this.ctx.createWaveShaper();
        const curve = new Float32Array(1025);
        for (let i = 0; i < curve.length; i++) {
          const x = i / 512 - 1;
          curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5);
        }
        clip.curve = curve;
        this.master.connect(clip).connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    /** What the browser reports it adds between "play" and your speakers, in ms (0 until sound has started). */
    get latencyMs() {
      if (!this.ctx) return 0;
      const out = this.ctx.outputLatency ?? 0;
      return Math.round(((this.ctx.baseLatency ?? 0) + out) * 1e3);
    }
    /** Call from a click/keypress so the browser allows sound. */
    unlock() {
      this.audio();
    }
    /** Keep a smoothed performance.now() ↔ audio-clock mapping. */
    syncClock(ac) {
      const cand = performance.now() / 1e3 - ac.currentTime;
      if (this.offset === null || Math.abs(cand - this.offset) > 0.05) this.offset = cand;
      else this.offset += (cand - this.offset) * 0.05;
      return this.offset;
    }
    toCtx(at) {
      const ac = this.audio();
      const offset = this.syncClock(ac);
      if (at === void 0) return ac.currentTime;
      const t = at / 1e3 - offset;
      return t > ac.currentTime ? t : ac.currentTime;
    }
    on(id, notes, velocity, at) {
      if (!this.enabled) return;
      this.off(id, at);
      const ac = this.audio();
      const t = this.toCtx(at);
      const level = 0.14 * (0.4 + velocity / 127 * 0.6) / Math.sqrt(Math.max(1, notes.length / 3));
      const osc = [];
      const gains = [];
      for (const note of notes) {
        const f = 440 * Math.pow(2, (note - 69) / 12);
        const g2 = ac.createGain();
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(level, t + 3e-3);
        g2.gain.exponentialRampToValueAtTime(level * 0.55, t + 0.6);
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(3400, t);
        filter.frequency.exponentialRampToValueAtTime(1200, t + 0.9);
        ["triangle", "sawtooth"].forEach((type, i) => {
          const o = ac.createOscillator();
          o.type = type;
          o.frequency.value = f;
          o.detune.value = i ? 7 : -7;
          o.connect(filter);
          o.start(t);
          osc.push(o);
        });
        filter.connect(g2).connect(this.master);
        gains.push(g2);
      }
      this.groups.set(id, { osc, gains });
    }
    off(id, at) {
      const grp = this.groups.get(id);
      if (!grp || !this.ctx) return;
      this.groups.delete(id);
      const t = this.toCtx(at);
      for (const g2 of grp.gains) {
        g2.gain.cancelScheduledValues(t);
        g2.gain.setTargetAtTime(1e-4, t, 0.1);
      }
      grp.osc.forEach((o) => o.stop(t + 0.5));
    }
    allOff() {
      for (const id of [...this.groups.keys()]) this.off(id);
    }
  };

  // app/controller.ts
  var CHORD_CH = 0;
  var NOTE_CH = 1;
  var LOOKAHEAD_MS = 120;
  var TICK_MS = 25;
  var CATCH_UP_MS = 60;
  var Controller = class {
    constructor(makeMidi = (cb) => new MidiBridge(cb)) {
      /* ---------- settings ---------- */
      __publicField(this, "rootPc", 0);
      __publicField(this, "scaleId", "ionian");
      __publicField(this, "size", "7th");
      __publicField(this, "inversion", 0);
      __publicField(this, "spread", "close");
      /** Voice leading. Off by default: a key always plays the same notes. On: chords re-voice to move as little as possible. */
      __publicField(this, "smooth", false);
      __publicField(this, "style", "pop");
      __publicField(this, "bpm", 118);
      __publicField(this, "clockOut", true);
      __publicField(this, "euclidOn", false);
      /** CHORDS: each key plays a chord. NOTES: each key plays one note snapped to the scale. */
      __publicField(this, "playMode", "chords");
      __publicField(this, "pattern", { ...GROOVES[2].pattern });
      /* ---------- derived ---------- */
      __publicField(this, "scale");
      __publicField(this, "map");
      /* ---------- performance ---------- */
      __publicField(this, "current", null);
      __publicField(this, "hints", []);
      /** What is sounding right now, for lighting the UI. */
      __publicField(this, "sounding", /* @__PURE__ */ new Map());
      /** The loop that plays: derived from rawTake + quantize + loopBars. */
      __publicField(this, "take", null);
      /** Exactly what was captured (never modified by quantize / length). */
      __publicField(this, "rawTake", null);
      __publicField(this, "takeName", "");
      /** Snap recorded takes to this grid (OFF, 1/16, 1/8, 1/4). */
      __publicField(this, "quantize", "off");
      // off by default: takes play back exactly as played (like Ableton's Capture); fix details in Live
      /** Loop length: 'auto' = as recorded, or a fixed number of bars. */
      __publicField(this, "loopBars", "auto");
      __publicField(this, "playing", false);
      __publicField(this, "rec", "idle");
      __publicField(this, "midi");
      /** The host owns the tempo: recordings keep it instead of detecting one. (Also true whenever Live is playing.) */
      __publicField(this, "tempoLocked", false);
      /** Called when Harmonique changes the tempo itself (detected from a take, ÷2 ×2, typed), so a host can follow. */
      __publicField(this, "onTempo", null);
      /** Host timeline (Live): performance.now() time of the song's beat 0 while the host plays, else null. */
      __publicField(this, "hostZero", null);
      /** Host beat where the loop's beat 0 sits (the bar you started recording on), so it replays where you played it. */
      __publicField(this, "loopOffset", 0);
      __publicField(this, "synth", new Synth());
      __publicField(this, "held", /* @__PURE__ */ new Map());
      __publicField(this, "lastNotes", null);
      __publicField(this, "active", /* @__PURE__ */ new Map());
      // scheduled/playing outputs by id
      __publicField(this, "running", false);
      __publicField(this, "transportStart", 0);
      __publicField(this, "scheduledTo", 0);
      __publicField(this, "timer", 0);
      __publicField(this, "recT0", 0);
      __publicField(this, "recOpen", /* @__PURE__ */ new Map());
      __publicField(this, "recEvents", []);
      __publicField(this, "seq", 0);
      __publicField(this, "listeners", /* @__PURE__ */ new Set());
      this.midi = makeMidi({
        noteOn: (note, vel) => this.keyDown(`midi:${note}`, note, vel),
        noteOff: (note) => this.keyUp(`midi:${note}`),
        devicesChanged: () => this.notify()
      });
      this.recompute();
    }
    /* ================= subscription ================= */
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    notify() {
      this.listeners.forEach((f) => f());
    }
    /* ================= settings ================= */
    recompute() {
      this.scale = scaleFromPitchClass(this.rootPc, this.scaleId);
      this.map = buildChordMap(this.scale, this.size);
      if (this.current) {
        this.current = { ...this.current, slot: this.map[this.current.keyPc] };
        this.hints = suggestNext(this.scale, this.map, this.current.keyPc, this.style);
      }
    }
    set(key, value) {
      this[key] = value;
      if (key !== "clockOut") this.lastNotes = null;
      this.recompute();
      this.notify();
    }
    get keyName() {
      return `${noteLabel(this.scale.root)} ${this.scale.def.name}`;
    }
    setBpm(bpm, fromHost = false) {
      const next = Math.max(40, Math.min(240, Math.round(bpm * 10) / 10));
      if (this.running && this.hostZero === null) {
        const now = performance.now();
        const beat = this.beatAt(now);
        this.bpm = next;
        this.transportStart = now - beat * 6e4 / next;
      } else this.bpm = next;
      if (this.rawTake) {
        this.rawTake = { ...this.rawTake, bpm: this.bpm };
        this.derive();
      }
      if (!fromHost) this.onTempo?.(this.bpm);
      this.notify();
    }
    /* ================= host clock (Live) ================= */
    /**
     * Lock to the host's song position: its beat 0 happened at `zero` (performance.now() ms).
     * Loop bars and Euclidean steps then land on Live's grid, and recordings are measured from it.
     */
    setHostClock(zero) {
      this.hostZero = zero;
      if (zero !== null && this.running) this.transportStart = zero;
    }
    get hostLocked() {
      return this.hostZero !== null;
    }
    /* ================= live playing ================= */
    keyDown(src, keyMidi, velocity = 100) {
      this.synth.unlock();
      if (this.playMode === "notes") {
        const note = snapToScale(keyMidi, this.scale);
        const keyPc2 = (keyMidi % 12 + 12) % 12;
        const label = scaleNoteLabel(note, this.scale);
        this.held.delete(src);
        this.held.set(src, { keyPc: keyPc2, notes: [note], velocity, label, ch: NOTE_CH });
        if (this.euclidOn) this.ensureTransport();
        else this.emitOn(`live:${src}`, [note], velocity, keyPc2, label, "live", void 0, NOTE_CH);
        this.notify();
        return;
      }
      const hit = chordForKey(keyMidi, this.scale, this.map);
      const notes = voiceLead(hit.slot.chord, hit.rootMidi, this.smooth ? this.lastNotes : null, {
        inversion: this.inversion,
        spread: this.spread
      });
      this.lastNotes = notes;
      const keyPc = hit.slot.keyPc;
      this.current = { slot: hit.slot, notes, keyPc };
      this.hints = suggestNext(this.scale, this.map, keyPc, this.style);
      this.held.delete(src);
      this.held.set(src, { keyPc, notes, velocity, label: hit.slot.chord.symbol, ch: CHORD_CH });
      if (this.euclidOn) this.ensureTransport();
      else this.emitOn(`live:${src}`, notes, velocity, keyPc, hit.slot.chord.symbol, "live");
      this.notify();
    }
    keyUp(src) {
      if (!this.held.delete(src)) return;
      if (!this.euclidOn) this.emitOff(`live:${src}`);
      this.notify();
    }
    /** The chord Euclidean mode plays: the most recently pressed key still held. */
    get euclidChord() {
      let last;
      for (const h of this.held.values()) last = h;
      return last;
    }
    /* ================= Euclidean ================= */
    setEuclid(on) {
      if (on === this.euclidOn) return;
      for (const src of this.held.keys()) this.emitOff(`live:${src}`);
      this.euclidOn = on;
      if (on) this.ensureTransport();
      else {
        this.stopOutputs("euclid");
        if (!this.playing) this.stopTransport();
      }
      this.notify();
    }
    setPattern(p) {
      this.pattern = p;
      this.notify();
    }
    /* ================= chords / notes ================= */
    setPlayMode(m) {
      if (m === this.playMode) return;
      for (const src of this.held.keys()) this.emitOff(`live:${src}`);
      this.stopOutputs("euclid");
      this.held.clear();
      if (this.rec !== "idle") {
        if (this.rec === "recording") this.finishRecording();
        else this.rec = "idle";
      }
      this.playMode = m;
      this.notify();
    }
    /* ================= recording ================= */
    pressRecord() {
      if (this.rec === "idle") {
        if (this.playMode === "notes") return;
        this.stop();
        this.rec = "armed";
        this.recEvents = [];
        this.recOpen.clear();
      } else if (this.rec === "armed") {
        this.rec = "idle";
      } else {
        this.finishRecording();
      }
      this.notify();
    }
    finishRecording() {
      const now = performance.now();
      for (const [, e] of this.recOpen) {
        e.lengthMs = now - this.recT0 - e.startMs;
        this.recEvents.push(e);
      }
      this.recOpen.clear();
      this.rec = "idle";
      const events = this.recEvents.sort((a, b2) => a.startMs - b2.startMs);
      if (!events.length) return;
      const fixed = this.euclidOn || this.tempoLocked || this.hostZero !== null;
      let take = takeFromRecording(events, now - this.recT0, fixed ? this.bpm : void 0, this.bpm);
      if (!fixed) take = { ...take, bpm: Math.round(take.bpm) };
      this.loopOffset = this.hostZero !== null ? Math.round((this.recT0 - this.hostZero) * this.bpm / 6e4) : 0;
      this.rawTake = take;
      this.loopBars = "auto";
      this.derive();
      this.takeName = "Your take";
      if (take.bpm !== this.bpm) {
        this.bpm = take.bpm;
        this.onTempo?.(this.bpm);
      }
      this.play();
    }
    /** ×2 / ÷2: fix a double- or half-time guess without changing the sound. */
    reinterpretTake(factor) {
      if (!this.rawTake) return;
      this.rawTake = reinterpret(this.rawTake, factor);
      this.loopBars = "auto";
      this.derive();
      const wasPlaying = this.playing;
      if (wasPlaying) this.stop();
      this.bpm = this.rawTake.bpm;
      this.onTempo?.(this.bpm);
      if (wasPlaying) this.play();
      this.notify();
    }
    /* ================= ideas: presets & generator ================= */
    loadPreset(p) {
      this.scaleId = p.scale;
      this.recompute();
      this.loadKeys(resolvePreset(p, this.map), p.name);
    }
    generate(opts = {}) {
      this.seq += 1;
      const g2 = generateProgression(this.scale, this.map, { ...opts, style: this.style, seed: Date.now() % 1e5 + this.seq });
      this.loadKeys(g2.keys, `Generated (${this.style === "pop" ? "Pop" : "Bach"})`);
    }
    loadKeys(keys, name) {
      let prev = null;
      const chords = keys.map((pc) => {
        const hit = chordForKey(60 + pc, this.scale, this.map);
        prev = voiceLead(hit.slot.chord, hit.rootMidi, this.smooth ? prev : null, { inversion: this.inversion, spread: this.spread });
        return { notes: prev, beats: 4, keyPc: pc, label: hit.slot.chord.symbol };
      });
      this.stop();
      this.loopOffset = 0;
      this.rawTake = takeFromChords(chords, this.bpm);
      this.loopBars = "auto";
      this.derive();
      this.takeName = name;
      this.play();
    }
    /* ================= loop transport ================= */
    play() {
      if (!this.take) return;
      this.synth.unlock();
      this.playing = true;
      this.restartTransport();
      this.notify();
    }
    stop() {
      if (!this.playing) return;
      this.playing = false;
      this.stopOutputs("loop");
      if (!this.euclidOn) this.stopTransport();
      this.notify();
    }
    clearTake() {
      this.stop();
      this.take = this.rawTake = null;
      this.takeName = "";
      this.notify();
    }
    /** Rebuild the playing loop from the raw take (quantize + length). Keeps playing seamlessly. */
    derive() {
      if (!this.rawTake) {
        this.take = null;
        return;
      }
      let t = quantizeTake(this.rawTake, this.quantize);
      if (this.loopBars !== "auto") t = setLoopBars(t, this.loopBars);
      this.take = t;
    }
    setQuantize(q) {
      this.quantize = q;
      this.derive();
      this.notify();
    }
    setLoopLength(bars) {
      this.loopBars = bars;
      this.derive();
      this.notify();
    }
    /** Bars the loop has right now. */
    get bars() {
      return this.take ? this.take.beats / 4 : 0;
    }
    /** 0..1 position in the loop, for the playhead. */
    loopPosition() {
      if (!this.playing || !this.take || !this.running) return -1;
      const L = this.take.beats;
      const b2 = this.beatAt(performance.now()) - this.loopOffset;
      return (b2 % L + L) % L / L;
    }
    /** 0..1 position in the Euclidean cycle, for the ring's hand. */
    cyclePosition() {
      if (!this.running) return -1;
      const b2 = this.beatAt(performance.now());
      const c2 = cycleBeats(this.pattern);
      return b2 < 0 ? 0 : b2 % c2 / c2;
    }
    midiFile() {
      if (!this.take) return null;
      const name = `${this.keyName} ${this.takeName} ${Math.round(this.bpm)}bpm`;
      return {
        bytes: writeMidi(takeToMidiEvents(this.take), this.take.bpm, name),
        filename: "harmonique-" + name.toLowerCase().replace(/[^a-z0-9#♭♯]+/g, "-").replace(/^-|-$/g, "") + ".mid"
      };
    }
    panic() {
      this.stop();
      this.setEuclid(false);
      for (const id of [...this.active.keys()]) this.emitOff(id);
      this.held.clear();
      this.synth.allOff();
      this.midi.panic();
      this.notify();
    }
    /* ================= output funnel ================= */
    emitOn(id, notes, velocity, keyPc, label, source, at, ch = CHORD_CH) {
      if (this.active.has(id)) this.emitOff(id, at);
      const out = { notes, keyPc, source, label, ch };
      this.active.set(id, out);
      this.synth.on(id, notes, velocity, at);
      for (const n of notes) this.midi.send(n, velocity, ch, at);
      const t = at ?? performance.now();
      if (source !== "loop" && ch === CHORD_CH) {
        if (this.rec === "armed") {
          this.rec = "recording";
          this.recT0 = this.recordAnchor(t);
          this.notify();
        }
        if (this.rec === "recording") this.recOpen.set(id, { startMs: Math.max(0, t - this.recT0), lengthMs: 0, notes, velocity, keyPc, label });
      }
      this.later(t, () => {
        this.sounding.set(id, out);
        if (source === "loop") this.showLoopChord(out);
        this.notify();
      });
    }
    emitOff(id, at) {
      const out = this.active.get(id);
      if (!out) return;
      this.active.delete(id);
      this.synth.off(id, at);
      for (const n of out.notes) this.midi.release(n, out.ch, at);
      const t = at ?? performance.now();
      const open = this.recOpen.get(id);
      if (open) {
        open.lengthMs = t - this.recT0 - open.startMs;
        this.recEvents.push(open);
        this.recOpen.delete(id);
      }
      this.later(t, () => {
        this.sounding.delete(id);
        this.notify();
      });
    }
    /** Where a recording's beat 0 is: your first chord, or with Live playing, the bar line nearest to it. */
    recordAnchor(t) {
      if (this.hostZero === null) return t;
      const barMs = 4 * 6e4 / this.bpm;
      return this.hostZero + Math.round((t - this.hostZero) / barMs) * barMs;
    }
    showLoopChord(out) {
      if ([...this.held.values()].some((h) => h.ch === CHORD_CH)) return;
      const slot = this.map[out.keyPc];
      this.current = { slot, notes: out.notes, keyPc: out.keyPc };
      this.hints = suggestNext(this.scale, this.map, out.keyPc, this.style);
    }
    stopOutputs(source) {
      for (const [id, o] of [...this.active]) if (o.source === source) this.emitOff(id);
    }
    later(t, fn) {
      const d = t - performance.now();
      if (d <= 1) fn();
      else setTimeout(fn, d);
    }
    /* ================= scheduler ================= */
    beatAt(t) {
      return (t - this.transportStart) * this.bpm / 6e4;
    }
    timeAt(beat) {
      return this.transportStart + beat * 6e4 / this.bpm;
    }
    ensureTransport() {
      if (!this.running) this.startTransport(performance.now() + 30);
    }
    restartTransport() {
      this.stopOutputs("loop");
      this.stopOutputs("euclid");
      if (this.running) this.stopTransport(false);
      this.startTransport(performance.now() + 30);
    }
    startTransport(at) {
      this.running = true;
      this.transportStart = this.hostZero ?? at;
      this.scheduledTo = this.hostZero !== null ? Math.max(this.hostZero, at - CATCH_UP_MS) : at;
      if (this.clockOut) this.midi.raw([250], at);
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.tick(), TICK_MS);
      this.tick();
    }
    stopTransport(sendStop = true) {
      if (!this.running) return;
      this.running = false;
      window.clearInterval(this.timer);
      if (this.clockOut && sendStop) this.midi.raw([252]);
    }
    tick() {
      if (!this.running) return;
      const to = performance.now() + LOOKAHEAD_MS;
      const from = this.scheduledTo;
      if (to <= from) return;
      const b0 = this.beatAt(from);
      const b1 = this.beatAt(to);
      const jobs = [];
      if (this.clockOut) {
        for (let i = Math.ceil(b0 * 24); i < b1 * 24; i++) {
          const t = this.timeAt(i / 24);
          jobs.push({ t, order: 0, run: () => this.midi.raw([248], t) });
        }
      }
      if (this.playing && this.take) {
        const L = this.take.beats;
        const off = this.loopOffset;
        for (let c2 = Math.floor((b0 - off) / L); c2 <= Math.floor((b1 - off) / L); c2++) {
          this.take.events.forEach((e, i) => {
            const b2 = c2 * L + e.start + off;
            if (b2 < b0 || b2 >= b1 || b2 < 0) return;
            const id = `loop:${c2}:${i}`;
            const tOn = this.timeAt(b2);
            const tOff = this.timeAt(b2 + e.length);
            jobs.push({ t: tOn, order: 2, run: () => {
              this.emitOn(id, e.notes, e.velocity, e.keyPc ?? 0, e.label ?? "", "loop", tOn);
              this.emitOffAt(id, tOff);
            } });
          });
        }
      }
      if (this.euclidOn) {
        const C = cycleBeats(this.pattern);
        const hits = patternHits(this.pattern);
        for (let c2 = Math.floor(b0 / C); c2 <= Math.floor(b1 / C); c2++) {
          hits.forEach((h, j) => {
            const b2 = c2 * C + h.start;
            if (b2 < b0 || b2 >= b1 || b2 < 0) return;
            const tOn = this.timeAt(b2);
            const tOff = this.timeAt(b2 + h.length);
            const id = `eu:${c2}:${j}`;
            jobs.push({ t: tOn, order: 2, run: () => {
              const chord = this.euclidChord;
              if (!chord) return;
              this.emitOn(id, chord.notes, chord.velocity, chord.keyPc, chord.label, "euclid", tOn, chord.ch);
              this.emitOffAt(id, tOff);
            } });
          });
        }
      }
      jobs.sort((a, b2) => a.t - b2.t || a.order - b2.order).forEach((j) => j.run());
      this.scheduledTo = to;
    }
    /** Note-offs far in the future are handed over just before they're due, keeping MIDI messages in time order. */
    emitOffAt(id, t) {
      const due = t - performance.now() - LOOKAHEAD_MS;
      if (due <= 0) this.emitOff(id, t);
      else setTimeout(() => this.emitOff(id, Math.max(t, performance.now())), due);
    }
  };

  // app/plugin/protocol.ts
  var CALLS = [
    "set",
    "setBpm",
    "setPattern",
    "setPlayMode",
    "setEuclid",
    "setQuantize",
    "setLoopLength",
    "keyDown",
    "keyUp",
    "pressRecord",
    "play",
    "stop",
    "reinterpretTake",
    "loadPreset",
    "generate",
    "panic"
  ];
  var asciiJson = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);

  // app/plugin/engine.ts
  var HostBridge = class {
    constructor(cb) {
      __publicField(this, "cb", cb);
      __publicField(this, "status", "ready");
      __publicField(this, "inputId", "host");
      __publicField(this, "outputId", "host");
      __publicField(this, "outputName", "HOST");
      __publicField(this, "hasOutput", true);
      __publicField(this, "sounding", /* @__PURE__ */ new Map());
      __publicField(this, "inCount", 0);
      __publicField(this, "outCount", 0);
      __publicField(this, "lastIn", "");
    }
    async init() {
    }
    inputs() {
      return [];
    }
    outputs() {
      return [];
    }
    setInput() {
    }
    setOutput() {
    }
    isLoopInput() {
      return false;
    }
    noteIn(note, vel) {
      this.inCount++;
      this.lastIn = `${note}/${vel}`;
      if (vel > 0) this.cb.noteOn(note, vel, 0);
      else this.cb.noteOff(note, 0);
    }
    send(note, velocity, ch = 0, at) {
      const k = ch * 128 + note;
      const n = this.sounding.get(k) ?? 0;
      this.sounding.set(k, n + 1);
      if (n === 0) this.raw([144 | ch, note, velocity], at);
    }
    release(note, ch = 0, at) {
      const k = ch * 128 + note;
      const n = this.sounding.get(k) ?? 0;
      if (n <= 1) {
        this.sounding.delete(k);
        this.raw([128 | ch, note, 0], at);
      } else this.sounding.set(k, n - 1);
    }
    raw(data, at) {
      if (data.length !== 3) return;
      this.outCount++;
      native.midi(data[0], data[1], data[2], at ?? native.now());
    }
    panic() {
      for (const k of this.sounding.keys()) this.raw([128 | Math.floor(k / 128), k % 128, 0]);
      this.sounding.clear();
      for (let ch = 0; ch < 2; ch++) {
        this.raw([176 | ch, 123, 0]);
        this.raw([176 | ch, 64, 0]);
      }
    }
  };
  var bridge;
  var c = new Controller((cb) => bridge = new HostBridge(cb));
  c.clockOut = false;
  c.synth.enabled = false;
  c.synth.unlock = () => {
  };
  var dirty = true;
  var lastSent = 0;
  c.subscribe(() => {
    dirty = true;
  });
  var host = { bpm: c.bpm, playing: false, zero: NaN };
  var pendingPlay = false;
  var round = (bpm) => Math.round(bpm * 10) / 10;
  function onHost(bpm, playing, zero) {
    const tempoMoved = bpm > 0 && Math.abs(bpm - host.bpm) > 1e-3;
    if (bpm > 0) host.bpm = bpm;
    if (playing && !host.playing) {
      pendingPlay = true;
      host.zero = NaN;
      dirty = true;
    }
    if (!playing && host.playing) {
      pendingPlay = false;
      host.zero = NaN;
      c.setHostClock(null);
      c.stop();
      dirty = true;
    }
    host.playing = playing;
    if (tempoMoved || playing && round(host.bpm) !== c.bpm) c.setBpm(host.bpm, true);
    if (playing && Number.isFinite(zero)) {
      if (!(Math.abs(zero - host.zero) < 0.5)) {
        host.zero = zero;
        c.setHostClock(zero);
      }
      if (pendingPlay) {
        pendingPlay = false;
        if (c.take) c.play();
      }
    }
  }
  function snapshot() {
    return {
      rootPc: c.rootPc,
      scaleId: c.scaleId,
      size: c.size,
      inversion: c.inversion,
      spread: c.spread,
      smooth: c.smooth,
      style: c.style,
      bpm: c.bpm,
      euclidOn: c.euclidOn,
      playMode: c.playMode,
      pattern: c.pattern,
      quantize: c.quantize,
      loopBars: c.loopBars,
      playing: c.playing,
      rec: c.rec,
      take: c.take,
      takeName: c.takeName,
      current: c.current ? { keyPc: c.current.keyPc, notes: c.current.notes } : null,
      hints: c.hints,
      sounding: [...c.sounding.values()],
      loopPos: c.loopPosition(),
      cyclePos: c.cyclePosition(),
      host: { bpm: host.bpm, playing: host.playing },
      io: { inCount: bridge.inCount, outCount: bridge.outCount, lastIn: bridge.lastIn }
    };
  }
  function saveState() {
    return {
      v: 1,
      rootPc: c.rootPc,
      scaleId: c.scaleId,
      size: c.size,
      inversion: c.inversion,
      spread: c.spread,
      smooth: c.smooth,
      style: c.style,
      bpm: c.bpm,
      euclidOn: c.euclidOn,
      playMode: c.playMode,
      pattern: c.pattern,
      quantize: c.quantize,
      loopBars: c.loopBars,
      rawTake: c.rawTake,
      takeName: c.takeName
    };
  }
  function loadState(s) {
    if (!s || s.v !== 1) return;
    c.panic();
    c.set("rootPc", s.rootPc);
    c.set("scaleId", s.scaleId);
    c.set("size", s.size);
    c.set("inversion", s.inversion);
    c.set("spread", s.spread);
    c.set("smooth", s.smooth);
    c.set("style", s.style);
    c.setPlayMode(s.playMode);
    c.setPattern(s.pattern);
    c.setBpm(s.bpm, true);
    c.rawTake = s.rawTake;
    c.takeName = s.rawTake ? s.takeName : "";
    c.setQuantize(s.quantize);
    c.setLoopLength(s.loopBars);
    c.setEuclid(s.euclidOn);
  }
  function call({ m, a }) {
    if (!CALLS.includes(m)) return;
    const args = m === "loadPreset" ? [PRESETS[Number(a[0])]] : a;
    if (m === "loadPreset" && !args[0]) return;
    c[m].apply(c, args);
  }
  var safe = (name, fn) => (...a) => {
    try {
      return fn(...a);
    } catch (e) {
      native.log(`${name}: ${String(e)}${e instanceof Error && e.stack ? `
${e.stack}` : ""}`);
      return "";
    }
  };
  globalThis.harmonique = {
    pump: safe("pump", () => runTimers()),
    noteIn: safe("noteIn", (note, vel) => bridge.noteIn(note, vel)),
    host: safe("host", (bpm, playing, zero) => onHost(bpm, playing, zero)),
    call: safe("call", (json) => call(JSON.parse(json))),
    /** Snapshot JSON when something changed (or every 500 ms while the loop / Euclidean runs), else ''. */
    poll: safe("poll", (force = false) => {
      const now = native.now();
      const moving = c.playing || c.euclidOn;
      if (!force && !dirty && !(moving && now - lastSent > 500)) return "";
      dirty = false;
      lastSent = now;
      return asciiJson(snapshot());
    }),
    saveState: safe("saveState", () => asciiJson(saveState())),
    loadState: safe("loadState", (json) => loadState(JSON.parse(json))),
    panic: safe("panic", () => c.panic())
  };
})();
