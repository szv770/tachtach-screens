# TachTach-Screens — Final security re-audit (2026-10-19)

**STATUS: PARTIAL — work in progress, pushed early in case the container restarts.**

Report-only white-hat re-audit of the owner's own app after the Phase 2–6 redesign.
Dynamic tests ran against a throwaway copy of the repo (scratch dir, fresh `vite build`)
started inside an isolated network namespace (`unshare -rn`, loopback only — every
external fetch failed with `EAI_AGAIN`), with production-like env (`HOST=0.0.0.0`,
`TRUST_PROXY=1`) and four throwaway logins made through the users-store module
(admin, Full editor, Messages only, View only). A second loopback address
(`127.0.0.2`) stands in for "a device on the school LAN". The real `data/` was never
touched; `setup.js` was never run.

## Early results

- H1 (rss-cache traversal): VERIFIED-FIXED — 12 encodings incl. `%2F`, `%252F`, `%5C`, `\`, `%00`, overlong UTF-8 all 400.
- H2 (localhost gating): VERIFIED-FIXED — from a non-loopback peer, XFF / Forwarded / X-Real-IP / CF-Connecting-IP / Host: localhost / HTTP/1.0 without Host all 404; from loopback any proxy header also 404.
- Capability matrix (91 route×method × view/messages/full/anon): no write reachable by a preset that lacks the capability.
- NEW: Messages-only person can delete anyone's fresh post by renaming themselves (own-post rule compares display names).
- NEW: rate limits and login/2-step lockouts are keyed on `req.ip`, which a LAN device sets freely through `X-Forwarded-For` (TRUST_PROXY=1).
- NEW: CSP is not sent on `/src/admin/index.html`, `/src/screen/index.html` and `/error` (same SPAs, served by `express.static`).
- `npm audit` (prod and full tree): 0 vulnerabilities.

## Fix status (pass 3)

All fixes on branch `claude/wizardly-ride-bnbtzj`, one commit each, each with regression tests (`node --test`, 441/441 green excluding the browser-dependent google-photos suite; `vite build` ok).

| Finding | Fixed in | Tests |
|---|---|---|
| N1 own-post undo compared display names | `5f8d8af` — `createdById` stamped server-side on create/duplicate/restore, immutable on update (`src/server/ownPost.js`); undo needs id match + <30 min + a kind the poster can create (takeover also needs `announcements.takeover`); items without `createdById` are not undoable by non-delete holders; undo-record attribution picks the item stamped with the acting user's id (concurrent posts) | `test/ownPost.test.js` (rename-self attack, two same-name users, old items, admin posts, takeover cap, view-only, concurrent attribution) |
| N2 `trust proxy 1` let LAN set `req.ip` | `213a4f6` — `trust proxy` = `'loopback'`; `src/server/clientIp.js` normalises keys (IPv4-mapped, IPv6 /64, username clamped); lockout table capped at 2000 (active locks kept); limiters use the same key | `test/clientIp.test.js` (forged XFF from LAN ignored, loopback peer + XFF = real client, in-process server, key derivation, cap) |
| N3 SSRF outside embed probe | `2658a35` — `src/server/safeFetch.js` (own DNS resolve, private/loopback/link-local/CGNAT/multicast/NAT64/mapped refused, connects to the vetted IP, per-hop revalidation, hop/time/size caps incl. decoded size); used by embed probe, RSS preview/add/refresh, Google album page and photo download; `src/server/urlRules.js` strict parsed-host rules for Google album URLs, feed URLs, web-push endpoints (known push-service host suffixes, https, no port/creds; also checked again at send time); `NODE_ENV=test` bypass of the album check removed | `test/safeFetch.test.js` (fake DNS, rebinding, redirect-to-metadata, size bomb, URL/endpoint tables), `test/embedProbe.test.js` |
| N4 pending 2-step secret reused | `cf78a49` — fresh secret per attempt, held on the pre-auth record (or the signed-in person's pending slot), 10 min, replaced by a new attempt, spent on success, never reused from an older `totpSecret`; enrolment push alert + log kept | `test/users.test.js` (4 new N4 tests: reuse refused, expiry, success, replay) |
| Low: CSP missing on dev SPA paths / `/error` / 404 | `7e0d86d` — path kinds extended; any other HTML response gets a locked `default-src 'none'` CSP | `test/csp.test.js` |
| Low: logo upload ignored extension list | `5866761` — type sniffed from bytes, stored extension is the sniffed one, declared type must match, SVG only when free of active content | `test/logoType.test.js` |
| Low: secret-file permissions | `c963fc9` — `src/server/dataPerms.js`: `data/` 0700, `users/auth/push/undo.json` and `data/tls` keys 0600 (born 0600 in `writeJSON`, tightened at start-up for files the process owns, `deploy/install-services.sh` does the same) | `test/dataPerms.test.js` |
| Low: Host header for kiosk-only endpoints | `b8593e6` — `isLocalRequest()` also needs `Host` = 127.0.0.1 / localhost / [::1] (+port) | `test/localOnly.test.js` |
| Low: Kiddush Levana wrote settings outside the lock | `f91e8c8` — routes use `updateSettingsLocked` (same lock + `saveSettings` as PATCH `/api/settings`) | `test/kiddushLevana.test.js` (structural) |

Notes and residual items:
- RSS feeds on a private LAN address (e.g. a NAS) are now refused by design.
- Web-push registration stays open to every signed-in role (each person manages their own phone); the endpoint allow-list is what stops arbitrary URLs. Views-only people still receive operational alerts if they opt in.
- Smoke test on a throwaway copy: login page, `/api/state` as a throwaway editor, RSS preview of a loopback fixture (now correctly refused, 502 "that address is not allowed"), image upload through sharp, logo upload (HTML-named PNG stored as `.png`, HTML-in-PNG refused), admin 2-step enrolment with two attempts (old secret/pre-auth rejected, replay rejected), Kiddush settings save, `data/` 0700 and `users.json`/`push.json` 0600.
- The audit's two-address (LAN) tests used 127.0.0.2; Express' `'loopback'` still trusts all of 127.0.0.0/8 and `::1`, which real LAN traffic cannot arrive from.
- Not done: dependency updates beyond pass 2 (none open); `npm audit` was not re-run in this pass.
