import { useState, useEffect, useCallback, useRef } from 'react';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Parse a server error response into a human-readable message.
 */
function parseErrorMessage(err) {
  // Try to extract a JSON error message from the response body
  const raw = err.message || 'Unknown error';
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON — use as-is
  }
  // Clean up common HTTP error patterns
  if (raw.includes('401')) return 'Session expired. Please log in again.';
  if (raw.includes('403')) return 'Permission denied. Please refresh the page.';
  if (raw.includes('413')) return 'File too large. Maximum size is 50 MB.';
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError'))
    return 'Cannot reach the server. Check your connection.';
  return raw;
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  let res;
  try {
    res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Check your connection.');
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
    throw new Error(errorMsg || `${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Toast notification — { id, message, type: 'error'|'success', timestamp }
 */
let toastIdCounter = 0;

export default function useAdminState() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef({});

  // Add a toast notification that auto-dismisses after 6 seconds
  const addToast = useCallback((message, type = 'error') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type, timestamp: Date.now() }]);
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
    return () => {
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
    try {
      await fn();
      if (successMsg) addToast(successMsg, 'success');
      return true;
    } catch (err) {
      const msg = parseErrorMessage(err);
      addToast(`${actionName}: ${msg}`, 'error');
      console.error(`[Admin] ${actionName} failed:`, err);
      return false;
    }
  }, [addToast]);

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/state');
      // Map nested schedule data to flat keys for component consumption
      setState({
        ...data,
        scheduleEntries: data.schedule?.entries || [],
        scheduleCategories: data.schedule?.categories || [],
      });
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  // --- Settings ---
  const updateSettings = useCallback(async (settings) => {
    return withErrorHandling('Save settings', async () => {
      const result = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setState(prev => ({ ...prev, settings: result || settings }));
    }, 'Settings saved');
  }, [withErrorHandling]);

  // --- Slides ---
  const updateSlides = useCallback(async (slides) => {
    return withErrorHandling('Update slides', async () => {
      const result = await apiFetch('/api/slides', {
        method: 'PUT',
        body: JSON.stringify(slides),
      });
      setState(prev => ({ ...prev, slides: result || slides }));
    });
  }, [withErrorHandling]);

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
      setState(prev => ({
        ...prev,
        slides: (prev.slides || []).filter(s => s.id !== id),
      }));
    });
  }, [withErrorHandling]);

  // --- Messages ---
  const createMessage = useCallback(async (message) => {
    let created;
    const ok = await withErrorHandling('Send message', async () => {
      created = await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify(message),
      });
      setState(prev => ({ ...prev, messages: [...(prev.messages || []), created] }));
    }, 'Message sent');
    return ok ? created : null;
  }, [withErrorHandling]);

  const deleteMessage = useCallback(async (id) => {
    return withErrorHandling('Delete message', async () => {
      await apiFetch(`/api/messages/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        messages: (prev.messages || []).filter(m => m.id !== id),
      }));
    });
  }, [withErrorHandling]);

  // --- Pinned ---
  const createPinned = useCallback(async (pinned) => {
    let created;
    const ok = await withErrorHandling('Add pinned note', async () => {
      created = await apiFetch('/api/pinned', {
        method: 'POST',
        body: JSON.stringify(pinned),
      });
      setState(prev => ({ ...prev, pinned: [...(prev.pinned || []), created] }));
    }, 'Pinned note added');
    return ok ? created : null;
  }, [withErrorHandling]);

  const updatePinned = useCallback(async (id, data) => {
    return withErrorHandling('Update pinned note', async () => {
      const result = await apiFetch(`/api/pinned/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setState(prev => ({
        ...prev,
        pinned: (prev.pinned || []).map(p => p.id === id ? (result || { ...p, ...data }) : p),
      }));
    });
  }, [withErrorHandling]);

  const deletePinned = useCallback(async (id) => {
    return withErrorHandling('Delete pinned note', async () => {
      await apiFetch(`/api/pinned/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        pinned: (prev.pinned || []).filter(p => p.id !== id),
      }));
    });
  }, [withErrorHandling]);

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
    return withErrorHandling('Update schedule', async () => {
      const result = await apiFetch('/api/schedule/entries', {
        method: 'PUT',
        body: JSON.stringify(entries),
      });
      setState(prev => ({ ...prev, scheduleEntries: result || entries }));
    });
  }, [withErrorHandling]);

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

  const deleteCustomDay = useCallback(async (id) => {
    return withErrorHandling('Delete custom day', async () => {
      await apiFetch(`/api/custom-days/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        customDays: (prev.customDays || []).filter(d => d.id !== id),
      }));
    });
  }, [withErrorHandling]);

  // --- Refresh & Screen Commands ---
  const refresh = useCallback(async () => {
    return withErrorHandling('Refresh data', async () => {
      await apiFetch('/api/refresh', { method: 'POST' });
      await fetchState();
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
    retry: fetchState,
    updateSettings,
    updateSlides,
    createSlide,
    deleteSlide,
    createMessage,
    deleteMessage,
    createPinned,
    updatePinned,
    deletePinned,
    createCustomDay,
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
