import React from 'react';
import { StageBox, PAGE_SECONDS } from '../../takeover/TakeoverStage.jsx';

/**
 * Announcement renderers. Everything is drawn by the round-3b takeover stage
 * (src/screen/takeover/): the item's look.layout picks the layout (bigwords,
 * event, list, quicktime, quote, sicha, letter; migrated 'classic' draws as Big
 * words) and look.style one of the 26 styles (src/screen/design/announceStyles.js
 * is the seam; unknown ids draw as Classic). look.animation + settings.motion
 * decide how much moves (src/shared/takeoverStyles.js effectiveAnimation).
 */

/**
 * Rotation / hold slide body for an announcement item: the stage at the design
 * size, scaled into the page panel. Long sicha/letter text steps through pages;
 * the slide asks the rotation for enough time to show them all.
 */
export default function AnnouncementSlide({ item, onRequestDuration }) {
  if (!item) return null;
  const base = item.slide?.duration || 12;
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, width: '100%', height: '100%' }}>
      <StageBox
        key={item.id}
        item={item}
        mode="fit"
        radius={32}
        showClock={false}
        onPages={(n) => { if (n > 1) onRequestDuration?.(Math.max(base, n * PAGE_SECONDS + 2)); }}
      />
    </div>
  );
}

/**
 * Full-canvas takeover: the stage at the real canvas size, rail hidden, small
 * clock in the style's corner. Pauses rotation (App.jsx). Remounts per item, so
 * each takeover (and each turn of a shared rotation) plays its entrance.
 */
export function AnnouncementTakeover({ item, clock }) {
  if (!item) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg)' }}>
      <StageBox key={item.id} item={item} mode="canvas" clock={clock} />
    </div>
  );
}
