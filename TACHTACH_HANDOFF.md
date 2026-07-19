# TachTach-Screens — Claude Code Handoff

A digital signage system for a Jewish school, running on Raspberry Pi 5. Displays zmanim, daily limudim, Hayom Yom, and admin-controlled messaging on a mounted TV. Single-admin access via Twingate.

The name **TachTach-Screens** is the product name — use it in page titles, the admin login branding, the systemd service name, and the README.

---

## 🎯 Core Concept

**Pi 5 = server + display in one device.** It serves both the kiosk screen (HDMI to TV, Chromium fullscreen) and the admin panel (phone/laptop via Twingate). No cloud. No Firebase. No external dependencies at runtime. Once running, the Pi fetches from Chabad.org / HebCal / Sefaria on a schedule and caches everything locally.

- **Target device:** Raspberry Pi 5 with connected TV/monitor
- **Single admin user** — no user management complexity
- **Network:** Local Wi-Fi for kiosk↔Pi, Twingate for remote admin
- **Philosophy:** Fail-closed security, data resilience (works offline using last cache), minimal moving parts

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Raspberry Pi 5                             │
│                                                               │
│  ┌──────────────────┐     ┌────────────────────────────┐    │
│  │  Chromium Kiosk  │◄────│  Express Server :3000      │    │
│  │  (fullscreen)    │ SSE │                            │    │
│  │                  │     │  Routes:                    │    │
│  │  → localhost     │     │    /screen  (kiosk HTML)   │    │
│  │    :3000/screen  │     │    /admin   (admin HTML)   │    │
│  │                  │     │    /stream  (SSE live)     │    │
│  └──────────────────┘     │    /api/*   (CRUD + auth)  │    │
│                           │                            │    │
│                           │  Data fetchers:             │    │
│                           │    chabad.js                 │    │
│                           │    hebcal.js                 │    │
│                           │    sefaria.js                │    │
│                           │                            │    │
│                           │  Scheduler (node-schedule):  │    │
│                           │    zmanim refresh (see §4)   │    │
│                           │    daily content refresh     │    │
│                           │                            │    │
│                           │  Storage (files, no DB):   │    │
│                           │    cache.json                │    │
│                           │    settings.json             │    │
│                           │    slides.json               │    │
│                           │    messages.json             │    │
│                           │    pinned.json               │    │
│                           │    custom-days.json          │    │
│                           │    uploads/  (images)        │    │
│                           │    auth.json                 │    │
│                           └────────────────────────────┘    │
│                                       ▲                      │
│                                       │ HTTPS via Twingate   │
└───────────────────────────────────────┼──────────────────────┘
                                        │
                        ┌───────────────┴──────────────────┐
                        │  Admin (phone/laptop)             │
                        │  Twingate tunnel → localhost      │
                        └──────────────────────────────────┘
```

**Why this setup:**
- No proxy / CORS issues — Node fetches Chabad.org server-side
- Offline-tolerant — kiosk uses last cache if fetch fails
- Instant live updates — SSE pushes changes to screen the moment admin saves
- Single process — one `node server.js`, one systemd service

---

## 🔐 Security (fail closed, no compromise)

**Single admin user. Zero exceptions on gate-level security.**

### Rules
1. **Every non-login route requires a valid session cookie.** Middleware gates everything before Express reaches any handler.
2. **No route accessible by default.** If auth middleware can't confirm session → immediate 302 redirect to `/login` for HTML, or 401 JSON for `/api/*`.
3. **One password, hashed with bcrypt** (cost factor 12). Stored in `auth.json`. Set during initial setup via terminal-only CLI — never via web UI.
4. **HttpOnly, SameSite=Strict cookies.** Session token is a cryptographically random 256-bit value, stored server-side in `auth.json` with rolling 30-day expiry.
5. **Rate limiting on `/login` POST** — 5 attempts per IP per 15 min, then 1hr lockout. Use `express-rate-limit`.
6. **CSRF protection** on all state-changing POST/PUT/DELETE — double-submit cookie pattern.
7. **Logout endpoint** destroys the session token server-side, not just client-side.
8. **`/screen` and `/stream`** are the only unauthenticated routes. Protect by binding — these check `req.ip` and only respond to `127.0.0.1` or Twingate internal IP range. Return 404 (not 403) for any other IP.

### Network binding
- Server binds to `0.0.0.0:3000` for admin access via Twingate
- `/screen` and `/stream` → localhost-only enforcement
- `/admin` and `/api/*` → require valid session cookie
- All other paths → 404

### Failure modes
- Session invalid → wipe cookie, redirect to `/login`
- Session expired → same
- `auth.json` missing → show setup page with instructions to run `node setup.js` from terminal
- Too many failed logins → IP lockout with generic error (no hints)

### Kiosk hardening (Pi physical security)
The Pi may be accessible to students. Kiosk Chromium locked down:
- Chromium launch flags: `--kiosk --noerrdialogs --disable-infobars --disable-translate --no-first-run --check-for-update-interval=31536000 --overscroll-history-navigation=0 --disable-pinch --disable-features=TranslateUI --disable-dev-shm-usage`
- Disable keyboard shortcuts via xbindkeys (Alt+F4, Ctrl+W, F11, Ctrl+T, Ctrl+N, etc.)
- Disable TTY switch (Ctrl+Alt+F1-F6) in `/etc/X11/xorg.conf`
- Hide mouse cursor: `unclutter -idle 0.5`
- Disable USB auto-mounting: mask `udisks2`
- SSH enabled on non-default port (e.g. 2222), key-only auth, for remote debugging by the admin

### Hidden admin access from kiosk
If Twingate is down, admin still needs local access. Secret gesture: clicking the top-left 10×10px corner **5 times within 2 seconds** opens a password dialog on the kiosk. Correct password opens `/admin` in a new fullscreen window. No hint of this on screen.

---

## 🎨 Design Direction

User feedback: layout is acceptable, but the visual design across iterations has felt generic and disappointing. Commit to a bold aesthetic this time. If a better layout emerges during design, propose it — user is open to changes if they improve both beauty and function.

### Chosen direction: **"Illuminated Manuscript Meets Swiss Precision"**

Think: a well-worn sefer digitized by someone who cares deeply about typography. Warm backgrounds (near-black with warmth, or aged parchment). Hebrew letters treated with reverence. English secondary. Gold used like gold leaf — sparingly, for emphasis only.

### Non-negotiable design tokens

**Fonts:**
- Hebrew primary: `'Frank Ruhl Libre'` weight **500** (400 is too thin for screens)
- Hebrew display: `'Noto Serif Hebrew'` weight 500-700 for oversized headers
- English body: `'EB Garamond'` weight 400-500
- English display: `'Cormorant Garamond'` weight 300 italic for quotes and numbers
- **Absolutely never** Inter, Roboto, Arial, system fonts, or any sans-serif

**Dark theme (default):**
```
--bg        #12100C               /* near-black with warmth */
--text      #EFE3C0                /* warm cream, not white */
--dim       rgba(239,227,192,.60)
--muted     rgba(239,227,192,.30)
--gold      #D4A84B                /* muted, not yellow */
--goldBg    rgba(212,168,75,.13)
--goldBd    rgba(212,168,75,.42)
--surface   rgba(255,240,195,.045)
```

**Parchment theme (alt):**
```
--bg        #F0E4C4                /* aged paper */
--text      #1C0E05                /* deep brown-black */
--gold      #8B5E00                /* darker for light bg */
```

**Custom theme** — admin color picker for primary + accent, system calculates complementary tones.

### Mandatory design moves
1. **Grain overlay** — SVG fractalNoise at ~40% opacity, full screen
2. **Radial gradients** — two warm glows at ~22% and ~78% for depth
3. **Hairline double-frame** 12-14px inset from edges, 0.16α + 0.32α colors — printed-page margin feel
4. **Ornamental dividers** — `✦` or `◦` flanked by fading gradient rules, not plain `<hr>`
5. **Hebrew always larger than English** for the same concept. Hebrew 18px → English 9-10px uppercase. No exceptions.
6. **Numbers (times, chapters)** use Cormorant Garamond weight 300 — the one place Latin glyphs dominate
7. **Hebrew chapter chips** — gold-background pills with ב׳ ג׳ ד׳ for Rambam perakim
8. **No emojis, ever.** Unicode geometric shapes only: ✦ ◈ ◉ ✡ ◦
9. **No rounded corners above 6px.** Sharp, print-like edges — anything rounder feels web-app-y
10. **Animations**: framer-motion slide transitions `{ opacity, scale: 1.014 }`, 0.85s cubic-bezier. Nothing bouncy. Page-turning feel.

### Base layout (landscape; portrait stacks)

```
┌──────────────────────────────────────────────────────────────┐
│ ◦ double hairline frame ─────────────────────────────────── ◦│
│                                                               │
│   ┌─────────────────┐    ┌──────────────────────────────┐   │
│   │   CLOCK          │    │                              │   │
│   │   128px Cormorant│    │    SLIDE CONTENT AREA        │   │
│   │        300       │    │                              │   │
│   │                  │    │  rotates between:             │   │
│   │   ──────         │    │    Zmanim                    │   │
│   │                  │    │    Limudim                    │   │
│   │ HEBREW DATE     │    │    Hayom Yom                 │   │
│   │ Noto 52px 500   │    │    Pirkei Avos (seasonal)    │   │
│   │                  │    │    Image slides               │   │
│   │ Wed Apr 23       │    │    Custom slides              │   │
│   │                  │    │                              │   │
│   │ [פרשת אמור]      │    │                              │   │
│   │ [כ׳ לעומר]       │    │                              │   │
│   │                  │    │                              │   │
│   │ ┌── PINNED ────┐ │    │                              │   │
│   │ │ Meeting 7pm  │ │    │                              │   │
│   │ │ Trip Thursday│ │    │                              │   │
│   │ └──────────────┘ │    │                              │   │
│   │                  │    │                              │   │
│   └─────────────────┘    └──────────────────────────────┘   │
│                                                               │
│              ● ○ ○  (progress dots + slide timer)            │
└──────────────────────────────────────────────────────────────┘
```

Clock + Hebrew date are **always** visible (left column, persistent across slide rotation). Only the right content area transitions.

---

## 📋 Feature Spec

### 1. Slides (right-panel carousel)

**Built-in slide types (always available, individually toggleable):**

| Slide | Description | Toggleable? | Default |
|-------|-------------|-------------|---------|
| `ZMANIM` | Halachic times from Chabad.org | ✓ | on |
| `LIMUDIM` | Chitas + Rambam 1ch + Rambam 3ch + Tanya Yomi | ✓ | on |
| `HAYOM_YOM` | Daily Hayom Yom quote, English + Hebrew side by side | ✓ | on |
| `PIRKEI_AVOS` | Current week's perek (auto-hidden outside Pesach→RH season) | ✓ | on |

**Admin-creatable custom slide types:**
- `IMAGE_SLIDE` — uploaded image with display mode + edge treatment
- `TEXT_SLIDE` — title + body, Hebrew and/or English, with layout templates:
  - `headline` — giant centered text
  - `quote` — italic quote with attribution
  - `info` — title + bulleted list
  - `about` — multi-section about the school
  - `classes` — schedule grid with times and teachers
  - `announcement` — formal message with date

### Per-slide controls (every slide, no exceptions)
- **Enabled toggle** (on/off)
- **Duration** in seconds (default 13)
- **Drag-reorder** in admin panel
- **Custom title override** (optional, overrides default Hebrew/English title)

### Slide rotation rules (CRITICAL)
- Slides auto-advance based on their configured duration
- **Banner messages DO NOT pause slide rotation** — slides keep turning above the banner (fix from prior iteration)
- **Board messages** replace slide content for their duration, then rotation resumes
- **Takeover messages** pause everything and fullscreen until dismissed or expired

### 2. Messages (3 types)

| Type | Behavior | Pauses slides? | Use case |
|------|----------|----------------|----------|
| **Banner** | Scrolling bottom strip | **No** — slides keep rotating | "Mincha 7:15" |
| **Board** | Stacks on right panel, replaces slide content | Replaces slide content only | "Shmuel come to office" |
| **Takeover** | Full-screen urgent | **Yes** — pauses carousel | Emergencies |

**Every message has:**
- Text (Hebrew and/or English)
- Expiry: minutes / hours / "end of day" / "manual dismiss"
- Priority (for stacking Takeovers — higher wins)
- Target (optional recipient name/group, shown in Board)
- Timestamp

### 3. Pinned notes (persistent, under clock)

Separate from messages. Live permanently on the left column beneath the Hebrew date. Can stay for days/weeks.

- Shows up to **3 at a time**
- If more than 3 exist, auto-scrolls vertically (1 item advance every 4 seconds)
- Each note: small icon (dot/star), short text Hebrew/English, optional expiry
- **Auto-generated** (no admin input needed): Omer count, Rosh Chodesh, Fasts — from HebCal events
- **Admin-added**: "Bring siddur", "Trip Thursday 9am", etc.
- Admin panel: add/edit/remove with drag-reorder

### 4. Scheduler — zmanim refresh logic

**User wants smart refresh timing, not naive fixed intervals.**

Two refresh tracks running in parallel via `node-schedule`:

**Track A — "Rolling zmanim window":**
- **At each major zman as it passes**, trigger a refresh that pulls the remaining zmanim for today + the full schedule for tomorrow
- Triggered specifically after: **Shkiah** (sunset) — refresh pulls tomorrow's entire zmanim schedule so the screen can already show tomorrow's Alot, HaNetz, etc.
- Also triggered after: Chatzot, Plag HaMincha, Tzeit HaKochavim
- This way, the screen is **always showing upcoming zmanim** — once Shkiah passes, tomorrow's Alot starts showing as "next"

**Track B — "Daily content refresh":**
- Admin-configurable time (default 4:00 AM)
- Fetches: Hayom Yom, Chitas, Rambam (1ch + 3ch), Tanya Yomi, parsha for week
- Also re-fetches zmanim as a sanity check

**Admin controls:**
- Toggle Track A on/off
- Set Track B time (HH:MM picker)
- Manual "Refresh now" button
- Last-fetched timestamp visible per data source

### 5. Zmanim display — "next" vs "upcoming" colors

User wants **differentiated colors** for zmanim state:

- **Past today** — very dim (~22% opacity)
- **Current / just passed** — normal dim
- **Next zman** — **GOLD** highlight with subtle background glow (`--goldBg`)
- **Upcoming today (after next)** — normal full-opacity cream text
- **Tomorrow's zmanim** (shown after Shkiah) — distinct second color: **soft copper** `#B8803A` or similar — clearly readable but visually distinct from gold, so the eye instantly knows "these are tomorrow's"

Each zman row includes a small Hebrew label for tomorrow: **"למחר"** tag next to tomorrow's entries.

### 6. Custom days (recurring annotations)

Admin-managed list of special dates. Shows as pinned note automatically when that date arrives.

```json
[
  { "hebrewMonth": "Kislev", "hebrewDay": 19, "title": "ראש השנה לחסידות", "subtitle": "Yud-Tes Kislev" },
  { "hebrewMonth": "Tishrei", "hebrewDay": 10, "title": "יום הכיפורים" },
  { "gregorianMonth": 4, "gregorianDay": 11, "title": "School anniversary", "recurring": true }
]
```

Admin panel has dedicated editor with Hebrew and Gregorian date options.

### 7. Image uploads (advanced)

**Upload flow:**
1. Admin clicks "Upload image" in admin panel
2. Picks orientation target: Landscape / Portrait / Both
3. Uploads file (JPG/PNG/WebP, max 10MB)
4. Server analyzes dimensions via `sharp`, stores original + optimized variants
5. Admin chooses display mode:
   - **Fit** (letterbox — image in full, background fills edges)
   - **Fill** (cover — crops to fit)
   - **Stretch** (distort — included for completeness; discourage in UI)
6. Admin picks edge treatment for Fit mode:
   - Dark solid
   - Light solid
   - **Glassy blur** (DEFAULT, best-looking) — same image scaled to cover + heavy Gaussian blur + dark overlay
   - **Gradient** — sampled from image's dominant colors via server-side extraction
7. Admin picks use case: Add as Slide / Use as Takeover message
8. Image slides follow all normal slide rules (toggle, duration, reorder); Takeovers replace screen entirely

**Server dependencies:** `sharp` for processing + dominant-color extraction, `multer` for uploads. Store in `/data/uploads/` with UUID filenames.

### 8. Settings (admin panel)

- **Location**: zip code (affects zmanim), timezone auto-detect
- **Theme**: Dark / Parchment / Custom (color picker)
- **Orientation**: Landscape / Portrait / Auto-detect
- **Scheduler**: Track A on/off, Track B time picker, manual refresh
- **Show/hide home elements**: clock, Hebrew date, parsha badge, Omer count, pinned notes
- **Data sources**: which to fetch (all on by default, individual toggles)
- **Screen controls**: pause / resume / manual refresh / blackscreen / force-advance-slide

### 9. Live preview (admin panel)

Admin panel embeds `/screen` in an iframe as live preview. When admin types a message and clicks "Preview", it sends a `preview` SSE event targeted only to that iframe (not the real kiosk). Admin confirms, then "Publish" pushes to all screens.

### 10. Hidden kiosk admin access

Top-left 10×10px corner clicked 5 times in 2 seconds → modal password prompt on the kiosk itself → if correct, opens `/admin` fullscreen. Emergency fallback for when Twingate is unavailable.

---

## 🔌 Data Fetchers

All server-side. Cache to `cache.json` with `fetchedAt` timestamp. Screen reads from cache. `node-schedule` handles timing.

### `src/fetchers/chabad.js`

**Zmanim RSS** — `https://www.chabad.org/tools/rss/zmanim.xml?locationid=${locationId}&locationtype=2`
- Parse XML with `fast-xml-parser`
- Support `date=YYYY-MM-DD` parameter to fetch tomorrow's zmanim (for post-Shkiah refresh)

**Hayom Yom + Chitas** — `https://www.chabad.org/dailystudy/hayomyom.asp`
- Use browser User-Agent header (no CF protection on this URL)
- Parse with `cheerio`
- Reference parser code below

**Rambam fallback** — `https://www.chabad.org/dailystudy/rambam.asp` (1ch) and `rambam.asp?rambamChapters=3`
- Only use if Sefaria is down

### `src/fetchers/hebcal.js`

**Hebrew date + Omer + events** — `https://www.hebcal.com/converter?cfg=json&gd=${D}&gm=${M}&gy=${Y}&g2h=1`

**Parsha** — `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&nx=on&ss=off&mf=off&c=off&geo=zip&zip=${zip}&M=on&s=off&start=${today}&end=${today+7d}`

### `src/fetchers/sefaria.js`

**Daily calendar** — `https://www.sefaria.org/api/calendars?diaspora=1&custom=ashkenazi`
- Find `Daily Rambam`, `Daily Rambam (3 Chapters)`, `Tanya Yomi`

**Rambam metadata** — `https://www.sefaria.org/api/texts/${encodeURIComponent(url)}?context=0&pad=0&commentary=0`
- `categories[2]` → Sefer, `book` → Hilchos, `heRef` → Hebrew ref, `sections[0]`/`toSections[0]` → chapter range

### Pirkei Avos logic

Calculate which Shabbat between Pesach and Rosh Hashana we're on. Weeks 1-6 → perakim 1-6 respectively. Weeks 7+ follow Chabad custom (repeating cycle). Hide slide entirely outside that seasonal window.

---

## 📡 API Routes

```
GET  /login                   login page HTML
POST /login                   { password } → sets session cookie
POST /logout                  destroy session

GET  /screen                  kiosk HTML (localhost-only)
GET  /stream                  SSE endpoint (localhost-only)

─── Auth required below ───

GET  /admin                   admin HTML
GET  /api/state               cache + settings + messages + slides

POST /api/refresh             force-fetch all sources now
POST /api/refresh/zmanim      refresh zmanim only (for Track A triggers)

GET  /api/settings
PUT  /api/settings

GET  /api/slides
PUT  /api/slides              reorder + toggle + duration + config
POST /api/slides              create custom slide
DELETE /api/slides/:id

GET  /api/messages
POST /api/messages
DELETE /api/messages/:id

GET  /api/pinned
POST /api/pinned
PUT  /api/pinned/:id
DELETE /api/pinned/:id

GET  /api/custom-days
POST /api/custom-days
DELETE /api/custom-days/:id

POST /api/upload              multipart image upload
GET  /api/images
DELETE /api/images/:id

POST /api/preview             preview-only SSE event to admin iframe
POST /api/screen/pause
POST /api/screen/resume
POST /api/screen/blank
POST /api/screen/advance
```

### SSE events on `/stream`

```
{ type: "settings-update",  data: {...} }
{ type: "slides-update",    data: [...] }
{ type: "messages-update",  data: [...] }
{ type: "pinned-update",    data: [...] }
{ type: "cache-refresh",    data: {...} }
{ type: "screen-command",   data: { action: "pause"|"resume"|"blank"|"advance" } }
{ type: "preview",          data: {...} }   ← admin iframe only
```

---

## 🚀 Setup script (`setup.js`)

Interactive CLI:
1. Prompts for admin password (min 12 chars, mixed case + digit)
2. Hashes with bcrypt, writes `auth.json`
3. Prompts for zip + Chabad location ID (default zip 33139, locationid 33139)
4. Writes default `settings.json`, `slides.json` (with built-ins enabled), empties for the rest
5. Fetches initial cache
6. Prints admin URL + Twingate setup hint

```bash
cd tachtach-screens
node setup.js
```

---

## 🛠 Dependencies

```json
{
  "express": "^4.19",
  "express-session": "^1.18",
  "express-rate-limit": "^7.4",
  "csurf": "^1.11",
  "bcrypt": "^5.1",
  "cookie-parser": "^1.4",
  "fast-xml-parser": "^4.5",
  "cheerio": "^1.0",
  "node-fetch": "^3.3",
  "node-schedule": "^2.1",
  "sharp": "^0.33",
  "multer": "^1.4",
  "uuid": "^10.0",
  "dotenv": "^16.4"
}
```

Frontend: React 18, framer-motion, inline styles (no Tailwind — keeps code portable and better-matches aesthetic than utility classes).

---

## 🧩 Kiosk launcher

`/etc/systemd/system/tachtach-screens.service`:
```ini
[Unit]
Description=TachTach-Screens Server
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/tachtach-screens
ExecStart=/usr/bin/node /home/pi/tachtach-screens/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Autostart Chromium kiosk (`/etc/xdg/lxsession/LXDE-pi/autostart`):
```
@unclutter -idle 0.5
@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-translate --no-first-run --check-for-update-interval=31536000 --overscroll-history-navigation=0 --disable-pinch http://localhost:3000/screen
```

---

## 📦 Reference code (already-debugged parsers)

### Zmanim RSS parser
```javascript
import { XMLParser } from "fast-xml-parser";

const RSS_MAP = {
  "Dawn (Alot Hashachar)":"alotHaShachar",
  "Earliest Tallit and Tefillin (Misheyakir)":"misheyakir",
  "Sunrise (Hanetz Hachamah)":"sunrise",
  "Latest Shema":"sofZmanShma",
  "Latest Shacharit":"sofZmanTfilla",
  "Midday (Chatzot Hayom)":"chatzot",
  "Earliest Mincha (Mincha Gedolah)":"minchaGedola",
  'Mincha Ketanah ("Small Mincha")':"minchaKetana",
  'Plag Hamincha ("Half of Mincha")':"plagHaMincha",
  "Sunset (Shkiah)":"sunset",
  "Nightfall (Tzeit Hakochavim)":"tzeit7083deg",
};

export function parseZmanimRSS(xml) {
  const parser = new XMLParser();
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item || [];
  const res = {};
  for (const item of items) {
    const title = item.title || "";
    const cat = (item.category || "").trim();
    const m = title.match(/^(.+?) - \d+:/);
    if (m && cat && !cat.includes("min.")) {
      const key = RSS_MAP[m[1].trim()];
      if (key) res[key] = cat;
    }
  }
  return res;
}
```

### Hayom Yom parser
```javascript
import * as cheerio from "cheerio";

export function parseHayomYom(html) {
  const $ = cheerio.load(html);
  const shiurs = $(".hayom-yom-shiur").toArray().map(el => $(el).text().trim());
  const getShiur = (label) => {
    const s = shiurs.find(t => t.startsWith(label));
    return s ? s.replace(label, "").replace(/^[\s:]+/, "").trim() : "";
  };
  const enStart = html.indexOf("Alter Rebbe");
  const enEnd = html.indexOf("Compiled and arranged");
  let hayomEn = "";
  if (enStart > 0 && enEnd > 0) {
    hayomEn = html.slice(enStart, enEnd)
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'")
      .replace(/\d+\s*$/, "").trim();
  }
  const heStart = html.indexOf("רבינו הזקן");
  let hayomHe = "";
  if (heStart > 0) {
    hayomHe = html.slice(heStart, heStart + 700)
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      .replace(/Wednesday|Monday|Tuesday|Thursday|Friday|Saturday|Sunday/, "")
      .trim().split(/  {3,}/)[0].trim();
  }
  return {
    hayomEn, hayomHe,
    chumash: getShiur("Chumash:"),
    tehillim: getShiur("Tehillim:"),
    tanya: getShiur("Tanya:"),
  };
}
```

### Hebrew numerals + Sefer names
```javascript
const HEB_NUM = {1:"א",2:"ב",3:"ג",4:"ד",5:"ה",6:"ו",7:"ז",8:"ח",9:"ט",10:"י",
  11:"יא",12:"יב",13:"יג",14:"יד",15:"טו",16:"טז",17:"יז",18:"יח",19:"יט",20:"כ",
  21:"כא",22:"כב",23:"כג",24:"כד",25:"כה",26:"כו",27:"כז",28:"כח",29:"כט",30:"ל"};
export const hNum = n => HEB_NUM[n] ? `${HEB_NUM[n]}׳` : String(n);

export const SEFER_HE = {
  "Sefer HaMadda":"ספר המדע","Sefer Ahavah":"ספר אהבה","Sefer Zmanim":"ספר זמנים",
  "Sefer Nashim":"ספר נשים","Sefer Kedushah":"ספר קדושה","Sefer Haflaah":"ספר הפלאה",
  "Sefer Zeraim":"ספר זרעים","Sefer Avodah":"ספר עבודה","Sefer Korbanot":"ספר קרבנות",
  "Sefer Taharah":"ספר טהרה","Sefer Nezikin":"ספר נזיקין","Sefer Kinyan":"ספר קנין",
  "Sefer Mishpatim":"ספר משפטים","Sefer Shoftim":"ספר שופטים",
};
```

### Zmanim display list — use exactly these Hebrew labels
```javascript
export const ZMANIM_DISPLAY = [
  { k:"alotHaShachar",  he:"עלות השחר",     en:"Alot HaShachar"    },
  { k:"misheyakir",     he:"משיכיר",          en:"Misheyakir"         },
  { k:"sunrise",        he:"הנץ החמה",        en:"HaNetz HaChama"    },
  { k:"sofZmanShma",    he:'ס"ז קריאת שמע',  en:"Latest Shema"       },
  { k:"sofZmanTfilla",  he:'ס"ז תפילה',       en:"Latest Shacharit"   },
  { k:"chatzot",        he:"חצות היום",       en:"Chatzot HaYom"     },
  { k:"minchaGedola",   he:"מנחה גדולה",     en:"Mincha Gedolah"    },
  { k:"minchaKetana",   he:"מנחה קטנה",      en:"Mincha Ketana"     },
  { k:"plagHaMincha",   he:"פלג המנחה",      en:"Plag HaMincha"     },
  { k:"sunset",         he:"שקיעה",           en:"Shkia"              },
  { k:"tzeit7083deg",   he:"צאת הכוכבים",    en:"Tzeit HaKochavim"  },
];
```

---

## ✅ Build order

1. **Scaffold + auth** — Express, login/logout, session middleware, `setup.js`, file-based storage helpers
2. **Data fetchers** — three modules with unit tests (use reference parsers)
3. **Cache + scheduler** — Track A (post-zman) + Track B (daily time) via `node-schedule`
4. **Kiosk screen React app** — full layout reading from local API
5. **SSE live stream** — wire admin changes to instant screen updates
6. **Admin panel** — all routes, live preview iframe, messages/pinned/slides/settings/custom-days
7. **Image upload pipeline** — multer + sharp, all display modes, dominant-color extraction
8. **Pirkei Avos** — seasonal calendar logic
9. **Slide customization UI** — text slide templates, drag-reorder, toggles, duration
10. **Zmanim tomorrow display** — post-Shkiah refresh showing tomorrow with copper color + למחר tag
11. **Kiosk hardening** — Chromium flags, systemd, install docs, hidden-corner login gesture
12. **Polish pass** — animation timing, typography refinement, grain/frame/ornaments

---

## 📝 Instructions to Claude Code

Open this document. Read it fully. Then:

1. Confirm understanding of the architecture, security rules, and **specifically the design direction** — "illuminated manuscript meets Swiss precision" with Frank Ruhl Libre, Noto Serif Hebrew, Cormorant Garamond (never Inter, never generic fonts).
2. Confirm understanding of the **scheduler** — Track A (post-zman refresh that pulls tomorrow's zmanim) + Track B (daily content refresh at admin-configured time).
3. Confirm understanding of slide rules: every slide has individual toggle + duration + reorder, including the 4 built-ins.
4. Confirm **Banners do NOT pause slide rotation** — only Takeovers do.
5. Ask clarifying questions if anything is ambiguous.
6. Build in the order listed above. Commit after each step with clear messages.
7. Fail closed on security — every route gated by middleware. No exceptions.
8. Every admin control needs live preview.
9. When complete, produce `README.md` with Pi install steps (including Twingate hints) and `CLAUDE.md` summarizing the codebase for future sessions.

The prior artifact iterations are available as reference for *what the user didn't like* — do not copy their design. Commit to genuinely distinctive visual design this time.

If you see an opportunity to improve the **layout** beyond what's described here (while keeping all specified features), propose it clearly in your first response before building — the user is open to it.
