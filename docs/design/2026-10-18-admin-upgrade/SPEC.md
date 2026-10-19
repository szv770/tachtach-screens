# Admin upgrade — interview decisions (owner, 2026-10-18)

Goal: the admin (`/admin`, `src/admin/`) feels premium, sleek and easy for admins AND editors. Mobile = least on screen, one thing at a time, step by step. Desktop = lots of options visible. Kiosk-screen items are a separate track (see bottom).

## Navigation & structure
- **5 areas**: Home · Screen (slides, media, photos, feeds, web pages, daily word) · Schedule (weekly base, by date, custom days) · Announce (messages, quick messages, banners, takeovers, letters) · Look & Settings (themes, fonts, layout, location, weather, team, security).
- **Mobile**: bottom tab bar + central "+" FAB (quick message / new anything) + a **Home** of big tiles (as much as possible, well worded). Each page shows only what's relevant, with back arrow and step-by-step flows. iOS-style sheets.
- **Desktop**: grouped left sidebar, sub-pages expandable, live preview right.
- **Global search** (top bar, every page): settings & features (jump + highlight the exact setting), on-screen content (announcements, slides, schedule entries, daily words, custom days — edit/pause from results), quick actions ("new announcement", "blank screen", "invite someone"), Help articles.
- Help = a help icon. "My account" = tap your name/role chip. Team = a sub-section of Settings.
- **Collapsibles default CLOSED**, each with a one-line summary of current value; remember what was opened is optional.
- **Saving**: toggles instant + Undo toast; multi-field forms use a floating "Unsaved changes — Save / Revert" bar (leave-page guard).
- **Look**: FRESH new look (owner wants new, not just polish). **Follows the phone's light/dark** setting (+ manual switch). Present 2 directions before building.

## Screen area
- **New slide** = 2-step: (1) grid of visual cards by TYPE (Media, Text/Announcement, Built-in pages...), (2) only that type's fields. System-wide rule: group by *type*, put variants as sub-tabs inside (Media: image, video, PDF, Google Photos album, web page, RSS feed).
- **Media page** tabs: Library · Photo albums · Web pages · News feeds. Library shows **recommended size** read from the real screen (kiosk reports resolution/orientation to server; fallback 1920×1080 / 1080×1920).
- **Slide pencil popups** for each slide's own options (Limudim heb/eng/both + which studies, Hayom Yom, Zmanim, Weather, Photos, RSS, Web page). Heavy ones (Schedule) link to their own page instead of a popup. Remove "weather in rotation" from Settings (it's the slide toggle).
- Daily Word "Coming up" rows get a pencil/edit button.

## Schedule
- First view for a new person = guided **"Build my year schedule" wizard** (pick days Sun–Thu / Fri / Shabbos → add blocks with fixed clock times → save as base). Paste-from-AI is one choice. After that: simple week view; "Rebuild with wizard" button. Times mostly fixed clock times.
- **Seder attention (3 stages, each configurable per seder or category)**: before = big "Get moving — Seder in 7:42" countdown; at start = "Seder just started" for a few minutes; after = "Now in session: Night Seder" badge until it ends. (Seder ≠ meal.)
- Up-next card gets a countdown option. Schedule-change helpers: "update class/seder time", "test on <day> at <time>".

## Announce
- **Quick messages** = saved **templates with blanks**, one tap. Starters: "<Bochur> come to the Menahel", "<Bochur> come to Rabbi Schurder's office", "<Bochur> please call home", "<Bochur> please call <person>", "<Bochur>, <person> is looking for you", "<Bochur> needed at <place>", "<Seder/Class> moved to <time>", "Test on <day> at <time>", "<Place> out of order — please don't use". **Templates can be per user** (Rabbi Schurder's list ≠ the person who mostly sends "call home"); shared templates too. Must look great on screen in dark and light.
- **Banner**: admin picks per banner Still or Scrolling (continuous right→left ticker, transform-only; allowed exception, document it) + speed.
- **Letters**: (a) Copy AI prompt → paste JSON back → preview all pages; (b) paste whole letter and the system splits it (letter or sicha look); (c) saved letters library to re-post.
- Sicha layout: short text = big, long text = shrinks (screen-side).

## Look & Settings
- **Themes move into Style > Themes**. Auto OFF: pick ONE theme. Auto ON: prompt for one dark + one light theme (+ zmanim switch times). No second chooser.
- **Location**: add "Show location as" custom name (blank = automatic from source), used everywhere the city shows.
- Side-rail location moves under Layout. Settings broken into small sorted pages with "jump to exactly that setting" via search.
- Popup instead of scrolling to Save.

## People / roles
- Default editors can do a lot; admin limits via **presets + per-person tweaks** (e.g. Full editor / Messages only / View only, then checklist: post announcements, takeovers, edit schedule, change slides, delete, media upload, change look...). Think of sensible default blocks (look/fonts/security/team off by default).
- Roles live in `src/shared/permissions.js` (fail-closed allow-list) — extend, don't loosen.

## Extras (all wanted)
- **Freeze/Blank screen**: modes = Blank black · TachTach logo only · Freeze on current slide · very simple message (optional **terminal-style/nerdy** look) · timed ("30 min / until tomorrow / until I turn on") · scheduled off-hours. Big always-visible Resume.
- **Home dashboard** "on the screen now": current slide, active announcements/banner, next schedule item, last refresh, online/offline.
- **Undo / history** (activity log exists: `data/activity.json`).
- **Change tomorrow / one day** from Home.
- **Health check** page (screen online, zmanim fresh, fetch errors, disk, fix buttons). Phone alerts already exist (`push.js`).

## SaaS-readiness (owner wants to scale this to many yeshivos)
Not building SaaS now, but every new admin/data decision must not block "add another yeshiva's own separate screen setup without a huge job":
- Admin code talks to the server only through a thin API layer (no URL/paths scattered); no hard-coded school names, locations, categories, or Rubik-specific assumptions in UI copy; all school-specific content comes from settings/data.
- Treat "a screen" as an entity: settings, slides, schedule, announcements, templates, team belong to a *screen/site*; design nav so a **site switcher** (top of sidebar / mobile header) can be added later without restructuring. Don't invent multi-tenancy yet — just avoid hard-wiring single-site assumptions (e.g. keep per-site data behind store modules, ids not names).
- New data (quick-message templates, permission presets, saved letters) lives in its own JSON file behind a store module (like `scheduleStore.js`), so it can move to the DB later.
- Roles/permissions expressed as data (presets + overrides), not scattered `if (role === ...)`.
- Onboarding: the Build-my-schedule wizard and a first-run setup checklist double as "set up a new yeshiva" flow.
- Keep Mivtzah SaaS (`saas-admin/`, `saas-server/`) untouched in this pass.

## Kiosk-screen track (separate, not admin)
Banner scrolling (admin chooses), sicha auto-size, quick-time sizing + countdown, up-next countdown, seder 3-stage display, letter layout, **uploaded logo not showing (bug, investigate first)**, freeze/blank + terminal message display, quick-message looks in dark/light.

## Build phases (owner approves each)
0 design system + mockups → 1 shell/nav/search/save bar → 2 Look & Settings + roles → 3 Screen/Media/popups → 4 Schedule wizard → 5 Announce/quick messages/letters → 6 extras → parallel kiosk track.

## Phase 0 outcome (owner, 2026-10-19)
- **Direction A "Seal" chosen, fully** (mockups/direction-a.html, DESIGN-NOTES.md). Tab bar: Home · Screen · + · Schedule · Announce; **Look & Settings behind the header gear** (also a Home tile). Adopt from B only: small area-colour markers (sidebar group headings, Home tiles) and the sideways "kinds" row at the top of the "+" sheet.
- Live preview under 1280px wide = slide-over panel opened from a button. **Also an "Open live preview in a new tab" button** (`/screen?preview=true`) on desktop and mobile.
- Fonts bundled via @fontsource (Fraunces, Manrope, Rubik already in package.json), not Google Fonts.
