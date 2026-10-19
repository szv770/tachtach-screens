import React, { useLayoutEffect, useRef, useState } from 'react';
import { F, Bidi, he as heSize } from '../../../design/ui.jsx';
import { Fit } from '../../../design/fit.jsx';
import { durationText } from '../../../design/time.js';
import { focusPick, focusSizes, pastFade, slotProgress } from '../../../../shared/scheduleLayout.js';
import { hm, ap, catVars, inkAt, contentKey } from './model.js';
import { SplitTimes, rangeText, useRefit } from './parts.jsx';

/**
 * Focus: the last 2-3 finished rows faded (by colour, oldest faintest), NOW large with "ends in N min" and a
 * progress bar (or NEXT with "starts in N min" when nothing runs), the next rows at decreasing size, and
 * everything after them in one ruled strip ("Later · 9:45 Lights out · ... + 6 more"). Never scrolls: the
 * rows that do not fit are measured once and handed to the strip.
 */

function Bar({ s, color }) {
  return <i aria-hidden="true" style={{ flex: 'none', alignSelf: 'center', width: '.18em', height: '.8em', borderRadius: '.09em', background: color || 'var(--catDot)' }} />;
}

function PastRow({ s, k, timeW }) {
  const c = inkAt(pastFade(k));
  return (
    <div data-row={s.id} data-state="past" data-fade={pastFade(k)} style={{ ...catVars(s), display: 'grid', gridTemplateColumns: `${timeW}px .9em minmax(0, 1fr)`, alignItems: 'baseline', columnGap: 0, fontSize: 27, color: c, lineHeight: 1.3 }}>
      <span className="tt-num" style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', paddingRight: '.5em' }}>{hm(s.v)}<small data-ap="" style={{ fontSize: '.56em', marginLeft: '.3em', fontWeight: 700 }}>{ap(s.v)}</small></span>
      <Bar s={s} color={c} />
      <span style={{ display: 'flex', gap: '.6em', minWidth: 0, alignItems: 'baseline' }}>
        <Bidi text={s.primary} fallback={s.primaryHe ? 'rtl' : 'ltr'} style={{ fontFamily: s.primaryHe ? F.heD : F.enD, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }} />
        {s.end != null && <span className="tt-num" style={{ fontSize: '.8em', whiteSpace: 'nowrap', flex: 'none' }}>until {hm(s.end)}</span>}
      </span>
    </div>
  );
}

function Hero({ s, role, now, running, portrait }) {
  const isNow = role === 'now';
  const slot = isNow && running?.length ? s.slots[running[0]] : s.slots.find((x) => x.v > now) || s.slots[0];
  const p = isNow ? slotProgress(slot, now) : 0;
  const endAt = slot.end ?? slot.v + 5;
  const ink = isNow ? 'var(--fillInk)' : 'var(--ink)';
  const dim = isNow ? 'color-mix(in srgb, var(--fillInk) 76%, transparent)' : 'var(--inkDim)';
  const nameMax = portrait ? 62 : 70;
  const runLabel = s.split && slot.label ? slot.label : '';
  return (
    <div data-hero={role} data-row={s.id} data-state={role} style={{
      ...catVars(s), flex: 'none', borderRadius: 26, padding: portrait ? '22px 28px 24px' : '22px 32px 24px', marginTop: 12,
      background: isNow ? 'var(--fill)' : 'var(--hi)', color: ink,
      boxShadow: isNow ? '0 10px 30px color-mix(in srgb, var(--fill) 28%, transparent)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, fontFamily: F.en, fontSize: 26, fontWeight: 650, color: isNow ? dim : 'var(--accentText)' }}>
        <span>{isNow ? 'Now' : 'Next'}{runLabel ? ` · ${runLabel}` : ''}</span>
        <span className="tt-num" data-eta="" style={{ whiteSpace: 'nowrap' }}>{isNow ? `ends in ${durationText(endAt - now)}` : `starts in ${durationText(slot.v - now)}`}</span>
      </div>
      <Fit max={nameMax} min={34} dir={s.primaryHe ? 'rtl' : 'ltr'} style={{ height: Math.round(nameMax * 1.22), marginTop: 4, fontFamily: s.primaryHe ? F.heD : F.enD, fontWeight: 650, letterSpacing: s.primaryHe ? 0 : '-.02em', lineHeight: 1.18, textAlign: 'left' }}>
        {s.primary}
      </Fit>
      {s.secondary && <Bidi as="div" text={s.secondary} fallback="rtl" style={{ fontFamily: F.heD, fontSize: heSize(34), fontWeight: 500, color: dim, textAlign: 'left', lineHeight: 1.25 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
        <span className="tt-num" style={{ fontSize: portrait ? 38 : 42, fontWeight: 650, letterSpacing: '-.03em', whiteSpace: 'nowrap', lineHeight: 1 }}>
          {slot.end != null ? rangeText(slot.v, slot.end) : rangeText(slot.v, null)}
        </span>
        {isNow && slot.end != null && (
          <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'color-mix(in srgb, var(--fillInk) 24%, transparent)', overflow: 'hidden' }}>
            <b style={{ display: 'block', height: '100%', width: `${(p * 100).toFixed(1)}%`, background: 'var(--fillInk)', borderRadius: 5 }} />
          </span>
        )}
      </div>
      {s.split && <SplitTimes split={s.split} now={now} color={dim} onColor={ink} size="24px" style={{ display: 'block', marginTop: 12 }} />}
    </div>
  );
}

function UpRow({ s, state, size, timeW, now, first, hidden }) {
  const isNext = state === 'next', isNow = state === 'now';
  const tc = isNext || isNow ? 'var(--accentText)' : 'var(--ink)';
  return (
    <div data-row={s.id} data-state={state || 'later'} data-size={size} style={{
      ...catVars(s), visibility: hidden ? 'hidden' : 'visible', display: 'grid', gridTemplateColumns: `${timeW}px ${Math.round(size * 0.9)}px minmax(0, 1fr)`,
      alignItems: 'baseline', fontSize: size, lineHeight: 1.22, padding: `${Math.round(size * 0.2)}px 0`, borderTop: first ? 'none' : '2px solid var(--line)',
    }}>
      <span className="tt-num" style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 650, letterSpacing: '-.03em', color: tc, paddingRight: '.45em' }}>
        {hm(s.v)}<small data-ap="" style={{ fontFamily: F.en, fontSize: '.54em', fontWeight: 700, marginLeft: '.3em', letterSpacing: '.02em', color: isNext ? 'var(--accentText)' : 'var(--inkDim)' }}>{ap(s.v)}</small>
      </span>
      <Bar s={s} color={isNext ? 'var(--accentText)' : undefined} />
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '.6em', minWidth: 0 }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '0 1 auto' }}>
          <Bidi text={s.primary} fallback={s.primaryHe ? 'rtl' : 'ltr'} style={{ fontFamily: s.primaryHe ? F.heD : F.enD, fontWeight: 600, letterSpacing: s.primaryHe ? 0 : '-.012em', overflowWrap: 'anywhere' }} />
          {s.split && <SplitTimes split={s.split} now={now} size=".62em" />}
        </span>
        {s.end != null && !s.split && <span className="tt-num" style={{ flex: 'none', fontSize: '.62em', fontWeight: 600, color: 'var(--inkDim)', whiteSpace: 'nowrap' }}>to {hm(s.end)}</span>}
        <span style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'baseline', gap: '.7em' }}>
          {s.secondary && <Bidi text={s.secondary} fallback="rtl" style={{ fontFamily: F.heD, fontWeight: 500, fontSize: 'calc(.8em * var(--he-scale, 1))', color: 'var(--inkDim)', whiteSpace: 'nowrap' }} />}
          {isNext && <span className="tt-num" style={{ fontFamily: F.en, fontSize: '.6em', fontWeight: 650, color: 'var(--accentText)', whiteSpace: 'nowrap' }}>in {durationText(s.v - now)}</span>}
          {isNow && <span style={{ fontFamily: F.en, fontSize: '.6em', fontWeight: 650, color: 'var(--accentText)', whiteSpace: 'nowrap' }}>now</span>}
        </span>
      </span>
    </div>
  );
}

function LaterStrip({ rows }) {
  const boxRef = useRef(null);
  const [shown, setShown] = useState(rows.length);
  const key = contentKey(rows);
  const measure = () => {
    const el = boxRef.current; if (!el) return;
    const chips = [...el.querySelectorAll('[data-chip]')];
    chips.forEach((c) => { c.style.display = ''; });
    const more = el.querySelector('[data-more]');
    const limit = el.clientWidth - (more ? more.offsetWidth + 24 : 0);
    let k = 0;
    for (const c of chips) { if (c.offsetLeft + c.offsetWidth <= limit + 1) k++; else break; }
    setShown(k === chips.length && (!more || el.scrollWidth <= el.clientWidth + 1) ? chips.length : k);
  };
  useRefit(measure, boxRef, [key]);
  if (!rows.length) return null;
  const hiddenN = rows.length - shown;
  return (
    <div ref={boxRef} data-strip="" style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 26, borderTop: '2px solid var(--line)', paddingTop: 14, marginTop: 6, fontFamily: F.en, fontSize: 24, fontWeight: 600, color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', position: 'relative' }}>
      <span style={{ color: 'var(--ink)', fontWeight: 700 }}>Later</span>
      {rows.map((s, i) => (
        <span key={s.id || i} data-chip="" style={{ ...catVars(s), display: i < shown ? 'inline-flex' : 'none', alignItems: 'baseline', gap: '.4em' }}>
          <span className="tt-num" style={{ color: 'var(--ink)', fontWeight: 650 }}>{hm(s.v)}</span>
          <Bidi text={s.primary} />
        </span>
      ))}
      {hiddenN > 0 && <span data-more="" style={{ marginLeft: 'auto', flex: 'none' }}>+ {hiddenN} more{rows.length ? ` · until ${hm(rows[rows.length - 1].v)} ${ap(rows[rows.length - 1].v)}` : ''}</span>}
    </div>
  );
}

export default function FocusView({ items, states, now, portrait }) {
  const pick = focusPick(items, states, { pastCount: portrait ? 3 : 2, upMax: portrait ? 10 : 7 });
  const listRef = useRef(null);
  const [fitN, setFitN] = useState(pick.up.length);
  const sizes = focusSizes(pick.up.length, { first: portrait ? 40 : 38, ratio: 0.94, floor: 28 });
  const timeW = Math.round(sizes[0] ? sizes[0] * 3.75 : 140);
  const upKey = pick.up.join(',') + '|' + contentKey(pick.up.map((k) => items[k]));
  const measure = () => {
    const el = listRef.current; if (!el) return;
    const rows = [...el.children];
    let k = 0;
    for (const r of rows) { if (r.offsetTop + r.offsetHeight <= el.clientHeight + 1) k++; else break; }
    setFitN(k);
  };
  useRefit(measure, listRef, [upKey, pick.hero, items.length]);

  if (pick.heroRole === 'done') {
    return (
      <div data-sched-view="focus" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div data-hero="done" style={{ borderRadius: 26, padding: '26px 32px', marginTop: 12, background: 'var(--hi)' }}>
          <div style={{ fontFamily: F.enD, fontSize: 56, fontWeight: 650, letterSpacing: '-.02em' }}>That’s all for today</div>
          <div style={{ fontFamily: F.en, fontSize: 28, color: 'var(--inkDim)', marginTop: 6 }}>Good night!</div>
        </div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pick.past.map((k, j) => <PastRow key={items[k].id} s={items[k]} k={pick.past.length - j} timeW={130} />)}
        </div>
      </div>
    );
  }

  const shown = pick.up.slice(0, fitN);
  const rest = [...pick.up.slice(fitN), ...pick.rest].map((k) => items[k]);
  return (
    <div data-sched-view="focus" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {pick.past.length > 0 && (
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
          {pick.past.map((k, j) => <PastRow key={items[k].id} s={items[k]} k={pick.past.length - j} timeW={timeW} />)}
        </div>
      )}
      <Hero s={items[pick.hero]} role={pick.heroRole} now={now} running={states.running[pick.hero]} portrait={portrait} />
      <div ref={listRef} data-up="" style={{ flex: 1, minHeight: 0, overflow: 'hidden', marginTop: 14, display: 'flex', flexDirection: 'column' }}>
        {pick.up.map((k, j) => (
          <UpRow key={items[k].id || k} s={items[k]} state={states.st[k]} size={sizes[j]} timeW={timeW} now={now} first={j === 0} hidden={j >= fitN} />
        ))}
      </div>
      <LaterStrip rows={rest} />
    </div>
  );
}

