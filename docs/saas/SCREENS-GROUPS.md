# Screens, screen groups and per-screen targeting: the design

Status: **design only, nothing built** (2026-10-26). Builds on `CLOUD-PLAN.md` 6.2 (`devices`), 10 (check + nudge), 11 (pairing, tokens), **11.6** (per-screen look overrides, owner decision), 14.4 (one login, per-org memberships), `FIT-RULES.md` (every rule applies), `STORAGE-INTERFACE.md` (`ctx`, document registry) and `NEXT-STEPS.md` N6 (`resolveSettings`), N11 (`buildState(ctx)`), N15 (identity/membership split).
Audience: the owner first (sections 0, 1, 7, 13, 14), then whoever builds it.

This replaces the "content stays org-wide unless a later 'screen groups' feature is added" line in CLOUD-PLAN 11.6 and answers CLOUD-PLAN **Q9** ("will any org need different content on different screens?": yes, the owner asked on 2026-10-26). CLOUD-PLAN R8 and section 24 ("per-screen different content: only if asked") are therefore now asked.

---

## 0. One-page summary

**What the owner asked for (plain English).** An org can have a few TVs. Each TV can need its own things:
- post a message to **one TV only**;
- make **groups of TVs** ("Beis Medrash screens", "Hallway screens") and post to a group;
- give a group or a single TV **its own look** (portrait/landscape, forced dark theme, calmer motion) and **its own content** (which slides);
- let someone be an **editor for one group or one TV only** ("Moshe can post to the Hallway screens, nothing else").
- With one TV, or when nothing is set up, **everything works exactly as today**.

**The design in ten lines.**
1. Every org has a **Screens list**. Today's TV becomes the first entry, "Main screen", automatically. Nobody has to do anything.
2. A **screen group** is a named set of screens. In v1 a screen is in **at most one group** (its "area"); posting can still pick several groups and screens at once.
3. Messages (slide, banner, note, takeover) and slides get one optional field, **"Which screens?"** (`audience`). Empty = **All screens** (today's behaviour, and it includes screens added later).
4. Look settings: **org default < group < screen**, per setting, through one pure function `resolveSettings(org, group, screen)`.
5. The **server** works out each screen's own state. A screen only ever receives what is meant for it (a hallway TV never holds the office-only message).
6. Each screen proves who it is: today's TV by being on loopback (unchanged); every other screen by a **device token** from pairing (CLOUD-PLAN 11). One box drives **one screen**.
7. Editors get a **scope** on their membership: "All screens" (default, today) or "Some screens" (groups and/or single screens). Scoped editors can post, edit and control only inside their scope; org-wide things (schedule, settings, people, roster) are closed to them. Fail closed everywhere.
8. The Post composer gets one row, **"Which screens? All screens"**, hidden until the org has a second screen.
9. Deleting a group or a screen never makes content spread to more screens: targeted content stops showing and is flagged, people scoped to it lose that part of their scope (never gain "all").
10. Most of this can ship **before the cloud**, on today's Pi, with a second TV paired to the main box (section 11).

**Size**: about 6 build steps, S to L, roughly 6-9 weeks of focused work in total (section 12). Steps 1-2 are invisible plumbing that can start now.

---

## 1. Words used here

| Word | Meaning |
|---|---|
| **Screen** | One TV and the one box (Pi / PC / stick) that drives it. Has an id (`scr_...`), a name ("Lobby TV"), an optional group, optional look overrides. In the cloud: one `devices` row (CLOUD-PLAN 6.2). |
| **Main screen** | The screen that exists automatically in every org: today's loopback TV on the Pi. Can be renamed, not deleted while it is the only one. |
| **Screen group** (UI: "Screen group", code: `screenGroups`) | A named set of screens, e.g. "Hallway". **Not** the existing `settings.scheduleGroups` (grades / shiurim that watch one screen, `src/shared/scheduleGroups.js`). Code must never call screen groups just `groups`. |
| **All screens** | Not a stored group. The meaning of "no audience set": every screen of the org, now and later. |
| **Audience** (UI: "Which screens?") | Where an item shows: `null` (All screens) or `{ groups: [...], screens: [...] }`. |
| **Override** | A look setting a group or screen has that differs from the org default ("this screen differs: Dark theme"). |
| **Scope** (UI: "Where can they post?") | Which screens a person's membership may act on: All screens, or a list of groups/screens. |
| **Satellite screen** | Before the cloud: a second TV whose box is a thin browser player pointed at the main Pi (section 11). |

---

## 2. What exists today (checked in the code)

- **One TV per install, identified by the network.** `/stream` (`src/server/routes/screen.js:19`) treats a client as the real screen only when `isLocalRequest(req)` (loopback peer, no proxy headers); everyone else is a preview client. `/api/state` is `stateGate` (`src/server/live.js:104`: kiosk, signed-in person, or live viewer). There is no screen id anywhere.
- **One in-memory screen state.** `src/server/screenState.js` holds one `state` + one `display` (module level, FIT-RULES rule 10 offender).
- **One SSE pool.** `src/server/sse.js` `clients` map; `broadcast()` writes to every non-preview client, i.e. "the TV(s)".
- **`/api/state` is assembled inline** in `src/server/app.js:281-333` from 14 sources (N11 moves it into `buildState(ctx)`).
- **Announcements** are pure-rule items (`src/shared/announcements.js`): `isActive`, `selectActive`, `pickTakeover`, `findTakeoverConflicts`. Nothing about where they show.
- **Permissions** (`src/shared/permissions.js`): capabilities + presets + per-person overrides, enforced by path rules in `canDo()`; reading is open to every signed-in person except team/activity/system. No notion of "which part of the org".
- **People** (`src/server/users.js`): one record per person per install with `role`, `preset`, `overrides`. N15 splits identity from membership; the scope in this design lives on the **membership**.
- **Freeze** (`src/server/freeze.js`): one org-wide freeze, broadcast to all screens and previews.
- **Name clash to avoid**: `settings.scheduleGroups` already means "groups of students watching one screen". The composer already has a "Where (optional)" field for an event's place (`AnnouncementComposer.jsx:478`), so the new control is called **"Which screens?"**, never "Where".

---

## 3. Data model

### 3.1 The `screens` document (org scope, class `org`)

One new document, `screens.json` today, `org_documents (org_id, 'screens')` in the cloud. Registered in the store registry (`STORAGE-INTERFACE.md` 2) and in `CODE-INVENTORY.md` section 1 in the same commit (FIT-RULES 3).

```js
{
  version: 1,
  screens: [
    { id: 'scr_main', name: 'Main screen', groupIds: [],          // v1: at most one id
      overrides: { },                                              // look overrides (3.3), whole-key
      content: { },                                                // content overrides (3.4)
      kind: 'local',                                               // 'local' (loopback TV) | 'paired'
      createdAt, retiredAt: null },
    { id: 'scr_k3f9', name: 'Hallway TV 1', groupIds: ['grp_hall'], overrides: { theme: 'dark' }, kind: 'paired', ... },
  ],
  screenGroups: [
    { id: 'grp_hall', name: 'Hallway', overrides: { orientation: 'portrait' }, content: { }, createdAt },
  ],
}
```

Rules:
- Ids are server-generated (`scr_` / `grp_` + 10 random base32 chars), never from the request, never reused after deletion (a retired id stays retired so an old audience can never point at a new screen).
- `name` 1-40 chars, unique per org (case-insensitive) within screens and within groups.
- Limits: 25 screens, 12 groups per org (CLOUD-PLAN `tenants.limits.maxScreens` decides the real number in the cloud).
- **Nothing secret in this document.** Device tokens live elsewhere (3.5). So the admin can read it freely and the kiosk can get its own row.
- **Missing document = the implicit default**: `{ screens: [{ id: 'scr_main', name: 'Main screen', groupIds: [], kind: 'local' }], screenGroups: [] }`. It is computed, not written, until an admin changes something (so a single-screen install's `data/` stays byte-identical, STORAGE-INTERFACE goal 1).

### 3.2 Membership: one group per screen in v1, stored as a list

`groupIds` is an array so many-to-many can come later **additively**, but v1 accepts at most one entry. Why one:
- Look overrides need a single answer. With two groups ("Hallway" says portrait, "Upstairs" says landscape) the admin would need precedence rules among groups. A school administrator on a phone should never meet that.
- Posting to several places is still easy: the "Which screens?" picker allows several groups and several single screens at once.
- If an org later needs overlapping groups (e.g. "Bochurim-facing" across rooms), add them as **targeting-only tags** (no overrides) rather than true groups. Open question Q1.

### 3.3 Look overrides: `resolveSettings(org, group, screen)`

- Pure function in `src/shared/screenSettings.js`, used by the server (`buildState`), the admin (Look pages, preview "as screen X") and tests. The kiosk receives already-resolved `settings`, so **kiosk code does not change**.
- Precedence per top-level key: **screen override ?? group override ?? org value**. Whole-key replace (not deep merge): an override of `motion` is the whole `motion` object. Reason: "this screen differs: Motion" must mean one clear thing, and the admin UI always writes the full value of a key anyway. Open question Q11.
- Only keys in an allow-list may be overridden: `OVERRIDABLE_KEYS` in `src/shared/settingsMerge.js`, scope tag `'org+box'` from N6. Proposed list:

| Overridable (look of one TV) | Org only (never per screen) |
|---|---|
| `orientation`, `portraitLayout`, `clockSide`, `theme`, `themeAuto`, `motion`, `graphics`, `rail`, `layout`, `banner` (size/speed, not text), `hebrewFontScale`, `hebrewHeadingScale`, `zmanimLayout`, `scheduleLayout`, `scheduleView`, `longText`, `language`, `visibility`, `fontRoles` | `location`, `siteName`, `scheduler`, `dataSource`, `announcements`, `kiddushLevana`, `showChabadCredit`, `customTheme` (theme **definitions** stay org-wide; a screen picks one), `fonts` (uploaded files), `announceFonts`, `credit`, `scheduleGroups` (definitions), legacy keys |

- A patch to an override with a key outside the list is refused 400 (fail closed; never silently stored).
- `resolveSettings` also returns `differs: ['theme', ...]` (which keys came from group/screen), used by the admin chips.

### 3.4 Content targeting: the `audience` field

Added to every **announcement item** (all four displays: slide, banner, note, takeover; quick messages create announcements so they inherit it) and every **slide** (custom and built-in, e.g. Hayom Yom, Zmanim, Daily Story).

```js
audience: null                                  // All screens (default; also when the field is absent)
audience: { groups: ['grp_hall'], screens: [] } // Hallway screens, including future Hallway screens
audience: { groups: [], screens: ['scr_k3f9'] } // one TV only
```

Shows-on rule (pure, `src/shared/screens.js` `showsOn(audience, screen)`):
`audience == null` OR `screen.id in audience.screens` OR `screen.groupIds ∩ audience.groups ≠ ∅`.
An audience with both lists empty, or whose ids are all retired/deleted, shows **nowhere** (never falls back to "all"). Union only; no "all except" in v1 (Q12).

What can be targeted (v1 recommendation, Q3):

| Content | Targeted? | How |
|---|---|---|
| Messages: slide, banner, note, takeover | **Yes** | `audience` on the item |
| Slides (custom + built-in) | **Yes** | `audience` on the slide; the rotation order is the org order, filtered. No per-screen order in v1. |
| Daily content (Hayom Yom, Limudim, Daily Word, Daily Story, Zmanim...) | Yes, as slides | They are built-in slides, so the slide `audience` covers them |
| Schedule (entries, by-date overrides, templates) | **No**, stays org-wide | The school has one day. A screen can show a subset through a content override: `content.scheduleGroupsShown: ['aleph','beis']` (reuses the existing schedule groups) |
| Countdown alerts (from the schedule) | Org-wide | A screen/group content override `content.countdown: false` turns the overlay off there (e.g. an office TV) |
| Freeze / Blank | **Yes** | `target` audience on the freeze (section 8); emergency freeze is always all screens |
| Screen commands (pause, next, reload, blank) | **Yes** | already per device in the cloud (`device_commands.device_id`) |
| Kiddush Levana takeover | Org-wide content; "already shown" recorded **per screen** | `kiddush-levana.json` keyed by screen id |
| Roster/birthdays, chazan | Org-wide content | Mode L: only the People box shows names (CLOUD-PLAN 9.7), unchanged |
| Live view (`/live`) | Shows **one** chosen screen's state (default Main screen) | `live.json` gets `screenId` (Q10) |

Content overrides (`content` on a group or screen) are a short allow-list too: `scheduleGroupsShown`, `countdown`, `rail.cards` (which rail cards), nothing else in v1.

### 3.5 Device credentials (secret, separate)

- Before the cloud: `screen-devices.json`, class `secret`, listed in `SECRET_FILES` (0600), never in `/api/state`, history, undo, export without re-check: `[{ screenId, tokenHash, prevTokenHash, prevValidUntil, pairedAt, pairedBy, lastSeenAt, lastIp, revokedAt }]`. Tokens stored only as SHA-256 (same rule as every token today).
- In the cloud: the `devices` table (CLOUD-PLAN 6.2) already has exactly these columns. **`devices.id` = screen id**; the `screens` document keeps name, group, overrides; the `devices` row keeps credentials, health and `last_state`. One screen = at most one active device row.
- The loopback Main screen needs no token (it is identified by `isLocalRequest`, as today). In the cloud the Pi's agent has a device token like every other screen, and the agent's local kiosk is "that screen".

### 3.6 Scope on the membership

Today `users.json` person: `{ role, preset, overrides }`. Add `scope`:

```js
scope: undefined | null           // All screens (default; every existing person)
scope: { groups: ['grp_hall'], screens: ['scr_k3f9'] }
```

- Lives on the **membership** (N15 / CLOUD-PLAN 14.4), never on the person: a principal can be org-wide at one school and Hallway-only at another.
- Admins are always org-wide (`scope` forced null for `role: 'admin'`, like `overrides` today in `users.js:114`).
- An empty scope (`{groups: [], screens: []}`, e.g. after its group was deleted) means **no screens**: the person can still sign in and look at what they are allowed to read, and can post nowhere. Never widened to "all".

---

## 4. How a screen gets its state

### 4.1 One function, per screen

`buildState(ctx, { screenId, audienceOf: 'screen' | 'preview' | 'viewer' })` (N11) does today's 14 reads once, then:
1. `screen = screensDoc.screens.find(id)`; unknown or retired -> 404 (fail closed).
2. `settings = resolveSettings(org, groupOf(screen), screen).settings`.
3. `announcements.items = items.filter(i => showsOn(i.audience, screen))`; same for `slides`.
4. `freeze = freezeViewFor(screen)`; `kiddushShown = shownFor(screen.id)`; countdown suppressed if `content.countdown === false`.
5. Adds `screen: { id, name }` (so the kiosk can show its own name on the Health/identify overlay; no other screens' names).

The kiosk then runs **exactly today's code** on that state (`selectActive`, `pickTakeover` etc.), so a takeover aimed at the hallway pauses only hallway screens: other screens never see it.

Why server-side filtering and not "send everything, kiosk filters": a screen holds only what is meant for it (smaller state, nothing an office-only message leaks to a hallway TV, a stolen satellite token reveals only that screen's content), and it is what the cloud's device endpoint needs anyway.

### 4.2 Who is asking (identification)

| Caller | Today | With screens |
|---|---|---|
| The TV on the Pi itself | `isLocalRequest` -> the TV | Same check -> `screenId = 'scr_main'` (the `kind: 'local'` screen). Unchanged rule, no new trust. |
| A satellite screen (before cloud) | - | `Authorization`-free browser: httpOnly device cookie `tt_dev` (400 days, renewed on use, CLOUD-PLAN 11.1 browser player) -> hash lookup in `screen-devices.json` -> `screenId`. Bad/revoked/missing -> **404**. |
| A Pi agent in the cloud | - | `Authorization: Device <token>` on `GET /api/device/state` (CLOUD-PLAN 10.2) -> `devices` row -> `screenId`. |
| Admin Live Preview | session | session + `?asScreen=<id>`; the id must be in the person's **visible screens** (scope, 6.4) or 404. Default: the first visible screen. |
| Live viewer | viewer cookie | the live link's `screenId` (one screen), then `viewerState()` allow-list as today |

**Never** from the request: a screen cannot say "I am scr_x" in a query or body; only the credential decides. `?asScreen` is accepted only for a signed-in person and only within their scope.

### 4.3 Live updates per screen

- SSE (`sse.js`): each client entry gets `screenId` (kiosk/satellite) or `asScreen` (preview). Pools and caps per screen (one kiosk stream per screen id; per-address caps as today).
- Events whose payload depends on the screen (`announcements-update`, `slides-update`, `settings-update`, `freeze-update`, `screens-update`) become **content-free nudges** to screens: `{ type, data: { refetch: true } }`, and each screen re-fetches its own `/api/state`. The kiosk already copes with re-fetching instead of using the payload (FIT-RULES 6), and this is exactly the cloud's nudge model (CLOUD-PLAN 10.3), so nothing changes when the transport changes.
- Optimisation (optional): skip screens whose filtered result did not change (compare a hash of the per-screen state).
- Previews get the same nudge plus, for "as screen X", the follow payload of screen X only.
- `screenState.js` becomes a `Map<screenId, state>`; `/api/screen/report` records under the caller's screen id (from 4.2, never from the body). `/api/screen/status` and Health show every screen: online dot, last seen, current slide, display size.
- Screen commands (pause/next/blank/reload) take a target: one screen, a group, or all (default: the screen being previewed, or all when there is one screen).

### 4.4 Cloud mapping

- `GET /api/device/state`: ETag = `hash(org state version, screens doc version, screen id)`; one version bump nudges all screens of the org, each answers 304 if its own filtered state is unchanged.
- `device_commands.device_id` already supports one screen; group commands are fanned out to rows per device at insert.
- `devices.last_state` replaces the in-memory map.

---

## 5. Admin experience (phone first)

Design rule: **an org with one screen sees nothing new**, except one line on Settings: "Screens: Main screen. Add a screen". Everything below appears once there are two.

### 5.1 Screens page (Settings > Screens; admin, cap `screens.manage`)
- List: each screen as a card: name, group chip ("Hallway"), online dot + "seen 2 min ago", and gold "differs" chips ("Dark theme", "Portrait"). Tap -> the screen's sheet.
- **Add a screen**: shows the pairing step ("Turn on the new TV, type the code it shows": CLOUD-PLAN 11.1; before the cloud, section 11), then name + group.
- Screen sheet: Rename; Group (one picker: "No group / Hallway / Beis Medrash / New group..."); **Look on this screen** (list of overridden keys with "Follow the others" per key, and "Change the look of this screen" which opens the Look pages pre-set to this screen); **What shows here** ("Messages: 3 for all screens, 1 only here"; slides on/off for this screen = editing those slides' audience); Identify (flash the name on that TV for 10 s); Remove (CLOUD-PLAN 11.5 choices).
- Groups section on the same page: "Hallway: 2 screens". Group sheet: name, screens in it (checkboxes, moving a screen out of its old group, with a one-line warning), look overrides, "People who can post here" (read-only list, links to Team).

### 5.2 The "Which screens?" row in the Post composer
- One row near the top of the composer (`AnnouncementComposer.jsx`, also QuickAnnounceSheet / quick messages): **"Which screens? All screens"**. Tap -> bottom sheet with: "All screens" (radio), then "Only some screens" revealing checkboxes: groups first ("Hallway (2)"), then single screens. Live summary at the bottom: "Shows on 3 of 5 screens".
- Default: **All screens** for org-wide people; **their scope** for scoped people (a Hallway-only editor sees "Which screens? Hallway screens" and the sheet lists only what they can pick).
- Hidden entirely when the org has one screen (the field stays `null`).
- Cards in the Announcements list and on Home show a small chip when not all screens: "Hallway only", "Lobby TV only". Filter on the list: "Shows on: any / Lobby TV / ...".
- Takeover conflict warning (`findTakeoverConflicts`) only counts takeovers that share at least one screen (overlap computed with the current screens doc).
- Slides: the slide sheet gets the same row ("Shows on: All screens").

### 5.3 Look pages: "Editing the look for"
- Top of Style / Look: a picker **"Editing the look for: All screens ▾"** (also "Hallway screens", "Lobby TV"). Hidden with one screen.
- At group/screen level, each control shows whether it follows the default or differs (gold dot, same visual language as PersonAccessSheet's "differs from preset") and a **"Follow the others"** link that removes that override.
- Keys that are org-only are shown greyed with "Same on every screen" so nobody hunts for them.
- Live Preview follows the picker: "Previewing: Lobby TV".

### 5.4 Team and PersonAccessSheet
- PersonAccessSheet (`src/admin/components/PersonAccessSheet.jsx`) gets one new row under the preset: **"Where can they post? All screens | Some screens"**; "Some screens" opens the same picker as 5.2. Hidden with one screen.
- When "Some screens" is picked, abilities that are org-wide (schedule, settings, look of all screens, roster, chazan, custom days, daily word, feeds, media delete) are shown off and locked with "Not available for someone limited to some screens" (rule in 6.3). No silent drop: the sheet says it.
- Team list chips: "Messages only · Hallway", "Full editor · All screens" (scope chip only appears when the org has 2+ screens).
- A person whose scope lost a group/screen (deleted) gets a red chip "Needs new screens" and the admin's Home shows one line until fixed.

### 5.5 Home
- With 2+ screens: the TV status line becomes a small row per screen (online dot + name), "2 messages waiting for Lobby TV (offline since 10:42)".

---

## 6. Permissions: capability x scope

### 6.1 Model
- A membership has **capabilities** (preset + overrides, unchanged) and **one scope** (all screens, or a set of groups + screens). The scope applies to all of that person's screen-targetable capabilities. Not per capability: "Moshe may post to Hallway but control only Lobby" is not worth a matrix on a phone (Q7 if the owner disagrees).
- New capability `screens.manage` (group People or Screen; **adminOnly** in v1): add/pair/remove screens, create/rename/delete groups, move screens. CLOUD-PLAN 11.1 already names it.
- `look.change` for an org-wide person = change any level. For a scoped person: only the overrides of screens/groups in scope, and only if the org admin allows it (Q7; recommendation: allowed, it is their screens).

### 6.2 Scope arithmetic (pure, `src/shared/screens.js`)
- `visibleScreens(scope, screensDoc)` = all screens if scope null, else screens whose id is in `scope.screens` or whose group is in `scope.groups` (retired screens excluded).
- `withinScope(audience, scope, screensDoc)`:
  - scope null -> true.
  - audience null (All screens) -> **false** for a scoped person (it reaches screens outside their scope, including future ones).
  - else every group in `audience.groups` must be in `scope.groups`, and every screen in `audience.screens` must be in `visibleScreens(scope)`; and the audience must not be empty.
  - Group membership is resolved at check time with the current screens doc. Note: a scoped person with `scope.screens = [Lobby]` may **not** target the group Hallway even if Lobby is in it (the group can gain screens later).

### 6.3 Which capabilities a scoped membership can hold
`SCOPABLE_CAPS` = `announcements.post`, `announcements.takeover`, `announcements.edit`, `announcements.delete`, `slides.edit` (slides whose audience is within scope), `media.upload` (uploads are org files with unguessable names; needed to post a picture), `screen.control` (their screens only), `look.change` (their overrides only, Q7).
Everything else (`slides.delete` of org slides, `media.delete`, `feeds.edit`, `dailyWord.edit`, `roster.edit`, `chazan.edit`, `schedule.edit`, `customDays.edit`, `settings.change`, `team.manage`, `system.update`, `screens.manage`) is **dropped** by `sanitizeOverrides`/`effectiveCaps` when scope is not null. Fail closed: a stored grant can never resurrect it.

### 6.4 Enforcement: two layers, both required
1. **Path layer (unchanged shape)**: `canDo(membership, method, path, body)` as today, with `effectiveCaps` already narrowed by 6.3. A scoped person hitting `/api/schedule`, `/api/settings` (org PATCH), `/api/roster`, `/api/team`, `/api/screens` (manage) is refused here.
2. **Item layer (new)**: in the route/store, after loading the document, for every read and write of a targetable item:
   - **Write (create)**: `withinScope(body.audience, scope)` else refuse. For a scoped person a missing audience is **not** "all screens": the server rejects it (the composer always sends one).
   - **Write (edit/delete/duplicate/restore/pause/undo)**: the **stored** item must be within scope **and** the new audience must be within scope (cannot widen, cannot move an item out of their reach to hide it from its owner either: the new audience must also be non-empty).
   - **Read**: list endpoints and `/api/state` for a scoped person contain items that are within scope **plus** All-screens items shown **read-only** (they appear on that person's TVs, so hiding them would confuse; Q4). Items aimed only at screens outside their scope are omitted. Single-item GET of such an item -> 404.
   - Screen-level routes (`/api/screens/:id/overrides`, `/api/screen/command?screen=`, `?asScreen=`, freeze with target): id must be in `visibleScreens(scope)`, else **404**.
   - Error wording: ids the person cannot see always give the same answer whether they exist or not (404 for item/screen ids; one 400 "Pick screens you can post to" for any audience problem). Never 403-with-detail that reveals another group's screens.
3. `/api/screens` GET for a scoped person returns only their visible screens and groups (names of other rooms are org-internal but not theirs to need).

### 6.5 Where the rules live
- `src/shared/permissions.js`: `screens.manage`, `SCOPABLE_CAPS`, scope-aware `effectiveCaps(membership)`, `scopeLabel()`. Still pure data, so the admin hides/greys the same things the server refuses.
- `src/shared/screens.js`: `showsOn`, `visibleScreens`, `withinScope`, `audienceLabel`, `sanitizeAudience`, `sanitizeScope`.
- Route code calls one helper `assertItemInScope(req, storedItem, nextAudience)`; a lint-style test (6.6, test 9) fails if a route under `/api/(announcements|messages|pinned|slides|freeze|screen)` handles a write without calling it.

---

## 7. Migration of today's single screen

- No data is written at upgrade. The screens document is computed (3.1) until an admin saves something. Every existing announcement/slide has no `audience` -> All screens. Every existing person has no `scope` -> All screens. Settings are the org default; no overrides.
- **Equivalence guarantee (test)**: for a fixture `data/` with no screens document, `buildState(ctx, { screenId: 'scr_main' })` is deep-equal to today's `/api/state` body except the added `screen` key. Runs on every change.
- First "Add a screen" writes the document with `scr_main` + the new screen. From then on the UI shows the new rows.
- The `scr_main` id is fixed so existing references (kiddush-levana shown, live link) can migrate by key without guessing.
- Removing all extra screens returns the UI to the single-screen look, but leftover audiences/overrides are kept (and shown on the Screens page "1 message still aimed at a removed screen").
- In the cloud move (CLOUD-PLAN 19): MLMI's `scr_main` becomes the device row created at pairing of its Pi (pairing step "this replaces Main screen" keeps the id), so audiences and overrides survive.

---

## 8. Conflicts and edge cases

| Case | Behaviour |
|---|---|
| Message aimed at a screen that is **offline** | Nothing special: it is in the data; the screen picks it up on reconnect (the Pi keeps its last state on disk). Start/expiry rules run on that screen's clock, so an expired message is never shown late. Admin Home: "Lobby TV offline since 10:42, 2 messages waiting". |
| Screen **removed/retired** | Its id is retired, never reused. Items aimed only at it show nowhere and get a "Not showing anywhere" badge + a filter on the Announcements list. Items aimed at it and other screens keep showing on the others. People scoped to it lose that entry (see below). |
| Group **deleted** | Confirm sheet lists what is affected: "3 messages, 1 slide are aimed at Hallway; Moshe can post only to Hallway". Choices per affected kind: **Stop showing** (default; badge "Not showing anywhere") / Move to another group / Show on All screens (admin only, explicit). The screens in it become "No group" and lose the group's look overrides (their own overrides stay). Never an automatic widen. |
| Person scoped to a deleted group/screen | That entry is removed from the scope; if nothing is left the scope is **empty = no screens** (can post nowhere), red "Needs new screens" chip, line on admin Home. Never becomes All screens. |
| Screen **moved** to another group | It immediately follows the new group's look and receives the new group's content and stops showing the old group's. The move sheet says so ("Lobby TV will stop showing 2 Hallway messages"). Scoped editors of the old group lose that screen. |
| **Takeover on one screen only** | Pauses only that screen's rotation (rule "Takeovers always pause" holds per screen). Conflict check counts only takeovers sharing a screen. Live Preview "as another screen" shows that screen without the takeover. |
| Two takeovers on overlapping audiences | As today: newest active wins on each screen; share groups (`takeover.group`) rotate as today, per screen. |
| **Freeze per screen** | `freeze.json` gains `target` (audience, null = all). Scoped editors with `screen.control` freeze only their screens (target required, within scope). **Emergency** freeze is always All screens, needs an org-wide person. Scheduled freeze windows stay org-wide in v1 (can get a target later). Two freezes (all + one screen): the screen shows the more restrictive one (blank > freeze message). |
| Screen commands | Pause/next/blank/reload target one screen, a group or all; previews show which. |
| Live view | Shows its configured screen (default Main). If that screen is removed, the live link falls back to "This link is paused" (not to another screen). |
| Look override on a group, then the screen gets its own | Screen wins for that key; the admin shows "differs from Hallway: Theme". |
| Org changes a key a screen overrides | Screen keeps its override; Look page at org level shows "2 screens use their own Theme". |
| Undo | Undo records hold the full item incl. audience. Undo **re-checks scope at undo time** (a scoped person cannot undo a change to an item that has since moved outside their scope; an admin's undo of a scoped person's change works). |
| Recents / quick messages | Quick-message posts carry the audience chosen in the quick sheet (default as 5.2). |
| A scoped person's own post later re-aimed by an admin outside their scope | It disappears from their list (they cannot see it any more). Their History line stays ("Posted ... to Hallway"). |
| Mode L names | Unchanged: names only on the People box (CLOUD-PLAN 9.7). The Birthday/Chazan slides on other screens are skipped, as already designed; slide audience just narrows further. |
| Clock / timezone | One org timezone (`settings.location.timezone`), not overridable per screen. |
| Satellite loses the main box (before cloud) | Shows its last state (browser cache) while the page stays loaded; after a reload with the main box down: "Waiting for the main screen" card. |

---

## 9. History and audit entries

Org activity log (`activity.js`), name-free where names are not needed, with `area` tags so History visibility works:

| Action | Line | area |
|---|---|---|
| Post to some screens | "Posted a banner to Hallway screens" / "... to Lobby TV" | `announcement` + `screens:<ids>` |
| Re-aim | "Changed where 'Mincha moved' shows: All screens -> Hallway" | `announcement` |
| Screen added/paired | "Added a screen: Lobby TV" | `screens` |
| Screen removed | "Removed the screen Lobby TV" (+ "and wiped it") | `screens` |
| Group created/renamed/deleted | "Created the screen group Hallway", "Deleted Hallway (3 messages stopped showing)" | `screens` |
| Screen moved | "Moved Lobby TV to Hallway" | `screens` |
| Override | "Changed the look of Lobby TV: Theme Dark", "Lobby TV follows the others again: Theme" | `look` + `screens:<id>` |
| Scope change | "Moshe can now post to: Hallway screens" | `team` (admins only see team lines) |
| Freeze on some screens | "Froze Hallway screens until 2:30" | `screen` + `screens:<ids>` |

History visibility for scoped people: their own lines + shared-content lines whose `screens:` tag is within their scope or absent (org-wide). Lines about other groups are hidden.

Platform `audit_log` (cloud, CLOUD-PLAN 6.4): screen paired / revoked / wiped, scope changes on memberships (security-relevant: who can post where), group deletion with counts, `screens.manage` actions during a support visit.

---

## 10. One box = one screen (decision and reason)

**Decision: one box drives one screen.** A Pi 5 has two HDMI ports and could drive two TVs, but:
- Performance: the kiosk is tuned for **one** 4K Chromium on a Pi 5 (GOTCHAS: no blur/infinite animations, nightly restart against GPU slow-down). Two kiosks at 4K roughly double the GPU load.
- Identity: the screen id is "the credential this box holds". Two outputs would need two kiosk processes, two local identities, two SSE streams from one loopback address, and `isLocalRequest` can no longer tell them apart.
- Operations: CEC (TV on/off), display size, health, restarts, Identify and "screen offline" are per TV; one box per TV keeps every one of them one-to-one.
- Cost: a second Pi kit (~$120-160) or a ~$30 stick running the browser player is cheap compared with the complexity.

A box with two TVs on a **mirrored** HDMI splitter is simply one screen. "Second output = second screen" stays unbuilt until an org asks (it would need two kiosk profiles with distinct device tokens; nothing in this design blocks it).

---

## 11. Before the cloud: what can ship on today's single-box app

Today each Pi is a whole server with its own `data/`. Two separately installed Pis in one school are two separate "orgs" and cannot share messages. To give an org several screens **now**:

**Satellite screens.** One Pi stays the **main box** (all data, admin, fetchers). Every other TV runs a **thin browser player** (a second Pi in kiosk mode, the Windows Edge kiosk from `deploy/windows/kiosk.ps1`, or a stick PC) pointed at the main box's address with a device cookie:
1. Admin > Screens > Add a screen -> the main box shows "Open `https://<tunnel-host>/play` on the new TV and type this code" (or the TV shows a code and the admin types it, the cloud flow; either works, the second needs no typing on the TV).
2. Pairing (10-minute single-use code, hashed; CLOUD-PLAN 11.1 rules) gives the browser an httpOnly `tt_dev` cookie; the hash goes to `screen-devices.json`.
3. `/play` loads the kiosk SPA; `/api/state`, `/stream`, `/api/screen/report`, RSS/photos kiosk endpoints accept that cookie and serve **that screen's** state.
- Reach: through the existing Cloudflare Tunnel hostname (real certificate; works from any network). LAN-direct is possible later but needs a certificate the satellite trusts (the local TLS cert is for `127.0.0.1`), so tunnel first (Q5).
- **Security: this is a new gate and needs the owner's approval** (CLAUDE.md: nothing else may be opened to a visitor). The rules: a new `deviceGate` used only on the kiosk read endpoints + report; bad/missing/revoked token = **404** (never reveals the route); per-address rate limit on `/play/pair` (5/hour, like CLOUD-PLAN `pair/start`); tokens hashed; 90-day rolling with use renewal; Remove = revoke immediately (next request 404, SSE closed); no admin route ever accepts the device cookie; `isLocalRequest` rules unchanged and never consulted for satellites; the device cookie is `SameSite=Strict`, `Secure`, httpOnly, path-limited. This is the same gate the cloud's browser player uses, so it is built once.
- Limits (say so in the admin): a satellite shows nothing new while the main box is off; offline only while the page stays loaded (service-worker cache, no cold boot offline); no Mode L names (names stay on the main box: Birthday/Chazan slides skipped on satellites).

So, before the cloud, the following all ship and are kept unchanged by the move: screens document, groups, audience, overrides, scoped editors, admin UI, per-screen SSE, pairing gate. The cloud swaps only storage (Postgres) and transport (check + nudge), exactly as for everything else.

---

## 12. Build order

Sizes as in CLOUD-PLAN: S = a few days, M = 1-2 weeks, L = 3-4 weeks. Model per CLAUDE.md "Working with agents".

| Step | What | Size | Depends on | Ships before cloud? | Visible to users? |
|---|---|---|---|---|---|
| G1 | **Pure model + tests**: `src/shared/screens.js` (`showsOn`, `visibleScreens`, `withinScope`, sanitizers, labels), `src/shared/screenSettings.js` (`resolveSettings`, `OVERRIDABLE_KEYS`), scope-aware `effectiveCaps` + `SCOPABLE_CAPS` + `screens.manage` in `permissions.js` (scope always null for now, so no behaviour change) | S | N6 | Yes | No |
| G2 | **Screens document + per-screen state**: store module (factory with injected I/O, FIT-RULES 2), registry row, implicit Main screen, `buildState(ctx, {screenId})` with filtering + resolved settings, `audience` accepted/stored/validated on announcements and slides (admin-only for now), `screenState` per screen, SSE client `screenId` + refetch nudges, equivalence test (7) | M | G1, N11 | Yes | No (one screen) |
| G3 | **Satellite screens**: pairing + `deviceGate` + `/play` + `screen-devices.json`, Screens page (list, add, rename, remove, identify, online), per-screen Health/status, live link screen pick | L | G2, owner approval of the new gate (Q5) | Yes | Yes |
| G4 | **Groups, targeting and look UI**: groups on the Screens page, "Which screens?" in composer / quick sheet / slide sheet, chips + filters, "Editing the look for" picker + "Follow the others", preview "as screen X", freeze target, commands target, group/screen delete flows (8) | M-L | G2 (G3 to be useful) | Yes | Yes |
| G5 | **Scoped editors**: `scope` on the person record (later membership), PersonAccessSheet row + locked caps, item-layer enforcement (6.4) on every targetable route, filtered reads, History visibility by `screens:` tag, scope-escalation test suite (13). **Security review with opus.** | M | G1, G4 | Yes | Yes |
| G6 | **Cloud mapping** (inside CLOUD-PLAN P2/P3): `devices.id` = screen id, `GET /api/device/state` per device with ETag, group commands fanned out, `audit_log` rows, membership scope (N15), cross-org sweep includes screen/group ids | M | P2, P3, N15 | No | No (same UI) |

Total about 6-9 weeks of focused work for G1-G5. G1-G2 can start right after N6/N11 and are invisible. G3 is the step that needs real hardware testing (second Pi or a PC with Edge). Commit after each step; G2 and G5 each in several small commits (one route family per commit).

---

## 13. Tests

All with `TACHTACH_DATA_DIR` scratch dirs or injected I/O, never the real `data/` (as `test/` does today).

**Pure (G1)**
1. `showsOn`: null audience on every screen; group targeting includes later-added group members; retired ids show nowhere; empty audience shows nowhere.
2. `resolveSettings`: precedence screen > group > org per key; whole-key replace; non-overridable key in an override is ignored by the resolver and rejected by the sanitizer; `differs` list correct.
3. `withinScope`: All-screens audience is out of scope for any scoped person; screen-scoped person cannot target a group containing their screen; empty scope allows nothing; admin (null scope) allows everything.
4. `effectiveCaps` with a scope drops every non-scopable cap even if granted in overrides.
5. Property test: random screens/groups/audiences/scopes: if `withinScope(a, s)` then every screen `a` shows on is in `visibleScreens(s)`, for the current doc and after adding a screen to any group in `s`.

**Migration (G2)**
6. No screens document -> `buildState` for `scr_main` equals today's state body (minus `screen` key); `data/` unchanged after a full request cycle (byte compare).
7. Main screen gets everything when nothing is targeted; satellite screen state never contains an item aimed elsewhere (byte check of JSON for the item's id and headline).

**Scope escalation attempts (G5)**, each as a Hallway-only editor, expecting refusal and the store document byte-identical afterwards:
8. POST announcement with no audience, with `audience: null`, with Beis Medrash group, with an unknown id, with a retired id, with a valid Hallway id plus one outside id, with `groups` given as a string/object (shape tricks), with ids in odd case/whitespace.
9. PATCH an All-screens item; PATCH a Beis-Medrash-only item (404); PATCH own Hallway item to widen to All screens or to Beis Medrash; duplicate/restore/pause/delete of out-of-scope items; undo of a record for an item now out of scope.
10. Takeover to Hallway without `announcements.takeover`; emergency freeze; freeze with no target; screen command to a non-Hallway screen; `?asScreen=` another screen (404); `/api/screens/:id/overrides` for another screen (404); org-level `PATCH /api/settings` look keys (refused even with `look.change`).
11. GET `/api/state`, announcement list, slide list, History: no item or line aimed only at other screens.
12. Self-escalation: scoped editor PATCHes `/api/team/<self>` scope (refused: `team.manage`); stored override granting `schedule.edit` is ignored.
13. Group deleted -> the editor's scope is empty -> every post refused; scope never reads as null.
14. Route coverage test: every route matching the targetable prefixes calls `assertItemInScope` (a registry the routes add themselves to, checked against the Express route list).

**Device gate (G3)**
15. `/api/state`, `/stream`, `/api/screen/report` with no cookie / a garbage cookie / a revoked token -> 404 and the same body; a report with a body claiming another `screenId` lands under the token's screen; the device cookie on any `/api/*` admin route -> treated as signed-out; pairing code single-use, expires, rate-limited; `isLocalRequest` behaviour unchanged (existing tests).

**Cross-org (FIT-RULES 11, G6)**
16. Org A's audience containing org B's screen/group id -> refused, B unchanged; org A pairing code cannot attach a device to org B; B's device token on A's host -> 404; route sweep (CLOUD-PLAN 7.6) includes `/api/screens*` and `asScreen`.

---

## 14. Open questions (owner), with a recommendation

**Q1. Can a screen be in more than one group?**
(a) **One group per screen; posting can still pick several groups and screens at once** (recommended: one clear answer for "what does this TV look like")
(b) Many groups per screen, look overrides from the first group only
(c) Many groups, plus "tags" for targeting only, later

**Q2. A group (or screen) is deleted while messages are aimed at it. Default?**
(a) **Ask in the delete sheet; default "Stop showing" with a "Not showing anywhere" badge** (recommended: never spreads a message to more TVs by surprise)
(b) Fall back to All screens
(c) Refuse to delete until everything is moved

**Q3. What can be aimed at some screens in v1?**
(a) Messages only
(b) **Messages + slides (including the built-in daily pages); schedule stays org-wide with a per-screen "which schedule groups" choice** (recommended)
(c) Messages + slides + separate schedules per screen

**Q4. What does a Hallway-only editor see of All-screens messages?**
(a) **See them, read-only (they show on their TVs too)** (recommended)
(b) Hidden
(c) Can edit them

**Q5. Second screens before the cloud ("satellites" through the main box)?**
(a) Wait for the cloud
(b) LAN only (needs a certificate trusted by the satellite; harder)
(c) **Through the existing Cloudflare tunnel address with a paired device cookie (a new, narrow, fail-closed gate you approve)** (recommended; the same gate the cloud needs)

**Q6. The word in the admin.**
(a) **"Screen groups"** (recommended: your word; the schedule's "Groups" stay as they are)
(b) "Areas"
(c) "Rooms"

**Q7. What may an editor limited to some screens do?**
(a) Post messages (incl. takeovers if allowed) and control their screens only
(b) **(a) + edit slides aimed at their screens + change their screens' look** (recommended)
(c) Pick per person, per ability, per group (a matrix; not phone-friendly)

**Q8. One box per TV?**
(a) **Yes, one box = one screen; a mirrored splitter counts as one** (recommended, section 10)
(b) A Pi's second HDMI port can be a second screen

**Q9. Freeze / Blank on some screens?**
(a) Always all screens
(b) **One screen or a group allowed; Emergency always all screens; scheduled freeze windows stay all screens in v1** (recommended)

**Q10. Which screen does the public live view (`/live`) copy?**
(a) **One chosen screen per live link, default Main screen** (recommended)
(b) Always the Main screen
(c) The viewer picks

**Q11. Look overrides: whole setting or single sub-options?**
(a) **Whole setting ("Theme: Dark", "Motion: Calm")** (recommended: one clear "differs" chip, one-tap undo)
(b) Every sub-option separately

**Q12. "All screens except the Lobby"?**
(a) **Not in v1: pick the screens you want** (recommended)
(b) Add an "except" list now

**Q13. Who may add, pair and remove screens and groups?**
(a) **Admins only (`screens.manage`, admin-only)** (recommended for v1)
(b) Grantable to a Full editor

---

## 15. SaaS-fit self-check (FIT-RULES)

```
SaaS-fit:
- data: screens (org, class org) via a screens store factory; screen-devices (org, class secret, SECRET_FILES; cloud: devices table);
        audience field on announcements + slides (org); scope on users/memberships (person+org, secret file)
- settings: OVERRIDABLE_KEYS tagged 'org+box' (N6); no new top-level setting
- env: none
- events: screens-update; announcements/slides/settings/freeze become refetch nudges per screen (refetch-safe: yes)
- caps: screens.manage (adminOnly); SCOPABLE_CAPS; item-layer assertItemInScope
- files: none new (uploads stay org-wide)
- fetch: none
- live view: screenId on the live link; viewerState allow-list unchanged (no new keys exposed; screen name not exposed)
- isolation stub: 'isolation: audience refuses ids not in this org's screens document'
```

No module-level org state: the per-screen state map and SSE pools are keyed by `(orgId, screenId)` once `ctx` exists (N14). No hard-coded site values: "Main screen" is neutral product wording.

---

## Owner decisions (2026-10-26)

1. **Second screens before the cloud (Q5): YES, one narrow door.** A per-screen hashed device token through the existing tunnel, allowed to fetch ONLY its own screen's content (GET allow-list, like the live-view gate; no writes, no admin, no other screen's data). Needs its own security review, rate limits, revocation, and a CLAUDE.md update of the "deliberate public exceptions" rule when built (G3).
2. **Groups (Q1):** keep it to ONE group per screen in normal use ("crazy busy" otherwise). BUT access scope is independent of groups: a person can be given access to specific screens (or any mix of groups + individual screens) without those screens being in any of their groups, e.g. a few principals may post to the Lobby screen only. So scope = list of groups and/or individual screens. A message can still target several groups and single screens.
3. **Targeting (Q3): as much as possible, sketched and scoped, not all built now.** Build messages + slides first (G2-G4); document the extension path for schedule groups, daily content, freeze, themes, etc. as later phases in this doc's roadmap.
4. **Limited editors (Q7): same abilities as a normal editor, but only for their screens.** Still never org-wide settings: people/team, roster/chazan (student names), org settings, and anything not tied to a screen stay out of reach unless the person also has an org-wide role; security review (G5) must test escalation (scope edit via direct API calls, IDs of other screens, bulk endpoints, undo/history, live-view).
