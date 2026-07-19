# TachTach — Full Setup Guide (Pi → Screen → Remote Admin)

Everything needed to go from an unboxed Raspberry Pi to a fully working,
remotely-manageable digital signage screen showing the live Mivtzah
leaderboard. Do these in order.

---

## 1. Flash the SD card

Using **Raspberry Pi Imager** on your PC:
- OS: **Raspberry Pi OS with Desktop (Bookworm, 64-bit)** — not Lite.
- Click the gear icon (OS Customisation) before writing and set: hostname
  `tachtach`, enable SSH, username `pi`, a strong password, your WiFi
  SSID/password, country code, timezone, locale.
- Write the card, insert into the Pi.

## 2. Physical setup

- Power via **USB-C** (the real Pi 5 power supply).
- **Micro-HDMI → HDMI** (Pi 5 uses micro-HDMI, not mini — use the HDMI0 port,
  closest to USB-C) into the screen.
- Power on — WiFi joins automatically, no keyboard/mouse ever needed.

## 3. Install TachTach

```bash
ssh pi@tachtach.local          # or ssh pi@<ip> if mDNS doesn't resolve
cd /home/pi
git clone https://github.com/szv770/tachtach-screens.git tachtach-screens
sudo bash /home/pi/tachtach-screens/deploy/pi-setup.sh
```

## 4. Set the admin password

```bash
cd /home/pi/tachtach-screens
node setup.js
```

## 5. Configure `.env` (only if using the old raw-data leaderboard slide)

```bash
nano /home/pi/tachtach-screens/.env
sudo systemctl restart tachtach-server
```
Not needed for the live-embed slide below — that's just a URL, no keys.

## 6. Connect the Mivtzah Live Screen

From a device on the same WiFi: `http://tachtach.local:3000/admin`
1. In the mivtzah-app admin (`Settings → Kiosk → Public Live Screen`), click
   **Copy** next to the embed URL field.
2. In TachTach admin → **Slides**, edit **"Mivtzah Live Screen (embed)"**,
   paste the URL, save, toggle it **on**.

From now on, any future look/behavior change to the leaderboard happens
entirely in the mivtzah-app admin/codebase — you never touch the Pi for that.

## 7. Remote admin access (Cloudflare Tunnel)

Full step-by-step: [`deploy/cloudflare-tunnel-setup.md`](../deploy/cloudflare-tunnel-setup.md)

Short version: install `cloudflared` on the Pi, route a subdomain of
`szvtech.org` (already on Cloudflare — no domain migration needed) to
`localhost:3000`, run it as a systemd service. Result:
`https://tachtach.szvtech.org/admin` works from anywhere, not just your home
WiFi. Add a Cloudflare Access email-OTP gate on top (free) since it's now
reachable from the whole internet, not just your password.

## 8. If you ever forget the admin password (or lose your 2FA device)

Don't re-run `node setup.js` — it wipes your slides/settings. Instead, use the
committed reset script, which only ever touches `data/auth.json` and only the
specific field(s) you ask it to reset:

```bash
cd /home/pi/tachtach-screens
npm run reset-admin
```

This opens an interactive menu:

```
What do you want to reset?
  1) Password only
  2) TOTP / 2FA only (lost authenticator device)
  3) Both
  0) Cancel
```

Or skip the menu with flags:

```bash
npm run reset-admin -- --reset-password   # forgot the password
npm run reset-admin -- --reset-totp       # lost the authenticator device
npm run reset-admin -- --reset-password --reset-totp
```

- **Password reset** re-prompts for a new password (same complexity rules as
  `setup.js`: 12+ chars, upper+lower+digit) and re-hashes it with bcrypt.
  Your TOTP enrollment is left untouched.
- **TOTP reset** clears 2FA enrollment entirely — the next successful
  password login will show a brand-new QR code to re-enroll, exactly like
  first-time setup. This is the recovery path for a lost/broken phone, so
  losing the authenticator device can never permanently lock you out. It
  requires knowing the current admin password (or resetting the password
  first) — it is not a bypass of the password check.

Both reset modes clear the active session and any IP lockouts, since
credentials just changed.

### First login after `node setup.js` — 2FA enrollment

`setup.js` only creates the password + location settings, as before. The
first time you log in with that password, the admin panel will show a QR
code (scan it with Google Authenticator, Authy, etc.) and ask you to enter
one code from the app to confirm before it lets you in — this is mandatory
2FA setup, not optional. Every login after that asks for password + a fresh
6-digit code.

## 9. Updating TachTach later (code changes)

```bash
ssh pi@tachtach.local 'bash /home/pi/tachtach-screens/deploy/update.sh'
```
Your `data/` folder (slides, settings, messages, admin password) is never
touched by this — pulls new code, keeps your content.

---

## Architecture summary (why it's set up this way)

- **Data lives on the Pi** (local JSON files) — no cloud database, no
  dependency on a third-party service staying up or free.
- **Remote admin** is just the Pi's own admin panel, reachable through a
  Cloudflare Tunnel — not a separate hosted system. Simple, zero recurring
  cost, reversible.
- **The Mivtzah leaderboard is a live embed**, not a data sync — the Pi shows
  whatever the mivtzah-app's `/live` page currently looks like. Fixing a
  glitch or changing the design only ever requires editing mivtzah-app and
  pushing to Vercel; the Pi's own code never needs to change again for that.
- **Tradeoff accepted**: since everything lives on the Pi, remote admin only
  works when the Pi itself is online and reachable. If you ever expand to
  selling this to multiple schools, that's the point to revisit a
  cloud-hosted version — not before.
