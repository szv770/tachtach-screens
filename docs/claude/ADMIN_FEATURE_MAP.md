# Admin feature map (functional cleanup, 2026-10-14)

Every feature the server/kiosk supports, and the admin control that reaches it. "Fixed" = was unreachable or broken before this pass. This is a reachability map, not a redesign; a full admin redesign is planned later.

## Saving settings (read before adding a control)

`updateSettings(patch)` in `useAdminState.js` sends `PATCH /api/settings`. **Pass only the keys you own** (`{ banner: { size: 'large' } }`, or `diffSettings(saved, local)` from `src/shared/settingsMerge.js`). The server deep-merges into `settings.json` (objects merge, arrays/scalars replace, `null` stores null), under a lock. Top-level keys must be in `SETTINGS_KEYS` (`src/shared/settingsMerge.js`) or the server returns 400 naming them. **A new setting needs its top-level key added there.** Legacy whole-object `PUT /api/settings` still works for old tabs. Never spread the whole `settings` prop into a save (audit bug 14).

Look & Settings is split into small pages under `src/admin/components/look/` (Themes, Fonts `/admin/style`, Layout, Logo & credit, Motion, Location & weather `/admin/settings`, What shows, Schedule display, Security, This screen = `settings.siteName` + Storage, plus Team and My account). Multi-field pages use `useSettingsForm` (`look/kit.jsx`, wraps `useDirtyForm` + `SaveBar`, PATCHes only changed keys); toggles/single choices use `useInstant` (applies at once, Undo toast). New: `location.displayName` ("Show location as", kiosk `placeName()` in `src/screen/design/hooks.js`) and top-level `siteName`.

## Sections and features

| Area | Feature | Admin control | Status |
|---|---|---|---|
| Slides | Enable/disable, reorder, per-slide duration, label | `SlideManager` | OK |
| Slides | Fullscreen (image/video/photos/embed) | `SlideManager` | OK |
| Slides | Zmanim visible list | Slides > Zmanim > Edit (`zmanimVisible`) | OK (now PATCH) |
| Slides | Limudim language/items | Slides > Limudim > Edit | OK (now PATCH) |
| Slides | Mivtzah embed URL | Slides > Embed > Edit | OK |
| Slides | Image fit mode + edge treatment (`displayMode`, `edgeTreatment`) | Slides > Image > Edit | Fixed (was upload-only) |
| Slides | Video slide URL, image blur backdrop | Media upload | Fixed (server whitelist dropped `videoUrl`/`blurUrl`/`edgeTreatment`/`isGif`, so new videos were blank) |
| Slides | Delete custom slides | `SlideManager` (+ toast) | OK |
| Schedule | Per-date schedules, blocks, paste/import | Schedule > By date / Paste / Weekly | OK (Phase 3) |
| Schedule | Weekly entries, categories (+ per-category default alert), templates, alerts | Schedule > Weekly | OK |
| Schedule | Whole weekly schedule by paste (`@ every Sun-Thu`), copy as text, save/switch weekly templates (auto-backup on replace) | Schedule > Weekly > Active weekly schedule (`schedule/ScheduleWeekly.jsx`; `PUT /api/schedule/weekly`) | New |
| Schedule | Claude prompt types (day/Shabbos, weekly) | Paste / Import and Weekly > "Copy Claude prompt for…" (`PROMPT_TYPES`) | New |
| Settings | Weather: rail readout, units, location (read-only, from Location), Weather page toggle (WEATHER slide), Test button | Settings > Weather (`WeatherSettings`; `GET /api/weather/preview`) | Regrouped |
| Schedule | Slide language (`settings.language`) | Settings > Schedule Display | Fixed (no UI) |
| Schedule | Display mode / scroll speed / start | Settings > Schedule Display | OK |
| Announcements | Slide/banner/side note/takeover, drafts, recurrence, hold | Announcements tab + composer | OK |
| Announcements | Banner size/speed/repeat, archive days | Announcements > Banner display settings | OK (now PATCH) |
| Announcements | Legacy Messages / Pinned UI | removed earlier; verified no admin references remain | Done. Server still answers `/api/messages`, `/api/pinned`, legacy slide POST (translating shims, one release, `routes/announcements.js`) |
| Custom Days | Add, delete | `CustomDaysEditor` | OK |
| Custom Days | Edit existing (same id, Hebrew/Gregorian switch) | `CustomDaysEditor` Edit; new `PUT /api/custom-days/:id` | Fixed (was create/delete only) |
| Media | Upload image/video/GIF, add as slide | Media > Library (`media/MediaLibrary`, `ImageUploader`, `media/AddToScreenForm`) | OK. Phase 3B: grid of uploads (`GET /api/media`) with Add to screen / Delete (confirm; slides using it go too), "Best size" card, non-blocking size warning. No PDF support (not invented) |
| Media | Recommended size for the screen | Media > Library `media/SizeCard`; kiosk reports `{width,height,dpr,orientation,canvas}` via `POST /api/screen/report`, read from `/api/state` `screenDisplay` | New. Fallback 1920x1080 / 1080x1920 from `settings.orientation`; uploads are now shrunk into the measured size (cap 4K) |
| Media | Web pages (WEB_PAGE slides) list/add/edit/Save & check/remove | Media > Web pages (`media/WebPagesTab`); same slide fields as before | Moved from the slide row; SlideManager's pencil popup is 3A's |
| Photos | Connect album, sync now, remove | Media > Photo albums (`GooglePhotosManager`) | OK. Closed collapsibles, Sheet for settings, ConfirmDialog instead of `confirm()` |
| Photos | `refreshInterval`, `maxPhotos` after creation | Album "Settings" button / slide Edit sheet; `PUT /api/google-album/:id` re-syncs when maxPhotos changes | Fixed |
| Photos | Album with no slide | "Add slide" button on the album row | Fixed |
| RSS | Add feed, sync, delete | Media > News feeds (`RSSManager`; `/admin/rss-feeds` redirects to `/admin/images?tab=feeds`) | OK |
| RSS | Edit name/refresh/slide mode/style | `RSSManager` Edit | Fixed. Deleting a feed now also removes its slide |
| Style | Hebrew body/heading font, English font, scales, upload/delete fonts | `look/FontsPage` (/admin/style) | OK. Saves only `fonts`/scales keys; font upload/delete errors now toast |
| Settings | Zip, Chabad location id, Track A/B | Look & Settings > Location & weather / Schedule display (`look/LocationPage`, `look/ScheduleDisplayPage`) | OK (nested keys, bug 6) |
| Settings | `location.timezone` | Look & Settings > Location & weather | Fixed (no UI; announcements use it) |
| Settings | Theme (8) | Look & Settings > Themes (`look/ThemesPage`; Auto off = one picker, on = Dark + Light pickers) | OK |
| Settings | `customTheme` + theme `custom` | Themes > Custom accent colour | Fixed (no UI) |
| Settings | Auto theme by zmanim | Themes > Auto toggle | OK |
| Settings | Clock side, orientation, portrait layout | Look & Settings > Layout (`look/LayoutPage`; the old 'weather in rotation' toggle is gone: use Screen > Slides > Weather) | OK |
| Settings | Limudim / Hayom Yom language | Settings | OK |
| Settings | Visibility toggles (clock, date, parsha, omer, side notes) | Settings > Visibility | OK (label now "Side Notes") |
| Settings | Credit text/size/position/slide/logo | Settings > Credit Line | OK. Logo upload/remove now saves immediately and toasts (no more `alert()`) |
| Settings | Trusted devices, storage cleanup | Settings > Security / Storage | OK |
| Screen controls | Pause/resume/next/blank/refresh | `ScreenControls` | OK |
| Preview | Live Preview iframe (`/screen?preview=true`) | Desktop side panel, mobile Preview sheet | Verified rendering |
| Preview | Date preview (`/screen?previewDate=`) | `ScreenControls` | Fixed: default date used UTC (tomorrow after ~8 PM ET), now local |
| Not exposed on purpose | `settings.dataSources` (unused anywhere), `fonts.customFonts` (legacy, kiosk reads `fonts.json`) | none | Dead keys |
| Reserved for the kiosk rebuild | `rail`, `layout`, `motion`, `graphics`, `weather`, `zmanimLayout`, `scheduleLayout` | none yet (the screen agent adds controls) | Already accepted by PATCH whitelist |

## Mobile (390x844) checks

No horizontal overflow in any section; inputs are 16px; all buttons, selects, summaries and links are at least 44px tall (global rule in `src/admin/index.html`, switches are a fixed 44x26 track with a 44px hit area via `ToggleSwitch` in `ui.jsx`). Settings' sticky Save bar now sits below the sticky admin header (`--tt-header-h`); Style's Save sticks to the bottom while dirty. Feedback goes through toasts (`notify()` from `useAdminState.js` for components that do their own fetches).

## Known remaining

- `ScheduleEditor` still receives an unused `onUpdateEntries` prop; harmless.
- Announcement composer inline controls were left as they were except the global 44px rule.
- New controls go on the matching `look/*Page.jsx`, save via PATCH keys as above, and need a `search/searchIndex.js` entry (anchor = Collapsible id).
- The legacy `/api/messages`, `/api/pinned` shims can be deleted one release from now.
