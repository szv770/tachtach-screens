/**
 * Admin → Home: what is on the screen right now, what's coming, and the
 * screen's health, with one-tap Pause / Remove / Edit. Built from
 * src/shared/homeSummary.js so it matches the kiosk's own rules.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { apiFetch } from '../hooks/useAdminState.js';
import { DEFAULT_TZ, formatWhen, to12h } from '../../shared/announcements.js';
import { buildHomeSummary } from '../../shared/homeSummary.js';
import { DISPLAY_LABEL } from './announcements/helpers.js';
import LivePreview from './LivePreview.jsx';
import ScreenControls from './ScreenControls.jsx';

const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h2 = { fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 600, color: colors.gold, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '1px' };
const body = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.5, margin: 0 };
const mini = { ...buttonSecondary, minHeight: '40px', padding: '6px 12px', fontSize: '13px' };

const KIND_COLOR = { takeover: colors.danger, banner: colors.gold, note: colors.copper, slide: colors.dim };

function Chip({ kind }) {
  return (
    <span style={{
      fontFamily: adminFonts.englishBody, fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
      color: KIND_COLOR[kind] || colors.dim, border: `1px solid ${KIND_COLOR[kind] || colors.border}`, borderRadius: '999px', padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{DISPLAY_LABEL[kind] || kind}</span>
  );
}

function minutesLabel(m) {
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return `in ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

export default function HomePanel({ state, onQuick, onEdit, onPause, onRemove, onGo, screenCommand, refresh }) {
  const isMobile = useIsMobile();
  const tz = state?.settings?.location?.timezone || DEFAULT_TZ;
  const [now, setNow] = useState(() => new Date());
  const [screens, setScreens] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let alive = true;
    const load = () => apiFetch('/api/status').then((r) => { if (alive) setScreens(r.screens); }).catch(() => { if (alive) setScreens(null); });
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const sum = useMemo(() => buildHomeSummary({
    announcements: state?.announcements || [], schedule: state?.schedule || null, scheduleDates: state?.scheduleDates || {}, now, tz,
  }), [state?.announcements, state?.schedule, state?.scheduleDates, now, tz]);
  const byId = useMemo(() => new Map((state?.announcements || []).map((a) => [a.id, a])), [state?.announcements]);

  const online = screens == null ? null : screens > 0;

  return (
    // Bottom space keeps the last row clear of the round + button.
    <div style={{ paddingBottom: '80px' }}>
      <h2 style={h2}>Home</h2>
      <p style={{ ...body, marginBottom: '16px' }}>What’s on the screen right now.</p>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ width: '12px', height: '12px', borderRadius: '50%', background: online === null ? colors.muted : online ? colors.success : colors.danger, flex: 'none' }} />
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, fontWeight: 600 }}>
            {online === null ? 'Checking the screen…' : online ? (screens > 1 ? `${screens} screens connected` : 'Screen connected') : 'No screen connected'}
          </div>
          {online === false && <p style={body}>If the TV is on, it will reconnect on its own. You’ll get an alert if alerts are on.</p>}
        </div>
        <button type="button" style={buttonPrimary} onClick={onQuick}>+ Quick announcement</button>
      </div>

      {isMobile && (
        <div style={card}>
          <LivePreview />
          <div style={{ marginTop: '10px' }}><ScreenControls onCommand={screenCommand} onRefresh={refresh} /></div>
        </div>
      )}

      <div style={card}>
        <h3 style={h3}>On screen now</h3>
        {sum.live.length === 0 ? (
          <p style={body}>Nothing special — the normal slides are rotating. Use <b>+ Quick announcement</b> to put something up.</p>
        ) : sum.live.map((a) => (
          <div key={a.id} style={{ padding: '12px 0', borderTop: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
              <Chip kind={a.display} />
              {a.hold && <span style={{ ...body, fontSize: '12px' }}>holds the slide area</span>}
            </div>
            <div dir="auto" style={{ fontFamily: adminFonts.englishBody, fontSize: '18px', color: colors.text, lineHeight: 1.35, wordBreak: 'break-word' }}>{a.text}</div>
            <p style={{ ...body, fontSize: '13px', margin: '4px 0 10px' }}>{a.timing}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" style={mini} onClick={() => onPause(a.id)}>Pause</button>
              <button type="button" style={mini} onClick={() => onEdit(byId.get(a.id))}>Edit</button>
              <button type="button" style={{ ...mini, color: colors.danger }} onClick={() => onRemove(a.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={h3}>Coming up</h3>
        {sum.upcoming.length === 0 && sum.schedule.length === 0 && <p style={body}>Nothing scheduled.</p>}
        {sum.upcoming.map((a) => (
          <div key={a.id} style={{ padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip kind={a.display} />
              <span style={{ ...body, fontSize: '13px' }}>starts {formatWhen(a.at, now, { tz })}</span>
            </div>
            <div dir="auto" style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text, marginTop: '4px' }}>{a.text}</div>
          </div>
        ))}
        {sum.schedule.length > 0 && (
          <div style={{ padding: '8px 0 0', borderTop: sum.upcoming.length ? `1px solid ${colors.border}` : 'none', marginTop: sum.upcoming.length ? '4px' : 0 }}>
            <p style={{ ...body, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Today’s schedule</p>
            {sum.schedule.map((e) => (
              <div key={e.time + e.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0', fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>
                <span dir="auto">{e.name || e.nameHe}</span>
                <span style={{ color: colors.dim, whiteSpace: 'nowrap' }}>{to12h(e.time)} · {minutesLabel(e.minutesUntil)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(sum.paused > 0 || sum.drafts > 0) && (
        <p style={{ ...body, textAlign: 'center' }}>
          {sum.paused > 0 && <>{sum.paused} paused</>}{sum.paused > 0 && sum.drafts > 0 && ' · '}{sum.drafts > 0 && <>{sum.drafts} draft{sum.drafts === 1 ? '' : 's'}</>}
          {' · '}<button type="button" onClick={() => onGo('announcements')} style={{ background: 'none', border: 'none', color: colors.gold, textDecoration: 'underline', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', minHeight: 0, padding: 0 }}>See them</button>
        </p>
      )}
    </div>
  );
}
