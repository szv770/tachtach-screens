import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { focusDate, weekGrid } from '../../../shared/menu.js';
import {
  WORDS, DAY_EN, DAY_HE, DAY_EN_SHORT, DAY_HE_SHORT, tagInfo, fill,
} from '../../../shared/menuCopy.js';
import {
  TIERS, WEEK_TIERS, PAGE_SECONDS, WEEK_SECONDS, MIN_TODAY_SECONDS, planPages, startFit, nextFit, startWeekFit, nextWeekFit, weekCell,
} from '../../../shared/menuPages.js';

/**
 * Menu slide (spec docs/specs/05-MENU.md): what is for breakfast, lunch and dinner, readable from across the room.
 *
 *   Today view   one card per meal (up to 4 across, 3 stacked in portrait), the meal being served now highlighted,
 *                dishes in English and Hebrew, small tags as 'code + word' chips (never colour alone). After the last
 *                meal it shows tomorrow's. Dishes are NEVER cut off (allergy safety): the text shrinks to the floor,
 *                then fewer cards go on a page, then one meal's dishes are shared over pages. Every page is measured
 *                from the real boxes (shared/menuPages.js steps), never guessed.
 *   Week view    a grid of the week, today's column highlighted, a few dishes per cell with '+N more'.
 *   closed day   one big card with the note, then the next day that has meals.
 *
 * The slide steps through its pages itself (one finite opacity change, instant under Minimal motion) and asks the
 * rotation for the time that needs (onRequestDuration). Roles and font roles only; nothing loops.
 */

const heBox = { fontFamily: F.he, lineHeight: 1.35 };

function useFontsKey() {
  const [k, setK] = useState(0);
  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setK((n) => n + 1); };
    document.fonts?.ready?.then(bump).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, []);
  return k;
}

function Plate({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="32" r="22" />
        <circle cx="32" cy="32" r="13" />
        <path d="M6 14v14c0 3 2 5 4 5s4-2 4-5V14M10 33v17M58 14c-5 2-7 8-7 15 0 4 2 6 5 6v15" />
      </g>
    </svg>
  );
}

function titleOf(kind, dow) {
  if (kind === 'tomorrow') return { en: WORDS.tomorrow.en, he: WORDS.tomorrow.he, sufEn: DAY_EN[dow], sufHe: DAY_HE[dow] };
  if (kind === 'later') return { en: fill(WORDS.later.en, { day: DAY_EN[dow] }), he: fill(WORDS.later.he, { dayHe: DAY_HE[dow].replace(/^יום /, '') }), sufEn: '', sufHe: '' };
  return { en: WORDS.today.en, he: WORDS.today.he, sufEn: '', sufHe: '' }; // the rail already shows today's weekday and date
}

function Header({ en, heText, sufEn, sufHe, portrait, art }) {
  const size = portrait ? 48 : 50;
  return (
    <header data-s="" style={{
      '--i': 0, flex: 'none', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center',
      justifyContent: 'space-between', gap: portrait ? 4 : 28, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
        {art && <span style={{ color: 'var(--accentText)', display: 'flex' }}><Plate size={portrait ? 46 : 50} /></span>}
        <span style={{ fontFamily: F.enD, fontSize: size, fontWeight: 750, letterSpacing: '-.015em', lineHeight: 1.1, color: 'var(--ink)', minWidth: 0 }}>
          {en}
          {sufEn && <span style={{ fontFamily: F.en, fontSize: 34, fontWeight: 500, color: 'var(--inkDim)', letterSpacing: 0 }}>{'  ·  '}{sufEn}</span>}
        </span>
      </div>
      <span dir="rtl" className="tt-he" style={{ fontFamily: F.heD, fontSize: he(size), fontWeight: 650, lineHeight: 1.2, color: 'var(--ink)', minWidth: 0 }}>
        {heText}{sufHe && <span style={{ fontSize: he(34), fontWeight: 500, color: 'var(--inkDim)' }}>{' · '}{sufHe}</span>}
      </span>
    </header>
  );
}

function Footer({ settings, portrait }) {
  const en = settings.disclaimer, hebrew = settings.disclaimerHe;
  if (!en && !hebrew) return null;
  return (
    <footer data-s="" style={{ '--i': 6, flex: 'none', display: 'flex', flexDirection: portrait ? 'column' : 'row', justifyContent: 'center', alignItems: 'center', gap: portrait ? 4 : 28, marginTop: 14, textAlign: 'center' }}>
      {en && <span dir={textDir(en)} style={{ fontFamily: F.en, fontSize: 24, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.25 }}>{bidiNodes(en)}</span>}
      {hebrew && <span dir="rtl" className="tt-he" style={{ ...heBox, fontSize: he(24), fontWeight: 500, color: 'var(--ink)' }}>{hebrew}</span>}
    </footer>
  );
}

function TagChip({ id, compact }) {
  const t = tagInfo(id);
  if (!t) return null;
  return (
    <span data-chip="" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: F.en, fontSize: 24, fontWeight: 650, lineHeight: 1.1, whiteSpace: 'nowrap',
      color: 'var(--ink)', border: '2px solid var(--line)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 999, padding: '3px 12px 3px 9px',
    }}>
      <span style={{ fontWeight: 800, letterSpacing: '.04em', color: 'var(--accentText)' }}>{t.short}</span>
      {!compact && <span>{t.en}</span>}
    </span>
  );
}

/** Under compact chips: what each code on this page means (a tag is never colour or a bare code alone). */
function Legend({ cards, tags }) {
  const used = [...new Set(cards.flatMap((c) => c.items.flatMap((i) => i.tags || [])))].filter((t) => tags.includes(t));
  if (!used.length) return null;
  return (
    <div data-legend="" style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 22px', justifyContent: 'center', fontFamily: F.en, fontSize: 24, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.2 }}>
      {used.map((t) => { const i = tagInfo(t); return <span key={t} style={{ whiteSpace: 'nowrap' }}><b style={{ color: 'var(--accentText)', letterSpacing: '.04em' }}>{i.short}</b> {i.en} <span dir="rtl" className="tt-he" style={{ fontFamily: F.he }}>{i.he}</span></span>; })}
    </div>
  );
}

function Dish({ item, size, tags, compact }) {
  const chips = (item.tags || []).filter((t) => tags.includes(t));
  const chipRow = chips.length > 0 && (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, verticalAlign: 'middle' }}>{chips.map((t) => <TagChip key={t} id={t} compact={compact} />)}</span>
  );
  const heLine = item.he && (
    <span dir="rtl" className="tt-he" style={{ ...heBox, fontSize: he(size), fontWeight: 560, color: 'var(--ink)', overflowWrap: 'anywhere', textAlign: 'start', minWidth: 0 }}>{item.he}</span>
  );
  return (
    <li style={{ listStyle: 'none', margin: 0, padding: 0, minWidth: 0 }}>
      {item.en && (
        <div dir={textDir(item.en)} style={{ fontFamily: F.en, fontSize: size, fontWeight: 580, lineHeight: 1.2, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
          {bidiNodes(item.en)}{!item.he && chipRow && <span style={{ marginInlineStart: 12 }}>{chipRow}</span>}
        </div>
      )}
      {item.he && (
        // tags sit on the left of the Hebrew line (which is right-aligned), so a bilingual dish stays two lines
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 'none' }}>{chipRow}</span>
          {heLine}
        </div>
      )}
    </li>
  );
}

function MealCard({ c, size, flags, tags, compact }) {
  const mt = c.meal.mt;
  const isNow = flags.now === c.meal.type;
  const isNext = !isNow && flags.next === c.meal.type;
  const last = c.part === c.parts;
  return (
    <section data-mcard="" style={{
      boxSizing: 'border-box', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 18px 16px', borderRadius: 24,
      border: `${isNow ? 4 : 2}px solid ${isNow ? 'var(--accentText)' : 'var(--line)'}`,
      background: isNow ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'color-mix(in srgb, var(--ink) 5%, transparent)',
    }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: F.enD, fontSize: 38, fontWeight: 720, lineHeight: 1.1, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{mt.en || mt.he}</div>
          {mt.en && mt.he && <div dir="rtl" className="tt-he" style={{ fontFamily: F.heD, fontSize: he(30), fontWeight: 600, lineHeight: 1.25, color: 'var(--ink)' }}>{mt.he}</div>}
          {c.parts > 1 && <div className="tt-num" style={{ fontFamily: F.num, fontSize: 26, color: 'var(--ink)', marginTop: 4 }}>{fill(WORDS.part.en, { i: c.part, n: c.parts })}</div>}
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {mt.time && <span className="tt-num" style={{ fontFamily: F.num, fontSize: 32, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{mt.time}</span>}
          {(isNow || isNext) && (
            <span style={{
              display: 'inline-flex', gap: 10, alignItems: 'baseline', fontFamily: F.en, fontSize: 24, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              padding: '4px 14px', borderRadius: 999, background: isNow ? 'var(--fill)' : 'transparent', color: isNow ? 'var(--fillInk)' : 'var(--ink)', border: `2px solid ${isNow ? 'var(--fill)' : 'var(--line)'}`,
            }}>
              {isNow ? WORDS.now.en : WORDS.next.en}
              <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, letterSpacing: 0, fontWeight: 700 }}>{isNow ? WORDS.now.he : WORDS.next.he}</span>
            </span>
          )}
        </div>
      </div>
      <ul data-mlist="" style={{ flex: 1, minHeight: 0, margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: Math.round(size * 0.24) }}>
        {c.items.map((it) => <Dish key={it.id} item={it} size={size} tags={tags} compact={compact} />)}
      </ul>
      {c.meal.note && last && <div dir={textDir(c.meal.note)} style={{ flex: 'none', fontFamily: F.en, fontSize: 26, fontStyle: 'italic', color: 'var(--ink)', lineHeight: 1.25 }}>{bidiNodes(c.meal.note)}</div>}
    </section>
  );
}

/** Every page of the Today view is rendered (stacked) so they are all measured at once; `page` is the visible one. */
function TodayBody({ day, settings, portrait, page, onPages }) {
  const fonts = useFontsKey();
  const meals = day.meals;
  const sig = useMemo(
    () => `${meals.map((m) => `${m.type}:${m.items.map((i) => `${i.id}${i.en}${i.he}${(i.tags || []).join('')}`).join('|')}${m.note}`).join('/')}|${portrait}|${settings.tags.join(',')}|${fonts}`,
    [meals, portrait, settings.tags, fonts],
  );
  const [st, setSt] = useState({ sig: '', fit: startFit(meals.length, portrait) });
  const fit = st.sig === sig ? st.fit : startFit(meals.length, portrait);
  const plan = useMemo(() => planPages(meals, fit), [meals, fit]);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const over = [...root.querySelectorAll('[data-mlist]')].some((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    if (over) { const n = nextFit(fit); if (n) setSt({ sig, fit: n }); }
  }, [plan, fit, sig]);
  useEffect(() => { onPages?.(plan.length); }, [plan.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const size = TIERS[fit.tier];
  const at = Math.min(page, plan.length - 1);
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {plan.map((cards, i) => (
        <div key={i} data-mpage={i} style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12,
          opacity: i === at ? 1 : 0, visibility: i === at ? 'visible' : 'hidden',
        }}>
          <div style={{
            flex: 1, minHeight: 0, display: 'grid', gap: 16,
            gridTemplateColumns: portrait ? 'minmax(0, 1fr)' : `repeat(${cards.length}, minmax(0, 1fr))`,
            gridTemplateRows: portrait ? `repeat(${cards.length}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
          }}>
            {cards.map((c) => <MealCard key={`${c.meal.type}-${c.part}`} c={c} size={size} flags={day} tags={settings.tags} compact={fit.compact} />)}
          </div>
          {fit.compact && <Legend cards={cards} tags={settings.tags} />}
        </div>
      ))}
    </div>
  );
}

function ClosedBody({ day, portrait }) {
  const t = day.kind === 'today';
  const en = day.note || (t ? WORDS.closedToday.en : WORDS.closed.en);
  const heText = day.noteHe || (day.note ? '' : (t ? WORDS.closedToday.he : WORDS.closed.he));
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center', alignItems: 'center', textAlign: 'center', borderRadius: 24, border: '2px solid var(--line)', background: 'color-mix(in srgb, var(--ink) 5%, transparent)', padding: '30px 40px' }}>
      <Fit key={`c|${en}|${portrait}`} wrap max={portrait ? 92 : 104} min={44} dir={textDir(en)} style={{ width: '100%', flex: '1 1 0', minHeight: 0, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15, fontFamily: F.enD, fontWeight: 750, color: 'var(--ink)' }}>{en}</Fit>
      {heText && <div dir="rtl" className="tt-he" style={{ flex: 'none', fontFamily: F.heD, fontSize: he(portrait ? 52 : 56), fontWeight: 650, lineHeight: 1.3, color: 'var(--ink)' }}>{heText}</div>}
    </div>
  );
}

function dishName(it) { return it.en || it.he; }

function WeekBody({ grid, settings, portrait, today, onTruncated }) {
  const fonts = useFontsKey();
  const cap0 = settings.weekDishes;
  const sig = useMemo(() => `${grid.weekStart}|${grid.rows.map((r) => `${r.id}:${Object.entries(r.cells).map(([d, it]) => `${d}${it.map((x) => x.id + x.en + x.he).join(',')}`).join(';')}`).join('/')}|${grid.days.map((d) => d.code + d.closed + d.note).join(',')}|${portrait}|${cap0}|${fonts}`, [grid, portrait, cap0, fonts]);
  const [st, setSt] = useState({ sig: '', fit: startWeekFit(cap0) });
  const fit = st.sig === sig ? st.fit : startWeekFit(cap0);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const over = [...root.querySelectorAll('[data-wcell]')].some((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    if (over) { const n = nextWeekFit(fit); if (n) setSt({ sig, fit: n }); }
  }, [fit, sig]);
  const size = WEEK_TIERS[fit.tier];
  const days = grid.days, rows = grid.rows;
  const truncated = rows.some((r) => Object.values(r.cells).some((it) => weekCell(it, fit.cap).more > 0));
  useEffect(() => { onTruncated?.(truncated); }, [truncated]); // eslint-disable-line react-hooks/exhaustive-deps

  const box = { boxSizing: 'border-box', minWidth: 0, minHeight: 0, borderRadius: 16, background: 'color-mix(in srgb, var(--ink) 5%, transparent)', padding: '12px 14px', overflow: 'hidden' };
  const isToday = (d) => d.date === today;
  const head = (d) => (
    <div key={`h-${d.code}`} style={{ ...box, display: 'flex', flexDirection: portrait ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 14 : 2, textAlign: 'center',
      background: isToday(d) ? 'var(--fill)' : box.background, color: isToday(d) ? 'var(--fillInk)' : 'var(--ink)', padding: '8px 10px',
      ...(portrait ? { gridRow: 'auto' } : {}) }}>
      <span style={{ fontFamily: F.en, fontSize: 30, fontWeight: 750, lineHeight: 1.1 }}>{DAY_EN_SHORT[d.code]}</span>
      <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: he(26), fontWeight: 600, lineHeight: 1.2 }}>{DAY_HE_SHORT[d.code]}</span>
    </div>
  );
  const label = (r) => (
    <div key={`l-${r.id}`} style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, background: 'transparent', padding: '8px 6px' }}>
      <span style={{ fontFamily: F.en, fontSize: 28, fontWeight: 720, lineHeight: 1.1, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{r.en || r.he}</span>
      {r.en && r.he && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: he(26), lineHeight: 1.25, color: 'var(--ink)' }}>{r.he}</span>}
    </div>
  );
  const cell = (r, d) => {
    const items = r.cells[d.code];
    const { shown, more } = weekCell(items, fit.cap);
    return (
      <div key={`${r.id}-${d.code}`} data-wcell="" style={{ ...box, background: isToday(d) ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : box.background, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
        {(shown || []).map((it) => {
          const n = dishName(it);
          return <span key={it.id} dir={textDir(n)} style={{ fontFamily: it.en ? F.en : F.he, fontSize: it.en ? size : he(size), fontWeight: 560, lineHeight: 1.2, color: 'var(--ink)', overflowWrap: 'anywhere', textAlign: 'start', ...(fit.clamp ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: fit.clamp, overflow: 'hidden' } : {}) }}>{n}</span>;
        })}
        {more > 0 && <span style={{ fontFamily: F.en, fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{fill(WORDS.more.en, { n: more })}</span>}
      </div>
    );
  };
  const closedCell = (d, span) => (
    <div key={`c-${d.code}`} data-wcell="" style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...span, background: isToday(d) ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : box.background }}>
      <span dir={textDir(d.note || WORDS.closed.en)} style={{ fontFamily: F.en, fontSize: 28, fontWeight: 650, color: 'var(--ink)', lineHeight: 1.2 }}>{d.note || d.noteHe || WORDS.closed.en}</span>
    </div>
  );

  const m = rows.length;
  let cells;
  let template;
  if (!portrait) {
    template = { gridTemplateColumns: `190px repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${Math.max(1, m)}, minmax(0, 1fr))` };
    cells = [<div key="corner" />, ...days.map(head)];
    rows.forEach((r, ri) => {
      cells.push(label(r));
      days.forEach((d) => {
        if (d.closed) { if (ri === 0) cells.push(closedCell(d, { gridRow: `2 / span ${Math.max(1, m)}` })); return; }
        cells.push(cell(r, d));
      });
    });
    if (!m) days.forEach((d) => d.closed && cells.push(closedCell(d, {})));
  } else {
    template = { gridTemplateColumns: `150px repeat(${Math.max(1, m)}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${days.length}, minmax(0, 1fr))` };
    cells = [<div key="corner" />, ...rows.map(label)];
    days.forEach((d) => {
      cells.push(head(d));
      if (d.closed) { cells.push(closedCell(d, { gridColumn: `2 / span ${Math.max(1, m)}` })); return; }
      rows.forEach((r) => cells.push(cell(r, d)));
    });
  }
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, display: 'grid', gap: 8, ...template }}>{cells}</div>
  );
}

export default function MenuSlide({ menu, now, tz, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const art = design.graphics !== 'off';
  const focus = useMemo(() => { try { return menu ? focusDate(menu, now || new Date(), tz) : null; } catch { return null; } }, [menu, now, tz]);
  const grid = useMemo(() => (focus ? weekGrid(menu, focus.date) : null), [menu, focus]);
  const [pages, setPages] = useState(1);
  const [truncated, setTruncated] = useState(false);
  const [step, setStep] = useState(0);
  const base = Number(slide?.duration) || 0;

  const settings = menu?.settings;
  const todayDay = focus ? (focus.closed ? focus.following : focus) : null;
  const wantWeek = !!grid && settings?.view !== 'today' && grid.days.length > (settings?.view === 'both' ? 1 : 0);
  const showToday = !!todayDay && (settings?.view !== 'week' || !wantWeek);
  const steps = [];
  if (focus?.closed) steps.push({ t: 'closed', s: 8 });
  if (showToday) for (let i = 0; i < pages; i++) steps.push({ t: 'today', page: i, s: pages === 1 && !focus?.closed ? MIN_TODAY_SECONDS : PAGE_SECONDS });
  if (wantWeek) steps.push({ t: 'week', s: WEEK_SECONDS });
  const n = steps.length;
  const total = steps.reduce((a, x) => a + x.s, 0) + 2;
  const key = `${focus?.date}|${focus?.kind}`;
  const nRef = useRef(n);
  nRef.current = n;
  const curSeconds = steps.length ? steps[Math.min(step, n - 1)].s : 0;

  useEffect(() => { setStep(0); }, [key]);
  // Ask the rotation for the time every page needs (only ever more than the slide's own seconds).
  useEffect(() => { if (n > 1 && onRequestDuration && total > Math.max(base, 0)) onRequestDuration(total); }, [total, n]); // eslint-disable-line react-hooks/exhaustive-deps
  // One timer per page. It does not restart when a page count settles after the fonts load, only when the page changes.
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setTimeout(() => setStep((x) => (x + 1) % Math.max(1, nRef.current)), curSeconds * 1000);
    return () => clearTimeout(t);
  }, [step, n < 2, curSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!focus || !settings || n === 0) return null;
  const at = steps[Math.min(step, n - 1)];
  const fade = design.motion === 'minimal' ? 'none' : 'opacity 500ms ease';
  const layer = (on) => ({ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', opacity: on ? 1 : 0, visibility: on ? 'visible' : 'hidden', transition: fade });
  const tt = titleOf(focus.kind, focus.dow);
  const fdow = todayDay?.dow;
  const tf = todayDay ? titleOf(focus.closed ? todayDay.kind : focus.kind, fdow) : tt;
  const weekNext = grid && grid.weekStart !== focus.today && grid.weekStart > focus.today;
  const weekTitle = weekNext ? WORDS.nextWeek : WORDS.week;

  return (
    <Panel pad={portrait ? '36px 40px 32px' : '30px 48px 28px'}>
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
        {focus.closed && (
          <div style={layer(at.t === 'closed')}>
            <Header en={tt.en} heText={tt.he} sufEn={tt.sufEn} sufHe={tt.sufHe} portrait={portrait} art={art} />
            <ClosedBody day={focus} portrait={portrait} />
            <Footer settings={settings} portrait={portrait} />
          </div>
        )}
        {showToday && (
          <div style={layer(at.t === 'today')}>
            <Header en={tf.en} heText={tf.he} sufEn={tf.sufEn} sufHe={tf.sufHe} portrait={portrait} art={art} />
            <TodayBody day={todayDay} settings={settings} portrait={portrait} page={at.t === 'today' ? at.page : 0} onPages={setPages} />
            <Footer settings={settings} portrait={portrait} />
          </div>
        )}
        {wantWeek && (
          <div style={layer(at.t === 'week')}>
            <Header en={weekTitle.en} heText={weekTitle.he} portrait={portrait} art={art} />
            <WeekBody grid={grid} settings={settings} portrait={portrait} today={focus.today} onTruncated={setTruncated} />
            {truncated && settings.view === 'both' && (
              <footer style={{ flex: 'none', marginTop: 12, textAlign: 'center', fontFamily: F.en, fontSize: 24, fontWeight: 500, color: 'var(--ink)' }}>
                {WORDS.fullMenu.en}<span dir="rtl" className="tt-he" style={{ fontFamily: F.he, marginInlineStart: 18 }}>{WORDS.fullMenu.he}</span>
              </footer>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
