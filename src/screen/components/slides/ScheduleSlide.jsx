import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PageTitle, F, he, Bidi } from '../../design/ui.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { useNow } from '../../design/hooks.js';
import { nowMinutes, isHebrew } from '../../design/time.js';
import { longTextSettings } from '../../../shared/longText.js';
import { prefersReducedMotion } from '../../design/reader.js';
import { SCHEDULE_VIEWS, scheduleViewSettings, rowStates, autoSlideSeconds } from '../../../shared/scheduleLayout.js';
import { useScheduleItems } from './schedule/model.js';
import DayView from './schedule/DayView.jsx';
import TimelineView from './schedule/TimelineView.jsx';
import FocusView from './schedule/FocusView.jsx';

/**
 * Schedule page — the flagship. Three views (rules + maths: src/shared/scheduleLayout.js):
 *   'day'       Whole day, auto-fitted into 1-3 columns, or one slow finite scroll below the floor.
 *   'timeline'  Vertical axis recentred on now with one finite transform transition.
 *   'focus'     Faded past, NOW large, next rows decreasing, the rest in a strip.
 *   'auto'      The three in turn inside this one slide, `scheduleView.autoSeconds` each; the clock stops
 *               while the page is held (admin preview Pause, freeze, a takeover: [data-reader-hold="1"]).
 * State logic: a range is "now" until its end; a point event is "now" for 5 minutes. English first,
 * Hebrew the optional extra (`scheduleView.hebrew`).
 */

const VIEW_CSS = '@keyframes ttSchedIn{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}';

export default function ScheduleSlide({ schedule, settings, slide, onRequestDuration }) {
  const { light, portrait, motion } = useDesign();
  const nowD = useNow(15000);
  const now = nowMinutes(nowD);
  const items = useScheduleItems(schedule);
  const states = useMemo(() => rowStates(items, now), [items, now]);
  const sv = scheduleViewSettings(settings);
  const lt = longTextSettings(settings);
  const canScroll = lt.mode === 'scroll' && motion !== 'minimal' && !prefersReducedMotion();
  const views = sv.layout === 'auto' ? SCHEDULE_VIEWS : [sv.layout];
  const [vi, setVi] = useState(0);
  const [daySecs, setDaySecs] = useState(0);
  const rootRef = useRef(null);
  const view = views[vi % views.length];
  const label = String(schedule?.label || '').trim();

  // auto-rotate: count only the seconds the page is really on screen (not held)
  const viRef = useRef(vi); viRef.current = vi;
  const daySecsRef = useRef(daySecs); daySecsRef.current = daySecs;
  useEffect(() => {
    if (views.length < 2) return undefined;
    let elapsed = 0;
    const id = setInterval(() => {
      const held = rootRef.current?.closest?.('[data-reader-hold="1"]');
      if (held) return;
      elapsed += 1;
      const v = views[viRef.current % views.length];
      const need = v === 'day' ? Math.max(sv.autoSeconds, daySecsRef.current || 0) : sv.autoSeconds;
      if (elapsed >= need) { elapsed = 0; setVi((x) => (x + 1) % views.length); }
    }, 1000);
    return () => clearInterval(id);
  }, [views.length, sv.autoSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ask the rotation for enough time: every view once (auto), or the whole-day scroll
  const base = Number(slide?.duration) || 13;
  useEffect(() => {
    if (!onRequestDuration) return;
    if (views.length > 1) onRequestDuration(autoSlideSeconds([Math.max(sv.autoSeconds, daySecs), sv.autoSeconds, sv.autoSeconds], base));
    else if (view === 'day' && daySecs > 0) onRequestDuration(Math.max(base, daySecs));
    else onRequestDuration(null);
  }, [views.length, view, daySecs, sv.autoSeconds, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const common = { items, states, now, light, portrait };
  let body;
  if (view === 'timeline') body = <TimelineView {...common} motion={motion} />;
  else if (view === 'focus') body = <FocusView {...common} />;
  else body = <DayView {...common} hebrewMode={sv.hebrew} canScroll={canScroll} speed={lt.speed} onSeconds={setDaySecs} />;

  return (
    <Panel pad={portrait ? '28px 36px 30px' : '30px 44px 32px'}>
      <div ref={rootRef} data-schedule-layout={sv.layout} data-view={view} style={{ display: 'contents' }}>
        <PageTitle en="Today’s schedule" heText="סדר היום" style={{ marginBottom: label ? 4 : 8 }} />
        {label && (
          <div data-s="" style={{ '--i': 0, display: 'flex', alignItems: 'baseline', justifyContent: isHebrew(label) ? 'flex-end' : 'flex-start', flex: 'none' }}>
            {isHebrew(label)
              ? <Bidi text={label} fallback="rtl" style={{ fontFamily: F.heD, fontSize: he(34), fontWeight: 600 }} />
              : <Bidi text={label} style={{ fontFamily: F.enD, fontSize: 34, fontWeight: 600, letterSpacing: '-.015em' }} />}
          </div>
        )}
        {items.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontFamily: F.enD, fontSize: 44, fontWeight: 600 }}>No schedule for today</div>
            <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(34), color: 'var(--inkDim)' }}>אין סדר היום להיום</div>
          </div>
        ) : (
          <div key={view} data-s="" style={{
            '--i': 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            ...(views.length > 1 && motion !== 'minimal' ? { animation: 'ttSchedIn .6s cubic-bezier(.22,.7,.2,1) both' } : null),
          }}>
            {views.length > 1 && <style>{VIEW_CSS}</style>}
            {body}
          </div>
        )}
      </div>
    </Panel>
  );
}
