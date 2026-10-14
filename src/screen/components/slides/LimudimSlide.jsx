import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Panel, PageTitle, Empty, F } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { parseRambam, parseSeferHamitzvos, rambamTrack } from '../../../shared/limudim.js';

/**
 * Daily study page (R2 system), two zoom levels on one subject:
 *
 *  1. Chitas board: ruled rows (Chumash, Tehillim, Tanya). Label on the
 *     left (Hebrew over English), the day's portion flush right, English dim
 *     beneath. Tanya adds the day's opening/closing words as a quiet Torah-
 *     text excerpt with a hairline bar (the owner likes that line).
 *  2. Rambam cards: one per track (3 perakim, 1 perek) + Sefer HaMitzvos.
 *     Hierarchy (owner, docs/BACKLOG.md): SEFER biggest, then HALACHOS, then
 *     the perakim ("פרק כ״ב" / "פרקים א׳–ג׳", "Perek 22" / "Perakim 1–3"),
 *     worded the same for both tracks (src/shared/limudim.js). All cards
 *     share one type tier (TIERS), stepped down until every card fits, so
 *     long halachos and two-sefer days stay readable without clipping.
 *
 * settings.limudimLang 'both' | 'hebrew' | 'english'; settings.limudimItems
 * switches items off (all on by default).
 */

const stripRashi = (t) => String(t || '').replace(/\s+with Rashi$/i, '').replace(/\s+עם\s+פירוש\s+רש[״"]י\s*$/u, '').replace(/\s+עם\s+רש[״"]י\s*$/u, '').trim();
const oneLine = (t) => stripRashi(t).replace(/\s*\n+\s*/g, ' · ');

function Label({ he: labelHe, en, lang, size = 38 }) {
  return (
    <div style={{ minWidth: 0 }}>
      {lang !== 'english' && <div className="tt-he" style={{ fontFamily: F.heD, fontSize: `calc(${size}px * var(--he-scale, 1))`, fontWeight: 600, lineHeight: 1.1, textAlign: 'left', color: 'var(--accentText)' }}>{labelHe}</div>}
      {lang !== 'hebrew' && <div style={{ fontFamily: F.en, fontSize: lang === 'english' ? 30 : 21, color: lang === 'english' ? 'var(--accentText)' : 'var(--inkDim)', fontWeight: lang === 'english' ? 600 : 500, marginTop: 2 }}>{en}</div>}
    </div>
  );
}

function ChitasRow({ i, labelHe, labelEn, valueHe, valueEn, excerpt, lang, heScale }) {
  const hv = lang !== 'english' ? valueHe : '';
  const ev = lang !== 'hebrew' || !hv ? valueEn : '';
  const ex = lang !== 'english' ? excerpt : null;
  if (!hv && !ev) return null;
  return (
    <div data-s="" style={{ '--i': i + 1, display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', columnGap: 32, alignItems: 'center', borderTop: '2px solid var(--line)', minHeight: 0 }}>
      <Label he={labelHe} en={labelEn} lang={lang} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '9px 0 10px' }}>
        {hv && <Fit max={Math.round(40 * heScale)} min={22} dir="rtl" style={{ width: '100%', textAlign: 'right', fontFamily: F.he, fontWeight: 500, lineHeight: 1.18, flex: 'none' }}>{hv}</Fit>}
        {ev && <Fit max={hv ? 24 : 32} min={16} dir="ltr" style={{ width: '100%', textAlign: hv ? 'right' : 'left', fontFamily: F.en, color: hv ? 'var(--inkDim)' : 'var(--ink)', fontWeight: 500, lineHeight: 1.25, flex: 'none' }}>{ev}</Fit>}
        {ex && (
          <div dir="rtl" style={{ display: 'flex', alignItems: 'stretch', gap: 14, marginTop: 8, flex: 'none' }}>
            <span aria-hidden style={{ width: 3, borderRadius: 2, background: 'var(--accentText)', flex: 'none' }} />
            <div dir="rtl" style={{ flex: 1, minWidth: 0, textAlign: 'right', fontFamily: F.th, fontSize: 'calc(25px * var(--he-scale, 1))', fontWeight: 400, lineHeight: 1.4, color: 'var(--ink)', textWrap: 'balance', padding: '1px 0' }}>
              {ex.first}<span style={{ color: 'var(--inkDim)', padding: '0 .45em' }}>…</span>{ex.last}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Rambam / Sefer HaMitzvos cards ─────────────────────────────────────── */

/**
 * Type tiers for the cards (canvas px; Hebrew sizes also follow --he-scale).
 * All cards on the page share one tier — the first one at which every card
 * fits — so sefer, halachos and perakim read at the same size side by side.
 * Stepped instead of a continuous fit so English never drops under the 20 px
 * floor (R2 §3) and Hebrew perakim never get smaller than their English.
 */
const TIERS = [
  { sefer: 54, seferEn: 21, hilchos: 36, perHe: 30, perEn: 22, gap: 14, groupGap: 18, },
  { sefer: 44, seferEn: 20, hilchos: 31, perHe: 27, perEn: 20, gap: 8, groupGap: 14, },
  { sefer: 36, seferEn: 20, hilchos: 27, perHe: 24, perEn: 20, gap: 4, groupGap: 10, },
  // last resort (two sefarim in one day): perakim ride on the halachos line
  { sefer: 34, seferEn: 20, hilchos: 26, perHe: 24, perEn: 20, gap: 2, groupGap: 10, inline: true },
];
const cardBg = 'color-mix(in srgb, var(--ink) 6%, transparent)';
const hpx = (px) => `calc(${px}px * var(--he-scale, 1))`;

function CardShell({ i, labelHe, labelEn, lang, children, portrait, wide = false, tight = false }) {
  return (
    <div data-s="" style={{ '--i': i, direction: 'ltr', background: cardBg, borderRadius: 24, padding: portrait ? '18px 28px 20px' : '18px 26px 20px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 'none', paddingBottom: 10, marginBottom: 14, borderBottom: '2px solid var(--line)', textAlign: lang === 'english' ? 'left' : 'right', minWidth: 0,
        ...(wide ? { display: 'flex', flexDirection: lang === 'english' ? 'row' : 'row-reverse', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 } : null),
      }}>
        {lang !== 'english' && <div className="tt-he" style={{ fontFamily: F.heD, fontSize: hpx(27), fontWeight: 600, color: 'var(--accentText)', whiteSpace: 'nowrap', lineHeight: 1.15 }}>{labelHe}</div>}
        {lang !== 'hebrew' && (lang === 'english' || wide || !tight) && <div style={{ fontFamily: F.en, fontSize: lang === 'english' ? 22 : 20, fontWeight: lang === 'english' ? 600 : 500, color: lang === 'english' ? 'var(--accentText)' : 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: wide ? 0 : 2 }}>{labelEn}</div>}
      </div>
      {children}
    </div>
  );
}

/** Card body; reports whether its content overflows at the current tier. */
function CardBody({ children, ltr = false, onOverflow, tier }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let alive = true;
    const check = () => {
      if (!alive || !el.clientHeight) return;
      const over = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 1;
      if (over) onOverflow?.();
    };
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    document.fonts?.ready?.then(check).catch(() => {});
    return () => { alive = false; ro?.disconnect(); };
  }, [tier, onOverflow]);
  return (
    <div ref={ref} dir={ltr ? 'ltr' : 'rtl'} style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', textAlign: ltr ? 'left' : 'right', textWrap: 'balance' }}>
      {children}
    </div>
  );
}

const lineHe = (px, weight, color = 'var(--ink)', font = F.he) => ({ display: 'block', fontFamily: font, fontSize: hpx(px), fontWeight: weight, lineHeight: 1.14, color });
const lineEn = (px, weight = 500, color = 'var(--inkDim)', font = F.en) => ({ display: 'block', direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'inherit', fontFamily: font, fontSize: px, fontWeight: weight, lineHeight: 1.25, color });
const nowrapIf = (t, n) => (String(t || '').length <= n ? 'nowrap' : undefined);

function Perakim({ text, lang, t }) {
  return (
    <span style={{ display: t.inline ? 'inline-flex' : 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2, marginTop: t.inline ? 0 : 4 }}>
      {lang !== 'english' && <span style={{ fontFamily: F.heD, fontSize: hpx(t.perHe), fontWeight: 600, color: 'var(--accentText)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{text.he}</span>}
      {lang !== 'hebrew' && (
        <span className="tt-num" dir="ltr" style={{ fontSize: lang === 'english' ? t.perHe : t.perEn, fontWeight: lang === 'english' ? 700 : 600, color: lang === 'english' ? 'var(--accentText)' : 'var(--inkDim)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{text.en}</span>
      )}
    </span>
  );
}

function RawLines({ raw, showHe, showEn, t }) {
  return (
    <>
      {showHe && raw.he && <span style={lineHe(t.hilchos, 600)}>{raw.he}</span>}
      {(showEn || !raw.he) && raw.en && <span style={lineEn(Math.max(20, t.perEn))}>{raw.en}</span>}
    </>
  );
}

function RambamCard({ i, perDay, data, lang, portrait, wide, tier, onOverflow }) {
  const t = TIERS[tier];
  const track = rambamTrack(perDay);
  const showHe = lang !== 'english';
  const showEn = lang !== 'hebrew';
  return (
    <CardShell i={i} labelHe={track.he} labelEn={track.en} lang={lang} portrait={portrait} wide={wide} tight={tier >= 2}>
      <CardBody ltr={!showHe} tier={tier} onOverflow={onOverflow}>
        {data.groups.length === 0 ? <RawLines raw={data.raw} showHe={showHe} showEn={showEn} t={t} /> : data.groups.map((g, gi) => (
          <div key={gi} style={{ marginTop: gi ? t.groupGap : 0 }}>
            {g.sefer && showHe && g.sefer.he && <span style={{ ...lineHe(t.sefer, 700, 'var(--ink)', F.heD), whiteSpace: 'nowrap' }}>{g.sefer.he}</span>}
            {g.sefer && !showHe && g.sefer.en && <span style={{ ...lineEn(Math.round(t.sefer * 0.82), 700, 'var(--ink)', F.enD), whiteSpace: 'nowrap', lineHeight: 1.12 }}>{g.sefer.en}</span>}
            {g.sefer && showHe && showEn && g.sefer.en && tier === 0 && <span style={{ ...lineEn(t.seferEn), marginTop: 2, whiteSpace: 'nowrap' }}>{g.sefer.en}</span>}
            {g.hilchos.map((h, hi) => (
              <div key={hi} style={{ marginTop: g.sefer || hi ? t.gap : 0, ...(t.inline ? { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14 } : null) }}>
                {showHe && h.he && <span style={{ ...lineHe(t.hilchos, 500), whiteSpace: nowrapIf(h.he, 22), display: t.inline ? 'inline' : 'block' }}>{h.he}</span>}
                {!showHe && h.en && <span style={{ ...lineEn(Math.round(t.hilchos * 0.86), 600, 'var(--ink)'), whiteSpace: nowrapIf(h.en, 24), display: t.inline ? 'inline' : 'block' }}>{`Hilchos ${h.en}`}</span>}
                {h.perakim.length > 0 && <Perakim text={h.text} lang={lang} t={t} />}
              </div>
            ))}
          </div>
        ))}
      </CardBody>
    </CardShell>
  );
}

function MitzvosCard({ i, data, lang, portrait, wide, tier, onOverflow }) {
  const t = TIERS[tier];
  const showHe = lang !== 'english';
  const showEn = lang !== 'hebrew';
  return (
    <CardShell i={i} labelHe="ספר המצוות" labelEn="Sefer HaMitzvos" lang={lang} portrait={portrait} wide={wide} tight={tier >= 2}>
      <CardBody ltr={!showHe} tier={tier} onOverflow={onOverflow}>
        {data.items.length === 0 ? <RawLines raw={data.raw} showHe={showHe} showEn={showEn} t={t} /> : data.items.map((it, k) => (
          <div key={k} style={{ marginTop: k ? t.groupGap : 0 }}>
            {showHe && (tier >= 2 && data.items.length > 1 ? (
              <span style={{ display: 'block', lineHeight: 1.1 }}>
                <span style={{ ...lineHe(t.hilchos, 500), display: 'inline', whiteSpace: 'nowrap' }}>{it.kindHe}</span>{' '}
                <span style={{ ...lineHe(t.hilchos + 4, 700, 'var(--ink)', F.heD), display: 'inline-block', whiteSpace: 'nowrap', marginInlineStart: '.28em' }}>{it.numHe}</span>
              </span>
            ) : (
              <>
                <span style={{ ...lineHe(t.hilchos, 500), whiteSpace: 'nowrap' }}>{it.kindHe}</span>
                <span style={{ ...lineHe(t.sefer, 700, 'var(--ink)', F.heD), whiteSpace: 'nowrap' }}>{it.numHe}</span>
              </>
            ))}
            {showEn && <span className="tt-num" style={{ ...lineEn(showHe ? t.perEn : Math.round(t.sefer * 0.7), showHe ? 500 : 700, showHe ? 'var(--inkDim)' : 'var(--ink)', F.num), whiteSpace: 'nowrap', marginTop: 2 }}>{it.en}</span>}
          </div>
        ))}
      </CardBody>
    </CardShell>
  );
}

export default function LimudimSlide({ cache, settings, portrait = false }) {
  const { heScale = 1 } = useDesign();
  const l = cache?.limudim || {};
  const items = settings?.limudimItems || {};
  const lang = settings?.limudimLang || 'both';
  const on = (k) => items[k] !== false;
  const excerpt = l.tanyaFirstWords || l.tanyaLastWords ? { first: l.tanyaFirstWords || '', last: l.tanyaLastWords || '' } : null;

  const chitas = [
    on('chumash') && { labelHe: 'חומש', labelEn: 'Chumash', valueHe: oneLine(l.chumashHe), valueEn: oneLine(l.chumash) },
    on('tehillim') && { labelHe: 'תהילים', labelEn: 'Tehillim', valueHe: oneLine(l.tehillimHe), valueEn: oneLine(l.tehillim) },
    on('tanya') && { labelHe: 'תניא', labelEn: 'Tanya', valueHe: oneLine(l.tanyaHe), valueEn: oneLine(l.tanya), excerpt },
  ].filter((r) => r && (r.valueHe || r.valueEn));

  const r3 = on('rambam3') ? parseRambam(cache?.rambam3) : null;
  const r1 = on('rambam1') ? parseRambam(cache?.rambam1) : null;
  const sh = on('sefer') ? parseSeferHamitzvos(cache?.seferHamitzvot) : null;
  // One tier for every card: step down until all of them fit (reset when the
  // content changes). Never per frame: only on mount/resize/font load.
  const contentKey = JSON.stringify([r3, r1, sh, lang, portrait]);
  // Sefer HaMitzvos steps on its own: its lines are not compared side by side.
  const [tiers, setTiers] = useState({ r: 0, sh: 0 });
  useEffect(() => {
    let alive = true;
    setTiers({ r: 0, sh: 0 });
    // Fallback fonts are wider: start over once the real ones are in.
    document.fonts?.ready?.then(() => { if (alive) setTiers({ r: 0, sh: 0 }); }).catch(() => {});
    return () => { alive = false; };
  }, [contentKey]);
  const stepR = useCallback(() => setTiers((x) => ({ ...x, r: Math.min(TIERS.length - 1, x.r + 1) })), []);
  const stepSh = useCallback(() => setTiers((x) => ({ ...x, sh: Math.min(TIERS.length - 1, x.sh + 1) })), []);
  const common = { lang, portrait, tier: tiers.r, onOverflow: stepR };
  const cards = [
    r3 && { key: 'r3', el: (k, wide) => <RambamCard key="r3" i={k} wide={wide} perDay={3} data={r3} {...common} /> },
    r1 && { key: 'r1', el: (k, wide) => <RambamCard key="r1" i={k} wide={wide} perDay={1} data={r1} {...common} /> },
    sh && { key: 'sh', el: (k, wide) => <MitzvosCard key="sh" i={k} wide={wide} data={sh} {...common} tier={tiers.sh} onOverflow={stepSh} /> },
  ].filter(Boolean);

  if (!chitas.length && !cards.length) {
    return <Panel pad="30px 48px 34px"><PageTitle en="Today’s learning" heText="לימוד היום" /><Empty en="Learning data will appear once it is fetched" /></Panel>;
  }

  const rows = chitas.map(() => 'auto');
  return (
    <Panel pad="30px 48px 34px">
      <PageTitle en="Today’s learning" heText="לימוד היום" />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: [...rows, cards.length ? 'minmax(0, 1fr)' : ''].join(' '), marginTop: 6 }}>
        {chitas.map((r, i) => <ChitasRow key={r.labelEn} i={i} {...r} lang={lang} heScale={heScale} />)}
        {cards.length > 0 && (
          <div style={{
            display: 'grid', gap: 20, minHeight: 0, paddingTop: chitas.length ? 20 : 0, direction: 'rtl',
            ...(portrait
              ? { gridTemplateColumns: cards.length > 1 ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gridTemplateRows: cards.length > 2 ? 'minmax(0, 1.25fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }
              : { gridTemplateColumns: cards.length === 3 ? 'minmax(0, 1.14fr) minmax(0, 1.14fr) minmax(0, 0.84fr)' : `repeat(${cards.length}, minmax(0, 1fr))` }),
          }}>
            {cards.map((c, k) => (portrait && cards.length === 3 && k === 2
              ? <div key={c.key} style={{ gridColumn: '1 / -1', display: 'grid', minHeight: 0 }}>{c.el(chitas.length + 1 + k, true)}</div>
              : c.el(chitas.length + 1 + k, portrait && cards.length === 1)))}
          </div>
        )}
      </div>
    </Panel>
  );
}
