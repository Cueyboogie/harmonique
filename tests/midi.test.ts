import { describe, expect, it, vi } from 'vitest';
import { MidiBridge } from '../explorer/midi';

/** Minimal fake of the Web MIDI API. */
function setup() {
  const sent: number[][] = [];
  const out = { id: 'o1', name: 'IAC Driver Bus 1', send: (d: number[]) => sent.push([...d]) };
  const arturia: any = { id: 'i1', name: 'KeyLab Essential 49', onmidimessage: null };
  const iacIn: any = { id: 'i2', name: 'IAC Driver Bus 1', onmidimessage: null };
  const access: any = { inputs: new Map([['i1', arturia], ['i2', iacIn]]), outputs: new Map([['o1', out]]), onstatechange: null };
  vi.stubGlobal('navigator', { requestMIDIAccess: async () => access });
  const events: string[] = [];
  const bridge = new MidiBridge({
    noteOn: (n, v) => events.push(`on ${n} ${v}`),
    noteOff: (n) => events.push(`off ${n}`),
    devicesChanged: () => {},
  });
  return { bridge, sent, arturia, iacIn, events };
}

describe('MidiBridge', () => {
  it('auto-selects the IAC bus and ignores its own output as input (no feedback loop)', async () => {
    const { bridge, arturia, iacIn } = setup();
    await bridge.init();
    expect(bridge.outputName).toBe('IAC Driver Bus 1');
    expect(arturia.onmidimessage).toBeTypeOf('function');
    expect(iacIn.onmidimessage).toBeNull();
  });

  it('turns note on/off (and velocity-0 note-on) into callbacks', async () => {
    const { bridge, arturia, events } = setup();
    await bridge.init();
    arturia.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
    arturia.onmidimessage({ data: new Uint8Array([0x90, 60, 0]) });
    arturia.onmidimessage({ data: new Uint8Array([0x80, 62, 0]) });
    expect(events).toEqual(['on 60 100', 'off 60', 'off 62']);
  });

  it('passes sustain pedal and pitch bend straight through', async () => {
    const { bridge, arturia, sent } = setup();
    await bridge.init();
    sent.length = 0;
    arturia.onmidimessage({ data: new Uint8Array([0xb0, 64, 127]) });
    arturia.onmidimessage({ data: new Uint8Array([0xe0, 0, 80]) });
    expect(sent).toEqual([[0xb0, 64, 127], [0xe0, 0, 80]]);
  });

  it('shared notes: second chord releasing does not cut the first', async () => {
    const { bridge, sent } = setup();
    await bridge.init();
    sent.length = 0;
    bridge.send(64, 100); // chord A has E
    bridge.send(64, 100); // chord B also has E
    bridge.release(64);   // B released: E must keep sounding
    expect(sent).toEqual([[0x90, 64, 100]]);
    bridge.release(64);   // A released: now E stops
    expect(sent).toEqual([[0x90, 64, 100], [0x80, 64, 0]]);
  });

  it('panic silences everything', async () => {
    const { bridge, sent } = setup();
    await bridge.init();
    bridge.send(60, 90);
    sent.length = 0;
    bridge.panic();
    expect(sent[0]).toEqual([0x80, 60, 0]);
    expect(sent).toContainEqual([0xb0, 123, 0]);
  });
});
