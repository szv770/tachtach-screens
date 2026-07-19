# TachTach-Screens -- Admin Guide

This guide covers everything you need to know to manage your TachTach kiosk display. No technical knowledge required.

---

## Table of Contents

1. [Accessing the Admin Panel](#accessing-the-admin-panel)
2. [Slides](#slides)
3. [Schedule](#schedule)
4. [Messages](#messages)
5. [Pinned Notes](#pinned-notes)
6. [Custom Days](#custom-days)
7. [Media (Images & Videos)](#media)
8. [Google Photos](#google-photos)
9. [RSS Feeds](#rss-feeds)
10. [Style (Themes & Fonts)](#style)
11. [Settings](#settings)
12. [Troubleshooting](#troubleshooting)

---

## Accessing the Admin Panel

### From a Computer or Phone on the Same Network

Open a web browser and go to:

```
http://<your-pi-ip-address>:3000/admin
```

Replace `<your-pi-ip-address>` with the actual IP address of your Raspberry Pi (e.g., `192.168.1.50`).

You will be prompted for the admin password that was set during initial setup.

### From the Kiosk Screen Itself

If you are standing at the TV running the kiosk:

1. Tap the **top-left corner** of the screen (a tiny 10x10 pixel area) **5 times within 2 seconds**
2. A password dialog will appear
3. Enter the admin password
4. The admin panel will open in a new window

### Light and Dark Mode

The admin panel supports both light and dark themes. Click the sun/moon button in the sidebar (desktop) or top bar (mobile) to toggle.

---

## Slides

The Slides section controls what content rotates on the kiosk display. Each slide shows for a configurable number of seconds before advancing to the next.

### Built-in Slide Types

These slides pull content automatically -- you just need to enable them:

- **Zmanim** -- Daily halachic times (sunrise, sunset, candle lighting, etc.) pulled from Chabad.org based on your configured location
- **Limudim** -- Daily Torah study portions: Hayom Yom, Rambam (1 or 3 chapters), Tanya Yomi, Chumash
- **Hayom Yom** -- The daily Hayom Yom entry on its own dedicated slide
- **Pirkei Avos** -- The weekly Pirkei Avos chapter (displayed during the relevant season)
- **Daily Quote** -- A rotating daily quote
- **Parsha Tidbits** -- Insights related to the weekly Torah portion

### Content Slide Types

These slides display content you create or upload:

- **Custom Text** -- Write your own Hebrew and/or English text. Can use styled templates (see below).
- **Image** -- Upload a photo (JPEG, PNG, WebP, GIF). Images are automatically optimized.
- **Video** -- Upload a video (MP4, WebM). Plays inline, advances to next slide when finished.
- **Schedule** -- Shows the daily schedule (configured in the Schedule section).
- **Google Photos** -- Slideshow from a connected Google Photos shared album.
- **RSS Feed** -- Displays items from a connected RSS feed.
- **Pinned** -- Shows all pinned notes in a single slide.

### Managing Slides

- **Add a slide**: Click the "Add Slide" button, choose a type, and configure it
- **Reorder slides**: Drag slides up or down in the list to change their display order
- **Enable/disable**: Toggle the switch next to any slide to show or hide it without deleting
- **Set duration**: Each slide has a duration in seconds (how long it displays before the next slide)
- **Delete**: Remove a slide permanently (uploaded media files are cleaned up automatically)

### Styled Templates

When creating a Custom Text slide, you can apply a visual style. These use the same visual treatments as takeover messages (Grand, Sleek, Torah, etc.) but display as a regular slide in the rotation rather than interrupting the slideshow. This is useful for announcements that should be part of the regular rotation rather than a one-time interruption.

---

## Schedule

The Schedule section lets you define a daily timetable that displays on the Schedule slide.

### Adding Entries

Each schedule entry has:

- **Name** (English and/or Hebrew) -- e.g., "Shacharis" or "שחרית"
- **Time** -- Start time in HH:MM format
- **End Time** (optional) -- If set, shows a time range
- **Category** -- Group entries by type (e.g., "Tefillos", "Shiurim", "Meals")
- **Days** -- Which days of the week this entry applies to
- **Icon** (optional) -- An emoji or symbol shown next to the entry
- **Enabled** -- Toggle on/off without deleting

### Categories

Categories let you color-code and group schedule entries. Each category has:

- **Name** -- Display label
- **Color** -- Used for visual grouping on the schedule slide
- **Icon** (optional) -- Shown next to the category name

### Icons

Each schedule entry and category can have an icon displayed next to it on the kiosk. There are 16 custom SVG icons available:

| Icon | Name | Best For |
|---|---|---|
| Book | Study/Learning | Seder, chavrusa, shiur |
| Prayer | Prayer/Davening | Shacharis, Mincha, Maariv |
| Meal | Meals/Food | Breakfast, lunch, dinner |
| Test | Test/Exam | Bechinos, tests |
| Bed | Bedtime/Rest | Lights out, rest period |
| Bus | Trip/Outing | Field trips, outings |
| Sports | Sports/Activity | Gym, sports, recess |
| Bell | Bell/Reminder | General reminders |
| Megaphone | Announcement | Announcements, assemblies |
| Clock | Wake Up | Morning wake-up |
| Coffee | Break | Coffee break, snack time |
| Music | Music | Music, choir, kumzitz |
| Candle | Candle Lighting | Shabbos/Yom Tov candle lighting |
| Star | Shabbos/Holiday | Shabbos, Yom Tov events |
| Calendar | Event | General events |
| Sparkle | Special | Special occasions |

Icons can be set on individual entries (overrides the category icon) or on categories (applies to all entries in that category). To assign an icon, click the icon picker button when creating or editing an entry or category.

### Countdown Alerts

Schedule entries can trigger countdown overlays on the kiosk:

- **Alert Before** -- Set how many minutes before the event to show a countdown. Options are: None, 1 min, 2 min, 5 min, 10 min, or 15 min.
- **Alert Display** -- Choose how the countdown appears on screen:
  - **Slide** -- Shows as an overlay on top of the current slide. The slideshow continues behind it.
  - **Takeover** -- Takes over the entire screen with a full-screen countdown. The slideshow pauses.

When the countdown triggers, it counts down to the scheduled time. For example, setting "5 min" on Mincha at 1:30 PM means a countdown will appear at 1:25 PM showing "5:00... 4:59... 4:58..." until 1:30 PM.

The "Slide" display mode is less intrusive and good for regular events. The "Takeover" mode is more dramatic and ensures everyone notices -- use it for important events like the start of davening.

### Schedule Templates

You can save the current schedule as a template and load it later. This is helpful for:

- **Weekday vs. Shabbos schedules** -- Save each as a template and switch between them
- **Seasonal changes** -- Save summer and winter schedules
- **Special events** -- Load a custom schedule for a Yom Tov or program

To save a template: configure your schedule entries and categories, then use the "Save as Template" option. To load: select a template from the list and confirm.

---

## Messages

Messages are announcements sent to the kiosk screen. Unlike slides, messages are immediate and can interrupt the slideshow.

### Message Types

#### Takeover

A takeover takes over the entire screen with a dramatic full-screen message. The slideshow pauses while the takeover is active.

**When to use:** Important announcements that everyone needs to see immediately -- a minyan starting, an emergency, a simcha announcement.

Each takeover has:

- **Hebrew text** and/or **English text** -- The main message
- **Subtitle** (optional) -- A secondary line
- **Style** -- Visual treatment (see below)
- **Expiration** (optional) -- Automatically removes the message after a set time

**Takeover Styles:**

| Style | Best For | Visual Effect |
|---|---|---|
| **Classic** | General announcements | Clean, minimal, gold accents |
| **Grand** | Simchas, milestones, special occasions | Elegant gold shimmer with floating sparkle particles |
| **Emergency** | Urgent safety alerts | Red pulsing background with hazard stripes, glowing text |
| **Sleek** | Modern, professional announcements | Dark background with typing cursor animation |
| **Celebration** | Birthdays, engagements, achievements | Rainbow confetti and floating emojis |
| **Notice** | Schedule changes, reminders | Amber border pulse, attention-grabbing but not alarming |
| **Torah** | Shiur announcements, learning events | Floating Hebrew letters, Torah-themed visual treatment |
| **Trip** | Outings, trips, adventures | Adventure-themed visual treatment |
| **Phone** | RSVP requests, call-to-action | Phone/contact themed styling |
| **Memorial** | Yahrzeits, remembrance | Subdued, respectful tones |
| **Hype** | Upcoming events, countdowns, excitement | High-energy, bold styling |

#### Banner

A banner displays scrolling text along the bottom of the screen without interrupting the slideshow.

**When to use:** Ongoing information that should be visible while slides continue -- weather updates, schedule reminders, general notices.

#### Board

Board messages are displayed as a list, like a bulletin board.

**When to use:** Multiple short messages that should be readable together -- daily announcements, schedule changes.

### Sending a Message

1. Go to the **Messages** section
2. Choose the message type (Takeover, Banner, or Board)
3. Enter your text (Hebrew and/or English)
4. For takeovers, select a style
5. Optionally set a subtitle, priority, background color, or expiration
6. Click Send

The message appears on the kiosk screen immediately via real-time sync.

### Removing a Message

Click the delete button next to any active message. It will be removed from the screen instantly.

---

## Pinned Notes

Pinned notes are persistent messages displayed on every slide. They appear as small text in a designated area of the screen and remain visible as slides rotate.

**When to use:** Information that should always be visible -- "Mincha at 1:30", "Building closes at 10pm", "No parking on Tuesday".

Each pinned note has:

- **Hebrew text** and/or **English text**
- **Icon** (optional) -- An emoji shown next to the note
- **Priority** -- Higher priority notes display first
- **Enabled** -- Toggle on/off without deleting

---

## Custom Days

Custom Days let you mark special dates that appear on the kiosk display.

Each custom day has:

- **Title** (English and Hebrew) -- The name of the event
- **Date** -- The specific date
- **Recurring** -- Whether this repeats annually (useful for yahrzeits)
- **Type** -- The kind of event
- **Enabled** -- Toggle on/off

---

## Media

The Media section manages uploaded images, GIFs, and videos used in slides.

### Supported Formats

- **Images**: JPEG, PNG, WebP, GIF (max 50 MB)
- **Videos**: MP4, WebM (max 50 MB)

### Image Processing

When you upload an image, TachTach automatically:

1. Converts it to optimized WebP format for faster loading
2. Creates a blurred placeholder for smooth loading transitions
3. Extracts the dominant color for background matching
4. Records dimensions for proper layout

### Uploading

1. Go to the **Media** section
2. Click "Upload" or drag a file into the upload area
3. The file is processed and added to your media library
4. Create an Image or Video slide and select the uploaded media

### Cleanup

The system automatically cleans up orphaned media files (files not referenced by any slide) during the daily cleanup cycle. You can also trigger a manual cleanup from the Settings section.

---

## Google Photos

Connect shared Google Photos albums to display photo slideshows on the kiosk.

### Connecting an Album

1. In Google Photos, open the album you want to display
2. Click **Share** and make sure link sharing is enabled
3. Copy the share link (it looks like `https://photos.google.com/share/...` or `https://photos.app.goo.gl/...`)
4. In the TachTach admin, go to **Photos**
5. Paste the album URL and click "Add Album"
6. The system will begin syncing photos in the background

### Album Settings

Each connected album has these options:

- **Display Mode** -- How photos are shown (fill, fit, etc.)
- **Photo Interval** -- How long each photo displays before advancing
- **Photo Order** -- Sequential or random
- **Ken Burns Effect** -- Enables a gentle pan-and-zoom animation on photos
- **Image Display Mode** -- How images are scaled and cropped
- **Refresh Interval** -- How often the system checks for new photos

### Creating a Google Photos Slide

After connecting an album:

1. Go to the **Slides** section
2. Add a new slide of type "Google Photos"
3. Select the connected album
4. Configure display options (interval, order, Ken Burns)

### How Syncing Works

- Photos are downloaded and cached locally on the Pi
- The system periodically checks the album for new photos
- You can trigger a manual sync from the Photos section
- Cached photos are served locally for fast display

### Important Notes

- The Google Photos album must be **shared** (link sharing enabled)
- No Google account login is required -- it scrapes the public shared album page
- Very large albums may take time to sync initially

---

## RSS Feeds

Display content from any RSS or Atom feed on the kiosk.

### Adding a Feed

1. Go to **RSS Feeds**
2. Enter the feed URL
3. Click "Preview" to verify the feed loads correctly
4. Give the feed a name
5. Configure field mapping (which feed fields map to primary text, secondary text, body, and attribution)
6. Set a refresh interval (hourly, every 6 hours, or daily)
7. Save the feed

### Field Mapping

RSS feeds have various fields (title, description, author, publication date, etc.). The mapping lets you choose which fields display where on the slide:

- **Primary** -- The main large text (usually the title)
- **Secondary** -- A secondary line (usually the author or date)
- **Body** -- The main content area (usually the description or summary)
- **Attribution** -- Small credit text (usually the source or author)

### Creating an RSS Slide

After adding a feed:

1. Go to the **Slides** section
2. Add a new slide of type "RSS"
3. Select the feed
4. Choose a display mode
5. The slide will cycle through feed items

### Refresh Intervals

| Interval | Frequency |
|---|---|
| **Hourly** | New content checked every hour |
| **Every 6 hours** | Good for most news/content feeds |
| **Daily** | Best for feeds that update infrequently |

---

## Style

The Style section controls the visual appearance of the kiosk display.

### Themes

Choose from 8 built-in themes:

- **Dark** -- Warm parchment on dark mahogany (default, great for most shuls)
- **Dark HC** -- High-contrast version of Dark for better readability at a distance
- **Midnight** -- Cool blue tones, modern feel
- **Sepia** -- Warm brownish tones, easy on the eyes
- **Parchment** -- Light theme with classic parchment/paper feel
- **Clean White** -- Minimal white with blue-gray accents, very modern
- **Ivory** -- Warm cream with gold accents
- **Sky** -- Light blue-white with teal accents, fresh and clean

### Custom Fonts

Upload custom fonts to personalize the display:

1. Go to **Style**
2. Click "Upload Font"
3. Select a font file (TTF, WOFF, or WOFF2, max 5 MB)
4. The font will be available for selection as the Hebrew or English display font

Uploaded fonts apply to all slides on the kiosk display.

---

## Settings

### Location

- **Zip Code** -- Used for zmanim (halachic times) lookup
- **Location ID** -- Chabad.org location ID for accurate zmanim data
- **Timezone** -- Ensures times display correctly

### Data Sources

Toggle which daily content sources are active:

- **Zmanim** -- Halachic times
- **Hayom Yom** -- Daily Hayom Yom
- **Limudim** -- Daily learning portions
- **Rambam (1 chapter)** -- Daily Rambam one-chapter cycle
- **Rambam (3 chapters)** -- Daily Rambam three-chapter cycle
- **Tanya Yomi** -- Daily Tanya portion

### Scheduler

The data refresh scheduler has two tracks:

- **Track A** -- Automatic refresh at halachic midnight (default, always recommended)
- **Track B** -- Additional refresh at a specific time you set (e.g., 4:00 AM as a backup)

### Visibility

Toggle what appears on the kiosk display:

- **Clock** -- Show/hide the blinking clock
- **Hebrew Date** -- Show/hide the Hebrew date
- **Parsha** -- Show/hide the weekly parsha name
- **Omer** -- Show/hide Sefirat HaOmer count (during the relevant season)
- **Pinned Notes** -- Show/hide the pinned notes area

### Manual Actions

- **Refresh Data** -- Force an immediate data refresh from all sources
- **Cleanup Storage** -- Remove orphaned files and expired data
- **Screen Controls** -- Pause, resume, blank, or advance the kiosk display remotely

---

## Troubleshooting

### The screen is blank or shows an error

1. Check that the server is running: `sudo systemctl status tachtach-server`
2. Check for errors in the logs: `journalctl -u tachtach-server -f`
3. Try restarting the server: `sudo systemctl restart tachtach-server`
4. Try restarting the kiosk: `sudo systemctl restart tachtach-kiosk`

### Zmanim are not showing or are wrong

1. Go to **Settings** and verify the zip code and location ID are correct
2. Click **Refresh Data** to force a new fetch
3. Check the server logs for API errors

### Changes in admin are not appearing on screen

TachTach uses real-time SSE (Server-Sent Events) to push changes instantly. If changes are not appearing:

1. The SSE connection may have dropped -- the kiosk auto-reconnects, but try refreshing the kiosk browser
2. Check that the server is running
3. Restart the kiosk service if needed

### Google Photos are not loading

1. Make sure the album is **shared** with link sharing enabled
2. Try clicking "Sync" next to the album in the Photos section
3. Check the server logs for sync errors
4. Very large albums may take several minutes to sync initially

### Uploaded images are not displaying

1. Check that the image is in a supported format (JPEG, PNG, WebP, GIF)
2. Files over 50 MB are rejected -- try a smaller file
3. The image processing pipeline requires Sharp -- check server logs for processing errors

### I forgot the admin password (or lost my 2FA device)

You will need SSH access to the Raspberry Pi. **Do not run `node setup.js` for
this** — it wipes your slides/settings/messages along with the credentials.
Instead use the dedicated, targeted reset script:

```bash
cd ~/tachtach-screens
npm run reset-admin
```

This opens a menu to reset the password only, TOTP/2FA only (if you lost your
authenticator device), or both — touching nothing else in `data/`. See
[`docs/FULL_SETUP_GUIDE.md`](FULL_SETUP_GUIDE.md#8-if-you-ever-forget-the-admin-password-or-lose-your-2fa-device)
for full details. (Replace `~` with your actual home directory if it's not
picked up automatically over SSH.)

### The kiosk screen shows "Run npm run build first"

The frontend has not been built. Run:

```bash
cd ~/tachtach-screens
npm run build
sudo systemctl restart tachtach-server
```

### The countdown timer is not triggering

1. Make sure the schedule entry has an "Alert Before" value set (e.g., 5 minutes)
2. Check that the entry is enabled
3. The countdown only triggers on the days specified for that entry
4. Countdowns reset at midnight -- they will trigger again the next applicable day

### How do I access admin from outside the local network?

By default, the admin panel is only accessible from devices on the same local network as the Pi. For remote access, you would need to set up a VPN, reverse proxy, or SSH tunnel. Direct exposure to the internet is not recommended without additional security measures.
