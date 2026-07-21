# Trusted-Device TOTP Skip — Design

## Problem

Login requires password + a fresh TOTP code on every single login, with no way to reduce that friction for a device you use constantly (your own phone). This is mandatory 2FA by design (added deliberately, not optional) — the fix needs to reduce repeat friction without removing 2FA's actual protection for new/unknown devices.

## Approach

Standard "remember this device" pattern: after a device verifies TOTP once, it's trusted for 30 days and skips straight from password to a full session. Any other device (or this one again after 30 days, or after an explicit revoke) goes through the full password → TOTP flow unchanged.

## Data model

`data/auth.json` gains `trustedDevices: []`. Each entry: `{ token, createdAt, expiresAt }` — a random 256-bit token, timing-safe compared, stored the same way the existing `session` field already is (this codebase doesn't hash session-style tokens; a random unguessable value plus `crypto.timingSafeEqual` is the existing pattern, followed here for consistency). Multiple entries are expected (phone + laptop, etc.).

## Cookie

New `tachtach_trusted_device` cookie: httpOnly, `sameSite: 'strict'`, `secure: req.secure` (same conditional-secure logic `setSessionCookie` in `src/server/routes/auth.js:33-41` already uses for the tunnel/LAN split), 30-day `maxAge`.

## Login flow changes (`src/server/routes/auth.js`)

**`POST /login`** (currently line 71-103): after `verifyPassword` succeeds, currently always proceeds to `createPreAuth` + TOTP. New first check, before that: read the `tachtach_trusted_device` cookie; if it matches a non-expired entry in `trustedDevices`, skip TOTP entirely — create a session immediately (same as the end of the existing `/login/totp` handler), roll that trusted-device entry's `expiresAt` forward, and return a new `{ status: 'authenticated' }` response so the login page's JS redirects straight to `/admin` instead of showing a TOTP form. If no valid cookie, fall through to today's `totp_setup_required` / `totp_required` flow, unchanged.

**`POST /login/totp` and `POST /login/totp-setup`** (lines 107-177): after creating the session on success, also create a new trusted-device entry and set the cookie — this browser becomes trusted going forward. No opt-in checkbox; verifying TOTP once is what makes a device trusted (see Revocation below for the shared-computer case).

New functions in `src/server/auth.js`, alongside the existing `createSession`/`validateSession` pair:
- `isTrustedDevice(token)` — timing-safe check against `auth.trustedDevices`, same shape as `validateSession`.
- `trustDevice()` — generates + stores + returns a new trusted-device token, mirroring `createSession()`.
- `forgetAllTrustedDevices()` — clears the array.

`isTrustedDevice`/`trustDevice` should opportunistically prune expired entries from the array on each call, the same way `checkLockout` in `src/server/auth.js` already cleans up expired lockout entries — otherwise the array grows unbounded across every device that's ever verified TOTP and later expired or was revoked.

## Revocation

A "Forget All Trusted Devices" button in the admin Settings section, calling a new `POST /api/security/forget-devices` (behind the existing `requireAuth` + `csrfProtection`, added to `src/server/routes/api.js`) that calls `forgetAllTrustedDevices()`. This clears every device at once, including the one making the request — next login from anywhere needs full password+TOTP again. No per-device list/labeling (which device is which) — out of scope for this pass, "forget all" covers the actual need (lost/stolen phone, or cleaning up after using a shared computer).

`scripts/reset-admin-credentials.js`'s password-reset path should also call `forgetAllTrustedDevices()`, consistent with it already clearing sessions and lockouts — a password reset implies the old trust relationship shouldn't carry forward either.

## Security tradeoff (explicit, not hidden)

This means password + a valid trusted-device cookie is sufficient to log in — no fresh TOTP code needed on that device. Physical/malware access to an already-trusted, unlocked device combined with the password bypasses the second factor for that device until revoked. This is the same tradeoff every "remember this device" 2FA implementation makes (Gmail, banking apps, etc.); it's opt-in by usage (only applies to devices that already verified TOTP once) and instantly revocable.

## Testing

- Unit tests for `isTrustedDevice` / `trustDevice` / `forgetAllTrustedDevices` in `src/server/auth.js` (mirroring the existing session tests' patterns, if any exist — check first).
- Integration-style test of the `/login` flow: untrusted device still gets `totp_required`; a device with a valid trusted-device cookie gets `authenticated` and a real session without ever calling `verifyTotpCode`; an expired trusted-device cookie falls back to `totp_required`.
- Test that `forget-devices` invalidates a previously-trusted device's cookie on its next login attempt.
