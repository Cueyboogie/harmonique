/**
 * Standard MIDI File writer (format 0, one track). Lets a progression be dropped into any DAW.
 */

export interface NoteEvent {
  notes: number[];
  /** Start, in beats (quarter notes). */
  start: number;
  /** Length, in beats. */
  length: number;
  velocity?: number;
}

const vlq = (n: number) => {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
};
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function writeMidi(events: NoteEvent[], bpm = 120, name = 'Harmonic', ppq = 480): Uint8Array<ArrayBuffer> {
  const raw: { tick: number; order: number; data: number[] }[] = [];
  for (const e of events) {
    const on = Math.round(e.start * ppq);
    const off = Math.round((e.start + e.length) * ppq);
    for (const n of e.notes) {
      raw.push({ tick: on, order: 1, data: [0x90, n, e.velocity ?? 100] });
      raw.push({ tick: off, order: 0, data: [0x80, n, 0] }); // offs before ons at the same tick
    }
  }
  raw.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const usPerBeat = Math.round(60_000_000 / bpm);
  const track: number[] = [
    0, 0xff, 0x03, ...vlq(name.length), ...text(name), // track name
    0, 0xff, 0x51, 0x03, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255, // tempo
    0, 0xff, 0x58, 0x04, 4, 2, 24, 8, // 4/4
  ];
  let t = 0;
  for (const ev of raw) {
    track.push(...vlq(ev.tick - t), ...ev.data);
    t = ev.tick;
  }
  track.push(0, 0xff, 0x2f, 0); // end of track

  return new Uint8Array([
    ...text('MThd'), ...u32(6), 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255,
    ...text('MTrk'), ...u32(track.length), ...track,
  ]);
}
