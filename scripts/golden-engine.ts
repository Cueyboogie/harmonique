/**
 * Golden data for the native plugin: runs the TypeScript engine over every
 * key × scale × chord size × spread × inversion (FIXED and SMOOTH voicing), the NOTES snap,
 * next-chord hints and humanize, and writes what it plays as JSON. The C++ engine test
 * (plugin/Tests/EngineGoldenTest.cpp) must match it exactly.
 *
 *   npx tsx scripts/golden-engine.ts <out.json>
 */
import { writeFileSync } from 'node:fs';
import {
  SCALES, CHORD_SIZES, SPREADS, scaleFromPitchClass, buildChordMap, chordForKey, voiceChord, voiceLead,
  suggestNext, snapToScale, noteKeyMap, noteLabel, humanize, mulberry32, HUMANIZE_STEPS,
} from '../engine';

const out = process.argv[2];
if (!out) throw new Error('usage: tsx scripts/golden-engine.ts <out.json>');

const KEYS_LO = 36, KEYS_HI = 95; // 5 octaves of keys
const maps: unknown[] = [], fixed: unknown[] = [], smooth: unknown[] = [], snap: unknown[] = [], human: unknown[] = [];

for (let root = 0; root < 12; root++) {
  for (const def of SCALES) {
    const scale = scaleFromPitchClass(root, def.id);
    snap.push({
      root, scale: def.id, name: `${noteLabel(scale.root)} ${def.name}`,
      out: Array.from({ length: 128 }, (_, m) => snapToScale(m, scale)),
      labels: noteKeyMap(scale).map((k) => k.label),
    });
    for (const size of CHORD_SIZES) {
      const map = buildChordMap(scale, size);
      maps.push({
        root, scale: def.id, size,
        slots: map.map((s) => ({
          kind: s.kind, symbol: s.chord.symbol, roman: s.chord.roman, role: s.role,
          pcs: s.chord.pitchClasses, iv: s.chord.intervals, rootOffset: s.rootOffset, degree: s.degree, resolvesTo: s.resolvesTo ?? 0,
        })),
        next: map.map((s) => suggestNext(scale, map, s.keyPc, 'pop').map((x) => ({ k: x.keyPc, w: x.weight, s: x.kind }))),
      });
      for (const spread of SPREADS) {
        for (let inversion = 0; inversion < 4; inversion++) {
          const notes: number[][] = [];
          for (let k = KEYS_LO; k <= KEYS_HI; k++) {
            const hit = chordForKey(k, scale, map);
            notes.push(voiceChord(hit.slot.chord, hit.rootMidi, { inversion, spread }));
          }
          fixed.push({ root, scale: def.id, size, spread, inversion, notes });
          // SMOOTH: a fixed pseudo-random walk over the keys, each chord led from the previous one.
          const rnd = mulberry32(root * 1000 + SCALES.indexOf(def) * 100 + CHORD_SIZES.indexOf(size) * 10 + inversion);
          const keys: number[] = [];
          const seq: number[][] = [];
          let prev: number[] | null = null;
          let k = 60;
          for (let i = 0; i < 24; i++) {
            k = Math.max(KEYS_LO, Math.min(KEYS_HI, k + Math.floor(rnd() * 15) - 7 + (rnd() < 0.1 ? 14 : 0)));
            keys.push(k);
            const hit = chordForKey(k, scale, map);
            prev = voiceLead(hit.slot.chord, hit.rootMidi, prev, { inversion, spread });
            seq.push(prev);
          }
          smooth.push({ root, scale: def.id, size, spread, inversion, keys, notes: seq });
        }
      }
    }
  }
}

for (const seed of [1, 2, 3, 99, 12345]) {
  for (const amount of HUMANIZE_STEPS) {
    for (const notes of [[60], [48, 64, 67, 71], [71, 60, 67, 64, 74], [40, 52, 59, 64, 67, 71, 74]]) {
      const rnd = mulberry32(seed);
      const presses = Array.from({ length: 6 }, (_, i) => humanize(notes, 20 + i * 21, amount, rnd)
        .map((h) => ({ n: h.note, v: h.velocity, d: h.delayMs })));
      human.push({ seed, amount, notes, presses });
    }
  }
}

writeFileSync(out, JSON.stringify({ keysLo: KEYS_LO, keysHi: KEYS_HI, maps, fixed, smooth, snap, humanize: human }));
console.log(`golden: ${maps.length} maps, ${fixed.length * (KEYS_HI - KEYS_LO + 1)} fixed chords, ${smooth.length * 24} smooth chords, ${human.length} humanize sets → ${out}`);
