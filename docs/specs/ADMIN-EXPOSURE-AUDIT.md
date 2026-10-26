# Admin exposure audit (first pass, 2026-10-26)

Question: **which built features have options that nothing in the admin can change?** (settings keys, slide fields, announcement fields, environment switches and hard-coded "knobs" that behave like settings). This is a first pass done by reading the code, not by running the app: every row cites the file and line it was found in, and every "no admin control" claim was checked with a search of `src/admin/` for the key (and for its UI wording). Shared rules and SaaS vocabulary: [README.md](README.md).

## 0. Status (2026-10-26): bundles A-D built

| Row | Result |
|---|---|
| E-01 candle minutes, coordinates, elevation | Built (Look > Location > Candle lighting / Calculated times). Hard limits 10-60 min enforced by the server; advice per time zone; example time from `GET /api/candle-preview`. In Live mode Chabad.org still decides: the page says so |
| E-02, E-03 | Built (weather: second switch, own zip) |
| E-38 time zone | Health warning when none is set, picker shows "Choose your time zone" (server fallback unchanged so old installs keep working). A hard "required" belongs to cloud onboarding |
| E-05, E-08 | **Not built, finding corrected:** the kiosk never reads `look.maxFontPx` (`toLegacyTakeover` is unused) or `note.icon` (`PinnedNotes.jsx` draws no icon), so they were Dead, not Hidden. Kept in the allow-list until the kiosk is wired |
| E-06, E-07, E-09 | Built (composer "Take turns", Move up / Move down on live side notes) |
| E-10 | Built (`visibility.upNext`) |
| E-11 | Built for 1 or 2 notes at once and 4-30 s; **3 deliberately not offered** (the rail has room for two cards; unverifiable without screenshots) |
| E-12 | Built without a new key: Daily Story reading time follows the existing Look > Motion > Long text reading speed (Normal = old 140 wpm) |
| E-16, E-17, E-18 | Removed: no longer accepted, dropped on the next save of an item (`stripRetiredFields`); old messages keep `bannerSize` in `legacy.extra` |
| E-19 to E-22 | Retired (`RETIRED_SETTING_KEYS`): refused by PATCH, deleted from stored settings on load. The committed `data/settings.json` still lists some; the boot migration removes them (file not edited by hand) |
| E-23 | Kept (aliases are still folded by `settings-migrate.js`) |
| Section 6 test | `test/adminExposure.test.js` + `test/adminExposure.allow.json`; `test/settingScope.test.js` |

## 1. Method (repeatable; section 6 turns it into a test)

1. **Inventory the places options can be defined**
   - top-level settings: `SETTINGS_KEYS` in `src/shared/settingsMerge.js:24-56`, then the nested keys each reader uses (`grep -rn "settings\??\.\(<key>\)" src/screen src/server src/shared src/fetchers`) and each normaliser's defaults (`DEFAULT_*` constants);
   - slide fields: `SLIDE_FIELDS` in `src/server/routes/api.js:86`;
   - announcement fields: the `'<field>' in body` sanitisers in `src/server/announcements-model.js:120-215`;
   - schedule entry options: `src/shared/schedulePaste.js` option parser;
   - other documents' settings: chazan, roster/birthdays, freeze, live, daily words/stories, data pack, custom days, Kiddush Levana;
   - environment switches: `grep -rn "process.env" server.js src/server`;
   - constants that behave like settings: `grep -rnE "^(export )?const [A-Z_]+ = [0-9]"` in kiosk components and `src/shared`.
2. **Is it read?** Search the kiosk/server/shared code for a reader. A key that is accepted but never read is **Dead**, not "hidden".
3. **Is it exposed?** Search `src/admin/` for the key and for the label wording, including `slideForm.js`, `SlideFields.jsx`, `look/*Page.jsx`, composer, `search/searchIndex.js`. A control that exists only inside a *default object* (`emptyItem()` in `announcements/helpers.js`) is **not** a control.
4. **Classify**: **Hidden** (built, read, no control) / **Dead** (accepted, never read) / **Env** (deployment switch, by design not in the admin; can be shown read-only) / **Const** (hard-coded number that behaves like a setting) / **Gap** (an assumption the SaaS will break).
5. **Propose** the admin location following today's structure (`nav.js` areas; closed Collapsibles with one-line summaries; `useSettingsForm`/`useInstant`; every new top-level key added to `SETTINGS_KEYS`; a `searchIndex.js` entry per control) and a size (S under half a day, M 1-2 days, L 3-5 days).

Counts: **14 Hidden (E-01 to E-14), 8 Dead or legacy (E-16 to E-23), 6 Env (E-26 to E-31), 1 real Const (E-33; four more are intended), 3 Gap (E-38 to E-40)** (rows below; E-15, E-24, E-25 and E-32, E-34 to E-37 and E-41 are "checked or intended" rows). Everything else examined was reachable (about 120 controls checked, listed in `docs/claude/ADMIN_FEATURE_MAP.md`; the Chazan, Roster/Birthdays, Freeze, Live link, Kiddush Levana, Data pack, Themes, Fonts, Credit/Logo, Motion, Schedule display, Limudim/Zmanim/Hayom Yom, Google album and RSS feed options are all exposed).

## 2. The table

Legend: **Where** = file:line of the definition (reader/default). **Size** per README.

### 2.1 Hidden: built and working, no control

| ID | Key | Where defined | Default | Effect | Proposed admin location | Size |
|---|---|---|---|---|---|---|
| E-01 | `settings.location.lat`, `.lon`, `.elevation`, `.candleMinutes` | `src/shared/localData.js:28-31`; candle default `src/shared/zmanim.js:30` | lat/lon from the weather geocode, elevation 0, candle **18 min** | Local-data zmanim (sun maths, sunrise elevation) and **how many minutes before sunset candles are lit** (18 Diaspora, 40 Jerusalem, 30 some communities). In Live mode Chabad.org decides. Wrong value = wrong candle time. Needed by Spec 2 | Look & Settings > Location & weather > closed "Advanced (calculated times)": coordinates (with "use the zip's location"), elevation, candle-lighting minutes; shown only when Data source = Local | S |
| E-02 | `settings.weather.showInRail` | `src/screen/components/Rail.jsx:166` | true | Hides the weather readout in the rail while keeping the Weather page (the admin's single "rail readout" switch writes `weather.enabled` only) | Location & weather > Weather: second switch "Also show in the side rail" | S |
| E-03 | `settings.weather.zip` | `src/fetchers/index.js:38,54` | falls back to `location.zip` | Weather for a different place than the zmanim location (the page says location is read-only) | Location & weather > "Use a different place for the weather" (zip) with the existing Test button | S |
| E-04 | slide `webCacheBust` | `src/screen/components/slides/WebPageSlide.jsx:25`; whitelisted `src/server/routes/api.js:86` | true (adds a `_tt` stamp to the address on every load) | Sites with signed or strict URLs reject the extra query; no way to turn it off | Media > Web pages > Advanced: "Add a time stamp to the address (turn off if the page refuses to load)" | S |
| E-05 | announcement `look.maxFontPx` | `src/server/announcements-model.js:180`; read `src/screen/lib/announcementView.js:92` | null (auto-fit grows text to fill) | Caps auto-fit size so a one-word message is not 400 px tall; the composer only offers Auto / Fixed | Composer > Look > Text size: add "Biggest size" (Auto / Large / Medium / Small mapped to px) | S |
| E-06 | announcement `takeover.rotateSec` | `announcements-model.js:196`; `src/shared/announcements.js:311` | 10 s | When several takeovers share a group they take turns full screen every N seconds | Composer > Show as Takeover > "When more than one is on, change every [10] seconds" (with E-07) | S |
| E-07 | announcement `takeover.group` | `announcements-model.js:195`; `src/shared/announcements.js:305` | null | Takeovers with the same group name rotate instead of the newest winning | Composer > Takeover: switch "Take turns with other takeovers" (stores a fixed group name `turns`) | S |
| E-08 | announcement `note.icon` | `announcements-model.js:190`; `announcementView.js:75` | null | Icon on a side note card | Composer > Show as Side note > icon picker (about 8 icons from `ui/Icon.jsx`) | S |
| E-09 | announcement `note.order` | `announcements-model.js:191`; `src/shared/announcements.js:329` | 0 | Which side notes show first (max 2 visible) | Announcements list: Move up / down on side notes (writes `note.order`) | S |
| E-10 | "Up next" rail card has **no off switch** | `src/screen/App.jsx:572` (0 or missing falls back to 5 minutes); `ShowsPage.jsx:33-40` only sets minutes | on, 5 min | The card cannot be hidden; a school with no schedule on the TV still gets it | Look & Settings > What shows > Side rail items: add "Up next" to the list (`visibility.upNext !== false`) | S |
| E-11 | side notes: max visible 2, rotate every 8 s | `src/screen/components/PinnedNotes.jsx:12-13` | 2 / 8000 ms | How many notes show at once and how fast extras rotate | Look & Settings > What shows: "Side notes at once (1-3)" and speed. Only if the owner asks | S |
| E-12 | Daily Story reading speed (about 140 wpm) | `src/screen/components/slides/DailyStorySlide.jsx:20-32` | 140 wpm (Hebrew slower) | How much extra time a long story asks the rotation for | Screen > Daily Story > Settings: "Reading pace: Slow / Normal / Fast" | S |
| E-13 | Daily Word language ('Yiddish') | `src/shared/dailyWords.js:21`; `DailyWordPanel.jsx:20,120` (the Claude prompt is hard-coded "Yiddish") | 'Yiddish' | The word list is one language; the AI prompt and blank form assume Yiddish. A school using Ladino or Hebrew words cannot change the default | Screen > Daily Word > Settings: "Language of the words" feeding the form default and the prompt | S |
| E-14 | Mivtzah leaderboard source | `src/server/mivtzah-scheduler.js:45-46` (`MIVTZAH_SUPABASE_URL`, `MIVTZAH_SUPABASE_ANON_KEY`); poll `:5` (60 s) | env only | The leaderboard slide has no setup screen at all; wrong env = silent empty page. CLOUD-PLAN 13.6 already wants per-org `mivtzah` settings | Screen > Slides > Mivtzah Leaderboard popup > "Connect": URL, public key (write-only after saving), campaign, Test button, refresh interval; key stored as a secret (0600 file) | M |
| E-15 | schedule category `kind` and per-entry options beyond the block sheet | `src/shared/schedulePaste.js:206` (`kind`, `badge`/`nobadge`, `started`, `off`) | inferred | **Verified exposed** (Categories panel, block sheet). Listed so the audit shows it was checked | none | - |

(E-15 is a "checked, fine" row and is not counted in the totals above.)

### 2.2 Dead or legacy: accepted by the server, never read

| ID | Key | Where | Default | Effect today | Recommendation | Size |
|---|---|---|---|---|---|---|
| E-16 | announcement `banner.size` | `announcements-model.js:200`; plumbed in `announcementView.js:61`; **not read** by `Banner.jsx` | null | None | Wire it (small / normal / large strip) **or** delete the field and the plumbing | S |
| E-17 | announcement `banner.repeat` | `announcements-model.js:202`; `announcementView.js:64` | null | None (ADMIN_FEATURE_MAP says the control "did nothing") | Delete | S |
| E-18 | announcement `priority` (-100..100) | `announcements-model.js:144` | 0 | Never read by the kiosk or `selectActive` | Delete, or use as the tie-break for takeovers (then expose with E-06/E-07) | S |
| E-19 | `settings.hebrewHeadingScale` | `src/shared/settingsMerge.js:38` | none | Not read anywhere (only `hebrewFontScale` is) | Remove from the whitelist | S |
| E-20 | `settings.scheduleDisplayMode`, `scheduleScrollSpeed`, `scheduleScrollStart` | `settingsMerge.js:41`; present in the committed `data/settings.json` | "two-column" / "fast" | Not read by the kiosk (schedule layouts replaced them) | Migrate away and remove from the whitelist and the committed defaults | S |
| E-21 | `settings.language` | `settingsMerge.js:39` | none | Not read by the kiosk (the per-page language switches replaced it) | Remove | S |
| E-22 | `settings.dataSources` | `settingsMerge.js:33` ("legacy, unused"); committed `data/settings.json` | zmanim/hayomYom... true | None | Remove | S |
| E-23 | legacy aliases `zipCode`, `chabadLocationId`, `trackA`, `trackBTime`, `fonts.customFonts` | `settingsMerge.js:54-55` (folded at start-up by `settings-migrate.js`, `app.js:83`) | - | Migration only | Keep until the cloud import has run once, then remove | S |
| E-24 | `settings.themeVersion` | `settingsMerge.js:51`; `server/settings-migrate.js` | - | Internal migration marker | Intended | - |
| E-25 | `fonts.json` legacy `customFonts` vs the font-role system | `ADMIN_FEATURE_MAP.md` "Not exposed on purpose" | - | Legacy | Intended | - |

(E-24 and E-25 are "intended" and are not counted as Dead.)

### 2.3 Environment switches (by design not an admin choice; show read-only for support)

| ID | Key | Where | Default | Effect | Proposed admin location | Size |
|---|---|---|---|---|---|---|
| E-26 | `TRUST_PROXY` | `src/server/app.js:201`, `clientIp.js:11` | off | Rate limits and lockouts see the real client behind a Cloudflare tunnel (CLAUDE.md rule) | Health > "How this screen is set up": read-only value with a warning if the page is reached through a proxy header and this is off | S (one card for E-26..E-31) |
| E-27 | `LOCAL_TLS`, `HTTPS_PORT` | `src/server/localTls.js:31,42` | on, 3443 | Local https for the kiosk (framing, cameras) | same card | - |
| E-28 | `CSP_REPORT_ONLY` | `src/server/csp.js:82` | off | CSP in report-only mode | same card | - |
| E-29 | `PORT`, `HOST` | `server.js:19-20` | 3000, 0.0.0.0 | Where the server listens | same card | - |
| E-30 | `TACHTACH_DATA_DIR`, `TACHTACH_PACK_DIR` | `src/server/dataPackStore.js:20`; storage root | `data/`, `data/pack` | Where files live (tests and Windows kit) | same card | - |
| E-31 | `PUSH_CONTACT` | `src/server/push.js:39` | `mailto:tachtach@example.com` | VAPID contact shown to push services | In the cloud this becomes a platform setting; on a Pi, Settings > Security "Notification contact email" (default: the first admin's email) | S |
| E-32 | kiosk launch URL / flags (`deploy/kiosk-launch.sh`, `deploy/windows/*`) | `deploy/` | - | Browser flags, start page | Documented in deploy docs; not an admin concern | - |

### 2.4 Hard-coded constants that behave like settings

| ID | Constant | Where | Value | Effect | Recommendation | Size |
|---|---|---|---|---|---|---|
| E-33 | Clock and time format: 12-hour with AM/PM | `src/screen/hooks/useClock.js:14`, `to12h` in `src/shared/announcements.js:467`, schedule/zmanim formatters | 12 h | No 24-hour option for the rail clock, schedule, zmanim | Look & Settings > Layout > "Clock: 12 h / 24 h" and thread it through the time formatters (needed for an Israeli or European org) | M |
| E-34 | Own-undo / own-edit window | `src/server/ownPost.js:12` | 30 min | How long a poster may remove their own post | Intended; Spec 1 reuses it. Optional org setting later | - |
| E-35 | History/undo retention | `src/shared/undo.js:9-12` | 100 records, 30 days, 120 kB each | How far back Undo works | Intended | - |
| E-36 | Banner strip height | `src/screen/components/messages/Banner.jsx:19` | 76 px | Design constant tied to the layout | Intended (design) | - |
| E-37 | Request limits (16 kB default JSON, login lockout windows, rate limiter windows) | `src/server/app.js:236,251,491` | various | Security policy | Intended; never in the admin | - |

### 2.5 Gaps the SaaS will hit (assumptions, not options)

| ID | Assumption | Where | Why it matters for several orgs | Recommendation | Size |
|---|---|---|---|---|---|
| E-38 | Fallback time zone `America/New_York` when none is set | `src/shared/announcements.js:29`, `src/shared/localData.js:31`, `src/server/routes/announcements.js` | An org that forgets to set a zone silently gets New York time (candle times, recurrence, day/night) | Location & weather: time zone **required**; Health warning "No time zone set"; onboarding wizard asks first | S |
| E-39 | Committed starting defaults contain one school's values | `data/settings.json` (credit text "Powered By: KishenT.org", zip 33139, uploaded font ids), `data/slides.json`, `data/schedule.json` | A new org would inherit another school's credit line and fonts; breaks the "no hard-coded names" rule | A neutral `defaults/` seed set used by `setup.js` and the cloud onboarding; MLMI's own values become its data, not the template | S-M |
| E-40 | Week = Sunday-first, Friday-short, Shabbos Saturday | `DAY_CODES` in `src/shared/scheduleDays.js:16` and every weekday grid | Israeli org: Friday-Saturday weekend; some use Sunday-Thursday school weeks | Document as a known assumption; org setting "School days" (default Sun-Thu / Mon-Fri) feeding schedule wizard, Menu and Shiurim defaults | M |
| E-41 | English UI only, hard-coded wording in admin | `src/admin/**` | Not an exposure, a localisation gap; listed so it is a conscious decision | Out of scope for now | - |

## 3. Suggested bundles (so the work is done in a few sittings)

| Bundle | Rows | Size | Why together |
|---|---|---|---|
| **A. Location & weather advanced** | E-01, E-02, E-03, E-38 | S-M | One page, and E-01 is needed for correct candle times (Spec 2) |
| **B. Composer: takeover & note extras** | E-05, E-06, E-07, E-08, E-09 | M | All in `AnnouncementComposer.jsx`, all small |
| **C. What shows** | E-10, E-11, E-12 | S | One page (`ShowsPage.jsx`) |
| **D. Clean-up of dead keys** | E-16 to E-22 (and E-39's `dataSources`/`scheduleDisplayMode` in the committed settings) | S | Delete code, one migration; do **before** the cloud import so dead keys are not carried into orgs |
| **E. Mivtzah connection** | E-14 | M | Needs secret handling; coordinate with CLOUD-PLAN 13.6 |
| **F. Setup card (read-only)** | E-26 to E-31 | S | One Health card |
| **G. Time format / school days** | E-33, E-40 | M each | Only when the first non-US org appears |
| **H. Web page address stamp** | E-04, E-13 | S | Two tiny controls |

Recommended first pass (about 2 days): **A + B + C + D**.

## 4. Things looked at and found fine (so nobody re-checks them)

Chazan (`settings.grid/shabbos/roshChodesh/yomTov/fill/lockDays/names/hebrewLabels/showOnSchedule/rail/railMinutes`: `ChazanSettings.jsx`), birthdays (`fridayIsWeekend/lookAhead/names/rail`: `RosterPanel.jsx`), Freeze (`manual/windows/emergency/style`: `FreezeControl.jsx`), Live link (`enabled/word/touchScreen/touchLive`: `LiveLinkCard.jsx`), Kiddush Levana (`enabled/startAfterDays/endRule/skipCustoms/hebrew/overrides`: `KiddushLevanaCard.jsx`, `KiddushLevanaMonths.jsx`), data pack and `showChabadCredit`/`dataSource` (`DataPackCard.jsx`), themes incl. auto and custom accent (`ThemesPage.jsx`), font roles and scales (`FontsPage.jsx`, `ScreenLookControls.jsx`), credit/logo size/blend/position (`LogoPage.jsx`), motion and graphics (`MotionPage.jsx`), long text mode/speed, schedule display (`scheduleLayout`, `scheduleView.autoSeconds/hebrew`, `scheduler.trackA/trackBTime`), zmanim visible list and layout, Limudim/Hayom Yom language, banner mode/speed defaults and per item, per-slide fullscreen, `hideOnShabbos`, QR options, photo layout/interval/order/Ken Burns, RSS options, Google album refresh/max, PDF page seconds, schedule alerts/countdown display/stages/groups/`tefila`, custom days, announcement recurrence/hold/animation/style, Daily Word/Story ordering and pins.

## 5. Findings worth a decision (not just a task)

1. **E-01 candle-lighting minutes** is the only hidden option whose wrong value is a halachic error rather than a cosmetic one. Recommendation: build it with the Shabbos page.
2. **E-39 committed defaults** are the real SaaS blocker in this audit: ship the neutral seed before orgs 2-5.
3. **E-16 to E-22**: seven dead keys are a trap (they look like options in the whitelist and in docs). Delete before the cloud migration.
4. **E-14** (Mivtzah env-only) is the one feature that is **unusable without shell access**; fix it with the SaaS per-org settings.

## 6. Keeping it from growing back (proposed, S)

Add `test/adminExposure.test.js`: it (a) lists every key in `SETTINGS_KEYS` and every `'x' in body` field of the announcement model, (b) reads `src/admin/**` as text and checks the key's name appears, (c) fails for any key not in an explicit allow-list file `test/adminExposure.allow.json` that holds each deliberate exception with a reason and an expiry date (the rows of 2.2-2.4 above become the first allow-list). A new setting then cannot ship without a control or a written reason. The same list feeds the `CLAUDE.md` rule "A new setting needs its top-level key in `SETTINGS_KEYS`" with one more clause: "and a control, or an allow-list line".
