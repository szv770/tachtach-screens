// The admin's only door to the "what is going on" endpoints (screen status, health, history, undo, fixes).
// Pages never build these URLs themselves, so a second screen/site can be pointed at later in one place.
import { apiFetch } from '../hooks/useAdminState.js';

const post = (path) => apiFetch(path, { method: 'POST', body: '{}' });

export const opsApi = {
  screenStatus: () => apiFetch('/api/screen/status'),
  /** `clientNow` lets the server compare its clock with this device's. */
  health: () => apiFetch(`/api/health?clientNow=${Date.now()}`),
  /** Software update (admin only): what is installed + what is waiting; `refresh` asks the code host again. */
  updateInfo: (refresh = false) => apiFetch(`/api/system/update${refresh ? '?refresh=1' : ''}`),
  /** This server's identity (admin only): platform, name, version, LAN addresses. */
  systemInfo: () => apiFetch('/api/system/info'),
  /** Light and fast (no git): used while an update runs and by the shell banner. */
  updateStatus: () => apiFetch('/api/system/update/status'),
  /** action is exactly 'update' or 'rollback'; the server re-checks the password (+ 2-step code). */
  requestUpdate: ({ action, password, code }) => apiFetch('/api/system/update', { method: 'POST', body: JSON.stringify({ action, password, code }) }),
  history: (limit = 100) => apiFetch(`/api/history?limit=${limit}`),
  undo: (id) => post(`/api/history/${encodeURIComponent(id)}/undo`),
  /**
   * Run a health "Fix": each action is an endpoint that already exists and is gated there
   * (refresh-data: screen.control, sync-*: feeds.edit, cleanup: settings.change, push-test: anyone).
   */
  runFix: (fix) => {
    switch (fix.action) {
      case 'refresh-data': return post('/api/refresh');
      case 'sync-album': return post(`/api/google-album/${encodeURIComponent(fix.id)}/sync`);
      case 'sync-feed': return post(`/api/rss/feeds/${encodeURIComponent(fix.id)}/sync`);
      case 'cleanup': return post('/api/cleanup');
      case 'push-test': return post('/api/push/test');
      default: return Promise.reject(new Error('Unknown fix.'));
    }
  },
};
