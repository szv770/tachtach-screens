import React, { useEffect, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../shared/permissions.js';
import { MODE_LABEL, MAX_MESSAGE, DEFAULT_MESSAGE, MAX_WINDOWS, resumesText, parseHM } from '../../shared/freeze.js';
import { notify } from '../hooks/useAdminState.js';
import { ToggleSwitch } from './ui.jsx';
import Collapsible from './ui/Collapsible.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import Icon from './ui/Icon.jsx';
import { useFreeze, freezeScreen, resumeScreen, saveFreezeSchedule } from './freezeStore.js';

/**
 * Freeze / Blank screen (Phase 6A). Self-contained: Home embeds it as <FreezeControl me={me} />.
 * Big mode buttons, duration chips, Message text + Plain/Terminal, a loud RESUME while frozen with
 * "Resumes at 7:15 AM (in 20 min)", and a closed "Scheduled off-hours" section. Everything needs the
 * `screen.control` capability (the server enforces it; this only hides the buttons). Rules:
 * src/shared/freeze.js, server: src/server/freeze.js + routes/freeze.js.
 */

const MODES = [
  { key: 'blank', label: 'Blank', hint: 'Solid black', icon: 'moon' },
  { key: 'logo', label: 'Logo only', hint: 'Just the logo', icon: 'star' },
  { key: 'freeze', label: 'Freeze', hint: 'Keep this slide', icon: 'pause' },
  { key: 'message', label: 'Message', hint: 'One simple line', icon: 'message' },
];
const DURATIONS = [
  { key: 'manual', label: 'Until I resume' },
  { key: '30m', label: '30 min' },
  { key: '1h', label: '1 hour' },
  { key: 'tomorrow', label: 'Tomorrow morning' },
  { key: 'at', label: 'Until a time…' },
];
const DAYS = [['S', 0, 'Sunday'], ['M', 1, 'Monday'], ['T', 2, 'Tuesday'], ['W', 3, 'Wednesday'], ['T', 4, 'Thursday'], ['F', 5, 'Friday'], ['S', 6, 'Saturday']];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}`, padding: '16px', fontFamily: adminFonts.englishBody, color: colors.text };
const label = { display: 'block', fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: colors.muted, margin: '16px 0 8px' };
const field = {
  width: '100%', minHeight: '44px', padding: '0 12px', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.border}`, background: colors.sunken,
  color: colors.text, fontFamily: 'inherit', fontSize: '16px', outline: 'none',
};
const chip = (on) => ({
  minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-pill)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 700,
  border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accentSoft : 'transparent', color: on ? colors.accent : colors.text,
});

function time12(hm) {
  const m = parseHM(hm);
  if (m == null) return hm;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function daysText(days) {
  const d = [...days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (d.join() === '0,1,2,3,4') return 'Sun–Thu';
  if (d.join() === '0,6') return 'Sat–Sun';
  return d.map((x) => DAY_SHORT[x]).join(', ');
}

function useTick(ms = 20000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

/** What the Terminal look will be (static: the real screen types it once). */
function TerminalPreview({ text }) {
  return (
    <div data-testid="freeze-terminal-preview" aria-hidden="true" style={{
      marginTop: '10px', padding: '14px 16px', borderRadius: 'var(--r-sm)', background: colors.sunken, border: `1px solid ${colors.line}`,
      fontFamily: "ui-monospace, 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace", fontSize: '16px', color: colors.warn, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    }}>
      {'> '}{text || DEFAULT_MESSAGE}<span style={{ display: 'inline-block', width: '.55em', height: '1em', marginLeft: '2px', verticalAlign: '-2px', background: colors.warn }} />
    </div>
  );
}

function ScheduleEditor({ data, canEdit }) {
  const saved = data.windows || [];
  const [on, setOn] = useState(!!data.scheduleEnabled);
  const [rows, setRows] = useState(() => saved.map((w) => ({ ...w })));
  const [busy, setBusy] = useState(false);
  const dirty = on !== !!data.scheduleEnabled || JSON.stringify(rows) !== JSON.stringify(saved);

  const patch = (i, p) => setRows((r) => r.map((w, j) => (j === i ? { ...w, ...p } : w)));
  const add = () => setRows((r) => [...r, { id: `w${Date.now().toString(36)}`, days: [1, 2, 3, 4, 5], from: '23:00', to: '06:00', mode: 'blank', message: '', style: 'plain' }]);
  const save = async () => {
    setBusy(true);
    try { const d = await saveFreezeSchedule({ enabled: on, windows: rows }); setRows((d.windows || []).map((w) => ({ ...w }))); notify('Off-hours saved', 'success'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div data-testid="freeze-schedule" style={{ display: 'grid', gap: '14px', paddingTop: '8px' }}>
      <div style={{ fontSize: '14px', color: colors.dim, lineHeight: 1.45 }}>
        The screen freezes by itself in these windows and comes back at the end. Tapping Resume skips the window that is running, once.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px' }}>
        <ToggleSwitch on={on} onChange={() => canEdit && setOn((v) => !v)} label="Use off-hours windows" />
        <span style={{ fontSize: '15px', fontWeight: 700 }}>{on ? 'Off-hours windows are on' : 'Off-hours windows are off'}</span>
      </div>
      {rows.map((w, i) => (
        <div key={w.id} data-testid="freeze-window" style={{ display: 'grid', gap: '10px', padding: '12px', borderRadius: 'var(--r-md)', border: `1px solid ${colors.line}`, background: colors.sunken }}>
          <div role="group" aria-label="Days the window starts" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px' }}>
            {DAYS.map(([ch, d, name]) => {
              const sel = w.days.includes(d);
              return (
                <button key={d} type="button" aria-pressed={sel} aria-label={name} disabled={!canEdit}
                  onClick={() => patch(i, { days: sel ? w.days.filter((x) => x !== d) : [...w.days, d].sort() })}
                  style={{
                    minHeight: '44px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 800, padding: 0,
                    border: `1px solid ${sel ? colors.accent : colors.border}`, background: sel ? colors.accent : 'transparent', color: sel ? colors.accentInk : colors.dim,
                  }}>{ch}</button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700, color: colors.dim }}>From
              <input type="time" value={w.from} disabled={!canEdit} onChange={(e) => patch(i, { from: e.target.value })} style={field} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700, color: colors.dim }}>To {parseHM(w.to) < parseHM(w.from) ? '(next morning)' : ''}
              <input type="time" value={w.to} disabled={!canEdit} onChange={(e) => patch(i, { to: e.target.value })} style={field} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700, color: colors.dim }}>Show
            <select value={w.mode} disabled={!canEdit} onChange={(e) => patch(i, { mode: e.target.value })} style={field}>
              {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {w.mode === 'message' && (
            <>
              <input type="text" value={w.message} maxLength={MAX_MESSAGE} placeholder={DEFAULT_MESSAGE} aria-label="Message" disabled={!canEdit} onChange={(e) => patch(i, { message: e.target.value })} style={field} />
              <SegmentedControl ariaLabel="Message look" fill value={w.style} onChange={(v) => patch(i, { style: v })} options={[{ value: 'plain', label: 'Plain' }, { value: 'terminal', label: 'Terminal' }]} />
            </>
          )}
          {canEdit && (
            <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} style={{ ...chip(false), justifySelf: 'start', color: colors.danger }}>Remove this window</button>
          )}
        </div>
      ))}
      {canEdit && rows.length < MAX_WINDOWS && (
        <button type="button" onClick={add} data-testid="freeze-add-window" style={{ ...chip(false), justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icon name="plus" size={18} />Add a window</button>
      )}
      {canEdit && dirty && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={save} disabled={busy} data-testid="freeze-save-schedule" style={{ ...chip(true), background: colors.accent, color: colors.accentInk, borderColor: colors.accent, opacity: busy ? 0.6 : 1 }}>Save off-hours</button>
          <button type="button" onClick={() => { setOn(!!data.scheduleEnabled); setRows(saved.map((w) => ({ ...w }))); }} style={chip(false)}>Discard</button>
        </div>
      )}
    </div>
  );
}

export default function FreezeControl({ me }) {
  const { data, error, loaded, offset } = useFreeze();
  useTick();
  const [mode, setMode] = useState('blank');
  const [duration, setDuration] = useState('manual');
  const [at, setAt] = useState('07:00');
  const [message, setMessage] = useState('');
  const [style, setStyle] = useState('terminal');
  const [busy, setBusy] = useState(false);

  const canEdit = !me || can(me.caps || effectiveCaps(me), 'screen.control');
  const active = data?.active || null;
  const tz = data?.tz || undefined;
  const nowMs = Date.now() + offset;

  if (!loaded) return <div style={{ ...card, color: colors.muted, fontSize: '14px' }}>Loading screen controls…</div>;
  if (error && !data) return <div style={{ ...card, color: colors.danger, fontSize: '14px' }}>Screen freeze controls are not available right now. {error}</div>;
  if (!canEdit && !active) return null;

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) notify(ok, 'success'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };
  const freezeNow = () => run(
    () => freezeScreen({ mode, message: mode === 'message' ? message : '', style, duration, at: duration === 'at' ? at : undefined }),
    'Screen frozen',
  );
  const resume = () => run(resumeScreen, 'Screen resumed');
  const saveEmergency = () => run(() => saveFreezeSchedule({ emergency: !data.emergency }), null);

  const modeLabel = active ? (active.mode === 'message' ? `Message: “${(active.message || DEFAULT_MESSAGE).slice(0, 60)}”` : MODE_LABEL[active.mode]) : '';
  const nextWindow = (data?.windows || [])[0];
  const scheduleSummary = !data?.windows?.length ? 'No windows yet'
    : `${data.scheduleEnabled ? 'On' : 'Off'} · ${daysText(nextWindow.days)} ${time12(nextWindow.from)}–${time12(nextWindow.to)}${data.windows.length > 1 ? ` +${data.windows.length - 1} more` : ''}`;

  return (
    <section aria-label="Freeze or blank the screen" data-testid="freeze-control" style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: active ? colors.warnSoft : colors.sunken, color: active ? colors.warn : colors.dim }}><Icon name="pause" size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '20px', letterSpacing: '-.01em' }}>Freeze or blank the screen</h2>
          <div style={{ fontSize: '13px', color: colors.dim }}>The screen stays on, but shows nothing new.</div>
        </div>
      </div>

      {active && (
        <div data-testid="freeze-status" role="status" style={{ marginTop: '14px', padding: '14px', borderRadius: 'var(--r-md)', background: colors.warnSoft, border: '1px solid var(--warn)' }}>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>Frozen now · {modeLabel}</div>
          <div data-testid="freeze-resumes" style={{ fontSize: '14px', color: colors.dim, margin: '4px 0 12px' }}>
            {resumesText(active, tz, nowMs)}{active.source === 'schedule' ? ' · off-hours window' : ''}
          </div>
          {canEdit && (
            <button type="button" onClick={resume} disabled={busy} data-testid="freeze-resume" style={{
              width: '100%', minHeight: '60px', borderRadius: 'var(--r-md)', border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              background: colors.accent, color: colors.accentInk, fontFamily: 'inherit', fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            }}><Icon name="play" size={24} />Resume</button>
          )}
        </div>
      )}

      {canEdit && (
        <>
          <span style={label} id="freeze-mode-label">{active ? 'Change it to' : 'Show'}</span>
          <div role="group" aria-labelledby="freeze-mode-label" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            {MODES.map((m) => {
              const on = mode === m.key;
              return (
                <button key={m.key} type="button" aria-pressed={on} data-testid={`freeze-mode-${m.key}`} onClick={() => setMode(m.key)} style={{
                  minHeight: '84px', padding: '12px', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: colors.text,
                  border: `2px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accentSoft : colors.card, display: 'grid', gap: '2px', alignContent: 'center',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 800, color: on ? colors.accent : colors.text }}><Icon name={m.icon} size={20} />{m.label}</span>
                  <span style={{ fontSize: '13px', color: colors.dim }}>{m.hint}</span>
                </button>
              );
            })}
          </div>

          {mode === 'message' && (
            <div style={{ marginTop: '4px' }}>
              <span style={label}>Message</span>
              <input type="text" value={message} maxLength={MAX_MESSAGE} placeholder={DEFAULT_MESSAGE} aria-label="Message on the screen" data-testid="freeze-message" onChange={(e) => setMessage(e.target.value)} style={field} />
              <SegmentedControl ariaLabel="Message look" fill style={{ marginTop: '10px' }} value={style} onChange={setStyle}
                options={[{ value: 'plain', label: 'Plain' }, { value: 'terminal', label: 'Terminal' }]} />
              {style === 'terminal' && <TerminalPreview text={message} />}
            </div>
          )}

          <span style={label} id="freeze-for-label">For how long</span>
          <div role="group" aria-labelledby="freeze-for-label" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {DURATIONS.map((d) => (
              <button key={d.key} type="button" aria-pressed={duration === d.key} data-testid={`freeze-for-${d.key}`} onClick={() => setDuration(d.key)} style={chip(duration === d.key)}>{d.label}</button>
            ))}
          </div>
          {duration === 'at' && (
            <label style={{ display: 'grid', gap: '4px', marginTop: '10px', fontSize: '13px', fontWeight: 700, color: colors.dim, maxWidth: '220px' }}>Resume at (screen’s time zone)
              <input type="time" value={at} onChange={(e) => setAt(e.target.value)} data-testid="freeze-at" style={field} />
            </label>
          )}

          <button type="button" onClick={freezeNow} disabled={busy || (duration === 'at' && !at)} data-testid="freeze-go" style={{
            width: '100%', minHeight: '56px', marginTop: '18px', borderRadius: 'var(--r-md)', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '17px', fontWeight: 800,
            border: active ? `2px solid ${colors.accent}` : 'none', background: active ? 'transparent' : colors.accent, color: active ? colors.accent : colors.accentInk, opacity: busy ? 0.6 : 1,
          }}>{active ? 'Change the freeze' : `${mode === 'freeze' ? 'Freeze' : mode === 'message' ? 'Show message' : MODE_LABEL[mode]} now`}</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${colors.line}` }}>
            <ToggleSwitch on={!!data?.emergency} onChange={saveEmergency} label="Emergency announcements still show" />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '15px', fontWeight: 700 }}>Emergency announcements still show</span>
              <span style={{ display: 'block', fontSize: '13px', color: colors.dim }}>Only a takeover in the Emergency style shows through a freeze. Everything else waits.</span>
            </span>
          </div>
        </>
      )}

      <Collapsible title="Scheduled off-hours" summary={scheduleSummary} id="freeze-off-hours" style={{ marginTop: '14px', boxShadow: 'none' }}>
        <ScheduleEditor data={data} canEdit={canEdit} />
      </Collapsible>
    </section>
  );
}
