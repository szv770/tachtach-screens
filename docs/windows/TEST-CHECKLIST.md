# Windows PC: test checklist (do these in order)

Nothing in the Windows version has been run on a real PC yet. This list is how we find out. Please do it on
a test PC (or the real one, outside school hours), in this order. For each step write **OK**, or **NOT OK +
what you saw** (a phone photo of the screen is perfect). When you finish, or the first time something is NOT
OK, run the health check (T4) and send me the zip together with your notes.

Copy-paste commands go into **PowerShell as administrator** unless it says otherwise.

## A. Install

| # | Do this | Expected result |
|---|---|---|
| A1 | SETUP.md Steps 1 and 2 (screen account, installer). | The installer ends with `Done.` and no red `ERROR` lines. Yellow `WARN` lines are allowed; copy them into your notes. |
| A2 | Look at the installer's line `Node.js ... at ...`. | Version 22 or newer, path under `C:\Program Files\nodejs\`. |
| A3 | Look for `native modules OK`. | Present (it means the photo library and the password library work on this PC). |
| A4 | Look for `PDF tool found:` or the PDF warning. | Either is fine; note which. |
| A5 | Look for `The server is answering on http://127.0.0.1:3000 (running as LOCAL SERVICE)`. | Present. **If not, stop here and send the log** (this is the most likely first problem). |
| A6 | Run the installer command again (same 3 lines). | Ends with `Done.` again; does NOT ask for the password again; your data is untouched. |
| A7 | Open **Task Scheduler**, folder **TachTach**. | 4 tasks: TachTach Server (Running), TachTach Kiosk, TachTach Update, TachTach Update Worker. |
| A8 | **Task Manager > Details**, find `node.exe`, look at the "User name" column. | `LOCAL SERVICE`. |

## B. The website

| # | Do this | Expected result |
|---|---|---|
| B1 | On the PC, open Edge (normal window) at `http://127.0.0.1:3000/admin`. | The sign-in page. Sign in with the password from A1. Set up 2-step if asked. |
| B2 | SETUP.md Step 3 (network Private). Then on a phone on the same Wi-Fi, open `http://<PC address>:3000/admin`. | The sign-in page on the phone. |
| B3 | On the phone (not signed in) open `http://<PC address>:3000/screen`. | A blank "not found" page (the screen page is only for the PC itself or signed-in people). |
| B4 | Admin > **Look & Settings > Location**: check the time zone. Compare with the PC clock (bottom right). | Same zone. The screen's zmanim look right for your city. |
| B5 | Upload a photo (Slides & media). | Upload works, picture appears in the list. |
| B6 | Upload a PDF (if A4 found the PDF tool). | Becomes picture slides. If not installed: a clear message saying so. |
| B7 | Admin > **Health**. | Mostly green. Note any red/yellow rows, especially "Clock" and "PDF slides". |

## C. The TV

| # | Do this | Expected result |
|---|---|---|
| C1 | SETUP.md Step 4 (Autologon) and Step 6: **restart** the PC, hands off. | Signs in by itself; within about 2 minutes the screen is full-screen on the TV. Note how long it took. |
| C2 | Look closely at the TV. | No address bar, no "Restore pages?", no "Translate this page?", no "Set Edge as default", no sign-in bubble, no Windows pop-ups. Mouse pointer in the bottom-right corner (or hidden). |
| C3 | Is the picture the right size? Text sharp? Nothing cut off at the edges? | Fills the TV exactly. (If blurry: set the PC to the TV's recommended resolution.) |
| C4 | Press `Alt+F4` on the TV PC. | The screen closes and comes back by itself within about 30 seconds. |
| C5 | Task Manager > Details > right-click `node.exe` > **End task**. | The TV keeps its picture; within about 10 seconds the server is back (Task Manager shows a new node.exe). The TV keeps updating (clock, slides). |
| C6 | Leave it alone for 1 hour. | Screen still on (no black screen, no screensaver, no sleep). |
| C7 | Make a change on the phone (e.g. post a short message). | Appears on the TV within a few seconds. |
| C8 | Unplug the network cable (or turn off Wi-Fi) and restart the PC. | Comes back on the TV with the last known information (zmanim, slides). Plug the network back in afterwards; within 30 minutes everything is fresh again. |
| C9 | Unplug the PC's power for 10 seconds (simulated power cut), plug back in. If the PC does not switch on by itself, check its BIOS setting "Restore on AC power loss" (see notes). | The screen comes back by itself once the PC is on. |

## D. Software update from the website

I need to push a small change to `main` for this; tell me when you are here.

| # | Do this | Expected result |
|---|---|---|
| D1 | Admin > Health > Software update. | Shows the current version. NOT "Not set up on this computer yet". |
| D2 | **Check for updates** (after I pushed). | "1 update available" (or similar) with its description. |
| D3 | **Update now**, enter password (+ code). | Within about 1 minute the card says "Updating...". The TV keeps its picture for 1-3 minutes, then reloads. The card ends with "Updated" and the new version. |
| D4 | **Roll back**. | Same as D3, back to the previous version. |
| D5 | Run `update.ps1` (SETUP.md "Update by hand"). | Ends with `Manual update finished (code 0)`. TV comes back. |

## E. Security spot checks

| # | Do this | Expected result |
|---|---|---|
| E1 | Sign in to Windows as `TachTach Screen` (or on the TV PC with keyboard: Ctrl+Alt+Del > Switch user is not needed if it is already signed in). Open File Explorer at `C:\TachTach\data`. | "You don't currently have permission" / Access denied. |
| E2 | Same account: try to create a file in `C:\TachTach`. | Not allowed. |
| E3 | Same account: open `C:\ProgramData\TachTach\updater`. | You can look but not change anything. |

## F. Windows events (over the first week)

| # | Watch for | Report |
|---|---|---|
| F1 | A Windows Update restart. | Did the screen come back by itself? How long was it off? |
| F2 | Any pop-up over the screen (Windows, Edge, antivirus, OneDrive, Teams). | Photo + what it said. |
| F3 | Any day the TV looked frozen, black, or wrong. | Time of day + photo; then run the health check. |
| F4 | The 03:15 daily browser restart. | Nothing to see; just confirm the screen is fine in the morning. |

## T. Tools

| # | Command | Use |
|---|---|---|
| T1 | `powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\install.ps1` | Repair (safe to run any time). |
| T2 | `powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\update.ps1` | Update by hand. |
| T3 | Task Scheduler > TachTach > right-click a task > End / Run | Restart the server or kiosk. |
| T4 | `powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\health-check.ps1` | Makes `TachTach-report-<time>.zip` on the Desktop. **Send this.** |

Notes:
- C9: many PCs stay off after a power cut until the button is pressed. In the PC's BIOS/UEFI setup (a key such
  as F2/Del at power-on) look for "Restore on AC power loss" / "After power failure" and set it to **Power On**.
  Mini-PCs usually have it.
- If any step shows a Windows message you have never seen, a photo is worth more than a description.
