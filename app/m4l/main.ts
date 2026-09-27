import { Controller } from '../controller';
import { mountMonitor } from '../monitor/view';
import { MaxBridge, maxApi } from './bridge';

const c = new Controller((cb) => new MaxBridge(cb));
c.set('clockOut', false);      // Live is the clock
c.tempoLocked = true;           // recordings keep Live's tempo
c.synth.enabled = false;        // the track's instrument makes the sound
mountMonitor(c, { mode: 'live' });

const m = maxApi();
if (m) {
  m.bindInlet('tempo', (bpm) => c.setBpm(bpm));
  // Live's transport: starting Live starts the loop from its first bar; stopping Live stops it.
  m.bindInlet('liveplay', (on) => { if (on) { if (c.take) c.play(); } else c.stop(); });
}
