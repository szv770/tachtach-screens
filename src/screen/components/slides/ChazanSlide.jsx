import React, { useMemo } from 'react';
import { Panel, PageTitle, F, he as heSize, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { useNow } from '../../design/hooks.js';
import { nowMinutes, toMinutes } from '../../design/time.js';
import { textDir } from '../../../shared/bidi.js';
import { TEFILOS, TEFILA_HE } from '../../../shared/chazan.js';
import { daysModel, tefilaTimes, focusTefila } from '../../../shared/chazanView.js';

/**
 * Chazan: who leads Shacharis / Mincha / Maariv. Rules: src/shared/chazan.js (the same pure engine the server and the
 * admin run); this page only paints them.
 *
 *   TODAY      three big name cards (Shacharis / Mincha / Maariv), English first with the Hebrew label beside it
 *              (setting), the davening running now or next in the accent fill. A davening that does not run today
 *              says 'No Maariv chazan'.
 *   TOMORROW and the DAY AFTER   quieter rows underneath, only the davenings that run (a day with none is left out).
 * Names fit their box (one line, then smaller, then wrapped) and are never clipped. Role colours and fonts only; nothing moves.
 */

const nameFont = (text) => (textDir(text) === 'rtl' ? F.heD : F.enD);

function TodayCard({ tefila, slot, focus, hebrew, portrait }) {
  const on = !!slot;
  const name = slot?.name;
  return (
    <div data-chazan-card={tefila} data-focus={focus ? '' : undefined} data-s="" style={{
      '--i': TEFILOS.indexOf(tefila), minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      borderRadius: 28, padding: portrait ? '20px 30px 22px' : '22px 30px 26px',
      background: focus ? 'var(--fill)' : 'var(--hi)', color: focus ? 'var(--fillInk)' : 'var(--ink)',
      boxShadow: focus ? '0 10px 30px color-mix(in srgb, var(--fill) 28%, transparent)' : 'none',
      flex: portrait ? '1 1 0' : '1 1 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flex: 'none', color: focus ? 'color-mix(in srgb, var(--fillInk) 78%, transparent)' : 'var(--inkDim)' }}>
        <span style={{ fontFamily: F.en, fontSize: portrait ? 28 : 30, fontWeight: 750, letterSpacing: '.12em', textTransform: 'uppercase' }}>{tefila}</span>
        {hebrew && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: heSize(portrait ? 30 : 32), fontWeight: 600 }}>{TEFILA_HE[tefila]}</span>}
      </div>
      {on && name ? (
        <Fit wrap vcenter max={portrait ? 120 : 132} min={28} dir={textDir(name, 'ltr')} style={{ flex: 1, minHeight: 0, width: '100%', lineHeight: 1.1, fontFamily: nameFont(name), fontWeight: 800, letterSpacing: '-.015em', textAlign: 'left', overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>
          {name}
        </Fit>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', fontFamily: F.en, fontSize: portrait ? 36 : 40, fontWeight: 600, color: focus ? 'var(--fillInk)' : 'var(--inkDim)' }}>
          {on ? 'Chazan to be picked' : `No ${tefila} chazan`}
        </div>
      )}
    </div>
  );
}

function DayRows({ day, hebrew, portrait }) {
  return (
    <div data-chazan-day={day.date} data-s="" style={{ '--i': 4, minWidth: 0, minHeight: 0, flex: '1 1 0', display: 'flex', flexDirection: 'column', borderTop: '2px solid var(--line)', paddingTop: 12 }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 14, fontFamily: F.en, color: 'var(--inkDim)' }}>
        <span style={{ fontSize: portrait ? 28 : 30, fontWeight: 750, letterSpacing: '.12em', textTransform: 'uppercase' }}>{day.title}</span>
        {day.title !== day.dayName && <span style={{ fontSize: 24, fontWeight: 500 }}>{day.dayName}</span>}
      </div>
      <Fit wrap max={44} min={20} dir="ltr" style={{ flex: 1, minHeight: 0, width: '100%', lineHeight: 1.18, marginTop: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '.9em', rowGap: '.12em', alignItems: 'baseline' }}>
          {day.slots.map((s) => (
            <React.Fragment key={s.tefila}>
              <span style={{ fontFamily: F.en, fontSize: '.62em', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--inkDim)', whiteSpace: 'nowrap' }}>
                {s.tefila}{hebrew && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: '1.05em', letterSpacing: 0, textTransform: 'none', marginLeft: '.5em' }}>{TEFILA_HE[s.tefila]}</span>}
              </span>
              <span dir={textDir(s.name || '', 'ltr')} style={{ fontFamily: nameFont(s.name || ''), fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>
                {s.name ? bidiNodes(s.name) : <span style={{ color: 'var(--inkDim)', fontWeight: 600 }}>to be picked</span>}
              </span>
            </React.Fragment>
          ))}
        </div>
      </Fit>
    </div>
  );
}

export default function ChazanSlide({ chazan, dateISO, customDays, schedule, portrait: portraitProp }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const nowD = useNow(30000);
  const days = useMemo(() => daysModel(chazan, dateISO, customDays, 3), [chazan, dateISO, customDays]);
  const hebrew = chazan?.settings?.hebrewLabels !== false;
  const today = days[0];
  const later = days.slice(1).filter((d) => d.slots.length);
  const times = useMemo(() => tefilaTimes(schedule?.entries, schedule?.categories, toMinutes), [schedule]);
  const focus = today ? focusTefila(today.slots, times, nowMinutes(nowD)) : null;
  const anyToday = !!today?.slots.length;

  if (!days.length || (!anyToday && !later.length)) {
    return (
      <Panel>
        <PageTitle en="Chazan" heText="חזן" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--inkDim)', fontFamily: F.en, fontSize: 38 }}>
          {days.length ? `No chazan from the rotation${today?.off ? ` (${today.off})` : ''}` : 'The chazan rotation is not set up yet'}
        </div>
      </Panel>
    );
  }

  return (
    <Panel pad={portrait ? '28px 36px 30px' : '30px 44px 32px'}>
      <PageTitle en="Chazan" heText="חזן" style={{ marginBottom: 10 }} />
      {anyToday ? (
        <div data-chazan-today="" style={{
          flex: later.length ? (portrait ? 3 : 2.1) : 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 14 : 20,
        }}>
          {TEFILOS.map((t) => (
            <TodayCard key={t} tefila={t} slot={today.slots.find((s) => s.tefila === t)} focus={focus === t} hebrew={hebrew} portrait={portrait} />
          ))}
        </div>
      ) : (
        <div style={{ flex: 'none', fontFamily: F.en, fontSize: 36, fontWeight: 600, color: 'var(--inkDim)', padding: '8px 0 14px' }}>No chazan today{today?.off ? ` (${today.off})` : ''}</div>
      )}
      {later.length > 0 && (
        <div style={{ flex: anyToday ? 1 : 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 10 : 40, marginTop: 20 }}>
          {later.map((d) => <DayRows key={d.date} day={d} hebrew={hebrew} portrait={portrait} />)}
        </div>
      )}
    </Panel>
  );
}
