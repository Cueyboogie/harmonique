import { Controller } from '../controller';
import { mountMonitor } from '../monitor/view';
import { MaxBridge, maxApi } from './bridge';

const c = new Controller((cb) => new MaxBridge(cb));
c.set('clockOut', false);      // Live is the clock
c.tempoLocked = true;           // recordings keep Live's tempo, never stretched
c.synth.enabled = false;        // the track's instrument makes the sound
mountMonitor(c, { mode: 'live' });

/*
 * Live's song position arrives as "songtime <beats>" a few times a second. Each message is a little
 * late (it has to travel Max → page), so the earliest estimate of "when was beat 0" is the truest:
 * keep the minimum over recent messages, and start over when Live jumps or changes tempo.
 */
let livePlaying = false;
let pendingPlay = false;
let est: number[] = [];
let zero: number | null = null;

function onSongTime(beats: number) {
  if (!livePlaying) return;
  const cand = performance.now() - (beats * 60000) / c.bpm;
  if (zero !== null && Math.abs(cand - zero) > 60) est = []; // relocated or tempo moved
  est.push(cand);
  if (est.length > 24) est.shift();
  zero = Math.min(...est);
  c.setHostClock(zero);
  if (pendingPlay) { pendingPlay = false; if (c.take) c.play(); }
}

const m = maxApi();
if (m) {
  m.bindInlet('tempo', (bpm) => { est = []; c.setBpm(bpm); });
  m.bindInlet('songtime', onSongTime);
  // Live's transport: starting Live starts the loop on Live's grid; stopping Live stops it.
  m.bindInlet('liveplay', (on) => {
    livePlaying = !!on;
    if (on) { est = []; zero = null; pendingPlay = true; }
    else { pendingPlay = false; zero = null; c.setHostClock(null); c.stop(); }
  });
}
