import React from 'react';
import { Panel, PageTitle, Empty, F, he } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { isHebrew } from '../../design/time.js';

/**
 * Daily study (Chitas, Rambam, Sefer HaMitzvos) as a ruled board (R2 system):
 * one row per study — the label (Hebrew over English) on the right edge's
 * mirror, the day's portion in display type, the English line dim beneath.
 * settings.limudimLang 'both' | 'hebrew' | 'english'; settings.limudimItems
 * switches rows off (all on by default except Sefer HaMitzvos' own data).
 */

const stripRashi = (t) => String(t || '').replace(/\s+with Rashi$/i, '').replace(/\s+עם\s+פירוש\s+רש[״"]י\s*$/u, '').replace(/\s+עם\s+רש[״"]י\s*$/u, '').trim();
const oneLine = (t) => stripRashi(t).replace(/\s*\n+\s*/g, ' · ');
const stripMishneh = (t, hb) => String(t || '').replace(hb ? /^משנה\s+תורה[,،]?\s*/u : /^Mishneh Torah[,]?\s*/i, '').trim();

function Row({ i, labelHe, labelEn, valueHe, valueEn, extra, lang, many }) {
  const showHe = lang !== 'english' && valueHe;
  const showEn = lang !== 'hebrew' && valueEn;
  const hv = showHe ? valueHe : '';
  const ev = showEn || (!hv && valueEn) ? valueEn : '';
  if (!hv && !ev) return null;
  return (
    <div data-s="" style={{ '--i': i + 1, display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr)', columnGap: 36, alignItems: 'center', borderTop: '2px solid var(--line)', minHeight: 0 }}>
      <div style={{ minWidth: 0 }}>
        {lang !== 'english' && <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(many ? 36 : 40), fontWeight: 600, lineHeight: 1.1, textAlign: 'left', color: 'var(--accentText)' }}>{labelHe}</div>}
        {lang !== 'hebrew' && <div style={{ fontFamily: F.en, fontSize: 22, color: 'var(--inkDim)', fontWeight: 500, marginTop: 2 }}>{labelEn}</div>}
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', paddingTop: 6, paddingBottom: 6 }}>
        {hv && (
          <Fit wrap max={many ? 38 : 46} dir="rtl" style={{ width: '100%', flex: ev ? '1 1 62%' : '1 1 100%', minHeight: 0, textAlign: 'right', fontFamily: F.he, fontWeight: 500, lineHeight: 1.2, fontSize: undefined }}>{hv}</Fit>
        )}
        {ev && (
          <Fit wrap max={many ? 24 : 28} dir="ltr" style={{ width: '100%', flex: hv ? '1 1 38%' : '1 1 100%', minHeight: 0, textAlign: hv ? 'right' : 'left', fontFamily: F.en, color: hv ? 'var(--inkDim)' : 'var(--ink)', fontWeight: 500, lineHeight: 1.25 }}>{ev}</Fit>
        )}
        {extra && <div style={{ fontFamily: isHebrew(extra) ? F.he : F.en, fontSize: 21, color: 'var(--inkDim)', marginTop: 2, textAlign: 'right', direction: isHebrew(extra) ? 'rtl' : 'ltr' }}>{extra}</div>}
      </div>
    </div>
  );
}

export default function LimudimSlide({ cache, settings }) {
  const l = cache?.limudim || {};
  const items = settings?.limudimItems || {};
  const lang = settings?.limudimLang || 'both';
  const on = (k) => items[k] !== false;
  const sh = cache?.seferHamitzvot;
  const tanyaExcerpt = [l.tanyaFirstWords, l.tanyaLastWords].filter(Boolean).join(' … ');
  const rows = [
    on('chumash') && { labelHe: 'חומש', labelEn: 'Chumash', valueHe: oneLine(l.chumashHe), valueEn: oneLine(l.chumash) },
    on('tehillim') && { labelHe: 'תהילים', labelEn: 'Tehillim', valueHe: oneLine(l.tehillimHe), valueEn: oneLine(l.tehillim) },
    on('tanya') && { labelHe: 'תניא', labelEn: 'Tanya', valueHe: oneLine(l.tanyaHe), valueEn: oneLine(l.tanya), extra: tanyaExcerpt },
    on('rambam1') && cache?.rambam1 && { labelHe: 'רמב״ם', labelEn: 'Rambam · 1 chapter', valueHe: stripMishneh(cache.rambam1.displayHe, true), valueEn: stripMishneh(cache.rambam1.displayEn, false) },
    on('rambam3') && cache?.rambam3 && { labelHe: 'רמב״ם ג׳ פרקים', labelEn: 'Rambam · 3 chapters', valueHe: stripMishneh(cache.rambam3.displayHe, true), valueEn: stripMishneh(cache.rambam3.displayEn, false) },
    on('sefer') && (sh?.displayHe || sh?.displayEn) && { labelHe: 'ספר המצוות', labelEn: 'Sefer HaMitzvos', valueHe: oneLine(sh.displayHe), valueEn: oneLine(sh.displayEn) },
  ].filter((r) => r && (r.valueHe || r.valueEn));

  return (
    <Panel pad="30px 48px 34px">
      <PageTitle en="Today’s learning" heText="לימוד היום" />
      {rows.length === 0 ? <Empty en="Learning data will appear once it is fetched" /> : (
        <div style={{ flex: 1, display: 'grid', gridAutoRows: 'minmax(0, 1fr)', minHeight: 0, marginTop: 6 }}>
          {rows.map((r, i) => <Row key={r.labelEn} i={i} {...r} lang={lang} many={rows.length > 4} />)}
        </div>
      )}
    </Panel>
  );
}
