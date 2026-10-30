/**
 * Plain-English "what is on the screen now" for the Post sheet. Pure: takes what `selectActive()` returned plus the freeze
 * state and the slide list the admin already holds (no new endpoint, nothing the viewer could not already see).
 * It is a summary of POSTS and the freeze, not a copy of the kiosk's rotation filters (those stay in src/screen/App.jsx).
 */

/** @returns {{ frozen: boolean, takeover: boolean, banners: number, notes: number, slides: number, rotating: number, summary: string }} */
export function whatIsOnNow({ active = {}, freeze = null, slides = [] } = {}) {
  const frozen = !!freeze?.active;
  const takeover = !!active.takeover;
  const banners = (active.banners || []).length;
  const notes = (active.notes || []).length;
  const posted = (active.slides || []).length + (active.holds || []).length;
  // Message rows are counted as posts above (the Slides page gives every post a row, drafts too), not as slides.
  const rotating = (slides || []).filter((s) => s && s.enabled !== false && s.type !== 'ANNOUNCEMENT').length;
  const bits = [];
  if (frozen) bits.push('frozen');
  if (takeover) bits.push('1 takeover');
  if (banners) bits.push(`${banners} banner${banners === 1 ? '' : 's'}`);
  if (notes) bits.push(`${notes} side note${notes === 1 ? '' : 's'}`);
  if (posted) bits.push(`${posted} posted slide${posted === 1 ? '' : 's'}`);
  return { frozen, takeover, banners, notes, slides: posted, rotating, summary: bits.length ? bits.join(', ') : 'only the usual slides' };
}

/** One sentence: what posting this draft would change. */
export function postEffectLine({ display = 'slide', info, draftEndsAt = null, tz, now = new Date(), whenLabel } = {}) {
  const end = draftEndsAt && whenLabel ? whenLabel(Date.parse(draftEndsAt), { tz, now }) : null;
  const tail = end ? ` until ${end}` : '';
  if (display === 'takeover') {
    const n = info?.rotating || 0;
    return `If you post this: it covers the whole screen${tail} and pauses ${n ? `all ${n} slides` : 'the slides'}. Banners keep going.${info?.takeover ? ' It would replace the takeover that is on now.' : ''}`;
  }
  const frozen = info?.frozen ? ' The screen is frozen, so it shows when the freeze ends.' : '';
  if (display === 'banner') return `If you post this: a banner along the bottom${tail}. The slides keep playing.${frozen}`;
  if (display === 'note') return `If you post this: a side note${tail}. The slides keep playing.${frozen}`;
  return `If you post this: it joins the slide rotation${tail}.${info?.takeover ? ' A takeover is on now, so it shows after it.' : ''}${frozen}`;
}
