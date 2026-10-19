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
