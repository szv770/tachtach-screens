import React, { useMemo } from 'react';
import { Panel, PageTitle, TimeText, F, he } from '../../design/ui.jsx';
import { Fit, useGroupFit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { useNow } from '../../design/hooks.js';
import { toMinutes, fmt12, nowMinutes, durationText, isHebrew } from '../../design/time.js';
import { ScheduleIcon } from '../../../shared/ScheduleIcons.jsx';
import { CandleIcon } from '../../design/graphics.jsx';
import { isEntryActiveOn } from '../../../shared/scheduleDays.js';

/**
 * Schedule page — the flagship (R2 README §6 "Schedule").
 * settings.scheduleLayout:
 *   'timeline' (default) — zoom levels on one subject, top to bottom:
 *       1. spotlight  Now | Next  (or Next | Then when nothing is running)
 *       2. day ribbon  every item as a segment at its true time and length
 *       3. later today  the remaining items as a ruled strip
 *   'list' — the same Now | Next spotlight over a ruled list of the day.
 * Each item appears once at full size. State logic: a range is "now" until
 * its end; a point event is "now" for 5 minutes.
 */

const DEFAULT_HUE = '#9AA3AE';

function useEntries(schedule) {
  return useMemo(() => {
    const cats = Object.fromEntries((schedule?.categories || []).map((c) => [c.id, c]));
    const today = new Date();
    return (schedule?.entries || [])
      .filter((e) => (schedule?.resolvedFor ? e.enabled !== false : isEntryActiveOn(e, today)))
      .map((e) => {
        const v = toMinutes(e.time);
        let end = e.endTime ? toMinutes(e.endTime) : null;
        if (end != null && v != null && end <= v) end = null;
        const cat = cats[e.category];
        return {
          id: e.id, he: e.nameHe || '', en: e.name || '', v, end,
          hue: cat?.color || DEFAULT_HUE, icon: e.icon || null, catIcon: cat?.icon || null,
          candle: /candle|הדלקת נרות/i.test(`${e.name} ${e.nameHe}`),
        };
      })
      .filter((e) => e.v != null)
      .sort((a, b) => a.v - b.v);
  }, [schedule?.entries, schedule?.categories, schedule?.resolvedFor]);
}

/** Per-item state: 'past' | 'now' | 'next' | ''. */
export function scheduleStates(items, now) {
  const ni = items.findIndex((s) => s.v > now);
  const st = items.map((s, k) => {
    if (k === ni) return 'next';
    if (s.v > now) return '';
    const running = s.end != null ? now < s.end : now <= s.v + 5;
    return running ? 'now' : 'past';
  });
  let nowIdx = -1;
  st.forEach((x, k) => { if (x === 'now') nowIdx = k; });
  return { ni, nowIdx, st };
}

function catVars(s, light) {
  return {
    '--cat': `color-mix(in srgb, ${s.hue} ${light ? 45 : 40}%, var(--panel))`,
    '--catDot': `color-mix(in srgb, ${s.hue} 85%, var(--panel))`,
  };
}

function Lead({ s, size = 12, past = false }) {
  const { graphics } = useDesign();
  const color = past ? 'var(--past)' : 'var(--catDot)';
  if (s.candle && graphics !== 'off') return <span style={{ color: past ? 'var(--past)' : 'currentColor', display: 'flex', flex: 'none', margin: '0 -.15em 0 -.2em' }}><CandleIcon size={Math.round(size * 2.4)} /></span>;
  const key = s.icon || (graphics === 'rich' ? s.catIcon : null);
  if (key && graphics !== 'off') {
    return <span style={{ display: 'flex', flex: 'none', margin: '0 -.1em 0 -.15em' }}><ScheduleIcon iconKey={key} size={Math.round(size * 2.1)} color={color} /></span>;
  }
  return <i style={{ width: size, height: size, borderRadius: '50%', background: color, flex: 'none', display: 'inline-block' }} />;
}

function Big({ mins, size, color, small, children }) {
  return (
    <div className="tt-num" style={{ marginTop: 18, fontSize: size, fontWeight: 650, letterSpacing: '-.04em', lineHeight: 1, whiteSpace: 'nowrap', color }}>
      {children}
      {mins != null && (
        <>
          {fmt12(mins).t}
          <small style={{ fontSize: '.36em', fontWeight: 600, letterSpacing: '.01em', marginLeft: '.22em', color: color || 'var(--inkDim)' }}>{fmt12(mins).ap}</small>
        </>
      )}
      {small}
    </div>
  );
}

function SpotCard({ s, role, now, nextItem, sh, stt, light, i, second }) {
  if (!s) return <div />;
  const name = s.he || s.en;
  const nameIsHe = !!s.he || isHebrew(s.en);
  let k, big, sub = null;
  if (role === 'now') {
    k = 'Now';
    const endAt = s.end ?? s.v + 5;
    const p = Math.min(1, Math.max(0, (now - s.v) / (endAt - s.v)));
    const seamless = nextItem && s.end != null && s.end === nextItem.v;
    big = s.end != null
      ? <Big mins={s.end} size={stt}><span>{fmt12(s.v).t}</span><span style={{ fontWeight: 400, color: 'var(--inkDim)', margin: '0 .12em' }}>–</span></Big>
      : <Big mins={s.v} size={stt} />;
    sub = s.end != null ? (
      <>
        <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
          <b style={{ display: 'block', height: '100%', width: `${(p * 100).toFixed(0)}%`, background: 'var(--ink)', borderRadius: 4 }} />
        </span>
        {!seamless && <span style={{ whiteSpace: 'nowrap' }}>{durationText(s.end - now)} left</span>}
      </>
    ) : null;
  } else {
    k = role === 'next' ? 'Next' : 'Then';
    const color = role === 'next' ? 'var(--accentText)' : 'var(--ink)';
    big = (
      <Big mins={s.v} size={stt} color={color}
        small={s.end != null ? <small style={{ fontSize: '.36em', fontWeight: 600, letterSpacing: '.01em', marginLeft: '.5em', color: role === 'next' ? 'var(--accentText)' : 'var(--inkDim)' }}>to {fmt12(s.end).t}</small> : null} />
    );
    if (role === 'next') sub = <span>in {durationText(s.v - now)}</span>;
  }
  return (
    <div data-s="" style={{
      '--i': i, ...catVars(s, light), display: 'flex', flexDirection: 'column', minWidth: 0,
      ...(second ? { borderLeft: '2px solid var(--line)', paddingLeft: 56, marginLeft: -28 } : null),
    }}>
      <div style={{ fontFamily: F.en, fontSize: 26, color: 'var(--inkDim)', fontWeight: 500 }}>{k}</div>
      <Fit max={sh} dir={nameIsHe ? 'rtl' : 'ltr'} style={{ height: Math.round(sh * 1.2), fontFamily: nameIsHe ? F.heD : F.enD, fontWeight: 600, textAlign: 'left', marginTop: 8, lineHeight: 1.15, width: '100%' }}>
        {name}
      </Fit>
      {s.he && s.en && (
        <div style={{ fontFamily: F.en, fontSize: 30, color: 'var(--inkDim)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap', marginTop: 2, overflow: 'hidden' }}>
          <Lead s={s} size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.en}</span>
        </div>
      )}
      {big}
      <div style={{ marginTop: 14, fontFamily: F.en, fontSize: 26, fontWeight: 600, color: role === 'next' ? 'var(--accentText)' : 'var(--inkDim)', display: 'flex', alignItems: 'center', gap: 18, height: 30 }}>
        {sub}
      </div>
    </div>
  );
}

function Spotlight({ items, st, ni, nowIdx, now, sh, stt, light }) {
  const pair = nowIdx >= 0 ? [nowIdx, ni] : [ni, ni + 1];
  const roles = nowIdx >= 0 ? ['now', 'next'] : ['next', 'then'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: 56 }}>
      <SpotCard s={items[pair[0]]} role={roles[0]} now={now} nextItem={items[ni]} sh={sh} stt={stt} light={light} i={1} />
      <SpotCard s={pair[1] >= 0 ? items[pair[1]] : null} role={roles[1]} now={now} nextItem={items[ni]} sh={sh} stt={stt} light={light} i={2} second />
    </div>
  );
}

function hourLabel(h) { const hh = h / 60; return `${((hh + 11) % 12) + 1} ${hh < 12 || hh === 24 ? (hh === 24 ? 'AM' : 'AM') : 'PM'}`; }

function Ribbon({ items, st, now, light }) {
  if (!items.length) return null;
  const last = items[items.length - 1];
  const t0 = Math.floor(items[0].v / 60) * 60;
  const t1 = Math.max(t0 + 120, Math.ceil(Math.max(...items.map((s) => s.end ?? s.v + 30)) / 60) * 60);
  const X = (v) => ((v - t0) / (t1 - t0)) * 100;
  const step = (t1 - t0) / 60 > 12 ? 180 : 120;
  const hrs = [];
  for (let h = Math.ceil(t0 / step) * step; h <= t1; h += step) if (h !== t0 && h !== t1) hrs.push(h);
  void last;
  return (
    <div data-s="" style={{ '--i': 3, position: 'relative', height: 66, flex: 'none' }}>
      <i style={{ position: 'absolute', left: 0, right: 0, top: 13, height: 2, background: 'var(--line)' }} />
      {items.map((s, i) => {
        const nx = items[i + 1];
        const e = s.end ?? Math.min(s.v + 25, nx ? Math.max(nx.v, s.v + 8) : s.v + 25);
        const cls = st[i];
        let bg = 'var(--cat)';
        if (cls === 'past') bg = 'color-mix(in srgb, var(--ink) 22%, transparent)';
        else if (cls === 'next') bg = 'var(--accentText)';
        else if (cls === 'now') {
          const p = Math.min(100, Math.max(0, ((now - s.v) / (e - s.v)) * 100)).toFixed(1);
          bg = `linear-gradient(90deg, var(--ink) 0 ${p}%, var(--cat) ${p}% 100%)`;
        }
        return <i key={s.id || i} style={{ ...catVars(s, light), position: 'absolute', top: 8, height: 12, borderRadius: 6, background: bg, left: `${X(s.v)}%`, width: `max(10px, calc(${X(e) - X(s.v)}% - 4px))` }} />;
      })}
      {now > t0 && now < t1 && <i style={{ position: 'absolute', top: -4, width: 4, height: 36, borderRadius: 2, background: 'var(--ink)', boxShadow: '0 0 0 4px var(--panel)', left: `calc(${X(now)}% - 2px)` }} />}
      {hrs.map((h) => (
        <span key={h} style={{ position: 'absolute', top: 34, left: `${X(h)}%`, transform: 'translateX(-50%)', fontFamily: F.en, fontSize: 20, color: 'var(--inkDim)', fontWeight: 500, whiteSpace: 'nowrap' }}>
          <i style={{ position: 'absolute', left: '50%', top: -12, width: 2, height: 7, marginLeft: -1, background: 'var(--line)' }} />
          {hourLabel(h)}
        </span>
      ))}
    </div>
  );
}

function LaterStrip({ entries, light }) {
  const { portrait } = useDesign();
  if (portrait && entries.length > 6) entries = entries.slice(0, 6);
  const dense = entries.length > 6 || portrait;
  const cols = portrait ? 3 : Math.max(entries.length, 4);
  const lt = dense ? 34 : 44, lh = dense ? 26 : 32, le = dense ? 18 : 21;
  const { boxRef, register, size, wraps } = useGroupFit({ max: lh, floor: Math.round(lh * 0.8), deps: [entries.map((e) => e.s.id + e.s.he).join('|'), dense] });
  if (!entries.length) return <div />;
  return (
    <div ref={boxRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 28, rowGap: 22 }}>
      {entries.map(({ s, i, past }) => {
        const c = past ? 'var(--past)' : undefined;
        const t = fmt12(s.v), te = s.end != null ? fmt12(s.end) : null;
        const name = s.he || s.en;
        const nameHe = !!s.he || isHebrew(s.en);
        return (
          <div key={s.id || i} data-s="" style={{ '--i': i + 5, ...catVars(s, light), minWidth: 0, paddingTop: 16, borderTop: '2px solid var(--line)' }}>
            <div className="tt-num" style={{ fontSize: lt, letterSpacing: '-.035em', fontWeight: 650, lineHeight: 1, whiteSpace: 'nowrap', color: c }}>
              {t.t}
              {te && !dense && <span style={{ fontSize: '.48em', color: c || 'var(--inkDim)', fontWeight: 600, letterSpacing: '-.01em', marginLeft: '.12em' }}>–{te.t}</span>}
              <small style={{ fontSize: '.4em', marginLeft: '.2em', fontWeight: 600, letterSpacing: '.01em', color: c || 'var(--inkDim)' }}>{te && !dense ? te.ap : t.ap}</small>
            </div>
            <div ref={register(s.id || i)} dir={nameHe ? 'rtl' : 'ltr'} style={{
              fontFamily: nameHe ? F.heD : F.enD, fontWeight: 600, textAlign: 'left', whiteSpace: wraps.has(s.id || i) ? 'normal' : 'nowrap',
              marginTop: 10, lineHeight: 1.15, fontSize: size, color: c,
              // Never clip: `overflow: hidden` cut the LAST letter of right-to-left names
              // ("ארוחת בוקר" showed as "ארוחת בוקו"). The group fit sizes/wraps the
              // names to the column; a hair of side padding also covers glyph overshoot.
              overflow: 'visible', paddingInline: '.06em', marginInline: '-.06em',
            }}>{name}</div>
            {s.he && s.en && (
              <div style={{ fontFamily: F.en, fontSize: le, color: c || 'var(--inkDim)', fontWeight: 500, marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 9, lineHeight: 1.2 }}>
                <span style={{ marginTop: '.42em', display: 'flex' }}><Lead s={s} size={10} past={past} /></span><span>{s.en}</span>
              </div>
            )}
            {te && dense && (
              <div style={{ fontFamily: F.en, fontSize: le, color: c || 'var(--inkDim)', fontWeight: 500, marginTop: 2, paddingLeft: 19 }}>to <span className="tt-num">{te.t}</span></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayList({ entries, light }) {
  const perCol = Math.max(5, Math.ceil(entries.length / 2));
  const cols = entries.length > 6 ? [entries.slice(0, perCol), entries.slice(perCol)] : [entries];
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`, columnGap: 40, minHeight: 0, marginTop: 26 }}>
      {cols.map((col, c) => (
        <div key={c} style={{ display: 'grid', gridTemplateRows: `repeat(${cols.length > 1 ? perCol : Math.max(col.length, 4)}, minmax(0, 1fr))`, minHeight: 0 }}>
          {col.map(({ s, i, past }) => {
            const color = past ? 'var(--past)' : 'var(--ink)';
            return (
              <div key={s.id || i} data-s="" style={{ '--i': i + 3, ...catVars(s, light), display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', columnGap: 20, borderTop: '2px solid var(--line)', minHeight: 0, color }}>
                <TimeText mins={s.v} size={36} width="2.72em" weight={650} ampmSize={17} ampmColor={past ? 'var(--past)' : 'var(--inkDim)'} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: F.en, fontSize: 22, color: past ? 'var(--past)' : 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', fontWeight: 500 }}>
                  <Lead s={s} size={10} past={past} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.en}{s.end != null ? ` · to ${fmt12(s.end).t}` : ''}</span>
                </span>
                {s.he && <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(32), fontWeight: 600, whiteSpace: 'nowrap' }}>{s.he}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function ScheduleSlide({ schedule, settings }) {
  const { light, portrait } = useDesign();
  const nowD = useNow(15000);
  const now = nowMinutes(nowD);
  const items = useEntries(schedule);
  const { ni, nowIdx, st } = scheduleStates(items, now);
  const label = String(schedule?.label || '').trim();
  const sh = portrait ? 50 : label ? 58 : 68;
  const stt = portrait ? 50 : label ? 66 : 76;
  const layout = settings?.scheduleLayout === 'list' ? 'list' : 'timeline';

  const done = items.length > 0 && ni < 0 && nowIdx < 0;
  const pair = nowIdx >= 0 ? [nowIdx, ni] : [ni, ni + 1];
  const top = Math.max(...pair);
  let after = items.map((s, i) => ({ s, i, past: st[i] === 'past' })).filter((o) => o.i > top);
  if (after.length < 3) after = items.map((s, i) => ({ s, i, past: st[i] === 'past' })).filter((o) => !pair.includes(o.i));
  if (after.length > 8) after = after.filter((o) => !o.past).slice(0, 8);
  const listEntries = items.map((s, i) => ({ s, i, past: st[i] === 'past' })).filter((o) => !pair.includes(o.i));

  return (
    <Panel pad="30px 44px 34px">
      <PageTitle en="Today’s schedule" heText="סדר היום" />
      {label && (
        <div data-s="" style={{ '--i': 0, display: 'flex', alignItems: 'baseline', justifyContent: isHebrew(label) ? 'flex-end' : 'flex-start', marginTop: -4 }}>
          {isHebrew(label)
            ? <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(38), fontWeight: 600 }}>{label}</span>
            : <span style={{ fontFamily: F.enD, fontSize: 38, fontWeight: 600, letterSpacing: '-.015em' }}>{label}</span>}
        </div>
      )}
      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(48), fontWeight: 600 }}>אין סדר היום להיום</div>
          <div style={{ fontFamily: F.en, fontSize: 28, color: 'var(--inkDim)' }}>No schedule for today</div>
        </div>
      ) : done ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0, paddingTop: 22 }}>
          <div data-s="" style={{ '--i': 1 }}>
            <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(62), fontWeight: 600, textAlign: 'left' }}>סדר היום הסתיים</div>
            <div style={{ fontFamily: F.en, fontSize: 30, color: 'var(--inkDim)', marginTop: 8 }}>That’s all for today. Good night!</div>
          </div>
          <Ribbon items={items} st={st} now={now} light={light} />
          <LaterStrip entries={items.slice(-8).map((s, k) => ({ s, i: items.length - Math.min(8, items.length) + k, past: true }))} light={light} />
        </div>
      ) : layout === 'list' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 22 }}>
          <Spotlight items={items} st={st} ni={ni} nowIdx={nowIdx} now={now} sh={sh} stt={stt} light={light} />
          <DayList entries={listEntries} light={light} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0, paddingTop: 22 }}>
          <Spotlight items={items} st={st} ni={ni} nowIdx={nowIdx} now={now} sh={sh} stt={stt} light={light} />
          <Ribbon items={items} st={st} now={now} light={light} />
          <LaterStrip entries={after} light={light} />
        </div>
      )}
    </Panel>
  );
}
