/**
 * Font loading for the screen.
 *  - The approved defaults (Rubik, Manrope, Frank Ruhl Libre, EB Garamond)
 *    are bundled from npm (@fontsource-variable/*), so the kiosk shows the
 *    right type even when Google Fonts is unreachable. unicode-range subsets
 *    mean only the Latin/Hebrew files are actually fetched.
 *  - Any font the owner uploaded (data/fonts.json → /fonts/<file>) gets an
 *    @font-face, so it can be assigned to any role (src/shared/fontRoles.js).
 *  - Other built-ins chosen for a role load from Google Fonts as before.
 */
import '@fontsource-variable/rubik';
import '@fontsource-variable/manrope';
import '@fontsource-variable/frank-ruhl-libre';
import '@fontsource-variable/eb-garamond';
// Message & takeover font styles (settings.announceFonts, src/shared/fontRoles.js
// ANNOUNCE_FONT_PRESETS): bundled too, never Google Fonts (offline-safe).
import '@fontsource/suez-one';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
// Condensed grotesque for the big countdown numerals (Countdown page + its takeover, src/shared/fontRoles.js
// CONDENSED_NUMERALS); also a built-in any font role can pick. Bundled, never Google Fonts.
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
// Condensed grotesque for big countdown numerals (Countdown page / its takeover default; also a pickable built-in).
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
// Letterhead look of the Letter layout: thin Hebrew letterhead + typewriter text (bundled, offline-safe).
import '@fontsource/miriam-libre/hebrew-400.css';
import '@fontsource/miriam-libre/hebrew-700.css';
import '@fontsource/miriam-libre/latin-400.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/courier-prime/latin-700.css';
import { googleFamiliesFor } from '../../shared/fontRoles.js';

function styleEl(attr) {
  let el = document.querySelector(`style[${attr}]`);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute(attr, 'true');
    document.head.appendChild(el);
  }
  return el;
}

const FORMAT = { truetype: 'truetype', opentype: 'opentype', woff: 'woff', woff2: 'woff2' };

/** @font-face rules for every uploaded font (canonical list: data/fonts.json). */
export function applyUploadedFonts(list) {
  if (typeof document === 'undefined') return;
  const rules = (Array.isArray(list) ? list : []).filter((f) => f?.name && f?.filename).map((f) => {
    const name = String(f.name).replace(/[^\p{L}\p{N} _.-]/gu, ''); // never let a stored name break out of the CSS string
    const file = encodeURIComponent(String(f.filename));
    return `@font-face { font-family: '${name}'; src: url('/fonts/${file}') format('${FORMAT[f.format] || 'truetype'}'); font-weight: 100 900; font-display: swap; }`;
  }).join('\n');
  const el = styleEl('data-custom-fonts');
  if (el.textContent !== rules) el.textContent = rules;
}

/** Google Fonts stylesheet for non-bundled built-ins assigned to a role. */
export function applyGoogleFonts(settings) {
  if (typeof document === 'undefined') return;
  const fams = googleFamiliesFor(settings);
  let link = document.querySelector('link[data-font-dynamic]');
  if (!fams.length) { if (link) link.remove(); return; }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-font-dynamic', 'true');
    document.head.appendChild(link);
  }
  const href = `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f}`).join('&')}&display=swap`;
  if (link.href !== href) link.href = href;
}
