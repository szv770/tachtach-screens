import React, { useEffect, useState } from 'react';
import { Panel, TimeText, Rule, F, he, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { ShabbosMark } from '../../design/graphics.jsx';
import { textDir } from '../../../shared/bidi.js';
import { fmt12 } from '../../design/time.js';

/**
 * The Friday / Motzei Shabbos page and the still Good Shabbos sign (spec docs/specs/02-SHABBOS-PAGE.md).
 * Renders a plain model from src/shared/shabbosPage.js `shabbosPageState()` (App.jsx builds it each second from
 * the screen's own zmanim; no fetch here). Roles only, finite or no motion: the page transition is the only
 * movement, the candle graphic is static, and the reminder pages swap without animation.
 *
 *   erev     title + parsha chip / greeting (Hebrew, English) / candles + HERO time + countdown / times | reminders
 *   chain    (second night of Yom Tov) the same page with 'Candles tonight after nightfall 8:11 PM', no countdown
 *   motzei   greeting hero / 'Shabbos ended at 6:21 PM' / reminders
 *   sign     ShabbosSign: one calm page for the whole of Shabbos (no rail, nothing changes each second)
 */

const PAGE = 3;          // reminder lines per page
const PAGE_SECONDS = 8;  // seconds per reminder page

const t12 = (min) => { const f = fmt12(min); return `${f.t} ${f.ap}`; };

function HeLine({ text, size, weight = 600, color = 'var(--ink)', style }) {
  if (!text) return null;
  return <div className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(size), fontWeight: weight, color, lineHeight: 1.3, ...style }}>{text}</div>;
}

function Greeting({ g, portrait, big = false }) {
  if (!g?.he && !g?.en) return null;
  const heMax = big ? (portrait ? 190 : 200) : (portrait ? 120 : 112);
  const enMax = big ? (portrait ? 92 : 96) : (portrait ? 64 : 60);
  return (
    <div data-s="" style={{ '--i': 1, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: big ? 10 : 2 }}>
      {g.he && (
        <Fit dir="rtl" max={heMax} min={64} className="tt-he" style={{
          width: '100%', height: Math.round(heMax * 1.32), display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: F.heD, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, textAlign: 'center',
        }}>{g.he}</Fit>
      )}
      {g.en && (
        <Fit max={enMax} min={40} style={{
          width: '100%', height: Math.round(enMax * 1.25), display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: F.enD, fontWeight: 700, letterSpacing: '-.01em', color: g.he ? 'var(--inkDim)' : 'var(--ink)', lineHeight: 1.15, textAlign: 'center',
        }}>{g.en}</Fit>
      )}
    </div>
  );
}

function Chip({ parsha }) {
  if (!parsha) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 16, padding: '6px 22px 8px', borderRadius: 999, border: '2px solid var(--line)', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
      {parsha.en && <span style={{ fontFamily: F.en, fontSize: 30, fontWeight: 650, color: 'var(--ink)' }}>{parsha.en}</span>}
      {parsha.he && <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(34), fontWeight: 600, color: 'var(--ink)' }}>{parsha.he}</span>}
    </span>
  );
}

function Hero({ hero, countdown, portrait, art }) {
  if (!hero) return null;
  const size = portrait ? 168 : 150;
  return (
    <div data-s="" style={{ '--i': 2, flex: 'none', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: portrait ? 10 : 40, margin: portrait ? '18px 0 6px' : '6px 0 2px' }}>
      {art && <ShabbosMark size={portrait ? 96 : 110} style={{ color: 'var(--accentText)' }} />}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: portrait ? 'center' : 'flex-start', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, flexWrap: 'wrap', justifyContent: portrait ? 'center' : 'flex-start' }}>
          <span style={{ fontFamily: F.en, fontSize: 36, fontWeight: 600, color: 'var(--inkDim)' }}>{hero.label.en}</span>
          <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(36), fontWeight: 600, color: 'var(--inkDim)' }}>{hero.label.he}</span>
        </div>
        <TimeText mins={hero.min} size={size} weight={750} ampmSize={Math.round(size * 0.34)} color="var(--accentText)" ampmColor="var(--accentText)" gap={14} />
        {countdown && <div className="tt-num" style={{ fontSize: 48, fontWeight: 650, color: 'var(--ink)', marginTop: 6 }}>{countdown}</div>}
      </div>
    </div>
  );
}

function Times({ rows, portrait }) {
  if (!rows.length) return null;
  return (
    <div style={{ display: 'grid', gridAutoRows: 'minmax(0, auto)', alignContent: 'center', rowGap: portrait ? 14 : 10, minWidth: 0 }}>
      {rows.map((r, k) => (
        <div key={r.key} data-s="" style={{ '--i': 3 + k, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 20 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 16, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: F.en, fontSize: 32, fontWeight: 600, color: 'var(--ink)' }}>{r.en}</span>
            <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(32), fontWeight: 500, color: 'var(--inkDim)' }}>{r.he}</span>
          </span>
          <TimeText mins={r.min} size={40} ampmSize={20} />
        </div>
      ))}
    </div>
  );
}

/** Reminder lines: up to 3 at a time; more page every 8 s (no animation) and the slide asks for the time it needs. */
function Reminders({ list, portrait, onRequestDuration, base }) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const [page, setPage] = useState(0);
  const key = list.map((r) => r.id).join('|');
  useEffect(() => { setPage(0); }, [key]);
  useEffect(() => {
    if (pages < 2) return undefined;
    const want = pages * PAGE_SECONDS + 2;
    if (onRequestDuration && want > (base || 0)) onRequestDuration(want);
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [pages, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <Fit key={`${key}|${page}|${portrait}`} wrap vcenter max={34} min={26} style={{ minHeight: 0, minWidth: 0, width: '100%', height: '100%', lineHeight: 1.3 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.55em' }}>
        {shown.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '.5em minmax(0, 1fr)', columnGap: '.6em', alignItems: 'start' }}>
            <span aria-hidden style={{ width: '.42em', height: '.42em', borderRadius: '50%', background: 'var(--accentText)', marginTop: '.48em' }} />
            <div style={{ minWidth: 0 }}>
              {r.en && <div dir={textDir(r.en)} style={{ fontFamily: textDir(r.en) === 'rtl' ? F.he : F.en, fontWeight: 600, color: 'var(--ink)', unicodeBidi: 'isolate' }}>{bidiNodes(r.en)}</div>}
              {r.he && <div dir="auto" className="tt-he" style={{ fontFamily: F.he, fontSize: '1.05em', fontWeight: 500, color: r.en ? 'var(--inkDim)' : 'var(--ink)', lineHeight: 1.45 }}>{bidiNodes(r.he)}</div>}
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && <div className="tt-num" style={{ fontFamily: F.en, fontSize: '.62em', color: 'var(--inkDim)', marginTop: '.6em' }}>{page + 1} / {pages}</div>}
    </Fit>
  );
}

function Header({ model, portrait }) {
  const t = model.title;
  const yt = model.yomtov;
  if (!t && !model.parsha && !yt) return null;
  return (
    <header data-s="" style={{ '--i': 0, flex: 'none', display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: portrait ? 14 : 24 }}>
      <span style={{ fontFamily: F.en, fontSize: 28, fontWeight: 600, color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {t?.en}{yt ? `${t?.en ? '  ·  ' : ''}${yt.en}` : ''}
        {(t?.he || yt?.he) && <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(30), marginLeft: 18 }}>{[t?.he, yt?.he].filter(Boolean).join(' · ')}</span>}
      </span>
      <Chip parsha={model.parsha} />
    </header>
  );
}

export default function ShabbosSlide({ model, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const art = design.graphics !== 'off';
  if (!model || model.phase === 'none') return null;
  const base = Number(slide?.duration) || 0;

  if (model.phase === 'motzei') {
    return (
      <Panel pad={portrait ? '48px 52px' : '40px 72px'}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: model.reminders.length ? 'none' : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            {art && <div style={{ display: 'flex', justifyContent: 'center' }}><ShabbosMark size={72} style={{ color: 'var(--accentText)' }} /></div>}
            <Greeting g={model.greeting} portrait={portrait} big={!model.reminders.length} />
            {model.ended && (
              <div data-s="" style={{ '--i': 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {model.ended.en && <span style={{ fontFamily: F.en, fontSize: 40, fontWeight: 600, color: 'var(--ink)' }}>{model.ended.en}</span>}
                  {model.ended.min != null && <TimeText mins={model.ended.min} size={56} ampmSize={24} color="var(--accentText)" />}
                </div>
                <HeLine text={model.ended.he} size={36} color="var(--inkDim)" />
              </div>
            )}
          </div>
          {model.reminders.length > 0 && (
            <>
              <Rule style={{ margin: portrait ? '30px 0 24px' : '24px 0 18px' }} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <Reminders list={model.reminders} portrait={portrait} onRequestDuration={onRequestDuration} base={base} />
              </div>
            </>
          )}
        </div>
      </Panel>
    );
  }

  // erev (and the second night of Yom Tov)
  const hasBottom = model.rows.length > 0 || model.reminders.length > 0;
  return (
    <Panel pad={portrait ? '40px 48px 40px' : '32px 60px 32px'}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Header model={model} portrait={portrait} />
        <div style={{ flex: hasBottom ? 'none' : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: portrait ? 18 : 8 }}>
          <Greeting g={model.greeting} portrait={portrait} big={!model.hero && !hasBottom} />
          <Hero hero={model.hero} countdown={model.countdown} portrait={portrait} art={art} />
          {!model.hero && art && <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}><ShabbosMark size={88} style={{ color: 'var(--accentText)' }} /></div>}
        </div>
        {hasBottom && (
          <>
            <Rule style={{ margin: portrait ? '26px 0 22px' : '16px 0 16px' }} />
            <div style={{
              flex: 1, minHeight: 0, display: 'grid', columnGap: 56, rowGap: 22,
              gridTemplateColumns: !portrait && model.rows.length && model.reminders.length ? 'minmax(0, 5fr) minmax(0, 6fr)' : 'minmax(0, 1fr)',
              gridTemplateRows: portrait && model.rows.length && model.reminders.length ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
            }}>
              <Times rows={model.rows} portrait={portrait} />
              {model.reminders.length > 0 && (
                <div style={{ minHeight: 0, minWidth: 0 }}>
                  <Reminders list={model.reminders} portrait={portrait} onRequestDuration={onRequestDuration} base={base} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/**
 * During Shabbos with settings.shabbos.during = 'sign': ONE still page over the whole screen (no rail, no clock,
 * no countdown, no rotation, nothing that moves or changes each second). Greeting, parsha, and the end time when
 * it is known (today is the last rest day); on the afternoon before a second night, when candles are lit.
 */
export function ShabbosSign({ model, portrait }) {
  const design = useDesign();
  const art = design.graphics !== 'off';
  if (!model) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 36 : 28, padding: portrait ? '8% 7%' : '5% 9%', textAlign: 'center' }}>
      {art && <ShabbosMark size={portrait ? 150 : 130} style={{ color: 'var(--accent)' }} />}
      <div style={{ width: '100%', '--ink': 'var(--text)', '--inkDim': 'var(--dim)' }}>
        <Greeting g={model.greeting} portrait={portrait} big />
      </div>
      {model.parsha && (
        <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 6 : 28, alignItems: 'baseline', justifyContent: 'center' }}>
          {model.parsha.en && <span style={{ fontFamily: F.en, fontSize: 48, fontWeight: 600, color: 'var(--text)' }}>{model.parsha.en}</span>}
          {model.parsha.he && <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(54), fontWeight: 600, color: 'var(--text)' }}>{model.parsha.he}</span>}
        </div>
      )}
      {model.hero && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: F.en, fontSize: 40, fontWeight: 600, color: 'var(--dim)' }}>{model.hero.label.en} {t12(model.hero.min)}</span>
          <HeLine text={model.hero.label.he} size={40} color="var(--dim)" />
        </div>
      )}
      {model.ends && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontFamily: F.en, fontSize: 44, fontWeight: 600, color: 'var(--dim)' }}>{model.ends.label.en}</span>
          <TimeText mins={model.ends.min} size={64} ampmSize={26} color="var(--text)" />
          <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(44), fontWeight: 600, color: 'var(--dim)' }}>{model.ends.label.he}</span>
        </div>
      )}
    </div>
  );
}
