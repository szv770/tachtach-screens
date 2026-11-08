import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { layoutOf, lookOf, orderedBlocks, shows, scaled, numeralsStack } from '../../design/useLayout.js';
import { Label, BigNum, Ticks, ThinRing, EdgeTicks, Backdrop, TapPop, LABEL_INK, SOFT_INK, ACC, useSmallAccent, WHY_LABEL, WHY_SOURCE, inLang, whyBox } from './occasionParts.jsx';
import { Confetti } from './BirthdaysSlide.jsx';
import { textDir } from '../../../shared/bidi.js';
import { slideModel, ctxFrom, COPY, FAR_DAYS } from '../../../shared/occasions.js';

/**
 * The Countdown page (OCCASION): the nearest Chassidic / Jewish day or school event, with a countdown that changes its
 * form as the time shrinks (src/shared/occasions.js decides everything; this file only paints the model).
 *
 * The look (owner, 2026-11): calm and typographic, like good architectural signage. Small-caps labels, a Hebrew heading
 * with a thinner English line under it, VERY large condensed numerals (look.numeralsFont, default the bundled condensed
 * face, tabular so seconds never jiggle), hairline rules, thin tick rows (one tick per day / hour / minute left) and a
 * static row of edge ticks. An optional uploaded photo per occasion sits under a scrim of the panel colour.
 *
 *   far      > 14 days: the big number of days inside a thin ring (how much of the lead-up has passed)
 *   days     1-14 days: 'N DAYS' + 'and H hours', one tick per day left
 *   hours    the last day: H:MM, one tick per hour left
 *   minutes  the last hour: M:SS, the text changes each second (nothing animates), one tick per minute left
 *   zero     it has begun: a FINITE celebration (the birthday page's confetti, which falls out of the panel and is gone),
 *            then the settled greeting
 *   day      'Today is' / 'Tonight is' + the name, day k of n, the admin's event line
 * Rows may carry `layout` (which parts show, their order, side, scale, alignment), `look` (accent, photo, dim, numerals
 * font) and `stageText` (the tagline above the numbers); all optional, see design/useLayout.js.
 * The admin's explanation shows only with its source (owner rule), on its own page.
 * Roles and font roles only; static art; nothing loops, no blur or blend. Portrait and landscape.
 */

const isLong = (name) => [...(name?.he || '')].length > 16 || [...(name?.en || '')].length > 24;
const textOf = (x) => (x && (x.en || x.he) ? x : null);

/** The name: Hebrew heading (display role) over a thinner English line; each auto-fitted, allowed to wrap, never cut. */
function Name({ name, L, size, align, k }) {
  const heOn = shows(L, 'hebrewName') && !!name.he;
  const enOn = shows(L, 'name') && !!name.en;
  if (!heOn && !enOn) return null;
  const ta = align === 'center' ? 'center' : 'left';
  const [hMax, hMin, hBox, eMax, eMin, eBox] = size;
  const he1 = heOn ? (
    <Fit key={`nh|${k}|${hMax}|${hBox}`} wrap vcenter dir="rtl" max={scaled(hMax, L)} min={hMin} className="tt-he" style={{
      flex: '0 1 auto', minHeight: Math.min(scaled(hBox, L), Math.round(hMin * 3.9)), width: '100%', height: scaled(hBox, L), overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, textAlign: ta,
    }}>{name.he}</Fit>
  ) : null;
  const en1 = enOn ? (
    <Fit key={`ne|${k}|${eMax}|${eBox}|${heOn}`} wrap vcenter dir={textDir(name.en)} max={scaled(heOn ? eMax : hMax * 0.8, L)} min={eMin} style={{
      flex: '0 1 auto', minHeight: Math.min(scaled(heOn ? eBox : hBox, L), Math.round(eMin * 3.5)), width: '100%', height: scaled(heOn ? eBox : hBox, L), overflow: 'visible', fontFamily: F.enD,
      fontWeight: heOn ? 400 : 700, letterSpacing: heOn ? '.005em' : '-.01em', color: heOn ? SOFT_INK : 'var(--ink)', lineHeight: 1.12, textAlign: ta,
    }}>{name.en}</Fit>
  ) : null;
  // the boxes may shrink (down to two lines at the smallest size) when the column is crowded; Fit re-fits on resize
  return <div data-occ-name="" style={{ flex: '0 1 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>{he1}{en1}</div>;
}

/** Name boxes (canvas px): [Hebrew max, min, box height, English max, min, box height]. Long names get two-line boxes. */
const NAME = {
  side: [118, 46, 160, 50, 32, 70],
  sideLong: [84, 36, 190, 40, 28, 100],
  port: [116, 46, 160, 52, 32, 72],
  portLong: [92, 40, 200, 42, 28, 100],
  day: [168, 56, 220, 64, 36, 92],
  dayLong: [100, 40, 220, 46, 30, 104],
  dayPort: [176, 56, 260, 66, 36, 100],
  dayPortLong: [110, 42, 280, 48, 30, 120],
  small: [92, 40, 124, 46, 30, 76],
};

function Rule({ width = 72, center }) {
  return <div aria-hidden style={{ flex: 'none', width, height: 2, background: 'var(--line)', alignSelf: center ? 'center' : 'flex-start' }} />;
}

function DateLine({ m, center }) {
  const en = [];
  if (m.hebrewDate?.en) en.push(m.hebrewDate.en);
  if (m.civilDate?.en) en.push(m.civilDate.en);
  if (m.days > 1 && !m.dayIndex) en.push(`${m.days} ${COPY.days.en}`);
  const heText = m.hebrewDate?.he || (!m.civilDate?.en ? m.civilDate?.he : '') || '';
  if (!en.length && !heText) return null;
  return (
    <div data-occ-date="" style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: 2, lineHeight: 1.3 }}>
      {heText && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(34), fontWeight: 500, color: 'var(--ink)' }}>{heText}</span>}
      {en.length > 0 && (
        <span style={{ fontFamily: F.en, fontSize: 28, fontWeight: 500, color: SOFT_INK, textAlign: center ? 'center' : 'start' }}>
          {en.map((t, i) => <React.Fragment key={i}>{i > 0 && ' · '}<DatePart t={t} /></React.Fragment>)}
        </span>
      )}
    </div>
  );
}

/** 'Sunday, November 29': the weekday may wrap, 'November 29' (and '19 Kislev 5787') never splits. */
function DatePart({ t }) {
  const i = t.indexOf(', ');
  if (i < 0) return <span style={{ whiteSpace: 'nowrap' }}>{t}</span>;
  return <>{t.slice(0, i + 1)} <span style={{ whiteSpace: 'nowrap' }}>{t.slice(i + 2)}</span></>;
}

const hasText = (x) => !!(x && (x.en || x.he));

/**
 * THE DAY, in three calm lines (the model's `dates`, written by src/shared/occasions.js): 'Sunday, November 29' (big), the
 * range of a multi-day occasion (small), the Hebrew date ('19 Kislev 5787' / Hebrew). Rows without `dates` (an older model)
 * keep the old date line. The range is the first thing to go when the column is crowded (layout.show.dateRange, set by squeezed()).
 */
function DateBlock({ m, center, lang, L, portrait }) {
  const d = m.dates && typeof m.dates === 'object' ? m.dates : null;
  const day = inLang(d?.day, lang);
  if (!hasText(day)) return <DateLine m={m} center={center} />;
  const range = shows(L, 'dateRange') ? inLang(d.dayRange, lang) : null;
  const heb = inLang(d.hebrew, lang);
  const al = center ? 'center' : 'flex-start';
  const k = L.k || 1;
  return (
    <div data-occ-date="" style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: al, gap: 4, lineHeight: 1.2, textAlign: center ? 'center' : 'start' }}>
      {day.en && <div data-occ-day="" dir={textDir(day.en)} style={{ fontFamily: F.enD, fontSize: Math.round((portrait ? 54 : 50) * k), fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.005em', unicodeBidi: 'isolate' }}><DatePart t={day.en} /></div>}
      {day.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(Math.round((day.en ? 38 : 50) * k)), fontWeight: day.en ? 400 : 600, color: day.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.3 }}>{day.he}</div>}
      {hasText(range) && (
        <div data-occ-range="" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 18px', justifyContent: al, alignItems: 'baseline', color: SOFT_INK, lineHeight: 1.25 }}>
          {range.en && <span style={{ fontFamily: F.en, fontSize: 28, fontWeight: 500 }}><DatePart t={range.en} /></span>}
          {range.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(28), fontWeight: 500 }}>{range.he}</span>}
        </div>
      )}
      {hasText(heb) && (
        <div data-occ-hebdate="" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 20px', justifyContent: al, alignItems: 'baseline', marginTop: 2, lineHeight: 1.25 }}>
          {heb.en && <span className="tt-num" style={{ fontFamily: F.en, fontSize: 32, fontWeight: 500, color: SOFT_INK }}>{heb.en}</span>}
          {heb.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(34), fontWeight: 500, color: heb.en ? SOFT_INK : 'var(--ink)' }}>{heb.he}</span>}
        </div>
      )}
    </div>
  );
}

/** 'Begins Saturday evening · Shkia 4:30 PM': the when as a small-caps label, the zman and time large under it. */
const splitWhen = (t) => { const i = String(t || '').lastIndexOf(' · '); return i < 0 ? ['', String(t || '')] : [t.slice(0, i), t.slice(i + 3)]; };
function Begins({ m, center, lang }) {
  const d = m.dates && typeof m.dates === 'object' ? m.dates : null;
  const line = inLang(d?.beginsLine, lang);
  let enA; let heA; let enB; let heB;
  if (hasText(line)) {
    // the model's own wording: the line (small caps) and, when there is one, the time under it
    const at = inLang(d.beginsAt, lang) || { en: '', he: '' };
    [enA, heA, enB, heB] = [line.en, line.he, at.en, at.he];
  } else if (m.begins) {
    [enA, enB] = splitWhen(m.begins.en); [heA, heB] = splitWhen(m.begins.he);
  } else return null;
  const jc = center ? 'center' : 'flex-start';
  const big = hasText(line); // the new block sets the time larger
  return (
    <div data-occ-begins="" style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: 4, lineHeight: 1.25 }}>
      {(enA || heA) && <Label en={enA} heText={heA} size={big ? 26 : 24} style={{ justifyContent: jc }} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 22px', alignItems: 'baseline', justifyContent: jc }}>
        {enB && <span className="tt-num" style={{ fontFamily: F.en, fontSize: big ? 46 : 38, fontWeight: 600, color: ACC }}>{enB}</span>}
        {heB && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(big ? 40 : 34), fontWeight: 500, color: ACC }}>{heB}</span>}
      </div>
      {m.approx && <Label en={`~ ${COPY.approx.en}`} heText={COPY.approx.he} />}
    </div>
  );
}

/**
 * 'WHY WE CELEBRATE' + the short why line (the model's `why`, already filtered by the owner's source + checked rule, so
 * when it is here it shows) + a muted 'Source: ...' under it. The text is fitted (28 px at the least) and never cut; the
 * source line is the first part of this block to be dropped when the column is crowded (layout.show.whySource).
 * `hero` = the day view, where it is the main line under the name.
 */
function WhyBlock({ why, L, width, hero = false, center, lang, k }) {
  const w = inLang(why, lang);
  if (!why || !hasText(w) || !shows(L, 'why')) return null;
  const src = why.source && shows(L, 'whySource') ? String(why.source) : '';
  const kk = L.k || 1;
  const { size, height } = whyBox(w, width, hero ? { max: Math.round(56 * kk), min: 30 } : { max: Math.round(44 * kk), min: 28 });
  const ta = center ? 'center' : 'start';
  return (
    <div data-occ-why="" style={{ flex: '0 1 auto', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: hero ? 10 : 6, textAlign: ta }}>
      <Label en={WHY_LABEL.en} heText={WHY_LABEL.he} color={hero ? ACC : LABEL_INK} size={hero ? 28 : 24} style={{ justifyContent: center ? 'center' : 'flex-start' }} />
      <Fit key={`wy|${k}|${size}|${height}|${lang}`} wrap vcenter max={size + 6} min={hero ? 30 : 28} data-occ-why-text="" style={{ flex: '0 1 auto', width: '100%', height, minHeight: Math.min(height, 120), overflow: 'visible', lineHeight: 1.36, textAlign: ta }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4em' }}>
          {w.en && <div dir={textDir(w.en)} style={{ fontFamily: textDir(w.en) === 'rtl' ? F.he : F.en, fontWeight: 500, color: 'var(--ink)', unicodeBidi: 'isolate' }}>{bidiNodes(w.en)}</div>}
          {w.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontWeight: 400, color: w.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.42 }}>{bidiNodes(w.he)}</div>}
        </div>
      </Fit>
      {src && (
        <div data-occ-why-source="" dir="auto" style={{ flex: 'none', fontFamily: F.en, fontSize: 24, fontWeight: 500, color: LABEL_INK, lineHeight: 1.3, overflowWrap: 'anywhere', textAlign: ta }}>
          <span style={{ letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600 }}>{WHY_SOURCE.en}</span>: {bidiNodes(src)}
        </div>
      )}
    </div>
  );
}

function EventLine({ ev, center, size = 32 }) {
  if (!ev?.en && !ev?.he) return null;
  const ta = center ? 'center' : 'start';
  return (
    <div data-occ-event="" style={{ flex: 'none', display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: '100%', alignItems: center ? 'center' : 'flex-start', gap: 2 }}>
      {ev.en && <div dir={textDir(ev.en)} style={{ fontFamily: textDir(ev.en) === 'rtl' ? F.he : F.en, fontSize: size, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25, overflowWrap: 'anywhere', textAlign: ta, unicodeBidi: 'isolate' }}>{bidiNodes(ev.en)}</div>}
      {ev.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(size - 2), fontWeight: 500, color: ev.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.3, overflowWrap: 'anywhere', textAlign: ta }}>{bidiNodes(ev.he)}</div>}
    </div>
  );
}

/** The detail blocks other than the name, in the admin's order. */
function Details({ m, keys, center, eventSize, lang, L, portrait, whyWidth = 840 }) {
  return keys.map((key) => {
    if (key === 'date') return <DateBlock key={key} m={m} center={center} lang={lang} L={L} portrait={portrait} />;
    if (key === 'begins') return <Begins key={key} m={m} center={center} lang={lang} />;
    if (key === 'why') return <WhyBlock key={key} why={m.why} L={L} width={whyWidth} center={center} lang={lang} k={m.key} />;
    if (key === 'event') return <EventLine key={key} ev={m.event} center={center} size={eventSize} />;
    return null;
  });
}

function Unit({ unit, center, size = 26 }) {
  if (!unit?.en && !unit?.he) return null;
  return <Label en={unit.en} heText={unit.he} size={size} color={SOFT_INK} style={{ justifyContent: center ? 'center' : 'flex-start' }} data-occ-unit="" />;
}

function Sub({ sub, center }) {
  if (!sub?.en && !sub?.he) return null;
  return (
    <div style={{ display: 'flex', gap: '2px 20px', alignItems: 'baseline', justifyContent: center ? 'center' : 'flex-start', flexWrap: 'wrap', lineHeight: 1.25 }}>
      {sub.en && <span style={{ fontFamily: F.en, fontSize: 36, fontWeight: 500, color: 'var(--ink)' }}>{sub.en}</span>}
      {sub.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(36), fontWeight: 500, color: SOFT_INK }}>{sub.he}</span>}
    </div>
  );
}

/**
 * The unit under the big number. With the model's `dates.toGoLabel` the days read 'DAYS UNTIL IT BEGINS' (the countdown runs
 * to the EVENING BEFORE the day, so a bare 'days to go' next to the day's own date was off by one); without it the old words.
 */
function unitWords(m, lang) {
  const tg = inLang(m.dates?.toGoLabel, lang);
  if ((m.form !== 'far' && m.form !== 'days') || !hasText(tg) || !m.countdown) return m.words.unit;
  const noun = m.countdown.days === 1 ? COPY.day : COPY.days;
  return inLang({ en: tg.en ? `${noun.en} ${tg.en}` : noun.en, he: tg.he ? `${noun.he} ${tg.he}` : noun.he }, lang);
}

const SECONDS = { en: 'seconds', he: 'שניות' };
const two = (n) => String(n).padStart(2, '0');

/**
 * The flip display's cells. With the row's exact begin time (m.beginMs) every unit shows at once (days only when there are
 * any; seconds only while the page ticks each second and the time is exact); without it, the units of the current form.
 */
export function flipCells(m, nowMs, fast) {
  const c = m.countdown || {};
  const beginMs = Number(m.beginMs ?? c.beginMs);
  const exact = !c.approx;
  if (Number.isFinite(beginMs) && beginMs > nowMs) {
    const t = Math.floor((beginMs - nowMs) / 1000);
    const d = Math.floor(t / 86400); const h = Math.floor((t % 86400) / 3600); const mi = Math.floor((t % 3600) / 60); const se = t % 60;
    const out = [];
    if (d > 0) out.push({ k: 'd', v: String(d), label: COPY.days });
    out.push({ k: 'h', v: two(h), label: COPY.hours }, { k: 'm', v: two(mi), label: COPY.minutes });
    if (fast && exact) out.push({ k: 's', v: two(se), label: SECONDS });
    return out;
  }
  if (m.form === 'far') return [{ k: 'd', v: String(c.days ?? m.words?.big ?? ''), label: COPY.days }];
  if (m.form === 'days') return [{ k: 'd', v: String(c.days), label: COPY.days }, { k: 'h', v: two(c.hours || 0), label: COPY.hours }];
  if (m.form === 'hours') return [{ k: 'h', v: String(c.hours), label: COPY.hours }, { k: 'm', v: two(c.minutes || 0), label: COPY.minutes }];
  if (m.form === 'minutes') {
    const out = [{ k: 'm', v: two(c.minutes || 0), label: COPY.minutes }];
    if (c.seconds != null && fast && exact) out.push({ k: 's', v: two(c.seconds), label: SECONDS });
    return out;
  }
  return [];
}

/** Flip-clock cells: tabular condensed digits, a hairline split, each cell turns in once when its value changes. */
function FlipRow({ cells, font, portrait, center, L, lang }) {
  const n = cells.length;
  const h = scaled(portrait ? (n > 3 ? 210 : n === 3 ? 250 : 300) : (n > 3 ? 168 : n === 3 ? 204 : 250), L);
  const label = (l) => ({ en: lang === 'hebrew' ? '' : l.en, he: lang === 'english' ? '' : l.he });
  return (
    <div data-occ-flip={n} style={{ flex: 'none', display: 'flex', gap: portrait ? 18 : 14, width: '100%', justifyContent: center ? 'center' : 'flex-start' }}>
      {cells.map((c) => (
        <div key={c.k} data-occ-cell={c.k} style={{ flex: '1 1 0', minWidth: 0, maxWidth: Math.round(h * (c.v.length > 2 ? 1.5 : 1.15)), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: '100%', height: h, borderRadius: 14, border: '2px solid var(--line)', background: 'color-mix(in srgb, var(--ink) 5%, transparent)', overflow: 'hidden', padding: '0 9%' }}>
            <BigNum text={c.v} max={Math.round(h * 0.84)} min={30} height={h - 8} font={font} align="center" flip />
            <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 'calc(50% - 1px)', height: 2, background: 'var(--panel)' }} />
          </div>
          <Label en={label(c.label).en} heText={label(c.label).he} size={24} color={SOFT_INK} style={{ justifyContent: 'center', textAlign: 'center' }} />
        </div>
      ))}
    </div>
  );
}

/** Count-up ('Day 3 of 8'): a big DAY k, 'of n', n hairline ticks with k lit (a hairline bar past 60), days to go. */
function RunCount({ m, L, portrait, font, center, tagline }) {
  const r = m.run;
  const left = Math.max(0, r.n - r.k);
  const numH = scaled(portrait ? 400 : 320, L);
  return (
    <div data-occ-count="run" style={{ position: 'relative', flex: 'none', width: '100%', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: portrait ? 14 : 10, textAlign: center ? 'center' : 'start' }}>
      {tagline}
      <Label en={COPY.dayOf.en} heText={COPY.dayOf.he} color={ACC} size={28} />
      <BigNum text={String(r.k)} max={Math.round(numH * 1.12)} height={numH} font={font} align={center ? 'center' : 'start'} />
      <Label en={`${COPY.of.en} ${r.n}`} heText={`${COPY.of.he} ${r.n}`} size={30} color={SOFT_INK} style={{ justifyContent: center ? 'center' : 'flex-start' }} />
      {(shows(L, 'pips') || shows(L, 'bar')) && (
        <div style={{ width: '100%', marginTop: 12, display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}>
          {r.n <= 60
            ? <Ticks total={r.n} lit={r.k} from="start" major={r.n > 20 ? 5 : 7} align={center ? 'center' : 'start'} />
            : <div aria-hidden data-occ-progress="" style={{ width: '100%', maxWidth: 560, height: 4, background: 'var(--line)', borderRadius: 2 }}><div style={{ width: `${((r.fraction ?? r.k / r.n) * 100).toFixed(2)}%`, height: '100%', background: 'var(--accentText)', borderRadius: 2 }} /></div>}
        </div>
      )}
      {left > 0 && <Label en={`${left} ${left === 1 ? COPY.day.en : COPY.days.en} ${COPY.toGo.en}`} heText={`${COPY.toGo.he} ${left} ${left === 1 ? COPY.day.he : COPY.days.he}`} style={{ marginTop: 6, justifyContent: center ? 'center' : 'flex-start' }} />}
    </div>
  );
}

/** The countdown itself, in its current form: tagline, the big numerals, the unit, the tick row. */
function Count({ m, L, portrait, font, compact, center, nowMs, fast, lang }) {
  const w = m.words;
  const c = m.countdown;
  const tag = shows(L, 'tagline') ? textOf(m.stageText) : null;
  const unit = unitWords(m, lang);
  const tagline = tag ? <Label en={tag.en} heText={tag.he} color={ACC} size={26} style={{ justifyContent: center ? 'center' : 'flex-start' }} data-occ-tagline="" /> : null;
  const col = { position: 'relative', flex: 'none', width: '100%', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', textAlign: center ? 'center' : 'start' };
  if (m.run) return <RunCount m={m} L={L} portrait={portrait} font={font} center={center} tagline={tagline} />;
  if (m.display === 'flip') {
    const cells = flipCells(m, nowMs, fast);
    if (cells.length) {
      return (
        <div data-occ-count={m.form} style={{ ...col, gap: portrait ? 18 : 14 }}>
          {tagline}
          <FlipRow cells={cells} font={font} portrait={portrait} center={center} L={L} lang={lang} />
          {hasText(inLang(m.dates?.toGoLabel, lang)) && <Unit unit={inLang(m.dates.toGoLabel, lang)} center={center} />}
        </div>
      );
    }
  }
  if (m.form === 'far' && shows(L, 'ring')) {
    const ring = scaled(portrait ? 560 : compact ? 380 : 440, L);
    return (
      <div data-occ-count="far" style={{ ...col, gap: 18 }}>
        {tagline}
        <div style={{ position: 'relative', width: ring, height: ring, flex: 'none', alignSelf: center ? 'center' : 'flex-start', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ThinRing size={ring} fraction={m.lead?.fraction || 0} />
          <div style={{ width: '64%' }}><BigNum text={w.big} max={Math.round(ring * 0.5)} height={Math.round(ring * 0.46)} font={font} align="center" /></div>
          <Unit unit={unit} center size={24} />
        </div>
      </div>
    );
  }
  const numH = scaled(portrait ? 290 : compact ? 260 : 330, L);
  const n = m.form === 'far' ? (m.lead?.days || FAR_DAYS) : m.form === 'days' ? FAR_DAYS : m.form === 'hours' ? 24 : 60;
  const left = m.form === 'far' ? (c.days || 0) : m.form === 'days' ? c.days : m.form === 'hours' ? c.hours + (c.minutes > 0 ? 1 : 0) : c.minutes + ((c.seconds || 0) > 0 ? 1 : 0);
  const ticksOn = m.form === 'far' || m.form === 'days' ? shows(L, 'pips') : shows(L, 'bar') && !c.approx;
  return (
    <div data-occ-count={m.form} style={{ ...col, gap: portrait ? 14 : 10 }}>
      {tagline}
      <BigNum text={w.big} max={Math.round(numH * 1.12)} height={numH} font={font} align={center ? 'center' : 'start'} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 26px', justifyContent: center ? 'center' : 'flex-start' }}>
        <Unit unit={unit} center={center} />
        <Sub sub={w.sub} center={center} />
      </div>
      {ticksOn && <div style={{ width: '100%', marginTop: portrait ? 16 : 12, display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}>
        <Ticks total={n} lit={left} major={m.form === 'hours' ? 6 : m.form === 'minutes' ? 5 : 7} align={center ? 'center' : 'start'} />
      </div>}
    </div>
  );
}

function Coming({ list, portrait }) {
  if (!list?.length) return null;
  return (
    <div data-occ-coming="" style={{ flex: 'none', marginTop: portrait ? 22 : 14, paddingTop: 14, borderTop: '2px solid var(--line)', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'stretch' : 'baseline', gap: portrait ? 10 : 34 }}>
      <Label en={COPY.comingUp.en} heText={COPY.comingUp.he} style={{ flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: portrait ? '1fr' : `repeat(${list.length}, minmax(0, 1fr))`, gap: portrait ? 8 : 28 }}>
        {list.map((c) => (
          <div key={c.key} style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', justifyContent: portrait ? 'space-between' : 'flex-start' }}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', minWidth: 0, flexWrap: 'wrap' }}>
              {c.name.en && <span style={{ fontFamily: F.en, fontSize: 28, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{bidiNodes(c.name.en)}</span>}
              {c.name.he && (portrait || !c.name.en) && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(28), fontWeight: 500, color: c.name.en ? SOFT_INK : 'var(--ink)' }}>{c.name.he}</span>}
            </span>
            <span className="tt-num" style={{ fontFamily: F.en, fontSize: 26, fontWeight: 600, color: ACC, whiteSpace: 'nowrap' }}>{c.when.en || c.when.he}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ pager, center }) {
  return (
    <header style={{ flex: 'none', display: 'flex', justifyContent: center && !pager ? 'center' : 'space-between', alignItems: 'baseline', gap: 20 }}>
      <Label en={COPY.slideTitle.en} heText={COPY.slideTitle.he} />
      {pager && <span className="tt-num" style={{ fontFamily: F.en, fontSize: 24, fontWeight: 600, letterSpacing: '.12em', color: LABEL_INK }}>{pager}</span>}
    </header>
  );
}

/** Zero: a finite burst of confetti (falls out of the panel and is gone), then the greeting stays. */
function ZeroView({ m, L, portrait }) {
  const z = m.zero || {};
  const dense = !portrait && (isLong(m.name) || [...(m.event?.en || '')].length + [...(m.event?.he || '')].length > 100);
  return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 18 : 10, textAlign: 'center' }}>
      {z.he && (
        <Fit key={`zh|${m.key}|${portrait}`} className="tt-he tt-bd-hero" wrap vcenter dir="rtl" max={scaled(portrait ? 210 : dense ? 136 : 170, L)} min={64} style={{ flex: 'none', width: '100%', height: portrait ? 300 : dense ? 172 : 214, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: ACC, lineHeight: 1.25, textAlign: 'center' }}>{z.he}</Fit>
      )}
      {z.en && (
        <Fit key={`ze|${m.key}|${portrait}`} className="tt-bd-up" wrap vcenter max={scaled(portrait ? 104 : dense ? 66 : 84, L)} min={44} style={{ '--t': '500ms', flex: 'none', width: '100%', height: portrait ? 180 : dense ? 100 : 124, overflow: 'visible', fontFamily: F.enD, fontWeight: z.he ? 400 : 700, color: z.he ? 'var(--ink)' : ACC, lineHeight: 1.1, textAlign: 'center' }}>{z.en}</Fit>
      )}
      <div className="tt-bd-up" style={{ '--t': '700ms', flex: 'none', display: 'flex', width: '100%', justifyContent: 'center', margin: '6px 0' }}><Rule center /></div>
      <div className="tt-bd-up" style={{ '--t': '800ms', width: '100%', flex: 'none' }}><Name name={m.name} L={L} size={NAME.small} align="center" k={m.key} /></div>
      {shows(L, 'event') && <div className="tt-bd-up" style={{ '--t': '1100ms', width: '100%', flex: 'none', display: 'flex', justifyContent: 'center' }}><EventLine ev={m.event} center size={dense ? 28 : 32} /></div>}
    </div>
  );
}

function DayView({ m, L, portrait, coming, lang }) {
  const di = m.dayIndex;
  const center = L.align === 'center';
  const dense = isLong(m.name) || [...(m.event?.en || '')].length + [...(m.event?.he || '')].length > 100;
  const size = portrait ? (dense ? NAME.dayPortLong : NAME.dayPort) : (dense ? NAME.dayLong : NAME.day);
  const keys = orderedBlocks(L).filter((k) => k !== 'name' && k !== 'begins' && k !== 'why');
  const whyOn = orderedBlocks(L).includes('why') && hasText(m.why);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div data-occ-col="" style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'safe center', alignItems: center ? 'center' : 'flex-start', gap: portrait ? 16 : 10, textAlign: center ? 'center' : 'start' }}>
        <Label en={m.dayLabel?.en} heText={m.dayLabel?.he} color={ACC} size={28} />
        <Name name={m.name} L={L} size={size} align={L.align} k={m.key} />
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start', margin: '6px 0' }}>
          <Rule />
          {di && (
            <span data-occ-dayof="" style={{ display: 'inline-flex', gap: 18, alignItems: 'baseline' }}>
              <span className="tt-num" style={{ fontFamily: F.en, fontSize: 30, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink)' }}>{COPY.dayOf.en} {di.k} {COPY.of.en} {di.n}</span>
              <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(30), fontWeight: 500, color: SOFT_INK }}>{COPY.dayOf.he} {di.k} {COPY.of.he} {di.n}</span>
            </span>
          )}
        </div>
        {whyOn && <WhyBlock why={m.why} L={L} width={portrait ? 940 : 1680} hero center={center} lang={lang} k={`day|${m.key}`} />}
        <Details m={m} keys={keys} center={center} eventSize={dense ? 28 : portrait ? 36 : 32} lang={lang} L={L} portrait={portrait} />
      </div>
      {shows(L, 'coming') && <div style={{ width: '100%', flex: 'none' }}><Coming list={coming} portrait={portrait} /></div>}
    </div>
  );
}

function CountView({ m, L, portrait, coming, font, nowMs, fast, lang }) {
  const center = L.align === 'center';
  const long = isLong(m.name);
  const blocks = orderedBlocks(L);
  if (portrait) {
    const at = blocks.indexOf('name');
    const before = at >= 0 ? blocks.slice(0, at + 1) : [];
    const after = at >= 0 ? blocks.slice(at + 1) : blocks;
    const part = (keys) => keys.map((k) => (k === 'name'
      ? <Name key={k} name={m.name} L={L} size={long ? NAME.portLong : NAME.port} align={L.align} k={m.key} />
      : <Details key={k} m={m} keys={[k]} center={center} lang={lang} L={L} portrait whyWidth={940} />));
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: 14, textAlign: center ? 'center' : 'start' }}>
        <div style={{ flex: '0 1 auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: 14, marginTop: 10 }}>{part(before)}</div>
        <div style={{ flex: '1 0 auto', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'inherit', gap: 14 }}>
          {before.length > 0 && <Rule center={center} />}
          <Count m={m} L={L} portrait font={font} center={center} nowMs={nowMs} fast={fast} lang={lang} />
        </div>
        <div style={{ flex: 'none', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: 14 }}>{part(after)}</div>
        {shows(L, 'coming') && <div style={{ width: '100%', flex: 'none' }}><Coming list={coming} portrait /></div>}
      </div>
    );
  }
  const countLeft = L.side === 'left';
  const info = (
    <div data-occ-col="" style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center', alignItems: center ? 'center' : 'flex-start', gap: 14, textAlign: center ? 'center' : 'start' }}>
      {blocks.map((k, i) => (k === 'name'
        ? <React.Fragment key={k}><Name name={m.name} L={L} size={long ? NAME.sideLong : NAME.side} align={L.align} k={m.key} />{i < blocks.length - 1 && <Rule center={center} />}</React.Fragment>
        : <Details key={k} m={m} keys={[k]} center={center} lang={lang} L={L} portrait={false} whyWidth={840} />))}
    </div>
  );
  const count = (
    <div data-occ-col="" style={{ minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', [countLeft ? 'paddingRight' : 'paddingLeft']: 52, [countLeft ? 'borderRight' : 'borderLeft']: '2px solid var(--line)' }}>
      <Count m={m} L={L} portrait={false} font={font} compact={long} center={center} nowMs={nowMs} fast={fast} lang={lang} />
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: countLeft ? 'minmax(0, 1fr) minmax(0, 1.08fr)' : 'minmax(0, 1.08fr) minmax(0, 1fr)', columnGap: 52, alignItems: 'stretch', marginTop: 10 }}>
        {countLeft ? <>{count}{info}</> : <>{info}{count}</>}
      </div>
      {shows(L, 'coming') && <Coming list={coming} portrait={false} />}
    </div>
  );
}

/** The admin's explanation (only ever with a source), on its own page: fitted to the page, 28 px at the least, never cut. */
function Explain({ ex, k }) {
  if (!ex) return null;
  return (
    <div data-occ-explain="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 14, paddingTop: 20, borderTop: '2px solid var(--line)' }}>
      <Fit key={`x|${k}`} wrap vcenter max={48} min={28} style={{ flex: 1, minHeight: 0, width: '100%', lineHeight: 1.36, textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5em' }}>
          {ex.en && <div dir={textDir(ex.en)} style={{ fontFamily: textDir(ex.en) === 'rtl' ? F.he : F.en, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'pre-line', unicodeBidi: 'isolate' }}>{bidiNodes(ex.en)}</div>}
          {ex.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontWeight: 400, color: ex.en ? SOFT_INK : 'var(--ink)', whiteSpace: 'pre-line', lineHeight: 1.45 }}>{bidiNodes(ex.he)}</div>}
        </div>
      </Fit>
      {ex.source && (
        <div data-occ-source="" dir="auto" style={{ flex: 'none', marginTop: 14, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, fontFamily: F.en, fontSize: 24, fontWeight: 500, color: SOFT_INK, lineHeight: 1.3, textAlign: 'center', overflowWrap: 'anywhere' }}>
          <span aria-hidden style={{ flex: 'none', width: 24, height: 2, background: 'var(--line)' }} />
          <span style={{ minWidth: 0 }}><span style={{ letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600 }}>{COPY.source.en}</span>: {bidiNodes(ex.source)}</span>
        </div>
      )}
    </div>
  );
}

/** The vort page: the name and the countdown on one compact line, then the explanation (one language per page when it is long) and its source. */
function VortView({ m, ex, portrait, font, lang }) {
  const w = m.words;
  const line = m.form === 'day' || m.form === 'zero' ? m.dayLabel || m.zero : null;
  const nm = [m.name.he, m.name.en].filter(Boolean);
  const vu = unitWords(m, lang);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <Fit key={`vn|${m.key}|${portrait}`} wrap vcenter max={portrait ? 60 : 54} min={30} style={{ flex: 'none', width: '100%', height: portrait ? 120 : 100, overflow: 'visible', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, textAlign: 'center', marginTop: 6 }}>
        {nm.map((t, i) => <span key={i} dir={textDir(t)} className={textDir(t) === 'rtl' ? 'tt-he' : ''} style={{ fontFamily: textDir(t) === 'rtl' ? F.heD : F.enD, fontWeight: i ? 400 : 700, color: i ? SOFT_INK : 'var(--ink)', unicodeBidi: 'isolate' }}>{i ? ' / ' : ''}{bidiNodes(t)}</span>)}
      </Fit>
      <div style={{ flex: 'none', display: 'flex', gap: '4px 18px', alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', color: ACC, marginTop: 4 }}>
        {line ? <Label en={line.en} heText={line.he} color={ACC} size={28} /> : (
          <>
            <span className="tt-num" style={{ fontFamily: font, fontSize: 64, fontWeight: 600, lineHeight: 1 }}>{w.big}</span>
            <Label en={`${vu.en || ''}${w.sub?.en ? ` ${w.sub.en}` : ''}`} heText={vu.he ? `${vu.he}${w.sub?.he ? ` ${w.sub.he}` : ''}` : ''} color={ACC} size={26} />
          </>
        )}
      </div>
      <Explain ex={ex} k={`${m.key}|${ex.en ? 'e' : ''}${ex.he ? 'h' : ''}`} />
    </div>
  );
}

/**
 * Advent ('Reveal'): which tiles opened since the last day this screen showed the page (remembered per occasion in this
 * browser; nothing on the first ever view). Those tiles fade out once each time the page appears today.
 */
function useNewlyOpened(key, day, revealed) {
  const sig = (revealed || []).map((r) => (r ? 1 : 0)).join('');
  return useMemo(() => {
    const out = new Set();
    try {
      const k = `tt-adv:${key}`;
      const st = JSON.parse(window.localStorage.getItem(k) || 'null');
      const prev = st && st.day === day ? st.prev : st ? st.now : null;
      window.localStorage.setItem(k, JSON.stringify({ day, prev, now: sig }));
      if (typeof prev === 'string' && prev.length === sig.length) for (let i = 0; i < sig.length; i++) if (sig[i] === '1' && prev[i] !== '1') out.add(i);
    } catch { /* no storage: nothing fades, the page is still right */ }
    return out;
  }, [key, day, sig]);
}

/** The tile grid: covers over the photo (panel-coloured hairline panes), or, without a photo, a clean numbered grid. */
function AdventGrid({ a, newly, photo, portrait, side }) {
  const { cols, rows } = a.tiles || { cols: 3, rows: 3 };
  const total = cols * rows;
  const box = photo ? { inset: 0 }
    : portrait ? { top: 104, left: 56, right: 56, height: '46%' }
      : { top: 96, bottom: 40, [side === 'left' ? 'left' : 'right']: 64, width: '50%' };
  return (
    <div aria-hidden data-occ-advent={photo ? 'photo' : 'grid'} style={{ position: 'absolute', ...box, pointerEvents: 'none' }}>
      {photo && <img src={photo} alt="" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gap: photo ? 0 : 10 }}>
        {Array.from({ length: total }, (_, i) => {
          const open = !!a.revealed?.[i];
          const fresh = open && newly.has(i);
          const num = <span className="tt-num" style={{ fontFamily: F.en, fontSize: photo ? 26 : 34, fontWeight: 600, color: open && !photo ? ACC : LABEL_INK }}>{i + 1}</span>;
          if (photo) {
            return (
              <div key={i} data-occ-tile={open ? 'open' : 'shut'} style={{ position: 'relative', border: '2px solid var(--panel)' }}>
                {(!open || fresh) && (
                  <div className={fresh ? 'tt-adv-open' : undefined} style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--ink) 7%, var(--panel))', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: '10px 14px' }}>{num}</div>
                )}
              </div>
            );
          }
          return (
            <div key={i} data-occ-tile={open ? 'open' : 'shut'} style={{ position: 'relative', borderRadius: 12, border: `2px solid ${open ? 'var(--accentText)' : 'var(--line)'}`, background: open ? 'color-mix(in srgb, var(--accentText) 14%, transparent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {num}
              {fresh && <div className="tt-adv-open" style={{ position: 'absolute', inset: -2, borderRadius: 12, background: 'var(--panel)', border: '2px solid var(--line)' }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The countdown on an advent page: a compact card (over a scrim when there is a photo). */
function AdventCard({ m, L, portrait, font, pager, photo, nowMs, fast, lang }) {
  const counting = m.form === 'far' || m.form === 'days' || m.form === 'hours' || m.form === 'minutes';
  const w = m.words;
  return (
    <div data-occ-card="" style={{
      flex: 'none', width: portrait ? '100%' : photo ? '48%' : '44%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12,
      ...(photo ? { padding: portrait ? '28px 36px' : '28px 40px', borderRadius: 24, background: 'color-mix(in srgb, var(--panel) 92%, transparent)' } : null),
    }}>
      <Header pager={pager} />
      <Name name={m.name} L={L} size={NAME.small} align="start" k={`a|${m.key}`} />
      <Rule />
      {counting ? (
        m.display === 'flip' && flipCells(m, nowMs, fast).length
          ? <FlipRow cells={flipCells(m, nowMs, fast)} font={font} portrait={portrait} L={{ ...L, k: (L.k || 1) * 0.7 }} lang={lang} />
          : (
            <div data-occ-count={m.form} style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flexWrap: 'wrap' }}>
              <div style={{ width: portrait ? 300 : 240, flex: 'none' }}><BigNum text={w.big} max={200} height={scaled(portrait ? 190 : 170, L)} font={font} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, minWidth: 0 }}><Unit unit={unitWords(m, lang)} /><Sub sub={w.sub} /></div>
            </div>
          )
      ) : (
        <Label en={(m.zero || m.dayLabel)?.en} heText={(m.zero || m.dayLabel)?.he} color={ACC} size={30} />
      )}
    </div>
  );
}

function AdventMain({ m, L, portrait, font, pager, nowMs, fast, lang, peek }) {
  const a = m.advent;
  const photo = lookOf({ photo: a.photo }).photo;
  const newly = useNewlyOpened(m.key, m.daysLeft, a.revealed);
  const side = L.side === 'left' ? 'left' : 'right';
  return (
    <>
      <AdventGrid a={a} newly={newly} photo={photo} portrait={portrait} side={side} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: photo || portrait ? 'flex-end' : 'center', alignItems: !photo && !portrait && side === 'left' ? 'flex-end' : 'flex-start' }}>
        <AdventCard m={m} L={L} portrait={portrait} font={font} pager={pager} photo={photo} nowMs={nowMs} fast={fast} lang={lang} />
      </div>
      {peek && a.today && (
        <div data-occ-peek="" style={{ position: 'absolute', zIndex: 3, inset: portrait ? '18% 40px' : '12% 14%', borderRadius: 28, padding: '32px 40px', background: 'var(--panel)', border: '2px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
          <StepView step={a.today} m={m} portrait={portrait} k={`peek|${m.key}`} />
        </div>
      )}
    </>
  );
}

const STEP = { en: "Today's step", he: 'הצעד של היום' };

/** The advent's daily card ('Today's step'): text and / or a photo, the source under it (text only ever with a source). */
function StepView({ step, m, portrait, k }) {
  const photo = lookOf({ photo: step.photo }).photo;
  const hasText = !!(step.en || step.he);
  return (
    <div data-occ-step="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 24px' }}>
        <Label en={STEP.en} heText={STEP.he} color={ACC} size={28} />
        <span style={{ fontFamily: F.en, fontSize: 28, fontWeight: 500, color: SOFT_INK }}>{m.name.en || ''}</span>
        {m.name.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(28), fontWeight: 500, color: SOFT_INK }}>{m.name.he}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 32, alignItems: 'stretch' }}>
        {photo && <div style={{ flex: hasText ? (portrait ? '0 0 44%' : '0 0 44%') : 1, minHeight: 0, minWidth: 0, borderRadius: 20, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 6%, transparent)' }}><img src={photo} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>}
        {hasText && (
          <Fit key={`st|${k}`} wrap vcenter max={60} min={28} style={{ flex: 1, minHeight: 0, minWidth: 0, lineHeight: 1.32, textAlign: photo ? 'start' : 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.45em' }}>
              {step.en && <div dir={textDir(step.en)} style={{ fontFamily: textDir(step.en) === 'rtl' ? F.he : F.en, fontWeight: 500, color: 'var(--ink)', unicodeBidi: 'isolate' }}>{bidiNodes(step.en)}</div>}
              {step.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontWeight: 400, color: step.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.45 }}>{bidiNodes(step.he)}</div>}
            </div>
          </Fit>
        )}
      </div>
      {step.source && (
        <div data-occ-source="" dir="auto" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14, fontFamily: F.en, fontSize: 24, fontWeight: 500, color: SOFT_INK, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          <span aria-hidden style={{ flex: 'none', width: 24, height: 2, background: 'var(--line)' }} />
          <span style={{ minWidth: 0 }}><span style={{ letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600 }}>{COPY.source.en}</span>: {bidiNodes(step.source)}</span>
        </div>
      )}
    </div>
  );
}

/** One vort page with both languages, or one page per language when together they are long (420+ characters). */
function vortParts(ex) {
  if (ex.en && ex.he && [...ex.en].length + [...ex.he].length > 420) return [{ en: ex.en, he: '', source: ex.source }, { en: '', he: ex.he, source: ex.source }];
  return [ex];
}

/** Seconds to read an explanation from across the room (~130 words a minute, Hebrew a little slower), 10 to 45. */
function readSecs(ex) {
  const words = (t) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0);
  return Math.max(10, Math.min(45, Math.round(5 + words(ex.en) * 0.46 + words(ex.he) * 0.3)));
}

/**
 * When the worst content (60-character names, long event lines, a full coming-up strip) does not fit the panel, parts go
 * in order of least importance instead of anything being cut: 1 the coming-up strip, 2 the tick row and the tagline,
 * 3 the why text's source line, 4 the date range and everything a little smaller (the why text itself shrinks to 28 px, never goes). Measured in layout px after each page renders (and after fonts load).
 */
function squeezed(L, level) {
  if (!level) return L;
  const show = { ...L.show, coming: false };
  if (level >= 2) Object.assign(show, { pips: false, bar: false, tagline: false });
  if (level >= 3) show.whySource = false; // the 'Source: ...' line under the why text (never the text itself)
  if (level >= 4) show.dateRange = false; // then the multi-day range, and everything a little smaller
  return { ...L, show, k: level >= 4 ? (L.k || 1) * 0.84 : L.k };
}
function useSqueeze(ref, key) {
  const [level, setLevel] = useState(0);
  const at = useRef(key);
  const fresh = useRef(false); // re-measured from 0 once the fonts are in (fallback fonts are wider and over-squeeze)
  if (at.current !== key) { at.current = key; fresh.current = false; if (level) setLevel(0); }
  useLayoutEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el || !el.clientHeight) return;
      // the body, and each column (a crowded column overflows into the strip under it without growing the body)
      const over = [el, ...el.querySelectorAll('[data-occ-col]')].some((c) => c.clientHeight && c.scrollHeight > c.clientHeight + 2);
      if (over) setLevel((l) => (l < 4 ? l + 1 : l));
    };
    check();
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (!alive || fresh.current) return;
      fresh.current = true;
      if (document.fonts.status === 'loaded') setLevel(0); else check();
    }).catch(() => {});
    return () => { alive = false; };
  });
  return level;
}

/** Ticks on its own: each second while a countdown shows seconds (or a zero moment is near), else each 15 s. */
function useTick(offsetMs, fast) {
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));
  useEffect(() => {
    const ms = fast ? 1000 : 15000;
    let t;
    const tick = () => { setNow(new Date(Date.now() + offsetMs)); t = setTimeout(tick, ms - ((Date.now() + offsetMs) % ms) + 15); };
    t = setTimeout(tick, ms - ((Date.now() + offsetMs) % ms) + 15);
    return () => clearTimeout(t);
  }, [offsetMs, fast]);
  return now;
}

export default function OccasionSlide({ occasions, settings, cache, clockOffset = 0, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const [fast, setFast] = useState(false);
  const now = useTick(clockOffset, fast);
  const model = useMemo(() => {
    try { return slideModel(occasions, now, ctxFrom(settings, cache, now)); } catch { return null; }
  }, [occasions, settings, cache, now]);
  // tick each second only when it matters (the last hour, or the minute before zero / the zero moment)
  const wantFast = !!model?.rows.some((r) => r.form === 'minutes' || r.form === 'zero' || (r.form === 'hours' && r.countdown.hours < 1));
  useEffect(() => { if (wantFast !== fast) setFast(wantFast); }, [wantFast, fast]);

  // Pages: each occasion's countdown, and (when it has a sourced explanation) its vort page right after it. Several occasions
  // take turns (pick = cycle). Each page keeps its own time (the vort page: long enough to read it) and the slide asks the
  // rotation once for the time all the pages need, never a scroll. Layout 'source' off = no vort page (never a vort without it).
  const pages = useMemo(() => (model?.rows || []).flatMap((r) => [
    { m: r, view: 'main', secs: model.cycleSeconds },
    ...(r.advent?.today && r.form !== 'zero' ? [{ m: r, view: 'step', ex: r.advent.today, secs: Math.max(12, readSecs(r.advent.today)) }] : []),
    ...(r.explain && r.form !== 'zero' && shows(layoutOf(r.layout), 'source') ? vortParts(r.explain).map((ex) => ({ m: r, view: 'vort', ex, secs: readSecs(ex) })) : []),
  ]), [model]);
  const n = model?.rows.length || 0;
  const [page, setPage] = useState(0);
  const base = Number(slide?.duration) || 0;
  const keyList = pages.map((p) => `${p.m.key}:${p.view}:${p.ex ? `${p.ex.en ? 'e' : ''}${p.ex.he ? 'h' : ''}` : ''}`).join(',');
  const asked = useRef('');
  useEffect(() => { setPage(0); }, [keyList]);
  useEffect(() => {
    if (pages.length < 2) return undefined;
    const want = pages.reduce((t, p) => t + p.secs, 0) + 1;
    if (onRequestDuration && want > base && asked.current !== keyList) { asked.current = keyList; onRequestDuration(want); }
    const cur = pages[Math.min(page, pages.length - 1)];
    const t = setTimeout(() => setPage((x) => (x + 1) % pages.length), cur.secs * 1000);
    return () => clearTimeout(t);
  }, [keyList, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tap on the TV (when the admin lets the TV take touch: App sets --tt-pe:none when not): a small finite pop at the tap
  // point on the countdown, or a peek at today's advent card for 8 s. Swipes belong to the rotation; this only reads taps.
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const [pops, setPops] = useState([]);
  const [peek, setPeek] = useState(false);
  const lastTap = useRef(0);
  useEffect(() => { if (!peek) return undefined; const t = setTimeout(() => setPeek(false), 8000); return () => clearTimeout(t); }, [peek]);
  useEffect(() => { if (!pops.length) return undefined; const t = setTimeout(() => setPops([]), 900); return () => clearTimeout(t); }, [pops]);

  useSmallAccent(panelRef, [design.themeId, design.light, design.upNext, (model?.rows || []).map((r) => r.look?.accent || '').join()]);
  const squeeze = useSqueeze(bodyRef, `${keyList}|${page}|${(model?.rows || []).map((r) => r.form).join()}|${portrait}`);

  if (!model || !n) {
    return (
      <Panel pad="38px 60px">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Label en="Nothing to count down to right now" size={28} />
        </div>
      </Panel>
    );
  }
  const cur = pages[Math.min(page, pages.length - 1)] || { m: model.rows[0], view: 'main' };
  const m = cur.m;
  const L = squeezed(layoutOf(m.layout), squeeze);
  const look = lookOf(m.look);
  const font = numeralsStack(look.numeralsFont);
  const coming = model.coming;
  const at = model.rows.findIndex((r) => r.key === m.key);
  const pager = n > 1 ? `${at + 1} / ${n}` : '';
  const pad = portrait ? '42px 56px 38px' : '34px 64px 30px';
  const panelVars = look.accent ? { '--accentText': look.accent } : undefined;
  const nowMs = now.getTime();
  const lang = model.language;
  const advent = cur.view === 'main' && m.advent && m.form !== 'zero';
  const onTap = (e) => {
    if (m.touch === false || design.motion === 'minimal') return;
    const el = panelRef.current;
    if (!el) return;
    try { if (getComputedStyle(el).getPropertyValue('--tt-pe').trim() === 'none') return; } catch { /* no styles: allow */ }
    const t = Date.now();
    if (t - lastTap.current < 800) return;
    lastTap.current = t;
    if (advent && m.advent.today) { setPeek(true); return; }
    if (design.graphics === 'off') return;
    const r = el.getBoundingClientRect();
    const k = r.width / (el.offsetWidth || r.width || 1); // ScreenScaler: rect px -> layout px
    setPops([{ id: t, x: Math.round((e.clientX - r.left) / k), y: Math.round((e.clientY - r.top) / k) }]);
  };
  return (
    <Panel ref={panelRef} pad={pad} data-occ-form={m.form} data-occ-view={cur.view} data-occ-display={m.run ? 'run' : advent ? 'advent' : m.display || 'classic'} style={panelVars} onPointerUp={onTap}>
      {!advent && <Backdrop photo={look.photo} dim={look.dim} textSide={L.side === 'left' ? 'right' : 'left'} portrait={portrait} graphics={design.graphics} light={design.light} themeKey={`${design.themeId}|${look.accent}`} />}
      {!advent && <EdgeTicks graphics={design.graphics} side={L.side === 'left' ? 'left' : 'right'} />}
      {m.form === 'zero' && m.celebrate && <Confetti key={`c|${m.key}`} graphics={design.graphics} motion={design.motion} />}
      {pops.map((p) => <TapPop key={p.id} x={p.x} y={p.y} />)}
      {advent ? <AdventMain m={m} L={L} portrait={portrait} font={font} pager={pager} nowMs={nowMs} fast={fast} lang={lang} peek={peek} /> : (
        <div ref={bodyRef} style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Header pager={pager} />
          {cur.view === 'vort' ? <VortView m={m} ex={cur.ex} portrait={portrait} font={font} lang={lang} />
            : cur.view === 'step' ? <StepView step={cur.ex} m={m} portrait={portrait} k={m.key} />
            : m.form === 'zero' ? <ZeroView m={m} L={L} portrait={portrait} />
            : m.form === 'day' && !m.run ? <DayView m={m} L={L} portrait={portrait} coming={coming} lang={lang} />
              : <CountView m={m} L={L} portrait={portrait} coming={coming} font={font} nowMs={nowMs} fast={fast} lang={lang} />}
        </div>
      )}
    </Panel>
  );
}
