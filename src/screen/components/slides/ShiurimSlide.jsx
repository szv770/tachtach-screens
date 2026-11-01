import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he, bidiNodes, TimeText } from '../../design/ui.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { zonedParts, DEFAULT_TZ } from '../../../shared/announcements.js';
import {
  shiurimOn, sortRows, currentNext, byRebbe, byDay, pickLang, personName, DEFAULT_SETTINGS, fmt12,
} from '../../../shared/shiurim.js';
import { WORDS, DAYS, DAY_EN, DAY_HE } from '../../../shared/shiurimCopy.js';
import {
  ROW_TIERS, CARD_TIERS, PAGE_SECONDS, WEEK_SECONDS, MIN_SECONDS, startRowFit, nextRowFit, planRows, startCardFit, nextCardFit, planCards, cardsFromRebbe, cardsFromDays,
} from '../../../shared/shiurimPages.js';
import { Avatar, Pill, useFontsKey } from './shiurim/ui.jsx';

/**
 * Today's shiurim + the week (spec docs/specs/06-SPEAKER-SHIURIM.md section 4):
 *
 *   Today list   one row per shiur in time order: time, what, the rebbe (photo or a letter circle) and the place. The shiur
 *                being given is marked NOW, the next one NEXT, finished ones fade by colour (or drop, the admin's choice),
 *                a cancelled one stays with a Cancelled mark (or drops, the admin's choice) so nobody walks to an empty room.
 *   Week         cards by rebbe (their week at a glance, equal times collapse to 'Sun - Wed') or by day.
 *
 * Nothing is ever cut: the text shrinks to the floor (time 40, title 32, name 28, place 26), the photo column drops, then fewer rows
 * go on a page (the rest follow on the next page); the week's cards shrink, take fewer lines and fewer across, and long ones
 * continue. Every page is measured from the real boxes (shared/shiurimPages.js steps). The slide steps through its pages itself
 * (one finite opacity change, instant under Minimal motion) and asks the rotation for the time that needs (onRequestDuration).
 * Roles and font roles only; nothing loops.
 */

const heBox = { fontFamily: F.he, lineHeight: 1.3 };

function Header({ en, heText, portrait, sufEn, sufHe }) {
  const size = portrait ? 48 : 50;
  return (
    <header data-s="" style={{
      '--i': 0, flex: 'none', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center',
      justifyContent: 'space-between', gap: portrait ? 4 : 28, marginBottom: 14,
    }}>
      <span style={{ fontFamily: F.enD, fontSize: size, fontWeight: 750, letterSpacing: '-.015em', lineHeight: 1.1, color: 'var(--ink)', minWidth: 0 }}>
        {en}{sufEn && <span style={{ fontFamily: F.en, fontSize: 34, fontWeight: 500, color: 'var(--ink)', letterSpacing: 0 }}>{'  ·  '}{sufEn}</span>}
      </span>
      <span dir="rtl" className="tt-he" style={{ fontFamily: F.heD, fontSize: he(size), fontWeight: 650, lineHeight: 1.2, color: 'var(--ink)', minWidth: 0 }}>
        {heText}{sufHe && <span style={{ fontSize: he(34), fontWeight: 500 }}>{' · '}{sufHe}</span>}
      </span>
    </header>
  );
}

const TextPair = ({ a, b, size, weight = 600, color = 'var(--ink)', heRatio = 0.92, style, k }) => (
  <>
    {a && <div data-k={k} dir={textDir(a)} style={{ fontFamily: textDir(a) === 'rtl' ? F.he : F.en, fontSize: textDir(a) === 'rtl' ? he(size) : size, fontWeight: weight, lineHeight: 1.18, color, overflowWrap: 'anywhere', minWidth: 0, ...style }}>{bidiNodes(a)}</div>}
    {b && <div dir="rtl" className="tt-he" style={{ ...heBox, fontSize: he(Math.round(size * heRatio)), fontWeight: Math.min(weight, 600), color, overflowWrap: 'anywhere', minWidth: 0, textAlign: 'left' }}>{b}</div>}
  </>
);

function Row({ r, T, marks, settings, portrait, photos }) {
  const lang = settings.language;
  const [t1, t2] = pickLang(r.shiur.title, r.shiur.titleHe, lang);
  const [n1, n2] = pickLang(personName(r.person, 'en'), personName(r.person, 'he'), lang);
  const [p1, p2] = settings.showPlace ? pickLang(r.place, r.placeHe, lang) : ['', ''];
  const isNow = !r.cancelled && marks.now.includes(r.id);
  const isNext = !r.cancelled && !isNow && marks.next.includes(r.id);
  const faded = !r.cancelled && !isNow && !isNext && marks.past.includes(r.id) && settings.past === 'dim';
  const ink = faded ? 'var(--past)' : 'var(--ink)';
  const showPhoto = photos && T.photo > 0 && !!r.person;
  const who = r.person && (n1 || n2) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
      {showPhoto && <Avatar photo={r.person.photo} name={personName(r.person, 'en') || personName(r.person, 'he')} size={T.photo} />}
      <div style={{ minWidth: 0 }}><TextPair a={n1} b={n2} size={T.name} weight={650} color={ink} heRatio={0.9} k="name" /></div>
    </div>
  );
  const where = (p1 || p2) && (
    <div style={{ minWidth: 0, textAlign: 'start' }}><TextPair a={p1} b={p2} size={T.place} weight={560} color={ink} heRatio={1} k="place" /></div>
  );
  return (
    <div data-srow="" style={{
      boxSizing: 'border-box', display: 'grid', alignItems: 'center', columnGap: 28, rowGap: 10, padding: '12px 22px', borderRadius: 22, flex: 'none',
      gridTemplateColumns: portrait ? 'auto minmax(0, 1fr)' : `auto minmax(0, 1fr)${who ? ' fit-content(40%)' : ''}${where ? ' fit-content(22%)' : ''}`,
      border: `${isNow ? 4 : 2}px solid ${isNow ? 'var(--accentText)' : isNext ? 'var(--line)' : 'transparent'}`,
      background: isNow ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
    }}>
      <div data-k="time" style={{ minWidth: 0 }}>
        <TimeText mins={r.start} size={T.time} weight={750} ampmSize={Math.max(26, Math.round(T.time * 0.5))} ampmColor={ink} color={ink} />
        {r.end != null && <div className="tt-num" style={{ fontFamily: F.num, fontSize: 26, fontWeight: 600, color: ink, whiteSpace: 'nowrap', marginTop: 4 }}>{`– ${fmt12(r.end)}`}</div>}
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', minWidth: 0 }}>
          <div style={{ minWidth: 0, textDecoration: r.cancelled ? 'line-through' : 'none', textDecorationThickness: 3 }}>
            <TextPair a={t1} b={t2} size={T.title} weight={680} color={ink} k="title" />
          </div>
          {isNow && <Pill kind="now" />}
          {isNext && <Pill kind="next" />}
          {r.cancelled && <Pill kind="cancelled" />}
          {!r.cancelled && r.moved && <Pill kind="moved" />}
        </div>
        {(r.note || r.groupLabel) && <div dir={textDir(r.note || r.groupLabel)} style={{ fontFamily: F.en, fontSize: 26, fontStyle: 'italic', color: ink, lineHeight: 1.25 }}>{bidiNodes([r.groupLabel, r.note].filter(Boolean).join(' · '))}</div>}
      </div>
      {who && <div style={{ gridColumn: portrait ? 2 : 'auto' }}>{who}</div>}
      {where && <div style={{ gridColumn: portrait ? 2 : 'auto' }}>{where}</div>}
    </div>
  );
}

/** Every page is rendered (stacked) so they are all measured at once; `page` is the visible one. */
function TodayBody({ rows, marks, settings, portrait, page, onPages }) {
  const fonts = useFontsKey();
  const photos = settings.showPhotos;
  const sig = useMemo(() => `${rows.map((r) => `${r.id}${r.start}${r.end}${r.place}${r.cancelled}${r.note}${r.person?.id}`).join('|')}|${portrait}|${settings.language}|${photos}|${settings.showPlace}|${fonts}`, [rows, portrait, settings.language, photos, settings.showPlace, fonts]);
  const [st, setSt] = useState({ sig: '', fit: startRowFit(rows.length) });
  const fit = st.sig === sig ? st.fit : startRowFit(rows.length);
  const pages = useMemo(() => planRows(rows, fit.per), [rows, fit.per]);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const over = [...root.querySelectorAll('[data-slist]')].some((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    if (over) { const n = nextRowFit(fit); if (n) setSt({ sig, fit: n }); }
  }, [pages, fit, sig]);
  useEffect(() => { onPages?.(pages.length); }, [pages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const T = ROW_TIERS[fit.tier];
  const at = Math.min(page, pages.length - 1);
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {pages.map((list, i) => (
        <div key={i} data-spage={i} data-slist="" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden',
          opacity: i === at ? 1 : 0, visibility: i === at ? 'visible' : 'hidden',
        }}>
          {list.map((r) => (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', flex: 'none', margin: 'auto 0' }}>
              <Row r={r} T={T} marks={marks} settings={settings} portrait={portrait} photos={photos} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Card({ c, CT, settings, portrait }) {
  const photos = settings.showPhotos && CT.photo > 0 && !!c.person;
  const [n1, n2] = c.person ? pickLang(personName(c.person, 'en'), personName(c.person, 'he'), settings.language) : c.head ? [c.head.en, c.head.he] : ['', ''];
  const dayCard = !!c.head;
  return (
    <section data-rcard="" style={{
      boxSizing: 'border-box', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px 16px', borderRadius: 24, overflow: 'hidden',
      border: `${c.today ? 4 : 2}px solid ${c.today ? 'var(--accentText)' : 'var(--line)'}`,
      background: c.today ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'color-mix(in srgb, var(--ink) 5%, transparent)',
    }}>
      {(n1 || n2) && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
          {photos && <Avatar photo={c.person.photo} name={personName(c.person, 'en') || personName(c.person, 'he')} size={CT.photo} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <TextPair a={settings.language === 'he' && dayCard ? n2 || n1 : n1} b={settings.language === 'he' && dayCard ? '' : n2} size={CT.name} weight={720} heRatio={0.9} />
            {c.parts > 1 && <div className="tt-num" style={{ fontFamily: F.num, fontSize: 26, color: 'var(--ink)', marginTop: 2 }}>{`${c.part}/${c.parts}`}</div>}
          </div>
          {c.today && <Pill kind="now" />}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: Math.round(CT.line * 0.45) }}>
        {c.lines.map((l) => (
          <div key={l.key} style={{ minWidth: 0 }}>
            <div className="tt-num" style={{ fontFamily: F.num, fontSize: CT.line, fontWeight: 750, color: 'var(--accentText)', lineHeight: 1.2 }}>{[l.lead, l.time].filter(Boolean).join('  ·  ')}</div>
            <TextPair a={l.t1} b={l.t2} size={CT.line} weight={620} heRatio={1} />
            {(l.meta || l.meta2 || l.groupLabel) && <div dir={textDir(l.meta || l.meta2)} style={{ fontFamily: textDir(l.meta || l.meta2) === 'rtl' ? F.he : F.en, fontSize: CT.line - 2, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{bidiNodes([l.meta, l.groupLabel].filter(Boolean).join(' · ') || l.meta2)}</div>}
            {l.note && <div dir={textDir(l.note)} style={{ fontFamily: F.en, fontSize: CT.line - 2, fontStyle: 'italic', color: 'var(--ink)', lineHeight: 1.25 }}>{bidiNodes(l.note)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function WeekBody({ cards, settings, portrait, page, onPages }) {
  const fonts = useFontsKey();
  const sig = useMemo(() => `${cards.map((c) => `${c.key}:${c.lines.map((l) => `${l.lead}${l.time}${l.t1}${l.t2}${l.meta}${l.note}`).join(',')}`).join('/')}|${portrait}|${settings.language}|${settings.showPhotos}|${fonts}`, [cards, portrait, settings.language, settings.showPhotos, fonts]);
  const [st, setSt] = useState({ sig: '', fit: startCardFit(portrait) });
  const fit = st.sig === sig ? st.fit : startCardFit(portrait);
  const pages = useMemo(() => planCards(cards, fit), [cards, fit]);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const over = [...root.querySelectorAll('[data-rcard]')].some((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    if (over) { const n = nextCardFit(fit); if (n) setSt({ sig, fit: n }); }
  }, [pages, fit, sig]);
  useEffect(() => { onPages?.(pages.length); }, [pages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const CT = CARD_TIERS[fit.tier];
  const at = Math.min(page, pages.length - 1);
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {pages.map((list, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, display: 'grid', gap: 16, opacity: i === at ? 1 : 0, visibility: i === at ? 'visible' : 'hidden',
          gridTemplateColumns: portrait ? 'minmax(0, 1fr)' : `repeat(${list.length}, minmax(0, 1fr))`,
          gridTemplateRows: portrait ? `repeat(${list.length}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
        }}>
          {list.map((c) => <Card key={`${c.key}-${c.part}`} c={c} CT={CT} settings={settings} portrait={portrait} />)}
        </div>
      ))}
    </div>
  );
}

export default function ShiurimSlide({ data, now, tz, portrait: portraitProp, onRequestDuration, slide, schedule, scheduleDates, groups }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data?.settings || {}) }), [data?.settings]);
  const z = useMemo(() => zonedParts(now || new Date(), tz || DEFAULT_TZ), [now, tz]);
  const ctx = useMemo(() => ({ schedule, scheduleDates, groups }), [schedule, scheduleDates, groups]);
  const rowsAll = useMemo(() => (data ? sortRows(shiurimOn(data, z.date, ctx), data, settings.todaySort) : []), [data, z.date, ctx, settings.todaySort]);
  const marks = useMemo(() => currentNext(rowsAll, z.minutes), [rowsAll, z.minutes]);
  const rows = useMemo(() => (settings.past === 'hide' ? rowsAll.filter((r) => !marks.past.includes(r.id)) : rowsAll), [rowsAll, marks, settings.past]);
  const cards = useMemo(() => {
    if (!data) return [];
    try { return settings.weekBy === 'day' ? cardsFromDays(byDay(data, z.date, ctx), settings.language) : cardsFromRebbe(byRebbe(data, z.date, ctx), settings.language); } catch { return []; }
  }, [data, z.date, ctx, settings.weekBy, settings.language]);

  const wantToday = settings.view !== 'week' && rows.length > 0;
  const wantWeek = settings.view !== 'today' && cards.length > 0 && !(settings.view === 'both' && rows.length === 0 && settings.whenNone === 'hide');
  const [tp, setTp] = useState(1);
  const [wp, setWp] = useState(1);
  const [step, setStep] = useState(0);
  const base = Number(slide?.duration) || 0;

  const steps = [];
  if (wantToday) for (let i = 0; i < tp; i++) steps.push({ t: 'today', page: i, s: tp === 1 && !wantWeek ? MIN_SECONDS : PAGE_SECONDS });
  if (wantWeek) for (let i = 0; i < wp; i++) steps.push({ t: 'week', page: i, s: WEEK_SECONDS });
  const n = steps.length;
  const total = steps.reduce((a, x) => a + x.s, 0) + 2;
  const key = `${z.date}|${wantToday}|${wantWeek}`;
  const nRef = useRef(n);
  nRef.current = n;
  const curSeconds = n ? steps[Math.min(step, n - 1)].s : 0;

  useEffect(() => { setStep(0); }, [key]);
  useEffect(() => { if (n > 1 && onRequestDuration && total > Math.max(base, 0)) onRequestDuration(total); }, [total, n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setTimeout(() => setStep((x) => (x + 1) % Math.max(1, nRef.current)), curSeconds * 1000);
    return () => clearTimeout(t);
  }, [step, n < 2, curSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  const at = n ? steps[Math.min(step, n - 1)] : null;
  const fade = design.motion === 'minimal' ? 'none' : 'opacity 500ms ease';
  const layer = (on) => ({ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', opacity: on ? 1 : 0, visibility: on ? 'visible' : 'hidden', transition: fade });
  const weekTitle = settings.weekBy === 'day' ? WORDS.week : WORDS.byRebbe;

  return (
    <Panel pad={portrait ? '36px 40px 32px' : '30px 48px 28px'}>
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
        {n === 0 && (
          <div style={layer(true)}>
            <Header en={WORDS.today.en} heText={WORDS.today.he} portrait={portrait} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: F.enD, fontSize: 56, fontWeight: 700, color: 'var(--ink)' }}>{WORDS.nothing.en}</div>
              <div dir="rtl" className="tt-he" style={{ fontFamily: F.heD, fontSize: he(48), color: 'var(--ink)' }}>{WORDS.nothing.he}</div>
            </div>
          </div>
        )}
        {wantToday && (
          <div style={layer(at?.t === 'today')}>
            <Header en={WORDS.today.en} heText={WORDS.today.he} sufEn={DAY_EN[DAYS[z.dow]]} sufHe={DAY_HE[DAYS[z.dow]]} portrait={portrait} />
            <TodayBody rows={rows} marks={marks} settings={settings} portrait={portrait} page={at?.t === 'today' ? at.page : 0} onPages={setTp} />
          </div>
        )}
        {wantWeek && (
          <div style={layer(at?.t === 'week')}>
            <Header en={weekTitle.en} heText={weekTitle.he} portrait={portrait} />
            <WeekBody cards={cards} settings={settings} portrait={portrait} page={at?.t === 'week' ? at.page : 0} onPages={setWp} />
          </div>
        )}
      </div>
    </Panel>
  );
}

