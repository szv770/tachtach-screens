# Admin Reorganization — Design

## Problem

The admin's 8 top-level tabs (Slides, Schedule, Messages, Custom Days, Media, RSS Feeds, Style, Settings) conflate roles that don't belong together, and this is actively causing real problems, not just a messy layout:

- **"Messages"** stacks the message composer (Takeover/Banner/Board, an 11-style takeover picker) directly above **Pinned Notes** — a completely different concept (persistent reference info, not transient announcements) — separated only by an `<hr>`.
- **"Media"** stacks raw image/video upload directly above Google Photos album management, the same way.
- Independently of the tab grouping, the Messages experience has real bugs: editing a message is actually delete-then-recreate (there's no update endpoint), which silently resets the expiry to "manual dismiss" and likely re-fires the takeover animation on the live screen from a text-only edit; the Edit button gives no visible feedback because the compose form and the active-messages list are far apart in one long scroll; the active list is unsorted with no visual distinction between timed and permanent messages; and 5 of the screen's 11 takeover styles aren't reachable from the admin at all.

## Non-goals

- No CSS framework / Tailwind / TypeScript introduction — this codebase's plain inline-styles + Framer Motion convention stays.
- No backend/data-model rework beyond what's needed to fix the Messages edit bug (one new endpoint, see below) — everything else is UI/IA reorganization on top of the existing data layer.
- Scope is Slides/Schedule/Messages/Custom Days/Media/RSS/Style/Settings and how they're grouped and presented — not a visual redesign of every individual component's internals beyond what's needed for the Announcements split.

## New top-level structure (~4 groups, replacing the 8 flat tabs)

1. **Slideshow** — the existing Slides list (toggle/order/duration) as the spine, with "Add content" as a source picker inside it: Custom text, Image/Video, Google Photos album, RSS feed. `ImageUploader.jsx`, `GooglePhotosManager.jsx`, and `RSSManager.jsx` move here as "add" flows — they already call `onSlideCreated`/`createSlide`, so this is re-parenting existing components, not rewriting them. Media/Photos/RSS disappear as separate top-level tabs. On mobile, "+ Add" opens each source in the same bottom-sheet pattern `GooglePhotosManager` already uses for its edit modal, rather than pushing a long inline form into the slide list.
2. **Announcements** (renamed from "Messages") — compose/manage split, detailed below. Pinned Notes is no longer nested here.
3. **Info & Schedule** — Pinned Notes (un-embedded — `PinnedManager.jsx` already supports this via its existing `embedded` prop), Schedule, Custom Days. The reference-layer content that isn't part of the ambient rotation.
4. **Appearance** — Style + Settings merged into one section (both are "configure the look/behavior once, rarely touched again").

Fewer top-level tabs is a deliberate mobile win: the mobile nav is a horizontal-scroll strip (`AdminLayout.jsx`), and every additional tab is another blind horizontal scroll to find. 4 tabs beats 8.

## Announcements: compose vs. active split

**Desktop:** two columns in the main content area — Compose on the left, **Active** on the right, both visible at once.

**Mobile:** a segmented control at the top — `Active (n) | Compose` — **defaulting to Active** whenever any messages are currently live, since "what's up there right now / kill it / extend it" is the more common phone task than composing. A prominent "+ New announcement" switches to Compose. This directly fixes the current problem of always scrolling past the entire composer (including the tall takeover-style grid) just to see what's live.

**Compose panel:**
- Type selector (Banner/Board/Takeover) first, same as today — only show the fields relevant to the selected type.
- Move the banner's global Size/Speed/Repeat settings **out** of the per-message compose flow (they're app-wide config, not part of a one-off send) into a collapsed "Banner display settings" disclosure, or into Appearance.
- Expose **all 11** takeover styles (currently only 6 are reachable), rendered as a compact horizontal swatch scroller so the compose form doesn't grow into a tall grid on a phone.

**Active panel:**
- **Sort soonest-to-expire first.** Group no-expiry ("manual dismiss") messages into a visually distinct "Stays until removed" section — these are the ones most likely to be forgotten on screen all day, and today they look identical to a message expiring in 10 minutes.
- Richer rows: type badge, full text (both languages when present), the takeover's style name + a small color swatch, a board's target/holds-screen flag, and a live countdown.
- **Duplicate** action on any active message — clones it straight into Compose. Ships against the existing `createMessage` API, no backend change needed. (A persisted "recent announcements" list — useful for a camp's frequently-repeated "Mincha moved to 7:15"-style messages — is a reasonable future addition, e.g. mirroring the existing Schedule "saved templates" pattern, but is out of scope for this pass; start with `localStorage`-based recents if it turns out to matter.)

**Editing — the actual bug fix:**
- New `PUT /api/messages/:id` endpoint + `updateMessage` in `useAdminState.js`, replacing today's delete-then-recreate. This keeps the same message `id` (no re-fire of the takeover animation on the live screen from a text-only edit) and must **default to the message's existing expiry** when opening the edit form, not blank it.
- Editing opens as an **inline expand** on that row in the Active list (the same pattern `SlideManager.jsx` already uses for its Zmanim/Limudim/Embed "Edit → inline panel" — reuse it, don't invent a new pattern) — not a jump to a form elsewhere on the page, which is why "Edit" currently looks like it does nothing.

## Mobile requirements (applies to the whole reorg, not just Announcements)

Must be fully usable on a phone as an equal, not secondary, device — this admin already has real mobile infrastructure (`useIsMobile.js`, sticky auto-scrolling tab nav, safe-area insets, a slide-up preview sheet) to build on, not replace.
- 4 top-level tabs (not 8) directly serves this — fewer items in the horizontal-scroll tab strip.
- The Announcements `Active (n) | Compose` segmented control, defaulting to Active, is the single biggest mobile win — it's exactly what turns "scroll past everything to see what's live" into "see it immediately."
- The takeover style picker must render as a horizontal scroller on mobile, not a tall grid.
- Inline-expand editing (vs. a far-away form) is a mobile fix as much as a desktop one — the compose form is permanently off-screen above on a phone today.

## Sub-navigation within grouped sections

Grouping doesn't mean flattening several existing components into one continuous scroll — "Info & Schedule" bundles 3 substantial components (Pinned, Schedule — which is also gaining the separate per-date-overrides feature, see `2026-07-21-schedule-date-overrides-design.md` — and Custom Days), and "Appearance" bundles 2 (Style, Settings). Each grouped top-level item gets a lightweight secondary tab/segmented-control row at its top (e.g. `Schedule | Custom Days | Pinned` under Info & Schedule) so each component keeps its own dedicated screen — the grouping collapses the *top-level* nav from 8 to 4, it doesn't merge the components' content together.

## Phasing note (for the implementation plan)

This spans enough surface area (nav restructure, Slideshow source consolidation, the Announcements compose/active split, one new backend endpoint, the Appearance/Info sub-navigation) that it should land in stages rather than one shot — data-layer first (`PUT /api/messages/:id`), then nav restructure, then Announcements, then Slideshow consolidation, then the Appearance/Info groupings. Leaving the exact task breakdown to the implementation plan rather than fixing it here.

## Data-layer changes required

- **New:** `PUT /api/messages/:id` route + `updateMessage` action in `useAdminState.js` — the one real backend change this reorg needs, to fix the destructive-edit bug properly.
- **None needed** for Pinned (already fully CRUD-ready, already supports un-embedding) or for the Slideshow consolidation (source components already emit slides via the existing `createSlide` flow).

## Testing

- Unit/integration test for `PUT /api/messages/:id`: preserves the message `id`, updates only the provided fields, and does **not** reset `expiresAt` unless the caller explicitly changes it.
- Manual verification on the actual kiosk screen: confirm that editing a live takeover's text does *not* re-trigger its entrance animation (the reason the id-preserving update matters, not just the admin-side UX).
- Mobile-viewport check (375px) for: the Announcements segmented control default-to-Active behavior, the horizontal takeover-style scroller, and the 4-tab nav strip.
