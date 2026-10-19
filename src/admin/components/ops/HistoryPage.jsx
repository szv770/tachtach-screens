/**
 * /admin/history ("Recent changes"): who changed what, newest first, with an Undo on every change that
 * can be reversed. Admins see everyone; everyone else sees their own changes and the shared content
 * (the server filters). Undo is optimistic on the server: if the thing changed since, it refuses with a
 * plain message and nothing is touched.
 */
import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { opsApi } from '../../api/ops.js';
import { notify } from '../../hooks/useAdminState.js';
import usePolled from '../../hooks/usePolled.js';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import Icon from '../ui/Icon.jsx';
import StatusChip from './StatusChip.jsx';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}` };
const undoBtn = {
  minHeight: '44px', minWidth: '88px', padding: '0 16px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent',
  color: colors.text, fontFamily: adminFonts.englishBody, fontWeight: 800, fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
};

function dayHeading(iso, now = new Date()) {
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function HistoryPage({ me, onChanged }) {
  const { data, error, loading, reload } = usePolled(() => opsApi.history(150), 30000);
  const [only, setOnly] = useState('all');
  const [busy, setBusy] = useState(null);
  const [refused, setRefused] = useState({}); // undo id -> plain message from the server

  const rows = useMemo(() => (data?.entries || []).filter((e) => only === 'all' || e.mine), [data, only]);
  const days = useMemo(() => {
    const out = [];
    for (const e of rows) {
      const h = dayHeading(e.at);
      let g = out.find((x) => x.h === h);
      if (!g) { g = { h, rows: [] }; out.push(g); }
      g.rows.push(e);
    }
    return out;
  }, [rows]);

  const undo = async (e) => {
    setBusy(e.undo.id);
    try {
      const r = await opsApi.undo(e.undo.id);
      notify(`Undone: ${r?.label || e.detail || e.action}`, 'success');
      setRefused((m) => { const n = { ...m }; delete n[e.undo.id]; return n; });
      await reload();
      onChanged?.();
    } catch (err) {
      setRefused((m) => ({ ...m, [e.undo.id]: err.message }));
      notify(err.message, 'error');
    } finally { setBusy(null); }
  };

  return (
    <div data-testid="history-page" style={{ display: 'grid', gap: '14px', fontFamily: adminFonts.englishBody, color: colors.text }}>
      <p style={{ margin: 0, fontSize: '14px', color: colors.dim, lineHeight: 1.5 }}>
        {data?.scope === 'everyone' ? 'Everyone\'s changes, newest first.' : 'Your changes and the shared content, newest first.'}{' '}
        Undo puts one thing back, but only if nobody has changed it since.
      </p>
      <SegmentedControl ariaLabel="Whose changes" value={only} onChange={setOnly} options={[{ value: 'all', label: data?.scope === 'everyone' ? 'Everyone' : 'All shown' }, { value: 'mine', label: 'Only mine' }]} />

      {error && !data && <div role="alert" style={{ ...card, padding: '14px 16px', color: colors.danger }}>{error}</div>}
      {loading && !data && <div style={{ ...card, padding: '16px', color: colors.dim }}>Loading...</div>}
      {data && !rows.length && (
        <div data-testid="history-empty" style={{ ...card, padding: '24px 16px', textAlign: 'center', color: colors.dim }}>
          <Icon name="history" size={28} style={{ margin: '0 auto 8px' }} />
          <div style={{ fontWeight: 800, color: colors.text }}>Nothing yet</div>
          <div style={{ fontSize: '14px', marginTop: '2px' }}>Changes will be listed here as they happen.</div>
        </div>
      )}

      {days.map((g) => (
        <section key={g.h} aria-label={g.h} style={{ ...card, padding: '4px 16px' }}>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '17px', fontWeight: 600, margin: '12px 0 2px', color: colors.dim }}>{g.h}</h2>
          {g.rows.map((e, i) => {
            const u = e.undo;
            return (
              <div key={`${e.at}-${i}`} data-testid="history-row" data-undo={u?.state || 'none'} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', flexWrap: 'wrap',
                borderBottom: i === g.rows.length - 1 ? 'none' : `1px solid ${colors.line}`,
              }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{e.detail || e.action}</div>
                  <div style={{ fontSize: '13px', color: colors.dim, marginTop: '2px' }}>
                    {e.mine ? 'You' : e.name} · {clock(e.at)}{e.detail ? ` · ${e.action}` : ''}
                  </div>
                  {u?.state === 'blocked' && <div style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>{u.reason}</div>}
                  {u?.id && refused[u.id] && <div role="alert" style={{ fontSize: '13px', color: colors.warn, marginTop: '6px', lineHeight: 1.4 }}>{refused[u.id]}</div>}
                </div>
                {u?.state === 'available' && (
                  <button type="button" data-testid="history-undo" disabled={busy === u.id} onClick={() => undo(e)} style={{ ...undoBtn, opacity: busy === u.id ? 0.55 : 1 }}>
                    <Icon name="revert" size={16} />{busy === u.id ? 'Undoing...' : 'Undo'}
                  </button>
                )}
                {u?.state === 'used' && <StatusChip tone="info" label={`Undone${u.by ? ` by ${u.by}` : ''}`} />}
                {u?.state === 'expired' && <StatusChip tone="info" label="Too old to undo" />}
              </div>
            );
          })}
        </section>
      ))}
      {me?.role === 'admin' && data && <p style={{ fontSize: '12px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>Only announcements, slides, the schedule and settings can be undone, and only for 30 days. Team and account changes never can.</p>}
    </div>
  );
}
