/**
 * "Recent connection attempts": a small in-memory ring of what AI apps did against the sign-in endpoints, so a failed
 * connection can be read in one glance in Connect an AI. No secrets, no tokens, no addresses of people; a restart forgives.
 * One log per app instance (created in app.js, no module state: FIT-RULES).
 *
 * steps: registered | turned_away | sign_in | allowed | denied | token | refreshed | refused
 */
export const MAX_ATTEMPTS = 20;

export function createAttemptLog({ now = () => Date.now() } = {}) {
  const list = [];
  return {
    record({ step, app = '', ok = true, reason = '' }) {
      list.unshift({ at: new Date(now()).toISOString(), step, app: String(app).slice(0, 60), ok: !!ok, reason: String(reason).slice(0, 200) });
      if (list.length > MAX_ATTEMPTS) list.length = MAX_ATTEMPTS;
    },
    recent() { return list.map((e) => ({ ...e })); },
  };
}
