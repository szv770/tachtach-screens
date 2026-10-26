# TachTach Screens on a Windows PC: setup guide

This guide puts TachTach Screens on an ordinary Windows 10 or 11 PC (or a mini-PC) that sits behind the TV.
It does the same job as the Raspberry Pi: it runs the screen's server, shows the screen full-screen on the
TV, comes back by itself after a power cut or a Windows restart, and lets you update from the admin website.

> **Honest status (2026-10-26).** This Windows version has been written and checked carefully, but it has
> **not yet been run on a real Windows PC**. Please do the steps below on a spare or test PC first, then go
> through `TEST-CHECKLIST.md` and send the results (and the report zip from the health check). Expect a
> small fix or two after the first try.

---

## What you need

- A **64-bit** Windows 10 (version 1809 or newer) or Windows 11 PC, connected to the TV by HDMI.
- Internet (a cable is better than Wi-Fi for a screen).
- The PC's **administrator** password.
- About an hour, most of it waiting.
- Not needed: any programming knowledge. You will copy and paste a few lines.

## Before you start

1. Plug the PC into the TV and switch both on. In **Settings > System > Display**, make the TV the main
   display (or the only one) and choose its **recommended (native) resolution**. Leave "Scale" at the
   recommended value; the screen adjusts itself to any scale.
2. Run **Windows Update** until it says you are up to date, and restart once. (Better now than in the
   middle of your first day.)

## Step 1. Make a separate Windows account for the screen

The TV is shown by an account that signs in automatically. It is safer if that account is **not** an
administrator, so someone walking up to the TV cannot change the PC.

1. **Settings > Accounts > Other users** (Windows 10: **Family & other users**) > **Add account**.
2. Click **"I don't have this person's sign-in information"**, then **"Add a user without a Microsoft account"**.
3. User name: `TachTach Screen`. Choose a password and write it down (you need it once, in Step 4).
4. Leave the account type as **Standard user**.

(You can use an existing account instead, but a separate standard account is recommended.)

## Step 2. Run the installer

1. Click **Start**, type `PowerShell`, right-click **Windows PowerShell** and choose **Run as administrator**.
   Click **Yes**.
2. Copy these three lines, paste them into the blue window (right-click pastes), and press Enter:

   ```powershell
   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
   Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/szv770/tachtach-screens/main/deploy/windows/install.ps1 -OutFile $env:TEMP\tt-install.ps1
   powershell -ExecutionPolicy Bypass -File $env:TEMP\tt-install.ps1 -KioskUser "TachTach Screen"
   ```

3. What you will see, in order (each line starts with the time):
   - `[1/9] Node.js` and `[2/9] Git`: if they are missing they are installed for you. This can take a few minutes.
   - `[3/9] Code`: the program is downloaded to `C:\TachTach`, then "npm ci" and "build" (2-5 minutes).
   - `[4/9]` to `[7/9]`: settings, permissions, firewall, power, scheduled tasks. Quick.
   - `[8/9] First-time setup`: **you choose the admin password for the website** (at least 12 characters, with
     a capital letter, a small letter and a digit). It is shown while you type, so make sure nobody is watching.
     You are then asked for the zip code and the Chabad.org location (press Enter to keep the suggestion).
   - `[9/9] Starting`, then `Done.` and the address of the admin website.
4. If you see a red `ERROR` line, stop there and send the log file named at the top (and at the end) of the
   output: `C:\ProgramData\TachTach\logs\install\install-<date>.log`.

Running the installer again later is safe: it checks everything and only fixes what is missing ("repair").
It never deletes your data and never asks for the first-time setup again once a login exists.

## Step 3. Set the school network to "Private"

Phones and laptops can only reach the admin website if Windows treats the school network as **Private**.

- **Settings > Network & internet**, click your connection (Ethernet or Wi-Fi), set **Network profile type**
  to **Private**.

## Step 4. Sign in to the screen account automatically

We use **Autologon**, a small free tool made by Microsoft. It keeps the password encrypted inside Windows
(not in plain text).

1. Download it from Microsoft: search for **"Sysinternals Autologon"** (the page is on `learn.microsoft.com`).
2. Unzip it and run **Autologon64.exe** (as administrator). Accept the licence.
3. Username: `TachTach Screen`. Domain: leave what it shows (the PC's name). Password: the one from Step 1.
4. Click **Enable**. It says auto-logon is configured.

**Windows 11:** if automatic sign-in does not happen, open **Settings > Accounts > Sign-in options** and
turn **off** "For improved security, only allow Windows Hello sign-in for Microsoft accounts on this device",
then run Autologon again.

## Step 5. Windows Update: keep restarts out of school hours

The installer sets **Active hours** to 6:00 - 23:00 (Windows does not restart for updates in that time).
Check it under **Settings > Windows Update > Advanced options > Active hours** and change it if your
building is busy later. Windows will still restart now and then outside those hours; that is fine: the
screen comes back by itself in about 2 minutes. (Windows **Pro** can also **pause** updates for a few weeks,
for example around a big event.)

## Step 6. Restart and watch

Restart the PC (**Start > Power > Restart**). What should happen, with no keyboard or mouse:

| Time after the restart | What you should see |
|---|---|
| 0 - 1 min | Windows starts and signs in to `TachTach Screen` by itself. |
| up to 1 min more | Maybe a very short flash of a blue/black window (the screen's helper starting), then the TV page opens full screen. |
| after that | The normal screen: zmanim, slides, schedule. |

Then, on a phone on the same Wi-Fi, open the admin address printed at the end of Step 2
(`http://<the PC's address>:3000/admin`) and sign in with the password from Step 2.

Optional: unplug the mouse and keyboard so nobody can close the screen by accident.

---

## Day to day

- **Updates:** admin website > **Health > Software update > Update now**. It asks for your password (and
  2-step code) again. The TV keeps the old picture for 1-3 minutes while the new version installs, then
  reloads itself. If something goes wrong, the old version is put back by itself.
- **Update by hand** (first update after install, or if the button reports a problem): PowerShell **as
  administrator**:

  ```powershell
  powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\update.ps1
  ```
- **Something looks wrong:** run the health check and send the zip it puts on your Desktop:

  ```powershell
  powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\health-check.ps1
  ```
- **Forgot the website password / lost the 2-step phone:** PowerShell as administrator:

  ```powershell
  cd C:\TachTach
  node scripts\reset-admin-credentials.js --reset-password
  ```
  (`--reset-totp` instead clears a lost 2-step phone; `--list` shows who has a login.) **Never run `node setup.js` again**: it resets the screen's settings.
- **Getting out of the full-screen page:** `Alt+F4` closes it, but it opens again within about 15 seconds
  (on purpose). To use the PC for something else, press `Ctrl+Alt+Del` and **Sign out** or **Switch user**,
  or sign in as yourself. To stop the TV page for a while: Task Scheduler > TachTach > **TachTach Kiosk** >
  Disable (and Enable again later).

## What runs on the PC (for whoever looks after it)

| Thing | Where | Runs as |
|---|---|---|
| The program and its settings | `C:\TachTach` (data in `C:\TachTach\data`) | - |
| Scheduled task **TachTach Server** (the web server, restarts itself) | Task Scheduler > TachTach | `LOCAL SERVICE` (no admin rights; can only write `C:\TachTach\data`) |
| Scheduled task **TachTach Kiosk** (Edge full screen + watchdog) | Task Scheduler > TachTach | the screen account, at sign-in |
| Scheduled task **TachTach Update** (does the website's update button; checks once a minute, does nothing otherwise) | Task Scheduler > TachTach | `SYSTEM` (runs only an admin-only copy in `C:\ProgramData\TachTach\updater`) |
| Scheduled task **TachTach Update Worker** (downloads + builds the new version) | Task Scheduler > TachTach | `NETWORK SERVICE` |
| Logs | `C:\ProgramData\TachTach\logs\` (server, kiosk, update, install) | - |
| Backups of your data before every update | `C:\ProgramData\TachTach\backups\` (newest 10; photos/uploads not copied) | - |
| Screen options | `C:\ProgramData\TachTach\tachtach.json` | edit as administrator |

**Screen options** in `tachtach.json` (change as administrator in Notepad, then restart the PC):

| Option | Default | What it does |
|---|---|---|
| `Browser` | `auto` | `edge` or `chrome` (auto = Edge, which every Windows PC has) |
| `KioskDailyRestart` | `03:15` | Re-open the TV browser once a day at this time; `""` = never |
| `KioskStaleMinutes` | `15` | Re-open the browser if the page has not reported for this long |
| `KioskUseHttps` | `false` | `true` = load the screen over the local secure address. Only needed for web-page slides of sites such as Charidy that refuse to be shown otherwise. Try it and check there is no certificate warning on the TV. |
| `KioskDisableGpu` | `false` | `true` if the TV shows flicker or garbled blocks (slower, but avoids graphics-driver problems) |
| `Port` | `3000` | Change by re-running `install.ps1 -Port 8080` (it also updates the firewall rule) |

**PDF slides** need a small free tool (poppler). The installer tries to install it with winget. If the
Health page says "PDF slides: not installed", install it with `winget install oschwartz10612.Poppler`
(PowerShell as administrator) and run `install.ps1` again; or upload each page as a picture.

**Remove:** `powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\uninstall.ps1`
(keeps `C:\TachTach` and your data; add `-RemoveEverything` to delete them too, after a backup).

---

## If it goes wrong

| What you see | Most likely reason | What to do |
|---|---|---|
| The installer stops with a red ERROR about Node.js or Git | winget is missing or blocked | Install **Node.js LTS** (64-bit `.msi`) from nodejs.org and **Git for Windows** from git-scm.com by hand, then run the installer again. |
| "running scripts is disabled on this system" | PowerShell's script policy | Use the exact command lines above (they include `-ExecutionPolicy Bypass`). If it still appears, the PC is managed by a school/IT policy; ask IT. |
| The PC starts but stays on the sign-in screen | Automatic sign-in not set | Step 4 again (and the Windows 11 note). |
| Signed in, but the TV page never appears | Kiosk task did not start, or no browser | Wait 5 minutes (it retries every 5). Then run the health check and send the zip. |
| The TV shows "Can't reach this page" | Server not running | It retries by itself. If it stays: health check, send the zip. |
| The TV shows a certificate warning | `KioskUseHttps` is `true` and Edge refuses the local certificate | Set it back to `false` in `tachtach.json` and restart. |
| Phones cannot open the admin website, but it works on the PC itself | Network is "Public", or a different network | Step 3. Check the phone is on the same Wi-Fi. Use the address the installer printed. |
| Times on the screen are hours off | Windows time zone is wrong | **Settings > Time & language > Date & time**: "Set time zone automatically" off, choose your zone, "Set time automatically" on. It must match the admin website's **Look & Settings > Location**. |
| The screen goes black after a while | Power settings changed | Run `install.ps1` again (it resets them), or Settings > System > Power: screen and sleep "Never". |
| Windows notifications or "Get even more out of Windows" cover the screen | Windows tips | Sign in as `TachTach Screen`, Settings > System > Notifications: off. They should already be off after the first start. |
| "Software update" says "Not set up on this computer yet" | The installer did not finish | Run `install.ps1` again and send its log. |
| An update failed and says it was put back | Download or build problem | Nothing to do; the old version runs. Try again later, or run `update.ps1` and send its log. |
| PDF upload says "the PDF tool is not installed" | poppler missing | See "PDF slides" above. |

Anything else: run the **health check** and send the zip from your Desktop. It contains no passwords and
no student names.
