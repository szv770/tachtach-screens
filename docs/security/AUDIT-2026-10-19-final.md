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

## Software update feature review (admin "Update now" button, 2026-10-19)

Owner-approved feature that makes the Pi run `deploy/update.sh` from `/admin/health`. It is remote code execution by design, so the web server is kept out of the execution path: it only drops one small request file; a root-owned systemd path unit + wrapper validate it and run the update as the app's user. Design and file list: ARCHITECTURE.md "Software update from the website". Reviewed adversarially after implementation; **nothing was tested on a real Pi or real systemd** (dry runs of the wrapper, unit-text tests and route tests on throwaway copies only).

| Question | Answer |
|---|---|
| Can a non-admin trigger it? | No. `system.update` is `adminOnly` (not in any preset, `sanitizeOverrides` drops it, `effectiveCaps` ignores a stored grant); `canDo` sends every method on `/api/system/*` through it (reads too); the router re-checks `role === 'admin'`. Live check on a throwaway server: anon GET/POST 401, editor GET 403, editor POST with a valid CSRF token + the right password 403, admin POST without CSRF 403. `test/systemUpdatePerms.test.js` (12 paths x 9 identities) and `test/systemUpdateRoute.test.js`. |
| Does a stolen session suffice? | No: the POST needs the admin's password and a fresh 2-step code again (a used code is refused), with per-person lockout counters (6 tries / 15 min, shared with change-password), global mutation limiter, 1 request / 5 min, none while one is running. |
| Injection from the request file into a shell? | No. The request is parsed by Node (`update-helper.mjs`), only `action` (allow-list `update`/`rollback`), a 32-hex nonce and an ISO time are used; the person's name is cut to printable text and only ever written into JSON. The wrapper receives ONE word on stdout and re-checks it with `case`. Extra fields are ignored. No `eval`, every expansion quoted, no user data on any command line (test: `shell scripts parse, are strict, and avoid eval`). |
| Symlink / TOCTOU on the request or status file? | The request is opened with `O_NOFOLLOW` and checked on the SAME descriptor (regular file, owner = app user, no group/other mode bits, < 4 KB). Status/nonce/job files are written through a random `wx` temp name (O_EXCL, never follows a link) + `rename` (replaces a planted symlink instead of following it) and `fchown` on the open descriptor. `rm -f` unlinks, never follows. Residual: root writes `update-status.json` into `data/` after an `lstat` check; a user who can swap `data/` itself for a symlink in that instant (that is the app's own Unix user, never the sandboxed web process, whose parent directory is read-only to it) could redirect that one fixed-name file. |
| Replay? | Nonce list in root-only `/var/lib/tachtach-update/nonces.json` (last 100) + request must be < 10 min old and not from the future + the file is deleted whether accepted or refused + the Pi drops any run that starts < 120 s after the previous one. |
| Can the web side choose WHAT gets pulled? | No. There is no branch, URL or argument field. `git pull --ff-only` follows the repo's own configured upstream (`.git/config`, read-only to the web unit). Rollback goes only to a hash recorded by the wrapper itself in root-owned `/var/lib/tachtach-update/previous-commit` (40-hex, `cat-file -e` checked); the web-writable status file's `previousCommit` is display-only and validated before it reaches a git argument. |
| Does the web server get root or sudo? | No. `tachtach-server.service` is unchanged (`NoNewPrivileges`, `ProtectHome=read-only`, `ReadWritePaths=data` only; test asserts it). The update-availability check is a fetch into `data/update-cache.git` (borrowing objects read-only from `.git`), never into the real checkout. No sudoers rules are added. |
| Does root run anything the app user can edit? | The path unit starts a root-owned copy of `run-update.sh` + `update-helper.mjs` in `/usr/local/lib/tachtach-update/` (swapped in atomically; config in `/etc/tachtach-update.env`). git/npm run via `runuser` as the app user. **Orchestrator review (2026-10-19): changed.** The first version ran the freshly pulled `deploy/install-services.sh` as root, and that script (plus the unit templates it reads) sits in the project folder the web server's Unix user can write — so a compromised web process could forge a request (it owns the request file) and get root. FIXED: the web-triggered run now does ONLY `systemctl restart` + a health check as root; it never runs `install-services.sh` or reads unit templates. Units are refreshed only when a person runs `deploy/update.sh` by hand (sudo), and the log tells them when a new version changed deploy/*.service etc. Residual: whoever can push to the branch the Pi follows controls what `update.sh` pulls (git/npm run as the app user, not root) — keep the git account protected (2-step, no shared tokens); a compromised web process can still forge a request for the fixed actions (at most once per 120 s, no say over which commit), which can only restart/update to the origin's own code. |
| A bad update leaving the screen dead? | After a failed pull/deps/build, or a server that does not stay active twice 5 s apart, the wrapper runs `update.sh` in rollback mode to the commit recorded first (reset + `npm ci` + build + restart) and reports "put back". If that fails too it says so and tells the owner to run `deploy/update.sh` by hand. A failed pull with no change reports and does nothing else. `update.sh` now runs from a private copy so a pull that rewrites it cannot corrupt the running script. |
| Secrets in the status log? | Last 40 lines only, ANSI/control characters removed, lines capped, URL credentials / `ghp_`/`github_pat_`/`glpat-`/npm tokens / `Bearer` / `password=`-style values masked (`test/updateHelper.test.js`). The root-only full run log stays in `/var/lib/tachtach-update/last-run.log`. |
| Commit subjects (XSS)? | Shown only as React text; the server also strips control and bidi-override characters and caps 140 chars. A subject `<b>bold</b>` rendered literally in the browser test. |

Open / accepted: the first update must be run by hand (installs the units); `git fetch` from the web process needs the Pi's git access to work non-interactively (a private repo without a deploy key shows "could not check", and the update itself would fail the same way); `npm ci` while offline can leave `node_modules` broken (rollback mode retries it once online; the report then says to run `update.sh` by hand); the status log is shown to every admin.
