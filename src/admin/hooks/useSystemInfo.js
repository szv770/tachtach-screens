import { useEffect, useState } from 'react';
import { opsApi } from '../api/ops.js';

let cached = null;
let inflight = null;

/** This server's identity (admin only; null for everyone else or while loading). Loaded once per page load and shared. */
export default function useSystemInfo(enabled) {
  const [info, setInfo] = useState(cached);
  useEffect(() => {
    if (!enabled || cached) return undefined;
    let alive = true;
    inflight = inflight || opsApi.systemInfo().then((d) => { cached = d; return d; }).catch(() => null).finally(() => { inflight = null; });
    inflight.then((d) => { if (alive && d) setInfo(d); });
    return () => { alive = false; };
  }, [enabled]);
  return enabled ? info : null;
}
