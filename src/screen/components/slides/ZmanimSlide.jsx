import React from 'react';
import { Panel, PageTitle, TimeText, F, he } from '../../design/ui.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { useNow, placeName } from '../../design/hooks.js';
import { toMinutes, nowMinutes, durationText } from '../../design/time.js';
import { CandleIcon } from '../../design/graphics.jsx';
import SourceCredit from '../SourceCredit.jsx';

/**
 * Zmanim page (R2 README §6). settings.zmanimLayout:
 *   'board'      clean board (default): big right-aligned tabular times, small
 *                English name, prominent Hebrew name flush right; past rows
 *                faded by colour (--past, never opacity); only the next zman
 *                is filled, with "in 16 min" inline.
 *   'board-arc'  slim sun-path arc above a two-column board.
 *   'arc-tiles'  the arc with the zmanim as tiles.
 * After the last zman of the day, tomorrow's zmanim show (if fetched).
 */

export const ZMAN_NAMES = {
  alotHaShachar: ['עלות השחר', 'Alos Hashachar'],
  misheyakir: ['משיכיר', 'Misheyakir'],
  sunrise: ['הנץ החמה', 'Netz Hachamah'],
  sofZmanShma: ['סוף זמן ק״ש', 'Sof Zman Shema'],
  sofZmanTfilla: ['סוף זמן תפילה', 'Sof Zman Tefillah'],
  chatzot: ['חצות היום', 'Chatzos'],
  minchaGedola: ['מנחה גדולה', 'Mincha Gedolah'],
  minchaKetana: ['מנחה קטנה', 'Mincha Ketanah'],
  plagHaMincha: ['פלג המנחה', 'Plag Hamincha'],
  candleLighting: ['הדלקת נרות', 'Candle Lighting'],
  sunset: ['שקיעה', 'Shkiah'],
  tzeit7083deg: ['צאת הכוכבים', 'Tzeis Hakochavim'],
  chatzotLayla: ['חצות הלילה', 'Chatzos Halaylah'],
  shaaZmanit: ['שעה זמנית', 'Shaah Zmanis'],
};
const CORE = ['alotHaShachar', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTfilla', 'chatzot', 'minchaGedola', 'minchaKetana', 'plagHaMincha', 'sunset', 'tzeit7083deg'];
const ORDER = Object.keys(ZMAN_NAMES);

/** Rows for a zmanim object: [{ key, he, en, v (mins, may exceed 1440), raw, info }] sorted by time. */
export function zmanRows(z, visibleKeys) {
  if (!z) return [];
  const keys = visibleKeys?.length ? ORDER.filter((k) => visibleKeys.includes(k) || k === 'candleLighting') : [...CORE, 'candleLighting'];
  const rows = [];
  for (const k of keys) {
    const raw = z[k];
    if (!raw) continue;
    const [hn, en] = ZMAN_NAMES[k];
    if (k === 'shaaZmanit') { rows.push({ key: k, he: hn, en, v: null, raw, info: true }); continue; }
    let v = toMinutes(raw);
    if (v == null) continue;
    if (k === 'chatzotLayla' && v < 12 * 60) v += 1440;
    rows.push({ key: k, he: hn, en, v, raw });
  }
  const timed = rows.filter((r) => !r.info).sort((a, b) => a.v - b.v);
  return [...timed, ...rows.filter((r) => r.info)];
}

function states(rows, now) {
  const ni = rows.findIndex((r) => !r.info && r.v > now);
  return rows.map((r, k) => (r.info ? 'info' : ni < 0 || k < ni ? 'past' : k === ni ? 'next' : ''));
}

function Lead({ row }) {
  const { graphics } = useDesign();
  if (row.key !== 'candleLighting' || graphics === 'off') return null;
  return <CandleIcon size={26} style={{ marginRight: 8, verticalAlign: '-4px' }} />;
}

/* ── clean board ──────────────────────────────────────────────────────────── */

function BoardRow({ row, state, now, i, portrait, dense }) {
  const next = state === 'next';
  const past = state === 'past';
  const timeSize = dense ? 44 : portrait ? 58 : 52;
  const heSize = dense ? 36 : portrait ? 50 : 43;
  const enSize = dense ? 21 : portrait ? 25 : 24;
  return (
    <div data-s="" style={{
      '--i': i + 1,
      display: 'grid', gridTemplateColumns: `${dense ? 210 : portrait ? 236 : 250}px minmax(0, 1fr) auto`, alignItems: 'center',
      padding: '0 22px', borderRadius: 18, minHeight: 0,
      background: next ? 'var(--fill)' : 'transparent',
      color: next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--ink)',
    }}>
      {row.info
        ? <span className="tt-num" style={{ fontSize: timeSize * 0.8, fontWeight: 600, textAlign: 'right', display: 'inline-block', minWidth: '2.72em' }}>{row.raw}</span>
        : <TimeText mins={row.v} size={timeSize} width="2.72em" ampmSize={20} ampmColor={next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--inkDim)'} style={{ opacity: 1 }} />}
      <span style={{ fontFamily: F.en, fontSize: enSize, fontWeight: 500, color: next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 4 }}>
        <Lead row={row} />
        <span style={next ? { opacity: 0.78 } : null}>{row.en}</span>
        {next && <span style={{ fontWeight: 700, marginLeft: 18 }}>in {durationText(row.v - now)}</span>}
      </span>
      <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(heSize), fontWeight: next ? 600 : 500, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{row.he}</span>
    </div>
  );
}

function CleanBoard({ rows, st, now, portrait }) {
  if (rows.length > 12 && !portrait) {
    const half = Math.ceil(rows.length / 2);
    return (
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32, minHeight: 0, margin: '0 -18px' }}>
        {[rows.slice(0, half), rows.slice(half)].map((col, c) => (
          <div key={c} style={{ display: 'grid', gridTemplateRows: `repeat(${half}, minmax(0, 1fr))`, minHeight: 0 }}>
            {col.map((r, k) => <TwoRow key={r.key} row={r} state={st[c * half + k]} now={now} i={c * half + k} />)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ flex: 1, display: 'grid', gridAutoRows: 'minmax(0, 1fr)', minHeight: 0, margin: '0 -22px' }}>
      {rows.map((r, k) => <BoardRow key={r.key} row={r} state={st[k]} now={now} i={k} portrait={portrait} />)}
    </div>
  );
}

/* ── two-column rows (board + arc) ────────────────────────────────────────── */

function TwoRow({ row, state, now, i }) {
  const next = state === 'next', past = state === 'past';
  const ink = next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--ink)';
  const dim = next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--inkDim)';
  return (
    <div data-s="" style={{
      '--i': i + 1, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', columnGap: 16,
      padding: '0 18px', borderRadius: 18, minHeight: 0, background: next ? 'var(--fill)' : 'transparent', color: ink,
    }}>
      {row.info
        ? <span className="tt-num" style={{ fontSize: 38, fontWeight: 600, minWidth: '2.72em', display: 'inline-block', textAlign: 'right' }}>{row.raw}</span>
        : <TimeText mins={row.v} size={46} width="2.72em" ampmSize={20} ampmColor={dim} />}
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <span className="tt-he" style={{ display: 'block', fontFamily: F.heD, fontSize: he(36), fontWeight: next ? 600 : 500, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{row.he}</span>
        <span style={{ display: 'block', fontFamily: F.en, fontSize: 20, fontWeight: 500, color: dim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {next && <b style={{ fontWeight: 700 }}>in {durationText(row.v - now)} · </b>}
          <span style={next ? { opacity: 0.78 } : null}><Lead row={row} />{row.en}</span>
        </span>
      </div>
    </div>
  );
}

/* ── sun-path arc ─────────────────────────────────────────────────────────── */

export function SunArc({ rows, st, now, z, height = 120, labels = true, style, offset = 0 }) {
  const n0 = toMinutes(z?.sunrise), s0 = toMinutes(z?.sunset);
  if (n0 == null || s0 == null || s0 <= n0) return null;
  const netz = n0 + offset, shk = s0 + offset;
  const W = 1000, H = height, x0 = 8, x1 = W - 8, baseY = H - 8, top = 12;
  const pt = (v) => { const f = (v - netz) / (shk - netz); return [x0 + (x1 - x0) * f, baseY - (baseY - top) * Math.sin(Math.PI * Math.max(0, Math.min(1, f)))]; };
  const path = (a, b) => Array.from({ length: 61 }, (_, i) => pt(a + ((b - a) * i) / 60)).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const clampNow = Math.max(netz, Math.min(shk, now));
  const [sx, sy] = pt(clampNow);
  const day = now > netz && now < shk;
  return (
    <div data-s="" style={{ '--i': 1, flex: 'none', height, position: 'relative', ...style }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <line x1="0" x2={W} y1={baseY} y2={baseY} stroke="var(--line)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(netz, shk)} fill="none" stroke="var(--line)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {now > netz && <path d={path(netz, clampNow)} fill="none" stroke="var(--inkDim)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* dots are HTML so they stay round under the non-uniform SVG stretch */}
      {rows.map((r, k) => {
        if (r.info || r.v <= netz || r.v >= shk) return null;
        const [x, y] = pt(r.v);
        const next = st[k] === 'next';
        const d = next ? 18 : 10;
        return <i key={r.key} style={{ position: 'absolute', left: `calc(${(x / W) * 100}% - ${d / 2}px)`, top: y - d / 2, width: d, height: d, borderRadius: '50%', background: next ? 'var(--accentText)' : st[k] === 'past' ? 'var(--inkDim)' : 'var(--line)' }} />;
      })}
      {day && <i style={{ position: 'absolute', left: `calc(${(sx / W) * 100}% - 15px)`, top: sy - 15, width: 30, height: 30, borderRadius: '50%', background: 'var(--ink)' }} />}
      {labels && (
        <>
          <span style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, fontSize: 20, color: 'var(--inkDim)', fontWeight: 500, fontFamily: F.en }}>Sunrise</span>
          <span style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, fontSize: 20, color: 'var(--inkDim)', fontWeight: 500, fontFamily: F.en }}>Sunset</span>
        </>
      )}
    </div>
  );
}

function BoardArc({ rows, st, now, z, offset }) {
  const half = Math.max(6, Math.ceil(rows.length / 2));
  const cols = [rows.slice(0, half), rows.slice(half)];
  return (
    <>
      <SunArc rows={rows} st={st} now={now} z={z} offset={offset} style={{ margin: '6px 0 34px' }} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32, minHeight: 0, margin: '0 -18px' }}>
        {cols.map((col, c) => (
          <div key={c} style={{ display: 'grid', gridTemplateRows: `repeat(${half}, minmax(0, 1fr))`, minHeight: 0 }}>
            {col.map((r, k) => <TwoRow key={r.key} row={r} state={st[c * half + k]} now={now} i={c * half + k + 1} />)}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── arc + tiles ──────────────────────────────────────────────────────────── */

function ArcTiles({ rows, st, now, z, portrait, offset }) {
  const cols = portrait ? 2 : 3;
  return (
    <>
      <SunArc rows={rows} st={st} now={now} z={z} offset={offset} height={portrait ? 130 : 110} style={{ margin: '4px 0 36px' }} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)', gap: 14, minHeight: 0 }}>
        {rows.map((r, k) => {
          const next = st[k] === 'next', past = st[k] === 'past';
          return (
            <div key={r.key} data-s="" style={{
              '--i': k + 2, borderRadius: 24, padding: '12px 20px', minHeight: 0, minWidth: 0,
              background: next ? 'var(--fill)' : 'color-mix(in srgb, var(--ink) 5%, transparent)',
              color: next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--ink)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', overflow: 'hidden',
            }}>
              <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(30), fontWeight: next ? 600 : 500, whiteSpace: 'nowrap', lineHeight: 1.15 }}>{r.he}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', width: '100%', marginTop: 4, gap: 8 }}>
                <span style={{ fontFamily: F.en, fontSize: 19, fontWeight: next ? 700 : 500, color: next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {next ? `in ${durationText(r.v - now)}` : r.en}
                </span>
                {r.info
                  ? <span className="tt-num" style={{ fontSize: 34, fontWeight: 600 }}>{r.raw}</span>
                  : <TimeText mins={r.v} size={40} ampmSize={18} ampmColor={next ? 'var(--fillInk)' : past ? 'var(--past)' : 'var(--inkDim)'} gap={4} />}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function ZmanimSlide({ cache, settings }) {
  const { portrait } = useDesign();
  const nowD = useNow(15000);
  const now = nowMinutes(nowD);
  const today = cache?.zmanim?.today;
  const tomorrow = cache?.zmanim?.tomorrow;
  const vis = settings?.zmanimVisible;

  let rows = zmanRows(today, vis);
  let isTomorrow = false;
  const lastV = rows.filter((r) => !r.info).at(-1)?.v;
  if (tomorrow && (lastV == null || now >= lastV)) {
    const t = zmanRows(tomorrow, vis);
    if (t.length) { rows = t.map((r) => ({ ...r, v: r.v + 1440 })); isTomorrow = true; }
  }
  const st = states(rows, now);
  const layout = settings?.zmanimLayout || 'board';
  const place = placeName(cache, settings);
  const title = isTomorrow ? ['זמני מחר', `Tomorrow’s zmanim${place ? ` · ${place}` : ''}`] : ['זמני היום', `Zmanim${place ? ` · ${place}` : ''}`];

  return (
    <Panel pad={portrait ? '32px 40px' : '30px 40px 32px'}>
      <PageTitle en={title[1]} heText={title[0]} />
      {rows.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--inkDim)', fontSize: 30, fontFamily: F.en }}>Zmanim will appear once they are fetched.</div>
      ) : layout === 'board-arc' ? (
        <BoardArc rows={rows} st={st} now={now} z={isTomorrow ? tomorrow : today} offset={isTomorrow ? 1440 : 0} />
      ) : layout === 'arc-tiles' ? (
        <ArcTiles rows={rows} st={st} now={now} z={isTomorrow ? tomorrow : today} portrait={portrait} offset={isTomorrow ? 1440 : 0} />
      ) : (
        <CleanBoard rows={rows} st={st} now={now} portrait={portrait} />
      )}
      {/* only when the times really come from Chabad.org's feed (Live source); calculated times need no credit */}
      {rows.length > 0 && <SourceCredit settings={settings} cache={cache} show={settings?.dataSource !== 'local'} style={{ marginTop: 8 }} />}
    </Panel>
  );
}
