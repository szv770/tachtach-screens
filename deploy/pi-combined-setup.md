# Pi Setup Guide — TachTach Screens + Mivtzah Ping

This guide covers a full Raspberry Pi setup from a freshly flashed SD card.
The Pi will run two things simultaneously:

- **TachTach-Screens** — a Node.js server + Chromium kiosk displaying digital signage
- **Mivtzah ping** — a background cron job that keeps a Supabase free-tier database alive

---

## Section 0 — Flash the SD Card

**Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your PC.**

1. **Choose OS:** Raspberry Pi OS with Desktop (Bookworm, 64-bit)
   - Do NOT use the Lite version — the kiosk needs a display server and browser.
   - In Imager: "Raspberry Pi OS (other)" → "Raspberry Pi OS with desktop (64-bit)"

2. **Choose storage:** select your SD card.

3. **Before writing, click the gear icon (OS Customisation)** and configure:

   | Setting | Value |
   |---|---|
   | Hostname | `tachtach` |
   | Enable SSH | Yes — "Use password authentication" for simplicity, or add your public key for key-based access |
   | Username | `pi` |
   | Password | A strong password — write it down |
   | WiFi SSID | Your network name |
   | WiFi password | Your network password |
   | Wireless LAN country | Your country code (e.g. `US`) |
   | Timezone | Your timezone (e.g. `America/New_York`) |
   | Locale | Your locale (e.g. `en_US`) |

4. **Write** the card, then insert it into the Pi and power it on.

---

## Section 1 — First Boot and SSH In

The Pi takes about 90 seconds to boot on first start.

**Find the Pi's IP address** using either method:

- Check your router's admin page — look for a device named `tachtach`
- Or try mDNS: `ping tachtach.local` from your PC (works on most networks)

**SSH into the Pi:**

```bash
ssh pi@tachtach.local
```

If mDNS doesn't work, use the IP directly:

```bash
ssh pi@192.168.x.x
```

Accept the fingerprint prompt, then enter your password.

---

## Section 2 — Install TachTach

### 2.1 — Clone the repository

```bash
cd /home/pi
git clone https://github.com/szv770/tachtach-screens.git tachtach-screens
```

This is a public repository, so no authentication is required to clone it.

### 2.2 — Run the setup script

```bash
sudo bash /home/pi/tachtach-screens/deploy/pi-setup.sh
```

**This script does the following (no action needed from you):**

1. Installs Node.js LTS via NodeSource
2. Installs Chromium and unclutter (cursor hider)
3. Runs `npm ci` and `npm run build` to install dependencies and build the frontend
4. Copies the two systemd service files into `/etc/systemd/system/` and enables them
5. Disables screen blanking and DPMS via lightdm config
6. Starts both services (`tachtach-server` and `tachtach-kiosk`)

If no admin password is set yet, the script will prompt you to run `node setup.js` interactively.

### 2.3 — Configure environment variables

```bash
nano /home/pi/tachtach-screens/.env
```

Fill in these values:

```
MIVTZAH_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
MIVTZAH_SUPABASE_ANON_KEY=eyJhbGci...your_actual_key...
```

**Where to get the anon key:**
> Supabase dashboard → your project → Settings (left sidebar) → API → "Project API keys" section → copy the **anon public** key.

Save and exit: `Ctrl+O`, `Enter`, `Ctrl+X`.

Restart the server to pick up the new env:

```bash
sudo systemctl restart tachtach-server
```

### 2.4 — Set the admin password (if not done during setup)

```bash
cd /home/pi/tachtach-screens
node setup.js
```

Follow the prompts to set your admin password and location name.

### 2.5 — Access the admin panel

From any PC on the same WiFi network:

```
http://tachtach.local:3000/admin
```

---

## Section 3 — Install Mivtzah Ping

The ping script keeps the Mivtzah Supabase project alive by writing and deleting rows every 3 days. Supabase free-tier projects pause after 7 days of inactivity; this provides a 2x safety margin.

### 3.1 — Create the directory

```bash
mkdir -p /home/pi/mivtzah-ping
cd /home/pi/mivtzah-ping
```

### 3.2 — Copy the ping files

The files (`ping.js`, `package.json`, `.env.template`) live in `mlmi/mivtzah-app/tools/pi-keepalive/` in the monorepo. Copy them to the Pi using one of these methods:

**Option A — scp from your PC** (run this on your PC, not the Pi):

```bash
scp path/to/mlmi/mivtzah-app/tools/pi-keepalive/* pi@tachtach.local:/home/pi/mivtzah-ping/
```

**Option B — if the monorepo is already cloned on the Pi:**

```bash
cp /home/pi/mlmi/mivtzah-app/tools/pi-keepalive/* /home/pi/mivtzah-ping/
```

### 3.3 — Configure environment variables

```bash
cp .env.template .env
nano .env
```

Fill in your Supabase anon key:

```
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...your_actual_key...
```

The anon key is safe to store here — it only has INSERT and DELETE access on the `_keepalive_ping` table, enforced by Supabase RLS policies.

Save and exit: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 3.4 — Install dependencies

```bash
npm install
```

### 3.5 — Test the script

```bash
node ping.js --test
```

Test mode skips the initial 0–30 minute jitter and uses 2–5 second gaps between writes instead of 20–60 seconds. You should see output like:

```
[2026-05-27T02:00:00.000Z] === Mivtzah keep-alive ping starting ===
[2026-05-27T02:00:00.001Z] Mode: TEST (short delays)
[2026-05-27T02:00:00.002Z] Planned writes this run: 12
[2026-05-27T02:00:00.300Z] Write 1/12 — OK
...
[2026-05-27T02:00:45.001Z] === Mivtzah keep-alive ping complete ===
```

If you see errors, check your `.env` values and confirm the `_keepalive_ping` table exists in Supabase (see `keepalive_table.sql` in the same folder).

### 3.6 — Schedule with cron

Open the crontab editor:

```bash
crontab -e
```

Add this line at the bottom of the file (runs at 2:00 AM every 3 days):

```
0 2 */3 * * cd /home/pi/mivtzah-ping && node ping.js >> /home/pi/mivtzah-ping/ping.log 2>&1
```

Save and exit. With nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 3.7 — Verify the cron entry

```bash
crontab -l
```

You should see the line you just added. Cron is now managing it — no further action needed.

---

## Section 4 — Updating TachTach from Your PC

### Standard update workflow

1. On your PC, push your latest code to the remote:

   ```bash
   git push
   ```

2. SSH into the Pi and run the update script:

   ```bash
   ssh pi@tachtach.local 'bash /home/pi/tachtach-screens/deploy/update.sh'
   ```

   The script pulls the latest code, runs `npm ci --omit=dev`, rebuilds the frontend, and restarts both services. It logs each run to `/home/pi/tachtach-update.log`.

### What the update script does

The script (`deploy/update.sh`) runs these steps:

```
git pull
npm ci --omit=dev
npm run build
sudo systemctl restart tachtach-server
sudo systemctl restart tachtach-kiosk
```

### Important: data is preserved across updates

The `data/` folder (slides, settings, messages, admin password) is gitignored and lives only on the Pi. It is never touched by `git pull` or the update script — all your content persists safely across every update.

---

## Section 5 — Verify Everything Is Running

Run these checks after setup or after an update:

```bash
sudo systemctl status tachtach-server
```
Should show `Active: active (running)`.

```bash
sudo systemctl status tachtach-kiosk
```
Should show `Active: active (running)`.

```bash
crontab -l
```
Should show the `0 2 */3 * * cd /home/pi/mivtzah-ping && node ping.js ...` line.

```bash
tail -20 /home/pi/mivtzah-ping/ping.log
```
After a test run, should show timestamped write entries and a completion line.

The Pi's screen should be showing the TachTach kiosk display in full-screen Chromium.

---

## Section 6 — Troubleshooting

**Follow live logs for the Node server:**

```bash
sudo journalctl -u tachtach-server -f
```

**Follow live logs for the Chromium kiosk:**

```bash
sudo journalctl -u tachtach-kiosk -f
```

**Restart only the server** (e.g. after editing `.env`):

```bash
sudo systemctl restart tachtach-server
```

**Restart only the kiosk** (e.g. if the screen is frozen):

```bash
sudo systemctl restart tachtach-kiosk
```

**If the screen is black after boot:**
The kiosk service depends on `graphical.target`. If the desktop environment hasn't started yet, the kiosk will fail silently and restart. Wait 30 seconds and check `systemctl status tachtach-kiosk` again. If it keeps failing, run `journalctl -u tachtach-kiosk` and look for X display errors.

**If `tachtach.local` doesn't resolve:**
mDNS can be unreliable on some routers. Find the Pi's IP in your router admin page and use it directly — for example: `ssh pi@192.168.1.50` and `http://192.168.1.50:3000/admin`.

**If `node: command not found` in cron:**
The cron environment has a minimal PATH. Use the full node path:

```
0 2 */3 * * cd /home/pi/mivtzah-ping && /usr/bin/node ping.js >> /home/pi/mivtzah-ping/ping.log 2>&1
```

**Check if cron is running at all:**

```bash
grep CRON /var/log/syslog | tail -20
```

---

## Section 7 — Accessing the Admin Panel

**From any PC on the same WiFi:**

```
http://tachtach.local:3000/admin
```

**From the Pi's kiosk screen itself:**

Tap the top-left corner of the screen (10×10 px area) **5 times within 2 seconds**. A password prompt will appear. Enter the admin password to navigate to `/admin`.
