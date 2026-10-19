# TachTach-Screens -- Admin Guide

This guide covers everything you need to know to manage your TachTach kiosk display. No technical knowledge required.

---

## Table of Contents

1. [Accessing the Admin Panel](#accessing-the-admin-panel)
2. [Slides](#slides)
3. [Schedule](#schedule)
4. [Announcements](#announcements) (slides, banners, side notes, takeovers)
5. [Custom Days](#custom-days)
6. [Media (Images & Videos)](#media)
7. [Google Photos](#google-photos)
8. [RSS Feeds](#rss-feeds)
9. [Style (Themes & Fonts)](#style)
10. [Settings](#settings)
11. [Team & Logins](#team--logins)
12. [Updating the screen software](#updating-the-screen-software-admins-only)
13. [Troubleshooting](#troubleshooting)

---

## Accessing the Admin Panel

### From a Computer or Phone on the Same Network

Open a web browser and go to:

```
http://<your-pi-ip-address>:3000/admin
```

Replace `<your-pi-ip-address>` with the actual IP address of your Raspberry Pi (e.g., `192.168.1.50`).

You will be prompted to sign in. The first person (set up by `node setup.js`) is the admin, username `admin`; once more people exist, the sign-in page also asks for a username. See [Team & Logins](#team--logins).

### From the Kiosk Screen Itself

If you are standing at the TV running the kiosk:

1. Tap the **top-left corner** of the screen (a tiny 10x10 pixel area) **5 times within 2 seconds**
2. The sign-in page opens in a new window
3. Sign in as usual (username and password, plus your 2-step code if you use one)
4. You land in the admin panel

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

- **Message** -- Your own text (big words, an event card, a list, a quick time, or a classic styled card). Made in the Announcements composer -- see [Announcements](#announcements).
- **Image** -- Upload a photo (JPEG, PNG, WebP, GIF). Images are automatically optimized.
- **Video** -- Upload a video (MP4, WebM). Plays inline, advances to next slide when finished.
- **Schedule** -- Shows the daily schedule (configured in the Schedule section).
- **Google Photos** -- Slideshow from a connected Google Photos shared album.
- **RSS Feed** -- Displays items from a connected RSS feed.

### Managing Slides

- **Add a slide**: Tap **+ New Slide** and pick **Message** (opens the Announcements composer with *Show as: Slide* chosen), **Image or video**, **Google Photos album** or **RSS feed**
- **Reorder slides**: Drag slides up or down in the list to change their display order
- **Enable/disable**: Toggle the switch next to any slide to show or hide it without deleting
- **Set duration**: Each slide has a duration in seconds (how long it displays before the next slide)
- **Delete**: Remove a slide permanently (uploaded media files are cleaned up automatically)

### Styled Templates

Message slides can use any of the 26 looks (Grand, Sleek, Torah, Trip, Chanukah, ...) while staying a normal slide in the rotation. Pick the style in the composer's **Look** section. Message rows in the Slides list show the message text and an **Edit** button; their switch pauses or resumes the message. Messages posted from Announcements that are not in this list play after the listed slides (they are shown at the bottom of the list).

---

## Schedule

The Schedule section has three tabs:

- **By date** -- give any calendar date its own schedule (Shabbos, Yom Tov, trips, short days). Works well from a phone.
- **Paste / Import** -- paste a schedule that Claude wrote for you (or upload a .txt/.md/.json file) and apply several dates at once.
- **Weekly** -- the regular week. It is used on every date that doesn't have its own schedule.

The rule is simple: if a date has its own schedule, the screen shows that (even if it's empty); otherwise it shows the weekly entries for that day of the week. The schedule slide, the "starting in N min" box in the sidebar and the countdown alerts all follow the same rule.

### Schedule by date

1. Open **Schedule → By date** and tap a day in the week strip (this week and the next five). A gold dot means the date already has its own schedule. Use **Other date** for anything further out.
2. If the day has no schedule of its own yet, pick where to start: **Weekly schedule** (copy that day's weekly items), **Saved block** (e.g. "Regular Shabbos"), **Copy another date** (e.g. last Shabbos) or **Blank day**.
3. Edit right in the rows:
   - Tap the **time** and type it -- `7:05 pm`, `19:05` and `7pm` all work. The second box is an optional end time.
   - Tap the **name** fields to type the English and Hebrew names.
   - Tap the **category chip** to change it; **+ New category** creates one on the spot.
   - Choose an **alert** (countdown before the item) and tick **Full screen** for a takeover; pick an **icon**; tick **Hide** to keep an item without showing it.
   - **+ Add row** adds an item 30 minutes after the last one. ⧉ duplicates a row; ✕ deletes it (tap **Undo** if that was a mistake).
4. Tap **Save day**. Nothing changes on the screen until you save; **Discard** throws your edits away.

Other buttons on the day:

- **Text** -- edit the whole day as lines of text (same format as Paste / Import), then **Use this text**.
- **Save day as block…** -- keep this day as a reusable block ("Shabbos Mevarchim"). Saved blocks are listed at the bottom; **Apply to …** puts one on the selected date in one tap.
- **Revert to weekly** -- remove this date's own schedule.
- **Copy as text** -- copies the day in the text format (handy to give to Claude: "same as this but Mincha at 5:30").
- **Preview ↗** -- opens the screen as it will look on that date.

### Using Claude to make the Shabbos schedule

You don't need to remember any format -- the admin teaches Claude:

1. Go to **Schedule → Paste / Import**. Choose **This Shabbos**, **Next Shabbos** or the **Picked date**. Under the buttons you'll see the zmanim it found (candle lighting, shkia, Shabbos ends).
2. Tap **Copy Claude prompt for…** and choose **A day / Shabbos schedule** (or **A weekly schedule**, see below). It copies the rules, the dates, your categories, the icon list and that weekend's zmanim.
3. Open Claude chat, paste, and add what's happening, for example: *"Shacharis 9:30, kiddush after davening, Mincha 5:45, guest speaker at shalosh seudos, Rabbi Cohen gives the shiur Friday night at 9."*
4. Copy Claude's answer (the code block) and paste it into the big box. Tap **Check & preview**.
5. You'll see one card per date: the weekday, whether it **replaces** an existing schedule or is **new**, every item with its time, category and alert, and any problems with their **line number**. **Apply** stays grey while there are errors -- fix the line in the box (or paste the error back to Claude), then check again.
6. Tap **Apply**. Every date is saved together or not at all, and the screen updates right away. Use **Edit day** to tweak one item, or **Preview ↗** to see it.

Tips:

- **Copy format guide for a Claude Project** copies just the rules (no dates). Paste it once into a Claude Project's instructions; after that "make this Shabbos: …" in that project is enough.
- **Copy these dates as text** hands Claude the current schedule as a starting point.
- If a zman can't be found, the prompt contains a clearly marked `[… NOT AVAILABLE — please fill in]` instead of a guess.
- You can also upload a `.txt`, `.md` or `.json` file instead of pasting. (Excel files aren't supported yet.)
- The full format is in `docs/SCHEDULE_FORMAT.md`. In short, one line per item: `6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle`, and `@ 2026-10-24 clear` puts a date back on the weekly schedule.

### Making a whole weekly schedule at once

Schedule → **Weekly** starts with the **Active weekly schedule** panel:

- **Paste weekly schedule** -- choose **Copy Claude prompt for… → A weekly schedule**, tell Claude your regular week, paste the answer, **Check & preview**, **Apply**. The preview says "Replaces N weekly items". Applying **replaces the whole weekly schedule**; the old one is saved first as a template called "Auto-backup <date>", so you can switch back.
- **Copy as text** -- the current week in the same text format (give it to Claude to change).
- **Save as weekly template** / **Switch to a saved week** -- name and keep several weeks (summer, regular, Chol Hamoed) and swap between them.
- Dates with their own schedule (By date) always win over the weekly one.
- Each category (Categories box below) has a **default alert**: Davening, Shiur and Seder start at 5 minutes, Meals none. Pasted lines with no `alert` get it; `alert 0` turns it off. The English name of an item is optional.

### Weather

Settings → **Weather (מזג האוויר)**: show the temperature in the rail, °F/°C, which zip it uses (set in Location), a switch to put the full **Weather page** in the rotation, and **Test weather now** to see exactly what was fetched (or why it failed).

### Weekly schedule: adding entries

Each schedule entry has:

- **Name** (English and/or Hebrew) -- e.g., "Shacharis" or "שחרית"
- **Time** -- Start time; type it (`2:10 pm` or `14:10`)
- **End Time** (optional) -- If set, shows a time range
- **Category** -- Group entries by type (e.g., "Tefillos", "Shiurim", "Meals")
- **Days** -- Which days of the week this entry applies to
- **Icon** (optional) -- An emoji or symbol shown next to the entry
- **Enabled** -- Toggle on/off without deleting

### Categories

Categories let you color-code and group schedule entries. The starting set is Davening, Shiur, Seder, Meals, Mivtzoim, Farbrengen, Events, Trips and Breaks (any you already had are kept). You can add one from any category picker with **+ New category**, or manage them in the Weekly tab. Each category has:

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

- **Weekday vs. Shabbos schedules** -- Prefer **Schedule by date** and saved blocks for Shabbos now; weekly templates replace the whole weekly schedule
- **Seasonal changes** -- Save summer and winter schedules
- **Special events** -- Load a custom schedule for a Yom Tov or program

To save a template: configure your schedule entries and categories, then use the "Save as Template" option. To load: select a template from the list and confirm.

---

## Announcements

Everything you post to the screen lives here: one list, one composer. (This replaces the old Messages tab and Pinned Notes. Your existing messages, pinned notes and custom text slides were moved here automatically and look exactly the same.)

### The lists

At the top are five tabs, each with a count:

- **Drafts** -- saved but never shown. Tap **Edit / Post** to finish and post one.
- **Live** -- on the screen right now (soonest to end first).
- **Scheduled** -- will show later (a start time in the future, or a repeat that isn't active right now).
- **Paused** -- you paused it; it keeps its settings. Tap **Resume**.
- **Archived** -- its end time has passed. Archived items are **deleted automatically** after 30 days (change the number at the bottom of the Archived tab).

Each row shows a small preview, how it shows (Slide / Banner / Side note / Takeover, plus layout and style) and its timing ("Until 9:00 PM", "Mon–Thu 7:00–9:30 AM"). Actions:

- **Edit** -- change anything: text, look, timing. The screen updates in place.
- **Pause / Resume**
- **Again…** -- put it back on the screen from now: same length as last time, 15 minutes, 1 hour, until end of day, until end of Shabbos, until you remove it, or until a date and time you pick. Works for archived items too.
- **Duplicate** -- makes a copy as a draft and opens it.
- **Delete** -- asks first; an **Undo** button appears for a few seconds afterwards.

**Banner display settings** (text size, scroll speed, loop or wait) for all banners are at the bottom of the tab.

### Posting something

Tap **+ New announcement** (or **+ New Slide → Message** in Slides). On a phone the composer fills the screen; on a computer it opens as a wide panel with the preview on the right.

1. **Show as**
   - **Slide** -- takes its turn in the slideshow with the other slides.
   - **Banner** -- scrolls along the bottom. Never stops the slideshow. Line breaks show as " · ".
   - **Side note** -- a small note in the side column (up to 3 show at once; more take turns).
   - **Takeover** -- covers the whole screen and pauses everything.
2. **Layout** (Slides and Takeovers):
   - **Big words** -- a short message, sized as big as fits. A few words become huge; longer text shrinks to fit. Optional small line on top and a second line underneath.
   - **Event** -- a title, the day and time in "tiles", and a place (with an optional second place line and Hebrew).
   - **List** -- a heading and up to 8 short items, each with an optional Hebrew line, day and time (6 or fewer fit comfortably).
   - **Quick time** -- e.g. "Mincha 1:45": the time is the big part, the name and place are smaller. **More options** adds a second time with labels (candle lighting + havdalah), the old time ("was 1:45 PM"), a word before the time ("by 9:00") or a big countdown number ("3 days to go").
   - **Quote** -- a short saying set large (Hebrew and/or English) with its source, e.g. "Tanya, chapter 12".
   - **Sicha** -- an excerpt (title, text, source line) at a readable size that never shrinks. Text that does not fit splits into pages (1/3, 2/3...) that step every 12 seconds; a slide stays on screen long enough for all of them.
   - **Letter** -- a letter with a Hebrew and/or English date, greeting, body, signature and source. Long letters page the same way. Hebrew text sets right-to-left automatically.
   - **Classic** -- the original templates (Headline, Quote, Info, Announcement) and styled cards.
3. **Text** -- English and/or Hebrew (Hebrew boxes type right-to-left). Enter makes a new line on the screen. Times can be typed as "9:30 pm", "21:30" or "930p".
4. **Look**
   - **Style** -- 26 styles in five groups; tap a group, then a picture. Each picture is a live miniature of *your* text in that style. **Everyday**: Classic, Grand, Sleek, Quiet, Trip, Mivtzoim, Hype. **Alerts**: Emergency, Important, Time change, Phones away. **Moments**: Celebration, Simcha, Siyum, Torah, Memorial, Welcome, Farbrengen. **Shabbos & Yom Tov**: Shabbos, Yom Tov. **Seasonal**: Chanukah, Purim, Pesach, Rosh Chodesh, Lag BaOmer, Chassidic. **Theme** means no special style (drawn like Classic). Any layout can use any style; older announcements keep the style they had. Styles follow the screen's theme (dark or light) and your font choices.
   - **Animation** -- **Full** (an entrance, then gentle looping motion such as flames, confetti or ripples), **Entrance only**, or **Off** (completely still). The screen's own Motion setting still applies: *Minimal* plays the entrance only, *Lively* adds word-by-word reveals. Quiet never loops. Everything stops if the screen's computer asks for reduced motion.
   - **Text size** (Classic cards and side notes): Auto fits the space, Fixed keeps the original sizes. **Full screen** hides the side column. **Seconds on screen** for slides.
   - Text grows to fill the space, and the composer shows a soft hint (for example "52/45 - long, it will show smaller") when a line is longer than the style looks best with. It never stops you from posting.
5. **While this is showing** (Slides): **Keep rotating other slides** (it takes its turn) or **Pause everything else** (it stays on screen until it ends, then the slideshow continues where it left off).
6. **When**
   - **Start**: now, or at a date and time.
   - **End**: until you remove it, 15 min / 1 hour / 2 hours / end of day, **Until end of Shabbos** (shows the actual time, e.g. "Shabbos 7:36 PM", taken from the zmanim for your location; greyed out if zmanim aren't available), or at a date and time.
   - **Repeat** (optional): days of the week (Sun…Shabbos), days of the month (e.g. 1, 15), one or more time windows (a window can cross midnight, e.g. 10:00 PM–2:00 AM), and an optional from/until date.
7. **Preview** -- the real screen, at the real shape, updates as you type.
8. **Save draft**, **Post**, or **Save changes** when editing.

### When two takeovers overlap

Only one takeover can cover the screen. If you post a takeover while another one is live or scheduled at the same time, you are asked:

- **Replace** -- the new one shows now; the other is paused (not deleted).
- **Share** -- both take turns full screen, switching every 10 seconds.
- **Queue after** -- the new one starts when the other ends (only offered when the other has an end time).
- **Cancel** -- go back to editing.

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
- **Pinned Notes** -- Show/hide the side notes area (Announcements shown as "Side note")

### Manual Actions

- **Refresh Data** -- Force an immediate data refresh from all sources
- **Cleanup Storage** -- Remove orphaned files and expired data
- **Screen Controls** -- Pause, resume, blank, or advance the kiosk display remotely

---

## Team & Logins

Everyone who edits the screens gets their own login, so you can see who posted what and take someone's access away without changing anyone else's.

**Two roles**

| | Admin | Editor |
|---|---|---|
| Post announcements, edit slides, schedule, Daily Word, custom days, media, feeds, screen controls | ✓ | ✓ |
| Change Settings and Style | ✓ | – |
| Add / remove people, see the activity list | ✓ | – |
| 2-step code (authenticator app) | required | optional (their own choice) |

**Adding someone** (admins only): open **Team → Add person**, type their name and pick a role. You get a one-time **invite link** (good for 7 days) — copy it or share it on WhatsApp. They open it, choose a password, and they're in. Editors can instead skip the password and just use sign-in links.

**Someone forgot their password:** on **Team**, open their menu → **Sign-in link**. It works once and lasts an hour; send it to them. (An invite link works too and lets them pick a new password.)

**Lost phone / authenticator:** Team → their menu → **Reset 2-step**. Admins are walked through setting it up again on their next sign-in.

**Someone leaves:** Team → **Remove**. They're signed out immediately. **Sign out everywhere** does the same without removing them.

**My account** (everyone): change your name and password, turn 2-step on or off (editors), sign out other devices, and forget trusted devices.

**Activity** (Team → Activity): a plain list of who changed what and when. Announcements also show "Posted by …".

If the last admin is locked out, use the command line on the Pi: `npm run reset-admin -- --list` shows everyone, `npm run reset-admin -- --user <username> --reset-password` fixes a password.

---

## Updating the screen software (admins only)

**Home -> System health -> Software update.** It shows the version running on the Pi and whether a newer one is waiting.

1. Press **Check for updates** to look now.
2. Press **Update now**. A window lists what is coming. Type your password again and, because admins always use 2-step, the current 6-digit code from your authenticator app, then press the big button.
3. The Pi downloads the new version, rebuilds and restarts. **The screen goes blank for about a minute.** A bar at the top of every admin page and the card show it is running; the page keeps trying to reach the Pi by itself.
4. When it is done you see **Updated to <version>** and the list of what changed, and your phone gets a "Software updated" alert if alerts are on.

If the new version does not start, the Pi puts the old one back by itself and says so ("Update failed - rolled back"). **Roll back to previous version** (same password check) undoes the last update by hand. Your messages, schedule and photos are never touched.

You can only ask for one update every 5 minutes, and only admins see this card. If the card says **Not set up on this Pi yet**, run `bash ~/tachtach-screens/deploy/update.sh` once on the Pi (the setup guide has the command); after that the button works.

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

This opens a menu to reset the password only, 2-step only (if you lost your
authenticator device), or both — touching nothing else in `data/`. With several
people, add `--user <username>` (see them with `npm run reset-admin -- --list`). See
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
