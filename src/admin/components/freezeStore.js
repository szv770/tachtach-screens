import { useSyncExternalStore } from 'react';
import { apiFetch } from '../hooks/useAdminState.js';

/**
 * One shared copy of GET /api/freeze for everything in the admin that shows or controls the
 * Freeze / Blank screen (FreezeControl on Home, the "Screen is frozen" bar in the shell).
 * Polls every 15 s while anything is listening; an action replaces the copy with the server's answer.
 * `offset` = server clock minus this browser's clock, so "Resumes in 20 min" is right even when the
 * phone's clock is off.
 */
let snap = { data: null, error: null, offset: 0, loaded: false };
let timer = null;
const subs = new Set();
const emit = (patch) => { snap = { ...snap, ...patch }; subs.forEach((f) => f()); };
const take = (data) => emit({ data, error: null, loaded: true, offset: Number.isFinite(data?.now) ? data.now - Date.now() : snap.offset });

export async function refreshFreeze() {
  try { take(await apiFetch('/api/freeze')); } catch (e) { emit({ error: e.message, loaded: true }); }
}

function subscribe(fn) {
  subs.add(fn);
  if (!timer) { refreshFreeze(); timer = setInterval(refreshFreeze, 15000); }
  return () => { subs.delete(fn); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}

/** { mode, message?, style?, duration?, minutes?, at? } -> the new state. Throws the server's plain-English error. */
export async function freezeScreen(body) {
  const data = await apiFetch('/api/freeze', { method: 'POST', body: JSON.stringify(body) });
  take(data); return data;
}
export async function resumeScreen() {
  const data = await apiFetch('/api/freeze', { method: 'DELETE' });
  take(data); return data;
}
export async function saveFreezeSchedule(body) {
  const data = await apiFetch('/api/freeze/schedule', { method: 'PUT', body: JSON.stringify(body) });
  take(data); return data;
}

export function useFreeze() {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}
