/**
 * Turn announcement items into the shapes the kiosk's existing components
 * consume (rotation slides, Banner rows, PinnedNotes rows, Takeover data).
 * Migrated items (look.layout 'classic', look.fit 'fixed') map onto exactly
 * the legacy props their old renderer got, so they look identical.
 */

const TEXT_SLIDE_LABEL = 'הודעה';

/** Category chip text, matching what each legacy source used to show. */
function chipLabel(item) {
  if (item.slide?.label) return item.slide.label;
  const lt = item.legacy?.type;
  const c = item.content || {};
  if (lt === 'custom') return '';
  if (lt === 'board') return c.target || 'Message';
  if (lt === 'slide' && item.legacy?.file === 'pinned.json') return c.headlineEn || c.headlineHe || 'Pinned';
  return TEXT_SLIDE_LABEL;
}

/** Rotation slide for an announcement (rowId keeps a slides.json ref's id). */
export function toRotationSlide(item, rowId) {
  return {
    id: rowId || `ann-${item.id}`,
    type: 'ANNOUNCEMENT',
    enabled: true,
    duration: item.slide?.duration || 12,
    fullscreen: !!item.look?.fullscreen,
    label: chipLabel(item),
    _ann: item,
  };
}

/** Legacy custom-slide props (TextSlide / StyledSlide). */
export function toLegacyTextSlide(item) {
  const c = item.content || {};
  return {
    id: item.id,
    template: item.look?.template || 'announcement',
    style: item.look?.style || undefined,
    titleHe: c.headlineHe, titleEn: c.headlineEn,
    bodyHe: c.bodyHe, bodyEn: c.bodyEn,
    attribution: c.attribution, subtitle: c.subtitle,
    fit: item.look?.fit === 'auto',
  };
}

/** Legacy board message props (BoardDisplay). */
export function toLegacyBoard(item) {
  const c = item.content || {};
  return { id: item.id, textHe: c.headlineHe, textEn: c.headlineEn, target: c.target, subtitle: c.subtitle };
}

/** Banner.jsx row. */
export function toBannerRow(item) {
  const c = item.content || {};
  return {
    id: item.id,
    textHe: c.headlineHe || c.bodyHe || '',
    textEn: c.headlineEn || c.bodyEn || '',
    bannerSize: item.banner?.size || undefined,
    bannerMode: item.banner?.mode || undefined,
    bannerSpeed: item.banner?.speed || undefined,
    bannerRepeat: item.banner?.repeat || undefined,
  };
}

/** PinnedNotes.jsx row. */
export function toNoteRow(item) {
  const c = item.content || {};
  return {
    id: item.id,
    textHe: c.headlineHe || c.bodyHe || '',
    textEn: c.headlineEn || c.bodyEn || '',
    icon: item.note?.icon || null,
    fit: item.look?.fit === 'auto',
  };
}

/** Takeover.jsx data for a classic-layout takeover. */
export function toLegacyTakeover(item) {
  const c = item.content || {};
  return {
    id: item.id,
    type: 'takeover',
    textHe: c.headlineHe, textEn: c.headlineEn,
    style: item.look?.style || 'classic',
    subtitle: c.subtitle,
    // Takeover styles have no body slot; a second line shows as the target line.
    target: c.target || c.bodyEn || c.bodyHe,
    fit: item.look?.fit === 'auto',
    fitMax: item.look?.maxFontPx || undefined,
  };
}

/**
 * Build the rotation: slides.json rows in order, with ANNOUNCEMENT refs
 * resolved to their (active, non-hold) announcement and dropped otherwise,
 * then active slide announcements that have no ref row, oldest first.
 */
export function buildRotation(rows, activeSlides) {
  const byId = new Map(activeSlides.map((i) => [i.id, i]));
  const placed = new Set();
  const out = [];
  for (const row of rows || []) {
    if (row?.type === 'ANNOUNCEMENT') {
      const item = byId.get(row.announcementId);
      if (item && row.enabled !== false) {
        out.push(toRotationSlide(item, row.id));
        placed.add(item.id);
      } else if (item) {
        placed.add(item.id);
      }
      continue;
    }
    out.push(row);
  }
  for (const item of activeSlides) if (!placed.has(item.id)) out.push(toRotationSlide(item));
  return out;
}
