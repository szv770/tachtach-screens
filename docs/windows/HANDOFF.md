# Windows PC support: hand-off brief for a fresh session

You are picking this up with NO prior context. Read this file first, then `CLAUDE.md`, `docs/claude/STATE.md`,
`docs/claude/GOTCHAS.md`, `docs/windows/{AUDIT,RISKS,SETUP,TEST-CHECKLIST}.md`.

## What the product is
TachTach Screens: digital signage for a Jewish school. One Node/Express process serves a kiosk page (`/screen`, shown full-screen
on a TV) and an admin page (`/admin`, used from phones). No database: JSON files in `data/`. It was built for a Raspberry Pi;
the owner (a non-developer) wants it to run just as well on an ordinary **Windows 10/11 PC sitting behind the TV**, and later on a
cloud server (`docs/saas/CLOUD-PLAN.md`; after that a Windows PC only needs a browser, no server).

## State today (2026-10-27)
Everything below is WRITTEN and unit/lint-tested on Linux, but has NEVER run on Windows (no Windows or PowerShell was available):
- `src/server/platform.js`: every Linux/Windows difference in the Node code (file rename retries, git env + `safe.directory`,
  poppler/openssl/clock/Edge paths, update state dir). Linux behaviour is unchanged (`test/platform.test.js`).
- `deploy/update-helper.mjs` has a win32 mode (`test/windowsUpdate.test.js`).
- `deploy/windows/*.ps1`: `install.ps1` (idempotent), `server-run.ps1` (server task as LOCAL SERVICE), `kiosk.ps1` (Edge kiosk +
  watchdog), `update-runner.ps1` (SYSTEM) + `update-worker.ps1` (NETWORK SERVICE), `update.ps1`, `uninstall.ps1`,
  `health-check.ps1` (zip report), `common.ps1`. Static lint only: `test/windowsKit.test.js` (ASCII, balanced brackets,
  PowerShell 5.1 syntax, helpers defined, update security rules present).
- Docs: `AUDIT.md` (every Linux-ism, ranked), `RISKS.md` (22 risks, top 5 below), `SETUP.md` (owner steps), `TEST-CHECKLIST.md`.

## Your job, in order
1. **Get it running on a real Windows PC** (the owner has one; if you have no Windows access, work with the owner: have them run
   `TEST-CHECKLIST.md` section A and paste the output / `health-check.ps1` zip). Do NOT claim anything works that you did not see work.
2. **Fix whatever fails**, smallest change first, re-run. Expected trouble (RISKS R1-R5): (R1) the server scheduled task not
   starting as LOCAL SERVICE (Node path, principal, execution policy); (R2) the website "Update" button path: request-file owner SID,
   SYSTEM task, NETWORK SERVICE worker, restart; (R3) auto sign-in/kiosk not coming up after reboot (Windows 11 passwordless
   setting, Edge first-run page); (R4) Windows Update restarts, notifications, sleep, OneDrive/Teams windows covering the TV;
   (R5) Windows time zone vs the screen's Location setting.
3. **Work through TEST-CHECKLIST sections A..F** (install, kiosk, reboot, power cut, update button incl. rollback, uninstall).
   Record real results (what you saw) in `docs/windows/TEST-LOG.md`, one dated row per step: PASS / FAIL + evidence.
4. **Remove "untested" labels only where a step passed**; update RISKS.md likelihoods from real observations.
5. Then polish: ARM/Snapdragon PCs (native modules `sharp`, `bcrypt`), `winget` missing, offline installs, installer download
   integrity, a signed/pinned NSSM or built-in-only service, log rotation, remaining admin wording that says "the Pi".

## Hard rules (do not break these)
- **Pi/Linux behaviour must stay byte-for-byte unchanged.** Any change to Node code goes behind `platform.js` helpers and gets a test
  that runs on Linux with an injected `platform: 'win32'`. Never run `setup.js` (it wipes `data/`); never touch a real `data/`.
  Tests use `TACHTACH_DATA_DIR=<scratch dir>`.
- **Security model of the update path** (keep it): the website may only drop a request file; a SYSTEM task validates it and runs
  only admin-owned copies of the scripts; git/npm run as NETWORK SERVICE, never SYSTEM; the server runs as LOCAL SERVICE
  (no admin). SYSTEM must never execute files from the writable project folder. The Linux twin is `deploy/run-update.sh`:
  its root part only restarts services. Any change here needs a threat-model note in `docs/windows/RISKS.md`.
- **Fail closed**: `/admin` + `/api/*` need login, `/screen` + `/stream` are localhost-only (see CLAUDE.md "Non-negotiable rules").
  Do not open ports or relax the gates to make Windows easier. The Windows firewall rule is scoped to the private LAN.
- **SaaS fit**: read `docs/saas/FIT-RULES.md` before adding any setting/route/data file (scope, privacy class, no hard-coded
  names). Windows-only knobs are "box" scope.
- PowerShell: stick to **Windows PowerShell 5.1 syntax** (it is what ships), ASCII-only files, no `&&`/`||`/ternary/`??`,
  idempotent scripts that log to `C:\ProgramData\TachTach\logs`, always restart what they stop (try/finally).
- Run before every commit: `node --test $(ls test/*.test.js | grep -v google-photos)` and `npx vite build`; `npm audit --omit=dev`.

## How we ship
Work on a branch, commit small and often. The owner fast-forwards `main` only after tests + build + audit pass and tells the Pi
to update. Never push a failing test to `main`. Report to the owner in plain English (they are not a developer): what you saw,
what you changed, what is still unproven.

## Definition of done
A fresh Windows 10/11 PC goes from "nothing installed" to a TV showing the screen, using only `SETUP.md`; it survives a reboot and
a power cut with no one touching it; the admin works from a phone on the LAN; the website Update button updates it and rolls back
on failure; uninstall leaves no leftovers; `TEST-LOG.md` shows PASS for every checklist step.

## Later (do not build now, but do not block)
After the cloud exists the Windows PC becomes a thin player: Edge kiosk pointed at the org's cloud address with a per-screen
device token, plus an on-disk cache for offline (`docs/saas/CLOUD-PLAN.md` section 12.7, `docs/saas/SCREENS-GROUPS.md`).
One box = one screen.
