import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { layoutOf, lookOf, orderedBlocks, shows, scaled, numeralsStack } from '../../design/useLayout.js';
import { YearsBadge, YEARS_HEAD, Label, BigNum, Backdrop, PhotoPane, PHOTO_SHARE, TickLine, TapPop, LABEL_INK, SOFT_INK, ACC, useSmallAccent, WHY_LABEL, inLang, primary, FORM_COPY, Kicker, ActHead, SourceLine, StoryText, PageDots, READ, FormDots, daysAndFraction, whenOnly, useNumMetrics, Digits, SUFFIX_STYLE } from './occasionParts.jsx';
import { Confetti } from './BirthdaysSlide.jsx';
import { textDir } from '../../../shared/bidi.js';
import { slideModel, ctxFrom, COPY, FAR_DAYS } from '../../../shared/occasions.js';
import { hypeOf } from '../../../shared/occasionHype.js';
import { Stage } from '../../stage/Stage.jsx';
import { recipeOf } from '../../stage/styles.js';
import { actsFor, readSecs } from '../../stage/acts.js';

/**
 * The Countdown page (OCCASION), redesigned 2026-11 as ONE STAGE with acts (src/screen/stage/):
 *   main   the hero: the number is the star; its unit label, the name (Hebrew heading, English quiet), one 'Begins' line
 *   facts  the day: THE DAY / HEBREW DATE / BEGINS (/ WHAT'S ON), English left and Hebrew right, same scale
 *   why    'Why we celebrate' as a pull quote with its source (the style's reveal: the flagship unrolls a plain paper scroll)
 *   step   the advent's today's step (reveal)
 *   vort   the story (the long sourced explanation; reveal)
 *   coming the 'Coming up' list
 * The rail at the top stays for every act (today's date in the hero; the name, today's date and the compact count in the
 * others) with ONE hairline carrying the progress. The number and the name are single shared elements that glide between
 * their hero places and the rail (transform only). The hype level (src/shared/occasionHype.js) raises the energy as the
 * day nears: a warmer accent, a punchier number entrance and a settle, one-shot pops on each change in the last day,
 * static spark marks, a rail flash on each level change, shorter hero turns; all finite, all off on Minimal motion.
 * Layout switches: name / hebrewName (the name lines), date / begins / event (facts rows; begins also the hero line), why,
 * source (the story act), tagline (the hero kicker), ring / pips / bar (the rail progress), coming (the Coming up act), today
 * (the rail's date). Roles and font roles only; nothing loops; no blur or blend. Portrait and landscape.
 */

const GUT = 80;
const isShort = (name) => [...(name?.he || '')].length <= 8 && [...(name?.en || '')].length <= 14;
const isLong = (name) => [...(name?.he || '')].length > 16 || [...(name?.en || '')].length > 24;
const hasText = (x) => !!(x && (x.en || x.he));
const textOf = (x) => (hasText(x) ? x : null);
/** Fact labels (Hebrew wording: native speaker to confirm). */
const FACT = Object.freeze({
  day: { en: 'The day', he: 'התאריך' }, hebrew: { en: 'Hebrew date', he: 'תאריך עברי' },
  begins: { en: 'Begins', he: 'מתחיל' }, event: { en: "What's on", he: 'מה מתוכנן' },
});
const STORY = Object.freeze({ en: 'The story', he: 'הסיפור' });
const STEP = Object.freeze({ en: "Today's step", he: 'הצעד של היום' });

/** Name boxes (canvas px): [Hebrew max, min, box height, English max, min, box height]. */
const NAME = {
  side: [96, 48, 132, 38, 28, 54], sideLong: [62, 34, 170, 32, 26, 84], sideShort: [116, 56, 152, 40, 28, 56],
  stack: [112, 52, 150, 42, 28, 58], stackLong: [74, 36, 196, 34, 26, 92], stackShort: [136, 60, 176, 46, 30, 62],
  day: [168, 56, 220, 52, 32, 70], dayLong: [100, 40, 236, 40, 28, 104], dayPort: [176, 56, 260, 56, 32, 76], dayPortLong: [110, 42, 290, 42, 28, 116],
  small: [92, 40, 124, 40, 28, 60],
};

/** The name: Hebrew heading (display role) over a thinner English line; each auto-fitted, allowed to wrap, never cut. */
function Name({ name, L, size, align, k, width, compact = false, trans = 'none' }) {
  const heOn = shows(L, 'hebrewName') && !!name.he;
  const enOn = shows(L, 'name') && !!name.en;
  if (!heOn && !enOn) return null;
  const ta = align === 'center' ? 'center' : 'left';
  const [hMax, hMin, hBox, eMax, eMin, eBox] = size;
  return (
    <div data-occ-name="" data-occ-block="name" style={{ width, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {heOn && (
        <Fit key={`nh|${k}|${hMax}|${hBox}|${width}`} wrap vcenter dir="rtl" max={scaled(hMax, L)} min={hMin} className="tt-he" style={{
          flex: 'none', width: '100%', height: hBox, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, textAlign: ta,
        }}>{name.he}</Fit>
      )}
      {enOn && (
        <Fit key={`ne|${k}|${eMax}|${eBox}|${heOn}|${width}`} wrap vcenter dir={textDir(name.en)} max={scaled(heOn ? eMax : hMax * 0.8, L)} min={eMin} style={{
          flex: 'none', width: '100%', height: heOn ? eBox : hBox, overflow: 'visible', fontFamily: F.enD, fontWeight: heOn ? 400 : 700,
          letterSpacing: heOn ? '.005em' : '-.01em', color: heOn ? SOFT_INK : 'var(--ink)', lineHeight: 1.12, textAlign: ta,
          opacity: compact && heOn ? 0 : 1, transition: trans === 'none' ? 'none' : 'opacity 300ms ease-out',
        }}>{name.en}</Fit>
      )}
    </div>
  );
}
const nameHeight = (name, L, size) => {
  const heOn = shows(L, 'hebrewName') && !!name.he; const enOn = shows(L, 'name') && !!name.en;
  if (!heOn && !enOn) return { h: 0, box: 0 };
  return { h: (heOn ? size[2] : 0) + (enOn ? (heOn ? size[5] : size[2]) : 0) + (heOn && enOn ? 4 : 0), box: size[2] };
};

/** The name inside an act, for names too long for the rail: Hebrew display + English, small (`compact`: on the paper). */
function NameLine({ name, L, lang, compact = false }) {
  const n = inLang(name, lang);
  const heOn = shows(L, 'hebrewName') && n.he; const enOn = shows(L, 'name') && n.en;
  if (!heOn && !enOn) return null;
  return (
    <div data-occ-nameline="" data-s="" style={{ '--i': 0, flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 22px', marginBottom: compact ? 0 : 8, lineHeight: 1.22 }}>
      {heOn && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(compact ? 32 : 40), fontWeight: 700 }}>{n.he}</span>}
      {enOn && <span dir={textDir(n.en)} style={{ fontFamily: F.enD, fontSize: compact ? 26 : 30, fontWeight: 400, color: SOFT_INK }}>{bidiNodes(n.en)}</span>}
    </div>
  );
}

/** 'Sunday, November 29': the weekday may wrap, 'November 29' (and '19 Kislev 5787') never splits. */
function DatePart({ t }) {
  const i = t.indexOf(', ');
  if (i < 0) return <span style={{ whiteSpace: 'nowrap' }}>{t}</span>;
  return <>{t.slice(0, i + 1)} <span style={{ whiteSpace: 'nowrap' }}>{t.slice(i + 2)}</span></>;
}

/**
 * The unit under the big number. With the model's `dates.toGoLabel` the days read 'DAYS UNTIL IT BEGINS' (the countdown runs
 * to the EVENING BEFORE the day, so a bare 'days to go' next to the day's own date was off by one); without it the old words.
 */
function unitWords(m, lang, n = m.countdown?.days) {
  const tg = inLang(m.dates?.toGoLabel, lang);
  if ((m.form !== 'far' && m.form !== 'days') || !hasText(tg) || !m.countdown) return m.words.unit;
  const noun = n === 1 ? COPY.day : COPY.days;
  // the number is days to the DAY itself, so the caption is 'days to go' (the 'Begins ... evening' line says when it starts)
  return inLang({ en: `${noun.en} ${COPY.toGo.en}`, he: `${COPY.toGo.he} ${noun.he}` }, lang);
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

/** Flip-clock cells of height `h`: tabular condensed digits, a hairline split, each cell turns in once when its value changes. */
function FlipRow({ cells, font, h, lang }) {
  return (
    <div data-occ-flip={cells.length} style={{ display: 'flex', gap: 14 }}>
      {cells.map((c) => {
        const l = primary(c.label, lang);
        return (
          <div key={c.k} data-occ-cell={c.k} style={{ flex: 'none', width: Math.round(h * (c.v.length > 2 ? 1.1 : 0.82)), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: '100%', height: h, borderRadius: Math.round(h * 0.07), border: '2px solid var(--line)', background: 'color-mix(in srgb, var(--ink) 5%, transparent)', overflow: 'hidden', padding: '0 8%' }}>
              <BigNum text={c.v} max={Math.round(h * 0.84)} min={30} height={h - 8} font={font} align="center" flip />
              <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 'calc(50% - 1px)', height: 2, background: 'var(--panel)' }} />
            </div>
            <Label en={l.en} heText={l.he} size={24} color={SOFT_INK} style={{ justifyContent: 'center', textAlign: 'center' }} />
          </div>
        );
      })}
    </div>
  );
}

// ── cycled countdown forms (a tap on the number, or auto mode, steps through row.forms) ──
export const FORM_IDS = Object.freeze(['days', 'daysFraction', 'hours', 'flip', 'percent', 'sleeps']);
/**
 * The forms a countdown page may cycle through. Only the lead-up forms cycle ('far' / 'days'): the last day, the last hour and
 * zero keep their own displays (seconds and the zero moment are never hidden by a cycled form). Every cycled form is worked
 * out from the exact begin time; without one (approximate time) only 'days' is offered. A model without `forms` = no cycling.
 */
export function formsFor(m) {
  if (!m || !Array.isArray(m.forms) || m.run || m.advent || (m.form !== 'far' && m.form !== 'days')) return [];
  const exact = Number.isFinite(Number(m.beginMs)) && !m.countdown?.approx;
  const list = [...new Set(m.forms.filter((f) => FORM_IDS.includes(f)))];
  const out = exact ? list : list.filter((f) => f === 'days');
  return out.length > 1 || (out.length === 1 && out[0] !== 'days') ? out : [];
}
const lastDayLeft = (m, nowMs) => Math.max(0, Number(m.beginMs) - nowMs);
const dayLeft = (m, nowMs) => Math.max(0, (Number(m.dayMs) || Number(m.beginMs)) - nowMs); // to the DAY itself

/** The numerals + label of one cycled form: { big, suffix, unit, bar } (rounded DOWN everywhere: never more time than is left). */
function formWords(f, m, nowMs, lang) {
  const rem = lastDayLeft(m, nowMs);
  if (f === 'daysFraction') {
    const { whole, glyph } = daysAndFraction(dayLeft(m, nowMs));
    return { big: String(whole), suffix: glyph, unit: unitWords(m, lang, glyph ? 0 : whole) };
  }
  if (f === 'hours') {
    const h = Math.floor(rem / 3600000);
    const tg = inLang(m.dates?.toGoLabel, lang);
    return { big: String(h), suffix: '', unit: inLang({ en: tg?.en ? `${h === 1 ? COPY.hour.en : COPY.hours.en} ${tg.en}` : (h === 1 ? COPY.hour.en : COPY.hours.en), he: tg?.he ? `${h === 1 ? COPY.hour.he : COPY.hours.he} ${tg.he}` : (h === 1 ? COPY.hour.he : COPY.hours.he) }, lang) };
  }
  if (f === 'percent') {
    const leadMs = Math.max(1, (m.leadDays || m.lead?.days || 30) * 86400000);
    const frac = Math.min(0.99, Math.max(0, 1 - rem / leadMs));
    return { big: String(Math.floor(frac * 100)), suffix: '%', unit: inLang(FORM_COPY.percent, lang), bar: frac };
  }
  if (f === 'sleeps') {
    const n = m.countdown?.days ?? 0;
    return { big: String(n), suffix: '', unit: inLang(n === 1 ? FORM_COPY.sleep : FORM_COPY.sleeps, lang) };
  }
  return null;
}

/**
 * What the hero number says now: { kind: 'digits' | 'flip' | 'run', big, suffix, unit, sub, cells, bar }.
 * The final minute (hype 5) puts the SECONDS alone in the hero place.
 */
function heroCount(m, formId, nowMs, fast, lang, level) {
  if (m.run) {
    const r = m.run; const left = Math.max(0, r.n - r.k);
    return { kind: 'run', big: String(r.k), unit: { en: lang === 'hebrew' ? '' : `${COPY.dayOf.en} ${r.k} ${COPY.of.en} ${r.n}`, he: lang === 'english' ? '' : `${COPY.dayOf.he} ${r.k} ${COPY.of.he} ${r.n}` },
      sub: left > 0 ? { en: `${left} ${left === 1 ? COPY.day.en : COPY.days.en} ${COPY.toGo.en}`, he: `${COPY.toGo.he} ${left} ${left === 1 ? COPY.day.he : COPY.days.he}` } : null };
  }
  if (formId !== 'days' && formId !== 'flip') {
    const fw = formWords(formId, m, nowMs, lang);
    if (fw) return { kind: 'digits', big: fw.big, suffix: fw.suffix, unit: fw.unit, bar: fw.bar };
  }
  if (m.display === 'flip' || formId === 'flip') {
    const cells = flipCells(m, nowMs, fast);
    if (cells.length) return { kind: 'flip', cells, unit: hasText(inLang(m.dates?.toGoLabel, lang)) ? inLang(m.dates.toGoLabel, lang) : null };
  }
  if (level >= 5 && m.form === 'minutes' && m.countdown?.seconds != null && !m.countdown.minutes) {
    return { kind: 'digits', big: String(m.countdown.seconds), unit: inLang(SECONDS, lang) };
  }
  return { kind: 'digits', big: m.words.big, suffix: '', unit: unitWords(m, lang), sub: m.words.sub };
}

/** One quiet line: 'Begins Saturday evening · Shkia 4:30 PM' (one language; the facts act carries both). */
const splitWhen = (t) => { const i = String(t || '').lastIndexOf(' · '); return i < 0 ? ['', String(t || '')] : [t.slice(0, i), t.slice(i + 3)]; };
function BeginsLine({ m, lang, center }) {
  const d = m.dates && typeof m.dates === 'object' ? m.dates : null;
  let a; let b;
  if (hasText(d?.beginsLine)) { const l = primary(d.beginsLine, lang); const t = primary(d.beginsAt || {}, lang); a = l.en || l.he; b = l.en ? t.en : t.he; }
  else if (m.begins) { const p = primary(m.begins, lang); [a, b] = splitWhen(p.en || p.he); }
  else return null;
  const rtl = textDir(a || b) === 'rtl';
  const fam = rtl ? F.he : F.en;
  const fs = rtl ? he(30) : 28;
  return (
    <div data-occ-begins="" data-occ-block="begins" style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: 6 }}>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px', alignItems: 'baseline', justifyContent: center ? 'center' : 'flex-start', lineHeight: 1.28 }}>
        {a && <span className={rtl ? 'tt-he' : undefined} style={{ fontFamily: fam, fontSize: fs, fontWeight: 500, color: SOFT_INK }}>{a}</span>}
        {b && <span className={rtl ? 'tt-he' : 'tt-num'} style={{ fontFamily: fam, fontSize: fs, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{b}</span>}
      </div>
      {m.approx && <Label en={`~ ${COPY.approx.en}`} heText={lang === 'english' ? '' : COPY.approx.he} color={SOFT_INK} />}
    </div>
  );
}

/** Small static spark marks around the number's corner: they appear ONCE (hype 2+, more per level), then stay still. */
function Sparks({ level, intensity, x, y }) {
  const n = Math.min(9, Math.round((level - 1) * 1.5 * intensity) + 2);
  return (
    <div aria-hidden data-occ-sparks={n} style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, pointerEvents: 'none' }}>
      {Array.from({ length: n }, (_, i) => {
        const deg = -104 + (i / Math.max(1, n - 1)) * 62; // a fan of short rays, up from the number's top right corner (clear of the divider)
        const a = (deg * Math.PI) / 180;
        const r = 18; const len = i % 2 ? 18 : 30;
        return <span key={i} className="tt-spark" style={{ position: 'absolute', left: Math.round(Math.cos(a) * r), top: Math.round(Math.sin(a) * r) - 2, width: len, height: 4, borderRadius: 2, background: 'var(--accentText)', transform: `rotate(${Math.round(deg)}deg)`, transformOrigin: '0 50%', '--i': i, '--sr': `${Math.round(deg)}deg`, '--sx': `${Math.round(-Math.cos(a) * 10)}px`, '--sy': `${Math.round(-Math.sin(a) * 10)}px` }} />;
      })}
    </div>
  );
}

/** The hero act while counting: [number | unit · name · begins] side by side (landscape), or stacked (portrait / centre / photo). */
function HeroAct({ geo, m, L, lang, hc, stack, center, forms, formAt, hype, graphics, numFirst = false }) {
  const tag = shows(L, 'tagline') ? textOf(m.stageText) : null;
  const t = tag ? primary(tag, lang) : null;
  const u = primary(hc.unit, lang); const sub = hc.sub ? primary(hc.sub, lang) : null;
  const al = center ? 'center' : 'flex-start';
  const unit = (
    <div data-s="" data-occ-block="count" style={{ '--i': 1, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: al, gap: 6 }}>
      {hasText(u) && <Label en={u.en} heText={u.he} color={SOFT_INK} data-occ-unit="" style={{ justifyContent: al }} />}
      {hasText(sub) && <Label en={sub.en} heText={sub.he} color={LABEL_INK} style={{ justifyContent: al }} />}
      {forms.length > 1 && <div style={{ marginTop: 6, width: '100%' }}><FormDots n={forms.length} at={Math.min(formAt, forms.length - 1)} center={center} /></div>}
    </div>
  );
  const begins = shows(L, 'begins') ? <div data-s="" style={{ '--i': 2 }}><BeginsLine m={m} lang={lang} center={center} /></div> : null;
  const sparks = hype.level >= 2 && graphics !== 'off' && geo.num ? <Sparks level={hype.level} intensity={hype.intensity} x={geo.num.w - 6} y={-8} /> : null;
  const kicker = t && hasText(t) ? <div data-s="" style={{ '--i': 0, flex: 'none', marginBottom: stack ? 28 : 36, display: 'flex', justifyContent: al }}><Kicker en={t.en} heText={t.he} center={center} data-occ-tagline="" data-occ-block="tagline" /></div> : null;
  if (stack) {
    return (
      <div data-occ-col="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center', alignItems: al }}>
        {kicker}
        {!numFirst && geo.name && <div data-slot="name" style={{ flex: 'none', width: geo.name.w, height: geo.name.h }} />}
        <div style={{ position: 'relative', flex: 'none', marginTop: numFirst ? 0 : 40 }}>
          {geo.num && <div data-slot="num" style={{ width: geo.num.w, height: geo.num.h }} />}
          {sparks}
        </div>
        <div style={{ height: 22, flex: 'none' }} />
        {unit}
        {/* beside a photo the number leads (it is the star), then the name */}
        {numFirst && geo.name && <div data-slot="name" style={{ flex: 'none', marginTop: 30, width: geo.name.w, height: geo.name.h }} />}
        <div style={{ height: numFirst ? 22 : 28, flex: 'none' }} />
        {begins}
      </div>
    );
  }
  const left = L.side !== 'right';
  return (
    <div data-occ-col="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center' }}>
      {kicker}
      <div style={{ position: 'relative', flex: 'none', display: 'flex', flexDirection: left ? 'row' : 'row-reverse', gap: GUT, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', flex: 'none' }}>
          {geo.num && <div data-slot="num" style={{ width: geo.num.w, height: geo.num.h }} />}
          {sparks}
        </div>
        <div data-occ-col="" style={{ position: 'relative', flex: '1 1 0', minWidth: 0, minHeight: geo.num?.h || 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20 }}>
          {/* the set's one divider: a hairline with an accent head, drawn once (it stands between the number and its words) */}
          <span aria-hidden className="tt-rule-in" style={{ position: 'absolute', [left ? 'left' : 'right']: -(GUT / 2) - 1, top: 0, bottom: 0, width: 2, background: 'var(--line)' }}>
            <span style={{ position: 'absolute', left: -1, top: 0, width: 4, height: 56, borderRadius: 2, background: 'var(--accentText)' }} />
          </span>
          {unit}
          {geo.name && <div data-slot="name" style={{ flex: 'none', width: geo.name.w, height: geo.name.h }} />}
          {begins || <span />}
        </div>
      </div>
    </div>
  );
}

/** The hero act on the day itself: 'Today is', the name very large, 'Day 1 of 2' and the event line. */
function DayAct({ geo, m, L, lang, center }) {
  const dl = primary(m.dayLabel, lang);
  const di = m.dayIndex;
  const ev = shows(L, 'event') ? inLang(m.event, lang) : null;
  const al = center ? 'center' : 'flex-start';
  return (
    <div data-occ-col="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center', alignItems: al, textAlign: center ? 'center' : 'start' }}>
      {hasText(dl) && <div data-s="" style={{ '--i': 0, marginBottom: 20 }}><Kicker en={dl.en} heText={dl.he} center={center} data-occ-block="kicker" /></div>}
      {geo.name && <div data-slot="name" style={{ flex: 'none', width: geo.name.w, height: geo.name.h }} />}
      <div data-s="" data-occ-block="meta" style={{ '--i': 1, marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: al, gap: 12 }}>
        {di && <Label en={lang === 'hebrew' ? '' : `${COPY.dayOf.en} ${di.k} ${COPY.of.en} ${di.n}`} heText={lang === 'english' ? '' : `${COPY.dayOf.he} ${di.k} ${COPY.of.he} ${di.n}`} color={SOFT_INK} data-occ-dayof="" />}
        {hasText(ev) && (
          <div data-occ-event="" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: al, maxWidth: '100%' }}>
            {ev.en && <div dir={textDir(ev.en)} style={{ fontFamily: textDir(ev.en) === 'rtl' ? F.he : F.en, fontSize: 34, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>{bidiNodes(ev.en)}</div>}
            {ev.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(32), fontWeight: 500, color: ev.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{bidiNodes(ev.he)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Zero: the greeting very large (a finite confetti burst falls from the panel), then the name. */
function ZeroAct({ geo, m, L, portrait }) {
  const z = m.zero || {};
  return (
    <div data-occ-col="" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', gap: portrait ? 18 : 10, textAlign: 'center' }}>
      {z.he && <Fit key={`zh|${m.key}|${portrait}`} className="tt-he tt-bd-hero" wrap vcenter dir="rtl" max={scaled(portrait ? 210 : 170, L)} min={64} style={{ flex: 'none', width: '100%', height: portrait ? 300 : 214, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: ACC, lineHeight: 1.25, textAlign: 'center' }}>{z.he}</Fit>}
      {z.en && <Fit key={`ze|${m.key}|${portrait}`} className="tt-bd-up" wrap vcenter max={scaled(portrait ? 104 : 84, L)} min={44} style={{ '--t': '500ms', flex: 'none', width: '100%', height: portrait ? 180 : 124, overflow: 'visible', fontFamily: F.enD, fontWeight: z.he ? 400 : 700, color: z.he ? 'var(--ink)' : ACC, lineHeight: 1.1, textAlign: 'center' }}>{z.en}</Fit>}
      {geo.name && <div data-slot="name" style={{ flex: 'none', marginTop: 24, width: geo.name.w, height: geo.name.h }} />}
    </div>
  );
}

/** One cell of the facts act: a small-caps label, a headline (display role), quiet lines under it. */
function FactCell({ label, head, headHe = false, date = false, big = false, subs = [], k, end = false, attr, i = 1 }) {
  if (!head && !subs.some((x) => x && x.t)) return null;
  const hs = Math.max(28, Math.round((big ? 56 : 40) * k));
  const ss = Math.max(24, Math.round(30 * k));
  const al = end ? 'flex-end' : 'flex-start';
  return (
    <div {...attr} data-s="" style={{ '--i': i, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: al, gap: 8, textAlign: end ? 'end' : 'start' }}>
      {(label.en || label.he) && <Label en={label.en} heText={label.he} />}
      {head && (
        <div className={headHe ? 'tt-he' : undefined} dir={headHe ? 'rtl' : textDir(head)} style={{ maxWidth: '100%', fontFamily: headHe ? F.heD : F.enD, fontSize: headHe ? he(hs) : hs, fontWeight: big ? (headHe ? 700 : 600) : 500, letterSpacing: headHe ? 0 : '-.01em', color: 'var(--ink)', lineHeight: 1.16, overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>
          {headHe ? head : date ? <DatePart t={head} /> : bidiNodes(head)}
        </div>
      )}
      {subs.filter((x) => x && x.t).map((x, j) => (
        <div key={j} className={x.he ? 'tt-he' : x.num ? 'tt-num' : undefined} dir={x.he ? 'rtl' : textDir(x.t)} style={{ maxWidth: '100%', fontFamily: x.he ? F.he : F.en, fontSize: x.strong ? Math.max(28, Math.round(44 * k)) : x.he ? he(ss) : ss, fontWeight: x.strong ? 600 : 500, color: x.strong ? 'var(--ink)' : SOFT_INK, lineHeight: 1.26, overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>{x.he ? x.t : bidiNodes(x.t)}</div>
      ))}
    </div>
  );
}

/**
 * The facts act ('The day'): the civil day and its Hebrew date as two headlines (English left, Hebrew right), then under one
 * hairline when it begins (the zman large) and what is on. One language: the same grid in that language (Hebrew runs right
 * to left). Sizes follow the layout scale, so the squeeze makes a crowded act smaller instead of cutting anything.
 */
function FactsAct({ m, L, lang, portrait, long }) {
  const d = m.dates && typeof m.dates === 'object' ? m.dates : null;
  const L2 = (x) => inLang(x, lang) || { en: '', he: '' };
  const rtl = lang === 'hebrew';
  const both = lang === 'both';
  const k = (L.k || 1) * (L.cs || 1);
  const lab = (x) => (rtl ? { en: '', he: x.he } : { en: x.en, he: '' });
  const keys = new Set(orderedBlocks(L));
  const top = []; const low = [];
  if (keys.has('date') && d) {
    const day = L2(d.day); const heb = L2(d.hebrew); const rg = shows(L, 'dateRange') ? L2(d.dayRange) : { en: '', he: '' };
    if (hasText(day)) top.push(rtl || !day.en ? { label: lab(FACT.day), head: day.he, headHe: true, subs: [{ t: rg.he, he: true }] } : { label: lab(FACT.day), head: day.en, date: true, subs: [{ t: rg.en, num: true }] });
    if (hasText(heb)) top.push(heb.he ? { label: lab(FACT.hebrew), head: heb.he, headHe: true, subs: [{ t: heb.en }], end: both && !portrait } : { label: lab(FACT.hebrew), head: heb.en });
  } else if (keys.has('date') && hasText(m.hebrewDate)) {
    const h = L2(m.hebrewDate);
    top.push(h.he ? { label: lab(FACT.hebrew), head: h.he, headHe: true, subs: [{ t: h.en }] } : { label: lab(FACT.hebrew), head: h.en });
  }
  if (keys.has('begins') && m.form !== 'day' && d && hasText(d.beginsLine)) {
    const l = L2(d.beginsLine); const t = L2(d.beginsAt || {});
    const j = (a, b) => [whenOnly(a), b].filter(Boolean).join(' · ');
    low.push(l.en
      ? { label: lab(FACT.begins), head: whenOnly(l.en), subs: [{ t: t.en, strong: true, num: true }, { t: l.he ? j(l.he, t.he) : '', he: true }], attr: { 'data-occ-fact-begins': '' } }
      : { label: lab(FACT.begins), head: whenOnly(l.he), headHe: true, subs: [{ t: t.he, strong: true, he: true }], attr: { 'data-occ-fact-begins': '' } });
  }
  if (keys.has('event') && m.form !== 'day' && hasText(m.event)) {
    const e = L2(m.event);
    low.push(e.en ? { label: lab(FACT.event), head: e.en, subs: [{ t: e.he, he: true }], attr: { 'data-occ-event': '' } } : { label: lab(FACT.event), head: e.he, headHe: true, attr: { 'data-occ-event': '' } });
  }
  const grid = (n) => ({ display: 'grid', gridTemplateColumns: portrait || n < 2 ? 'minmax(0, 1fr)' : 'minmax(0, max-content) minmax(0, max-content)', justifyContent: 'space-between', columnGap: 48, rowGap: Math.max(10, Math.round(26 * k)), alignItems: 'start' });
  return (
    <div data-occ-col="" data-occ-facts="" data-occ-block="facts" dir={rtl ? 'rtl' : 'ltr'} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: portrait ? 30 : 26 }}>
      <ActHead en={rtl ? '' : FACT.day.en} heText={rtl ? FACT.day.he : ''} />
      {long && shows(L, 'actName') && <NameLine name={m.name} L={L} lang={lang} compact />}
      <div data-occ-col="" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center', gap: Math.max(10, Math.round((portrait ? 30 : 28) * k)) }}>
        {top.length > 0 && <div data-occ-date="" style={grid(top.length)}>{top.map((c, i) => <FactCell key={i} {...c} label={{ en: '', he: '' }} big k={k} i={i + 1} />)}</div>}
        {top.length > 0 && low.length > 0 && <span aria-hidden data-s="" style={{ '--i': 3, flex: 'none', height: 2, background: 'var(--line)' }} />}
        {low.length > 0 && <div style={grid(low.length)}>{low.map((c, i) => <FactCell key={i} {...c} k={k} i={i + 3} />)}</div>}
      </div>
    </div>
  );
}

/**
 * The milestone act ('40 years', 'the 40th year'): the number set very large with its Hebrew letters and words. Comes right after the
 * hero for a milestone (7-10 seconds); the story act that follows carries its vort.
 */
function YearsAct({ m, L, lang, portrait, long }) {
  const y = m.years; const w = y?.words;
  if (!y?.tier || !w) return null;
  const major = y.tier === 'major';
  const kick = inLang(w.kicker, lang); const line = inLang(w.line, lang);
  const rtl = lang === 'hebrew';
  return (
    <div data-occ-col="" data-occ-years-act="" data-occ-block="years" data-occ-years-tier={y.tier} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: portrait ? 24 : 18 }}>
      <ActHead en={rtl ? '' : YEARS_HEAD.en} heText={rtl ? YEARS_HEAD.he : ''} />
      {long && shows(L, 'actName') && <NameLine name={m.name} L={L} lang={lang} compact />}
      <div data-occ-col="" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', gap: portrait ? 16 : 10, textAlign: 'center' }}>
        {hasText(kick) && <div data-s="" style={{ '--i': 1, flex: 'none' }}><Label en={kick.en} heText={kick.he} color={ACC} size={major ? 34 : 28} style={{ justifyContent: 'center' }} /></div>}
        <Fit key={`yn|${m.key}|${w.big}|${portrait}`} data-s="" vcenter max={major ? (portrait ? 330 : 250) : (portrait ? 210 : 200)} min={100} style={{
          '--i': 2, flex: 'none', width: '100%', height: major ? (portrait ? 380 : 270) : (portrait ? 250 : 210), display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: F.enD, fontWeight: 800, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-.04em', fontVariantNumeric: 'lining-nums',
        }}>{w.big}</Fit>
        {/* the Hebrew letters and the words share one row on a wide screen (the paper is short there) */}
        <div style={{ flex: 'none', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: portrait ? 6 : 36 }}>
          {lang !== 'english' && w.letters && <div data-s="" className="tt-he" dir="rtl" style={{ '--i': 3, flex: 'none', fontFamily: F.heD, fontWeight: 700, fontSize: Math.round((major ? 76 : 60) * (L.k || 1)), color: ACC, lineHeight: 1.1 }}>{w.letters}</div>}
          {hasText(line) && <div data-s="" dir={line.en ? 'ltr' : 'rtl'} className={line.en ? undefined : 'tt-he'} style={{ '--i': 4, flex: 'none', fontFamily: line.en ? F.enD : F.heD, fontWeight: 500, fontSize: Math.round((portrait ? 44 : 48) * (L.k || 1)), color: SOFT_INK, lineHeight: 1.15 }}>{line.en || line.he}</div>}
        </div>
      </div>
    </div>
  );
}

/** The foot of a reading act: the source on one side, the page dots of a paged text on the other. */
function ReadFoot({ source, pg, attr, i = 2 }) {
  if (!source && !(pg.n > 1)) return null;
  return (
    <div data-s="" style={{ '--i': i, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, minWidth: 0 }}>
      {source ? <SourceLine text={source} {...attr} /> : <span />}
      {pg.n > 1 && <div style={{ flex: 'none' }}><PageDots n={pg.n} at={pg.at} /></div>}
    </div>
  );
}

/** 'Why we celebrate': the short sourced line, set large in the reading roles, English beside Hebrew (landscape), its source under it. */
function WhyAct({ m, L, lang, portrait, long, holdMs }) {
  const [pg, setPg] = useState({ n: 1, at: 0 });
  const w = inLang(m.why, lang);
  if (!hasText(w)) return null;
  const src = m.why.source && shows(L, 'whySource') ? String(m.why.source) : '';
  return (
    <div data-occ-col="" data-occ-why="" data-occ-block="why" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ActHead en={lang === 'hebrew' ? '' : WHY_LABEL.en} heText={lang === 'hebrew' ? WHY_LABEL.he : ''} />
      {long && shows(L, 'actName') && <NameLine name={m.name} L={L} lang={lang} compact />}
      <StoryText key={`w|${m.key}|${lang}`} en={w.en} he={w.he} cols={!portrait} max={Math.round(58 * (L.k || 1))} min={28} holdMs={holdMs} onPages={(n, at) => setPg((o) => (o.n === n && o.at === at ? o : { n, at }))} data-occ-why-text="" data-s="" />
      <ReadFoot source={src} pg={pg} attr={{ 'data-occ-why-source': '' }} />
    </div>
  );
}

/** The story act: the long sourced explanation in the reading roles; fitted, and paged when it is longer than the paper (never cut). */
function VortAct({ m, ex, L, lang, portrait, long, holdMs }) {
  const [pg, setPg] = useState({ n: 1, at: 0 });
  return (
    <div data-occ-col="" data-occ-explain="" data-occ-block="story" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ActHead en={lang === 'hebrew' ? '' : STORY.en} heText={lang === 'hebrew' ? STORY.he : ''} />
      {long && shows(L, 'actName') && <NameLine name={m.name} L={L} lang={lang} compact />}
      <StoryText key={`x|${m.key}|${ex.en ? 'e' : ''}${ex.he ? 'h' : ''}`} en={ex.en} he={ex.he} cols={!portrait} max={Math.round(46 * (L.k || 1))} min={28} holdMs={holdMs} onPages={(n, at) => setPg((o) => (o.n === n && o.at === at ? o : { n, at }))} enStyle={{ whiteSpace: 'pre-line' }} heStyle={{ whiteSpace: 'pre-line' }} data-s="" />
      <ReadFoot source={ex.source} pg={pg} attr={{ 'data-occ-source': '' }} />
    </div>
  );
}

/** The advent's daily card ('Today's step'): text and / or a photo, the source under it (text only ever with a source). */
function StepView({ step, portrait, k }) {
  const photo = lookOf({ photo: step.photo }).photo;
  const txt = !!(step.en || step.he);
  return (
    <div data-occ-step="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ActHead en={STEP.en} heText={STEP.he} />
      <div data-s="" style={{ '--i': 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 32, alignItems: 'stretch' }}>
        {photo && <div style={{ flex: txt ? '0 0 44%' : 1, minHeight: 0, minWidth: 0, borderRadius: 16, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 6%, transparent)' }}><img src={photo} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>}
        {txt && (
          <Fit key={`st|${k}`} wrap vcenter max={56} min={28} style={{ flex: 1, minHeight: 0, minWidth: 0, lineHeight: 1.32, textAlign: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.45em' }}>
              {step.en && <div dir={textDir(step.en)} style={{ fontFamily: textDir(step.en) === 'rtl' ? READ.he : READ.en, fontWeight: 500, color: 'var(--ink)', unicodeBidi: 'isolate' }}>{bidiNodes(step.en)}</div>}
              {step.he && <div className="tt-he" dir="rtl" style={{ fontFamily: READ.he, fontWeight: 500, color: step.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.45 }}>{bidiNodes(step.he)}</div>}
            </div>
          </Fit>
        )}
      </div>
      {step.source && <div data-s="" style={{ '--i': 2, flex: 'none' }}><SourceLine text={step.source} label={COPY.source.en} data-occ-source="" /></div>}
    </div>
  );
}

/** Coming up: the next occasions, one calm row each (name, then when). */
function ComingAct({ list, lang, portrait }) {
  if (!list?.length) return null;
  return (
    <div data-occ-col="" data-occ-coming="" data-occ-block="coming" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ActHead en={lang === 'hebrew' ? '' : COPY.comingUp.en} heText={lang === 'hebrew' ? COPY.comingUp.he : ''} />
      <div data-occ-col="" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center' }}>
        {list.map((c, i) => {
          const n = inLang(c.name, lang);
          return (
            <div key={c.key} data-s="" style={{ '--i': i + 1, display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'baseline', justifyContent: 'space-between', gap: portrait ? 4 : 32, padding: '18px 0', borderTop: i ? '2px solid var(--line)' : 'none' }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 20px', alignItems: 'baseline', minWidth: 0 }}>
                {n.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(44), fontWeight: 700 }}>{n.he}</span>}
                {n.en && <span style={{ fontFamily: F.enD, fontSize: 32, fontWeight: n.he ? 400 : 600, color: n.he ? SOFT_INK : 'var(--ink)', overflowWrap: 'anywhere' }}>{bidiNodes(n.en)}</span>}
              </span>
              <span className="tt-num" style={{ flex: 'none', fontFamily: F.en, fontSize: 30, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{c.when.en || c.when.he}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 'TODAY  Sunday · 21 Cheshvan 5787' (one language): the rail's date in the hero. */
function TodayStrip({ today, lang, attr = true }) {
  if (!today || typeof today !== 'object') return null;
  const wd = primary(today.weekday, lang); const hd = primary(today.hebrew, lang);
  const names = (Array.isArray(today.occasionsToday) ? today.occasionsToday : []).map((o) => primary(o?.name, lang)).filter(hasText);
  const text = [wd.en || wd.he, hd.en || hd.he].filter(Boolean).join(' · ');
  if (!text && !names.length) return null;
  const lab = primary(FORM_COPY.today, lang);
  const rtl = lang === 'hebrew';
  return (
    <span {...(attr ? { 'data-occ-today': '' } : {})} dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 14px', minWidth: 0, color: SOFT_INK, lineHeight: 1.3 }}>
      <Label en={lab.en} heText={lab.he} />
      {text && <span className={rtl ? 'tt-he' : undefined} style={{ fontFamily: rtl ? F.he : F.en, fontSize: rtl ? he(26) : 24, fontWeight: 500 }}>{text}</span>}
      {names.map((n, i) => <span key={i} data-occ-today-name="" style={{ fontFamily: n.en ? F.en : F.he, fontSize: n.en ? 24 : he(26), fontWeight: 700, color: ACC }}>{n.en || n.he}</span>)}
    </span>
  );
}

// ── advent (Reveal): the tile grid replaces the hero act ──
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

function AdventGrid({ a, newly, photo, portrait, side }) {
  const { cols, rows } = a.tiles || { cols: 3, rows: 3 };
  const total = cols * rows;
  const box = photo ? { inset: 0 } : portrait ? { top: 104, left: 56, right: 56, height: '46%' } : { top: 96, bottom: 40, [side === 'left' ? 'left' : 'right']: 64, width: '50%' };
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
                {(!open || fresh) && <div className={fresh ? 'tt-adv-open' : undefined} style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--ink) 7%, var(--panel))', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: '10px 14px' }}>{num}</div>}
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

function AdventCard({ m, L, portrait, font, pager, photo, nowMs, fast, lang }) {
  const counting = m.form === 'far' || m.form === 'days' || m.form === 'hours' || m.form === 'minutes';
  const w = m.words;
  const u = primary(unitWords(m, lang), lang);
  return (
    <div data-occ-card="" style={{ flex: 'none', width: portrait ? '100%' : photo ? '48%' : '44%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, ...(photo ? { padding: portrait ? '28px 36px' : '28px 40px', borderRadius: 24, background: 'color-mix(in srgb, var(--panel) 94%, transparent)' } : null) }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'baseline' }}><Label en={primary(COPY.slideTitle, lang).en} heText={primary(COPY.slideTitle, lang).he} />{pager && <span className="tt-num" style={{ fontFamily: F.en, fontSize: 24, fontWeight: 600, color: LABEL_INK }}>{pager}</span>}</header>
      <Name name={m.name} L={L} size={NAME.small} align="start" k={`a|${m.key}`} width="100%" />
      {counting ? (
        m.display === 'flip' && flipCells(m, nowMs, fast).length
          ? <div data-occ-count={m.form}><FlipRow cells={flipCells(m, nowMs, fast)} font={font} h={portrait ? 150 : 120} lang={lang} /></div>
          : (
            <div data-occ-count={m.form} style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flexWrap: 'wrap' }}>
              <div style={{ width: portrait ? 300 : 240, flex: 'none' }}><BigNum text={w.big} max={200} height={scaled(portrait ? 190 : 170, L)} font={font} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, minWidth: 0 }}><Label en={u.en} heText={u.he} color={SOFT_INK} data-occ-unit="" /></div>
            </div>
          )
      ) : <Label en={(m.zero || m.dayLabel)?.en} heText={(m.zero || m.dayLabel)?.he} color={ACC} />}
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
          <StepView step={a.today} portrait={portrait} k={`peek|${m.key}`} />
        </div>
      )}
    </>
  );
}

/**
 * When the worst content does not fit, parts go in order of least importance instead of anything being cut: 1-2 the
 * tagline, 3 the why text's source line, 4 the date range and everything a little smaller, 5-6 the count gives way.
 * Measured in layout px after each act renders (and after fonts load).
 */
function squeezed(L, level) {
  if (!level) return L;
  const show = { ...L.show };
  if (level >= 1) show.actName = false; // the long name inside the reading acts goes first
  if (level >= 2) show.tagline = false;
  if (level >= 3) show.whySource = false;
  if (level >= 4) show.dateRange = false;
  return { ...L, show, k: level >= 4 ? (L.k || 1) * 0.86 : L.k, cs: level >= 6 ? 0.6 : level >= 5 ? 0.72 : level >= 4 ? 0.84 : level >= 3 ? 0.92 : 1 };
}
function useSqueeze(ref, key) {
  const [level, setLevel] = useState(0);
  const at = useRef(key);
  const fresh = useRef(false);
  if (at.current !== key) { at.current = key; fresh.current = false; if (level) setLevel(0); }
  useLayoutEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el || !el.clientHeight) return;
      // laid-out size, not scrollHeight: an act's lines rise in with a transform, which would count as overflow for a moment
      const bottom = (c) => {
        let b = 0;
        for (const ch of c.children) {
          if (getComputedStyle(ch).position === 'absolute') continue;
          const top = ch.offsetParent === c ? ch.offsetTop : ch.offsetTop - (ch.offsetParent === c.offsetParent ? c.offsetTop : 0);
          b = Math.max(b, top + ch.offsetHeight);
        }
        return b;
      };
      const over = [el, ...el.querySelectorAll('[data-occ-col]')].some((c) => c.clientHeight && bottom(c) > c.clientHeight + 2);
      if (over) setLevel((l) => (l < 6 ? l + 1 : l));
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(check)); // after the Stage has measured its area
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (!alive || fresh.current) return;
      fresh.current = true;
      if (document.fonts.status === 'loaded') setLevel(0); else check();
    }).catch(() => {});
    return () => { alive = false; cancelAnimationFrame(raf); };
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

/** The rail's progress: the lead-up as one marker (far), a tick per day / hour / minute LEFT nearer the day, count-up days. */
function railProgress(m, L, hc, nowMs, strong = false, level = 0) {
  const c = m.countdown || {};
  if (hc?.bar != null) return <TickLine fraction={hc.bar} />;
  if (m.run) return shows(L, 'pips') || shows(L, 'bar') ? (m.run.n <= 60 ? <TickLine total={m.run.n} lit={m.run.k} from="start" major={m.run.n > 20 ? 5 : 7} /> : <TickLine fraction={m.run.fraction ?? m.run.k / m.run.n} />) : null;
  if (m.form === 'far') {
    if (!shows(L, 'ring')) return null;
    const leadMs = Math.max(1, (m.leadDays || m.lead?.days || 30) * 86400000);
    const f = Number.isFinite(Number(m.beginMs)) ? 1 - Math.max(0, Number(m.beginMs) - nowMs) / leadMs : (m.lead?.fraction || 0);
    return <TickLine fraction={Math.max(0, Math.min(1, f))} />;
  }
  if (m.form === 'days') return shows(L, 'pips') ? <TickLine total={FAR_DAYS} lit={c.days} strong={strong} /> : null;
  if (c.approx || !shows(L, 'bar')) return null;
  if (m.form === 'hours') return <TickLine total={24} lit={c.hours + (c.minutes > 0 ? 1 : 0)} major={6} strong={strong} />;
  if (m.form === 'minutes') return <TickLine total={60} lit={level >= 5 && !c.minutes ? (c.seconds || 0) : c.minutes + ((c.seconds || 0) > 0 ? 1 : 0)} major={5} strong={strong} />;
  return null;
}

export default function OccasionSlide({ occasions, settings, cache, clockOffset = 0, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const [fast, setFast] = useState(false);
  const now = useTick(clockOffset, fast);
  const model = useMemo(() => {
    try { return slideModel(occasions, now, ctxFrom(settings, cache, now)); } catch { return null; }
  }, [occasions, settings, cache, now]);
  const wantFast = !!model?.rows.some((r) => r.form === 'minutes' || r.form === 'zero' || (r.form === 'hours' && r.countdown.hours < 1));
  useEffect(() => { if (wantFast !== fast) setFast(wantFast); }, [wantFast, fast]);

  // The act sequence: each row's acts (src/screen/stage/acts.js), the Coming up act once after the last row. The slide asks
  // the rotation once for the time all of them need; each act keeps its own time.
  const nowMs = now.getTime();
  const levels = (model?.rows || []).map((r) => hypeOf(r, nowMs, r.hype).level).join();
  const pages = useMemo(() => {
    const rows = model?.rows || [];
    return rows.flatMap((r, i) => {
      const L = layoutOf(r.layout);
      const hy = hypeOf(r, Date.now() + clockOffset, r.hype);
      const acts = actsFor(r, { cycleSeconds: model.cycleSeconds, level: hy.level, hype: hy.setting, style: r.stageStyle, layout: L, coming: i === rows.length - 1 && !!model.coming?.length && shows(L, 'coming') });
      // auto mode steps the hero through its forms: the hero stays for one full round of them
      const fl = formsFor(r);
      const round = fl.length > 1 && r.autoForms?.on ? fl.length * Math.min(300, Math.max(3, Number(r.autoForms.seconds) || 8)) + 1 : 0;
      return acts.map((a) => ({ m: r, view: a.id, ex: a.ex, secs: a.id === 'main' ? Math.max(a.secs, round) : a.secs, reveal: !!a.reveal, closes: !!a.closes }));
    });
  }, [model, levels]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = model?.rows.length || 0;
  const [page, setPage] = useState(0);
  const [kick, setKick] = useState(0); // a tap on the number: the hero's time starts again (the viewer is using it)
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
  }, [keyList, page, kick]); // eslint-disable-line react-hooks/exhaustive-deps

  const curPage = pages[Math.min(page, pages.length - 1)];
  const formList = curPage && curPage.view === 'main' ? formsFor(curPage.m) : [];
  const formSig = `${curPage?.m.key}|${formList.join()}`;
  const [formAt, setFormAt] = useState(0);
  useEffect(() => { setFormAt(0); }, [formSig]);
  const autoOn = formList.length > 1 && !!curPage?.m.autoForms?.on;
  const autoSecs = Math.min(300, Math.max(3, Number(curPage?.m.autoForms?.seconds) || 8));
  useEffect(() => {
    if (!autoOn) return undefined;
    const t = setInterval(() => { if (!document.hidden) setFormAt((x) => (x + 1) % formList.length); }, autoSecs * 1000);
    return () => clearInterval(t);
  }, [autoOn, autoSecs, formList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const probeRef = useRef(null);
  const [pops, setPops] = useState([]);
  const [peek, setPeek] = useState(false);
  const [badPhoto, setBadPhoto] = useState('');
  const lastTap = useRef(0);
  const lastForm = useRef(-1000);
  useEffect(() => { if (!peek) return undefined; const t = setTimeout(() => setPeek(false), 8000); return () => clearTimeout(t); }, [peek]);
  useEffect(() => { if (!pops.length) return undefined; const t = setTimeout(() => setPops([]), 900); return () => clearTimeout(t); }, [pops]);

  const cur = pages[Math.min(page, pages.length - 1)] || (model?.rows[0] ? { m: model.rows[0], view: 'main' } : null);
  const m = cur?.m;
  const hype = m ? hypeOf(m, nowMs, m.hype) : { level: -1, intensity: 1 };
  // a level change of the same occasion: the rail flashes its accent once
  const lvlRef = useRef({ key: '', level: -9 });
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (!m) return;
    const o = lvlRef.current;
    if (o.key === m.key && o.level !== hype.level && hype.level > o.level) setFlashKey((x) => x + 1);
    lvlRef.current = { key: m.key, level: hype.level };
  }, [m?.key, hype.level]); // eslint-disable-line react-hooks/exhaustive-deps

  useSmallAccent(panelRef, [design.themeId, design.light, design.upNext, (model?.rows || []).map((r) => r.look?.accent || '').join(), hype.level]);
  const squeeze = useSqueeze(bodyRef, `${keyList}|${page}|${(model?.rows || []).map((r) => r.form).join()}|${portrait}|${formAt}`);

  const look = lookOf(m?.look);
  const font = numeralsStack(look.numeralsFont);
  const lang = model?.language || 'both';
  const forms = formList;
  const formId = forms.length ? forms[Math.min(formAt, forms.length - 1)] : 'days';
  const counting = !!m && (m.run || ['far', 'days', 'hours', 'minutes'].includes(m.form));
  const hc = counting ? heroCount(m, formId, nowMs, fast, lang, hype.level) : null;
  const shapeSig = hc && hc.kind !== 'flip' ? `${String(hc.big).replace(/\d/g, '0')}|${hc.suffix || ''}|${font}` : '';
  const mt = useNumMetrics(probeRef, shapeSig);
  const w100 = mt.w;

  if (!model || !n || !m) {
    return (
      <Panel pad="38px 60px">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Label en="Nothing to count down to right now" size={28} /></div>
      </Panel>
    );
  }
  const L = squeezed(layoutOf(m.layout), squeeze);
  const coming = model.coming;
  const at = model.rows.findIndex((r) => r.key === m.key);
  const pager = n > 1 ? `${at + 1} / ${n}` : '';
  const photoOn = !!look.photo && badPhoto !== look.photo;
  const pad = portrait ? '42px 56px 40px' : '36px 64px 36px';
  // the accent warms / brightens as the energy climbs (mixed from roles, never a glow)
  const hot = hype.level >= 2 ? Math.round(Math.min(40, (hype.level - 1) * 8 * hype.intensity)) : 0;
  const baseAcc = look.accent || 'var(--accent)';
  const panelVars = look.accent || hot ? { '--accentText': hot ? `color-mix(in srgb, ${baseAcc} ${100 - hot}%, var(--text))` : look.accent } : undefined;
  const advent = cur.view === 'main' && m.advent && m.form !== 'zero';
  const recipe = recipeOf(m.stageStyle);
  const center = L.align === 'center';
  const stack = portrait || center || photoOn;
  const long = isLong(m.name);
  const onTap = (e) => {
    if (m.touch === false) return;
    const el = panelRef.current;
    if (!el) return;
    try { if (getComputedStyle(el).getPropertyValue('--tt-pe').trim() === 'none') return; } catch { /* no styles: allow */ }
    const t = Date.now();
    const tp = typeof performance !== 'undefined' ? performance.now() : t;
    if (forms.length > 1 && e.target?.closest?.('[data-occ-count]')) {
      if (tp - lastForm.current < 300) return;
      lastForm.current = tp;
      setFormAt((x) => (x + 1) % forms.length);
      setKick((x) => x + 1);
      return;
    }
    if (design.motion === 'minimal') return;
    if (t - lastTap.current < 800) return;
    lastTap.current = t;
    if (advent && m.advent.today) { setPeek(true); return; }
    if (design.graphics === 'off') return;
    const r = el.getBoundingClientRect();
    const k = r.width / (el.offsetWidth || r.width || 1);
    setPops([{ id: t, x: Math.round((e.clientX - r.left) / k), y: Math.round((e.clientY - r.top) / k) }]);
  };

  // the shared elements at their hero size, for the room the act area really has
  const plan = (aw, ah) => {
    const k = (L.k || 1) * (L.cs || 1);
    let num = null;
    if (hc && hc.kind !== 'flip' && !w100) { /* wait for the shape's width */ } else if (hc && hc.kind === 'flip') {
      const cnt = hc.cells.length;
      const maxW = stack ? aw : aw * 0.58;
      const maxH = (stack ? Math.min(ah * 0.36, 420) : Math.min(ah * 0.62, 360)) * k;
      const units = hc.cells.reduce((t, c) => t + (c.v.length > 2 ? 1.1 : 0.82), 0);
      const h = Math.max(60, Math.floor(Math.min(maxH, (maxW - (cnt - 1) * 14) / units)));
      const w = Math.round(units * h + (cnt - 1) * 14);
      num = { w, h: h + 44, node: <div data-occ-count-layer=""><FlipRow cells={hc.cells} font={font} h={h} lang={lang} /></div> };
    } else if (hc) {
      const maxW = stack ? aw * (photoOn ? 1 : 0.92) : aw * 0.5;
      const maxH = (stack ? Math.min(ah * (photoOn && !portrait && !center ? 0.5 : 0.44), 600) : Math.min(ah * 0.78, 500)) * k;
      const size = Math.max(60, Math.floor(Math.min(w100 ? (maxW * 100) / w100 : maxH, (maxH * 100) / mt.ink)));
      const w = Math.max(1, Math.round(((w100 || 50) * size) / 100));
      const pk = cur.view === 'main' && hype.level >= 3 && design.motion !== 'minimal' ? (hype.level === 4 ? String(hc.big).split(':')[0] : String(hc.big)) : '';
      num = { w, h: Math.round((size * mt.ink) / 100), node: <Digits mt={mt} text={hc.big} suffix={hc.suffix} size={size} font={font} color={hype.level >= 5 ? ACC : hype.level === 4 ? 'color-mix(in srgb, var(--accentText) 40%, var(--ink))' : 'var(--ink)'} popKey={pk} popFrom={1 + 0.05 * hype.intensity * (hype.level >= 5 ? 1.6 : 1)} /> };
    }
    let size; let nw;
    if (m.form === 'zero') { size = NAME.small; nw = aw; }
    else if (m.form === 'day' && !m.run) { size = portrait ? (long ? NAME.dayPortLong : NAME.dayPort) : (long ? NAME.dayLong : NAME.day); nw = aw; }
    else if (stack && photoOn && !portrait && !center) { size = long ? NAME.sideLong : isShort(m.name) ? NAME.sideShort : NAME.side; nw = aw; }
    else if (stack) { size = long ? NAME.stackLong : isShort(m.name) ? NAME.stackShort : NAME.stack; nw = aw; }
    else { size = long ? NAME.sideLong : isShort(m.name) ? NAME.sideShort : NAME.side; nw = Math.max(240, aw - (num?.w || 0) - GUT); }
    const nh = nameHeight(m.name, L, size);
    const name = nh.h ? { w: Math.round(nw), h: nh.h, box: nh.box, long, node: (compact, trans) => <Name name={m.name} L={L} size={size} align={center || m.form === 'zero' ? 'center' : 'start'} k={m.key} width={Math.round(nw)} compact={compact} trans={trans} /> } : null;
    return { num, name };
  };

  const holdMs = Math.max(4000, (cur.secs || 10) * 1000 - (cur.reveal ? recipe.reveal.open + recipe.reveal.close : 0) - 600);
  const renderAct = (geo) => {
    if (cur.view === 'years') return <YearsAct m={m} L={L} lang={lang} portrait={portrait} long={long} />;
    if (cur.view === 'facts') return <FactsAct m={m} L={L} lang={lang} portrait={portrait} long={long} />;
    if (cur.view === 'why') return <WhyAct m={m} L={L} lang={lang} portrait={portrait} long={long} holdMs={holdMs} />;
    if (cur.view === 'vort') return <VortAct m={m} ex={cur.ex} L={L} lang={lang} portrait={portrait} long={long} holdMs={holdMs} />;
    if (cur.view === 'step') return <StepView step={cur.ex} portrait={portrait} k={m.key} />;
    if (cur.view === 'coming') return <ComingAct list={coming} lang={lang} portrait={portrait} />;
    if (m.form === 'zero') return <ZeroAct geo={geo} m={m} L={L} portrait={portrait} />;
    if (m.form === 'day' && !m.run) return <DayAct geo={geo} m={m} L={L} lang={lang} center={center} />;
    return <HeroAct geo={geo} m={m} L={L} lang={lang} hc={hc} stack={stack} center={center} forms={forms} formAt={formAt} hype={hype} graphics={design.graphics} numFirst={photoOn && !portrait && !center} />;
  };

  const today = shows(L, 'today') ? [model.today, m.today].find((x) => x && typeof x === 'object') || null : null;
  const cu = hc ? primary(hc.kind === 'run' ? COPY.dayOf : m.form === 'hours' || m.form === 'minutes' ? m.words.unit : hc.big === '1' ? COPY.day : COPY.days, lang) : null;
  const titleL = primary(COPY.slideTitle, lang);
  const rail = {
    left: today ? <TodayStrip today={today} lang={lang} /> : <Label en={titleL.en} heText={titleL.he} />,
    right: today && !(photoOn && !portrait) ? <span style={{ color: SOFT_INK }}>{(() => { const h = primary(today.hebrew, lang); return <span className={h.he ? 'tt-he' : undefined} style={{ fontFamily: h.he ? F.he : F.en, fontSize: h.he ? he(26) : 24, fontWeight: 500 }}>{h.en || h.he}</span>; })()}</span> : null,
    compact: hc && hc.kind !== 'flip' && hasText(cu) ? <Label en={cu.en} heText={cu.he} color={SOFT_INK} size={portrait ? 30 : 24} /> : null,
    pager: pager ? <span className="tt-num" style={{ fontFamily: F.en, fontSize: 24, fontWeight: 600, letterSpacing: '.12em', color: LABEL_INK }}>{pager}</span> : null,
    progress: counting ? railProgress(m, L, hc, nowMs, hype.level >= 2, hype.level) : null,
  };
  const countAttrs = counting ? { 'data-occ-count': m.run ? 'run' : m.form, 'data-occ-formid': forms.length ? formId : undefined, 'data-occ-forms': forms.length ? forms.join(',') : undefined } : null;
  const bodyInset = photoOn && !portrait ? { [L.side === 'right' ? 'paddingLeft' : 'paddingRight']: `calc(${PHOTO_SHARE.land * 100}% + 8px)` } : null;
  return (
    <Panel ref={panelRef} pad={pad} data-occ-form={m.form} data-occ-view={cur.view} data-occ-squeeze={squeeze} data-occ-hype={hype.level} data-occ-style={recipe.id} data-occ-display={m.run ? 'run' : advent ? 'advent' : m.display || 'classic'} style={panelVars} onPointerUp={onTap}>
      {!advent && !photoOn && <Backdrop graphics={design.graphics} />}
      {!advent && photoOn && <PhotoPane photo={look.photo} dim={look.dim} side={L.side === 'right' ? 'left' : 'right'} portrait={portrait} onBad={setBadPhoto} />}
      {m.form === 'zero' && m.celebrate && <Confetti key={`c|${m.key}`} graphics={design.graphics} motion={design.motion} />}
      {pops.map((p) => <TapPop key={p.id} x={p.x} y={p.y} />)}
      <span ref={probeRef} aria-hidden className="tt-num" style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap', fontFamily: font, fontWeight: 600, fontSize: 100, lineHeight: 1, letterSpacing: '-.01em', pointerEvents: 'none' }}>{hc && hc.kind !== 'flip' ? String(hc.big).replace(/\d/g, '0') : '0'}{hc?.suffix ? <span style={SUFFIX_STYLE}>{hc.suffix}</span> : null}</span>
      {advent ? <AdventMain m={m} L={L} portrait={portrait} font={font} pager={pager} nowMs={nowMs} fast={fast} lang={lang} peek={peek} /> : (
        <div ref={bodyRef} style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...bodyInset }}>
          {photoOn && portrait && <div aria-hidden style={{ flex: 'none', height: `${PHOTO_SHARE.port * 100 - 2}%` }} />}
          <Stage plan={plan} renderAct={renderAct} rail={rail} act={{ id: cur.view, secs: cur.secs || 10, reveal: !!cur.reveal, closes: !!cur.closes, turns: pages.length > 1, kick }} actKey={`${m.key}|${cur.view}|${page}`}
            recipe={recipe} motion={design.motion} light={design.light} portrait={portrait} hype={hype} countAttrs={countAttrs} flashKey={flashKey}
            settle={hype.level >= 3 && design.motion !== 'minimal' ? Math.round((hype.level - 1) * hype.intensity) : 0} />
        </div>
      )}
    </Panel>
  );
}

export { readSecs };
