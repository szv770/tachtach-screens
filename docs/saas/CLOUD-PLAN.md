# TachTach as a service — thinking document (2026-10-25)

Status: **ideas only, nothing built.** Goal: other schools/orgs can run TachTach, you see them all in one dashboard, the admin works even when a Pi is down, and an org can later "graduate" to its own domain and its own hosting.

## 1. The shape: cloud brain, thin Pi player

| | Today | Target |
|---|---|---|
| Brain (data, admin, rules, schedulers, fetchers) | Pi | **Cloud** (one deployment, many orgs) |
| Player (what the TV shows) | Pi serves `/screen` | Pi (or any browser/stick) runs a **player**: loads the kiosk SPA, subscribes to its org's state, **caches the last good state on disk** |
| Admin | `/admin` on the Pi via tunnel | `app.tachtach.…/<org>` on the cloud — works when the Pi is off |

Why: the admin never depends on a box in a closet; one place to fix bugs for everyone; the Pi becomes a replaceable appliance (swap SD card, re-pair, done).

The kiosk SPA, admin SPA, `src/shared/*` rules (announcements, chazan, roster, schedule) already run in the browser from a single state object, so they move almost unchanged. What changes is **where state lives and how it is pushed**.

## 2. Multi-tenant data
- Every record gets `org_id`. Every store function in `src/server/storage.js` (and the `*Store.js` modules: users, chazan, roster, live, activity…) takes an org context. Rule: **no module may read a file/table without an org id** — this is the single most important security property (fail closed).
- Storage: Postgres (Supabase or Neon; `saas-server` already uses Drizzle + tenants/devices/superAdmins/audit tables — reuse that schema and auth rather than inventing a second one). Documents stay JSON (`jsonb` per org per file-name: `settings`, `slides`, `schedule`, `roster`, `chazan`…) at first — the lowest-effort swap for today's `data/*.json`. Normalise later only where querying demands it.
- Blobs (uploads, fonts, photos, converted PDFs): object storage (Supabase Storage / Vercel Blob / R2), keyed `org_id/…`. PDF→image conversion (needs poppler) runs in a small worker, not in the serverless function.
- Per-org secrets (Google Photos, Mivtzah tokens) encrypted at rest.

## 3. Realtime without a Pi
Vercel functions can't hold SSE for hours. Options, simplest first:
1. **Short polling with ETag** (every 10–15 s, `If-None-Match` → 304). Boring, robust, and the Pi already needs it for offline resilience. Fine for signage.
2. Hosted realtime (Supabase Realtime / Ably) for instant "Pause" / urgent banners; polling stays as the safety net.
3. A small always-on Node service (Fly/Render/Railway) holding SSE if we want to keep the current code path.
Recommend 1 now, 2 when "instant" matters.

## 4. The thin player on the Pi
- Pairing: Pi shows a 6-digit code → admin enters it under Screens → device gets a long-lived device token (this exists in `saas-server` `devices`). No passwords on the Pi, revocable from the dashboard.
- Player = Chromium kiosk pointing at `https://…/play`, plus a tiny local agent that **caches the last state + assets to disk** and serves them if the internet drops (service worker is enough for most of it). Kiosk keeps running through outages.
- Local-only jobs stay local: screen on/off (CEC), reboot, health ping, "update me". Everything else is cloud.
- Heartbeat every minute → dashboard shows online/offline, last seen, version, current slide.

## 5. Data that shouldn't be fetched per screen
Zmanim/calendar/learning/Hayom Yom move to the **cloud once** (compute locally + bundled text pack, see `docs/DATA-PACK-PLAN.md` if the agent finished it). One fetch serves every org, per location (lat/long cache). This also removes the Chabad.org scraping risk from the Pi and shrinks per-org cost to near zero.

## 6. Your dashboard (you = platform owner)
New "platform" area, separate from any org's admin, protected with 2-step:
- Orgs list: name, plan, status, screens online/total, last activity, version, created.
- Per org: impersonate-view (read-only by default, logged), suspend/reactivate, reset owner login, export all data (JSON zip), delete.
- Screen fleet: every device, pairing, remote restart/update.
- Usage + health: errors, uptime, storage, SSE/poll volume.
- Feature flags per org (turn on Mivtzah, live view, PDF slides).
- Audit log of every platform action.
Already half there: `saas-server` has `superAdmins` and `auditLog`.

## 7. "Everyone is under TachTach, then graduates"
Stages for an org, no re-platforming between them:
1. **Hosted**: `app.tachtach.org/<slug>` (or `slug.tachtach.org`), your Pi-less/Pi-light player, you pay for hosting. Branding via org settings (name, logo, colours — the theme/font roles already allow this).
2. **Custom domain**: org adds `screens.theirschool.org` (CNAME), we issue TLS (Vercel domains API). Same cloud, their name on it.
3. **Self-hosted**: we ship the same app as a container / the current Pi build with a "cloud sync off" mode; their data exported/imported with one button; they keep receiving updates from a release channel (the existing update flow). Optional paid support.
Rule that keeps this possible: **one codebase, one data format**; the Pi build and the cloud build differ only in the storage module and auth provider. Never write code that assumes a single site/school name.

## 8. Accounts & roles
Platform owner (you) > org owner > admin > editor (existing presets) > viewer. Invite by link (exists), 2-step (exists), per-org user table. Org owner can export/close their account. SSO is a later paid add-on.

## 9. Money & ops (decide later, but design for it)
Plans by screens count; trial; Stripe later. Backups: nightly per-org JSON export (also what self-host import uses). Observability: per-org error rate; alert you when a screen goes offline > N minutes (this fixes the "no push when the Pi is down" gap).

## 10. Security must-dos before the first outside org
- Tenant isolation tests: a test that logs in as org A and fails to read/write anything of org B on every route (automated, in CI).
- Per-org rate limits, upload size/type limits, SSRF guard on every URL a tenant can enter (exists: `safeFetch.js`).
- The public live view becomes per-org word + per-org cookie.
- No shared secrets between orgs; device tokens scoped to one org.
- Privacy: roster has student names — decide data-processing terms, retention, and a delete-on-request path before onboarding anyone.

## 11. Suggested path (each step ships on its own)
0. (now) Finish the data pack so the player needs no daily pulls. Remove remaining hard-coded school names ("mlmi" etc.) into org settings.
1. Introduce an `org` context + storage interface in the current Pi app (still single org, files). Pure refactor, tests guard it.
2. Postgres storage module behind the same interface; run it for **your** org in the cloud, Pi becomes a player with an on-disk cache. Prove "admin works with the Pi unplugged".
3. Device pairing + heartbeat + polling/ETag.
4. Platform dashboard + org creation + invite owner.
5. Onboard 1–2 friendly orgs (hosted). Fix what hurts.
6. Custom domains, self-host export, billing.

## 12. Open questions for the owner
- Name/domain for the platform (the brand "TachTach" vs per-org branding)?
- Free for friends first, or paid from day one?
- Is student-name data (birthdays/chazan) allowed to leave the school's own box for other orgs? If not, keep roster/chazan **local-only** with an opt-in cloud mode.
- How many orgs in year one (5? 50?) — decides Vercel+Supabase (easy) vs own servers.
