# Feature → file map

Read `CLAUDE.md` first. Use this to jump straight to the component behind a slide type, message type, or admin section instead of grepping.

## Kiosk screen (`src/screen/`)

`App.jsx` renders `Layout.jsx` (persistent left column: `Clock.jsx`, `HebrewDate.jsx`, `PinnedNotes.jsx`) + `SlideCarousel.jsx` (right column, rotates through enabled slides) + `HiddenAccess.jsx` (top-left 10×10px, 5-tap-in-2s admin gesture) + `ScreenScaler.jsx` (scales the whole canvas to fill actual screen resolution, pinned top-left) + message overlays.

Hooks: `useSSE.js` (subscribes to `/stream`, dispatches by event type), `useSlideRotation.js` (advance timer, respects per-slide duration + pause/blank commands), `useMessages.js`, `useClock.js`.

### Slide types (`src/screen/components/slides/`)

| Slide type | Component | Notes |
|---|---|---|
| Zmanim | `ZmanimSlide.jsx` | Past/next/upcoming/tomorrow color states — next = gold, tomorrow = copper, "למחר" tag |
| Limudim | `LimudimSlide.jsx` | Hayom Yom + Rambam 1ch/3ch + Tanya Yomi + Chumash; has a `ResizeObserver` — guard against firing after unmount (see GOTCHAS.md) |
| Hayom Yom (standalone) | `HayomYomSlide.jsx` | |
| Pirkei Avos | `PirkeiAvosSlide.jsx` | Seasonal — visibility computed in `src/shared/pirkeiAvos.js` (Pesach→Rosh Hashana window only) |
| Daily Quote | `DailyQuoteSlide.jsx` | |
| Parsha Tidbits | `ParshaTidbitsSlide.jsx` | |
| Schedule | `ScheduleSlide.jsx` | Reads `schedule.json`; icons from `src/shared/ScheduleIcons.jsx` (16 SVGs) |
| Google Photos | `GooglePhotosSlide.jsx` | Fetches via localhost-only `/api/google-album/:id/photos` |
| RSS Feed | `RSSSlide.jsx` | Fetches via localhost-only `/api/rss/cache/:feedId` |
| Image | `ImageSlide.jsx` | Fit/Fill/Stretch + edge treatment (dark/light/glassy-blur/gradient) |
| Video | `VideoSlide.jsx` | Advances on end |
| Custom Text | `TextSlide.jsx` | Templates: headline/quote/info/about/classes/announcement |
| Styled Template | `StyledSlide.jsx` | Reuses the 11 takeover visual styles as a rotating slide instead of an interrupt |
| Pinned (all-notes slide) | `PinnedSlide.jsx` | Distinct from the always-visible `PinnedNotes.jsx` in the left column |
| Mivtzah Leaderboard | `MivtzahLeaderboardSlide.jsx` | Talks to the Mivtzah SaaS platform's data, not a raw embed |
| Mivtzah Live Embed | `MivtzahLiveEmbedSlide.jsx` | Just an iframe to the SaaS platform's `/live` page — any visual change to it happens in `saas-admin`/`saas-server`, not here |

### Messages (`src/screen/components/messages/`)

- **Takeover** (`Takeover.jsx`) — full-screen, pauses the carousel. 11 styles: Classic, Grand, Emergency, Sleek, Celebration, Notice, Torah, Trip, Phone, Memorial, Hype.
- **Banner** (`Banner.jsx`) — scrolling bottom strip. **Does not pause rotation.**
- **Board** — replaces slide content only, rotation resumes after; rendered inline in `SlideCarousel.jsx`, not a separate component.

### Countdown (`src/screen/components/CountdownOverlay.jsx`)

Driven server-side by `src/server/countdown.js`, which watches `schedule.json` entries with an `alertBefore` value and fires an SSE `screen-command`-style event at T-minus. Display mode per entry: `slide` (overlay, carousel continues) or `takeover` (full pause).

## Admin panel (`src/admin/`)

`App.jsx` → `AdminLayout.jsx` (sidebar desktop / sticky auto-scrolling tab bar mobile) + one component per section:

| Admin section | Component |
|---|---|
| Slides | `SlideManager.jsx` |
| Schedule | `ScheduleEditor.jsx` |
| Messages | `MessageComposer.jsx` |
| Pinned | `PinnedManager.jsx` |
| Custom Days | `CustomDaysEditor.jsx` |
| Media | `ImageUploader.jsx` |
| Photos | `GooglePhotosManager.jsx` |
| RSS Feeds | `RSSManager.jsx` |
| Style | `StylePanel.jsx` |
| Settings | `SettingsPanel.jsx` |
| Screen controls (pause/resume/blank/advance) | `ScreenControls.jsx` |
| Live preview (iframe of `/screen`, receives `preview` SSE events only) | `LivePreview.jsx` |

Shared: `ui.jsx` (buttons/inputs/toggles), `ToastContainer.jsx`, `useAdminState.js` (central state + `/api/state` fetch + SSE subscription), `useIsMobile.js`.

## Design tokens

`src/screen/styles/tokens.js` (kiosk) and `src/admin/styles/admin-tokens.js` (admin) — 8 kiosk themes (Dark default, Dark HC, Midnight, Sepia, Parchment, Clean White, Ivory, Sky), Hebrew/English font pairs, no Tailwind anywhere in this product.
