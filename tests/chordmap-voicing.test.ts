import { describe, expect, it } from 'vitest';
import {
  buildScale, scaleFromPitchClass, buildChordMap, chordForKey, colorChords, diatonicChord,
  voiceChord, trimmedIntervals, SCALES, CHORD_SIZES, BLACK_PCS, WHITE_PCS,
} from '../engine';

const blackSymbols = (root: string, id: Parameters<typeof buildScale>[1], size: Parameters<typeof buildChordMap>[1] = 'triad') => {
  const m = buildChordMap(buildScale(root, id), size);
  return BLACK_PCS.map((pc) => m[pc].chord.symbol);
};

describe('chord map: color chords (hand-checked)', () => {
  it('C major black keys: D7 E7 Fm A♭ B♭ family', () =>
    expect(blackSymbols('C', 'ionian', '7th')).toEqual(['D7', 'E7', 'Fm7', 'A♭maj7', 'B♭7']));
  it('C minor black keys include major V, Neapolitan, Picardy, major IV, V of V', () =>
    expect(blackSymbols('C', 'aeolian')).toEqual(['C', 'D♭', 'D', 'F', 'G']));
  it('C Dorian black keys', () => expect(blackSymbols('C', 'dorian')).toEqual(['C', 'D♭', 'D', 'G', 'A♭']));
  it('explains itself', () => {
    const m = buildChordMap(buildScale('C', 'ionian'), 'triad');
    expect(m[5].reason).toBe('C Major');
    const fm = m[BLACK_PCS[2]];
    expect(fm.role).toBe('Minor iv');
    expect(fm.reason).toBe('Borrowed from C Minor');
    expect(m[BLACK_PCS[0]].reason).toBe('Secondary dominant → G');
  });
});

describe('chord map invariants: 12 roots × 10 scales × 5 sizes', () => {
  for (let pc = 0; pc < 12; pc++) for (const def of SCALES) {
    it(`pc ${pc} ${def.id}`, () => {
      const s = scaleFromPitchClass(pc, def.id);
      const triadMap = buildChordMap(s, 'triad');
      const diatonicTriads = new Set(WHITE_PCS.map((k) => triadMap[k].chord.pitchClasses.join(',')));
      // 5 distinct color chords, none of them already in the scale.
      const colors = BLACK_PCS.map((k) => triadMap[k].chord.pitchClasses.join(','));
      expect(new Set(colors).size).toBe(5);
      colors.forEach((c) => expect(diatonicTriads.has(c)).toBe(false));
      // Choice doesn't change with chord size.
      for (const size of CHORD_SIZES) {
        const m = buildChordMap(s, size);
        BLACK_PCS.forEach((k) => expect(m[k].chord.notes[0]).toEqual(triadMap[k].chord.notes[0]));
        m.forEach((slot) => expect(slot.chord.notes.every((n) => Math.abs(n.accidental) <= 1)).toBe(true));
      }
      // Roots rise with the keys inside one octave.
      const roots = Array.from({ length: 12 }, (_, i) => chordForKey(60 + i, s, triadMap).rootMidi);
      const whiteRoots = WHITE_PCS.map((k) => roots[k]);
      expect([...whiteRoots].sort((a, b) => a - b)).toEqual(whiteRoots);
      expect(colorChords(s).length).toBe(5);
    });
  }
});

describe('chordForKey', () => {
  const s = buildScale('C', 'dorian');
  const m = buildChordMap(s, 'triad');
  it('F4 key plays F major rooted on F4 (degree 4)', () => {
    const hit = chordForKey(65, s, m);
    expect(hit.slot.chord.symbol).toBe('F');
    expect(hit.rootMidi).toBe(65);
  });
  it('in A minor the C key plays Am rooted on A below it', () => {
    const a = buildScale('A', 'aeolian');
    const hit = chordForKey(60, a, buildChordMap(a, 'triad'));
    expect(hit.slot.chord.symbol).toBe('Am');
    expect(hit.rootMidi).toBe(57);
  });
});

describe('voicing', () => {
  const C = buildScale('C', 'ionian');
  const I = diatonicChord(C, 1, 'triad');
  const Imaj7 = diatonicChord(C, 1, '7th');
  it('close root position', () => expect(voiceChord(I, 60)).toEqual([60, 64, 67]));
  it('1st inversion', () => expect(voiceChord(I, 60, { inversion: 1 })).toEqual([64, 67, 72]));
  it('2nd inversion', () => expect(voiceChord(I, 60, { inversion: 2 })).toEqual([67, 72, 76]));
  it('triad inversion clamps at 2', () => expect(voiceChord(I, 60, { inversion: 3 })).toEqual([67, 72, 76]));
  it('3rd inversion of maj7', () => expect(voiceChord(Imaj7, 60, { inversion: 3 })).toEqual([71, 72, 76, 79]));
  it('open triad', () => expect(voiceChord(I, 60, { spread: 'open' })).toEqual([60, 67, 76]));
  it('open maj7 = drop 2', () => expect(voiceChord(Imaj7, 60, { spread: 'open' })).toEqual([55, 60, 64, 71]));
  it('wide = drop 2 + bass', () => expect(voiceChord(Imaj7, 60, { spread: 'wide' })).toEqual([43, 55, 60, 64, 71]));
  it('Cmaj11 drops the 5th and the clashing 11', () =>
    expect(trimmedIntervals(diatonicChord(C, 1, '11th'))).toEqual([0, 4, 11, 14]));
  it('Dm11 keeps the 11 (minor 3rd, no clash)', () =>
    expect(trimmedIntervals(diatonicChord(C, 2, '11th'))).toEqual([0, 3, 10, 14, 17]));
  it('G13 = 1 3 7 9 13', () => expect(trimmedIntervals(diatonicChord(C, 5, '13th'))).toEqual([0, 4, 10, 14, 21]));
  it('Lydian maj13 keeps the ♯11', () =>
    expect(trimmedIntervals(diatonicChord(buildScale('C', 'lydian'), 1, '13th'))).toEqual([0, 4, 11, 14, 18, 21]));
  it('trim off keeps everything', () =>
    expect(trimmedIntervals(diatonicChord(C, 5, '13th'), false)).toEqual([0, 4, 7, 10, 14, 17, 21]));
  it('stays in MIDI range', () => {
    const n = voiceChord(diatonicChord(C, 5, '13th'), 120);
    expect(Math.max(...n)).toBeLessThanOrEqual(127);
  });
});
