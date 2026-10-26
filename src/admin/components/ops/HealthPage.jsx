/**
 * /admin/health: is everything working? Every signed-in person can read it; a Fix button shows only
 * when the person's capabilities include what that fix needs (the server enforces the same rule).
 * The rows come from the pure aggregator in src/shared/health.js via GET /api/health.
 */
import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../../shared/permissions.js';
import { healthHeadline } from '../../../shared/health.js';
import { opsApi } from '../../api/ops.js';
import { notify } from '../../hooks/useAdminState.js';
import usePolled from '../../hooks/usePolled.js';
import Collapsible from '../ui/Collapsible.jsx';
import Icon from '../ui/Icon.jsx';
import StatusChip from './StatusChip.jsx';
import SoftwareUpdateCard from './SoftwareUpdateCard.jsx';
import LiveLinkCard from './LiveLinkCard.jsx';
import DataPackCard from './DataPackCard.jsx';
import ThisServerCard from './ThisServerCard.jsx';
import { ATTRIBUTION } from '../../../shared/packUi.js';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}` };
const btn = {
  minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text,
  fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
};
const btnPrimary = { ...btn, background: colors.accent, color: colors.accentInk, border: '1px solid transparent' };

export default function HealthPage({ me, onGo }) {
  const caps = me ? (me.caps || []) : effectiveCaps({ role: 'editor' });
  const { data, error, loading, reload } = usePolled(opsApi.health, 60000);
  const [busy, setBusy] = useState(null);

  const groups = useMemo(() => {
    const out = [];
    for (const c of data?.checks || []) {
      let g = out.find((x) => x.name === c.group);
      if (!g) { g = { name: c.group, checks: [] }; out.push(g); }
      g.checks.push(c);
    }
    return out;
  }, [data]);
  const attention = (data?.checks || []).filter((c) => c.status === 'bad' || c.status === 'warn')
    .sort((a, b) => (a.status === 'bad' ? 0 : 1) - (b.status === 'bad' ? 0 : 1));

  const fix = async (check) => {
    const f = check.fix;
    setBusy(check.id);
    try {
      const r = await opsApi.runFix(f);
      const freed = r?.freedBytes ? ` Freed ${Math.max(1, Math.round(r.freedBytes / 1024 / 1024))} MB.` : '';
      notify(f.action === 'push-test' ? 'Test alert sent. Check your phone.' : f.action === 'cleanup' ? `Old files cleared.${freed}` : `${f.label}: started.`, 'success');
      setTimeout(reload, f.action === 'sync-album' || f.action === 'sync-feed' ? 4000 : 800);
    } catch (e) {
      notify(`${f.label}: ${e.message}`, 'error');
    } finally { setBusy(null); }
  };

  const renderRow = (c, last) => {
    const allowed = c.fix && (c.fix.needs == null || can(caps, c.fix.needs));
    return (
      <div key={c.id} data-testid={`health-${c.id}`} data-status={c.status} style={{ padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${colors.line}`, display: 'grid', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <StatusChip tone={c.status} />
          <span style={{ fontWeight: 800, fontSize: '15px', flex: '1 1 160px', minWidth: 0 }}>{c.label}</span>
        </div>
        <div style={{ fontSize: '14px', color: colors.text, lineHeight: 1.45 }}>{c.summary}</div>
        {c.help && c.status !== 'ok' && <div style={{ fontSize: '13px', color: colors.dim, lineHeight: 1.5 }}>{c.help}</div>}
        {c.fix && (allowed ? (
          <div><button type="button" data-testid={`fix-${c.id}`} disabled={busy === c.id} onClick={() => fix(c)} style={{ ...btn, opacity: busy === c.id ? 0.55 : 1 }}>{busy === c.id ? 'Working...' : c.fix.label}</button></div>
        ) : c.status !== 'ok' && <div style={{ fontSize: '12px', color: colors.muted }}>Ask someone with access to run: {c.fix.label.toLowerCase()}.</div>)}
        {c.go && <div><button type="button" onClick={() => onGo?.(c.go)} style={btn}>Open My account</button></div>}
      </div>
    );
  };

  return (
    <div data-testid="health-page" style={{ display: 'grid', gap: '16px', fontFamily: adminFonts.englishBody, color: colors.text }}>
      <ThisServerCard me={me} />
      <SoftwareUpdateCard me={me} />
      <LiveLinkCard me={me} />
      <DataPackCard me={me} />
      <section style={{ ...card, padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: colors.sunken,
          color: data?.overall === 'bad' ? colors.danger : data?.overall === 'warn' ? colors.warn : colors.success }}><Icon name="pulse" size={26} /></span>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div data-testid="health-headline" style={{ fontFamily: 'var(--f-display)', fontSize: '22px', fontWeight: 600 }}>{loading && !data ? 'Checking...' : healthHeadline(data)}</div>
          <div style={{ fontSize: '13px', color: colors.dim, marginTop: '2px' }}>
            {data ? `${data.counts.ok} fine · ${data.counts.warn} to watch · ${data.counts.bad} need attention` : error || ' '}
          </div>
        </div>
        <button type="button" data-testid="health-recheck" onClick={reload} style={btnPrimary}>Check again</button>
      </section>

      {error && !data && <div role="alert" style={{ ...card, padding: '14px 16px', color: colors.danger }}>{error}</div>}

      {attention.length > 0 && (
        <section aria-label="Needs attention" data-testid="health-attention" style={{ ...card, padding: '4px 16px' }}>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '18px', fontWeight: 600, margin: '12px 0 0' }}>Needs your attention</h2>
          {attention.map((c, i) => renderRow(c, i === attention.length - 1))}
        </section>
      )}

      <div style={{ display: 'grid', gap: '10px' }}>
        {groups.map((g) => {
          const n = (s) => g.checks.filter((c) => c.status === s).length;
          const bits = [`${g.checks.length} check${g.checks.length === 1 ? '' : 's'}`, n('bad') && `${n('bad')} to fix`, n('warn') && `${n('warn')} to watch`].filter(Boolean);
          return (
            <Collapsible key={g.name} id={`health-${g.name.toLowerCase().replace(/[^a-z]+/g, '-')}`} title={g.name} icon="pulse"
              summary={n('bad') || n('warn') ? bits.join(' · ') : `${g.checks.length} check${g.checks.length === 1 ? '' : 's'}, all fine`}>
              <div>{g.checks.map((c, i) => renderRow(c, i === g.checks.length - 1))}</div>
            </Collapsible>
          );
        })}
      </div>
      <p data-testid="about-data" style={{ fontSize: '12px', color: colors.muted, margin: 0, lineHeight: 1.5 }}><b>About the data.</b> {ATTRIBUTION}</p>
      <p style={{ fontSize: '12px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>This page only reads. Nothing is changed unless you press a Fix button.</p>
    </div>
  );
}
