import React, { useMemo } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { AREAS, firstSectionOfArea, sectionsOfArea } from '../nav.js';
import { canOpenSection, can, effectiveCaps } from '../../shared/permissions.js';
import { status as announcementStatus, nextChange } from '../../shared/announcements.js';
import { nextScheduleItem, awayLabel, zonedNow } from '../../shared/scheduleNext.js';
import { healthHeadline, ago } from '../../shared/health.js';
import { slideLabel, announcementTitle, formatTime12 } from '../search/labels.js';
import { opsApi } from '../api/ops.js';
import usePolled from '../hooks/usePolled.js';
import Icon from './ui/Icon.jsx';
import StatusChip from './ops/StatusChip.jsx';
import { RoleChip } from './AdminLayout.jsx';
import FreezeControl from './FreezeControl.jsx';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}` };
const HOUR = 3600 * 1000;

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

/** "today 5:00 PM", "tomorrow 8:00 AM", "Tue 8:00 AM" in the screen's time zone. */
function whenLabel(at, now, tz) {
  const z = zonedNow(new Date(at), tz);
  const n = zonedNow(now, tz);
  const t = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined });
  const day = z.date === n.date ? 'today' : new Date(at).toLocaleDateString('en-US', { weekday: 'short', timeZone: tz || undefined });
  return `${day} ${t}`;
}

/**
 * Home: the dashboard. "On the screen now" (live: is the real screen connected and what is it showing),
 * the next schedule item with a countdown (by-date overrides respected), what is coming up, quick actions,
 * health, and one tile per area with a live status. Everything is capability-aware: a person only gets
 * the buttons their access includes, and View-only sees it read-only.
 */
export default function Home({ state, me, siteName, onGo, onQuick, onNew, onCommand, onRefreshData, onChangeDay }) {
  const role = me; // the whole person: tabs come from their capabilities (permissions.js), not just admin/editor
  const caps = me ? (me.caps || []) : effectiveCaps({ role: 'editor' });
  const tz = state?.settings?.location?.timezone;
  const slides = state?.slides || [];
  const anns = state?.announcements || [];
  const entries = state?.scheduleEntries || [];
  const scheduleDates = state?.scheduleDates || {};

  const screen = usePolled(opsApi.screenStatus, 10000);
  const health = usePolled(opsApi.health, 120000);
  const st = screen.data;
  const now = new Date();

  const info = useMemo(() => {
    const t = new Date();
    const on = slides.filter((s) => s.enabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const stat = (a) => announcementStatus(a, t, { tz });
    const live = anns.filter((a) => stat(a) === 'live');
    const scheduled = anns.filter((a) => stat(a) === 'scheduled');
    const next = nextScheduleItem({ entries, categories: state?.scheduleCategories || [] }, scheduleDates, t, tz);
    // Live ones that end, and scheduled ones that start, within the next 24 hours.
    const coming = [...live, ...scheduled].map((a) => {
      const ch = nextChange(a, t, { tz });
      return ch && ch.getTime() - t.getTime() <= 24 * HOUR ? { a, at: ch, live: stat(a) === 'live' } : null;
    }).filter(Boolean).sort((x, y) => x.at - y.at).slice(0, 4);
    return { on, live, scheduled, next, coming };
  }, [slides, anns, entries, scheduleDates, tz, state?.scheduleCategories]);

  const liveBy = (d) => info.live.filter((a) => a.display === d);
  const banner = liveBy('banner')[0];
  const takeover = liveBy('takeover')[0];
  const totalSec = info.on.reduce((n, s) => n + (Number(s.duration) || 0), 0);

  // What the real screen reports it is showing right now.
  const nowSlide = useMemo(() => {
    if (!st?.slideId) return null;
    const s = slides.find((x) => x.id === st.slideId);
    if (!s) return null;
    if (s.type === 'ANNOUNCEMENT') {
      const a = anns.find((x) => x.id === s.announcementId);
      return a ? announcementTitle(a) : 'A message';
    }
    return slideLabel(s);
  }, [st?.slideId, slides, anns]);

  const frozen = state?.freeze?.active || null;
  const zmAt = state?.cache?.zmanim?.fetchedAt ? Date.parse(state.cache.zmanim.fetchedAt) : null;
  const zmAge = zmAt ? Date.now() - zmAt : null;

  const canPost = can(caps, 'announcements.post');
  const canControl = can(caps, 'screen.control');
  const canSchedule = can(caps, 'schedule.edit');
  const readOnly = !canPost && !canControl && !canSchedule;

  const status = {
    screen: `${plural(info.on.length, 'slide', 'slides')} in the rotation`,
    schedule: info.next ? `Next: ${info.next.entry.name || info.next.entry.nameHe} ${info.next.isToday ? formatTime12(info.next.entry.time) : `tomorrow ${formatTime12(info.next.entry.time)}`}` : 'Nothing more scheduled',
    announce: info.live.length || info.scheduled.length
      ? `${info.live.length} live${info.scheduled.length ? ` · ${info.scheduled.length} scheduled` : ''}`
      : 'Nothing posted right now',
    look: `Theme: ${state?.settings?.theme || 'default'}${state?.settings?.location?.zip || state?.settings?.zipCode ? ` · ${state?.settings?.location?.zip || state?.settings?.zipCode}` : ''}`,
  };

  const online = !!st?.online;
  const lastSeen = st?.lastSeenAt ? Date.now() - Date.parse(st.lastSeenAt) : null;
  const actionTile = (testid, icon, label, onClick, extra = {}) => (
    <button key={testid} type="button" data-testid={testid} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px', padding: '8px 14px', borderRadius: 'var(--r-md)', textAlign: 'left',
      border: `1px solid ${colors.line}`, background: colors.card, boxShadow: 'var(--e1)', color: colors.text, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: '15px', fontWeight: 700, ...extra,
    }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: colors.sunken, color: colors.dim, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={icon} size={18} /></span>
      {label}
    </button>
  );

  return (
    <div data-testid="home" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0, gap: '16px', fontFamily: adminFonts.englishBody, color: colors.text }}>
      {me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: colors.dim, flexWrap: 'wrap' }}>
          <span>Hi {me.name}</span><RoleChip role={me.role} />
          <button type="button" onClick={() => onGo('account')} style={{ background: 'none', border: 'none', color: colors.accent, fontWeight: 700, cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', fontSize: '14px', minHeight: '44px' }}>My account</button>
          <button type="button" data-testid="home-history-link" onClick={() => onGo('history')} style={{ background: 'none', border: 'none', color: colors.accent, fontWeight: 700, cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', fontSize: '14px', minHeight: '44px' }}>Recent changes</button>
        </div>
      )}

      {/* Two columns on a wide screen, one on a phone. */}
      <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px', minWidth: 0 }}>
          {canPost && (
            <button type="button" onClick={onQuick} data-testid="home-quick" style={{
              display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minHeight: '88px', padding: '16px', borderRadius: 'var(--r-lg)', border: 'none',
              background: colors.accent, color: colors.accentInk, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center' }}><Icon name="bolt" size={26} /></span>
              <span>
                <span style={{ display: 'block', fontSize: '18px', fontWeight: 800 }}>Put something on the screen</span>
                <span style={{ display: 'block', fontSize: '13px', opacity: 0.85, marginTop: '2px' }}>A quick message in two taps</span>
              </span>
            </button>
          )}

          {!readOnly && (
            <div data-testid="home-actions" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))' }}>
              {canPost && actionTile('home-new', 'message', 'New announcement', () => (onNew ? onNew('slide') : onGo('announcements')))}
              {canSchedule && actionTile('home-change-tomorrow', 'calendar', 'Change tomorrow', () => onChangeDay?.('tomorrow'))}
              {canControl && actionTile('home-pause', st?.paused ? 'play' : 'pause', st?.paused ? 'Resume the screen' : 'Pause the screen', () => { onCommand?.(st?.paused ? 'resume' : 'pause'); setTimeout(screen.reload, 600); })}
              {canControl && actionTile('home-refresh', 'refresh', 'Refresh data now', () => onRefreshData?.())}
            </div>
          )}
          {readOnly && (
            <p data-testid="home-readonly" style={{ margin: 0, fontSize: '13px', color: colors.dim, lineHeight: 1.5 }}>You can look at everything here. To change something, ask an admin for editor access.</p>
          )}

          <section data-testid="on-screen-now" style={{ ...card, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '20px', margin: 0 }}>On the screen now</h2>
              {st && (online
                ? <StatusChip tone="live" label="Screen connected" />
                : <StatusChip tone="off" label={lastSeen != null ? `Offline · seen ${ago(lastSeen)}` : 'Offline'} />)}
            </div>
            {!st && screen.error && <Row icon="screen" label="Screen" text="Could not check the screen right now." />}
            {frozen && <Row icon="pause" label="Screen is" text={`Frozen (${frozen.mode})`} />}
            {st && (
              <Row icon="play" label="Playing now" testid="now-playing"
                text={online ? (nowSlide ? `${nowSlide}${st.paused ? ' (paused)' : ''}` : st.paused ? 'Paused' : 'Waiting for the screen to report') : 'Nothing: the screen is not connected'}
                onClick={() => onGo('slides')} />
            )}
            {takeover && <Row icon="takeover" label="Takeover" text={announcementTitle(takeover)} onClick={() => onGo('announcements')} />}
            {banner && <Row icon="banner" label="Banner" text={announcementTitle(banner)} onClick={() => onGo('announcements')} />}
            {liveBy('slide').slice(0, 3).map((a) => <Row key={a.id} icon="message" label="Message slide" text={announcementTitle(a)} onClick={() => onGo('announcements')} />)}
            {liveBy('note').slice(0, 2).map((a) => <Row key={a.id} icon="list" label="Side note" text={announcementTitle(a)} onClick={() => onGo('announcements')} />)}
            {!info.live.length && <Row icon="check" label="Messages" text="No announcements are live" />}
            <Row icon="screen" label="Rotation" text={`${info.on.slice(0, 4).map(slideLabel).join(' · ') || 'No slides on'}${info.on.length > 4 ? ` +${info.on.length - 4} more` : ''}${totalSec ? ` · about ${Math.round(totalSec / 60)} min per round` : ''}`} onClick={() => onGo('slides')} last />
          </section>

          <FreezeControl me={me} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px', minWidth: 0 }}>
          <section data-testid="next-schedule" style={{ ...card, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '20px', margin: 0 }}>Next on the schedule</h2>
              {info.next?.source === 'date' && <StatusChip tone="warn" label={info.next.label ? `One-day: ${info.next.label}` : 'One-day schedule'} />}
            </div>
            {info.next ? (
              <button type="button" onClick={() => onGo('schedule')} data-testid="next-item" style={{
                display: 'flex', alignItems: 'baseline', gap: '12px', width: '100%', minHeight: '64px', padding: '10px 0 4px', background: 'transparent', border: 'none',
                textAlign: 'left', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', flexWrap: 'wrap',
              }}>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: '30px', fontWeight: 600, letterSpacing: '-.01em' }}>{formatTime12(info.next.entry.time)}</span>
                <span style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '16px', fontWeight: 700, overflowWrap: 'anywhere' }}>{info.next.entry.name || info.next.entry.nameHe}</span>
                  <span style={{ display: 'block', fontSize: '13px', color: colors.dim }}>{awayLabel(info.next)}{info.next.isToday ? '' : ' (nothing more today)'}</span>
                </span>
              </button>
            ) : (
              <p style={{ margin: '10px 0 0', fontSize: '14px', color: colors.dim }}>Nothing more is scheduled today or tomorrow.</p>
            )}
            {canSchedule && (
              <button type="button" data-testid="next-change" onClick={() => onChangeDay?.('tomorrow')} style={{
                marginTop: '8px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent',
                color: colors.text, fontFamily: 'inherit', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              }}>Change a day</button>
            )}
          </section>

          <section data-testid="coming-up" style={{ ...card, padding: '16px' }}>
            <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '20px', margin: '0 0 6px' }}>Coming up</h2>
            {info.coming.length === 0 && <Row icon="check" label="Next 24 hours" text="No messages start or end soon" last />}
            {info.coming.map((c, i) => (
              <Row key={c.a.id} icon={c.live ? 'clock' : 'megaphone'} label={c.live ? `Ends ${whenLabel(c.at, now, tz)}` : `Starts ${whenLabel(c.at, now, tz)}`}
                text={announcementTitle(c.a)} onClick={() => onGo('announcements')} last={i === info.coming.length - 1} />
            ))}
          </section>

          <section data-testid="home-health" style={{ ...card, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '20px', margin: 0 }}>System health</h2>
              {health.data && <StatusChip tone={health.data.overall} />}
            </div>
            <Row icon="pulse" label="Overall" testid="health-line" text={health.data ? healthHeadline(health.data) : health.error ? 'Could not check' : 'Checking...'} onClick={() => onGo('health')} />
            <Row icon="clock" label="Zmanim" text={zmAge == null ? 'Never refreshed' : `Refreshed ${ago(zmAge)}`} onClick={() => onGo('health')} last />
          </section>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', minWidth: 0 }}>
        {AREAS.filter((a) => a.key !== 'home' && sectionsOfArea(a.key, role).length).map((a) => (
          <Tile key={a.key} testid={`tile-${a.key}`} icon={a.icon} color={a.color} title={a.en} text={status[a.key]} onClick={() => onGo(firstSectionOfArea(a.key, role))} />
        ))}
        {canOpenSection(role, 'history') && <Tile testid="tile-history" icon="history" title="Recent changes" text="Who changed what, and Undo" onClick={() => onGo('history')} />}
        {canOpenSection(role, 'health') && <Tile testid="tile-health" icon="pulse" title="System health" text={health.data ? healthHeadline(health.data) : 'Is everything working?'} onClick={() => onGo('health')} />}
      </div>
    </div>
  );
}

function Tile({ testid, icon, color, title, text, onClick }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} style={{
      ...card, padding: '14px', minHeight: '112px', textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: colors.sunken, color: color || colors.dim }}><Icon name={icon} size={20} /></span>
      <span>
        <span style={{ display: 'block', fontSize: '16px', fontWeight: 800, letterSpacing: '-.01em', marginTop: '12px' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '13px', color: colors.dim, marginTop: '2px', lineHeight: 1.35 }}>{text}</span>
      </span>
    </button>
  );
}

function Row({ icon, label, text, onClick, last, testid }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} data-testid={testid} style={{
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
