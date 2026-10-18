# Feature → file map

Read `CLAUDE.md` first. Use this to jump straight to the component behind a slide type, message type, or admin section instead of grepping.

## Kiosk screen (`src/screen/`)

`App.jsx` resolves the active theme (manual, or zmanim day/night via `src/shared/dayNight.js`), wraps everything in `design/DesignRoot.jsx` (theme + font-role CSS variables, motion/graphics context) inside `ScreenScaler.jsx` (uniform scale of the 1600x900 / 900x1600 canvas), and renders `Layout.jsx` = `components/Rail.jsx` (clock, Hebrew/English date + parsha chip as one unit, weather, up-next card, side notes, credit/logo via `Credit.jsx`; or a top band in portrait) + one rounded page panel (`SlideCarousel.jsx`) + a 76 px `messages/Banner.jsx` row only when a banner is active. Also `AnnouncementTakeover` (full canvas, pauses rotation), `CountdownOverlay.jsx`, `HiddenAccess.jsx` (5 taps top-left).

Design system (`src/screen/design/`): `DesignRoot.jsx` (roles + context), `globalCss.js` (@property registrations, derived roles, motion keyframes), `ui.jsx` (Panel, PageTitle, TimeText, `he()`), `fit.jsx` (auto-fit text), `Paged.jsx` (fixed-size paginated text), `graphics.jsx` (weather icons, candles, ornaments, progress ring, per-theme background art + day-phase tint), `announceStyles.js` (layout metadata for the 26 takeover styles: content insets, side-graphic box, entrance personality = **the seam for new takeover/announcement styles**; the visuals are in `src/screen/takeover/`), `fonts.js` (bundled Rubik/Manrope/Frank Ruhl/EB Garamond + uploaded `@font-face`).

Hooks: `useSSE.js`, `useSlideRotation.js` (timer only), `useAnnouncements.js`, `useClock.js`. `src/screen/lib/announcementView.js` maps announcement items to rotation slides / banner / note rows.

### Slide types (`src/screen/components/slides/`)

| Slide type | Component | Notes |
|---|---|---|
| Zmanim | `ZmanimSlide.jsx` | `settings.zmanimLayout`: `board` (default clean board, next row filled, "in 16 min") / `board-arc` / `arc-tiles`; tomorrow's zmanim after the last one |
| Limudim | `LimudimSlide.jsx` | Chitas board (Chumash / Tehillim / Tanya + the day's opening/closing Tanya words in the Torah-text role) over one card per Rambam track + Sefer HaMitzvos: Sefer → Halachos → perakim ("פרק כ״ב / Perek 22", "פרקים א׳–ג׳ / Perakim 1–3"), parsed by `src/shared/limudim.js` (halachos→sefer table, gematria); cards share stepped type tiers; honors `limudimLang`, `limudimItems` |
| Weather | `WeatherSlide.jsx` | Built-in `WEATHER` type (off by default, added at startup by `builtin-slides.js`); data `cache.weather` |
| Hayom Yom (standalone) | `HayomYomSlide.jsx` | Fixed-size Torah-text reading look, paginated, duration grows with pages |
| Pirkei Avos | `PirkeiAvosSlide.jsx` | Seasonal — visibility computed in `src/shared/pirkeiAvos.js` (Pesach→Rosh Hashana window only) |
| Daily Quote | `DailyQuoteSlide.jsx` | The owner's "Tanya page": quote in the Torah-text role on a reading measure, rule + source centred with it, Hebrew source added for known sources (`hebrewSource()`) |
| Parsha Tidbits | `ParshaTidbitsSlide.jsx` | |
| Schedule | `ScheduleSlide.jsx` | `settings.scheduleLayout` `timeline` (Now\|Next spotlight, day ribbon, later strip) or `list`. Shows the schedule `App.jsx` resolved for today / `?previewDate=` via `getEffectiveSchedule` (`src/shared/scheduleResolution.js`): the date's own schedule from `schedule-dates.json`, else enabled weekly `schedule.json` entries for that weekday. Shows the date's label under the title. Icons from `src/shared/ScheduleIcons.jsx` (16 SVGs) |
| Google Photos | `GooglePhotosSlide.jsx` | Fetches via localhost-only `/api/google-album/:id/photos` |
| RSS Feed | `RSSSlide.jsx` | Fetches via localhost-only `/api/rss/cache/:feedId` |
| Image | `ImageSlide.jsx` | Fit/Fill/Stretch + edge treatment (dark/light/glassy-blur/gradient) |
| Video | `VideoSlide.jsx` | Advances on end |
| Announcement (`type: 'ANNOUNCEMENT'`) | `AnnouncementSlide.jsx` -> `takeover/TakeoverStage.jsx` | Seven layouts (Big words / Event / List / Quick time / Quote / Sicha excerpt / Letter; migrated Classic draws as Big words) x 26 styles, drawn by the takeover stage at the design size and scaled into the page panel. Long sicha/letter text paginates and asks the rotation for `pages x 12 s + 2`. slides.json ref rows `{type:'ANNOUNCEMENT', announcementId}` keep a rotation spot; other active slide announcements are appended. |
| Legacy text / styled / pinned / board rows | (in `SlideCarousel.jsx`) | `TextSlide`, `StyledSlide`, `PinnedSlide`, `BoardSlide`, `Takeover.jsx` were retired; raw legacy rows render as Big words via `AnnouncementSlide` |
| Mivtzah Leaderboard | `MivtzahLeaderboardSlide.jsx` | Talks to the Mivtzah SaaS platform's data, not a raw embed |
| Mivtzah Live Embed | `MivtzahLiveEmbedSlide.jsx` | Just an iframe to the SaaS platform's `/live` page — any visual change to it happens in `saas-admin`/`saas-server`, not here |
| Web page (`WEB_PAGE`) | `WebPageSlide.jsx` | Any website in an iframe (e.g. a Charidy campaign's `/miami+` screen version). New iframe + `_tt` cache-bust every time the slide comes up, optional reload every `webRefreshSec`, `webZoom` %, per-slide Fullscreen hides the rail. Admin 'Save & check' calls `GET /api/embed-probe` (`routes/embed-probe.js`, SSRF-guarded, `src/shared/embedCheck.js`) to warn when a site forbids framing (X-Frame-Options / CSP frame-ancestors) |

### Messages (`src/screen/components/messages/`) — all driven by announcements (`data/announcements.json`)

- **Takeover** (`AnnouncementTakeover` in `slides/AnnouncementSlide.jsx`) — full canvas, pauses the carousel; the stage at the real canvas size (1600x900, 16:10, or portrait 900x1600; side graphics become a top band in portrait). **26 styles** in 5 picker groups: Everyday (classic, grand, sleek, quiet, trip, mivtzoim, hype), Alerts (emergency, urgent "Important", schedule "Time change", phone "Phones away"), Moments (celebration, simcha, siyum, torah, memorial, welcome, farbrengen), Shabbos & Yom Tov (shabbos, yomtov), Seasonal (chanukah, purim, pesach, roshchodesh, lagbaomer, chassidic). Old ids keep their name (`notice` -> urgent, unknown -> classic, none -> drawn as classic). Davening style and schedule-triggered takeovers are deferred. Files in `src/screen/takeover/`: `TakeoverStage.jsx` (React: stage, `StageBox` fit/canvas, pager), `art.js` (one SVG function per style, entrance + ambient layers), `css.js` (all palettes, fonts roles, keyframes, scoped under `.tkr`), `layouts.js` (model -> HTML, `FIT` min/max table), `fit.js` (one-shot fitting, pagination, lively splitting). Content models: `src/shared/takeoverModel.js`. Per-announcement `look.animation` (full / entrance / off) x `settings.motion` -> `effectiveAnimation()`. Type: `settings.announceFonts` = editorial (default, Suez One + Playfair Display) / modern (Rubik + Manrope) / classic (Frank Ruhl Libre + Fraunces) / screen (global font roles), `ANNOUNCE_FONT_PRESETS` in `src/shared/fontRoles.js`, applied as role vars on the `.tkr` root; every text run gets `dir` from `src/shared/bidi.js`.
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
| Announcements (replaces Messages + Pinned) | `announcements/AnnouncementsPanel.jsx` (lists + Again… / Undo), `announcements/AnnouncementComposer.jsx` (composer + takeover conflict dialog; per-layout fields incl. quote/sicha/letter, soft length hints, Animation select), `announcements/StylePicker.jsx` (26 styles in 5 groups with live thumbnails drawn by the real stage), `announcements/AnnouncementPreview.jsx` (real kiosk components scaled), `announcements/helpers.js` |
| Custom Days | `CustomDaysEditor.jsx` |
| Media | `ImageUploader.jsx` |
| Photos | `GooglePhotosManager.jsx` |
| RSS Feeds | `RSSManager.jsx` |
| Style | `StylePanel.jsx` — Message & takeover font style (`announceFonts`, 4 cards with live specimens, saves on click), font roles (`ScreenLookControls.jsx` FontRoles), Hebrew size, font upload |
| Settings | `SettingsPanel.jsx` — location, theme picker + auto day/night + screen look + weather (`ScreenLookControls.jsx`), layout, study, visibility, credit (position rail-middle / rail-bottom / corner / slide, logo size S/M/L/XL, blend) |
| Screen controls (pause/resume/blank/advance) | `ScreenControls.jsx` |
| Live preview (iframe of `/screen`, receives `preview` SSE events only) | `LivePreview.jsx` |

Shared: `ui.jsx` (buttons/inputs/toggles), `ToastContainer.jsx`, `useAdminState.js` (central state + `/api/state` fetch + SSE subscription), `useIsMobile.js`.

## Design tokens

Themes: `src/shared/themes.js` (20 sub-themes in Dark/Light families; five base values each, everything else derived). Font roles: `src/shared/fontRoles.js`. Admin tokens: `src/admin/styles/admin-tokens.js`. No Tailwind anywhere. Settings added in Phase 4: `theme`, `themeAuto {enabled, dayTheme, nightTheme, lightAt, darkAt}`, `fontRoles`, `hebrewFontScale` (global multiplier), `layout.railSide`, `rail.upNextMinutes`, `zmanimLayout`, `scheduleLayout`, `motion`, `graphics`, `weather {enabled, units, zip?}`, `themeVersion`; later `announceFonts`.
