// Unsaved-changes registry: forms register themselves while edited, and the shell asks
// before leaving the page (section change) or closing the tab (beforeunload).
const dirty = new Map(); // id -> label
const listeners = new Set();

export function setDirty(id, on, label = 'this page') {
  const had = dirty.has(id);
  if (on && !had) dirty.set(id, label);
  else if (!on && had) dirty.delete(id);
  else return;
  listeners.forEach((fn) => fn());
}
export function isAnyDirty() { return dirty.size > 0; }
export function onDirtyChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** True when it is fine to navigate away (nothing edited, or the person confirmed). */
export function confirmLeave(message = 'You have unsaved changes. Leave without saving?') {
  if (!dirty.size) return true;
  const ok = typeof window === 'undefined' ? true : window.confirm(message);
  return ok;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!dirty.size) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
}
