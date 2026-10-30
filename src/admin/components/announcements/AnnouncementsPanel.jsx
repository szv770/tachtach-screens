import React, { useEffect, useMemo, useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import { NumberField, ToggleSwitch } from '../ui.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import KiddushLevanaCard from './KiddushLevanaCard.jsx';
import { DISPLAY_LABEL, LAYOUT_LABEL, STYLE_OPTIONS, minutesLabel, endOfDay, isoToLocalInput, localInputToIso } from './helpers.js';
import { primaryText, archiveDaysFrom, formatWhen, layoutOf, moveNote } from '../../../shared/announcements.js';
import {
  filterPosts, statusCounts, postStatus, postStatusKey, postingDefaults, POST_STATUSES, STATUS_FILTER_LABEL, KIND_FILTERS, WHO_FILTERS, DATE_FILTERS,
} from '../../../shared/postList.js';
import { can } from '../../../shared/permissions.js';
import { PostStatusChip } from './PostBits.jsx';
import PostingOptions from './PostingOptions.jsx';
import { openPost } from './postOpen.js';


const DISPLAY_TINT = { slide: '#6aa0d8', banner: '#c89040', note: '#7bb07b', takeover: '#d06060' };

function useNow(ms = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function ShowAsChip({ item }) {
  const d = item.display;
  const usesLayout = d === 'slide' || d === 'takeover';
  const lay = usesLayout ? layoutOf(item) : null;
  const style = item.look?.style ? STYLE_OPTIONS.find((s) => s.value === item.look.style)?.label : null;
  const tint = DISPLAY_TINT[d] || colors.gold;
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ padding: '2px 8px', borderRadius: '10px', border: `1px solid ${tint}`, color: tint, fontFamily: adminFonts.englishBody, fontSize: '12px', whiteSpace: 'nowrap' }}>
        {DISPLAY_LABEL[d] || d}{d === 'slide' && item.hold ? ' · holds screen' : ''}
      </span>
      {usesLayout && (
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted, whiteSpace: 'nowrap' }}>
          {LAYOUT_LABEL[lay]}{style ? ` · ${style}` : ''}
        </span>
      )}
    </span>
  );
}

/** "Again…" — put an item back on screen for a new length of time. */
function AgainMenu({ item, onPick, onClose, shabbos, tz }) {
  const [custom, setCustom] = useState(isoToLocalInput(endOfDay().toISOString()));
  const last = item.when?.lastDurationMin;
  const opts = [
    ...(last ? [{ key: 'same', label: `Same length as last time (${minutesLabel(last)})`, body: { durationMin: last } }] : []),
    { key: '15', label: '15 minutes', body: { durationMin: 15 } },
    { key: '60', label: '1 hour', body: { durationMin: 60 } },
    { key: 'eod', label: `Until end of day (${formatWhen(endOfDay().getTime(), new Date(), { tz })})`, body: { expiresAt: endOfDay().toISOString() } },
    ...(shabbos?.available ? [{ key: 'shabbos', label: `Until end of Shabbos (${formatWhen(Date.parse(shabbos.iso), new Date(), { tz })})`, body: { expiresAt: shabbos.iso } }] : []),
    { key: 'forever', label: 'Until I remove it', body: {} },
  ];
  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(10,8,5,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div role="dialog" aria-modal="true" aria-label="Show again" onClick={(e) => e.stopPropagation()} style={{ background: colors.bg, border: `1px solid ${colors.goldBd}`, borderRadius: '10px', padding: '18px', width: '100%', maxWidth: '400px' }}>
        <h4 style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, margin: '0 0 4px' }}>Show again</h4>
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, margin: '0 0 12px' }}>From now, for how long?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {opts.map((o) => (
            <button key={o.key} type="button" onClick={() => onPick(o.body)} style={{ ...buttonSecondary, textAlign: 'left', minHeight: '44px' }}>{o.label}</button>
          ))}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="datetime-local" aria-label="Show until" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ ...inputStyle, minHeight: '44px', flex: 1 }} />
            <button type="button" onClick={() => { const iso = localInputToIso(custom); if (iso) onPick({ expiresAt: iso }); }} style={{ ...buttonPrimary, minHeight: '44px' }}>Until then</button>
          </div>
          <button type="button" onClick={onClose} style={{ ...buttonSecondary, minHeight: '40px', border: 'none', color: colors.dim }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function MiniPreview({ item }) {
  const text = primaryText(item) || '(empty)';
  const he = /[֐-׿]/.test(text);
  const tint = DISPLAY_TINT[item.display] || colors.gold;
  return (
    <div aria-hidden="true" style={{
      width: '72px', height: '44px', flexShrink: 0, borderRadius: '4px', background: colors.panel,
      border: `1px solid ${colors.border}`, borderBottom: item.display === 'banner' ? `4px solid ${tint}` : `1px solid ${colors.border}`,
      borderLeft: item.display === 'note' ? `4px solid ${tint}` : `1px solid ${colors.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '3px',
    }}>
      <span dir={he ? 'rtl' : 'ltr'} style={{
        fontFamily: he ? adminFonts.hebrewPrimary : adminFonts.englishBody, fontSize: '9px', lineHeight: 1.15,
        color: item.display === 'takeover' ? tint : colors.text, textAlign: 'center',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{text}</span>
    </div>
  );
}

function ActionButton({ children, onClick, danger, title, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} style={{
      ...buttonSecondary, padding: '6px 12px', minHeight: '44px', fontSize: '13px', opacity: disabled ? 0.5 : 1,
      color: danger ? colors.danger : colors.text, borderColor: danger ? colors.danger : colors.border,
    }}>{children}</button>
  );
}

const FILTER_KEY = 'tt.posts.filters';
function loadFilters() {
  try { const v = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveFilters(f) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify({ status: f.status, kind: f.kind, who: f.who, date: f.date })); } catch { /* private mode */ }
}
const selectStyle = { ...inputStyle, minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '14px', flex: '1 1 140px', minWidth: 0, boxSizing: 'border-box' };

export default function AnnouncementsPanel({
  announcements = [], settings = {}, caps = [], me = null, onSaveSettings, onOpenComposer,
  onUpdate, onReactivate, onDuplicate, onDelete, fetchShabbosEnd,
}) {
  const isMobile = useIsMobile();
  const now = useNow();
  const tz = settings?.location?.timezone || 'America/New_York';
  const canEdit = can(caps, 'announcements.edit');
  const { showEnded } = postingDefaults(settings);
  const [filters, setFilters] = useState(() => ({ status: 'all', kind: 'all', who: 'all', date: 'any', q: '', ...loadFilters(), q: '' }));
  const setF = (patch) => setFilters((f) => { const n = { ...f, ...patch }; saveFilters(n); return n; });
  const [again, setAgain] = useState(null);
  const [shabbos, setShabbos] = useState(null);

  useEffect(() => {
    if (!again || shabbos) return;
    fetchShabbosEnd?.().then((r) => setShabbos(r || { available: false }));
  }, [again, shabbos, fetchShabbosEnd]);

  const fx = { ...filters, me, showEnded };
  const rows = useMemo(() => filterPosts(announcements, fx, now, { tz }), [announcements, JSON.stringify(fx), now, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => statusCounts(announcements, fx, now, { tz }), [announcements, JSON.stringify(fx), now, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = filters.status !== 'all' || filters.kind !== 'all' || filters.who !== 'all' || filters.date !== 'any' || !!filters.q.trim();

  const archiveDays = archiveDaysFrom(settings);

  // Side notes: the screen shows at most two, in note.order (audit E-09). Up / Down renumbers only the notes that change.
  const liveNotes = useMemo(() => announcements.filter((a) => a.display === 'note' && postStatusKey(a, now, { tz }) === 'live'), [announcements, now, tz]);
  const noteRank = useMemo(() => new Map(moveNote(liveNotes, '', 'up').ordered.map((n, i) => [n.id, i])), [liveNotes]);
  const [moving, setMoving] = useState(false);
  const shiftNote = async (id, dir) => {
    const { moves } = moveNote(liveNotes, id, dir);
    if (!moves.length) return;
    setMoving(true);
    try { for (const m of moves) await onUpdate(m.id, { note: { order: m.order } }, 'Side note moved'); } finally { setMoving(false); }
  };

  const STATUS_CHIPS = ['all', ...POST_STATUSES];

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: 0 }}>Announcements</h2>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '4px' }}>
            Everything anyone posted, live ones first, then newest. Tap a post to turn it on or off, change when it shows, its seconds or its place in the slideshow.
          </p>
        </div>
        <button type="button" onClick={() => onOpenComposer({ display: 'slide' })} style={{ ...buttonPrimary, minHeight: '48px', fontSize: '16px', padding: '10px 22px', flexShrink: 0 }}>
          + New announcement
        </button>
      </div>

      <input type="search" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Search posts: any word or name"
        aria-label="Find a post" data-testid="posts-search" style={{ ...inputStyle, width: '100%', minHeight: '46px', boxSizing: 'border-box', fontSize: '16px' }} />

      <div role="group" aria-label="Show posts that are" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0' }}>
        {STATUS_CHIPS.map((k) => {
          const on = filters.status === k;
          return (
            <button key={k} type="button" aria-pressed={on} data-testid={`posts-status-${k}`} onClick={() => setF({ status: k })} style={{
              minHeight: '44px', padding: '0 12px', borderRadius: '999px', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600,
              border: `1.5px solid ${on ? colors.gold : colors.line}`, background: on ? colors.goldBg : colors.card, color: on ? colors.gold : colors.text,
            }}>
              {STATUS_FILTER_LABEL[k]} <span style={{ color: on ? colors.gold : colors.muted, fontWeight: 500 }}>{counts[k] || 0}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <select aria-label="Kind of post" value={filters.kind} onChange={(e) => setF({ kind: e.target.value })} style={selectStyle}>
          {KIND_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Whose posts" value={filters.who} onChange={(e) => setF({ who: e.target.value })} style={selectStyle}>
          {WHO_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="When posted" value={filters.date} onChange={(e) => setF({ date: e.target.value })} style={selectStyle}>
          {DATE_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {rows.length === 0 && (
        <div data-testid="posts-empty" style={{ padding: '24px 12px', textAlign: 'center', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted }}>
          {filtered ? 'No post matches. ' : 'Nothing posted yet. '}
          {filtered && <button type="button" onClick={() => { setF({ status: 'all', kind: 'all', who: 'all', date: 'any' }); setFilters((f) => ({ ...f, q: '' })); }} style={{ ...buttonSecondary, minHeight: '44px', marginTop: '8px' }}>Show everything</button>}
          {!filtered && !showEnded && counts.ended > 0 && ` ${counts.ended} ended post${counts.ended === 1 ? ' is' : 's are'} hidden (Ended shows them).`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((item) => {
          const ps = postStatus(item, now, { tz });
          const st = ps.key;
          const toggleable = canEdit && (st === 'live' || st === 'scheduled' || st === 'paused');
          return (
            <div key={item.id} className="tt-row" data-testid="announcement-row" data-status={st} style={{ padding: '10px 12px', background: colors.surface, borderRadius: '8px', border: `1px solid ${st === 'live' ? colors.goldBd : colors.border}` }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <button type="button" onClick={() => openPost(item.id)} aria-label={`Open post: ${(primaryText(item) || 'no text').slice(0, 60)}`} data-testid="post-open"
                  style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
                  <MiniPreview item={item} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span dir="auto" style={{
                      fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text, lineHeight: 1.35,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line',
                    }}>
                      {primaryText(item) || <em style={{ color: colors.muted }}>(no text yet)</em>}
                    </span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '5px' }}>
                      <PostStatusChip status={ps} />
                      <ShowAsChip item={item} />
                    </span>
                    {(ps.detail || item.createdBy) && (
                      <span style={{ display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '3px' }}>
                        {[ps.detail, item.createdBy ? `by ${item.createdBy}` : ''].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </button>
                {toggleable && (
                  <ToggleSwitch on={item.enabled !== false} label={`${(primaryText(item) || 'Post').slice(0, 40)}: ${item.enabled !== false ? 'on, tap to pause' : 'off, tap to turn on'}`}
                    onChange={() => onUpdate(item.id, { enabled: item.enabled === false }, item.enabled === false ? 'Turned on' : 'Paused (off)')} />
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                <ActionButton onClick={() => openPost(item.id)}>Open</ActionButton>
                {canEdit && st === 'draft' && <ActionButton onClick={() => onOpenComposer(item)}>Edit / Post</ActionButton>}
                {canEdit && st === 'ended' && <ActionButton onClick={() => setAgain(item)} title="Show it again from now">Show again…</ActionButton>}
                {st === 'live' && item.display === 'note' && liveNotes.length > 1 && canEdit && (
                  <>
                    <ActionButton title="Show this side note earlier" onClick={() => shiftNote(item.id, 'up')} disabled={moving || noteRank.get(item.id) === 0}>Move up</ActionButton>
                    <ActionButton title="Show this side note later" onClick={() => shiftNote(item.id, 'down')} disabled={moving || noteRank.get(item.id) === liveNotes.length - 1}>Move down</ActionButton>
                    <span style={{ alignSelf: 'center', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>
                      Side note {(noteRank.get(item.id) ?? 0) + 1} of {liveNotes.length}{(noteRank.get(item.id) ?? 0) >= 2 ? ' (waits its turn: 2 show at once)' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filters.status === 'ended' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '16px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
          Archive: ended announcements are deleted automatically after
          <NumberField
            value={archiveDays}
            min={1}
            max={365}
            ariaLabel="Days to keep archived announcements"
            onCommit={(n) => onSaveSettings({ announcements: { archiveDays: n } })}
            style={{ width: '60px', textAlign: 'center', minHeight: '44px' }}
          />
          days.
        </div>
      )}

      {can(caps, 'settings.change') && <PostingOptions settings={settings} onSaveSettings={onSaveSettings} />}

      <div style={{ marginTop: '22px' }}><KiddushLevanaCard caps={caps} /></div>

      <Collapsible id="announce-banner-settings" title="Banner display settings" summary={`${settings.banner?.mode === 'scroll' ? 'Scrolling' : 'Still'} · ${({ slow: 'slow', fast: 'fast' })[settings.banner?.speed] || 'normal'} speed (default for all banners)`} style={{ marginTop: '22px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {[
            { key: 'mode', label: 'Movement', opts: [['still', 'Still'], ['scroll', 'Scrolling']] },
            { key: 'speed', label: 'Scroll speed', opts: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']] },
          ].map((row) => {
            const cur = settings.banner?.[row.key] || (row.key === 'mode' ? 'still' : 'normal');
            return (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ width: '120px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>{row.label}</span>
                {row.opts.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={cur === v}
                    onClick={() => onSaveSettings({ banner: { [row.key]: v } })}
                    style={{ ...buttonSecondary, minHeight: '44px', padding: '6px 14px', borderColor: cur === v ? colors.gold : colors.border, color: cur === v ? colors.gold : colors.text, background: cur === v ? colors.goldBg : 'transparent' }}>
                    {l}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      
      </Collapsible>

      {again && (
        <AgainMenu
          item={again}
          tz={tz}
          shabbos={shabbos}
          onClose={() => setAgain(null)}
          onPick={(body) => { const id = again.id; setAgain(null); onReactivate(id, body); }}
        />
      )}
    </div>
  );
}
