/**
 * Announcement STYLES (round 3b: 26 takeover styles) - THE SEAM for style
 * layout metadata. Colours/graphics/motion of each style live in
 * src/screen/takeover/ (css.js palettes, art.js SVG, one entry per style id);
 * this file says how each style lays out its content on the canvas:
 *
 *   layout  best layout (informational)      box   content insets [L,R,T,B] (landscape 1600x900)
 *   pbox    portrait insets (styles without a side graphic)
 *   bb      bounding box of the SIDE graphic in landscape design space; vertically
 *           centred on 16:10, moved to a top band in portrait
 *   align   'start' | 'center'               ent   text-entrance personality
 *   chrome  clock / bh offsets               clock / bh   corner of the clock / bh
 *
 * Panel-style roles for other pages (CountdownOverlay's <Panel look="urgent">)
 * still use styleVars() below: a tiny amber tint kept for that one caller.
 */
import { STYLE_IDS as IDS, normalizeStyleId, renderStyleId } from '../../shared/takeoverStyles.js';

export const STYLES = {
  classic:     { layout: 'event',    box: [130, 130, 130, 150], pbox: [90, 90, 150, 150],  align: 'center', ent: 'rise' },
  grand:       { layout: 'event',    box: [150, 150, 124, 112], pbox: [120, 120, 150, 140], align: 'center', ent: 'calm', chrome: { top: 72, side: 100 } },
  emergency:   { layout: 'bigwords', box: [500, 96, 100, 90],   bb: [50, 250, 450, 650], pbox: null, align: 'start',  ent: 'snap', chrome: { top: 50 } },
  sleek:       { layout: 'quick',    box: [96, 96, 110, 130],   pbox: [80, 80, 140, 150],  align: 'start',  ent: 'rise' },
  celebration: { layout: 'bigwords', box: [260, 260, 200, 110], pbox: [120, 120, 220, 150], align: 'center', ent: 'lively' },
  urgent:      { layout: 'event',    box: [150, 110, 150, 100], pbox: [150, 70, 150, 110], align: 'start',  ent: 'slide', clock: 'br', chrome: { top: 58, side: 76, bottom: 58 } },
  torah:       { layout: 'quote',    box: [220, 220, 176, 164], pbox: [190, 190, 190, 190], align: 'center', ent: 'calm', chrome: { top: 70, side: 196 } },
  trip:        { layout: 'event',    box: [104, 104, 112, 220], pbox: [70, 70, 220, 270],  align: 'start',  ent: 'rise' },
  phone:       { layout: 'quick',    box: [560, 96, 110, 96],   bb: [96, 266, 484, 634], align: 'start',  ent: 'rise' },
  memorial:    { layout: 'bigwords', box: [520, 110, 130, 120], bb: [190, 300, 390, 640], align: 'center', ent: 'calm' },
  hype:        { layout: 'quick',    box: [200, 140, 110, 100], pbox: [90, 90, 140, 130],  align: 'center', ent: 'lively', clock: 'bl', chrome: { side: 64, bottom: 44 } },
  shabbos:     { layout: 'quick',    box: [540, 96, 110, 96],   bb: [130, 224, 430, 810], align: 'start',  ent: 'calm' },
  yomtov:      { layout: 'event',    box: [130, 130, 200, 170], pbox: [90, 90, 210, 190],  align: 'center', ent: 'rise', chrome: { top: 128 } },
  siyum:       { layout: 'event',    box: [560, 96, 112, 96],   bb: [60, 96, 500, 812],  align: 'start',  ent: 'rise' },
  farbrengen:  { layout: 'event',    box: [104, 400, 112, 210], pbox: [70, 70, 230, 290],  align: 'start',  ent: 'rise', bh: 'tl', clock: 'tr' },
  mivtzoim:    { layout: 'list',     box: [104, 430, 112, 96],  pbox: [70, 70, 150, 330],  align: 'start',  ent: 'slide' },
  welcome:     { layout: 'bigwords', box: [456, 456, 262, 96],  pbox: [150, 150, 560, 150], align: 'center', ent: 'rise' },
  simcha:      { layout: 'bigwords', box: [180, 180, 250, 110], pbox: [90, 90, 250, 150],  align: 'center', ent: 'lively', chrome: { top: 40 }, bh: 'none', clock: 'br' },
  schedule:    { layout: 'quick',    box: [560, 96, 110, 96],   bb: [74, 254, 486, 646], align: 'start',  ent: 'rise' },
  quiet:       { layout: 'bigwords', box: [220, 220, 200, 180], pbox: [90, 90, 220, 220],  align: 'center', ent: 'calm' },
  chanukah:    { layout: 'event',    box: [540, 96, 112, 96],   bb: [130, 240, 430, 795], align: 'start',  ent: 'calm' },
  purim:       { layout: 'event',    box: [560, 150, 120, 110], bb: [100, 300, 480, 620], align: 'start',  ent: 'lively' },
  pesach:      { layout: 'bigwords', box: [200, 200, 110, 260], pbox: [90, 90, 150, 300], align: 'center', ent: 'calm', chrome: { top: 70 } },
  roshchodesh: { layout: 'bigwords', box: [220, 220, 130, 220], pbox: [90, 90, 150, 240], align: 'center', ent: 'calm' },
  lagbaomer:   { layout: 'event',    box: [600, 96, 112, 96],   bb: [140, 380, 440, 710], align: 'start',  ent: 'lively' },
  chassidic:   { layout: 'bigwords', box: [200, 200, 290, 110], pbox: [90, 90, 330, 140],  align: 'center', ent: 'calm' },
};

export const STYLE_IDS = IDS;
export { normalizeStyleId, renderStyleId };

/** Registry entry for a style id (unknown / null -> classic). */
export function styleOf(id) {
  return STYLES[renderStyleId(id)] || STYLES.classic;
}

/** Panel role overrides for non-announcement pages (CountdownOverlay's urgent tint). */
export function styleVars(style, light = false) {
  if (style !== 'urgent') return {};
  const accent = light ? '#B4600A' : '#F2A33A';
  return {
    '--accent': accent, '--onAccent': light ? '#FFFFFF' : '#1E1405',
    '--fill': accent, '--fillInk': light ? '#FFFFFF' : '#1E1405', '--accentText': accent,
    '--panel': `color-mix(in srgb, ${accent} 7%, var(--raised))`,
    '--panelRing': `inset 0 0 0 6px ${accent}`,
  };
}
