# Admin mobile audit (2026-10-30)

Goal: the whole admin works smoothly on a phone with every feature available.
Branch `claude/wizardly-ride-bnbtzj`. Fixes only in files outside the "other agents" set (see "Not fixed: files owned by others").

## How it was checked

- Throwaway server from `git archive HEAD`, scratch data dir (`TACHTACH_DATA_DIR`), one admin and three editors (Full editor, Messages only, View only). The real `data/` was never touched.
- Playwright (Chromium, `isMobile` + `hasTouch`) at Pixel 8 412x915, small 360x740, iPhone 13 390x844 (iPhone UA) and tablet 768x1024; light and dark theme.
- Every section in `src/admin/nav.js` (home, slides, the four Media tabs, daily word, daily story, shabbos, roster, chazan, schedule, custom days, the three Announcement tabs, all Look & Settings pages, team, account, history, health, help), as admin and as each editor role. The roles are sent to Home for pages they may not open (by design, not an error).
- Programmatic checks per page and per opened sheet: page overflow, nested horizontal scrollers, tap size under 44px, text under 12px, inputs under 16px, controls without a name, fixed/sticky elements over the tab bar, text contrast (WCAG AA, computed against the real background), console errors and warnings, failed requests and 4xx, scroll lock after closing, sheets that cannot scroll or lose buttons off-screen, viewport shrink (keyboard stand-in), focus inside sheets.
- Interactive pass: every distinct button on each page was tapped (destructive words skipped); each opened sheet was measured, its inner buttons tapped once, then closed with Escape.
- Limits: no real keyboard, no real Firefox or Safari engine (Chromium only), no real phone. The Firefox-Android swipe trap is judged from the CSS (scroll containers), not reproduced. Not run: the Pi.

## Counts

| Severity | Found | Fixed | Not fixed |
|---|---|---|---|
| High (content unreadable or action impossible) | 2 | 2 | 0 |
| Medium (WCAG AA fail, tap or focus problem on a common path) | 10 | 9 | 1 (in a file owned by others) |
| Low (polish, below the 44px or 12px guideline, naming) | 15 | 5 | 10 (6 in files owned by others, 4 judged not worth changing) |

No page had horizontal page overflow at 360, 390, 412 or 768. No 403/404 was returned to any role for its own pages. No body scroll lock leaked after closing any sheet. Every sheet scrolls or fits at all four sizes.

## Findings fixed

| # | Page / role / viewport | What | Sev | Fix |
|---|---|---|---|---|
| 1 | Daily Word/Story, Schedule (every role that sees the snackbar), light theme, all | Error snackbar was dark text (`colors.text`) on a fixed dark red `#3a1414`: contrast 1.06:1, unreadable | High | `scheduleShared.jsx`: error background is now a tint of `--danger` over `--surface` |
| 2 | Any page with a toast, all | Success toast: white on `rgba(76,175,80,.92)` was 2.8:1; tick icon inherited dark text (3.4:1); dismiss x was 31x44 and faint | High | `ToastContainer.jsx`: solid `#2E7D32`, white icon and x, 44x44 dismiss |
| 3 | Everywhere, light | `--text-3` (hints, tab labels, empty states) 3.1:1 on the page background | Medium | `admin-theme.css`: `#6B645A` (5.2:1). Dark `--text-3` raised from 4.3 to 5.4 |
| 4 | Role chips ("Admin"), schedule "no end time" chip, light | `--gold` text 3.1:1, `--warn` 3.5:1, `--danger` 4.45:1, `--ok` on its soft tint 4.2:1 | Medium | `admin-theme.css` tokens darkened to at least 4.5:1 (gold `#85600F`, warn `#955509`, danger `#B3301F`, ok `#2A7048`) |
| 5 | Dark theme: Team chips, Home freeze buttons, tab counts, custom days toggle | Accent text on accent tint 3.96 and 4.37:1 | Medium | dark `--accent` `#F0705F` (4.9:1); `--accent-ink` still 6.6:1 |
| 6 | Bottom tab bar, role chips, schedule chips, many hints, all | 11px (and 10px) text | Medium | 12px in AdminLayout, TeamPanel, Schedule (week, by date, wizard, saved, icon picker, shared), RSS, Media library, Screen controls, Custom days |
| 7 | Sub-navs (Screen/Media/Announce sections, Look & Settings pages, Which davening), 360-412 | Segmented tabs scrolled sideways (Pages row 609px in 358px). Horizontal scroller over a vertical swipe area traps swipes on some engines (the Pixel 8 / Firefox Android class) and hides tabs | Medium | `SegmentedControl.jsx` now wraps onto a second line, never scrolls; tabs 44px high on touch (`@media (pointer: coarse)`); desktop identical |
| 8 | Team > a person > Access sheet, all phones | The floating Save bar covered the last permission rows (no room reserved) | Medium | `PersonAccessSheet.jsx` and `SaveBar.jsx` reserve 84px while edits are pending (so the last control of every Look page can be scrolled clear of the bar, too) |
| 9 | Every sheet, keyboard/screen-reader | `aria-modal` sheets did not move focus in, did not trap Tab, and did not give focus back | Medium | `Sheet.jsx`: focus the sheet (unless a field inside already has it), trap Tab, restore focus to the opener on close |
| 10 | Schedule > week view, 360 | Seven day tabs were 42px wide | Medium | `WeekView.jsx` gap 6px to 2px (45px) |
| 11 | First run, Welcome tour, small or landscape phone | Card had no max height; page behind could scroll | Medium | `WelcomeTour.jsx`: max height 100dvh - 32px with inner scroll, shared scroll lock |
| 12 | Schedule > Copy fallback modal | Fixed-height textarea (50vh) plus buttons overflowed a short screen; no scroll lock | Low | `scheduleShared.jsx`: modal max 92dvh with scroll, 40dvh textarea, scroll lock |
| 13 | Custom days | Month select and two text inputs had no accessible name (placeholder only); checkbox rows 36px | Low | `CustomDaysEditor.jsx`: aria-labels, 44px rows |
| 14 | Health > Upload a data pack | File input had no name, 24px high, 14px font | Low | `DataPackCard.jsx`: aria-label, 44px, 16px |
| 15 | Screen controls (Home preview drawer) | Date preview input had no accessible name | Low | `ScreenControls.jsx` aria-label |
| 16 | Home / all, "Following the TV" and other `--ok` text | 4.47:1 | Low | covered by #4 |

## Not fixed (with reason)

| Page | What | Sev | Why |
|---|---|---|---|
| Chazan > Add to the rotation, 360 | Seven day cells in the grid are 31x44 (a 74px label column leaves 36px per day) | Low | Meets WCAG 2.5.8 (24px). Making them 44px wide needs a different layout (one row per day). Fine at 390 and up |
| Shabbos / Roster / Chazan hints | Inline "Slides" / "Bochurim" links in a sentence are 36-39px high | Low | Inline text links are exempt from the target-size rule; making them blocks would break the sentence |
| Home and Health pages, rapid use | `/api/health` is `medium` (30 per minute per person). Opening Home more than 30 times in a minute returns 429 (seen only because the audit opened it about 25 times per minute) | Low | Not reachable by a person. Home polls every 120 s. If a kiosk-style wall tablet ever reloads faster than that, raise the budget in `READ_BUDGETS` |
| Sheets, Android keyboard | The sheet is `92dvh` and Chrome Android keeps the layout viewport when the keyboard opens, so the sheet is not resized; the browser scrolls the focused field into view. Checked only by shrinking the viewport (all sheets either scroll or kept every field in view) | Low | Adding `interactive-widget=resizes-content` would also lift the tab bar above the keyboard on Chrome and change iOS not at all. Two reasonable behaviours; left as is. Say if you want it, it is one meta tag |
| Edit slide sheet (not a bug) | After changing a value, Escape asks to discard instead of closing | Info | The unsaved-changes guard, as designed. Noted because the audit first read it as "cannot close" |

## Issues in files owned by others (FIXED 2026-10-31 in commit e2ca9b1, not re-run on a phone)

Fixed: Layout picker is now a wrapping grid (no sideways scroller); Style groups tabs wrap and the 11px description is 12px; the Announcements 'Show again' overlay uses `ui/scrollLock.js`; Slides > New slide labels 12px; Daily Word's two example inputs have labels; 'Show a different one' (Daily Word and Daily Story) is disabled with a one-line reason when there is no other entry; Live Preview labels 12px. The table below is the original finding list.

| File | Page | What | Sev |
|---|---|---|---|
| `components/slides/NewSlideFlow.jsx:33` | Slides > New slide | Type labels (Image, Video, PDF, Photo album, Web page, News feed) are 11px | Low |
| `components/DailyWordPanel.jsx` | Daily Word > Write one / Edit this one | Two text inputs (the "How was your son's bar mitzvah?" and "We're shepping..." example fields) have a placeholder but no accessible label | Low |
| `components/DailyStoryPanel.jsx` | Daily Story > Show a different one | When there is no other story the button still posts and the server answers 400 (console error plus snackbar). Disable or hide the button when the list has one item | Low |
| `components/announcements/AnnouncementComposer.jsx:391` | New announcement | "Layout" picker is a 93px-high horizontal scroller (swipe trap class); the composer reports two sideways scrollers at 390 | Medium |
| `components/announcements/StylePicker.jsx:45,80` | New announcement | "Style groups" tab row scrolls sideways; a group heading is 11px. Use wrapping like the new SegmentedControl | Low |
| `components/announcements/AnnouncementsPanel.jsx:62` | Announcements | Full-screen overlay (z 9990) does not use `ui/scrollLock.js`; the page behind can scroll while it is open | Low |
| `components/LivePreview.jsx:83,147` | Home preview drawer | Two labels at 11px ("Live Preview", the error-page link) | Low |
| Post sheet, Slides, Announcements | all | These were checked as they stood at the start of this audit; other agents are still editing them, so re-run the audit once they land | Info |

## Setting decisions

No new setting was needed: every fix had one reasonable behaviour. The one real choice (sideways-scrolling tab rows vs wrapping) follows the swipe-trap history: wrap always wins on touch, desktop never reaches a second line.

## How to repeat

Build from `git archive HEAD`, start with `TACHTACH_DATA_DIR` set to a scratch folder, create the users with `src/server/users.js` (`bootstrapAdmin`, `createUser` with preset `full` / `messages` / `view`, `createSession`), set the cookies `tachtach_session`, and set `localStorage['tachtach-tour-v1']='1'` and `sessionStorage['tt-splash-seen']='1'` so the welcome tour and splash do not cover the page. The audit script lived in the session scratchpad (not committed): it loads each `/admin/<section>`, runs the page checks, taps each distinct button and measures every `[role=dialog]` it opens.
