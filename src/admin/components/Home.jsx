import React, { useMemo } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { AREAS, firstSectionOfArea, sectionsOfArea } from '../nav.js';
import { canOpenSection } from '../../shared/permissions.js';
import { status as announcementStatus } from '../../shared/announcements.js';
import { slideLabel, announcementTitle, nextScheduleEntry, formatTime12 } from '../search/labels.js';
import Icon from './ui/Icon.jsx';
import { RoleChip } from './AdminLayout.jsx';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}` };

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

/** Home: one big tile per area with a live one-line status, plus "On the screen now". */
export default function Home({ state, me, siteName, onGo, onQuick, onNew, onCommand }) {
  const role = me?.role;
  const now = new Date();
  const tz = state?.settings?.location?.timezone;
  const slides = state?.slides || [];
  const anns = state?.announcements || [];
  const entries = state?.scheduleEntries || [];

  const info = useMemo(() => {
    const on = slides.filter((s) => s.enabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const stat = (a) => announcementStatus(a, new Date(), { tz });
    const live = anns.filter((a) => stat(a) === 'live');
    const scheduled = anns.filter((a) => stat(a) === 'scheduled');
    return { on, live, scheduled, next: nextScheduleEntry(entries, new Date()) };
  }, [slides, anns, entries, tz]);

  const liveBy = (d) => info.live.filter((a) => a.display === d);
  const banner = liveBy('banner')[0];
  const takeover = liveBy('takeover')[0];
  const totalSec = info.on.reduce((n, s) => n + (Number(s.duration) || 0), 0);

  const status = {
    screen: `${plural(info.on.length, 'slide', 'slides')} in the rotation`,
    schedule: info.next ? `Next: ${info.next.name} ${formatTime12(info.next.time)}` : `${plural(entries.filter((e) => e.enabled !== false).length, 'item', 'items')} on the weekly schedule`,
    announce: info.live.length || info.scheduled.length
      ? `${info.live.length} live${info.scheduled.length ? ` · ${info.scheduled.length} scheduled` : ''}`
      : 'Nothing posted right now',
    look: `Theme: ${state?.settings?.theme || 'default'}${state?.settings?.location?.zip || state?.settings?.zipCode ? ` · ${state?.settings?.location?.zip || state?.settings?.zipCode}` : ''}`,
  };

  return (
    <div data-testid="home" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px', fontFamily: adminFonts.englishBody, color: colors.text }}>
      {me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: colors.dim, flexWrap: 'wrap' }}>
          <span>Hi {me.name}</span><RoleChip role={me.role} />
          <button type="button" onClick={() => onGo('account')} style={{ background: 'none', border: 'none', color: colors.accent, fontWeight: 700, cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', fontSize: '14px' }}>My account</button>
        </div>
      )}

      {canOpenSection(role, 'announcements') && (
        <button type="button" onClick={onQuick} data-testid="home-quick" style={{
          display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minHeight: '96px', padding: '16px', borderRadius: 'var(--r-lg)', border: 'none',
          background: colors.accent, color: colors.accentInk, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center' }}><Icon name="bolt" size={26} /></span>
          <span>
            <span style={{ display: 'block', fontSize: '18px', fontWeight: 800 }}>Put something on the screen</span>
            <span style={{ display: 'block', fontSize: '13px', opacity: 0.85, marginTop: '2px' }}>A quick message in two taps</span>
          </span>
        </button>
      )}

      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
        {AREAS.filter((a) => a.key !== 'home' && sectionsOfArea(a.key, role).length).map((a) => (
          <button key={a.key} type="button" data-testid={`tile-${a.key}`} onClick={() => onGo(firstSectionOfArea(a.key, role))} style={{
            ...card, padding: '14px', minHeight: '112px', textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: colors.sunken, color: a.color }}><Icon name={a.icon} size={20} /></span>
            <span>
              <span style={{ display: 'block', fontSize: '16px', fontWeight: 800, letterSpacing: '-.01em', marginTop: '12px' }}>{a.en}</span>
              <span style={{ display: 'block', fontSize: '13px', color: colors.dim, marginTop: '2px', lineHeight: 1.35 }}>{status[a.key]}</span>
            </span>
          </button>
        ))}
      </div>

      <section data-testid="on-screen-now" style={{ ...card, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
          <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '20px', margin: 0 }}>On the screen now</h2>
          {canOpenSection(role, 'slides') && onCommand && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={() => onCommand('pause')} style={miniBtn}>Pause</button>
              <button type="button" onClick={() => onCommand('resume')} style={miniBtn}>Resume</button>
            </div>
          )}
        </div>
        {takeover && <Row icon="takeover" label="Takeover" text={announcementTitle(takeover)} onClick={() => onGo('announcements')} />}
        {banner && <Row icon="banner" label="Banner" text={announcementTitle(banner)} onClick={() => onGo('announcements')} />}
        {liveBy('slide').slice(0, 3).map((a) => <Row key={a.id} icon="message" label="Message slide" text={announcementTitle(a)} onClick={() => onGo('announcements')} />)}
        {liveBy('note').slice(0, 2).map((a) => <Row key={a.id} icon="list" label="Side note" text={announcementTitle(a)} onClick={() => onGo('announcements')} />)}
        {!info.live.length && <Row icon="check" label="Messages" text="No announcements are live" />}
        <Row icon="screen" label="Rotation" text={`${info.on.slice(0, 4).map(slideLabel).join(' · ') || 'No slides on'}${info.on.length > 4 ? ` +${info.on.length - 4} more` : ''}${totalSec ? ` · about ${Math.round(totalSec / 60)} min per round` : ''}`} onClick={() => onGo('slides')} />
        <Row icon="calendar" label="Next on the schedule" text={info.next ? `${info.next.name} at ${formatTime12(info.next.time)}` : 'Nothing more today'} onClick={() => onGo('schedule')} last />
      </section>
    </div>
  );
}

const miniBtn = {
  minHeight: '36px', padding: '0 14px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent',
  color: colors.text, cursor: 'pointer', fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '13px',
};

function Row({ icon, label, text, onClick, last }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '48px', padding: '8px 0', textAlign: 'left',
      background: 'transparent', border: 'none', borderBottom: last ? 'none' : `1px solid ${colors.line}`, color: 'inherit',
      cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit',
    }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: colors.sunken, color: colors.dim, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={icon} size={16} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: '12px', color: colors.muted, fontWeight: 700 }}>{label}</span>
        <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      </span>
      {onClick && <Icon name="chevron" size={16} style={{ color: colors.muted }} />}
    </Tag>
  );
}
