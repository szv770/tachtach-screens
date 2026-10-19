import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { setDirty } from './dirty.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Form state with "what did I change" tracking, for the floating SaveBar.
 *
 *   const form = useDirtyForm(initialValues, { onSave: async (values, changedKeys) => ok });
 *   <input value={form.values.name} onChange={(e) => form.set('name', e.target.value)} />
 *   <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} />
 *
 * While anything is edited the form is registered with the leave-page guard (dirty.js).
 * When `initial` changes from outside (server push) and nothing is edited, the form follows it.
 * `onSave` may return false (or throw) to keep the edits.
 */
export default function useDirtyForm(initial, { onSave, label = 'this page' } = {}) {
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const changed = Object.keys({ ...saved, ...values }).filter((k) => !same(values[k], saved[k]));
  const count = changed.length;

  useEffect(() => {
    if (!same(initial, savedRef.current)) {
      // Follow outside changes only if the person has no edits in flight.
      setValues((v) => (Object.keys({ ...savedRef.current, ...v }).every((k) => same(v[k], savedRef.current[k])) ? initial : v));
      setSaved(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)]);

  useEffect(() => { setDirty(id, count > 0, label); return () => setDirty(id, false); }, [id, count, label]);

  const set = useCallback((key, val) => setValues((v) => ({ ...v, [key]: val })), []);
  const revert = useCallback(() => { setValues(savedRef.current); setError(''); }, []);
  const save = useCallback(async () => {
    if (saving) return false;
    setSaving(true); setError('');
    let ok = true;
    try { if (onSave) ok = (await onSave(values, changed)) !== false; } catch (e) { ok = false; setError(e?.message || 'Could not save'); }
    setSaving(false);
    if (ok) setSaved(values);
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, saving, onSave, count]);

  return { values, set, setValues, changed, count, dirty: count > 0, revert, save, saving, error, isChanged: (k) => changed.includes(k) };
}
