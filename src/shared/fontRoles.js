/**
 * Font roles for the screen (kiosk + admin picker).
 *
 * No component hard-codes a font: they paint with CSS custom properties that
 * DesignRoot sets from `settings.fontRoles` (any built-in font or ANY font
 * uploaded to data/fonts.json, present or future). Unset roles use the
 * defaults approved with the round-2 design (Rubik + Manrope, Frank Ruhl
 * Libre + EB Garamond for Torah text).
 *
 *   role            CSS var     used for
 *   hebrewDisplay   --f-he-d    big Hebrew: titles, names, headlines
 *   hebrewBody      --f-he      Hebrew running text, rail dates, notes
 *   englishDisplay  --f-en-d    big English: titles, headlines
 *   englishBody     --f-en      English text, labels
 *   numerals        --f-num     clock and every time (tabular, lining figures)
 *   torahHebrew     --f-th      Torah text (Hayom Yom, quotes, letters) — Hebrew
 *   torahEnglish    --f-te      Torah text — English translation
 */

export const FONT_ROLES = [
  { key: 'hebrewDisplay', label: 'Hebrew display', hint: 'Titles, names, big Hebrew', script: 'he', cssVar: '--f-he-d' },
  { key: 'hebrewBody', label: 'Hebrew body', hint: 'Dates, notes, Hebrew lines', script: 'he', cssVar: '--f-he' },
  { key: 'englishDisplay', label: 'English display', hint: 'Titles and headlines', script: 'en', cssVar: '--f-en-d' },
  { key: 'englishBody', label: 'English body', hint: 'English text and labels', script: 'en', cssVar: '--f-en' },
  { key: 'numerals', label: 'Numerals', hint: 'Clock and all times (tabular figures)', script: 'num', cssVar: '--f-num' },
  { key: 'torahHebrew', label: 'Torah text (Hebrew)', hint: 'Hayom Yom, quotes, letters', script: 'he', cssVar: '--f-th' },
  { key: 'torahEnglish', label: 'Torah text (English)', hint: 'Translations and English Torah text', script: 'en', cssVar: '--f-te' },
];

export const DEFAULT_FONT_ROLES = {
  hebrewDisplay: 'Rubik',
  hebrewBody: 'Rubik',
  englishDisplay: 'Manrope',
  englishBody: 'Manrope',
  numerals: 'Manrope',
  torahHebrew: 'Frank Ruhl Libre',
  torahEnglish: 'EB Garamond',
};

/**
 * Built-in fonts. `bundled` ones ship with the app (npm @fontsource-variable,
 * imported by src/screen/design/fonts.css.js) so the Pi never depends on
 * Google Fonts for its defaults; the others load from Google Fonts like
 * before. `family` is the CSS family name actually registered.
 */
export const BUILTIN_FONTS = [
  { name: 'Rubik', family: 'Rubik Variable', bundled: true, scripts: ['he', 'en', 'num'] },
  { name: 'Manrope', family: 'Manrope Variable', bundled: true, scripts: ['en', 'num'] },
  { name: 'Frank Ruhl Libre', family: 'Frank Ruhl Libre Variable', bundled: true, scripts: ['he', 'en', 'num'] },
  { name: 'EB Garamond', family: 'EB Garamond Variable', bundled: true, scripts: ['en', 'num'] },
  { name: 'Suez One', family: 'Suez One', bundled: true, scripts: ['he', 'en'] },
  { name: 'Playfair Display', family: 'Playfair Display Variable', bundled: true, scripts: ['en', 'num'] },
  { name: 'Fraunces', family: 'Fraunces Variable', bundled: true, scripts: ['en', 'num'] },
  { name: 'Noto Serif Hebrew', family: 'Noto Serif Hebrew', google: 'Noto+Serif+Hebrew:wght@400;500;600;700', scripts: ['he'] },
  { name: 'David Libre', family: 'David Libre', google: 'David+Libre:wght@400;500;700', scripts: ['he', 'en'] },
  { name: 'Heebo', family: 'Heebo', google: 'Heebo:wght@300..800', scripts: ['he', 'en', 'num'] },
  { name: 'Assistant', family: 'Assistant', google: 'Assistant:wght@300..800', scripts: ['he', 'en', 'num'] },
  { name: 'Cormorant Garamond', family: 'Cormorant Garamond', google: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400', scripts: ['en'] },
  { name: 'Lora', family: 'Lora', google: 'Lora:wght@400..700', scripts: ['en', 'num'] },
];

const BUILTIN_BY_NAME = Object.fromEntries(BUILTIN_FONTS.map((f) => [f.name, f]));

const FALLBACK = {
  he: "'Rubik Variable', 'Rubik', 'Noto Sans Hebrew', sans-serif",
  en: "'Manrope Variable', 'Manrope', sans-serif",
  num: "'Manrope Variable', 'Manrope', sans-serif",
  torahHe: "'Frank Ruhl Libre Variable', 'Frank Ruhl Libre', serif",
  torahEn: "'EB Garamond Variable', 'EB Garamond', serif",
};

function fallbackFor(roleKey) {
  if (roleKey === 'torahHebrew') return FALLBACK.torahHe;
  if (roleKey === 'torahEnglish') return FALLBACK.torahEn;
  const role = FONT_ROLES.find((r) => r.key === roleKey);
  return FALLBACK[role?.script || 'en'];
}

const quote = (name) => `'${String(name).replace(/['\\]/g, '')}'`;

/** CSS font-family stack for a font name assigned to a role. */
export function fontStack(name, roleKey) {
  const fb = fallbackFor(roleKey);
  if (!name) return fb;
  const b = BUILTIN_BY_NAME[name];
  const fam = b ? `${quote(b.family)}${b.family !== b.name ? `, ${quote(b.name)}` : ''}` : quote(name);
  return `${fam}, ${fb}`;
}

/** The effective role → font-name map (settings.fontRoles over defaults). */
export function resolveFontRoles(settings) {
  const r = settings?.fontRoles && typeof settings.fontRoles === 'object' ? settings.fontRoles : {};
  const out = {};
  for (const role of FONT_ROLES) out[role.key] = (typeof r[role.key] === 'string' && r[role.key].trim()) || DEFAULT_FONT_ROLES[role.key];
  return out;
}

/** CSS custom properties for the resolved roles (+ the global Hebrew scale). */
export function fontRoleVars(settings) {
  const roles = resolveFontRoles(settings);
  const vars = {};
  for (const role of FONT_ROLES) vars[role.cssVar] = fontStack(roles[role.key], role.key);
  vars['--he-scale'] = String(hebrewScale(settings));
  return vars;
}

/** Global Hebrew size multiplier (settings.hebrewFontScale), clamped 0.8–1.4. */
export function hebrewScale(settings) {
  const s = Number(settings?.hebrewFontScale);
  return Number.isFinite(s) && s > 0 ? Math.min(1.4, Math.max(0.8, s)) : 1;
}

/** Google Fonts families needed by the chosen roles (bundled ones excluded). */
export function googleFamiliesFor(settings) {
  const names = new Set(Object.values(resolveFontRoles(settings)));
  return [...names].map((n) => BUILTIN_BY_NAME[n]?.google).filter(Boolean);
}

/**
 * The fonts the owner chose before font roles existed (settings.fonts), as a
 * role map — offered in the admin as "Use my previous fonts". Null when they
 * were the old built-in defaults.
 */
export function legacyFontRoles(settings) {
  const f = settings?.fonts;
  if (!f || typeof f !== 'object') return null;
  const heBody = f.hebrewBody || f.hebrew;
  const heHead = f.hebrewHeading || f.hebrew;
  const en = f.english;
  if (!heBody && !heHead && !en) return null;
  const isOldDefault = (heBody || 'Frank Ruhl Libre') === 'Frank Ruhl Libre'
    && (heHead || 'Frank Ruhl Libre') === 'Frank Ruhl Libre' && (en || 'EB Garamond') === 'EB Garamond';
  if (isOldDefault) return null;
  return {
    hebrewDisplay: heHead || heBody,
    hebrewBody: heBody || heHead,
    englishDisplay: en || DEFAULT_FONT_ROLES.englishDisplay,
    englishBody: en || DEFAULT_FONT_ROLES.englishBody,
    numerals: en || DEFAULT_FONT_ROLES.numerals,
    torahHebrew: heBody || heHead || DEFAULT_FONT_ROLES.torahHebrew,
    torahEnglish: en || DEFAULT_FONT_ROLES.torahEnglish,
  };
}

/**
 * Font STYLE presets for takeovers + announcements (settings.announceFonts).
 * Each maps the takeover stage's role vars; every font here is bundled from
 * npm (src/screen/design/fonts.js), never Google Fonts, so a Wi-Fi blip can't
 * drop the TV to system fonts. 'screen' = follow the global font roles (the
 * owner's uploaded fonts). Numerals are always lining + tabular (css.js .num).
 *
 *   editorial (default)  Suez One + Playfair Display   (owner's pick "D")
 *   modern               Rubik + Manrope               ("A", the round-2 look)
 *   classic              Frank Ruhl Libre + Fraunces   ("B")
 */
export const ANNOUNCE_FONT_PRESETS = {
  editorial: {
    label: 'Editorial', hint: 'Suez One + Playfair Display',
    roles: { hebrewDisplay: 'Suez One', hebrewBody: 'Frank Ruhl Libre', englishDisplay: 'Playfair Display', englishBody: 'Playfair Display', numerals: 'Playfair Display', torahHebrew: 'Frank Ruhl Libre', torahEnglish: 'Playfair Display' },
    // Suez One has one weight (display only); smaller Hebrew lines are Frank Ruhl Libre at >= 500
  },
  modern: {
    label: 'Modern', hint: 'Rubik + Manrope',
    roles: { hebrewDisplay: 'Rubik', hebrewBody: 'Rubik', englishDisplay: 'Manrope', englishBody: 'Manrope', numerals: 'Manrope', torahHebrew: 'Frank Ruhl Libre', torahEnglish: 'EB Garamond' },
  },
  classic: {
    label: 'Classic', hint: 'Frank Ruhl Libre + Fraunces',
    roles: { hebrewDisplay: 'Frank Ruhl Libre', hebrewBody: 'Frank Ruhl Libre', englishDisplay: 'Fraunces', englishBody: 'Fraunces', numerals: 'Fraunces', torahHebrew: 'Frank Ruhl Libre', torahEnglish: 'Fraunces' },
  },
  screen: { label: 'Same as screen', hint: 'Follows the font roles below (your uploaded fonts)', roles: null },
};
export const ANNOUNCE_FONT_IDS = Object.keys(ANNOUNCE_FONT_PRESETS);
export const DEFAULT_ANNOUNCE_FONTS = 'editorial';

/** The effective preset id (unknown / unset -> editorial). */
export function announceFontsId(settingsOrId) {
  const v = typeof settingsOrId === 'string' ? settingsOrId : settingsOrId?.announceFonts;
  return ANNOUNCE_FONT_IDS.includes(v) ? v : DEFAULT_ANNOUNCE_FONTS;
}

/** CSS custom properties a takeover stage sets for a preset ({} for 'screen'). */
export function announceFontVars(id) {
  const p = ANNOUNCE_FONT_PRESETS[announceFontsId(id)];
  if (!p.roles) return {};
  const vars = {};
  for (const role of FONT_ROLES) vars[role.cssVar] = fontStack(p.roles[role.key], role.key);
  return vars;
}
