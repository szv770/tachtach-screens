# STATE — where we are (read this first after a context reset)

Last updated 2026-10-26. Owner = the school's tech lead (non-developer; wants plain-English answers, multi-choice questions over typing, English-first UI with Hebrew as a nice extra, premium look, mobile-first admin, SaaS-ready thinking: another yeshiva should be able to get its own screen setup without a huge job).

## What exists now (all shipped to `main`)
The 2026-10 **admin redesign** is complete: Direction A "Seal" look (`docs/design/2026-10-18-admin-upgrade/` = SPEC.md owner decisions, DESIGN-NOTES.md tokens, mockups), 5-area shell (Home / Screen / Schedule / Announce / Look & Settings; mobile tab bar + ＋ FAB, desktop sidebar), global search, ui kit (`src/admin/components/ui/`), capability-based roles (Full editor / Messages only / View only + per-person tweaks), Slides (2-step New slide, pencil popups, PDF slides), Media (Library/Photos/Web/Feeds + measured screen size), Schedule (wizard, week view, groups Aleph/Bais/Gimmel, categories kinds, stages), Announce (quick-message templates, banner still/scrolling, letters/saved letters, automatic Kiddush Levana), Home dashboard, History/Undo, Change tomorrow, Health + software update from the website, Freeze/Blank screen, Live Preview that follows the TV, 3 schedule views on the kiosk (Whole day / Timeline / Focus / Auto), AutoScroll long text, 3 security audits + fixes. Details per feature: CLAUDE.md changelog (newest 8) and `docs/claude/CHANGELOG.md` (older), `FEATURES.md`, `ARCHITECTURE.md`, `ADMIN_FEATURE_MAP.md`.

## How we ship (important — this bit us once)
- Work happens on a feature branch (this session: `claude/wizardly-ride-bnbtzj`); **the Pi pulls `main`**. Nothing reaches the owner until `main` moves. Standing permission from the owner (2026-10-19): after tests + build pass, **fast-forward `main`** (`git push origin HEAD:main`, only when `origin/main` is an ancestor of HEAD) and tell the owner what went out. Never force-push. Don't open PRs unless asked.
- Gate before moving main: `node --test $(ls test/*.test.js | grep -v google-photos)` (google-photos test hangs offline) + `npx vite build` + `npm audit --omit=dev` = 0.
- Owner updates the Pi with `deploy/update.sh` (or Health > Software update once the one-time manual first update installed the units). Nothing in `deploy/*.service` changes via the web button — only a manual `update.sh` (see GOTCHAS/AUDIT).
- Agents: sonnet for coding, opus only for hard visual design / security audit, max 1–2 at a time, tell them to commit+push early (container restarts and rate limits lost work twice), explicit `git add <paths>`, test only on a **throwaway copy** of data (never the real `data/`, never `setup.js`). The orchestrator commits stop-hook snapshots of in-progress work.

## Verified vs NOT verified on the real Pi
Everything was tested on throwaway copies in a sandbox (unit tests ~540, Playwright DOM checks). **Never run on the real Pi/TV by us**: the software-update systemd units, poppler PDF slides, ARM builds of sharp/bcrypt after the dependency bumps, the new CSP against every real slide (Charidy web page, Mivtzah embed), Google Photos long albums, real-TV legibility of the 3 schedule views, Hebrew wording (`כעת: X`, `בעיצומו של`) — needs a native speaker. Owner reports back with photos/screenshots; fix from those.

## Windows PC as the screen computer (2026-10-26, branch `claude/wizardly-ride-bnbtzj`) - written, NOT yet run on Windows
- Owner wants TachTach to run on an ordinary Windows 10/11 PC behind the TV, not only the Pi. Done: `docs/windows/AUDIT.md` (every Linux assumption, ranked), `src/server/platform.js` (helpers; Linux behaviour unchanged, `test/platform.test.js`), Windows switch in `deploy/update-helper.mjs` (`test/windowsUpdate.test.js`), kit `deploy/windows/*.ps1` (install / server supervisor / kiosk watchdog / SYSTEM update runner + NETWORK SERVICE worker / update / uninstall / health check; static lint `test/windowsKit.test.js`), owner docs `docs/windows/SETUP.md`, `TEST-CHECKLIST.md`, `RISKS.md`.
- No PowerShell in the sandbox (download denied), so the scripts are linted, not run. **Next: owner runs TEST-CHECKLIST.md on a test PC and sends the health-check zip; fix from that.** Top risk: the server task as `LOCAL SERVICE` (A5 in the checklist).

## Open decisions / waiting on owner
- Kiddush Levana: confirm cutoff (halfway point = Minhag Chabad?) and skip customs with a rav (`docs/kiddush-levana-next-14-months.md`).
- Whole-day schedule min text 26 px (24 would fit busier days) — kept 26.
- Tanya / Daily Quote do not scroll (owner: not needed).
- PDF chip, bigger logos etc: see `docs/BACKLOG.md`.

## Next: the slow polish passes (owner request 2026-10-20)
Go through the site ONE SMALL AREA AT A TIME (not a page — a section/component), look at it critically with real screenshots (seed sample data on a throwaway copy), list what to clean up / add / smooth, show the owner the list, then fix and ship to `main`. No rush; quality over speed. Queue and process in `docs/BACKLOG.md` ("Polish queue").
