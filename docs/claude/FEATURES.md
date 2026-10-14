# Feature → file map

Read `CLAUDE.md` first. Use this to jump straight to the component behind a slide type, message type, or admin section instead of grepping.

## Kiosk screen (`src/screen/`)

`App.jsx` resolves the active theme (manual, or zmanim day/night via `src/shared/dayNight.js`), wraps everything in `design/DesignRoot.jsx` (theme + font-role CSS variables, motion/graphics context) inside `ScreenScaler.jsx` (uniform scale of the 1600x900 / 900x1600 canvas), and renders `Layout.jsx` = `components/Rail.jsx` (clock, dates, parsha, weather, up-next card, side notes; or a top band in portrait) + one rounded page panel (`SlideCarousel.jsx`) + a 76 px `messages/Banner.jsx` row only when a banner is active. Also `AnnouncementTakeover` (full canvas, pauses rotation), `CountdownOverlay.jsx`, `HiddenAccess.jsx` (5 taps top-left).

Design system (`src/screen/design/`): `DesignRoot.jsx` (roles + context), `globalCss.js` (@property registrations, derived roles, motion keyframes), `ui.jsx` (Panel, PageTitle, TimeText, `he()`), `fit.jsx` (auto-fit text), `Paged.jsx` (fixed-size paginated text), `graphics.jsx` (weather icons, candles, ornaments, progress ring, per-theme background art + day-phase tint), `announceStyles.js` (the 11 styles as role overrides = **the seam for new takeover/announcement styles**), `fonts.js` (bundled Rubik/Manrope/Frank Ruhl/EB Garamond + uploaded `@font-face`).

Hooks: `useSSE.js`, `useSlideRotation.js` (timer only), `useAnnouncements.js`, `useClock.js`. `src/screen/lib/announcementView.js` maps announcement items to rotation slides / banner / note rows.

### Slide types (`src/screen/components/slides/`)

| Slide type | Component | Notes |
|---|---|---|
| Zmanim | `ZmanimSlide.jsx` | `settings.zmanimLayout`: `board` (default clean board, next row filled, "in 16 min") / `board-arc` / `arc-tiles`; tomorrow's zmanim after the last one |
| Limudim | `LimudimSlide.jsx` | Ruled board of Chumash / Tehillim / Tanya / Rambam / Sefer HaMitzvos; honors `limudimLang`, `limudimItems` |
| Weather | `WeatherSlide.jsx` | Built-in `WEATHER` type (off by default, added at startup by `builtin-slides.js`); data `cache.weather` |
| Hayom Yom (standalone) | `HayomYomSlide.jsx` | Fixed-size Torah-text reading look, paginated, duration grows with pages |
| Pirkei Avos | `PirkeiAvosSlide.jsx` | Seasonal — visibility computed in `src/shared/pirkeiAvos.js` (Pesach→Rosh Hashana window only) |
| Daily Quote | `DailyQuoteSlide.jsx` | |
| Parsha Tidbits | `ParshaTidbitsSlide.jsx` | |
| Schedule | `ScheduleSlide.jsx` | `settings.scheduleLayout` `timeline` (Now\|Next spotlight, day ribbon, later strip) or `list`. Shows the schedule `App.jsx` resolved for today / `?previewDate=` via `getEffectiveSchedule` (`src/shared/scheduleResolution.js`): the date's own schedule from `schedule-dates.json`, else enabled weekly `schedule.json` entries for that weekday. Shows the date's label under the title. Icons from `src/shared/ScheduleIcons.jsx` (16 SVGs) |
| Google Photos | `GooglePhotosSlide.jsx` | Fetches via localhost-only `/api/google-album/:id/photos` |
| RSS Feed | `RSSSlide.jsx` | Fetches via localhost-only `/api/rss/cache/:feedId` |
| Image | `ImageSlide.jsx` | Fit/Fill/Stretch + edge treatment (dark/light/glassy-blur/gradient) |
| Video | `VideoSlide.jsx` | Advances on end |
| Announcement (`type: 'ANNOUNCEMENT'`) | `AnnouncementSlide.jsx` | Layouts Big words / Event / List / Quick time (auto-fit, any of the 11 styles via `styles/announcementStyles.js` palettes) and Classic (dispatches to `TextSlide` / `StyledSlide` / `BoardSlide` / `PinnedSlide` / `Takeover.TakeoverCard`). slides.json ref rows `{type:'ANNOUNCEMENT', announcementId}` keep a rotation spot; other active slide announcements are appended. |
| Legacy text / styled / pinned / board rows | (in `SlideCarousel.jsx`) | `TextSlide`, `StyledSlide`, `PinnedSlide`, `BoardSlide`, `Takeover.jsx` were retired; raw legacy rows render as Big words via `AnnouncementSlide` |
| Mivtzah Leaderboard | `MivtzahLeaderboardSlide.jsx` | Talks to the Mivtzah SaaS platform's data, not a raw embed |
| Mivtzah Live Embed | `MivtzahLiveEmbedSlide.jsx` | Just an iframe to the SaaS platform's `/live` page — any visual change to it happens in `saas-admin`/`saas-server`, not here |

### Messages (`src/screen/components/messages/`) — all driven by announcements (`data/announcements.json`)

- **Takeover** (`AnnouncementTakeover` in `slides/AnnouncementSlide.jsx`) — full canvas, pauses the carousel. 11 styles as static role overrides in `design/announceStyles.js`: classic, grand, emergency, sleek, celebration, urgent (Notice), torah, trip, phone, memorial, hype.
- **Banner** (`Banner.jsx`) — scrolling bottom strip. **Does not pause rotation.**
- **Board** (legacy, migrated to Classic announcement slides) — `slides/BoardSlide.jsx`.
- **Side note** — `PinnedNotes.jsx` cards in the rail, max 2 visible, more rotate every 8 s.
- **Hold** ("Pause everything else" slide) — replaces the slide area via `SlideCarousel` `hold` prop and pauses the rotation timer (`useSlideRotation(slides, { paused })`).

### Countdown (`src/screen/components/CountdownOverlay.jsx`)

Driven server-side by `src/server/countdown.js`, which schedules today's effective schedule entries (`getEffectiveSchedule`: the date's own schedule, else enabled weekly entries for today — re-init at midnight and on every schedule/date change) that have an `alertBefore` value and broadcasts SSE `countdown-start` / `countdown-tick` / `countdown-end`; the running one is also in `/api/state` as `countdown`. Display mode per entry is `countdownDisplay` (`alertDisplay` accepted as a legacy alias): `slide` replaces the slide area while it runs (SlideCarousel, like a board) or `takeover` is a full-screen overlay (App.jsx). Neither pauses the hidden rotation timer.

## Admin panel (`src/admin/`)

`App.jsx` → `AdminLayout.jsx` (sidebar desktop / sticky auto-scrolling tab bar mobile) + one component per section:

| Admin section | Component |
|---|---|
| Slides | `SlideManager.jsx` |
| Schedule | `ScheduleSection.jsx` — tabs: **By date** (`schedule/ScheduleByDate.jsx` week strip + `schedule/DayEditor.jsx` inline rows, text mode, blocks), **Paste / Import** (`schedule/ScheduleImport.jsx`: Claude prompt/format guide via `src/shared/scheduleClaudePrompt.js`, paste/upload → server preview → apply), **Weekly** (`ScheduleEditor.jsx`). Shared bits (API, clipboard + iOS fallback sheet, `TimeField`, `CategoryPicker` with "+ New category", Undo snackbar) in `schedule/scheduleShared.jsx` |
| Announcements (replaces Messages + Pinned) | `announcements/AnnouncementsPanel.jsx` (lists + Again… / Undo), `announcements/AnnouncementComposer.jsx` (composer + takeover conflict dialog), `announcements/AnnouncementPreview.jsx` (real kiosk components scaled), `announcements/helpers.js` |
| Custom Days | `CustomDaysEditor.jsx` |
| Media | `ImageUploader.jsx` |
| Photos | `GooglePhotosManager.jsx` |
| RSS Feeds | `RSSManager.jsx` |
| Style | `StylePanel.jsx` — font roles (`ScreenLookControls.jsx` FontRoles), Hebrew size, font upload |
| Settings | `SettingsPanel.jsx` — location, theme picker + auto day/night + screen look + weather (`ScreenLookControls.jsx`), layout, study, visibility, credit |
| Screen controls (pause/resume/blank/advance) | `ScreenControls.jsx` |
| Live preview (iframe of `/screen`, receives `preview` SSE events only) | `LivePreview.jsx` |

Shared: `ui.jsx` (buttons/inputs/toggles), `ToastContainer.jsx`, `useAdminState.js` (central state + `/api/state` fetch + SSE subscription), `useIsMobile.js`.

## Design tokens

Themes: `src/shared/themes.js` (20 sub-themes in Dark/Light families; five base values each, everything else derived). Font roles: `src/shared/fontRoles.js`. Admin tokens: `src/admin/styles/admin-tokens.js`. No Tailwind anywhere. Settings added in Phase 4: `theme`, `themeAuto {enabled, dayTheme, nightTheme, lightAt, darkAt}`, `fontRoles`, `hebrewFontScale` (global multiplier), `layout.railSide`, `rail.upNextMinutes`, `zmanimLayout`, `scheduleLayout`, `motion`, `graphics`, `weather {enabled, units, zip?}`, `themeVersion`.
