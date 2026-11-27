import { useEffect } from 'react';
import { ALIVE_EVERY_MS } from '../../shared/kioskAlive.js';

/**
 * Tells the server every 20 s "I am alive and painting" (src/shared/kioskAlive.js). A requestAnimationFrame loop remembers
 * when the page last painted a frame; if painting stalls the number grows, if the page's JavaScript dies the notes stop.
 * The server watchdog then reloads the page or restarts the browser. Only the real screen sends it (not previews).
 */
export function useAliveReport(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let last = performance.now();
    let raf = 0;
    const tick = () => { last = performance.now(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const started = performance.now();
    const send = () => {
      fetch('/api/screen/alive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameAgeMs: Math.round(performance.now() - last),
          clientNow: Date.now(),
          uptimeMs: Math.round(performance.now() - started),
          visible: document.visibilityState !== 'hidden',
        }),
      }).catch(() => {});
    };
    send();
    const id = setInterval(send, ALIVE_EVERY_MS);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [enabled]);
}
