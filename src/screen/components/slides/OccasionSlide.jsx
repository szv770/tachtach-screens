import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { Ornament, ProgressRing } from '../../design/graphics.jsx';
import { Confetti } from './BirthdaysSlide.jsx';
import { textDir } from '../../../shared/bidi.js';
import { slideModel, ctxFrom, COPY, FAR_DAYS } from '../../../shared/occasions.js';

/**
 * The Countdown page (OCCASION): the nearest Chassidic / Jewish day or school event, with a countdown that changes its
 * form as the time shrinks (src/shared/occasions.js decides everything; this file only paints the model).
 *
 *   far      > 14 days: one big DAYS number inside a static ring that shows how much of the lead-up has passed
 *   days     1-14 days: 'N days' + 'and H hours', a row of 14 pips (one per day left)
 *   hours    the last day: H:MM, a bar for the day
 *   minutes  the last hour: M:SS, the text changes each second (nothing animates)
 *   zero     it has begun: a FINITE celebration (the birthday page's confetti, which falls out of the panel and is gone),
 *            then the settled greeting
 *   day      'Today is' / 'Tonight is' + the name, day k of n, the admin's event line
 * The admin's explanation shows only with its source (owner rule), auto-fitted, with the source under it.
 * Roles and font roles only; static SVG art; nothing loops, no blur or blend. Portrait and landscape.
 */

const KICK = { fontFamily: F.en, fontSize: 24, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--ink) 66%, transparent)' };

/** Static sunburst behind the countdown (graphics rich: rays + rings; subtle: rings only). */
function Burst({ size, rich }) {
  const c = size / 2;
  const rays = rich ? 24 : 0;
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
      <g fill="none" stroke="color-mix(in srgb, var(--accentText) 16%, transparent)" strokeWidth="2">
        {[0.5, 0.62, 0.74].map((k) => <circle key={k} cx={c} cy={c} r={c * k} />)}
      </g>
      <g stroke="color-mix(in srgb, var(--accentText) 12%, transparent)" strokeWidth="3" strokeLinecap="round">
        {Array.from({ length: rays }, (_, i) => {
          const a = (i / rays) * Math.PI * 2;
          const r0 = c * (i % 2 ? 0.8 : 0.78); const r1 = c * (i % 2 ? 0.9 : 0.97);
          return <line key={i} x1={c + Math.cos(a) * r0} y1={c + Math.sin(a) * r0} x2={c + Math.cos(a) * r1} y2={c + Math.sin(a) * r1} />;
        })}
      </g>
    </svg>
  );
}

function Unit({ unit, size = 32, center = true }) {
  if (!unit?.en && !unit?.he) return null;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', justifyContent: center ? 'center' : 'flex-start', flexWrap: 'wrap', lineHeight: 1.2 }}>
      {unit.en && <span style={{ fontFamily: F.en, fontSize: size, fontWeight: 650, color: 'var(--ink)', letterSpacing: '.02em' }}>{unit.en}</span>}
      {unit.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(size + 2), fontWeight: 600, color: 'var(--inkDim)' }}>{unit.he}</span>}
    </div>
  );
}

function Pips({ left, total = FAR_DAYS, portrait }) {
  const w = portrait ? 26 : 22;
  return (
    <div aria-hidden style={{ display: 'flex', gap: portrait ? 10 : 8, justifyContent: 'center', marginTop: 18 }}>
      {Array.from({ length: total }, (_, i) => {
        const lit = i >= total - left;
        return <span key={i} style={{ width: w, height: w, borderRadius: '50%', background: lit ? 'var(--accentText)' : 'transparent', border: `3px solid ${lit ? 'var(--accentText)' : 'var(--line)'}`, boxSizing: 'border-box' }} />;
      })}
    </div>
  );
}

function Bar({ fraction, width }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div aria-hidden style={{ width, height: 12, borderRadius: 6, background: 'var(--line)', marginTop: 22, overflow: 'hidden' }}>
      <div style={{ width: `${(f * 100).toFixed(2)}%`, height: '100%', borderRadius: 6, background: 'var(--accentText)' }} />
    </div>
  );
}

/** The countdown itself, in its current form. */
function Count({ m, portrait, art, rich, compact = false }) {
  const w = m.words;
  const c = m.countdown;
  const box = portrait ? 520 : 440;
  if (m.form === 'far') {
    const ring = portrait ? 440 : compact ? 300 : 380;
    return (
      <div data-occ-count="far" style={{ position: 'relative', width: ring, height: ring, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--accentText)' }}>
        {art && <Burst size={Math.round(ring * 1.22)} rich={rich} />}
        <ProgressRing size={ring} stroke={portrait ? 18 : 16} fraction={m.lead?.fraction || 0} />
        <div className="tt-num" style={{ position: 'relative', fontSize: String(w.big).length > 2 ? (portrait ? 170 : 150) : (portrait ? 210 : 186), fontWeight: 800, lineHeight: 1, letterSpacing: '-.04em', color: 'var(--accentText)' }}>{w.big}</div>
        <div style={{ position: 'relative', marginTop: 10 }}><Unit unit={w.unit} size={portrait ? 34 : 30} /></div>
      </div>
    );
  }
  const big = compact ? (m.form === 'days' ? 180 : 160) : m.form === 'days' ? (portrait ? 260 : 230) : (portrait ? 230 : 200);
  return (
    <div data-occ-count={m.form} style={{ position: 'relative', width: box, maxWidth: '100%', flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
      {art && <Burst size={Math.round(box * 1.05)} rich={rich} />}
      <div className="tt-num" style={{ position: 'relative', fontSize: big, fontWeight: 800, lineHeight: 0.95, letterSpacing: '-.04em', color: 'var(--accentText)', whiteSpace: 'nowrap' }}>{w.big}</div>
      <div style={{ position: 'relative', marginTop: 8 }}><Unit unit={w.unit} size={portrait ? 36 : 32} /></div>
      {w.sub && (
        <div style={{ position: 'relative', display: 'flex', gap: 18, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          {w.sub.en && <span className="tt-num" style={{ fontFamily: F.en, fontSize: portrait ? 50 : 46, fontWeight: 700, color: 'var(--ink)' }}>{w.sub.en}</span>}
          {w.sub.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(portrait ? 46 : 42), fontWeight: 600, color: 'var(--inkDim)' }}>{w.sub.he}</span>}
        </div>
      )}
      {m.form === 'days' && !compact && <Pips left={c.days} portrait={portrait} />}
      {m.form === 'hours' && !c.approx && <Bar fraction={1 - (c.hours * 60 + c.minutes) / 1440} width={portrait ? 420 : 360} />}
      {m.form === 'minutes' && !c.approx && c.seconds != null && <Bar fraction={1 - (c.minutes * 60 + c.seconds) / 3600} width={portrait ? 420 : 360} />}
    </div>
  );
}

/** A name is 'long' when it would not sit on one line beside the countdown. */
const isLong = (name) => [...(name?.he || '')].length > 16 || [...(name?.en || '')].length > 22;

/**
 * Name sizes per place (canvas px): [Hebrew max, min, box height], [English max, min, box height]. Each box holds at least
 * two lines at its minimum, so a 60-character name still fits; the boxes never shrink (flex none) and the page budget
 * below was checked at 1600x900 and 900x1600 (scripts/occasions-audit.mjs).
 */
const NAME_SIZES = {
  side: { he: [112, 56, 156], en: [68, 44, 110] },       // landscape, beside the countdown (short names only)
  wide: { he: [100, 44, 140], en: [62, 36, 108] },       // landscape, full width (long names)
  port: { he: [120, 48, 176], en: [72, 40, 118] },       // portrait
  day: { he: [150, 56, 200], en: [86, 44, 124] },        // the day itself, landscape, short names
  dayPort: { he: [160, 52, 228], en: [92, 40, 136] },    // the day itself, portrait
  small: { he: [84, 40, 116], en: [56, 34, 92] },        // the zero moment
};

/** The name: Hebrew (display role) over English, each auto-fitted and allowed to wrap, never cut. */
function Name({ name, size = 'side', align = 'center', k = '' }) {
  const S = NAME_SIZES[size] || NAME_SIZES.side;
  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
      {name.he && (
        <Fit key={`nh|${k}|${size}`} wrap vcenter dir="rtl" max={S.he[0]} min={S.he[1]} className="tt-he" style={{
          flex: 'none', width: '100%', height: S.he[2], fontFamily: F.heD, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2, textAlign: align,
        }}>{name.he}</Fit>
      )}
      {name.en && (
        <Fit key={`ne|${k}|${size}`} wrap vcenter dir={textDir(name.en)} max={S.en[0]} min={S.en[1]} style={{
          flex: 'none', width: '100%', height: S.en[2], fontFamily: F.enD, fontWeight: 750, letterSpacing: '-.01em', color: name.he ? 'var(--inkDim)' : 'var(--ink)', lineHeight: 1.1, textAlign: align,
        }}>{name.en}</Fit>
      )}
    </div>
  );
}

function DateLine({ m, center }) {
  const parts = [];
  if (m.hebrewDate?.he) parts.push(<span key="h" className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(34), fontWeight: 600 }}>{m.hebrewDate.he}</span>);
  if (m.hebrewDate?.en) parts.push(<span key="e">{m.hebrewDate.en}</span>);
  if (m.civilDate?.en) parts.push(<span key="c">{m.civilDate.en}</span>);
  else if (m.civilDate?.he) parts.push(<span key="ch" dir="rtl">{m.civilDate.he}</span>);
  if (m.days > 1 && !m.dayIndex) parts.push(<span key="d">{m.days} {COPY.days.en}</span>);
  if (!parts.length) return null;
  return (
    <div data-occ-date="" style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: '6px 0', alignItems: 'baseline', justifyContent: center ? 'center' : 'flex-start', fontFamily: F.en, fontSize: 30, fontWeight: 550, color: 'var(--inkDim)', lineHeight: 1.3 }}>
      {parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span aria-hidden style={{ margin: '0 16px', color: 'var(--line)' }}>•</span>}{p}</React.Fragment>)}
    </div>
  );
}

function Begins({ m, center }) {
  if (!m.begins) return null;
  return (
    <div data-occ-begins="" style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 22px', alignItems: 'baseline', justifyContent: center ? 'center' : 'flex-start', lineHeight: 1.25 }}>
      {m.begins.en && <span className="tt-num" style={{ fontFamily: F.en, fontSize: 34, fontWeight: 700, color: 'var(--accentText)' }}>{m.begins.en}</span>}
      {m.begins.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(34), fontWeight: 600, color: 'var(--accentText)' }}>{m.begins.he}</span>}
      {m.approx && <span style={{ fontFamily: F.en, fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>~ {COPY.approx.en}</span>}
    </div>
  );
}

function EventLine({ ev, center, size = 36 }) {
  if (!ev?.en && !ev?.he) return null;
  return (
    <div data-occ-event="" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 18, justifyContent: center ? 'center' : 'flex-start', maxWidth: '100%' }}>
      <Ornament size={30} style={{ color: 'var(--accentText)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: center ? 'center' : 'flex-start' }}>
        {ev.en && <div dir={textDir(ev.en)} style={{ fontFamily: textDir(ev.en) === 'rtl' ? F.he : F.en, fontSize: size, fontWeight: 650, color: 'var(--ink)', lineHeight: 1.25, overflowWrap: 'anywhere', textAlign: center ? 'center' : 'start', unicodeBidi: 'isolate' }}>{bidiNodes(ev.en)}</div>}
        {ev.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(size - 2), fontWeight: 500, color: ev.en ? 'var(--inkDim)' : 'var(--ink)', lineHeight: 1.3, overflowWrap: 'anywhere', textAlign: center ? 'center' : 'start' }}>{bidiNodes(ev.he)}</div>}
      </div>
    </div>
  );
}

/** The admin's explanation (only ever with a source), on its own page: fitted to the page, 28 px at the least, never cut. */
function Explain({ ex, k }) {
  if (!ex) return null;
  return (
    <div data-occ-explain="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 10, paddingTop: 18, borderTop: '2px solid var(--line)' }}>
      <Fit key={`x|${k}`} wrap vcenter max={48} min={28} style={{ flex: 1, minHeight: 0, width: '100%', lineHeight: 1.36, textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5em' }}>
          {ex.en && <div dir={textDir(ex.en)} style={{ fontFamily: textDir(ex.en) === 'rtl' ? F.he : F.en, fontWeight: 550, color: 'var(--ink)', whiteSpace: 'pre-line', unicodeBidi: 'isolate' }}>{bidiNodes(ex.en)}</div>}
          {ex.he && <div className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontWeight: 500, color: ex.en ? 'var(--inkDim)' : 'var(--ink)', whiteSpace: 'pre-line', lineHeight: 1.45 }}>{bidiNodes(ex.he)}</div>}
        </div>
      </Fit>
      {ex.source && (
        <div data-occ-source="" dir="auto" style={{ flex: 'none', marginTop: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, fontFamily: F.en, fontSize: 24, fontWeight: 550, color: 'color-mix(in srgb, var(--ink) 70%, transparent)', lineHeight: 1.3, textAlign: 'center', overflowWrap: 'anywhere' }}>
          <span aria-hidden style={{ flex: 'none', width: 16, height: 2, borderRadius: 1, background: 'var(--line)' }} />
          <span style={{ minWidth: 0 }}>{COPY.source.en}: {bidiNodes(ex.source)}</span>
        </div>
      )}
    </div>
  );
}

function Coming({ list, portrait }) {
  if (!list?.length) return null;
  return (
    <div data-occ-coming="" style={{ flex: 'none', marginTop: portrait ? 22 : 16, paddingTop: 14, borderTop: '2px solid var(--line)', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'stretch' : 'baseline', gap: portrait ? 10 : 30 }}>
      <span style={{ ...KICK, flex: 'none' }}>{COPY.comingUp.en}<span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(26), letterSpacing: 0, marginLeft: 14 }}>{COPY.comingUp.he}</span></span>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: portrait ? '1fr' : `repeat(${list.length}, minmax(0, 1fr))`, gap: portrait ? 8 : 26 }}>
        {list.map((c) => (
          <div key={c.key} style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', justifyContent: portrait ? 'space-between' : 'flex-start' }}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', minWidth: 0, flexWrap: 'wrap' }}>
              {c.name.en && <span style={{ fontFamily: F.en, fontSize: 30, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{bidiNodes(c.name.en)}</span>}
              {c.name.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(30), fontWeight: 600, color: c.name.en ? 'var(--inkDim)' : 'var(--ink)' }}>{c.name.he}</span>}
            </span>
            <span className="tt-num" style={{ fontFamily: F.en, fontSize: 26, fontWeight: 600, color: 'var(--accentText)', whiteSpace: 'nowrap' }}>{c.when.en || c.when.he}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kicker({ pager }) {
  return (
    <header style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20 }}>
      <span style={KICK}>{COPY.slideTitle.en}<span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(26), letterSpacing: 0, marginLeft: 14 }}>{COPY.slideTitle.he}</span></span>
      {pager && <span className="tt-num" style={{ ...KICK, letterSpacing: '.06em' }}>{pager}</span>}
    </header>
  );
}

/** Zero: a finite burst of confetti (falls out of the panel and is gone), then the greeting stays. */
function ZeroView({ m, portrait, design }) {
  const z = m.zero || {};
  return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 18 : 10, textAlign: 'center' }}>
      {design.graphics !== 'off' && <Ornament size={portrait ? 84 : 60} style={{ color: 'var(--accentText)', flex: 'none' }} />}
      {z.he && (
        <Fit key={`zh|${m.key}|${portrait}`} className="tt-he tt-bd-hero" wrap vcenter dir="rtl" max={portrait ? 200 : 160} min={64} style={{ flex: 'none', width: '100%', height: portrait ? 300 : 206, fontFamily: F.heD, fontWeight: 800, color: 'var(--accentText)', lineHeight: 1.2, textAlign: 'center' }}>{z.he}</Fit>
      )}
      {z.en && (
        <Fit key={`ze|${m.key}|${portrait}`} className="tt-bd-up" wrap vcenter max={portrait ? 112 : 90} min={48} style={{ '--t': '500ms', flex: 'none', width: '100%', height: portrait ? 190 : 132, fontFamily: F.enD, fontWeight: 800, color: z.he ? 'var(--ink)' : 'var(--accentText)', lineHeight: 1.1, textAlign: 'center' }}>{z.en}</Fit>
      )}
      <div className="tt-bd-up" style={{ '--t': '800ms', width: '100%', flex: 'none' }}><Name name={m.name} size="small" k={m.key} /></div>
      <div className="tt-bd-up" style={{ '--t': '1100ms', width: '100%', flex: 'none', display: 'flex', justifyContent: 'center' }}><EventLine ev={m.event} center /></div>
    </div>
  );
}

function DayView({ m, portrait, coming, art }) {
  const di = m.dayIndex;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: portrait ? 14 : 8, textAlign: 'center' }}>
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 14 : 8 }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 22, justifyContent: 'center' }}>
          {m.dayLabel?.en && <span style={{ fontFamily: F.en, fontSize: 44, fontWeight: 650, color: 'var(--accentText)' }}>{m.dayLabel.en}</span>}
          {m.dayLabel?.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(46), fontWeight: 600, color: 'var(--accentText)' }}>{m.dayLabel.he}</span>}
        </div>
        <Name name={m.name} size={portrait ? 'dayPort' : isLong(m.name) ? 'wide' : 'day'} k={m.key} />
        {di && (
          <div className="tt-num" style={{ flex: 'none', display: 'inline-flex', gap: 18, alignItems: 'baseline', padding: '6px 26px 8px', borderRadius: 999, border: '2px solid var(--line)' }}>
            <span style={{ fontFamily: F.en, fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}>{COPY.dayOf.en} {di.k} {COPY.of.en} {di.n}</span>
            <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(32), fontWeight: 600, color: 'var(--inkDim)' }}>{COPY.dayOf.he} {di.k} {COPY.of.he} {di.n}</span>
          </div>
        )}
        <DateLine m={m} center />
        {art && !m.event && <Ornament size={52} style={{ color: 'var(--accentText)', marginTop: 8, flex: 'none' }} />}
        <EventLine ev={m.event} center size={portrait ? 40 : 36} />
      </div>
      <div style={{ width: '100%', flex: 'none' }}><Coming list={coming} portrait={portrait} /></div>
    </div>
  );
}

function CountView({ m, portrait, coming, art, rich }) {
  if (portrait) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
        <div style={{ width: '100%', marginTop: 8, flex: 'none' }}><Name name={m.name} size="port" k={m.key} /></div>
        <DateLine m={m} center />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Count m={m} portrait art={art} rich={rich} /></div>
        <Begins m={m} center />
        <EventLine ev={m.event} center />
        <div style={{ width: '100%', flex: 'none' }}><Coming list={coming} portrait /></div>
      </div>
    );
  }
  const long = isLong(m.name);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {long && <div style={{ flex: 'none', marginTop: 6 }}><Name name={m.name} size="wide" align="start" k={m.key} /></div>}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.12fr) minmax(0, 1fr)', columnGap: 44, alignItems: 'stretch', marginTop: long ? 0 : 8 }}>
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          {!long && <Name name={m.name} size="side" align="start" k={m.key} />}
          <DateLine m={m} />
          <Begins m={m} />
          <EventLine ev={m.event} />
        </div>
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Count m={m} portrait={false} art={art} rich={rich} compact={long} /></div>
      </div>
      <Coming list={coming} portrait={false} />
    </div>
  );
}

/** The vort page: the name and the countdown on one compact line, then the explanation (one language per page when it is long) and its source. */
function VortView({ m, ex, portrait }) {
  const w = m.words;
  const line = m.form === 'day' || m.form === 'zero' ? m.dayLabel || m.zero : null;
  const nm = [m.name.he, m.name.en].filter(Boolean);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <Fit key={`vn|${m.key}|${portrait}`} max={portrait ? 64 : 58} min={32} style={{ flex: 'none', width: '100%', height: portrait ? 84 : 74, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--ink)', marginTop: 6 }}>
        {nm.map((t, i) => <span key={i} dir={textDir(t)} className={textDir(t) === 'rtl' ? 'tt-he' : ''} style={{ fontFamily: textDir(t) === 'rtl' ? F.heD : F.enD, color: i ? 'var(--inkDim)' : 'var(--ink)', marginLeft: i ? '.6em' : 0, unicodeBidi: 'isolate' }}>{bidiNodes(t)}</span>)}
      </Fit>
      <div className="tt-num" style={{ flex: 'none', display: 'flex', gap: '4px 18px', alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', color: 'var(--accentText)', marginTop: 2 }}>
        {line ? (
          <>{line.en && <span style={{ fontFamily: F.en, fontSize: 34, fontWeight: 700 }}>{line.en}</span>}{line.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(34), fontWeight: 600 }}>{line.he}</span>}</>
        ) : (
          <>
            <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-.03em' }}>{w.big}</span>
            {w.unit.en && <span style={{ fontFamily: F.en, fontSize: 30, fontWeight: 650 }}>{w.unit.en}{w.sub?.en ? ` ${w.sub.en}` : ''}</span>}
            {w.unit.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(30), fontWeight: 600 }}>{w.unit.he}{w.sub?.he ? ` ${w.sub.he}` : ''}</span>}
          </>
        )}
      </div>
      <Explain ex={ex} k={`${m.key}|${ex.en ? 'e' : ''}${ex.he ? 'h' : ''}`} />
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
  const art = design.graphics !== 'off';
  const rich = design.graphics === 'rich';
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
  // rotation once for the time all the pages need, never a scroll.
  const pages = useMemo(() => (model?.rows || []).flatMap((r) => (r.explain && r.form !== 'zero'
    ? [{ m: r, view: 'main', secs: model.cycleSeconds }, ...vortParts(r.explain).map((ex) => ({ m: r, view: 'vort', ex, secs: readSecs(ex) }))]
    : [{ m: r, view: 'main', secs: model.cycleSeconds }])), [model]);
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

  if (!model || !n) {
    return (
      <Panel pad="38px 60px">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, color: 'var(--ink)', fontFamily: F.en, fontSize: 34 }}>
          <Ornament size={40} style={{ color: 'var(--accentText)' }} /> Nothing to count down to right now
        </div>
      </Panel>
    );
  }
  const cur = pages[Math.min(page, pages.length - 1)] || { m: model.rows[0], view: 'main' };
  const m = cur.m;
  const coming = model.coming;
  const at = model.rows.findIndex((r) => r.key === m.key);
  const pager = n > 1 ? `${at + 1} / ${n}` : '';
  const pad = portrait ? '40px 48px 38px' : '32px 56px 30px';
  return (
    <Panel pad={pad} data-occ-form={m.form} data-occ-view={cur.view}>
      {m.form === 'zero' && m.celebrate && <Confetti key={`c|${m.key}`} graphics={design.graphics} motion={design.motion} />}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Kicker pager={pager} />
        {cur.view === 'vort' ? <VortView m={m} ex={cur.ex} portrait={portrait} />
          : m.form === 'zero' ? <ZeroView m={m} portrait={portrait} design={design} />
          : m.form === 'day' ? <DayView m={m} portrait={portrait} coming={coming} art={art} />
            : <CountView m={m} portrait={portrait} coming={coming} art={art} rich={rich} />}
      </div>
    </Panel>
  );
}
