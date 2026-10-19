import React, { useEffect, useMemo, useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import { ConfirmDialog, NumberField } from '../ui.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import KiddushLevanaCard from './KiddushLevanaCard.jsx';
import { DISPLAY_LABEL, LAYOUT_LABEL, STYLE_OPTIONS, minutesLabel, endOfDay, isoToLocalInput, localInputToIso } from './helpers.js';
import {
  status as statusOf, describeTiming, primaryText, archiveDaysFrom, formatWhen, layoutOf,
} from '../../../shared/announcements.js';

const TABS = [
  { key: 'draft', label: 'Drafts' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

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

function ActionButton({ children, onClick, danger, title }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      ...buttonSecondary, padding: '6px 12px', minHeight: '38px', fontSize: '13px',
      color: danger ? colors.danger : colors.text, borderColor: danger ? colors.danger : colors.border,
    }}>{children}</button>
  );
}

export default function AnnouncementsPanel({
  announcements = [], settings = {}, caps = [], onSaveSettings, onOpenComposer,
  onUpdate, onReactivate, onDuplicate, onDelete, fetchShabbosEnd,
}) {
  const isMobile = useIsMobile();
  const now = useNow();
  const tz = settings?.location?.timezone || 'America/New_York';
  const withStatus = useMemo(
    () => announcements.map((a) => ({ item: a, st: statusOf(a, now, { tz }) })),
    [announcements, now, tz],
  );
  const counts = useMemo(() => {
    const c = { draft: 0, live: 0, scheduled: 0, paused: 0, archived: 0 };
    for (const { st } of withStatus) c[st] = (c[st] || 0) + 1;
    return c;
  }, [withStatus]);
  const [tab, setTab] = useState(() => 'live');
  const [confirmDel, setConfirmDel] = useState(null);
  const [again, setAgain] = useState(null);
  const [shabbos, setShabbos] = useState(null);

  useEffect(() => {
    if (!again || shabbos) return;
    fetchShabbosEnd?.().then((r) => setShabbos(r || { available: false }));
  }, [again, shabbos, fetchShabbosEnd]);

  const rows = withStatus
    .filter((r) => r.st === tab)
    .sort((a, b) => {
      if (tab === 'archived') return String(b.item.when?.expiresAt || b.item.updatedAt).localeCompare(String(a.item.when?.expiresAt || a.item.updatedAt));
      if (tab === 'live') {
        // Soonest to end first; "until removed" last.
        const ea = a.item.when?.expiresAt ? Date.parse(a.item.when.expiresAt) : Infinity;
        const eb = b.item.when?.expiresAt ? Date.parse(b.item.when.expiresAt) : Infinity;
        return ea - eb;
      }
      if (tab === 'scheduled') return String(a.item.when?.startsAt || '').localeCompare(String(b.item.when?.startsAt || ''));
      return String(b.item.updatedAt || '').localeCompare(String(a.item.updatedAt || ''));
    });

  const archiveDays = archiveDaysFrom(settings);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: 0 }}>Announcements</h2>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '4px' }}>
            One place for everything you post: slides, banners, side notes and takeovers. Edit anything after posting; bring old ones back with “Again…”.
          </p>
        </div>
        <button type="button" onClick={() => onOpenComposer({ display: 'slide' })} style={{ ...buttonPrimary, minHeight: '48px', fontSize: '16px', padding: '10px 22px', flexShrink: 0 }}>
          + New announcement
        </button>
      </div>

      <div role="tablist" aria-label="Announcement lists" style={{
        display: 'flex', gap: '4px', overflowX: 'auto', borderBottom: `1px solid ${colors.border}`, marginBottom: '12px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 12px', minHeight: '44px', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${tab === t.key ? colors.gold : 'transparent'}`,
              color: tab === t.key ? colors.gold : colors.dim, fontFamily: adminFonts.englishBody, fontSize: '15px',
            }}
          >
            {t.label}
            <span style={{
              marginLeft: '6px', padding: '1px 7px', borderRadius: '9px', fontSize: '12px',
              background: tab === t.key ? colors.goldBg : colors.surface, color: tab === t.key ? colors.gold : colors.muted,
            }}>{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div style={{ padding: '28px 12px', textAlign: 'center', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted }}>
          {tab === 'live' ? 'Nothing is showing right now.' : tab === 'draft' ? 'No drafts. “Save draft” in the composer keeps one here without showing it.' : tab === 'archived' ? 'Nothing has ended yet.' : `Nothing ${tab}.`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map(({ item, st }) => (
          <div key={item.id} className="tt-row" data-testid="announcement-row" style={{ padding: '10px 12px', background: colors.surface, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <MiniPreview item={item} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div dir="auto" style={{
                  fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text, lineHeight: 1.35,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line',
                }}>
                  {primaryText(item) || <em style={{ color: colors.muted }}>(no text yet)</em>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center', marginTop: '4px' }}>
                  <ShowAsChip item={item} />
                  <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: st === 'live' ? colors.success : colors.dim }}>
                    {st === 'draft' ? 'Draft — not on screen' : describeTiming(item, now, { tz })}
                  </span>
                </div>
                {item.createdBy && (
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '3px' }}>
                    Posted by {item.createdBy}
                    {item.updatedBy && item.updatedBy !== item.createdBy ? ` · edited by ${item.updatedBy}` : ''}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              <ActionButton onClick={() => onOpenComposer(item)}>{st === 'draft' ? 'Edit / Post' : 'Edit'}</ActionButton>
              {(st === 'live' || st === 'scheduled') && (
                <ActionButton onClick={() => onUpdate(item.id, { enabled: false }, 'Paused')}>Pause</ActionButton>
              )}
              {st === 'paused' && <ActionButton onClick={() => onUpdate(item.id, { enabled: true }, 'Resumed')}>Resume</ActionButton>}
              {st !== 'draft' && <ActionButton onClick={() => setAgain(item)} title="Show it again from now">Again…</ActionButton>}
              <ActionButton onClick={async () => { const copy = await onDuplicate(item.id); if (copy) onOpenComposer(copy); }}>Duplicate</ActionButton>
              <ActionButton danger onClick={() => setConfirmDel(item)}>Delete</ActionButton>
            </div>
          </div>
        ))}
      </div>

      {tab === 'archived' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '16px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
          Ended announcements are deleted automatically after
          <NumberField
            value={archiveDays}
            min={1}
            max={365}
            ariaLabel="Days to keep archived announcements"
            onCommit={(n) => onSaveSettings({ announcements: { archiveDays: n } })}
            style={{ width: '60px', textAlign: 'center', minHeight: '38px' }}
          />
          days.
        </div>
      )}

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

      {confirmDel && (
        <ConfirmDialog
          title="Delete this announcement?"
          message={`“${(primaryText(confirmDel) || '').slice(0, 80)}” will be removed from the screen and from this list. You can undo right after.`}
          onConfirm={() => { const id = confirmDel.id; setConfirmDel(null); onDelete(id); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {again && (
        <AgainMenu
          item={again}
          tz={tz}
          shabbos={shabbos}
          onClose={() => setAgain(null)}
          onPick={(body) => { const id = again.id; setAgain(null); onReactivate(id, body); setTab('live'); }}
        />
      )}
    </div>
  );
}
