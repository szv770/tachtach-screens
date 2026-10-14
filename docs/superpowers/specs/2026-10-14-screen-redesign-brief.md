# Screen Redesign — Design Brief (round 2)

Date: 2026-10-14. Round 1 mockups: `docs/design/2026-10-14-mockups/` (A Concourse, B Gallery, C Glance).

## Owner feedback on round 1

- Likes **A** most, leaning toward **C**. B "looks way too AI". A also "feels a bit AI" and has **too much going on at once**.
- **One thing per page.** Schedule gets its own page, zmanim its own page, announcements their own page. Don't repeat page content in the side rail (why is Chatzos on the left when the zmanim board already shows it?).
- The weather placement in the rail looks good.
- Likes the event-style announcement with a time in a distinct look (e.g. "Farbrengen · 9:30").
- Liked the B schedule *timeline* idea, but wants it **more modern, cleaner and sleeker**.

## Decisions

### Side rail (always on)
- **Always:** clock, Hebrew + English date, parsha, weather (small: icon, temp, condition, H/L).
- **Only when relevant:**
  - An **"up next" card** appears only when a schedule item starts within **5 minutes**, with a countdown. It's hidden otherwise. (The admin setting `rail.upNextMinutes` defaults to 5.)
  - **Pinned side notes** (announcements shown as "Side note") appear in the rail when active.
- No next-zman card in the rail, and nothing that duplicates a page.
- **Position:** left or right, chosen in admin (`layout.railSide`). It can differ per orientation or screen (portrait: the rail becomes a top band). This is ready for the multi-device plan, where it becomes a per-device setting.

### Pages (rotating, one subject each)
- **Zmanim:** the default is a **clean board**: big times, prominent Hebrew name, small English name, past rows faded, and only the next zman clearly highlighted. No "PASSED/STATUS" chrome. Alternatives the admin can choose: sun-path arc + tiles (from C), or board + slim arc.
- **Schedule:** a **modern, sleek horizontal timeline** with a "now" marker, with the current and next items emphasized and past items faded. Must handle 4–14 items without cramping. When there are too many, it wraps to two rows or uses a compact mode, chosen by the designer.
- **Announcements** have several layouts, picked in the composer. The more the better:
  - **Event card:** title, plus day/time in a distinct "tile" look, plus place. Fields are filled in the composer.
  - **Big words:** a short message auto-sized huge.
  - **List:** a heading plus a few short items.
  - **Quick time announcement:** e.g. "Mincha 1:45" or "Farbrengen 9:30", where the time renders in a different typographic treatment from the event name and place.
  - (Later: message + photo.)
- Other existing slides (Limudim, Hayom Yom, Daily Quote, RSS, images, Google Photos, Mivtzah) get restyled into the same system afterwards.

### Banner
The bottom notice strip appears **only when a banner is active**. Otherwise the page uses the full height.

### Feel
- Mix A and C per page type, at the designer's discretion: A's clarity and big bold numerals and board rows, C's rounded softness, calmer color and breathing room.
- Fewer labels and badges, one accent moment per screen, generous spacing, and big readable type for mixed viewing distance.
- It must not feel templated or "AI": no gratuitous uppercase micro-labels on everything, no decorative chrome without purpose.

### Motion (admin setting `motion`)
- **Smooth (default):** quick, gentle crossfade or slide between pages; numbers tick softly. Light on the Pi.
- **Minimal:** a simple crossfade, near-static.
- **Lively / "hype":** items animate in one by one, plus a bit more flair. Heavier, opt-in.
- All three must avoid continuous GPU-heavy effects (no infinite animations, blur or blend modes) on the Pi 5 at 4K. Motion happens at page transitions only.

### Must keep working
Themes (dark/light variants plus auto day/night), user fonts (Hebrew + English roles, including FbMazal), the 1600×900 logical canvas with uniform scaling, portrait, all admin customization, and the product rules (banners never pause rotation; takeovers always do).
