/**
 * The Countdown's optional chime (off by default; settings.sound). Plays src/shared/chime.js at most ONCE per appearance id
 * (a milestone / final / zero takeover key, a live moment id), never loops, and never throws: no Web Audio, a blocked
 * autoplay or a missing chime.js simply stays silent. One AudioContext, made lazily on the first chime.
 * The kiosk browser is started with --autoplay-policy=no-user-gesture-required (deploy/kiosk-launch.sh, deploy/windows/kiosk.ps1).
 */
import * as Chime from '../../shared/chime.js';

const played = new Set();
let ctx = null;
const make = () => {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) throw new Error('no audio');
  ctx = new AC();
  return ctx;
};

export function playOnce(id, sound) {
  try {
    if (!id || !sound || !sound.chime || played.has(id) || typeof Chime.playChime !== 'function') return false;
    played.add(id);
    if (played.size > 200) played.delete(played.values().next().value);
    return !!Chime.playChime(sound.chime, sound.volume, make);
  } catch { return false; }
}
