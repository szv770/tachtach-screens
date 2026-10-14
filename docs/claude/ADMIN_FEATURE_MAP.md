# Admin feature map (functional cleanup, 2026-10-14)

Every feature the server/kiosk supports, and the admin control that reaches it. "Fixed" = was unreachable or broken before this pass. This is a reachability map, not a redesign; a full admin redesign is planned later.

## Saving settings (read before adding a control)

`updateSettings(patch)` in `useAdminState.js` sends `PATCH /api/settings`. **Pass only the keys you own** (`{ banner: { size: 'large' } }`, or `diffSettings(saved, local)` from `src/shared/settingsMerge.js`). The server deep-merges into `settings.json` (objects merge, arrays/scalars replace, `null` stores null), under a lock. Top-level keys must be in `SETTINGS_KEYS` (`src/shared/settingsMerge.js`) or the server returns 400 naming them. **A new setting needs its top-level key added there.** Legacy whole-object `PUT /api/settings` still works for old tabs. Never spread the whole `settings` prop into a save (audit bug 14).

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
| Media | Upload image/video/GIF, add as slide | `ImageUploader` | OK |
| Photos | Connect album, sync now, remove | `GooglePhotosManager` | OK |
| Photos | `refreshInterval`, `maxPhotos` after creation | Album "Settings" button / slide Edit sheet; `PUT /api/google-album/:id` re-syncs when maxPhotos changes | Fixed |
| Photos | Album with no slide | "Add slide" button on the album row | Fixed |
| RSS | Add feed, sync, delete | `RSSManager` | OK |
| RSS | Edit name/refresh/slide mode/style | `RSSManager` Edit | Fixed. Deleting a feed now also removes its slide |
| Style | Hebrew body/heading font, English font, scales, upload/delete fonts | `StylePanel` | OK. Saves only `fonts`/scales keys; font upload/delete errors now toast |
| Settings | Zip, Chabad location id, Track A/B | Settings > Location / Dual-Track | OK (nested keys, bug 6) |
| Settings | `location.timezone` | Settings > Location | Fixed (no UI; announcements use it) |
| Settings | Theme (8) | Settings > Theme | OK |
| Settings | `customTheme` + theme `custom` | Settings > Custom Theme | Fixed (no UI) |
| Settings | Auto theme by zmanim | Settings > Auto Theme | OK |
| Settings | Clock side, orientation, portrait layout | Settings > Layout | OK |
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
- StylePanel/SettingsPanel layouts were intentionally not reorganized (the kiosk agent adds controls there). New controls must save via PATCH keys as above.
- The legacy `/api/messages`, `/api/pinned` shims can be deleted one release from now.
