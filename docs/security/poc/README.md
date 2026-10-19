# PoC notes (security audit 2026-10-19)

All dynamic tests ran against a **throwaway copy** of the repo in a scratch dir,
on `127.0.0.1` only, with a `netguard` require-hook that blocks every non-loopback
TCP/DNS so nothing external was ever contacted, and a throwaway `users.json`
created through the users-store module (never `setup.js`, never the real `data/`).
No secrets are printed below; hashes/tokens are redacted.

## F1 — Localhost gating bypass via X-Forwarded-For (TRUST_PROXY=1)

Prod sets `TRUST_PROXY=1` and `HOST=0.0.0.0` (deploy/tachtach-server.service).
`app.set('trust proxy', 1)` makes Express take the right-most XFF entry from the
*immediate* peer as `req.ip`. Behind cloudflared (one loopback hop) this is safe —
cloudflared overwrites XFF with the real client, so a tunnel request cannot forge
`127.0.0.1` (verified: returns 404). But any device on the **same LAN** talks to
the Pi directly, so IT is the trusted hop and its forged header is believed.

Request from a non-loopback source address with a spoofed header:

```
curl --interface <lan-ip> -H 'X-Forwarded-For: 127.0.0.1' http://<pi>:3000/api/state      -> 200 (should be 404)
curl --interface <lan-ip> -H 'X-Forwarded-For: ::1'        http://<pi>:3000/api/screen/state -> 200
```

Every `localhostOnly` / `localhostOrAuth` endpoint (kiosk state, screen report,
google-album scrape trigger, rss cache) becomes reachable **unauthenticated** from
the LAN. (Reproduced on the throwaway instance; both IPv4 and `::1` / IPv4-mapped
spoofs accepted.)

## F2 — Path traversal in /api/rss/cache/:feedId  (arbitrary file read)

`app.js` route 6e and `routes/api.js` `GET /api/rss/cache/:feedId` both build
`data/rss-cache/${feedId}.json` with `path.join` / `path.resolve` and no
validation. Express percent-decodes the param, so `..%2Fusers` escapes the dir:

```
GET /api/rss/cache/..%2Fusers
-> {"version":1,"users":[{"id":"...","username":"admin","role":"admin",
    "passwordHash":"<RED>","totpSecret":"<RED>","totpEnabled":true,
    "sessions":[{"hash":"<RED>", ...}]}]}
```

That returns `data/users.json` — every bcrypt hash, TOTP secret and session-token
hash. The `routes/api.js` copy is a plain GET, which `enforceRole` lets **any**
signed-in user run (including a View-only editor), so it is also a
privilege-escalation / horizontal file read, not only a localhost-bypass target.
Chained with F1 it is a pre-auth secret dump from the LAN.

## Things that held up (negative results)

- CSRF: a missing or wrong `X-CSRF-Token` on a mutation -> 403. Double-submit HMAC is
  session-bound and compared with `timingSafeEqual`.
- Prototype pollution: `PATCH /api/settings {"__proto__":{...}}` -> 403 for a
  non-admin (look-only gate) and `deepMerge` has a `__proto__/constructor/prototype`
  FORBIDDEN set anyway.
- Tunnel XFF forge of `127.0.0.1` -> 404 (the appended real IP wins).
- `safeNext()` only allows `/admin[/section]` — no open redirect.
- `isPrivateAddress` blocks loopback/private/link-local/`::ffff:127.*`; the SSRF
  guard also re-resolves DNS and re-checks each redirect hop.
</content>
</invoke>
