# Admin upgrade — Phase 0 design notes

Mockups: `mockups/direction-a.html`, `mockups/direction-b.html`. Each one is a single static file. Both use the same 7 screens: mobile Home, Search, “+” quick message, New slide step 1, Settings with the Save bar, then desktop Home dashboard and Schedule wizard step 2. Each file has a theme switch: **Follow system / Light / Dark**. The same pattern carries into the app: `prefers-color-scheme` by default, overridden by `data-theme` on `<html>`, and the choice is remembered per device.

Both directions share these rules:
- Every colour is a CSS custom property. Admin components never hard-code colours.
- Touch targets are at least 44 px on mobile. Small inline pills such as “Edit” and “Pause” are 36 px tall with a hit area padded out to 44 px.
- Hebrew text is in Rubik with `lang="he" dir="rtl"`. English UI text is in a Latin sans.
- There are no blur or backdrop-filter effects, so the admin stays cheap on old phones. These are not kiosk rules, but they're good practice.
- The site-switcher card at the top of the desktop sidebar is the SaaS slot. Today it shows one site; later it becomes a menu.

## Direction A — “Seal”

**Idea:** warm paper and ink. The logo's wax-seal red is the single action colour. Gold is used only to mean “edited / needs attention”. The layout follows native iOS: grouped-inset lists, a large serif page title and an edge-to-edge tab bar.

| Token | Light | Dark |
|---|---|---|
| bg / surface / surface-2 / sunken | #F4F1EA / #FFF / #FAF8F3 / #ECE7DC | #121110 / #1C1A18 / #232120 / #0C0B0A |
| text / text-2 / text-3 | #1D1B17 / #5E5850 / #8F887C | #F3EEE4 / #B5AD9F / #7E776C |
| line / line-strong | ink @10% / 18% | paper @9% / 17% |
| accent (wax) / soft | #B4322A / #F6E3DF | #E5574B / 16% |
| gold (edited) / soft | #A87B22 / #F3E8CF | #D9AE57 / 14% |
| ok / warn / danger | #2F7D4F / #B46A12 / #C0362C | #5CC48A / #E5A04A / #F06A5E |

- **Radii:** 8 · 12 · 16 · 22 · 28 · pill.
- **Spacing:** 4-pt scale: 4 8 12 16 20 24 32 40. Page gutter is 16 on mobile and 32 on desktop.
- **Elevation:** e1 is a hairline card, e2 a raised card, e3 is used for sheets, toasts and the Save bar. Dark mode swaps the drop shadows for an inset top highlight plus a deep shadow.
- **Type:**
  - Fraunces 600 for page titles: 32 mobile, 30 desktop.
  - Manrope 400–800 for the UI: 11 tab, 12.5 meta, 13–14 body, 15–16 row and button, 17–18 emphasis.
  - Rubik for Hebrew.
  - Uppercase 11–12 px eyebrows with 0.06–0.12em tracking.
- **Motion:** 140 ms fast (press), 220 ms base (collapsible, toggle), 340 ms sheet. Easing is `cubic-bezier(.2,.8,.2,1)`. Everything respects `prefers-reduced-motion`.

**Components as drawn in A:**
- **Tab bar:** five slots, translucent surface with a hairline top border. The centre slot is a red “+” FAB in a ring.
- **Tile:** white card, a neutral icon square, title plus a one-line live status. The hero tile is solid red.
- **Sheet:** top corners 28 px, grabber, title in serif.
- **Collapsible:** 64 px header with title and a one-line summary of the current value. The chevron rotates when opened. An edited field gets a gold dot and gold field fill.
- **Save bar:** ink-coloured floating bar reading “Unsaved changes · n edited” with Revert and a red Save.
- **Search result row:** grouped-inset list row with an icon square, title (matched text highlighted in gold), breadcrumb and an inline action (Edit / Pause) or chevron.
- **Toggle:** standard iOS 51×31, green when on.
- **Segmented control:** sunken track with a raised white thumb.
- **Card grid:** cards with an art band on top. The main type gets a wide card with variant chips.
- **Toast:** ink pill with a gold “Undo”.

**Navigation:** Home · Screen · ＋ · Schedule · Announce. Look & Settings is reached from the gear in the large-title header and the Home tiles.

**Rationale:** A is the logo turned into a UI. It feels like a sefer, respectful and quiet, and it ties the admin to the brand everyone will see on the PWA icon. Familiar iOS patterns mean nothing has to be learned. The risk is that warm neutrals can drift toward “the old gold look” if the red is used too little. Gold must stay reserved for “edited”.

## Direction B — “Studio”

**Idea:** a cool, crisp canvas with one indigo action colour. Each area owns a hue, so people learn where they are by colour: Screen sky, Schedule green, Announce orange, Settings violet. The design uses floating, pill-shaped chrome and chunky cards in one bold sans. On desktop, the sidebar and preview are floating panels, and the preview is always dark, like the TV.

| Token | Light | Dark |
|---|---|---|
| bg / surface / surface-2 / sunken | #F1F3F8 / #FFF / #F7F8FC / #E7EAF2 | #0A0D14 / #141924 / #1A2030 / #0E121B |
| text / text-2 / text-3 | #0F1729 / #4A5568 / #8A94A8 | #EEF2F9 / #A9B3C7 / #6B7690 |
| accent (indigo) / soft | #4054E8 / #E6E9FF | #7C8CFF / 16% |
| area: screen / schedule / announce / look | #0EA5E9 / #12A26B / #F2711C / #8B5CF6 | #38BDF8 / #34D399 / #FB923C / #A78BFA |
| ok / warn / danger | #12A26B / #D97706 / #E5484D | #34D399 / #FBBF24 / #F87171 |

Each area colour also has a `-soft` tint: about 10% in light, 14–15% in dark.

- **Radii:** 10 · 14 · 18 · 24 · 32 · pill. Buttons, the search field, the tab bar, the Save bar and toasts are all pills.
- **Spacing:** same 4-pt scale. The desktop canvas has a 12 px gap around its floating panels.
- **Elevation:** e1 is a soft card. e3 is used for the floating tab bar, sheets, the Save bar and toasts. Dark mode uses a 1 px light ring plus a deep shadow.
- **Type:**
  - Plus Jakarta Sans 400–800 throughout: titles 30–32 at 800 weight with -0.03em tracking, body 13–15 at 500–700.
  - Rubik for Hebrew.
  - Eyebrows are 11–12 px uppercase at 800 weight.
- **Motion:** 120 ms fast, 200 ms base, 380 ms sheet. Easing is the iOS-like spring curve `cubic-bezier(.32,.72,0,1)`. Respects reduced motion.

**Components as drawn in B:**
- **Tab bar:** floating pill inset from the edges. The active tab gets an indigo capsule behind its icon. The centre “+” is a dark squircle.
- **Tile:** solid area-coloured icon squircle on a white card. The hero tile is indigo with a coloured glow.
- **Sheet:** a fully rounded card floating 8 px from the edges. It starts with a horizontal row of kinds (Quick message / Announcement / Banner / Takeover / Letter), then My templates | Shared.
- **Collapsible:** the summary text is in the Settings violet. The chevron points down when closed and up when open.
- **Save bar:** indigo pill with Revert and an inverted Save.
- **Search result row:** each result is its own small card. The matched text is underlined in indigo. Inline actions are indigo-tint pills.
- **Toggle:** indigo when on.
- **Segmented control:** pill track with a pill thumb.
- **Card grid:** art band tinted with the area colour.
- **Toast:** dark pill with a solid “Undo” button.

**Navigation:** Home · Screen · ＋ · Schedule · Settings. Announce lives behind the “+” sheet, together with a “Messages” tile on Home.

**Rationale:** B is the more “app-like” and modern of the two. Colour-coding works well for non-technical editors, because “green = schedule” sticks. The floating chrome feels premium on a phone. The risks:
- It moves away from the brand's warm palette.
- Four area hues plus indigo need discipline to avoid looking busy, especially in dark mode.
- Putting Announce only behind “+” is a bigger change to how people find things.

## Recommendation

**Go with A (“Seal”) and borrow two things from B:**
1. B's area colour, used only as a small marker on sidebar group headings and Home tiles, not on whole surfaces.
2. B's horizontal “kinds” row at the top of the “+” sheet.

Reasons:
- A is on-brand: it matches the new envelope-and-seal logo and the start-up animation.
- It reads as calm and trustworthy for a yeshiva staff room.
- The serif page titles give it its “premium” character without extra decoration.
- Its tab bar keeps all five areas one tap away.

## Open questions for the owner

1. **Navigation:** the tab bar has 5 slots, but there are 5 areas plus the “+”. A drops Look & Settings to a header gear. B drops Announce into the “+” sheet. Which feels right to you? A third option is a 6th “More” tab.
2. **Desktop Home without a preview:** should the right-hand preview collapse to a floating mini-TV on narrower laptops (under 1280 px)? This isn't drawn yet.
3. **Fonts:** Fraunces/Manrope and Plus Jakarta are loaded from Google Fonts in the mockups only. In the build they'll be bundled through @fontsource, like the kiosk fonts.
