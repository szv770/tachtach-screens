# TachTach-Screens

A digital signage system for shuls, yeshivas, and Jewish community spaces. Runs on a Raspberry Pi, displays zmanim, limudim, Hayom Yom, schedules, photos, and announcements on a TV -- all managed from a mobile-friendly admin panel.

## Key Features

- **Live zmanim and limudim** pulled from Chabad.org, auto-refreshed daily
- **11 takeover message styles** -- from emergency alerts to celebration confetti
- **Styled slides** -- apply takeover visual treatments (Grand, Sleek, Torah, etc.) as regular rotating slides
- **Google Photos integration** -- connect shared albums, auto-sync, Ken Burns effect
- **RSS feed slides** -- pull content from any RSS/Atom feed with field mapping and live preview
- **Schedule with countdown timers** -- slide or takeover alert modes, templates, 3 display modes, 16 SVG icons
- **8 built-in themes** with custom font uploads (TTF, WOFF, WOFF2) and 12 built-in font choices
- **Credit line and logo** -- customizable branding with logo upload, positioning, and blending
- **Real-time sync** -- admin changes appear on screen instantly via SSE
- **Mobile-responsive admin** -- full admin panel works on phones with horizontal tab navigation
- **Light and dark admin themes** -- toggle between admin panel themes
- **Storage cleanup** -- automatic daily cleanup of orphaned files, plus manual cleanup button
- **Runs headless on Raspberry Pi 5** with systemd services and kiosk mode

---

## Screenshots

> **[Screenshots coming soon]**
>
> Planned screenshots:
> - Kiosk display showing zmanim slide (dark theme)
> - Kiosk display showing schedule slide
> - Takeover message in "Grand" style
> - Takeover message in "Emergency" style
> - Admin panel -- Slides management (desktop)
> - Admin panel -- Messages section (mobile)
> - Admin panel -- Style/theme selector
> - Admin panel -- Schedule editor with categories

---

## Features

### Display / Slides

| Slide Type | Description |
|---|---|
| **Zmanim** | Daily halachic times from Chabad.org, gold-glow styling |
| **Limudim** | Hayom Yom, Rambam (1 & 3 chapter), Tanya Yomi, Chumash |
| **Hayom Yom** | Dedicated slide for the daily Hayom Yom |
| **Pirkei Avos** | Weekly Pirkei Avos chapter |
| **Daily Quote** | Rotating daily quotes |
| **Parsha Tidbits** | Weekly parsha insights |
| **Schedule** | Daily schedule with categories, 16 SVG icons, color coding, and 3 display modes (full day, auto-scroll, two-column) |
| **Google Photos** | Slideshow from shared Google Photos albums |
| **RSS Feed** | Display items from any RSS/Atom feed with field mapping, live preview, and configurable refresh |
| **Image** | Upload JPEG, PNG, WebP, or GIF (auto-optimized with Sharp) |
| **Video** | Upload MP4 or WebM, plays inline |
| **Custom Text** | Free-form Hebrew/English text with styled templates |
| **Styled Templates** | Apply any of the 11 takeover visual styles (Grand, Sleek, Torah, etc.) as regular rotating slides |
| **Pinned Notes** | Persistent notes displayed across all slides |
| **Countdown** | Countdown timer triggered by schedule events, with slide overlay or full takeover display mode |

Each slide has configurable duration, enable/disable toggle, drag-to-reorder, and an optional subtitle field.

### Admin Panel

- **Mobile-responsive** -- horizontal scrollable tab bar on small screens, sidebar on desktop; works fully on phones
- **Light and dark mode** -- sun/moon toggle in the sidebar (desktop) or top bar (mobile)
- **Live preview panel** -- see changes before they go live (desktop layout)
- **10 management sections**: Slides, Schedule, Messages, Pinned, Custom Days, Media, Photos, RSS Feeds, Style, Settings

### Themes

8 built-in kiosk display themes:

| Theme | Description |
|---|---|
| **Dark** | Warm parchment-on-mahogany (default) |
| **Dark HC** | High-contrast dark for maximum readability |
| **Midnight** | Cool-toned navy with blue accents |
| **Sepia** | Warm, easy on the eyes, paper-like |
| **Parchment** | Light theme with classic parchment tones |
| **Clean White** | Minimal modern white with blue-gray accents |
| **Ivory** | Warm cream with muted gold accents |
| **Sky** | Light blue-white with teal accents |

6 built-in Hebrew fonts (Frank Ruhl Libre, Noto Serif Hebrew, David Libre, Heebo, Rubik, Assistant) and 6 built-in English fonts (EB Garamond, Cormorant Garamond, Playfair Display, Lora, Inter, Roboto). Custom font uploads (TTF, WOFF, WOFF2) for both Hebrew and English text.

### Messages

Three message types:

- **Takeover** -- Full-screen overlay that interrupts the slideshow with 11 visual styles:
  - **Classic** -- Clean, minimal
  - **Grand** -- Elegant gold shimmer with sparkle particles
  - **Emergency** -- Red pulsing alert with hazard stripes
  - **Sleek** -- Apple keynote-style with typing cursor effect
  - **Celebration** -- Confetti, floating emojis, rainbow gradients
  - **Notice** -- Amber attention-grabbing border pulse
  - **Torah** -- Torah study / shiur announcement with floating Hebrew letters
  - **Trip** -- Outing / adventure themed
  - **Phone** -- Call to action / RSVP style
  - **Memorial** -- Yahrzeit / remembrance, subdued and respectful
  - **Hype** -- Countdown / excitement energy
- **Banner** -- Scrolling text bar along the bottom of the screen
- **Board** -- Bulletin board-style messages displayed in a list

Messages support Hebrew and English text, subtitles, priority levels, expiration dates, and custom background colors.

### Security

- **Password authentication** with bcrypt hashing (12 rounds)
- **Session-based auth** with secure, HTTP-only cookies
- **CSRF protection** via double-submit cookie pattern with session-bound HMAC
- **Rate limiting** -- 5 login attempts per 15 minutes, 60 API mutations per minute
- **Localhost-only kiosk routes** -- screen and SSE stream are restricted to 127.0.0.1
- **Security headers** -- X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Input sanitization** -- all API inputs are filtered to allowed fields only
- **Setup guard** -- server rejects requests until initial setup is complete

### Infrastructure

- **SSE (Server-Sent Events)** -- real-time push from admin to kiosk screen, no polling
- **Dual-track scheduler** -- Track A refreshes zmanim at halachic midnight, Track B at a configurable time
- **Auto-cleanup** -- daily cleanup of orphaned uploads, expired messages, and stale cache
- **Google Photos sync** -- periodic background sync with configurable intervals
- **RSS scheduler** -- per-feed refresh intervals (hourly, every 6 hours, or daily) with field mapping and live preview
- **Credit line** -- customizable powered-by text with logo upload, positioning (under clock, bottom, on slide), and sizing
- **Schedule templates** -- save, load, rename, update, and delete schedule templates; includes a built-in Yeshiva template
- **Schedule icons** -- 16 custom SVG icons for schedule entries and categories (book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle)
- **Countdown system** -- monitors schedule entries and triggers visual countdowns before events (slide overlay or full takeover mode)
- **Image pipeline** -- Sharp-based processing with WebP output, blur placeholders, dominant color extraction
- **Multi-entry Vite build** -- separate bundles for screen and admin SPAs

---

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm

### Installation

```bash
git clone <repo-url> tachtach-screens
cd tachtach-screens
npm install
```

### Initial Setup

Run the setup wizard to create an admin password and configure your location:

```bash
node setup.js
```

You will be prompted for:
1. **Admin password** (min 12 characters, must include uppercase, lowercase, and a digit)
2. **Zip code** (for zmanim lookup)
3. **Chabad.org location ID** (defaults to zip code)

### Development

Start the server and Vite dev server together:

```bash
npm run dev
```

- **Admin panel**: http://localhost:5173/admin (via Vite proxy)
- **Kiosk screen**: http://localhost:5173/screen (via Vite proxy)
- **API server**: http://127.0.0.1:3000

### Production Build

```bash
npm run build
npm start
```

- **Admin panel**: http://localhost:3000/admin
- **Kiosk screen**: http://localhost:3000/screen

---

## Deployment (Raspberry Pi)

The `deploy/` directory contains everything needed to run TachTach-Screens as a kiosk on a Raspberry Pi 5.

### Automated Setup

```bash
# Clone the repo on your Pi
git clone <repo-url> /home/pi/tachtach-screens

# Run the setup script as root
sudo bash /home/pi/tachtach-screens/deploy/pi-setup.sh
```

The script will:
1. Install Node.js LTS
2. Install Chromium and unclutter (cursor hider)
3. Install npm dependencies and build the frontend
4. Run the initial setup wizard (if not already done)
5. Install and enable systemd services (`tachtach-server`, `tachtach-kiosk`)
6. Disable screen blanking and screensaver
7. Start both services

### Systemd Services

| Service | Purpose |
|---|---|
| `tachtach-server` | Node.js Express server on port 3000 |
| `tachtach-kiosk` | Chromium in kiosk mode pointing to `http://127.0.0.1:3000/screen` |

```bash
# Check status
sudo systemctl status tachtach-server
sudo systemctl status tachtach-kiosk

# View logs
journalctl -u tachtach-server -f

# Restart after updates
sudo systemctl restart tachtach-server
sudo systemctl restart tachtach-kiosk
```

### Updating

```bash
cd /home/pi/tachtach-screens
git pull
npm ci && npm run build
sudo systemctl restart tachtach-server
sudo systemctl restart tachtach-kiosk
```

### Hidden Admin Access from Kiosk

Tap the top-left corner of the screen (10x10px area) 5 times within 2 seconds. A password dialog will appear -- enter the admin password to open the admin panel.

### Network Admin Access

If the server is bound to `0.0.0.0` (default), the admin panel is accessible from any device on the local network at `http://<pi-ip>:3000/admin`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Server** | Express 4 |
| **Frontend** | React 18 |
| **Animations** | Framer Motion |
| **Build** | Vite 6 |
| **Image Processing** | Sharp |
| **Scheduling** | node-schedule |
| **XML/RSS Parsing** | fast-xml-parser, Cheerio |
| **Auth** | bcrypt, secure cookies |
| **Data Storage** | JSON files (no database required) |
| **Deployment** | systemd, Chromium kiosk mode |

---

## Admin Guide

See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) for a comprehensive guide covering every admin section, content creation workflows, and troubleshooting.

### Section Overview

| Section | Purpose |
|---|---|
| **Slides** | Add, remove, reorder, and configure display slides |
| **Schedule** | Manage daily schedule entries with categories and countdown alerts |
| **Messages** | Send takeover, banner, or board messages to the screen |
| **Pinned** | Create persistent notes shown on every slide |
| **Custom Days** | Mark special dates (yahrzeits, events) with optional recurrence |
| **Media** | Upload and manage images, GIFs, and videos |
| **Photos** | Connect and sync Google Photos shared albums |
| **RSS Feeds** | Add RSS/Atom feeds as slide content sources |
| **Style** | Choose themes, upload custom fonts |
| **Settings** | Configure location, data sources, scheduler, visibility toggles |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` for localhost only) |
| `TRUST_PROXY` | _(unset)_ | Set to `1` if behind a reverse proxy |

### Data Directory

All data is stored in `data/` at the project root:

```
data/
  auth.json          # Password hash and session info
  settings.json      # Location, theme, scheduler, visibility
  slides.json        # Slide configuration
  messages.json      # Active messages
  pinned.json        # Pinned notes
  custom-days.json   # Special dates
  schedule.json      # Schedule entries and categories
  schedule-templates.json  # Saved schedule templates
  google-albums.json # Connected Google Photos albums
  rss-feeds.json     # RSS feed configurations
  fonts.json         # Uploaded font metadata
  cache.json         # Cached API data (zmanim, limudim, etc.)
  uploads/           # Uploaded media files
  fonts/             # Uploaded font files
  google-photos/     # Cached Google Photos images
  rss-cache/         # Cached RSS feed items
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run `npm run build` to verify the build passes
5. Commit and push your branch
6. Open a Pull Request

Please keep PRs focused on a single feature or fix. Include a description of what changed and why.

---

## License

MIT
