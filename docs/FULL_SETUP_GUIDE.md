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

## 8. If you ever forget the admin password

Don't re-run `node setup.js` — it wipes your slides/settings. Instead:
```bash
cd /home/pi/tachtach-screens
node --input-type=module -e "
import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync } from 'fs';
const p = 'data/auth.json';
const auth = JSON.parse(readFileSync(p, 'utf8'));
auth.passwordHash = await bcrypt.hash('YourNewPassword123', 12);
auth.session = null; auth.lockouts = {};
writeFileSync(p, JSON.stringify(auth, null, 2));
console.log('Password reset OK');
"
```

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
