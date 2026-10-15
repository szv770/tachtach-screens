function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** An API failure that remembers its HTTP status (0 = couldn't reach the server). */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Parse a server error into a human-readable message. Uses the HTTP status
 * carried by ApiError (the message itself is the server's own text, so
 * sniffing it for "401" never matched).
 */
export function parseErrorMessage(err) {
  const raw = err?.message || 'Unknown error';
  if (err?.status === 401) return 'Session expired. Please log in again.';
  if (err?.status === 413) return 'File too large. Maximum size is 50 MB.';
  if (err?.status === 403 && (!raw || /^403\b/.test(raw))) return 'Permission denied. Please refresh the page.';
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON — use as-is
  }
  return raw;
}

// One redirect is enough; every request in flight will fail with a 401 at once.
let sessionExpired = false;

/**
 * Fetch JSON from the admin API with the CSRF header, a single stale-cookie
 * retry, and expired-session handling. `options.body` may be a FormData (file
 * uploads) — the browser then sets the multipart Content-Type itself.
 */
export async function apiFetch(path, options = {}, _retried = false) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  let res;
  try {
    res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  } catch (networkErr) {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  // The server refreshes the _csrf cookie on every response, including a 403
  // CSRF failure — so a single retry with the fresh cookie always recovers
  // (e.g. cookie was missing/stale after a long-idle tab). Retry once only.
  if (res.status === 403 && method !== 'GET' && !_retried) {
    const body = await res.clone().text();
    if (body.includes('CSRF')) {
      return apiFetch(path, options, true);
    }
  }
  if (res.status === 401) {
    if (!sessionExpired) {
      sessionExpired = true;
      window.location.assign('/login');
    }
    throw new ApiError('Session expired. Please log in again.', 401);
  }
  if (!res.ok) {
    const body = await res.text();
    let errorMsg;
    try {
      const parsed = JSON.parse(body);
      errorMsg = parsed.error || body;
    } catch {
      errorMsg = body;
    }
    throw new ApiError(errorMsg || `${res.status} ${res.statusText}`, res.status);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Toast notification — { id, message, type: 'error'|'success', timestamp }
 */
let toastIdCounter = 0;

/**
 * Show a toast from any component (Media, Photos, RSS, Fonts, ... manage their
 * own fetches and don't get addToast as a prop). No-op before the admin mounts.
 * @param {string} message
 * @param {'success'|'error'} [type]
 */
let toastSink = null;
export function notify(message, type = 'success') {
  if (toastSink) toastSink(message, type);
}

function sameJson(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export default function useAdminState() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef({});
  const savesInFlight = useRef(0); // saves awaiting the server — a background refetch waits for these

  // Add a toast notification that auto-dismisses after 6 seconds
  const addToast = useCallback((message, type = 'error', action = null) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type, action, timestamp: Date.now() }]);
    toastTimers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete toastTimers.current[id];
    }, 6000);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (toastTimers.current[id]) {
      clearTimeout(toastTimers.current[id]);
      delete toastTimers.current[id];
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    toastSink = addToast;
    return () => {
      if (toastSink === addToast) toastSink = null;
      Object.values(toastTimers.current).forEach(clearTimeout);
    };
  }, []);

  /**
   * Wraps an async action with error handling.
   * On failure, shows a toast with a user-friendly message.
   * On success (if successMsg is provided), shows a success toast.
   * Returns true on success, false on failure.
   */
  const withErrorHandling = useCallback(async (actionName, fn, successMsg) => {
    savesInFlight.current++;
    try {
      await fn();
      if (successMsg) addToast(successMsg, 'success');
      return true;
    } catch (err) {
      const msg = parseErrorMessage(err);
      addToast(`${actionName}: ${msg}`, 'error');
      console.error(`[Admin] ${actionName} failed:`, err);
      return false;
    } finally {
      savesInFlight.current--;
    }
  }, [addToast]);

  const fetchState = useCallback(async (opts = {}) => {
    try {
      if (!opts.silent) setLoading(true);
      setError(null);
      const data = await apiFetch('/api/state');
      // Map nested schedule data to flat keys for component consumption
      const next = {
        ...data,
        scheduleEntries: data.schedule?.entries || [],
        scheduleCategories: data.schedule?.categories || [],
      };
      // Merge onto what we have (keys fetched lazily, e.g. scheduleTemplates,
      // survive) and keep the old reference for anything unchanged, so panels
      // that rebase on a prop change don't churn on a no-op refetch.
      setState(prev => {
        if (!prev) return next;
        const merged = { ...prev };
        for (const key of Object.keys(next)) {
          merged[key] = sameJson(prev[key], next[key]) ? prev[key] : next[key];
        }
        return merged;
      });
    } catch (err) {
      if (!opts.silent) setError(parseErrorMessage(err));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  // Pick up changes made on another device or tab: when this tab comes back to
  // the foreground after a while, quietly refetch (never mid-save, so an
  // optimistic edit can't be overwritten by an older response).
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30000 && savesInFlight.current === 0) {
        fetchState({ silent: true });
      }
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchState]);

  // Sequence counters so only the LATEST in-flight save may write the server's
  // response back into state. Without this, rapid successive saves (e.g. two
  // quick toggles) could race: an older response landing last would silently
  // revert the newer change on screen.
  const seqRef = useRef({ slides: 0, settings: 0, scheduleEntries: 0 });

  // --- Settings ---
  /**
   * Save settings as a PATCH: pass ONLY the keys you changed, e.g.
   * `updateSettings({ banner: { size: 'large' } })`. The server deep-merges
   * them into settings.json (src/shared/settingsMerge.js), so panels can't
   * revert each other's keys with a stale copy (audit bug 14). Never spread
   * the whole `settings` object into the patch. A panel that edits a local
   * copy should send `diffSettings(original, local)`. New top-level keys must
   * be added to SETTINGS_KEYS or the server answers 400.
   */
  const updateSettings = useCallback(async (patch, successMsg = 'Settings saved') => {
    if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) return true;
    const seq = ++seqRef.current.settings;
    setState(prev => ({ ...prev, settings: deepMerge(prev.settings || {}, patch) })); // optimistic
    const ok = await withErrorHandling('Save settings', async () => {
      const result = await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (result && seq === seqRef.current.settings) {
        setState(prev => ({ ...prev, settings: result }));
      }
    }, successMsg);
    if (!ok && seq === seqRef.current.settings) fetchState({ silent: true }); // resync after failure
    return ok;
  }, [withErrorHandling, fetchState]);

  // --- Slides ---
  const updateSlides = useCallback(async (slides) => {
    const seq = ++seqRef.current.slides;
    setState(prev => ({ ...prev, slides })); // optimistic
    const ok = await withErrorHandling('Update slides', async () => {
      const result = await apiFetch('/api/slides', {
        method: 'PUT',
        body: JSON.stringify(slides),
      });
      if (result && seq === seqRef.current.slides) {
        setState(prev => ({ ...prev, slides: result }));
      }
    });
    if (!ok && seq === seqRef.current.slides) fetchState({ silent: true }); // resync after failure
    return ok;
  }, [withErrorHandling, fetchState]);

  const createSlide = useCallback(async (slide) => {
    let created;
    const ok = await withErrorHandling('Create slide', async () => {
      created = await apiFetch('/api/slides', {
        method: 'POST',
        body: JSON.stringify(slide),
      });
      setState(prev => ({ ...prev, slides: [...(prev.slides || []), created] }));
    }, 'Slide added');
    return ok ? created : null;
  }, [withErrorHandling]);

  const deleteSlide = useCallback(async (id) => {
    return withErrorHandling('Delete slide', async () => {
      await apiFetch(`/api/slides/${id}`, { method: 'DELETE' });
      // The server also deletes the announcement behind an ANNOUNCEMENT slide.
      setState(prev => {
        const gone = (prev.slides || []).find(s => s.id === id);
        return {
          ...prev,
          slides: (prev.slides || []).filter(s => s.id !== id),
          announcements: gone?.type === 'ANNOUNCEMENT' && gone.announcementId
            ? (prev.announcements || []).filter(a => a.id !== gone.announcementId)
            : prev.announcements,
        };
      });
    }, 'Slide deleted');
  }, [withErrorHandling]);

  // --- Announcements (unified slides / banners / side notes / takeovers) ---
  const upsertAnnouncement = useCallback((item) => {
    setState(prev => {
      const list = prev.announcements || [];
      const exists = list.some(a => a.id === item.id);
      return { ...prev, announcements: exists ? list.map(a => a.id === item.id ? item : a) : [...list, item] };
    });
  }, []);

  /** Apply a server response that may also have changed other takeovers (conflict choices). */
  const resyncAnnouncements = useCallback(async () => {
    try {
      const list = await apiFetch('/api/announcements');
      if (Array.isArray(list)) setState(prev => ({ ...prev, announcements: list }));
    } catch { /* keep optimistic state */ }
  }, []);

  const createAnnouncement = useCallback(async (data, successMsg = 'Posted') => {
    let created;
    const ok = await withErrorHandling('Save announcement', async () => {
      created = await apiFetch('/api/announcements', { method: 'POST', body: JSON.stringify(data) });
      upsertAnnouncement(created);
      if (data.resolve) await resyncAnnouncements();
    }, successMsg);
    return ok ? created : null;
  }, [withErrorHandling, upsertAnnouncement, resyncAnnouncements]);

  const updateAnnouncement = useCallback(async (id, data, successMsg = 'Saved') => {
    let updated;
    const ok = await withErrorHandling('Save announcement', async () => {
      updated = await apiFetch(`/api/announcements/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
      upsertAnnouncement(updated);
      if (data.resolve) await resyncAnnouncements();
    }, successMsg);
    return ok ? updated : null;
  }, [withErrorHandling, upsertAnnouncement, resyncAnnouncements]);

  const reactivateAnnouncement = useCallback(async (id, body, successMsg = 'Back on screen') => {
    let updated;
    const ok = await withErrorHandling('Show again', async () => {
      updated = await apiFetch(`/api/announcements/${encodeURIComponent(id)}/reactivate`, { method: 'POST', body: JSON.stringify(body || {}) });
      upsertAnnouncement(updated);
    }, successMsg);
    return ok ? updated : null;
  }, [withErrorHandling, upsertAnnouncement]);

  const duplicateAnnouncement = useCallback(async (id) => {
    let copy;
    const ok = await withErrorHandling('Duplicate', async () => {
      copy = await apiFetch(`/api/announcements/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
      upsertAnnouncement(copy);
    }, 'Copied to Drafts');
    return ok ? copy : null;
  }, [withErrorHandling, upsertAnnouncement]);

  const restoreAnnouncement = useCallback(async (payload) => {
    return withErrorHandling('Undo', async () => {
      const item = await apiFetch('/api/announcements/restore', { method: 'POST', body: JSON.stringify(payload) });
      upsertAnnouncement(item);
      if (payload.refs?.length) fetchState({ silent: true });
    }, 'Restored');
  }, [withErrorHandling, upsertAnnouncement, fetchState]);

  /** Delete with an Undo toast (restores the same id and rotation spot). */
  const deleteAnnouncement = useCallback(async (id) => {
    let result;
    const ok = await withErrorHandling('Delete announcement', async () => {
      result = await apiFetch(`/api/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        announcements: (prev.announcements || []).filter(a => a.id !== id),
        slides: (prev.slides || []).filter(s => !(s.type === 'ANNOUNCEMENT' && s.announcementId === id)),
      }));
    });
    if (ok && result?.item) {
      const toastId = addToast('Deleted', 'success', {
        label: 'Undo',
        onClick: () => { dismissToast(toastId); restoreAnnouncement({ item: result.item, refs: result.refs || [] }); },
      });
    }
    return ok;
  }, [withErrorHandling, addToast, dismissToast, restoreAnnouncement]);

  const fetchShabbosEnd = useCallback(async () => {
    try { return await apiFetch('/api/announcements/shabbos-end'); } catch { return { available: false }; }
  }, []);

  // --- Schedule ---
  const fetchSchedule = useCallback(async () => {
    return withErrorHandling('Fetch schedule', async () => {
      const result = await apiFetch('/api/schedule');
      setState(prev => ({
        ...prev,
        scheduleEntries: result.entries || [],
        scheduleCategories: result.categories || [],
      }));
    });
  }, [withErrorHandling]);

  const updateScheduleEntries = useCallback(async (entries) => {
    const seq = ++seqRef.current.scheduleEntries;
    setState(prev => ({ ...prev, scheduleEntries: entries })); // optimistic
    const ok = await withErrorHandling('Update schedule', async () => {
      const result = await apiFetch('/api/schedule/entries', {
        method: 'PUT',
        body: JSON.stringify(entries),
      });
      if (result && seq === seqRef.current.scheduleEntries) {
        setState(prev => ({ ...prev, scheduleEntries: result }));
      }
    });
    if (!ok && seq === seqRef.current.scheduleEntries) fetchState({ silent: true }); // resync after failure
    return ok;
  }, [withErrorHandling, fetchState]);

  const createScheduleEntry = useCallback(async (entry) => {
    let created;
    const ok = await withErrorHandling('Create schedule entry', async () => {
      created = await apiFetch('/api/schedule/entries', {
        method: 'POST',
        body: JSON.stringify(entry),
      });
      setState(prev => ({ ...prev, scheduleEntries: [...(prev.scheduleEntries || []), created] }));
    }, 'Entry added');
    return ok ? created : null;
  }, [withErrorHandling]);

  const updateScheduleEntry = useCallback(async (id, data) => {
    return withErrorHandling('Update schedule entry', async () => {
      const result = await apiFetch(`/api/schedule/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setState(prev => ({
        ...prev,
        scheduleEntries: (prev.scheduleEntries || []).map(e => e.id === id ? (result || { ...e, ...data }) : e),
      }));
    }, 'Entry updated');
  }, [withErrorHandling]);

  const deleteScheduleEntry = useCallback(async (id) => {
    return withErrorHandling('Delete schedule entry', async () => {
      await apiFetch(`/api/schedule/entries/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        scheduleEntries: (prev.scheduleEntries || []).filter(e => e.id !== id),
      }));
    });
  }, [withErrorHandling]);

  const updateScheduleCategories = useCallback(async (categories) => {
    return withErrorHandling('Update categories', async () => {
      const result = await apiFetch('/api/schedule/categories', {
        method: 'PUT',
        body: JSON.stringify(categories),
      });
      setState(prev => ({ ...prev, scheduleCategories: result || categories }));
    }, 'Categories updated');
  }, [withErrorHandling]);

  const loadScheduleTemplate = useCallback(async (entries, categories) => {
    return withErrorHandling('Load template', async () => {
      const result = await apiFetch('/api/schedule/template', {
        method: 'POST',
        body: JSON.stringify({ entries, categories }),
      });
      setState(prev => ({
        ...prev,
        scheduleEntries: result.entries || entries,
        scheduleCategories: result.categories || categories,
      }));
    }, 'Template loaded');
  }, [withErrorHandling]);

  // --- Schedule Templates ---
  const fetchScheduleTemplates = useCallback(async () => {
    let templates;
    const ok = await withErrorHandling('Fetch templates', async () => {
      templates = await apiFetch('/api/schedule/templates');
      setState(prev => ({ ...prev, scheduleTemplates: templates || [] }));
    });
    return ok ? templates : null;
  }, [withErrorHandling]);

  const saveScheduleTemplate = useCallback(async (name, entries, categories) => {
    let created;
    const ok = await withErrorHandling('Save template', async () => {
      created = await apiFetch('/api/schedule/templates', {
        method: 'POST',
        body: JSON.stringify({ name, entries, categories }),
      });
      setState(prev => ({ ...prev, scheduleTemplates: [...(prev.scheduleTemplates || []), created] }));
    }, 'Template saved');
    return ok ? created : null;
  }, [withErrorHandling]);

  const updateScheduleTemplate = useCallback(async (id, data) => {
    let updated;
    const ok = await withErrorHandling('Update template', async () => {
      updated = await apiFetch(`/api/schedule/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setState(prev => ({
        ...prev,
        scheduleTemplates: (prev.scheduleTemplates || []).map(t => t.id === id ? (updated || { ...t, ...data }) : t),
      }));
    }, 'Template updated');
    return ok ? updated : null;
  }, [withErrorHandling]);

  const deleteScheduleTemplate = useCallback(async (id) => {
    return withErrorHandling('Delete template', async () => {
      await apiFetch(`/api/schedule/templates/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        scheduleTemplates: (prev.scheduleTemplates || []).filter(t => t.id !== id),
      }));
    });
  }, [withErrorHandling]);

  // --- Custom Days ---
  const createCustomDay = useCallback(async (day) => {
    let created;
    const ok = await withErrorHandling('Add custom day', async () => {
      created = await apiFetch('/api/custom-days', {
        method: 'POST',
        body: JSON.stringify(day),
      });
      setState(prev => ({ ...prev, customDays: [...(prev.customDays || []), created] }));
    }, 'Custom day added');
    return ok ? created : null;
  }, [withErrorHandling]);

  const updateCustomDay = useCallback(async (id, data) => {
    let updated;
    const ok = await withErrorHandling('Save custom day', async () => {
      updated = await apiFetch(`/api/custom-days/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setState(prev => ({
        ...prev,
        customDays: (prev.customDays || []).map(d => d.id === id ? updated : d),
      }));
    }, 'Custom day saved');
    return ok ? updated : null;
  }, [withErrorHandling]);

  const deleteCustomDay = useCallback(async (id) => {
    return withErrorHandling('Delete custom day', async () => {
      await apiFetch(`/api/custom-days/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        customDays: (prev.customDays || []).filter(d => d.id !== id),
      }));
    }, 'Custom day removed');
  }, [withErrorHandling]);

  // --- Refresh & Screen Commands ---
  const refresh = useCallback(async () => {
    return withErrorHandling('Refresh data', async () => {
      await apiFetch('/api/refresh', { method: 'POST' });
      await fetchState({ silent: true }); // keep the panel (and unsaved edits) mounted
    }, 'Data refreshed');
  }, [withErrorHandling, fetchState]);

  const screenCommand = useCallback(async (command) => {
    return withErrorHandling(`Screen ${command}`, async () => {
      await apiFetch(`/api/screen/${command}`, { method: 'POST' });
    });
  }, [withErrorHandling]);

  return {
    state,
    loading,
    error,
    toasts,
    dismissToast,
    retry: () => fetchState(), // never forward the click event as `opts`
    updateSettings,
    updateSlides,
    createSlide,
    deleteSlide,
    createAnnouncement,
    updateAnnouncement,
    reactivateAnnouncement,
    duplicateAnnouncement,
    deleteAnnouncement,
    fetchShabbosEnd,
    createCustomDay,
    updateCustomDay,
    deleteCustomDay,
    fetchSchedule,
    updateScheduleEntries,
    createScheduleEntry,
    updateScheduleEntry,
    deleteScheduleEntry,
    updateScheduleCategories,
    loadScheduleTemplate,
    fetchScheduleTemplates,
    saveScheduleTemplate,
    updateScheduleTemplate,
    deleteScheduleTemplate,
    refresh,
    screenCommand,
  };
}
