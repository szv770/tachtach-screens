# TachTach-Screens Full Build (Phases 4-12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the TachTach-Screens digital signage system — polish the kiosk screen with the "illuminated manuscript" aesthetic, build the full admin panel, add image uploads, Pirkei Avos, and kiosk hardening.

**Architecture:** Express server (complete) serves two Vite-built SPAs: `/screen` (kiosk, React 18 + framer-motion, inline styles) and `/admin` (admin panel, React 18). SSE for live updates. File-based JSON storage in `data/`. All fetchers, scheduler (Track A/B), and API routes are already built.

**Tech Stack:** Node.js + Express, React 18, framer-motion, inline styles (no Tailwind), Vite MPA build, sharp (image processing), multer (uploads), node-schedule.

---

## File Map

### Existing files to modify:
- `src/screen/App.jsx` — minor: pass Pirkei Avos data to slide
- `src/screen/components/Layout.jsx` — enhance: progress dots, responsive portrait mode
- `src/screen/components/Clock.jsx` — enhance: colon blink animation
- `src/screen/components/HebrewDate.jsx` — minor polish
- `src/screen/components/PinnedNotes.jsx` — minor polish
- `src/screen/components/SlideCarousel.jsx` — enhance: progress dots indicator
- `src/screen/components/slides/ZmanimSlide.jsx` — enhance: gold glow on next zman row
- `src/screen/components/slides/LimudimSlide.jsx` — minor polish
- `src/screen/components/slides/HayomYomSlide.jsx` — minor polish
- `src/screen/components/messages/Banner.jsx` — enhance: gradient edges
- `src/screen/components/messages/Takeover.jsx` — enhance: grain overlay + frame
- `src/screen/styles/tokens.js` — add animation presets
- `src/server/routes/api.js` — add image upload routes
- `src/admin/App.jsx` — complete rewrite: full admin panel
- `src/admin/index.html` — minor: add viewport meta
- `vite.config.js` — add font copy plugin if self-hosting fonts
- `package.json` — no new deps needed (sharp, multer already listed)

### New files to create:
- `src/screen/components/slides/PirkeiAvosSlide.jsx` — Pirkei Avos content slide
- `src/shared/pirkeiAvos.js` — seasonal calculation logic
- `src/server/upload.js` — multer + sharp image processing pipeline
- `src/admin/components/AdminLayout.jsx` — sidebar nav + live preview layout
- `src/admin/components/SlideManager.jsx` — slide list, toggle, reorder, duration, create
- `src/admin/components/MessageComposer.jsx` — banner/board/takeover message creation
- `src/admin/components/PinnedManager.jsx` — pinned notes CRUD + reorder
- `src/admin/components/SettingsPanel.jsx` — location, theme, scheduler, visibility
- `src/admin/components/CustomDaysEditor.jsx` — Hebrew/Gregorian date CRUD
- `src/admin/components/ImageUploader.jsx` — upload with display mode + edge treatment
- `src/admin/components/ScreenControls.jsx` — pause/resume/blank/advance buttons
- `src/admin/components/LivePreview.jsx` — iframe showing /screen
- `src/admin/hooks/useAdminState.js` — fetch state, CSRF helper, API methods
- `src/admin/styles/admin-tokens.js` — admin panel design tokens
- `scripts/kiosk-setup.sh` — Pi kiosk hardening script
- `tachtach-screens.service` — systemd unit file

---

## Chunk 1: Kiosk Screen Polish

### Task 1: Enhance design tokens and animation presets

**Files:**
- Modify: `src/screen/styles/tokens.js`

- [ ] **Step 1: Add animation presets and shared style helpers to tokens.js**

Add after the existing `slideTransition` export at line 50:

```javascript
export const animations = {
  slideIn: {
    initial: { opacity: 0, scale: 1.014 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.986 },
    transition: { duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  fadeUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  pageTurn: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

/** Ornamental divider inline style config */
export function ornamentDivider(tokens, symbol = '\u2726') {
  return { symbol, gradientColor: tokens.muted, accentColor: tokens.gold };
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -5`
Expected: `built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/screen/styles/tokens.js
git commit -m "feat(screen): add animation presets and ornament helpers to tokens"
```

---

### Task 2: Polish Clock component with colon blink

**Files:**
- Modify: `src/screen/components/Clock.jsx`

- [ ] **Step 1: Rewrite Clock.jsx with blinking colon and refined typography**

Replace the entire file content:

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../styles/tokens.js';

export default function Clock({ formatted, ampm, seconds, tokens }) {
  // Split "10:23" into parts for colon animation
  const [h, m] = formatted.split(':');

  return (
    <div style={{ textAlign: 'center', padding: '28px 0 12px' }}>
      <div
        style={{
          fontFamily: fonts.englishDisplay,
          fontWeight: 300,
          fontSize: 'clamp(80px, 10vw, 128px)',
          lineHeight: 1,
          color: tokens.text,
          letterSpacing: '-0.03em',
          direction: 'ltr',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
        }}
      >
        <span>{h}</span>
        <motion.span
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ margin: '0 2px' }}
        >
          :
        </motion.span>
        <span>{m}</span>
      </div>
      <div
        style={{
          fontFamily: fonts.englishDisplay,
          fontWeight: 300,
          fontSize: '22px',
          color: tokens.dim,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          direction: 'ltr',
          marginTop: '-2px',
        }}
      >
        {ampm}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.jsx to pass seconds to Clock**

In `src/screen/App.jsx`, change line 124 from:
```jsx
<Clock formatted={clock.formatted} ampm={clock.ampm} tokens={tokens} />
```
to:
```jsx
<Clock formatted={clock.formatted} ampm={clock.ampm} seconds={clock.seconds} tokens={tokens} />
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build 2>&1 | tail -5`
Expected: `built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add src/screen/components/Clock.jsx src/screen/App.jsx
git commit -m "feat(screen): blinking colon clock with responsive sizing"
```

---

### Task 3: Enhance Layout with progress dots and portrait support

**Files:**
- Modify: `src/screen/components/Layout.jsx`
- Modify: `src/screen/components/SlideCarousel.jsx`

- [ ] **Step 1: Rewrite Layout.jsx with progress dots slot and portrait grid**

Replace the entire file content:

```jsx
import React from 'react';
import defaultTokens, { fonts, getTokens } from '../styles/tokens.js';

export default function Layout({ leftColumn, rightColumn, banner, progressDots, theme = 'dark', tokens: tokensProp }) {
  const tokens = tokensProp || getTokens(theme) || defaultTokens;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        fontFamily: fonts.hebrewPrimary,
        background: `
          radial-gradient(ellipse at 22% 22%, rgba(212,168,75,0.04) 0%, transparent 60%),
          radial-gradient(ellipse at 78% 78%, rgba(212,168,75,0.03) 0%, transparent 60%),
          ${tokens.bg}
        `,
      }}
    >
      {/* Grain overlay */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.06,
          zIndex: 1,
          mixBlendMode: 'overlay',
        }}
      >
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Outer hairline frame */}
      <div
        style={{
          position: 'fixed',
          inset: '12px',
          border: `1px solid ${tokens.framePrimary}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Inner hairline frame */}
      <div
        style={{
          position: 'fixed',
          inset: '15px',
          border: `1px solid ${tokens.frameSecondary}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Main grid layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, min(28%, 380px)) 1fr',
          gridTemplateRows: '1fr auto',
          gap: 0,
          height: '100%',
          width: '100%',
          position: 'relative',
          zIndex: 3,
          padding: '20px 20px 16px',
          boxSizing: 'border-box',
        }}
      >
        {/* Left column — spans both rows */}
        <div
          style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gridRow: '1 / -1',
            borderRight: `1px solid ${tokens.framePrimary}`,
            paddingRight: '20px',
          }}
        >
          {leftColumn}
        </div>

        {/* Right column — slide area */}
        <div
          style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            paddingLeft: '20px',
          }}
        >
          {rightColumn}
        </div>

        {/* Progress dots — bottom-right */}
        {progressDots && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: '20px',
              paddingBottom: '4px',
              height: '24px',
            }}
          >
            {progressDots}
          </div>
        )}
      </div>

      {/* Banner slot — inside inner frame, at bottom */}
      {banner && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            right: '16px',
            height: '34px',
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {banner}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Extract progress dots from SlideCarousel into App.jsx**

In `src/screen/components/SlideCarousel.jsx`, remove the progress bar at the bottom (lines 112-129) and replace with nothing — the progress indicator will be passed as a prop to Layout.

Replace lines 112-131 (from the `{/* Progress bar */}` comment to the closing `</div>`) with just:

```jsx
    </div>
  );
}
```

- [ ] **Step 3: Add ProgressDots component and wire into App.jsx**

Add a new `ProgressDots` inline component in `src/screen/App.jsx`. Insert before the `return` statement (around line 160):

```jsx
  const progressDots = slideRotation.enabledSlides.length > 1 ? (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {slideRotation.enabledSlides.map((s, i) => (
        <div
          key={s.id}
          style={{
            width: i === slideRotation.currentIndex ? '18px' : '6px',
            height: '6px',
            borderRadius: '3px',
            background: i === slideRotation.currentIndex ? tokens.gold : tokens.muted,
            transition: 'all 0.4s ease',
          }}
        />
      ))}
    </div>
  ) : null;
```

Then update the `<Layout>` call to pass `progressDots`:

```jsx
  return (
    <>
      <Layout
        leftColumn={leftColumn}
        rightColumn={rightColumn}
        banner={banner}
        progressDots={progressDots}
        theme={settings.theme}
        tokens={tokens}
      />
      <Takeover takeover={activeTakeover} tokens={tokens} />
      <HiddenAccess tokens={tokens} />
    </>
  );
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`
Expected: `built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add src/screen/components/Layout.jsx src/screen/components/SlideCarousel.jsx src/screen/App.jsx
git commit -m "feat(screen): progress dots, left column divider, refined frame spacing"
```

---

### Task 4: Polish ZmanimSlide with gold glow on next zman

**Files:**
- Modify: `src/screen/components/slides/ZmanimSlide.jsx`

- [ ] **Step 1: Rewrite ZmanimSlide with enhanced gold glow and refined spacing**

Replace the entire file. Key changes:
- Next zman gets a subtle gold box-shadow glow
- Better visual hierarchy between Hebrew and English labels
- Tomorrow section gets a proper ornamental divider with `lamachor` tag
- All rows use consistent vertical rhythm

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';
import { ZMANIM_DISPLAY } from '../../../shared/constants.js';

function parseTimeToMinutes(timeStr) {
  const match = timeStr?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function getNextZmanKey(allTimes, currentMinutes) {
  let earliest = null;
  let earliestKey = null;
  for (const z of ZMANIM_DISPLAY) {
    const mins = parseTimeToMinutes(allTimes[z.k]);
    if (mins === null) continue;
    if (mins > currentMinutes && (earliest === null || mins < earliest)) {
      earliest = mins;
      earliestKey = z.k;
    }
  }
  return earliestKey;
}

function getZmanState(key, timeStr, allTimes) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const zmanMinutes = parseTimeToMinutes(timeStr);
  if (zmanMinutes === null) return 'upcoming';
  const nextKey = getNextZmanKey(allTimes, currentMinutes);
  if (key === nextKey) return 'next';
  if (zmanMinutes < currentMinutes - 30) return 'past';
  if (zmanMinutes < currentMinutes) return 'justPassed';
  return 'upcoming';
}

function ZmanRow({ z, time, state, tokens }) {
  const isNext = state === 'next';
  const isPast = state === 'past';
  const isJustPassed = state === 'justPassed';

  const rowColor = isNext ? tokens.gold : tokens.text;
  const rowOpacity = isPast ? 0.2 : isJustPassed ? 0.4 : 1;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '7px 14px',
        borderRadius: isNext ? '4px' : '0',
        background: isNext ? tokens.goldBg : 'transparent',
        boxShadow: isNext ? `0 0 20px ${tokens.goldBg}, inset 0 0 12px ${tokens.goldBg}` : 'none',
        border: isNext ? `1px solid ${tokens.goldBd}` : '1px solid transparent',
        opacity: rowOpacity,
        transition: 'all 0.6s ease',
        margin: '1px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span
          style={{
            fontFamily: fonts.hebrewPrimary,
            fontSize: '19px',
            fontWeight: 500,
            color: rowColor,
          }}
        >
          {z.he}
        </span>
        <span
          style={{
            fontFamily: fonts.englishBody,
            fontSize: '10px',
            color: isNext ? tokens.gold : tokens.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            direction: 'ltr',
          }}
        >
          {z.en}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.englishDisplay,
          fontWeight: 300,
          fontSize: '21px',
          color: rowColor,
          direction: 'ltr',
          letterSpacing: '0.02em',
        }}
      >
        {time}
      </span>
    </div>
  );
}

export default function ZmanimSlide({ cache, tokens }) {
  const todayZmanim = cache?.zmanim?.today || {};
  const tomorrowZmanim = cache?.zmanim?.tomorrow;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sunsetMinutes = parseTimeToMinutes(todayZmanim.sunset);
  const afterSunset = sunsetMinutes !== null && currentMinutes > sunsetMinutes;

  return (
    <div style={{ width: '100%', maxWidth: '620px' }}>
      {ZMANIM_DISPLAY.map(z => {
        const time = todayZmanim[z.k];
        if (!time) return null;
        const state = getZmanState(z.k, time, todayZmanim);
        return <ZmanRow key={z.k} z={z} time={time} state={state} tokens={tokens} />;
      })}

      {afterSunset && tomorrowZmanim && (
        <>
          {/* Tomorrow divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '18px 0 10px', padding: '0 14px',
          }}>
            <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
            <span style={{
              fontFamily: fonts.hebrewPrimary, fontSize: '12px', fontWeight: 500,
              color: tokens.copper, letterSpacing: '0.04em',
              padding: '2px 10px',
              background: `rgba(184,128,58,0.08)`,
              borderRadius: '3px',
              border: `1px solid rgba(184,128,58,0.2)`,
            }}>
              למחר
            </span>
            <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
          </div>

          {ZMANIM_DISPLAY.slice(0, 5).map(z => {
            const time = tomorrowZmanim[z.k];
            if (!time) return null;
            return (
              <div key={`tmrw-${z.k}`} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '5px 14px',
              }}>
                <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: '17px', fontWeight: 500, color: tokens.copper }}>
                  {z.he}
                </span>
                <span style={{ fontFamily: fonts.englishDisplay, fontWeight: 300, fontSize: '19px', color: tokens.copper, direction: 'ltr' }}>
                  {time}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/screen/components/slides/ZmanimSlide.jsx
git commit -m "feat(screen): gold glow on next zman, copper tomorrow chip, refined spacing"
```

---

### Task 5: Polish remaining slide components

**Files:**
- Modify: `src/screen/components/slides/LimudimSlide.jsx`
- Modify: `src/screen/components/slides/HayomYomSlide.jsx`
- Modify: `src/screen/components/slides/TextSlide.jsx`
- Modify: `src/screen/components/slides/ImageSlide.jsx`

- [ ] **Step 1: Enhance LimudimSlide with better visual hierarchy**

In `src/screen/components/slides/LimudimSlide.jsx`, update the `StudyRow` component to use a subtle left gold border accent. Replace the `StudyRow` function (lines 23-59):

```jsx
function StudyRow({ labelHe, labelEn, value, tokens }) {
  return (
    <div style={{
      marginBottom: '18px',
      paddingLeft: '14px',
      borderLeft: `2px solid ${tokens.goldBd}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: '8px',
        marginBottom: '3px',
      }}>
        <span style={{
          fontFamily: fonts.hebrewPrimary,
          fontSize: '14px',
          fontWeight: 500,
          color: tokens.gold,
          letterSpacing: '0.04em',
        }}>
          {labelHe}
        </span>
        <span style={{
          fontFamily: fonts.englishBody,
          fontSize: '10px',
          color: tokens.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          direction: 'ltr',
        }}>
          {labelEn}
        </span>
      </div>
      <div style={{
        fontFamily: fonts.hebrewPrimary,
        fontSize: '18px',
        fontWeight: 500,
        color: tokens.text,
        lineHeight: 1.5,
      }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Enhance HayomYomSlide with fuller ornament divider**

In `src/screen/components/slides/HayomYomSlide.jsx`, update the ornamental divider (lines 25-34) to use a richer `\u2726 \u25C6 \u2726` pattern:

```jsx
      {hayomYom.he && hayomYom.en && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          margin: '24px 0',
        }}>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted}, transparent)` }} />
          <span style={{ color: tokens.gold, fontSize: '8px', letterSpacing: '0.3em' }}>
            {'\u2726'} {'\u25C7'} {'\u2726'}
          </span>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted}, transparent)` }} />
        </div>
      )}
```

- [ ] **Step 3: Add gradient fade edges to ImageSlide blur treatment**

In `src/screen/components/slides/ImageSlide.jsx`, after the background div (line 39), add an overlay gradient for the blur treatment:

```jsx
      {displayMode === 'fit' && edgeTreatment === 'blur' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, ${tokens.bg} 100%)`,
          zIndex: 0,
        }} />
      )}
```

And update the image zIndex to 2 (line 49).

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/screen/components/slides/LimudimSlide.jsx src/screen/components/slides/HayomYomSlide.jsx src/screen/components/slides/ImageSlide.jsx
git commit -m "feat(screen): polish limudim borders, ornament dividers, image fade edges"
```

---

### Task 6: Enhance Banner with gradient fade edges

**Files:**
- Modify: `src/screen/components/messages/Banner.jsx`

- [ ] **Step 1: Add gradient fades on left/right edges of banner**

Replace the entire `Banner.jsx`:

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';

export default function Banner({ banners, tokens }) {
  if (!banners?.length) return null;

  const text = banners.map(b => b.textHe || b.textEn || b.text).join('    \u2726    ');

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '34px',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      background: `linear-gradient(to top, ${tokens.bg}, rgba(18,16,12,0.95))`,
      borderTop: `1px solid ${tokens.framePrimary}`,
    }}>
      {/* Left fade */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '60px',
        background: `linear-gradient(to right, ${tokens.bg}, transparent)`,
        zIndex: 2, pointerEvents: 'none',
      }} />

      <motion.div
        animate={{ x: ['100%', '-100%'] }}
        transition={{ duration: Math.max(14, text.length * 0.22), repeat: Infinity, ease: 'linear' }}
        style={{
          whiteSpace: 'nowrap',
          fontFamily: fonts.hebrewPrimary,
          fontSize: '16px',
          fontWeight: 500,
          color: tokens.gold,
          zIndex: 1,
        }}
      >
        {text}
      </motion.div>

      {/* Right fade */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '60px',
        background: `linear-gradient(to left, ${tokens.bg}, transparent)`,
        zIndex: 2, pointerEvents: 'none',
      }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/screen/components/messages/Banner.jsx
git commit -m "feat(screen): banner gradient fade edges"
```

---

### Task 7: Pirkei Avos seasonal logic and slide

**Files:**
- Create: `src/shared/pirkeiAvos.js`
- Create: `src/screen/components/slides/PirkeiAvosSlide.jsx`
- Modify: `src/screen/components/SlideCarousel.jsx`

- [ ] **Step 1: Create Pirkei Avos seasonal calculation**

Create `src/shared/pirkeiAvos.js`:

```javascript
/**
 * Pirkei Avos seasonal logic (Chabad custom).
 *
 * - Read on Shabbat afternoons from the Shabbat after Pesach through the Shabbat before Rosh Hashana
 * - Chapters 1-6 in order, then repeat the cycle
 * - Outside the season, return null (slide should be hidden)
 *
 * This is a simplified calculation. For production accuracy, integrate with
 * HebCal's Shabbat data. This version uses approximate date ranges.
 */

const PEREK_NAMES_HE = [
  'פרק א׳',
  'פרק ב׳',
  'פרק ג׳',
  'פרק ד׳',
  'פרק ה׳',
  'פרק ו׳',
];

const PEREK_NAMES_EN = [
  'Chapter 1',
  'Chapter 2',
  'Chapter 3',
  'Chapter 4',
  'Chapter 5',
  'Chapter 6',
];

/**
 * Get the current Pirkei Avos perek based on approximate seasonal calculation.
 * Returns null if outside the Pesach-to-RH season.
 *
 * @param {object} hebrewDate — { hebrewMonth, hebrewDay, hebrewYear } from cache
 * @returns {{ perek: number, hebrewName: string, englishName: string } | null}
 */
export function getCurrentPerek(hebrewDate) {
  if (!hebrewDate?.hebrewMonth) return null;

  const month = hebrewDate.hebrewMonth;
  const day = hebrewDate.hebrewDay;

  // Season: Nissan 22 (after Pesach) through Elul 29 (before Rosh Hashana)
  // Months: Nissan=1, Iyyar=2, Sivan=3, Tammuz=4, Av=5, Elul=6 in the spring-to-fall count
  // HebCal uses English month names

  const monthOrder = {
    'Nisan': 0, 'Iyyar': 1, 'Sivan': 2, 'Tammuz': 3, 'Av': 4, 'Elul': 5,
    // Aliases
    'Nissan': 0,
  };

  const monthIdx = monthOrder[month];
  if (monthIdx === undefined) return null; // Outside season (Tishrei through Adar)

  // Before Pesach ends (Nissan 22)
  if (monthIdx === 0 && day < 22) return null;

  // Calculate approximate week number since start of season
  // Each month ~30 days. Week 0 = Shabbat after Pesach
  const daysIntoSeason = (monthIdx * 30) + day - 22;
  const weekNumber = Math.floor(daysIntoSeason / 7);

  // Cycle through 6 chapters
  const perekIndex = weekNumber % 6;

  return {
    perek: perekIndex + 1,
    hebrewName: PEREK_NAMES_HE[perekIndex],
    englishName: PEREK_NAMES_EN[perekIndex],
  };
}
```

- [ ] **Step 2: Create PirkeiAvosSlide component**

Create `src/screen/components/slides/PirkeiAvosSlide.jsx`:

```jsx
import React from 'react';
import { fonts } from '../../styles/tokens.js';
import { getCurrentPerek } from '../../../shared/pirkeiAvos.js';

export default function PirkeiAvosSlide({ cache, tokens }) {
  const perek = getCurrentPerek(cache?.hebrewDate);

  if (!perek) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: fonts.hebrewPrimary, fontSize: '20px',
          color: tokens.dim,
        }}>
          פרקי אבות — outside season
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', width: '100%', maxWidth: '600px' }}>
      {/* Title */}
      <div style={{
        fontFamily: fonts.hebrewDisplay,
        fontSize: '48px',
        fontWeight: 700,
        color: tokens.text,
        marginBottom: '8px',
      }}>
        פרקי אבות
      </div>

      {/* English subtitle */}
      <div style={{
        fontFamily: fonts.englishDisplay,
        fontSize: '20px',
        fontWeight: 300,
        fontStyle: 'italic',
        color: tokens.dim,
        direction: 'ltr',
        marginBottom: '24px',
      }}>
        Ethics of the Fathers
      </div>

      {/* Ornamental divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        margin: '16px auto', maxWidth: '300px',
      }}>
        <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
        <span style={{ color: tokens.gold, fontSize: '10px' }}>{'\u2726'}</span>
        <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
      </div>

      {/* Chapter chip */}
      <div style={{
        display: 'inline-block',
        padding: '8px 28px',
        background: tokens.goldBg,
        border: `1px solid ${tokens.goldBd}`,
        borderRadius: '4px',
        marginTop: '16px',
      }}>
        <span style={{
          fontFamily: fonts.hebrewPrimary,
          fontSize: '28px',
          fontWeight: 500,
          color: tokens.gold,
        }}>
          {perek.hebrewName}
        </span>
      </div>

      <div style={{
        fontFamily: fonts.englishBody,
        fontSize: '14px',
        color: tokens.muted,
        marginTop: '12px',
        direction: 'ltr',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {perek.englishName}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire PirkeiAvosSlide into SlideCarousel**

In `src/screen/components/SlideCarousel.jsx`, add the import at the top (after line 7):

```jsx
import PirkeiAvosSlide from './slides/PirkeiAvosSlide.jsx';
```

And update the `renderSlide` switch case for `PIRKEI_AVOS` (line 60, which currently renders HayomYomSlide):

```jsx
      case 'PIRKEI_AVOS': return <PirkeiAvosSlide cache={cache} tokens={tokens} />;
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/shared/pirkeiAvos.js src/screen/components/slides/PirkeiAvosSlide.jsx src/screen/components/SlideCarousel.jsx
git commit -m "feat(screen): Pirkei Avos seasonal logic and slide component"
```

---

## Chunk 2: Admin Panel

### Task 8: Admin state management hook and design tokens

**Files:**
- Create: `src/admin/hooks/useAdminState.js`
- Create: `src/admin/styles/admin-tokens.js`

- [ ] **Step 1: Create admin design tokens**

Create `src/admin/styles/admin-tokens.js`:

```javascript
export const adminTokens = {
  bg: '#12100C',
  surface: 'rgba(255,240,195,.045)',
  surfaceHover: 'rgba(255,240,195,.07)',
  text: '#EFE3C0',
  dim: 'rgba(239,227,192,.60)',
  muted: 'rgba(239,227,192,.30)',
  gold: '#D4A84B',
  goldBg: 'rgba(212,168,75,.13)',
  goldBd: 'rgba(212,168,75,.42)',
  border: 'rgba(212,168,75,.16)',
  danger: '#C4342D',
  dangerBg: 'rgba(196,52,45,.12)',
  success: '#4CAF50',
  successBg: 'rgba(76,175,80,.12)',
};

export const adminFonts = {
  hebrewPrimary: "'Frank Ruhl Libre', Georgia, serif",
  hebrewDisplay: "'Noto Serif Hebrew', serif",
  englishBody: "'EB Garamond', Georgia, serif",
  englishDisplay: "'Cormorant Garamond', serif",
};

/** Shared input field style */
export const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: adminTokens.surface,
  border: `1px solid ${adminTokens.border}`,
  borderRadius: '4px',
  color: adminTokens.text,
  fontFamily: adminFonts.englishBody,
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
};

/** Shared button styles */
export const buttonPrimary = {
  padding: '8px 20px',
  background: adminTokens.gold,
  border: 'none',
  borderRadius: '4px',
  color: adminTokens.bg,
  fontFamily: adminFonts.englishBody,
  fontWeight: 500,
  fontSize: '14px',
  cursor: 'pointer',
};

export const buttonSecondary = {
  padding: '8px 20px',
  background: 'transparent',
  border: `1px solid ${adminTokens.border}`,
  borderRadius: '4px',
  color: adminTokens.dim,
  fontFamily: adminFonts.englishBody,
  fontSize: '14px',
  cursor: 'pointer',
};

export const buttonDanger = {
  padding: '8px 20px',
  background: adminTokens.dangerBg,
  border: `1px solid ${adminTokens.danger}`,
  borderRadius: '4px',
  color: adminTokens.danger,
  fontFamily: adminFonts.englishBody,
  fontSize: '14px',
  cursor: 'pointer',
};
```

- [ ] **Step 2: Create admin state management hook**

Create `src/admin/hooks/useAdminState.js`:

```javascript
import { useState, useEffect, useCallback } from 'react';

function getCsrfToken() {
  const match = document.cookie.match(/(^| )_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
    ...options.headers,
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function useAdminState() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch initial state
  useEffect(() => {
    apiFetch('/api/state')
      .then(data => { setState(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  // CRUD helpers
  const updateSettings = useCallback(async (settings) => {
    const result = await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    setState(prev => prev ? { ...prev, settings: result } : prev);
    return result;
  }, []);

  const updateSlides = useCallback(async (slides) => {
    const result = await apiFetch('/api/slides', { method: 'PUT', body: JSON.stringify(slides) });
    setState(prev => prev ? { ...prev, slides: result } : prev);
    return result;
  }, []);

  const createSlide = useCallback(async (slide) => {
    const result = await apiFetch('/api/slides', { method: 'POST', body: JSON.stringify(slide) });
    setState(prev => prev ? { ...prev, slides: [...(prev.slides || []), result] } : prev);
    return result;
  }, []);

  const deleteSlide = useCallback(async (id) => {
    await apiFetch(`/api/slides/${id}`, { method: 'DELETE' });
    setState(prev => prev ? { ...prev, slides: (prev.slides || []).filter(s => s.id !== id) } : prev);
  }, []);

  const createMessage = useCallback(async (msg) => {
    const result = await apiFetch('/api/messages', { method: 'POST', body: JSON.stringify(msg) });
    setState(prev => prev ? { ...prev, messages: [...(prev.messages || []), result] } : prev);
    return result;
  }, []);

  const deleteMessage = useCallback(async (id) => {
    await apiFetch(`/api/messages/${id}`, { method: 'DELETE' });
    setState(prev => prev ? { ...prev, messages: (prev.messages || []).filter(m => m.id !== id) } : prev);
  }, []);

  const createPinned = useCallback(async (pin) => {
    const result = await apiFetch('/api/pinned', { method: 'POST', body: JSON.stringify(pin) });
    setState(prev => prev ? { ...prev, pinned: [...(prev.pinned || []), result] } : prev);
    return result;
  }, []);

  const updatePinned = useCallback(async (id, data) => {
    const result = await apiFetch(`/api/pinned/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setState(prev => prev ? { ...prev, pinned: (prev.pinned || []).map(p => p.id === id ? result : p) } : prev);
    return result;
  }, []);

  const deletePinned = useCallback(async (id) => {
    await apiFetch(`/api/pinned/${id}`, { method: 'DELETE' });
    setState(prev => prev ? { ...prev, pinned: (prev.pinned || []).filter(p => p.id !== id) } : prev);
  }, []);

  const createCustomDay = useCallback(async (day) => {
    const result = await apiFetch('/api/custom-days', { method: 'POST', body: JSON.stringify(day) });
    setState(prev => prev ? { ...prev, customDays: [...(prev.customDays || []), result] } : prev);
    return result;
  }, []);

  const deleteCustomDay = useCallback(async (id) => {
    await apiFetch(`/api/custom-days/${id}`, { method: 'DELETE' });
    setState(prev => prev ? { ...prev, customDays: (prev.customDays || []).filter(d => d.id !== id) } : prev);
  }, []);

  const refresh = useCallback(async () => {
    const result = await apiFetch('/api/refresh', { method: 'POST' });
    setState(prev => prev ? { ...prev, cache: result } : prev);
    return result;
  }, []);

  const screenCommand = useCallback(async (action) => {
    await apiFetch(`/api/screen/${action}`, { method: 'POST' });
  }, []);

  return {
    state, loading, error,
    updateSettings, updateSlides, createSlide, deleteSlide,
    createMessage, deleteMessage,
    createPinned, updatePinned, deletePinned,
    createCustomDay, deleteCustomDay,
    refresh, screenCommand,
  };
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/admin/hooks/useAdminState.js src/admin/styles/admin-tokens.js
git commit -m "feat(admin): state management hook and design tokens"
```

---

### Task 9: Admin Layout with sidebar navigation and live preview

**Files:**
- Create: `src/admin/components/AdminLayout.jsx`
- Create: `src/admin/components/LivePreview.jsx`
- Create: `src/admin/components/ScreenControls.jsx`

- [ ] **Step 1: Create AdminLayout with sidebar navigation**

Create `src/admin/components/AdminLayout.jsx`:

```jsx
import React from 'react';
import { adminTokens, adminFonts } from '../styles/admin-tokens.js';

const NAV_ITEMS = [
  { key: 'slides', labelHe: 'שקופיות', labelEn: 'Slides' },
  { key: 'messages', labelHe: 'הודעות', labelEn: 'Messages' },
  { key: 'pinned', labelHe: 'הצמדות', labelEn: 'Pinned' },
  { key: 'custom-days', labelHe: 'ימים מיוחדים', labelEn: 'Custom Days' },
  { key: 'settings', labelHe: 'הג��רות', labelEn: 'Settings' },
];

export default function AdminLayout({ activeSection, onSectionChange, children, preview }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr 360px',
      height: '100vh',
      background: adminTokens.bg,
      color: adminTokens.text,
      fontFamily: adminFonts.hebrewPrimary,
    }}>
      {/* Sidebar */}
      <div style={{
        borderRight: `1px solid ${adminTokens.border}`,
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{
          padding: '0 20px 20px',
          borderBottom: `1px solid ${adminTokens.border}`,
          marginBottom: '8px',
        }}>
          <div style={{
            fontFamily: adminFonts.hebrewDisplay,
            fontSize: '22px',
            fontWeight: 700,
            color: adminTokens.gold,
          }}>
            TachTach
          </div>
          <div style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '12px',
            color: adminTokens.muted,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Admin Panel
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => onSectionChange(item.key)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 20px',
                background: activeSection === item.key ? adminTokens.goldBg : 'transparent',
                border: 'none',
                borderLeft: activeSection === item.key
                  ? `3px solid ${adminTokens.gold}` : '3px solid transparent',
                color: activeSection === item.key ? adminTokens.gold : adminTokens.dim,
                fontFamily: adminFonts.hebrewPrimary,
                fontSize: '16px',
                fontWeight: 500,
                textAlign: 'right',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {item.labelHe}
              <span style={{
                display: 'block',
                fontFamily: adminFonts.englishBody,
                fontSize: '11px',
                color: adminTokens.muted,
                marginTop: '1px',
              }}>
                {item.labelEn}
              </span>
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${adminTokens.border}` }}>
          <button
            onClick={() => { fetch('/logout', { method: 'POST' }).then(() => location.reload()); }}
            style={{
              background: 'transparent',
              border: `1px solid ${adminTokens.border}`,
              borderRadius: '4px',
              padding: '6px 16px',
              color: adminTokens.dim,
              fontFamily: adminFonts.englishBody,
              fontSize: '13px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        overflow: 'auto',
        padding: '24px 28px',
      }}>
        {children}
      </div>

      {/* Live preview sidebar */}
      <div style={{
        borderLeft: `1px solid ${adminTokens.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {preview}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create LivePreview component**

Create `src/admin/components/LivePreview.jsx`:

```jsx
import React from 'react';
import { adminTokens, adminFonts } from '../styles/admin-tokens.js';

export default function LivePreview() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${adminTokens.border}`,
        fontFamily: adminFonts.englishBody,
        fontSize: '13px',
        color: adminTokens.muted,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Live Preview
      </div>
      <div style={{ flex: 1, position: 'relative', background: '#000' }}>
        <iframe
          src="/screen"
          title="Live Preview"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            transform: 'scale(1)',
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ScreenControls component**

Create `src/admin/components/ScreenControls.jsx`:

```jsx
import React, { useState } from 'react';
import { adminTokens, adminFonts, buttonSecondary } from '../styles/admin-tokens.js';

export default function ScreenControls({ onCommand, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); }
    finally { setRefreshing(false); }
  };

  const btnStyle = {
    ...buttonSecondary,
    padding: '6px 14px',
    fontSize: '13px',
  };

  return (
    <div style={{
      padding: '12px 16px',
      borderTop: `1px solid ${adminTokens.border}`,
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
    }}>
      <button onClick={() => onCommand('pause')} style={btnStyle}>Pause</button>
      <button onClick={() => onCommand('resume')} style={btnStyle}>Resume</button>
      <button onClick={() => onCommand('advance')} style={btnStyle}>Next</button>
      <button onClick={() => onCommand('blank')} style={btnStyle}>Blank</button>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        style={{ ...btnStyle, color: adminTokens.gold, borderColor: adminTokens.goldBd }}
      >
        {refreshing ? 'Refreshing...' : 'Refresh Data'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/admin/components/AdminLayout.jsx src/admin/components/LivePreview.jsx src/admin/components/ScreenControls.jsx
git commit -m "feat(admin): layout shell with sidebar nav, live preview, screen controls"
```

---

### Task 10: Slide Manager component

**Files:**
- Create: `src/admin/components/SlideManager.jsx`

- [ ] **Step 1: Create SlideManager with toggle, duration, reorder, and create**

Create `src/admin/components/SlideManager.jsx`:

```jsx
import React, { useState } from 'react';
import { adminTokens, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';

const BUILT_IN_LABELS = {
  ZMANIM: 'זמנים — Zmanim',
  LIMUDIM: 'לימודים — Limudim',
  HAYOM_YOM: 'היום יום — Hayom Yom',
  PIRKEI_AVOS: 'פרקי אבות — Pirkei Avos',
};

const TEMPLATES = [
  { value: 'headline', label: 'Headline' },
  { value: 'quote', label: 'Quote' },
  { value: 'info', label: 'Info / List' },
  { value: 'announcement', label: 'Announcement' },
];

export default function SlideManager({ slides, onUpdate, onCreate, onDelete }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newSlide, setNewSlide] = useState({
    type: 'TEXT_SLIDE', template: 'headline', titleHe: '', titleEn: '',
    bodyHe: '', bodyEn: '', attribution: '', enabled: true, duration: 13,
  });
  const [dragIdx, setDragIdx] = useState(null);

  const handleToggle = (idx) => {
    const updated = [...slides];
    updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
    onUpdate(updated);
  };

  const handleDuration = (idx, value) => {
    const updated = [...slides];
    updated[idx] = { ...updated[idx], duration: Math.max(3, Math.min(120, parseInt(value) || 13)) };
    onUpdate(updated);
  };

  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const updated = [...slides];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    setDragIdx(idx);
    onUpdate(updated);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleCreate = async () => {
    await onCreate({
      type: newSlide.type,
      template: newSlide.template,
      titleHe: newSlide.titleHe,
      titleEn: newSlide.titleEn,
      bodyHe: newSlide.bodyHe,
      bodyEn: newSlide.bodyEn,
      attribution: newSlide.attribution,
      enabled: true,
      duration: newSlide.duration,
    });
    setNewSlide({ type: 'TEXT_SLIDE', template: 'headline', titleHe: '', titleEn: '', bodyHe: '', bodyEn: '', attribution: '', enabled: true, duration: 13 });
    setShowCreate(false);
  };

  const slideLabel = (s) => {
    if (BUILT_IN_LABELS[s.type]) return BUILT_IN_LABELS[s.type];
    if (s.title) return s.title;
    if (s.titleHe) return s.titleHe;
    if (s.type === 'IMAGE_SLIDE') return 'Image Slide';
    return `Custom Slide`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontFamily: adminFonts.hebrewDisplay, fontSize: '28px', color: adminTokens.gold, margin: 0 }}>
          שקופיות
        </h2>
        <button onClick={() => setShowCreate(!showCreate)} style={buttonPrimary}>
          + New Slide
        </button>
      </div>

      {/* Slide list */}
      {slides.map((slide, idx) => (
        <div
          key={slide.id}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={handleDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: dragIdx === idx ? adminTokens.goldBg : adminTokens.surface,
            border: `1px solid ${adminTokens.border}`,
            borderRadius: '4px',
            marginBottom: '6px',
            cursor: 'grab',
            opacity: slide.enabled ? 1 : 0.5,
            transition: 'all 0.2s',
          }}
        >
          {/* Drag handle */}
          <span style={{ color: adminTokens.muted, fontSize: '16px', cursor: 'grab' }}>
            {'\u2261'}
          </span>

          {/* Toggle */}
          <button
            onClick={() => handleToggle(idx)}
            style={{
              width: '36px', height: '20px',
              borderRadius: '10px',
              border: 'none',
              background: slide.enabled ? adminTokens.gold : adminTokens.border,
              position: 'relative',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute',
              top: '2px',
              left: slide.enabled ? '18px' : '2px',
              width: '16px', height: '16px',
              borderRadius: '50%',
              background: slide.enabled ? adminTokens.bg : adminTokens.dim,
              transition: 'left 0.2s',
            }} />
          </button>

          {/* Label */}
          <div style={{ flex: 1, fontFamily: adminFonts.hebrewPrimary, fontSize: '16px', fontWeight: 500 }}>
            {slideLabel(slide)}
            {slide.type !== 'ZMANIM' && slide.type !== 'LIMUDIM' && slide.type !== 'HAYOM_YOM' && slide.type !== 'PIRKEI_AVOS' && (
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: adminTokens.muted, marginRight: '8px' }}>
                {slide.template || slide.type}
              </span>
            )}
          </div>

          {/* Duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="number"
              value={slide.duration}
              onChange={(e) => handleDuration(idx, e.target.value)}
              style={{ ...inputStyle, width: '56px', textAlign: 'center', padding: '4px 6px', fontSize: '13px' }}
            />
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: adminTokens.muted }}>sec</span>
          </div>

          {/* Delete (custom slides only) */}
          {!BUILT_IN_LABELS[slide.type] && (
            <button
              onClick={() => onDelete(slide.id)}
              style={{
                background: 'transparent', border: 'none', color: adminTokens.danger,
                cursor: 'pointer', fontSize: '18px', padding: '4px',
              }}
            >
              {'\u00D7'}
            </button>
          )}
        </div>
      ))}

      {/* Create new slide form */}
      {showCreate && (
        <div style={{
          marginTop: '16px', padding: '20px',
          background: adminTokens.surface, border: `1px solid ${adminTokens.border}`,
          borderRadius: '4px',
        }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>
              Template
            </label>
            <select
              value={newSlide.template}
              onChange={(e) => setNewSlide(prev => ({ ...prev, template: e.target.value }))}
              style={{ ...inputStyle }}
            >
              {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Title (Hebrew)</label>
              <input value={newSlide.titleHe} onChange={e => setNewSlide(p => ({ ...p, titleHe: e.target.value }))} style={inputStyle} dir="rtl" />
            </div>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Title (English)</label>
              <input value={newSlide.titleEn} onChange={e => setNewSlide(p => ({ ...p, titleEn: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Body (Hebrew)</label>
              <textarea value={newSlide.bodyHe} onChange={e => setNewSlide(p => ({ ...p, bodyHe: e.target.value }))} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} dir="rtl" />
            </div>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Body (English)</label>
              <textarea value={newSlide.bodyEn} onChange={e => setNewSlide(p => ({ ...p, bodyEn: e.target.value }))} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
            </div>
          </div>

          {newSlide.template === 'quote' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Attribution</label>
              <input value={newSlide.attribution} onChange={e => setNewSlide(p => ({ ...p, attribution: e.target.value }))} style={inputStyle} />
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Duration (seconds)</label>
            <input type="number" value={newSlide.duration} onChange={e => setNewSlide(p => ({ ...p, duration: parseInt(e.target.value) || 13 }))} style={{ ...inputStyle, width: '80px' }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCreate} style={buttonPrimary}>Create Slide</button>
            <button onClick={() => setShowCreate(false)} style={buttonSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/admin/components/SlideManager.jsx
git commit -m "feat(admin): slide manager with toggle, drag reorder, duration, create"
```

---

### Task 11: Message Composer component

**Files:**
- Create: `src/admin/components/MessageComposer.jsx`

- [ ] **Step 1: Create MessageComposer for banner/board/takeover**

Create `src/admin/components/MessageComposer.jsx`:

```jsx
import React, { useState } from 'react';
import { adminTokens, adminFonts, inputStyle, buttonPrimary, buttonDanger } from '../styles/admin-tokens.js';

const MSG_TYPES = [
  { value: 'banner', labelHe: 'באנר', labelEn: 'Banner', desc: 'Scrolling strip at bottom. Slides keep rotating.' },
  { value: 'board', labelHe: 'לוח', labelEn: 'Board', desc: 'Replaces slide content. Can target a person.' },
  { value: 'takeover', labelHe: 'חירום', labelEn: 'Takeover', desc: 'Full-screen urgent. Pauses everything.' },
];

const EXPIRY_OPTIONS = [
  { value: '', label: 'Manual dismiss' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: 'eod', label: 'End of day' },
];

export default function MessageComposer({ messages, onCreate, onDelete }) {
  const [form, setForm] = useState({ type: 'banner', textHe: '', textEn: '', target: '', expiry: '30' });

  const handleSubmit = async () => {
    let expiresAt = null;
    if (form.expiry === 'eod') {
      const eod = new Date();
      eod.setHours(23, 59, 59, 999);
      expiresAt = eod.toISOString();
    } else if (form.expiry) {
      expiresAt = new Date(Date.now() + parseInt(form.expiry) * 60000).toISOString();
    }

    await onCreate({
      type: form.type,
      textHe: form.textHe,
      textEn: form.textEn,
      target: form.target || undefined,
      expiresAt,
    });

    setForm(prev => ({ ...prev, textHe: '', textEn: '', target: '' }));
  };

  const activeMessages = (messages || []).filter(m => !m.expiresAt || new Date(m.expiresAt) > new Date());

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.hebrewDisplay, fontSize: '28px', color: adminTokens.gold, margin: '0 0 20px' }}>
        הודעות
      </h2>

      {/* Compose form */}
      <div style={{
        padding: '20px', background: adminTokens.surface,
        border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
        marginBottom: '24px',
      }}>
        {/* Type selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {MSG_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setForm(prev => ({ ...prev, type: t.value }))}
              style={{
                flex: 1, padding: '10px',
                background: form.type === t.value ? adminTokens.goldBg : 'transparent',
                border: `1px solid ${form.type === t.value ? adminTokens.goldBd : adminTokens.border}`,
                borderRadius: '4px',
                color: form.type === t.value ? adminTokens.gold : adminTokens.dim,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '16px', fontWeight: 500 }}>{t.labelHe}</div>
              <div style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: adminTokens.muted, marginTop: '2px' }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Text inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Text (Hebrew)</label>
            <textarea value={form.textHe} onChange={e => setForm(p => ({ ...p, textHe: e.target.value }))} style={{ ...inputStyle, minHeight: '60px' }} dir="rtl" />
          </div>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Text (English)</label>
            <textarea value={form.textEn} onChange={e => setForm(p => ({ ...p, textEn: e.target.value }))} style={{ ...inputStyle, minHeight: '60px' }} />
          </div>
        </div>

        {/* Target (for board type) */}
        {form.type === 'board' && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Target (name/group)</label>
            <input value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))} style={inputStyle} />
          </div>
        )}

        {/* Expiry */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'end', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Expiry</label>
            <select value={form.expiry} onChange={e => setForm(p => ({ ...p, expiry: e.target.value }))} style={inputStyle}>
              {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <button onClick={handleSubmit} style={buttonPrimary} disabled={!form.textHe && !form.textEn}>
          Send Message
        </button>
      </div>

      {/* Active messages */}
      <h3 style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: adminTokens.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
        Active Messages ({activeMessages.length})
      </h3>

      {activeMessages.map(msg => (
        <div key={msg.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: adminTokens.surface,
          border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
          marginBottom: '6px',
        }}>
          <div>
            <span style={{
              fontFamily: adminFonts.englishBody, fontSize: '11px',
              color: msg.type === 'takeover' ? adminTokens.danger : adminTokens.gold,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {msg.type}
            </span>
            <div style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '16px', fontWeight: 500, marginTop: '2px' }}>
              {msg.textHe || msg.textEn}
            </div>
            {msg.expiresAt && (
              <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: adminTokens.muted }}>
                Expires: {new Date(msg.expiresAt).toLocaleTimeString()}
              </div>
            )}
          </div>
          <button onClick={() => onDelete(msg.id)} style={{ ...buttonDanger, padding: '4px 12px', fontSize: '12px' }}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/admin/components/MessageComposer.jsx
git commit -m "feat(admin): message composer for banner/board/takeover with expiry"
```

---

### Task 12: Pinned Notes Manager, Custom Days Editor, Settings Panel

**Files:**
- Create: `src/admin/components/PinnedManager.jsx`
- Create: `src/admin/components/CustomDaysEditor.jsx`
- Create: `src/admin/components/SettingsPanel.jsx`

- [ ] **Step 1: Create PinnedManager**

Create `src/admin/components/PinnedManager.jsx`:

```jsx
import React, { useState } from 'react';
import { adminTokens, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';

export default function PinnedManager({ pinned, onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState({ textHe: '', textEn: '' });

  const handleCreate = async () => {
    if (!form.textHe && !form.textEn) return;
    await onCreate({ textHe: form.textHe, textEn: form.textEn });
    setForm({ textHe: '', textEn: '' });
  };

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.hebrewDisplay, fontSize: '28px', color: adminTokens.gold, margin: '0 0 20px' }}>
        הצמדות
      </h2>

      {/* Create form */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '20px',
        padding: '16px', background: adminTokens.surface,
        border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
      }}>
        <input
          placeholder="Hebrew text"
          value={form.textHe}
          onChange={e => setForm(p => ({ ...p, textHe: e.target.value }))}
          style={{ ...inputStyle, flex: 1 }}
          dir="rtl"
        />
        <input
          placeholder="English text"
          value={form.textEn}
          onChange={e => setForm(p => ({ ...p, textEn: e.target.value }))}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={handleCreate} style={{ ...buttonPrimary, whiteSpace: 'nowrap' }}>+ Add</button>
      </div>

      {/* List */}
      {(pinned || []).map(note => (
        <div key={note.id} style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 16px', background: adminTokens.surface,
          border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
          marginBottom: '6px',
        }}>
          <span style={{ color: adminTokens.gold, fontSize: '8px' }}>{'\u25C9'}</span>
          <div style={{ flex: 1, fontFamily: adminFonts.hebrewPrimary, fontSize: '16px', fontWeight: 500 }}>
            {note.textHe || note.textEn || note.text}
          </div>
          <button
            onClick={() => onDelete(note.id)}
            style={{ background: 'transparent', border: 'none', color: adminTokens.danger, cursor: 'pointer', fontSize: '18px' }}
          >
            {'\u00D7'}
          </button>
        </div>
      ))}

      {(!pinned || pinned.length === 0) && (
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: adminTokens.muted, textAlign: 'center', padding: '24px' }}>
          No pinned notes. Add one above.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create CustomDaysEditor**

Create `src/admin/components/CustomDaysEditor.jsx`:

```jsx
import React, { useState } from 'react';
import { adminTokens, adminFonts, inputStyle, buttonPrimary } from '../styles/admin-tokens.js';

const HEBREW_MONTHS = [
  'Tishrei', 'Cheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar',
  'Adar II', 'Nisan', 'Iyyar', 'Sivan', 'Tammuz', 'Av', 'Elul',
];

export default function CustomDaysEditor({ customDays, onCreate, onDelete }) {
  const [mode, setMode] = useState('hebrew');
  const [form, setForm] = useState({
    title: '', subtitle: '',
    hebrewMonth: 'Tishrei', hebrewDay: 1,
    gregorianMonth: 1, gregorianDay: 1,
    recurring: true,
  });

  const handleCreate = async () => {
    if (!form.title) return;
    const payload = {
      title: form.title,
      subtitle: form.subtitle,
      recurring: form.recurring,
    };
    if (mode === 'hebrew') {
      payload.hebrewMonth = form.hebrewMonth;
      payload.hebrewDay = form.hebrewDay;
    } else {
      payload.gregorianMonth = form.gregorianMonth;
      payload.gregorianDay = form.gregorianDay;
    }
    await onCreate(payload);
    setForm(prev => ({ ...prev, title: '', subtitle: '' }));
  };

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.hebrewDisplay, fontSize: '28px', color: adminTokens.gold, margin: '0 0 20px' }}>
        ימים מיוחדים
      </h2>

      <div style={{
        padding: '20px', background: adminTokens.surface,
        border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
        marginBottom: '24px',
      }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => setMode('hebrew')} style={{ padding: '6px 16px', background: mode === 'hebrew' ? adminTokens.goldBg : 'transparent', border: `1px solid ${mode === 'hebrew' ? adminTokens.goldBd : adminTokens.border}`, borderRadius: '4px', color: mode === 'hebrew' ? adminTokens.gold : adminTokens.dim, cursor: 'pointer', fontFamily: adminFonts.englishBody }}>
            Hebrew Date
          </button>
          <button onClick={() => setMode('gregorian')} style={{ padding: '6px 16px', background: mode === 'gregorian' ? adminTokens.goldBg : 'transparent', border: `1px solid ${mode === 'gregorian' ? adminTokens.goldBd : adminTokens.border}`, borderRadius: '4px', color: mode === 'gregorian' ? adminTokens.gold : adminTokens.dim, cursor: 'pointer', fontFamily: adminFonts.englishBody }}>
            Gregorian Date
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Title (Hebrew)</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} dir="rtl" />
          </div>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Subtitle (English)</label>
            <input value={form.subtitle} onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        {mode === 'hebrew' ? (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Month</label>
              <select value={form.hebrewMonth} onChange={e => setForm(p => ({ ...p, hebrewMonth: e.target.value }))} style={inputStyle}>
                {HEBREW_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ width: '80px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Day</label>
              <input type="number" min="1" max="30" value={form.hebrewDay} onChange={e => setForm(p => ({ ...p, hebrewDay: parseInt(e.target.value) || 1 }))} style={inputStyle} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '80px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Month</label>
              <input type="number" min="1" max="12" value={form.gregorianMonth} onChange={e => setForm(p => ({ ...p, gregorianMonth: parseInt(e.target.value) || 1 }))} style={inputStyle} />
            </div>
            <div style={{ width: '80px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Day</label>
              <input type="number" min="1" max="31" value={form.gregorianDay} onChange={e => setForm(p => ({ ...p, gregorianDay: parseInt(e.target.value) || 1 }))} style={inputStyle} />
            </div>
          </div>
        )}

        <button onClick={handleCreate} style={buttonPrimary}>Add Custom Day</button>
      </div>

      {/* List */}
      {(customDays || []).map(day => (
        <div key={day.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: adminTokens.surface,
          border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
          marginBottom: '6px',
        }}>
          <div>
            <div style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '16px', fontWeight: 500 }}>{day.title}</div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: adminTokens.muted }}>
              {day.hebrewMonth ? `${day.hebrewMonth} ${day.hebrewDay}` : `${day.gregorianMonth}/${day.gregorianDay}`}
              {day.subtitle ? ` \u2014 ${day.subtitle}` : ''}
            </div>
          </div>
          <button onClick={() => onDelete(day.id)} style={{ background: 'transparent', border: 'none', color: adminTokens.danger, cursor: 'pointer', fontSize: '18px' }}>{'\u00D7'}</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create SettingsPanel**

Create `src/admin/components/SettingsPanel.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { adminTokens, adminFonts, inputStyle, buttonPrimary } from '../styles/admin-tokens.js';

export default function SettingsPanel({ settings, onUpdate }) {
  const [local, setLocal] = useState(settings || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try { await onUpdate(local); }
    finally { setSaving(false); }
  };

  const Section = ({ title, children }) => (
    <div style={{
      marginBottom: '24px', padding: '20px',
      background: adminTokens.surface, border: `1px solid ${adminTokens.border}`,
      borderRadius: '4px',
    }}>
      <h3 style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: adminTokens.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontFamily: adminFonts.hebrewDisplay, fontSize: '28px', color: adminTokens.gold, margin: 0 }}>
          הגדרות
        </h2>
        <button onClick={handleSave} style={buttonPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <Section title="Location">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Zip Code</label>
            <input value={local.location?.zip || ''} onChange={e => setLocal(p => ({ ...p, location: { ...p.location, zip: e.target.value } }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Chabad Location ID</label>
            <input value={local.location?.locationId || ''} onChange={e => setLocal(p => ({ ...p, location: { ...p.location, locationId: e.target.value } }))} style={inputStyle} />
          </div>
        </div>
      </Section>

      <Section title="Theme">
        <div style={{ display: 'flex', gap: '8px' }}>
          {['dark', 'parchment', 'custom'].map(t => (
            <button
              key={t}
              onClick={() => setLocal(p => ({ ...p, theme: t }))}
              style={{
                padding: '8px 20px',
                background: local.theme === t ? adminTokens.goldBg : 'transparent',
                border: `1px solid ${local.theme === t ? adminTokens.goldBd : adminTokens.border}`,
                borderRadius: '4px',
                color: local.theme === t ? adminTokens.gold : adminTokens.dim,
                cursor: 'pointer',
                fontFamily: adminFonts.englishBody,
                fontSize: '14px',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Scheduler">
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={local.scheduler?.trackA !== false}
              onChange={e => setLocal(p => ({ ...p, scheduler: { ...p.scheduler, trackA: e.target.checked } }))}
            />
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: adminTokens.text }}>
              Track A: Refresh after each major zman
            </span>
          </label>
        </div>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Track B: Daily refresh time</label>
          <input
            type="time"
            value={local.scheduler?.trackBTime || '04:00'}
            onChange={e => setLocal(p => ({ ...p, scheduler: { ...p.scheduler, trackBTime: e.target.value } }))}
            style={{ ...inputStyle, width: '140px' }}
          />
        </div>
      </Section>

      <Section title="Visibility">
        {[
          { key: 'clock', label: 'Clock' },
          { key: 'hebrewDate', label: 'Hebrew Date' },
          { key: 'parsha', label: 'Parsha Badge' },
          { key: 'omer', label: 'Omer Count' },
          { key: 'pinnedNotes', label: 'Pinned Notes' },
        ].map(item => (
          <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={local.visibility?.[item.key] !== false}
              onChange={e => setLocal(p => ({
                ...p,
                visibility: { ...p.visibility, [item.key]: e.target.checked },
              }))}
            />
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: adminTokens.text }}>{item.label}</span>
          </label>
        ))}
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/admin/components/PinnedManager.jsx src/admin/components/CustomDaysEditor.jsx src/admin/components/SettingsPanel.jsx
git commit -m "feat(admin): pinned manager, custom days editor, settings panel"
```

---

### Task 13: Wire up admin App.jsx with all components

**Files:**
- Modify: `src/admin/App.jsx`

- [ ] **Step 1: Rewrite admin App.jsx to integrate all components**

Replace the entire file:

```jsx
import React, { useState } from 'react';
import { useAdminState } from './hooks/useAdminState.js';
import AdminLayout from './components/AdminLayout.jsx';
import LivePreview from './components/LivePreview.jsx';
import ScreenControls from './components/ScreenControls.jsx';
import SlideManager from './components/SlideManager.jsx';
import MessageComposer from './components/MessageComposer.jsx';
import PinnedManager from './components/PinnedManager.jsx';
import CustomDaysEditor from './components/CustomDaysEditor.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { adminTokens, adminFonts } from './styles/admin-tokens.js';

export default function App() {
  const [section, setSection] = useState('slides');
  const admin = useAdminState();

  if (admin.loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: adminTokens.bg, color: adminTokens.text,
        fontFamily: adminFonts.hebrewPrimary, fontSize: '18px',
      }}>
        Loading...
      </div>
    );
  }

  if (admin.error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '12px',
        background: adminTokens.bg, color: adminTokens.danger,
        fontFamily: adminFonts.englishBody, fontSize: '16px',
      }}>
        <div>Error: {admin.error}</div>
        <button onClick={() => location.reload()} style={{ padding: '8px 20px', background: adminTokens.gold, border: 'none', borderRadius: '4px', color: adminTokens.bg, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  const renderSection = () => {
    switch (section) {
      case 'slides':
        return (
          <SlideManager
            slides={admin.state?.slides || []}
            onUpdate={admin.updateSlides}
            onCreate={admin.createSlide}
            onDelete={admin.deleteSlide}
          />
        );
      case 'messages':
        return (
          <MessageComposer
            messages={admin.state?.messages || []}
            onCreate={admin.createMessage}
            onDelete={admin.deleteMessage}
          />
        );
      case 'pinned':
        return (
          <PinnedManager
            pinned={admin.state?.pinned || []}
            onCreate={admin.createPinned}
            onUpdate={admin.updatePinned}
            onDelete={admin.deletePinned}
          />
        );
      case 'custom-days':
        return (
          <CustomDaysEditor
            customDays={admin.state?.customDays || []}
            onCreate={admin.createCustomDay}
            onDelete={admin.deleteCustomDay}
          />
        );
      case 'settings':
        return (
          <SettingsPanel
            settings={admin.state?.settings || {}}
            onUpdate={admin.updateSettings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AdminLayout
      activeSection={section}
      onSectionChange={setSection}
      preview={
        <>
          <LivePreview />
          <ScreenControls
            onCommand={admin.screenCommand}
            onRefresh={admin.refresh}
          />
        </>
      }
    >
      {renderSection()}
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -5`
Expected: `built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/App.jsx
git commit -m "feat(admin): wire all sections into admin app shell"
```

---

## Chunk 3: Image Uploads + Finishing

### Task 14: Image upload server pipeline (multer + sharp)

**Files:**
- Create: `src/server/upload.js`
- Modify: `src/server/routes/api.js`

- [ ] **Step 1: Create upload processing module**

Create `src/server/upload.js`:

```javascript
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, unlink, readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');

// Ensure upload directory exists
await mkdir(UPLOAD_DIR, { recursive: true });

// Multer config: store in memory for sharp processing
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

/**
 * Process an uploaded image: optimize, extract dominant color, save variants.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {{ id, filename, width, height, dominantColor }}
 */
export async function processImage(buffer, mimetype) {
  const id = uuidv4();
  const ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';

  // Get metadata + dominant color
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { dominant } = await image.stats();
  const dominantColor = `rgb(${dominant.r},${dominant.g},${dominant.b})`;

  // Save optimized original
  const filename = `${id}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  await sharp(buffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(filepath);

  // Save blur variant for glassy edge treatment
  const blurFilename = `${id}-blur.jpg`;
  await sharp(buffer)
    .resize(64, 36, { fit: 'cover' })
    .blur(8)
    .jpeg({ quality: 60 })
    .toFile(path.join(UPLOAD_DIR, blurFilename));

  return {
    id,
    filename,
    blurFilename,
    width: metadata.width,
    height: metadata.height,
    dominantColor,
  };
}

/**
 * Delete an image and its variants.
 */
export async function deleteImage(id) {
  const files = await readdir(UPLOAD_DIR);
  for (const file of files) {
    if (file.startsWith(id)) {
      await unlink(path.join(UPLOAD_DIR, file)).catch(() => {});
    }
  }
}
```

- [ ] **Step 2: Add upload routes to api.js**

In `src/server/routes/api.js`, add imports at the top (after line 4):

```javascript
import { upload, processImage, deleteImage } from '../upload.js';
```

Then add these routes before the `export default router;` line at the bottom:

```javascript
// ── Image Upload ──────────────────────────────────────────────────────────────

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const result = await processImage(req.file.buffer, req.file.mimetype);
    res.status(201).json(result);
  } catch (err) {
    console.error('[api] POST /upload error:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

router.delete('/images/:id', async (req, res) => {
  try {
    await deleteImage(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
});
```

- [ ] **Step 3: Add static serving for uploaded images in app.js**

In `src/server/app.js`, add after the `app.use('/assets', ...)` line (around line 110):

```javascript
    // Serve uploaded images
    app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'data/uploads'), {
      maxAge: '7d',
    }));
```

Also add it in the else branch (around line 124) so uploads work in dev mode too:

```javascript
    app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'data/uploads'), {
      maxAge: '7d',
    }));
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/server/upload.js src/server/routes/api.js src/server/app.js
git commit -m "feat(server): image upload pipeline with sharp processing and blur variants"
```

---

### Task 15: Image Uploader admin component

**Files:**
- Create: `src/admin/components/ImageUploader.jsx`
- Modify: `src/admin/App.jsx`
- Modify: `src/admin/components/AdminLayout.jsx`

- [ ] **Step 1: Create ImageUploader component**

Create `src/admin/components/ImageUploader.jsx`:

```jsx
import React, { useState, useRef } from 'react';
import { adminTokens, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';

function getCsrfToken() {
  const match = document.cookie.match(/(^| )_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
}

export default function ImageUploader({ onSlideCreated }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [displayMode, setDisplayMode] = useState('fit');
  const [edgeTreatment, setEdgeTreatment] = useState('blur');
  const [duration, setDuration] = useState(13);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setResult(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddAsSlide = async () => {
    if (!result) return;
    await onSlideCreated({
      type: 'IMAGE_SLIDE',
      imageUrl: `/uploads/${result.filename}`,
      blurUrl: `/uploads/${result.blurFilename}`,
      dominantColor: result.dominantColor,
      displayMode,
      edgeTreatment,
      enabled: true,
      duration,
    });
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.hebrewDisplay, fontSize: '28px', color: adminTokens.gold, margin: '0 0 20px' }}>
        Upload Image
      </h2>

      <div style={{
        padding: '24px', background: adminTokens.surface,
        border: `1px solid ${adminTokens.border}`, borderRadius: '4px',
        textAlign: 'center',
      }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ ...buttonPrimary, fontSize: '16px', padding: '12px 32px' }}
        >
          {uploading ? 'Uploading...' : 'Choose Image'}
        </button>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: adminTokens.muted, marginTop: '8px' }}>
          JPEG, PNG, or WebP. Max 10MB.
        </div>
      </div>

      {result && (
        <div style={{
          marginTop: '16px', padding: '20px',
          background: adminTokens.surface, border: `1px solid ${adminTokens.border}`,
          borderRadius: '4px',
        }}>
          {/* Preview */}
          <img
            src={`/uploads/${result.filename}`}
            alt="Uploaded"
            style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px', marginBottom: '16px' }}
          />

          {/* Display mode */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Display Mode</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['fit', 'fill', 'stretch'].map(m => (
                <button key={m} onClick={() => setDisplayMode(m)} style={{
                  padding: '6px 16px',
                  background: displayMode === m ? adminTokens.goldBg : 'transparent',
                  border: `1px solid ${displayMode === m ? adminTokens.goldBd : adminTokens.border}`,
                  borderRadius: '4px', color: displayMode === m ? adminTokens.gold : adminTokens.dim,
                  cursor: 'pointer', fontFamily: adminFonts.englishBody, textTransform: 'capitalize',
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Edge treatment (for fit mode) */}
          {displayMode === 'fit' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Edge Treatment</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['blur', 'gradient', 'dark', 'light'].map(t => (
                  <button key={t} onClick={() => setEdgeTreatment(t)} style={{
                    padding: '6px 16px',
                    background: edgeTreatment === t ? adminTokens.goldBg : 'transparent',
                    border: `1px solid ${edgeTreatment === t ? adminTokens.goldBd : adminTokens.border}`,
                    borderRadius: '4px', color: edgeTreatment === t ? adminTokens.gold : adminTokens.dim,
                    cursor: 'pointer', fontFamily: adminFonts.englishBody, textTransform: 'capitalize',
                  }}>
                    {t === 'blur' ? 'Glassy Blur' : t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: adminTokens.muted, display: 'block', marginBottom: '4px' }}>Duration (seconds)</label>
            <input type="number" value={duration} onChange={e => setDuration(parseInt(e.target.value) || 13)} style={{ ...inputStyle, width: '80px' }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleAddAsSlide} style={buttonPrimary}>Add as Slide</button>
            <button onClick={() => { setResult(null); if (fileRef.current) fileRef.current.value = ''; }} style={buttonSecondary}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add images section to admin navigation and App.jsx**

In `src/admin/components/AdminLayout.jsx`, add to the `NAV_ITEMS` array (after the `settings` entry):

```javascript
  { key: 'images', labelHe: 'תמונות', labelEn: 'Images' },
```

In `src/admin/App.jsx`, add the import:
```jsx
import ImageUploader from './components/ImageUploader.jsx';
```

And add the case in `renderSection`:
```jsx
      case 'images':
        return (
          <ImageUploader onSlideCreated={admin.createSlide} />
        );
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/admin/components/ImageUploader.jsx src/admin/components/AdminLayout.jsx src/admin/App.jsx
git commit -m "feat(admin): image uploader with display mode and edge treatment options"
```

---

### Task 16: Kiosk hardening scripts and systemd service

**Files:**
- Create: `scripts/kiosk-setup.sh`
- Create: `tachtach-screens.service`

- [ ] **Step 1: Create systemd service file**

Create `tachtach-screens.service`:

```ini
[Unit]
Description=TachTach-Screens Digital Signage Server
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/tachtach-screens
ExecStart=/usr/bin/node /home/pi/tachtach-screens/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Create kiosk setup script**

Create `scripts/kiosk-setup.sh`:

```bash
#!/usr/bin/env bash
# TachTach-Screens — Raspberry Pi kiosk setup
# Run as root: sudo bash scripts/kiosk-setup.sh

set -euo pipefail

echo "=== TachTach-Screens Kiosk Setup ==="

# 1. Install systemd service
echo "[1/5] Installing systemd service..."
cp tachtach-screens.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tachtach-screens
systemctl start tachtach-screens

# 2. Configure Chromium kiosk autostart
echo "[2/5] Configuring Chromium kiosk autostart..."
AUTOSTART_DIR="/etc/xdg/lxsession/LXDE-pi"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/autostart" << 'AUTOSTART'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@unclutter -idle 0.5
@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-translate --no-first-run --check-for-update-interval=31536000 --overscroll-history-navigation=0 --disable-pinch --disable-features=TranslateUI --disable-dev-shm-usage http://localhost:3000/screen
AUTOSTART

# 3. Hide mouse cursor
echo "[3/5] Installing unclutter..."
apt-get install -y unclutter

# 4. Disable USB auto-mount
echo "[4/5] Disabling USB auto-mount..."
systemctl mask udisks2 2>/dev/null || true

# 5. SSH hardening
echo "[5/5] Configuring SSH on port 2222..."
if ! grep -q "^Port 2222" /etc/ssh/sshd_config; then
  sed -i 's/^#\?Port .*/Port 2222/' /etc/ssh/sshd_config
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart sshd
fi

echo ""
echo "=== Setup Complete ==="
echo "- Service: systemctl status tachtach-screens"
echo "- Kiosk: will start on next reboot"
echo "- SSH: port 2222, key-only auth"
echo ""
echo "Run 'node setup.js' in /home/pi/tachtach-screens to set admin password."
```

- [ ] **Step 3: Make script executable**

Run: `chmod +x scripts/kiosk-setup.sh`

- [ ] **Step 4: Commit**

```bash
git add tachtach-screens.service scripts/kiosk-setup.sh
git commit -m "feat(deploy): systemd service and kiosk hardening script"
```

---

### Task 17: Final build verification and font serving for uploads path

**Files:**
- Modify: `src/server/app.js` (if not already done in Task 14)

- [ ] **Step 1: Full build and verify**

Run: `npm run build 2>&1 | tail -10`
Expected: Both screen and admin entry points build successfully.

- [ ] **Step 2: Start server and smoke test**

Run: `node server.js &`
Then test: `curl -s http://127.0.0.1:3000/screen | head -5` — should return HTML
And: `curl -s http://127.0.0.1:3000/login | head -5` — should return login page
Kill server after test.

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final build verification and fixes"
```

---

## Agent Parallelization Guide

These tasks can be parallelized into 3 independent agent groups:

**Agent Group A (Kiosk Screen):** Tasks 1-7
- Can run entirely independently
- Touches only `src/screen/` and `src/shared/`

**Agent Group B (Admin Panel):** Tasks 8-13
- Can run entirely independently
- Touches only `src/admin/`

**Agent Group C (Server + Finishing):** Tasks 14-17
- Task 14 depends on existing server code
- Tasks 15 depends on Task 14 (upload route must exist)
- Tasks 16-17 are independent

**Recommended execution:**
1. Run Agent Group A and Agent Group B in parallel
2. Run Agent Group C after both complete (Task 14 modifies server, Task 15 modifies admin — needs both to be stable)
3. Task 17 runs last as final verification
