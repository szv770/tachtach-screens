# Spec 1 — Easier message posting from admin

Status: SPEC (not built). Shared rules: [README.md](README.md) (C1-C9).
Goal in one line: **from a phone, with the keyboard already open, a message is on the TV in under 15 seconds, and the person always knows what the TV is going to look like.**

---

## 0. Audit of today's flow (read from the code, 2026-10-26; not re-run on a device)

### 0.1 Every way to put words on the screen today

| Door | Where | Files | What it makes | Taps to a post (best case) |
|---|---|---|---|---|
| **Quick message from a template** | Bottom bar `＋` > Quick message > pick > fill blanks > Post | `NewSheet.jsx`, `QuickAnnounceSheet.jsx`, `quick/QuickFill.jsx` | "Notice" layout slide/banner/takeover from a saved template | `＋`, Quick, template, type blank, Post = **5 taps + typing** |
| **Write your own** (inside the Quick sheet) | same sheet, button 'Write your own' | `QuickAnnounceSheet.jsx` `WriteYourOwn` | A **Big words slide only** (no banner, no takeover, no preview), 4 length chips | `＋`, Quick, Write your own, type, Post = **5 taps + typing** |
| **Announcement / Banner / Takeover** | `＋` > one of three cards | `NewSheet.jsx` > `announcements/AnnouncementComposer.jsx` (832 lines) | Any of the 7 layouts x 26 styles, `display` slide/banner/note/takeover | `＋`, kind, type, scroll to When, Post = 4 taps + scrolling a long form |
| **Announce tab > Announcements** | Announce area | `AnnouncementsPanel.jsx` (Drafts / Live / Scheduled / Paused / Archived, **Again...** menu, Pause, Edit) | re-use of an old post | Archived > Again... > pick length = 4 taps |
| **Quick messages tab** (manage + Use) | Announce > Quick messages | `quick/QuickTemplatesTab.jsx`, `TemplateEditor.jsx` | template library (mine / shared) | n/a |
| **Letters tab** | Announce > Letters | `letters/LettersTab.jsx`, `LetterTools.jsx` | saved Letter/Sicha text, Post again | n/a |
| **Home quick actions** | Home | `Home.jsx` (new announcement, Change tomorrow, Pause/Resume) | opens the composer | 2 taps then the long form |
| **Freeze > Message** | Home > Freeze card | `FreezeControl.jsx` (120 chars, Plain/Terminal) | blanks the screen with words | separate world, own timer |
| **Kiddush Levana / Chazan / Birthdays** | automatic | `kiddushLevana.js`, ... | virtual items, not posts | n/a |

### 0.2 What is already good (keep)

- Posting as `announcements.post` is allowed to the "Messages only" preset; takeovers need `announcements.takeover`.
- The "Posted to screen" toast has **Undo** for quick posts; a poster without `announcements.delete` may remove **their own** post for 30 minutes (`ownPost.js` `canUndoOwn`). History also keeps snapshots (`announcement.create` is an `UNDO_KINDS` kind).
- Per-person **recent chips** for name/person/place blanks (`quick-templates.json` `recents`), template blanks typed (`name/person/place/day/time/text`), a **live preview** card in the fill step (`NoticePreview`), length chips with "Rest of today".
- The takeover **conflict dialog** (another takeover already on), start/end times, recurrence, Shabbos-end shortcut ("Until end of Shabbos") in the composer and in Again....
- The composer can already hold everything a post needs (layouts, 26 styles, banner movement, hold, fullscreen).

### 0.3 Rough edges found (these are what the redesign fixes)

| # | Rough edge | Evidence | Effect |
|---|---|---|---|
| E1 | **You must know the "kind" before you write.** Quick vs Announcement vs Banner vs Takeover are four cards on `＋`; picking wrong means starting again. | `NewSheet.jsx` NEW_KINDS | Slows the first tap; new editors freeze. |
| E2 | **"Write your own" is a dead end.** No preview, no banner/takeover choice, always Big words; to change anything you must leave and retype in the composer. | `WriteYourOwn` | The most common emergency ("Mincha at 2:15 today") cannot be a banner without retyping. |
| E3 | **The composer is one long form** with sections in a fixed order (Show as, Layout, Text, Look, While this is showing, When, Movement); the thing you need (When) is near the bottom, Post is a long scroll away on a phone. | `AnnouncementComposer.jsx` section order | Not "obvious". |
| E4 | **No "repeat last", no favourites, no recent templates.** The template list is a flat list; "Again..." exists but only inside Announce > Archived/Live rows. | `QuickAnnounceSheet.jsx`, `AnnouncementsPanel.jsx` `AgainMenu` | The same Friday/Monday messages are rebuilt weekly. |
| E5 | **Schedule-for-later exists only in the composer** ("When" start picker). Quick has none. | `QuickFill.jsx` (lengths only) | "Post this at 7 tomorrow" needs the long form. |
| E6 | **Undo is inconsistent.** Quick posts show "Posted to screen + Undo"; composer posts show a plain toast ("Posted"). | `useAdminState.js` `quickPostAnnouncement` vs `createAnnouncement` | People are afraid to post. |
| E7 | **Duration language differs per door**: quick = 15 min / 1 hour / Rest of today / Until I remove; composer = start/end date-time pickers; Again... = same-as-last / 15 / 60 / end of day / **end of Shabbos**; slide `seconds` is a third number. | three places | Confusing; "until end of Shabbos" is missing from Quick. |
| E8 | **No single place says what the TV will do.** Takeover pauses everything, banner never pauses, hold replaces the slide area, Shabbos-hidden slides vanish, Birthdays only on birthday days. The admin knows only per feature. | CLAUDE.md rules; `Home.jsx` 'On the screen now' lists live posts only | Surprises ("why did the schedule vanish?"). |
| E9 | **Double-tap posts twice.** Buttons disable while `busy`, but there is no server-side de-duplication if the request is retried on a flaky phone connection. | `QuickFill.jsx` `busy` only | Two identical banners. |
| E10 | **Where it shows = one hidden word.** There is no "audience" idea; fine today (one screen) but the cloud plan has several screens per org (device ids). | CLOUD-PLAN section 11 | Needs a reserved field now so data does not need a migration. |
| E11 | **Hebrew is an afterthought** in Quick (optional second box) and a second field in the composer; no "this is Hebrew" detection for the preview direction beyond `dir="auto"`. | `WriteYourOwn` | OK but invites mistakes. |
| E12 | **Freeze > Message** is a 4th, unrelated way to show text and uses its own 120-char box. | `FreezeControl.jsx` | Keep (it is a different job: blank the screen) but link it from the Post sheet ("Need the whole screen blank? Freeze"). |

---

## 1. User story (plain English)

> "I'm the office manager, standing in the hallway with my phone. The rebbe just said Mincha is moved to 2:15. I open the admin, tap **Post**, and the keyboard is already up. I type 'Mincha moved to 2:15'. Under the box I can already see how it will look on the TV. It says it will show as a **banner for the rest of today** (that's what I picked last time). I tap **Post**. A bar says 'On the screen. Undo - Edit'. Done in ten seconds.
>
> On Friday I tap the same button, tap **Repeat last** and it's back up with a fresh length. For a trip, I tap ★ 'Trip leaves at ___' and fill in 9:15. For something important I pick 'Takeover', and the page tells me 'This will pause every other slide for 15 minutes'. If the rebbe wants it tomorrow at 7, I tap **Later**, pick 'Tomorrow 7:00', post, and the page shows it in 'Coming up'.
>
> At any time a small card tells me exactly what is on the TV right now and what would change if I post."

Success measures (checked by hand on a phone, not telemetry): median time from tapping `＋` to the toast under 15 s for a plain message; at most 3 taps for the plain message; template path at most 4 taps; no one can post to a screen without seeing a preview.

---

## 2. Data model + file

### 2.1 Posts: no new shape, two reserved fields

Announcements stay exactly as in `src/shared/announcements.js` (`display`, `content`, `look`, `slide`, `banner`, `takeover`, `when`). Additions (both optional, sanitised in `src/server/announcements-model.js`):

```js
origin: 'post' | 'quick' | 'composer' | 'letter' | 'again' | null   // how it was made; for the History line and for tuning defaults. Never used for rules.
audience: { screens: null | [deviceId, ...] }   // null = every screen (all that exists today). Reserved for the cloud plan's multi-screen orgs (CLOUD-PLAN 11); ignored until devices exist. Max 20 ids, each ^[A-Za-z0-9-]{1,64}$.
clientRequestId: string (uuid)                  // de-duplication, see 5.2; NOT stored beyond 2 minutes in memory.
```

### 2.2 Per-person posting preferences

Stored beside the quick templates in the existing owned document (`data/quick-templates.json`, store `src/server/quickTemplatesStore.js`) as `prefs[userId]` next to the existing `recents[userId]`:

```json
"prefs": { "<userId>": {
  "starred": ["<templateId>", "..."],          // max 12
  "recentTemplates": ["<templateId>", "..."],  // last 8 used, newest first
  "last": { "display": "banner", "lengthKey": "eod", "layout": "bigwords" },   // remembered defaults
  "lastPostId": "<announcementId>"             // for Repeat last (my own newest post)
} }
```

Class P0 (settings of a person, no student data). Wrong ids are dropped on read. Per CLOUD-PLAN 8.1 it is the same `quick-templates` doc, one org.

### 2.3 Pure modules (new, `src/shared/`, all unit tested)

- `postDefaults.js`: `suggestLayout(text)` (a time like `2:15`/`7 PM` -> `quicktime`; 3+ short lines or lines starting `-`/`*`/numbers -> `list`; <= 6 words -> `bigwords`; otherwise `bigwords` with fit auto; **never** overrides a layout the person chose); `defaultsFor(prefs, canTakeover)` (last used else slide + rest of today); `lengthChips(now, zmanim, tz)` (15 min, 1 hour, Rest of today, **Until end of Shabbos/Yom Tov when one is coming**, Until I remove, Pick a time); `laterChips(now, zmanim, tz)` (Tonight 6:00 PM, **Before candle lighting** on Thursday/Friday, Tomorrow 7:00 AM, **After Shabbos**, Pick); `effectNote(display, minutes)`.
- `rotationNow.js` (**extracted** from `src/screen/App.jsx` lines ~141-161, the filters for Birthdays / Chazan / Daily Story / hide-on-Shabbos / Pirkei Avos / takeover pick / banners / notes): `whatShowsNow(state, now, { draft })` returns
  ```js
  { freeze: null|{mode,until}, takeover: null|{id,label,until,pausesSlides:true}, countdown: null|{...},
    banners: [{id,label,until}], notes: [{id,label}],
    slides: [{ id, label, seconds, kind: 'slide'|'message'|'builtin' }],     // in rotation order
    hidden: [{ id, label, reason: 'off'|'shabbos'|'noBirthdays'|'noChazan'|'seasonal'|'noStory'|'expired'|'notYet'|'paused' }],
    totalSeconds, nextChange: { at, what } }
  ```
  `draft` = a post not yet saved: the same function is run with and without it so the sheet can say "Posting this will: pause 11 slides for 15 min". **Single source of truth with the kiosk** (the kiosk imports the same function instead of its inline filters), so the summary can never disagree with the TV. Names of students are NOT in the result (Birthdays shows as "Birthdays (3 today)", never names).

---

## 3. Admin UX

### 3.1 Principles

1. **One door**: `＋` opens the **Post sheet**. The four cards on today's `＋` sheet become the "How should it show?" row inside it (so the kind is chosen last and can be changed with the text kept).
2. **Type first.** The message box is focused when the sheet opens; everything else already has a sensible value.
3. **Always a live preview**, the same real kiosk components (`AnnouncementPreview.jsx`), directly under the box.
4. **Defaults remember you** (last display + length), and are safe (a takeover is never the default; it needs one explicit tap).
5. **"More options..." expands in place** into today's composer (same item, nothing retyped) for layouts, styles, recurrence, hold, banner movement.
6. **Undo and Edit on every post**, same toast everywhere.

### 3.2 Wireframes (phone, 390 px wide)

**A. The `＋` button.** Bottom bar stays `Home · Screen · ＋ · Schedule · Announce`. Tapping `＋` opens the Post sheet directly (people with only other capabilities, e.g. `slides.edit`, still get the old New menu: "New slide / Upload / Announcement").

```
┌───────────────────────────────────────┐
│ Post                              ✕   │   <- sheet, keyboard already up
│ ┌───────────────────────────────────┐ │
│ │ Mincha moved to 2:15|             │ │   <- message box, autofocus, 2 rows, dir=auto
│ └───────────────────────────────────┘ │
│  + Add Hebrew                         │   <- reveals a second box (rtl)
│                                       │
│  Start from   ↻ Repeat last           │
│  ★ Trip leaves at __   ★ Class moved  │   <- chips: Repeat last, starred, recent
│  ◦ Shiur tonight at __    All ▸       │
│                                       │
│ ┌ How it will look ─────────────────┐ │
│ │        (live kiosk preview)       │ │   <- the real components, 16:9, scaled
│ │   Mincha moved to                 │ │
│ │          2:15                     │ │
│ └───────────────────────────────────┘ │
│  Show as   [Slide] [Banner] [Side note]│  <- chips; Takeover chip only with the capability
│            [Takeover]                 │
│  Pauses nothing. Takes its turn.      │  <- one-line effect, changes with the chip
│  For       [15 min][1 hr][Today ✓]    │
│            [Until Shabbos][Until I remove][Pick…]
│  When      [Now ✓] [Later…]           │
│  On        This screen (all screens)  │  <- read-only today
│                                       │
│  What's on the screen now ▸ (3 live)  │  <- see C below
│ ┌───────────────────────────────────┐ │
│ │      Post to screen   (sticky)    │ │   <- sticky above keyboard
│ └───────────────────────────────────┘ │
│  More options…        Save as draft   │
└───────────────────────────────────────┘
```

Behaviour notes: Post is disabled until there is text (or all template blanks are filled); the button label says what will happen ("Post as banner for today", "Schedule for Tue 7:00 AM"); `Enter` on a physical keyboard posts, `Shift+Enter` makes a new line; input `enterkeyhint="send"`; text fields are 16 px (no iOS zoom), all buttons >= 44 px.

**B. Template chip tapped** ("Trip leaves at ___"): the message box turns into the template's blanks in place; the same preview updates as each blank is typed; recents chips under name/person/place blanks (existing).

```
│  Template ★ Trip leaves at ‹time›   ✕ │   <- ✕ goes back to free text
│  Time  [ 9:15 AM ▾ ]                  │   <- native time input
│  Where [ the bus ] ◦ Front gate ◦ Zal │   <- recents
```

**C. "What's on the screen now"** (read-only card, also on Home replacing today's 'On the screen now' list). Collapsed one-liner in the sheet, expands on tap:

```
┌ On the TV right now ──────────── 2:04 PM ┐
│ Nothing is taking over.                  │
│ Banner   Mincha moved to 2:15   until 6 PM
│ Side note  Kiddush Levana tonight        │
│ Rotating (9 slides, 2 min 40 s a loop):  │
│   Zmanim 15s · Schedule 20s · Limudim 15s│
│   Birthdays 15s (3 today) · Message 12s… │
│ Not showing: Daily Story (off) ·         │
│   Chazan (nobody scheduled) · Pirkei Avos (out of season)
│ Next change: Banner ends 6:00 PM         │
└──────────────────────────────────────────┘

If you post this as a TAKEOVER:
  "Pauses 9 slides for 15 min. Banner stays. Ends 2:20 PM."   <- computed with draft
```

Wording rule: sentences, no codes; reasons come from one table (`hidden.reason` -> words). Takeover and Freeze are shown first and in the accent colour because they hide everything else.

**D. Later... picker** (bottom sheet over the Post sheet):

```
│ Post later                            │
│  [Tonight 6:00 PM]  [Tomorrow 7:00 AM]│
│  [Before candle lighting 3:52 PM]     │   <- only Thu/Fri, from zmanim
│  [After Shabbos]    [Pick date & time…]
│  It will go live at Tue 7:00 AM and   │
│  show for "Today" (until 11:59 PM).   │
```

Rule: **"For" counts from the start time**, and the summary line says so in words (fixes E7).

**E. Toast after posting** (same for every door):

```
 ✓ On the screen · banner until 6:00 PM      [Undo]  [Edit]  [See it]
```
`Undo` = delete (own-undo rule, no extra capability for 30 min); `Edit` re-opens the Post sheet filled with this post (a PUT, not a new post); `See it` opens Live Preview jumped to it (existing `openRequest` pattern). The toast stays 15 s (today's is shorter) and is reachable from History afterwards.

**F. Desktop (>= 900 px)**: the sheet becomes a two-column dialog: left = box, chips, options; right = big live preview + the "On the TV right now" card. Same components.

**G. Posting for people who may not**: `messages`-preset people see Slide / Banner / Side note and (without the cap) no Takeover chip; if a template is marked takeover and they lack the cap, the chip is shown as Slide and a quiet note says why.

### 3.3 Where things move

| Today | After |
|---|---|
| `NewSheet.jsx` four kind cards | `PostSheet.jsx`; `NewSheet` remains for non-posters, listing "Post a message" first |
| `QuickAnnounceSheet` list + `WriteYourOwn` | folded into `PostSheet` (templates are the chip row; 'All' opens today's list view) |
| `QuickFill.jsx` | reused as the blanks block inside `PostSheet` (it already has the preview and chips) |
| `AnnouncementComposer.jsx` | stays; opened by "More options..." with the draft carried over, and from Announce > Edit |
| `AgainMenu` (Announcements) | reuses `lengthChips`; adds "Until end of Shabbos" everywhere |
| `Home.jsx` 'On the screen now' | shows `whatShowsNow` summary |
| Freeze > Message | unchanged; linked from the sheet footer ("Need the whole screen blank? Freeze") |

### 3.4 Copy (plain-English table, one place `postCopy.js`)

Effect lines: slide "Takes its turn with the other slides." / banner "A strip along the bottom. Never stops the slides." / note "A small card in the side column." / takeover "Covers the whole screen and pauses everything." (existing words in `QuickFill.jsx`). Button: "Post to screen" / "Post as banner for today" / "Schedule for Tue 7:00 AM". Empty-message hint: "What should the screen say?". Error: "Could not post. Your text is still here, try again."

---

## 4. Kiosk design

No new kiosk page. Items that matter on the kiosk side:

- **Notice / Big words / Quick time** layouts already auto-fit; `suggestLayout` only picks among existing layouts, so no new fit work. Each layout's long-text behaviour is unchanged (shrink, then paginate/AutoScroll).
- The 280-character cap of the Post sheet box (soft warning at 140) keeps slides legible at distance; longer text offers "Make it a Letter/Sicha" (existing layouts that scroll finitely).
- The kiosk adopts `rotationNow.js` (the extraction in 2.3) so the admin summary and the TV can never disagree. Behaviour change: none (a pure refactor with a golden test comparing old vs new results over a month of simulated days).
- States: empty (no posts) = nothing changes; long text = existing fit; Hebrew/English/both = existing `dir="auto"` handling; portrait = existing takeover top-band layout.

---

## 5. API + permissions

### 5.1 Endpoints

| Method + path | Change | Capability |
|---|---|---|
| `POST /api/announcements` | accepts `origin`, `audience`, `clientRequestId`; unchanged otherwise | `announcements.post` (takeover body also needs `announcements.takeover`, existing `writesTakeover`) |
| `PUT /api/announcements/:id` | used by the toast's Edit | `announcements.edit`, **or own post < 30 min** (extend `canUndoOwn` to edits, same rule) |
| `DELETE /api/announcements/:id` | unchanged (Undo) | `announcements.delete` or own-post rule |
| `GET /api/quick-templates` | response gains `prefs` for the caller only | `announcements.post` |
| `PUT /api/quick-templates/prefs` (new) | body `{ starred?, recentTemplates?, last?, lastPostId? }`, 8 kB limit | `announcements.post` (self only; the store reads the user id from the session, never from the body) |
| `GET /api/announcements/preview-now` (optional, only if client-side is not enough) | returns `whatShowsNow` for a draft | `announcements.post` |

### 5.2 De-duplication (fixes E9)

`POST /api/announcements` keeps the last 200 `clientRequestId`s per user for 2 minutes in memory; a repeat returns the **same created item** with `200` and header `X-Duplicate: 1` instead of creating another. Cloud: the same table `idempotency_keys(org_id, user_id, key, response_id, created_at)` with a 2-minute TTL job.

### 5.3 Limits

Body 64 kB (unchanged; the Post sheet sends well under 4 kB); message box 280 chars per language (server hard cap stays the existing model limits); `starred` 12, `recentTemplates` 8, `audience.screens` 20.

---

## 6. Security and privacy

- Text is React text only; the preview uses the real kiosk components, which already escape. No HTML/markdown.
- Student names typed in free text are P2 in effect. Checked in the code: the activity line is already generic (`activity.js:51` "Posted an announcement"), **but the undo/History label includes the post text** (`undo.js:57` `Posted “<first line>”`) and the 120 kB snapshot holds the whole item. Decision needed (Q in QUESTIONS-FOR-OWNER): keep the text in History (useful, visible only to people who can see announcements, `shared: true`) or truncate the label to 40 characters and mark snapshots of posts that came from a template with a name blank as P2 so the Mode L cloud never receives them. Push notifications for new posts never include the text. The live view already filters drafts/later posts (`viewerAnnouncements`).
- `clientRequestId` is a random uuid (no personal data), memory only.
- `prefs` are per user and never readable by another user (store enforces by session id, same pattern as `ownedStore.js` "not found, never forbidden").
- Takeover remains capability-gated server-side; the chip hiding is cosmetic only.
- Rate limit: existing mutation limiter; add a per-user cap of 30 posts / 10 minutes with a plain message ("Slow down: 30 posts in 10 minutes").
- `audience.screens` is ignored by the kiosk until the cloud plan exists, so it cannot be used to hide a post today; when it is used, server filters per device token, not in the browser.

---

## 7. SaaS fit

- All new state is in existing org documents (`announcements`, `quick-templates`); the new store functions take `ctx` first (C1). `prefs` is keyed by `userId` inside the org doc (cloud users belong to one org per login, CLOUD-PLAN 14.4).
- `audience.screens` = device ids from `devices`; the Post sheet's "On" row becomes a multi-select only when the org has more than one screen; a device with a single screen never shows it.
- "Until end of Shabbos" needs candle lighting/tzeis for the org's location (already in `cache.zmanim`; in the cloud, `shared_cache` by location). No timezone assumptions: all chips use `settings.location.timezone`.
- Feature flag: none (core). Texts live in `postCopy.js` (one table) so an org can later localise.
- Idempotency table is org-scoped.

---

## 8. Tests

- `test/postDefaults.test.js`: `suggestLayout` table (times, lists, short, long, Hebrew-only), never overrides an explicit choice; `defaultsFor` (no prefs, last used, no takeover cap); `lengthChips` (Thursday night -> includes Shabbos; Yom Tov; Friday after candle lighting; DST day); `laterChips` (before candle lighting only Thu/Fri).
- `test/rotationNow.test.js`: golden table of states: nothing; one takeover (pauses slides, banners stay); two takeovers rotate; banner + note; hide-on-Shabbos slide at 17:00 Friday vs Sunday; Birthdays off with nobody/on with 3 (no names in output); Chazan nobody; Pirkei Avos out of season; scheduled later; expired; paused; freeze on; draft insertion; DST; plus **parity test**: kiosk list (old inline filters, kept as a fixture function) equals `rotationNow` over 30 simulated days.
- `test/announcements.test.js` additions: `origin`/`audience` sanitised; bad ids dropped; `clientRequestId` de-dup (second call returns the first item, only one stored).
- `test/permissionsCaps.test.js`: Messages-only can PUT own post < 30 min but not others'; PUT prefs allowed for post cap, 403 otherwise; prefs never leak across users.
- Admin pure-helper tests in the style of `slidePopup.test.js` for chip -> body building (`buildPostBody(state)`): slide/banner/note/takeover, "Later", "Until I remove", Hebrew-only, template path equals the existing `buildAnnouncement`.
- Kiosk lint extension (C9) is unaffected (no new kiosk file).
- Manual check list on a real phone (390 px light + dark): keyboard overlap, sticky Post, 44 px targets, one-hand reach.

---

## 9. Size estimate: **L** (about 4-5 days)

`PostSheet.jsx` + chips + Later picker (1.5 d), `postDefaults.js` + `postCopy.js` + tests (0.5 d), `rotationNow.js` extraction from `App.jsx` with parity tests (1 d, the risky part), prefs store + routes + dedupe + own-edit rule (0.75 d), toast with Undo/Edit/See it everywhere + History wording + docs/search/help (0.75 d), screenshot check 390/1440 light+dark (0.5 d). Can ship in two steps: (1) Post sheet + toast + prefs (no rotationNow), (2) `rotationNow` + summary card.

---

## 10. Open questions (full list in QUESTIONS-FOR-OWNER.md)

1. Replace the `＋` four-card menu with the single Post sheet (recommended), or keep both?
2. Default for a brand-new person: Slide / Banner? Length: Today / 1 hour? (Recommendation: Slide, rest of today; remembered after the first post.)
3. Should "Repeat last" copy the text exactly, or open the sheet pre-filled so it can be tweaked? (Recommendation: pre-filled sheet, one more tap.)
4. Is the 30-minute own-undo/own-edit window right?
5. Do you want per-screen targeting visible now (greyed "All screens") or hidden until a second screen exists? (Recommendation: hidden.)
