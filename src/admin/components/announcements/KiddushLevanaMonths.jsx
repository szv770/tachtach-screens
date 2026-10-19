/**
 * Announce > Kiddush Levana > "Upcoming months": the next 12-24 windows as a sleek list (molad, can
 * start, last night; a closed "Details" per month with the cutoff, customs and the edit button),
 * per-month edit (own start / cutoff, or skip the month, with "Reset to computed") and
 * "Share with the rabbi" (copy / print / .txt). Data: GET /api/kiddush-levana/months; edits:
 * PUT /api/kiddush-levana/override/:key (settings.kiddushLevana.overrides). Pure text/page code:
 * src/shared/kiddushLevanaShare.js.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, adminFonts, buttonSecondary, buttonPrimary, inputStyle } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import Icon from '../ui/Icon.jsx';
import { ToggleSwitch } from '../ui.jsx';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { whenEn, dayEn, timeEn, moladEn } from '../../../shared/kiddushLevana.js';
import { zonedParts, zonedTimeToUtc } from '../../../shared/announcements.js';
import { klShareText, klShareHtml } from '../../../shared/kiddushLevanaShare.js';

const txt = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text };
const dim = { ...txt, color: colors.dim, fontSize: '13px' };
const pad = (n) => String(n).padStart(2, '0');
const dateOf = (ms, tz) => zonedParts(ms, tz).date;
const timeOfDay = (ms, tz) => { const p = zonedParts(ms, tz); return `${pad(p.hh)}:${pad(p.mm)}`; };

function Chip({ children, tone }) {
  const c = tone === 'warn' ? colors.warn : colors.gold;
  return <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: '999px', padding: '1px 8px', whiteSpace: 'nowrap' }}>{children}</span>;
}

function MonthRow({ row, tz, editable, onEdit }) {
  const [open, setOpen] = useState(false);
  const last = row.last;
  return (
    <li data-testid="kl-month" data-key={row.key} style={{ listStyle: 'none', background: colors.sunken, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '12px 14px', opacity: row.hidden ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '18px', flex: '1 1 auto' }}>{row.month}</span>
        {row.hidden && <Chip tone="warn">Skipped</Chip>}
        {row.overridden && <Chip>Edited</Chip>}
        {row.usable === 0 && !row.hidden && <Chip tone="warn">No nights</Chip>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px 16px', marginTop: '8px' }}>
        <div><div style={dim}>Can start</div><div style={{ ...txt, fontWeight: 600, textDecoration: row.hidden ? 'line-through' : 'none' }}>{whenEn(row.canStart, tz)}</div></div>
        <div><div style={dim}>Last night</div><div style={{ ...txt, fontWeight: 600, textDecoration: row.hidden ? 'line-through' : 'none' }}>{last ? dayEn(last.start, tz) : 'None'}</div></div>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        style={{ marginTop: '8px', minHeight: '44px', padding: '0 4px', background: 'transparent', border: 'none', color: colors.dim, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600 }}>
        Details <Icon name="chevdown" size={16} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div data-testid="kl-details" style={{ borderTop: `1px solid ${colors.line}`, paddingTop: '8px' }}>
          <div style={txt}>Molad: {moladEn(row.molad, tz)}</div>
          <div style={txt}>Cutoff: {whenEn(row.end, tz)}{last && last.end !== row.end ? ' (last night ends at dawn)' : ''}</div>
          {row.overridden && <div style={dim}>Computed: can start {whenEn(row.computedStart, tz)} · cutoff {whenEn(row.computedEnd, tz)}</div>}
          {(row.notes || []).map((n) => <div key={n.date} style={dim}>{n.date}: {n.en}{n.skipped ? ' (night skipped)' : ''}</div>)}
          {editable && (
            <button type="button" onClick={() => onEdit(row)} style={{ ...buttonSecondary, minHeight: '44px', padding: '0 16px', marginTop: '10px' }}>
              {row.overridden || row.hidden ? 'Edit or reset this month' : 'Edit this month'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function EditSheet({ row, tz, onClose, onSave }) {
  const [sd, setSd] = useState(dateOf(row.start, tz));
  const [st, setSt] = useState(timeOfDay(row.start, tz));
  const [ed, setEd] = useState(dateOf(row.end, tz));
  const [et, setEt] = useState(timeOfDay(row.end, tz));
  const [hide, setHide] = useState(row.hidden);
  const [busy, setBusy] = useState(false);
  const start = sd && st ? zonedTimeToUtc(sd, st, tz).getTime() : NaN;
  const end = ed && et ? zonedTimeToUtc(ed, et, tz).getTime() : NaN;
  const bad = !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
  const field = { ...inputStyle, minHeight: '44px', fontSize: '16px', fontFamily: adminFonts.englishBody };
  const lab = { ...dim, display: 'block', fontWeight: 700, marginBottom: '4px' };
  const save = async () => {
    setBusy(true);
    const body = { hide };
    // Only what really differs from the computed time is stored (so a later rule change still applies to the rest).
    if (Math.abs(start - row.computedStart) > 60000) body.start = start;
    if (Math.abs(end - row.computedEnd) > 60000) body.end = end;
    await onSave(row.key, body);
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} title={`Edit ${row.month}`} maxWidth={520}>
      <p style={{ ...dim, lineHeight: 1.5, margin: '4px 0 12px' }}>
        Computed: can start {whenEn(row.computedStart, tz)} · cutoff {whenEn(row.computedEnd, tz)}. Change either one if your rav says so; the screen follows. Times are on the school clock.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div><span style={lab}>Starts (date)</span><input type="date" aria-label="Start date" value={sd} onChange={(e) => setSd(e.target.value)} style={field} /></div>
        <div><span style={lab}>Starts (time)</span><input type="time" aria-label="Start time" value={st} onChange={(e) => setSt(e.target.value)} style={field} /></div>
        <div><span style={lab}>Cutoff (date)</span><input type="date" aria-label="Cutoff date" value={ed} onChange={(e) => setEd(e.target.value)} style={field} /></div>
        <div><span style={lab}>Cutoff (time)</span><input type="time" aria-label="Cutoff time" value={et} onChange={(e) => setEt(e.target.value)} style={field} /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
        <ToggleSwitch on={hide} label="Skip this month" onChange={() => setHide(!hide)} />
        <span style={txt}>Skip this month (nothing is announced)</span>
      </div>
      {bad && <div role="alert" style={{ ...txt, color: colors.warn, marginTop: '10px' }}>The cutoff has to be after the start.</div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
        <button type="button" disabled={bad || busy} onClick={save} style={{ ...buttonPrimary, minHeight: '48px', padding: '0 22px', opacity: bad || busy ? 0.5 : 1 }}>Save</button>
        {(row.overridden || row.hidden) && <button type="button" disabled={busy} onClick={() => onSave(row.key, { reset: true })} style={{ ...buttonSecondary, minHeight: '48px', padding: '0 18px' }}>Reset to computed</button>}
        <button type="button" onClick={onClose} style={{ ...buttonSecondary, minHeight: '48px', padding: '0 18px' }}>Cancel</button>
      </div>
    </Sheet>
  );
}

function ShareSheet({ data, onClose }) {
  const frame = useRef(null);
  const args = { rows: data.rows, tz: data.timezone, settings: data.settings, place: data.place, generatedAt: new Date() };
  const html = klShareHtml(args);
  const text = klShareText(args);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify?.('Copied'); } catch { notify?.('Could not copy. Use Download instead.'); }
  };
  const print = () => { const w = frame.current?.contentWindow; if (w) { w.focus(); w.print(); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'kiddush-levana-upcoming-months.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const btn = { ...buttonSecondary, minHeight: '44px', padding: '0 16px' };
  return (
    <Sheet open onClose={onClose} title="Share with the rabbi" maxWidth={820}>
      <p style={{ ...dim, lineHeight: 1.5, margin: '4px 0 10px' }}>One clean page with the months, the rules used and the questions to confirm. Copy it, print it or save it as a text file.</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button type="button" onClick={copy} style={btn}>Copy text</button>
        <button type="button" onClick={print} style={btn}>Print</button>
        <button type="button" onClick={download} style={btn}>Download .txt</button>
      </div>
      <iframe ref={frame} title="Page for the rabbi" srcDoc={html} sandbox="allow-same-origin allow-modals"
        style={{ width: '100%', height: '55dvh', border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', background: '#fff' }} />
    </Sheet>
  );
}

export default function KiddushLevanaMonths({ editable, onChanged }) {
  const [data, setData] = useState(null);
  const [count, setCount] = useState(14);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [share, setShare] = useState(false);
  const load = useCallback(async (n) => {
    try { setData(await apiFetch(`/api/kiddush-levana/months?count=${n}`)); setErr(''); } catch (e) { setErr(e.message || 'Could not load the months.'); }
  }, []);
  useEffect(() => { load(count); }, [load, count]);

  const save = async (key, body) => {
    try {
      setData(await apiFetch(`/api/kiddush-levana/override/${key}?count=${count}`, { method: 'PUT', body: JSON.stringify(body) }));
      setEditing(null);
      onChanged?.();
      notify?.(body.reset ? 'Back to the computed times' : 'Saved');
    } catch (e) { notify?.(e.message || 'Could not save.'); }
  };

  if (err) return <div role="alert" style={{ ...txt, color: colors.danger }}>{err}</div>;
  if (!data) return <div style={dim}>Loading the months…</div>;
  const tz = data.timezone;
  const edited = data.rows.filter((r) => r.overridden || r.hidden).length;
  return (
    <div data-testid="kl-months">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ ...dim, flex: '1 1 200px' }}>
          Next {data.rows.length} months, worked out from the Hebrew calendar{edited ? ` · ${edited} edited by hand` : ''}.
          {data.approx ? ' Nightfall is estimated until the location has loaded.' : ''}
        </div>
        <button type="button" onClick={() => setShare(true)} style={{ ...buttonSecondary, minHeight: '44px', padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="external" size={16} /> Share with the rabbi
        </button>
      </div>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.rows.map((r) => <MonthRow key={r.key} row={r} tz={tz} editable={editable} onEdit={setEditing} />)}
      </ul>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        {count < 24 && <button type="button" onClick={() => setCount(24)} style={{ ...buttonSecondary, minHeight: '44px', padding: '0 16px' }}>Show 24 months</button>}
        {count > 14 && <button type="button" onClick={() => setCount(14)} style={{ ...buttonSecondary, minHeight: '44px', padding: '0 16px' }}>Show fewer</button>}
      </div>
      <div style={{ ...dim, marginTop: '8px' }}>The first night of a window that opens in the small hours counts from that moment; the first real evening is the next night. Please confirm the cutoff and customs with your rav.</div>
      {editing && <EditSheet row={editing} tz={tz} onClose={() => setEditing(null)} onSave={save} />}
      {share && <ShareSheet data={data} onClose={() => setShare(false)} />}
    </div>
  );
}
