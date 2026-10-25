# Data pack plan: stop pulling daily data on the Pi

Owner decision (2026-10-25): the Pi should stop downloading the day's Jewish data every day (Chabad.org, Hebcal, Sefaria, TorahCalc). Calculate what can be calculated, and bundle the texts once, a year or more ahead.

Status in this branch: the calculation half is **built and measured** (section 3); the text pack has its **format, loader, build tool, on-Pi builder, upload route and admin card** (sections 4 to 9). **No text is in the repo**: it is collected on the Pi. Owner decision 2026-10-25: Chabad.org allows its content with credit, so the licence blocker in section 7 is lifted for the chabad.org sections. Switch: `settings.dataSource` = `'live'` (default, exactly today's behaviour) or `'local'`.

## 1. What the Pi fetches today

| Fetcher (`src/fetchers/`) | Calls | Feeds (cache key, then screen) | Used by |
|---|---|---|---|
| `chabad.js` `fetchZmanim` | chabad.org zmanim RSS (per zip, per date) | `zmanim.today/tomorrow`: Zmanim page, rail, day/night theme switch (`dayNight.js`), Shabbos mode, Track A timers, freeze "tomorrow" rule, schedule prompts | `fetchAll`, `fetchZmanimOnly`, preview-state, schedule store, announcements |
| `chabad.js` `fetchHayomYom` | chabad.org `hayomyom.asp?tdate=` (HTML scrape; Cloudflare, falls back to headless Chromium via `browserFetch.js`) | `hayomYom {en,he}`: Hayom Yom slide | `fetchAll`, preview-state |
| `chabad.js` `fetchDailyStudyRSS` + `fetchDailyStudyHebrewRSS` | chabad.org + he.chabad.org `dailystudy_rss.xml` (today only) | `limudim` (Chumash, Tehillim, Tanya lines), `rambam1`, `rambam3`, `seferHamitzvot`, `tanyaYomi`: Chitas/Rambam slides, rail | `fetchAll` |
| `chabad.js` `fetchTanyaExcerpt` | chabad.org `tanya.asp?tdate=` (scrape, browser fallback) | `limudim.tanyaFirstWords/LastWords`: Tanya slide | `fetchAll`, preview-state |
| `chabad.js` `fetchChumashForDate`, `fetchTehillimForDate` | chabad.org heading scrape (preview only) | preview of another date | preview-state |
| `chabad.js` `fetchDailyQuote`, `fetchParshaTidbits` | chabad.org RSS | `dailyQuote`, `parshaTidbits`: Daily Quote and Parsha Tidbits slides | `fetchAll` |
| `hebcal.js` `fetchHebrewDate` | hebcal.com converter | `hebrewDate {hebrew, hebrewYear, hebrewMonth, hebrewDay, events, omer}`: rail date, custom days, Pirkei Avos season, Yom Tov mark, Kiddush Levana customs | `fetchAll`, preview-state |
| `hebcal.js` `fetchParsha`, `fetchOmer` | hebcal.com (zip) | `parsha`, `omer`: rail chips | `fetchAll`, schedule store |
| `torahcalc.js` | torahcalc.com `/api/dailylearning` | `pirkeiAvos` (not read by the screen: `PirkeiAvosSlide` calculates it), duplicate Rambam names | `fetchAll`, preview-state |
| `sefaria.js` | sefaria.org calendars | **nothing**: dead code, not imported anywhere | none |
| `weather.js` | zippopotam.us once per zip, Open-Meteo | `weather` | stays live (not "daily Jewish data") |
| `rss.js`, `google-photos.js`, `mivtzah.js` | feeds, albums, Supabase | their own slides | stay live (admin-configured sources) |

Not a fetcher but relevant: the Kiddush Levana announcement, birthdays and chazan already use their own local calendar maths (`kiddushLevana.js`, `roster.js`, `chazan.js`, via `Intl` Hebrew calendar). They were left alone; `src/shared/hebrewCalendar.js` can replace their `Intl` use later.

## 2. Calculate or bundle

| Data | Local? | How |
|---|---|---|
| Hebrew date (day, month name, year, Hebrew text) | **calculate** | `hebrewCalendar.js`: fixed-arithmetic calendar, no ICU dependence |
| Leap years, Adar I / Adar II, 29/30-day months, 353-385-day years | calculate | same (the 14 year types) |
| Omer count | calculate | day offset from 16 Nisan |
| Parsha (Diaspora, incl. combined portions, Shabbos Yom Tov = none) | calculate | `torahReading.js`: year-type table (see 3) |
| Holidays, Rosh Chodesh (1 or 2 days), fasts and their Shabbos shifts, Chanukah, Purim / Purim Katan, special Shabbosim | calculate | `torahReading.js` |
| Zmanim (11 times + midnight + candle lighting) | calculate | `zmanim.js` + `solar.js` from lat/long/date/timezone |
| Pirkei Avos perek | already local | `pirkeiAvos.js` |
| Tehillim of the day (monthly cycle, 28 of 30 day-slots) | calculate | `tehillimCycle.js`; Psalm 119 days (25th, 26th) come from the pack |
| Molad / Kiddush Levana | already local | `kiddushLevana.js` |
| Hayom Yom text | **bundle** | text; same every year, so a perpetual table keyed by Hebrew date (about 385 entries) |
| Chumash reference of the day | bundle (could be derived) | the reading line; derivable from the parsha plus a table of portion boundaries, not built |
| Rambam 1 and 3 chapter, Sefer HaMitzvos | bundle (could be derived) | derivable from a verified chapter table plus the cycle start; not built (see 7) |
| Tanya of the day (Chabad cycle, differs by year type) + first/last words | bundle | year-specific |
| Daily Quote, Parsha Tidbits | bundle (collected) | feeds only show today: the builder collects them (quote pool; tidbits by Shabbos + parsha name), see section 9 |
| Weather, feeds, photos | stay live | not daily Jewish data |

## 3. Local calculation: how it works and how well it matches (measured 2026-10-25)

Compared against the live sources, offline fixtures in `test/fixtures/*-parity.json`, test `test/localData.test.js`:

| What | Sample | Result |
|---|---|---|
| Hebrew date (year, month name, day, Hebrew text) vs Hebcal | every day 2019-01-01 to 2036-12-31 (6,575 days; Hebrew years 5779-5797, 7 leap years) | **100.00%** (6,575/6,575) |
| Omer | all 49 days in 18 years | **100%** |
| Parsha (English name, Hebrew name, date) vs Hebcal | every Shabbos 1990-2079 (4,390; all 14 year types) | **100.00%** (4,390/4,390) |
| Holidays/events we model (Yom Tov, Chol HaMoed, Rosh Chodesh, Chanukah, Purim, fasts, Omer days, special Shabbosim, minor days) vs Hebcal | the same 6,575 days | **100.00%** exact set match |
| Zmanim vs the Chabad.org feed the screen used | 919 values: 5 locations (Miami Beach, Brooklyn, Beverly Hills, Chicago, Seattle) x 8-48 dates over a year, 11 times + midnight + candle lighting | **98.9% identical** to the shown minute; **100% within 1 minute**; no value off by 2 |
| Zmanim for today, Miami Beach 2026-10-25 | all 12 times | identical |

How the zmanim match: sunrise/sunset = sun 50 arc-minutes below the horizon. The "halachic day" that sets the proportional hour (Shema, Shacharis, midday, Mincha) runs between the sun at zenith 91.59 degrees (fitted; it reproduces the feed's Shaah Zmanit to the second across the year). Dawn = 16.9 degrees, earliest tallis = 10.2 degrees, nightfall = 6.0 degrees (fitted; the feed's "7.083" key name is historical). The feed rounds strictly (latest times down, earliest times and nightfall up) and `zmanim.js` copies that, which accounts for the last percent. Candle lighting = displayed sunset minus 18 minutes (Chicago uses 20; per-school `settings.location.candleMinutes`).

Where local and live differ (all small, all documented):
- Coordinates: `settings.location.lat/lon` if set, else the zip geocode the weather fetcher already stores (`cache.weather.location`), else a one-off `geocodeZip` stored in `cache.geo`. Chabad's own coordinates for a zip can differ by a few hundred metres: up to about 1 minute. Elevation: `settings.location.elevation` (default 0).
- Live parse bugs fixed on the way: the feed now uses curly quotes in "Mincha Ketanah" / "Plag HaMincha" and a new title for midnight and for "Earliest Tallit (Misheyakir)" on Shabbos/Yom Tov, so the live parser silently dropped Mincha Ketana, Plag (a Track A trigger) and midnight. Fixed in `chabad.js` / `constants.js` (live mode benefits too).
- Live omits `tzeit7083deg` on Shabbos/Yom Tov (the feed says "Shabbat Ends"); local always provides it.
- Hebcal labels days before a Yom Tov Shabbos with "Parashat Pesach", "Parashat Shavuot", "Parashat Rosh Hashana" or "Vezot Haberakhah" (the Rail's Yom Tov mark regex then matches them, 116 days in 2019-2036). Local does not produce those labels, so the mark is not shown on those lead-in days. Judged a Hebcal quirk, not copied.
- Hebcal also returns `parsha: null` when the week's Shabbos is a Yom Tov; the old `fetchAll` then kept LAST week's parsha on the rail through Pesach/Sukkos. In local mode `fetchAll` clears it.
- Not modelled (left out of `events`; the screen does not read them): Molad lines, Shabbat Mevarchim, Yom HaShoah / HaZikaron / HaAtzma'ut (date-shift rules), Leil Selichot, Sigd, Yom HaAliyah, Chag HaBanot, Purim Meshulash.

Parsha method: Shabbosim are laid out from Bereshit (first Shabbos after Simchas Torah) and each non-holiday Shabbos takes the next portion; which of the seven pairs (Vayakhel-Pekudei, Tazria-Metzora, Achrei Mos-Kedoshim, Behar-Bechukosai, Chukas-Balak, Matos-Masei, Nitzavim-Vayelech) are read together depends only on the year type (Rosh Hashana weekday x year length): a 14-row table, derived from Hebcal output for 90 civil years and re-checked by the test. Ha'azinu / Vayelech Shabbosim after Rosh Hashana are handled from the previous year's table.

## 4. The pack: contents, format, size

Folder (default `data/pack/`, gitignored with the rest of `data/`, override `TACHTACH_PACK_DIR`):

```
manifest.json        format, built, from, to, sections {source, licence, note}, files {bytes, sha256}
perpetual.json       hayomYom: { "Tishrei-1": {en,he}, ..., "Adar I-30": ..., "Cheshvan-30": null }   keyed by HEBREW month + day
days-YYYY-MM.json    { month, days: { "2026-10-25": { chumash, tehillim, tanya, rambam1, rambam3, seferHamitzvot } } }   keyed by civil date
```

- Hayom Yom is the same text every year, so it is stored once per Hebrew day (about 385 entries) and **never runs out**. Only the year-specific references need a date range.
- Day sections hold the exact strings the cache already holds (`'Parshat Vayeira, 1st Portion ...'`, `'Issurei Biah - Chapter 6'`, `chaptersArabic`), so the kiosk code does not change.
- Size estimate (to be measured with real text): perpetual about 0.6 MB (385 x ~1.6 KB en+he), 15 months of day sections about 0.3 MB, about 1 MB total, about 300 KB gzipped. One file read per month, kept in memory; negligible on a Pi.
- Integrity: every file has a SHA-256 in the manifest; the loader ignores a file whose checksum does not match, an unknown format version, or a section that fails validation, and the cache simply keeps what it had.

## 5. How it is built, how far ahead, how it ships

- **Built on a dev machine, never on the Pi**: `node scripts/build-data-pack.js --out ./pack-out --from <today> --to <today + 18 months> --hayom-yom hayom-yom.json --days days.json --source hayomYom="..." --licence hayomYom="..."`. The tool fetches nothing: it takes JSON files someone collected, validates them, checks coverage and prints a report (days covered per section, Hebrew days without Hayom Yom, the Adar I / II and 30-day months in range). It **refuses a section that has no source and licence note**. `--check <dir>` re-verifies a pack.
- **Range**: at least 14 months ahead (target: build for 18, rebuild every 6 months, so there is always 12 or more months of cover). Perpetual Hayom Yom needs no refresh.
- **Shipping**: copy the folder to the Pi as `data/pack/`. Options, cheapest first: (a) `scp`/USB once a year (the owner is not a developer, so this is the weak one); (b) a Health page card "Upload data pack" that accepts the folder as a zip (new route, admin-only, writes only `data/pack/`); (c) a private repo/URL the Pi checks once a month (one request a month, not daily; the one network call that would remain). Recommended: (b).
- **Watching it**: `packStatus()` returns `daysLeft`; a Health row "Data pack: 340 days of cover" (warn under 60, bad under 14) is the natural next step (not wired: `health.js` is shared and out of this task's scope).
- **Fallbacks** (local mode): no pack or a missing day keeps the last cached text (Health shows it as old); Tehillim, date, parsha, zmanim never depend on the pack.
- **Pi network after the switch**: Chabad.org, Hebcal, TorahCalc and Sefaria calls drop to zero. What remains: weather (Open-Meteo, plus one zip geocode ever), RSS feeds, Google Photos, Mivtzah, the update check, and headless Chromium is no longer launched for Chabad pages.

## 6. Special years: what is handled and where it is tested

| Case | Handling | Test |
|---|---|---|
| Leap year, Adar I (30 days) and Adar II (29 days); Purim Katan in Adar I, Purim in Adar II | calendar maths; events | 5787 (2027): Adar I 30 = 2027-03-09, Adar II 1 = 2027-03-10; Purim Katan 2027-02-21, Purim 2027-03-23 |
| Plain-year Adar (29) | `daysInMonth` | 5788 |
| Months of 29 or 30 days; Cheshvan/Kislev vary by year type | `longCheshvan` / `shortKislev` | month lengths sum to the year for Hebrew years 5700-5900; round-trip every Shabbos of 201 years |
| 30th of a month = first Rosh Chodesh day, named after the NEXT month | `roshChodeshName` | Sh'vat 30 / Adar I 1; Adar I 30 / Adar II 1; no Rosh Chodesh on day 29 of 29-day months |
| Shabbos that is Yom Tov (RH, Sukkos, Pesach, Shavuos): no portion | `isHolidayShabbos` | 2026-09-12, 2027-04-24 give `null` like Hebcal |
| Fasts / Ta'anis Esther / Bechoros that would fall on Shabbos | shifted | all years 2019-2036 vs Hebcal, plus "never on Shabbos" check |
| Combined portions per year type; Haazinu/Vayelech after Rosh Hashana | table of 14 year types | all 4,390 Shabbosim 1990-2079 |
| Monthly Tehillim in a 29-day month (29th reads 140-150) | `tehillimForDay` | unit test |
| Day with no Hayom Yom | `perpetual.hayomYom[key] = null`: the cache gets an explicit empty entry `{en:'',he:'',none:true}` (the slide shows its empty state, never yesterday's text) | pack test |
| Hayom Yom for Adar I / Adar II | lookup tries its own key, then plain `Adar` (one shared set); the build report lists Hebrew days still missing | pack test, build report |
| Candle lighting on Friday and the eve of Yom Tov | `isErev` | test |

Unknown until the real text is in hand (the format supports every answer, the content decides): whether the source has its own Hayom Yom text for Adar I days in a leap year; whether 30 Cheshvan / 30 Kislev (complete years) and the Yom Tov days have entries.

## 7. Sources and licences

**Update 2026-10-25 (owner):** Chabad.org explicitly allows pulling its content provided it is CREDITED. Hayom Yom, Tanya, Rambam, Chumash/Chitas, Sefer HaMitzvos, Daily Quote and Parsha Tidbits (all chabad.org) may therefore go in the pack. The credit is 'Courtesy of Chabad.org' on the kiosk pages that show it (admin switch, default on) and the pack manifest records `credit: 'Chabad.org'` and `licence: 'Chabad.org — used with credit'` per section. Exception to note: Rambam / Sefer HaMitzvos reference lines come from TorahCalc's per-date API (the one the admin date-preview already uses), marked in the manifest as 'chapter references only (facts); cycle courtesy of Chabad.org'. The table below is the original analysis, kept for the record.

**Nothing copyrighted has been copied into the repo.** The build tool needs a licence note per section before it will produce any file.

| Section | Where the text comes from today | Status |
|---|---|---|
| Hayom Yom (Hebrew/Yiddish original, English translation) | chabad.org page scraped daily | **Copyright flag.** Compiled by the Lubavitcher Rebbe, published by Kehot Publication Society; the English translation and the chabad.org presentation are Kehot's / Chabad.org's. Chabad.org's terms restrict copying and automated retrieval. Bundling a full year of it is a bigger step than showing today's entry fetched live. Needs **written permission** (Kehot / Chabad.org), or a different licensed source. Do not build this section before the owner decides. |
| Tanya: daily lesson reference and first/last 8 words | chabad.org RSS + `tanya.asp` scrape | The daily division is a factual schedule; the Hebrew text of the Tanya (1796) is public domain. The excerpt is scraped from chabad.org pages that also carry copyrighted English/commentary. Safer: take the division from a stated calculation or an openly licensed source and the Hebrew words from an openly licensed Tanya text (check Sefaria's licence for that edition). |
| Chumash/Rashi, Rambam, Sefer HaMitzvos | only the reading LINE, no text | References are facts; the cycle assignment can be rebuilt independently (cycle start + a chapter table). Low risk. Chabad.org's page is the convenient but not the only source (Sefaria's calendar API and Hebcal's Torah-reading data are possible; **check each licence and attribution requirement before use**). |
| Tehillim | calculated | no text, a published cycle |
| Daily Quote, Parsha Tidbits | chabad.org RSS | now in the pack (owner decision 2026-10-25: Chabad.org allows use with credit) |
| Hebrew calendar, parsha, holidays, zmanim | calculated | no text. The calculators are original code. Hebcal and Chabad.org outputs are used only as measuring sticks for tests (dates, holiday names, times: facts); holiday and portion names follow Hebcal's spelling for compatibility. |

Candidate sources to ask about for the text (owner/rabbi decision): (1) Kehot / Chabad.org permission to bundle Hayom Yom and Chitas references; (2) Sefaria (openly licensed texts, calendar API; needs a name-mapping table for Rambam halachos, Sefaria spells them differently from Chabad.org); (3) the school's own purchased/licensed edition; (4) keep Hayom Yom live (one tiny request a day) and bundle only the rest.

## 8. What is implemented (branch claude/wizardly-ride-bnbtzj)

| Piece | File |
|---|---|
| Hebrew calendar maths | `src/shared/hebrewCalendar.js` |
| Parsha, holidays, events | `src/shared/torahReading.js` |
| Zmanim + solar maths | `src/shared/zmanim.js`, `src/shared/solar.js` |
| Tehillim cycle | `src/shared/tehillimCycle.js` |
| Same-shape facade | `src/shared/localData.js`, `src/fetchers/dataSource.js` (`sourceFor(settings, cache)`) |
| Switch wired into | `fetchAll`, `fetchZmanimOnly`, `/api/preview-state`, schedule store (zmanim + parsha), announcements (Shabbos ends), scheduler (re-fetch on switch/coordinates change) |
| Pack format + validation + cache mapping | `src/shared/dataPack.js` |
| Pack builder (pure) + CLI | `src/shared/dataPackBuild.js`, `scripts/build-data-pack.js` |
| Pack loader | `src/server/dataPackStore.js` |
| Tests + parity fixtures | `test/localData.test.js`, `test/fixtures/hebcal-parity.json`, `zmanim-parity.json`, `scripts/make-parity-fixtures.mjs` |

Not done in the first pass (all done now, see section 9): no admin UI for the switch (set `dataSource` through `PATCH /api/settings`; a one-line toggle in Health or Look & Settings is the follow-up), no Health row for pack cover, no pack upload route, no Rambam / Chumash derivation, Daily Quote and Parsha Tidbits not covered, `kiddushLevana.js` / `roster.js` / `chazan.js` still use `Intl` for the Hebrew date. Not run on the real Pi.

Decisions the owner must make: (1) permission/source for Hayom Yom text (section 7), the main blocker for a pack with text; (2) same question for the Tanya lines and the chabad.org-derived cycle assignments, or an openly licensed route; (3) how the pack gets onto the Pi (scp, Health upload card, monthly pull); (4) Daily Quote and Parsha Tidbits: drop in local mode, or keep a live fetch for just those; (5) go-live: flip `dataSource` to `local` only once a pack with Hayom Yom is installed (zmanim, date, parsha, omer, Tehillim work without it, so the switch is safe to try earlier: Hayom Yom and Chitas would then show old text); (6) confirm Psalm 119 wording for the 25th/26th (the pack supplies it).

## 9. Chabad.org text pack, credit and footnotes (2026-10-25)

**What changed**
- Sections now: `hayomYom` (perpetual), `chumash`, `tanya` (+ first/last words), `rambam1`, `rambam3`, `seferHamitzvot`, `tehillim` (Psalm 119 days only), `dailyQuote` (+ `quotePool`), `tidbits` (weekly). Format additions: `weekly.json`, `manifest.credit/licence/coverage`.
- **Builder on the Pi**: Health > Offline data > Build / refresh (or `npm run build-pack`). Reads the same Chabad.org pages the live fetchers use, one request at a time with a 1.5 s jittered pause, 3 tries with back-off per request, stops after 12 failures in a row ('blocked': what was collected is installed, run again later). State in `data/pack-work/state.json`, so it can be stopped/crashed/power-cut and resumed; a refresh seeds from the installed pack and only fetches what is new (about 430 civil days x 3 request groups + 414 Hayom Yom days + about 30 Psalm 119 days for 14 months, roughly 1 to 1.5 hours at the default pace).
- **Pack delivery**: upload card (one-file pack made by `--bundle` or downloaded from another box), or build on the Pi. Cover shown as 'covers until <date>', warns 60 days before the end, red after.
- **Local mode** reads all of it; a section the pack lacks is shown as 'Not in the data pack yet' (never yesterday's text, never a crash).

**Special years/days handled (tests in `test/dataPackChabad.test.js`)**: both Adars of a leap year (`Adar I-1..30`, `Adar II-1..29`) plus plain `Adar` fetched so later plain years are covered; days with no Hayom Yom (`null`, explicit empty page) vs a failed page (retried, never stored); 30th of the month (`X-30` keys only for months that have a 30th; Cheshvan/Kislev 30 only in years that have them, found within a 3-year horizon); Psalm 119 days = Hebrew 25th/26th, the only days Tehillim is read from the pack; Shabbos / Yom Tov / Chol HaMoed each get their own chumash reading (a Yom Tov heading is kept verbatim, not forced into the 'Parshat' shape); holiday-Shabbos weeks have no parsha so no tidbits key; resume/seed/refresh.

**What the owner must do on the Pi (once)**
1. Update the Pi (Health > Software update).
2. `cd ~/tachtach-screens && node scripts/build-data-pack.js --probe` : reads ONE day of every section from Chabad.org and prints what was found. Any line that says EMPTY or FAIL means that reader needs adjusting for the real page (send me the output).
3. If the probe is fine: Health > Offline data > Build / refresh on this Pi (leave it running; you can close the page). Check the gap list when it finishes; press Build again to retry anything that failed.
4. Only then switch Health > Offline data to Local. Re-run the build every few months (the card warns 60 days before the end) and now and then to grow the Daily Quote pool and Parsha Tidbits.
5. If the Pi cannot reach chabad.org (or is blocked): build on any computer with `node scripts/build-data-pack.js --fetch --bundle pack.json --out ./pack-out` and upload `pack.json` on the same card.

**Known limits**: the per-date page URLs and heading selectors are unverified (sandbox is blocked); Daily Quote and Tidbits can only be collected as they are published (the pool and the same-portion fallback cover the gaps); Hebrew text for Chumash/Tehillim/Tanya headings comes from the he.chabad.org twin pages and falls back to empty if absent; not run on the real Pi.

