/**
 * Words and tones for the Health "Offline data" card (src/admin/components/ops/DataPackCard.jsx), kept pure so the
 * rules (warn 60 days before the pack ends, what Local mode means without a pack) are unit-tested.
 */
import { PACK_SECTIONS } from './dataPack.js';

export const SECTION_LABEL = {
  hayomYom: 'Hayom Yom', chumash: 'Chumash', tanya: 'Tanya', rambam1: 'Rambam (1 chapter)', rambam3: 'Rambam (3 chapters)',
  seferHamitzvot: 'Sefer HaMitzvos', tehillim: 'Tehillim (Psalm 119 days)', dailyQuote: 'Daily Quote', tidbits: 'Parsha Tidbits',
};

export const ATTRIBUTION = 'Hayom Yom, Chumash, Tanya, Rambam, Sefer HaMitzvos, the Daily Quote and the Parsha Tidbits are courtesy of Chabad.org, used with credit. Zmanim, the Hebrew date, the parsha and the Omer are calculated on this box in Local mode.';

const longDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

/** { tone: ok|warn|bad|info, headline, detail } for the pack itself. */
export function packSummary(pack) {
  if (!pack?.present) return { tone: 'info', headline: 'No data pack installed', detail: 'Upload a pack file, or build one on this Pi, before you switch to Local.' };
  const until = longDate(pack.to);
  if (pack.level === 'expired') return { tone: 'bad', headline: `Data pack ended on ${until}`, detail: 'Today is past the end of the pack. Refresh it now (Build / refresh on this Pi) or upload a newer one.' };
  if (pack.level === 'soon') return { tone: 'warn', headline: `Covers until ${until}`, detail: `Only ${pack.daysLeft} day${pack.daysLeft === 1 ? '' : 's'} left. Refresh it soon: it takes about an hour and does not disturb the screen.` };
  return { tone: 'ok', headline: `Covers until ${until}`, detail: `${pack.daysLeft} days of cover.` };
}

/** What the person is about to switch to, and whether to stop and ask first. */
export function switchAdvice(target, pack) {
  if (target !== 'local') return { confirm: false, message: '' };
  if (!pack?.present) return { confirm: true, message: 'No data pack is installed yet. In Local mode Hayom Yom, Chumash, Tanya, Rambam, the Daily Quote and the Parsha Tidbits will show "Not in the data pack yet" until you install or build one. The Hebrew date, parsha, Omer, zmanim and Tehillim are calculated and work straight away.' };
  if (pack.level === 'expired') return { confirm: true, message: 'The installed data pack has ended, so those pages will show "Not in the data pack yet". Refresh the pack first, or switch anyway.' };
  return { confirm: false, message: '' };
}

/** Plain-English line for the build job. */
export function jobLine(job) {
  if (!job || job.state === 'idle') return '';
  if (job.state === 'running') {
    const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
    if (job.phase === 'installing') return 'Putting the pack in place...';
    return job.cancelling ? 'Stopping after this request...' : `Collecting from Chabad.org: ${job.done} of ${job.total} (${pct}%)${job.failed ? `, ${job.failed} to retry` : ''}`;
  }
  return job.message || '';
}
export const jobPercent = (job) => (job?.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0);

/** Rows for the per-section table: label, source, licence note, what is missing. */
export function sectionRows(pack) {
  const cov = pack?.coverage?.sections || {};
  return PACK_SECTIONS.filter((s) => pack?.sections?.[s]).map((s) => {
    const c = cov[s] || (s === 'hayomYom' ? pack?.coverage?.hayomYom : null);
    const missing = s === 'hayomYom' ? (c?.missing ?? 0) : (c?.missing ?? 0);
    const unit = c?.unit === 'weeks' ? 'week' : 'day';
    const ranges = (c?.missingRanges || []).slice(0, 3).map(([a, b]) => (a === b ? a : `${a} to ${b}`));
    return {
      id: s, label: SECTION_LABEL[s], source: pack.sections[s].source || '', licence: pack.sections[s].licence || '',
      missing, missingText: missing ? `${missing} ${unit}${missing === 1 ? '' : 's'} missing${ranges.length ? ` (${ranges.join(', ')}${(c.missingRanges || []).length > 3 ? ', ...' : ''})` : ''}${c?.pooled ? `; ${c.pooled} use a spare quote` : ''}` : 'complete',
    };
  });
}
