# Questions for the owner (minimum needed to finalise the specs)

Twelve multiple-choice questions. Each has my **recommendation**; "go with your recommendations" is a complete answer. Questions marked ★ block the most work or carry the most risk. Spec references are in brackets. Nothing has been built yet.

---

### Q1 ★ One "Post" button instead of four cards? [Spec 1]
Today `＋` asks "Quick message / Announcement / Banner / Takeover" before you can type. The redesign opens one **Post** sheet with the keyboard up, a live preview and the kind chosen last (slide / banner / side note / takeover).
- **A. Replace the four cards with the one Post sheet** (the old full composer stays behind "More options", nothing retyped) — *recommended*
- B. Keep today's four cards and add the Post sheet as a fifth
- C. Only people on the "Messages only" level get the new sheet; editors keep today's flow

### Q2 History and the text of a post [Spec 1, 3]
Today the History/Undo line for a post includes its first line of text ("Posted 'Mincha moved to 2:15'"). A post can contain a student's name.
- A. Keep the text (useful; only people who can see announcements see History)
- **B. Cut the text to 40 characters, and never keep it for Mazel Tov or any feature that holds student names** — *recommended*
- C. No text in History at all ("Posted a banner")

### Q3 ★ What should the TV do between candle lighting and nightfall? [Spec 2]
Today slides marked "hide on Shabbos" drop out, everything else keeps rotating (some schools switch the TV off instead).
- **A. Nothing new: keep today's behaviour and add a one-tap "switch the screen off from candle lighting to nightfall" preset in Freeze** — *recommended*
- B. Show one still "Good Shabbos" page (no countdown) during Shabbos
- C. Normal rotation, no special handling and no preset

### Q4 ★ What did you mean by "mivtza reminders" on the Friday page? [Spec 2]
- **A. Short editable reminder lines of your own (for example "Light candles: girls and women", "Tzedakah before candles"), different for Friday and Motzei Shabbos** — *recommended*
- B. Live Mivtzah points / leaderboard on the Friday page
- C. Both A and B (B only if the Mivtzah feature is switched on)

### Q5 ★ Student photos and "names stay on our screen box" [Specs 3, 4]
In the cloud plan, student names can stay on the school's own Pi (Mode L). Photos of children are not names, but they identify children just as well.
- **A. Photos follow the names rule: if an org keeps names on its box, its student photos stay there too (cloud orgs: private, encrypted storage with short-lived links)** — *recommended*
- B. Photos may always sit in the cloud (private storage), only names stay on the box
- C. Decide per org when it signs up

### Q6 Photo permission [Specs 3, 4, 6]
- **A. Show a one-line reminder ("Only add a photo if the family is happy for it to be shown") and nothing else** — *recommended*
- B. A tick box "I have permission", stored with the photo
- C. Nothing

### Q7 Mazel Tov: who can post it, and how loud? [Spec 3]
- **A. Anyone who can post messages (including "Messages only"), full-screen takeover optional and off by default (10 minutes when used), names visible on the live link but photos not** — *recommended*
- B. Only Full editors; takeover on by default for engagements and births
- C. Anyone can post, but never a takeover

### Q8 Photo Wall: how much first? [Spec 4]
- **A. Phase 1 now: albums, upload from phone, captions, single + grid layouts, hide/delete, automatic deletion after the event; collage, spotlight and the approval inbox later** — *recommended* (about 5 days; shares the private photo store with Mazel Tov and Shiurim)
- B. Everything at once (about 8 days)
- C. Only Mazel Tov and Shiurim photos for now; Photo Wall later

### Q9 Menu: how does the kitchen send it, and does it repeat? [Spec 5]
- **A. A spreadsheet or pasted cells; a plain "usual week + exceptions" plus an optional 2-4 week rotation** — *recommended*
- B. A PDF or photo (then the AI-prompt hand-off is built first and the spreadsheet import later)
- C. Typed by hand each week (skip the importer; editor only)

### Q10 Shiurim: link to the schedule, and photos [Spec 6]
- **A. A shiur can be linked to a schedule block so the time never disagrees (or have its own days/time); rebbeim photos shown on the TV with a letter circle when none** — *recommended*
- B. Always its own days/time, no link
- C. Link, but no photos on the TV

### Q11 Rebbeim and guest speakers in "names stay on our box" mode [Spec 6]
Staff and speakers are adults, not students.
- **A. They may live in the cloud (only students' names, birthdays, simchas and photos stay on the box)** — *recommended*
- B. Treat them like student names (everything on the box)

### Q12 ★ Build order [all]
- **A. 1) Admin exposure clean-up bundles A-D (about 2 days; includes the candle-lighting minutes control) 2) Post sheet 3) Shabbos page 4) Menu 5) Shiurim and Guest speaker 6) private photo store + Mazel Tov 7) Photo Wall phase 1** — *recommended: the correctness fix first, then what is used every day, then the new pages*
- B. Shabbos page first (Friday is soon), then the rest in the order above
- C. Your own order: ______

---

## Defaults I will use unless you say otherwise (no question needed)

Spelling "Shabbos / Parshas" with "Shabbat / Parashat" as an admin option; Friday page starts 3 hours before candle lighting (changeable); Motzei page runs 90 minutes after nightfall; second night of Yom Tov shows "candles after nightfall" without a countdown; no Rabbeinu Tam line in v1; Photo Wall 7 seconds per photo, 45 seconds per visit, photos deleted 30 days after the album ends; guest speakers appear 3 days ahead; Mazel Tov expiry by occasion (engagement 3 days, birth 7 days, Bar Mitzvah 3 days, wedding 2); menu "after the last meal show tomorrow"; Today + Week views together; 12-hour clock stays (24-hour option is a later SaaS item); live link shows menu, Shabbos page, shiurim, guest speaker and Mazel Tov names, but **no photos** unless you switch them on per feature.

## What your answers decide in the specs

| Question | Spec sections it fixes |
|---|---|
| Q1, Q2 | 01 sections 3.3, 6 |
| Q3, Q4 | 02 sections 2.1 (`during`), 4.4, 3 |
| Q5, Q6, Q11 | README C4; 03 section 7; 04 section 7; 06 section 7 |
| Q7 | 03 sections 3, 5 |
| Q8 | 04 section 9 |
| Q9 | 05 sections 2.3-2.4, 9 |
| Q10 | 06 sections 2.1, 3.3 |
| Q12 | order of work, each spec's size |

---

## Owner answers (2026-10-26)

- **Q1 Post sheet:** try replacing the four cards with the one Post sheet, BUT add an admin setting ('Post button style': New Post sheet / Classic four cards) so the owner can switch back at any time. Per-org default; later also per person.
- **Q3 Shabbos:** offer BOTH as an admin choice for the Candle lighting -> nightfall window: (a) 'Screen off' (Freeze preset), (b) 'Simple Good Shabbos sign': one calm still page with far fewer animations (no rotation), (c) 'Keep rotating (hide-on-Shabbos slides drop out)'. Admin picks; default stays (c) until the owner picks.
- **Q4 'Mivtza reminders':** owner did not remember meaning; explained as editable reminder lines about the mivtzoim (e.g. Shabbos candles for girls and women, tefillin, tzedakah before candles). Default: option A (own editable lines, empty by default). The live Mivtzah leaderboard must later fit into whatever streaming/embed mechanism TachTach Screens defines (the old full-screen live board was a one-time gig; future Mivtzah boards get a dedicated, generic source type).
- **Q5 photos:** clarified: this question is ONLY about photos staff upload for Mazel Tov / Photo Wall. The Google Photos album slide stays as it is today (streamed, with images cached locally on the screen box so it keeps working when the network drops). Default: option A (uploaded student photos follow the names rule).
- **Q12 build order:** recommendation accepted by default (exposure clean-up first), which is under way.
- **New requirement:** several screens, screen groups, targeting a message to one screen/group, per-group/per-screen settings, editors scoped to a group or screen: design in docs/saas/SCREENS-GROUPS.md.
- **N18 GitHub Actions:** approved if safe: added `.github/workflows/test.yml` (read-only token, no secrets).
