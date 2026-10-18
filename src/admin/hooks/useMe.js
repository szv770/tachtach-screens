import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './useAdminState.js';

/**
 * Who is signed in: { id, username, name, role: 'admin'|'editor', hasPassword,
 * totpEnabled, ... } from GET /api/me. `ready` flips once the first answer (or
 * failure) is in; `refreshMe` re-reads it after the person changes their account.
 * If the call fails `me` stays null and the admin treats the person as an editor
 * for menu purposes (the server enforces the real rules either way).
 */
export default function useMe() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  const refreshMe = useCallback(async () => {
    try {
      const r = await apiFetch('/api/me');
      setMe(r?.user || null);
    } catch {
      /* keep what we had */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  return { me, ready, refreshMe };
}
