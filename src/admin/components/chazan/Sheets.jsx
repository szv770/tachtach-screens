import React, { useState, useEffect, useMemo } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import { apiFetch } from '../../hooks/useAdminState.js';
import Sheet from '../ui/Sheet.jsx';
import { TEFILOS, FILL_RULE_INFO } from '../../../shared/chazan.js';
import { small, prettyDate } from './shared.js';

/** Replace the chazan for one date + davening: the suggestion per the fill rule first, then everybody else, with search. */
export function SwapSheet({ target, name, roster, order, onPick, onClose }) {
  const [opts, setOpts] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    apiFetch(`/api/chazan/swap-options?date=${target.date}&tefila=${target.tefila}`).then((o) => live && setOpts(o)).catch(() => live && setOpts({ candidates: [], suggest: null, due: null }));
    return () => { live = false; };
  }, [target.date, target.tefila]);
  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const inLine = (opts?.candidates || []).filter((id) => byId.has(id));
  const others = order.filter((id) => id !== opts?.due && !inLine.includes(id));
  const match = (id) => !q.trim() || name(id).toLowerCase().includes(q.trim().toLowerCase());
  const row = (id, tag) => (
    <button key={id} type="button" onClick={() => onPick(id)} style={{ ...buttonSecondary, display: 'flex', width: '100%', minHeight: '48px', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', textAlign: 'left' }}>
      <span style={{ fontWeight: 700 }}>{name(id)}</span>{tag && <span style={{ ...small, fontWeight: 600 }}>{tag}</span>}
    </button>
  );
  return (
    <Sheet open onClose={onClose} title={`Swap ${target.tefila}`}>
      <div style={{ ...small, marginBottom: '8px' }}>{prettyDate(target.date, { weekday: 'long', month: 'short', day: 'numeric' })}{opts?.due && <> · due: <b>{name(opts.due)}</b></>}</div>
      {!opts && <div style={small}>Working it out…</div>}
      {opts && (
        <>
          {opts.locked && <div style={{ ...small, marginBottom: '8px' }} data-testid="swap-locked-note">This name is already on the screen, so only this one davening changes. Nobody else moves.</div>}
          {opts.suggest ? (
            <div style={{ border: `1px solid ${colors.gold || colors.accent}`, borderRadius: 'var(--r-md)', padding: '12px', marginBottom: '8px' }}>
              <div style={{ ...small, fontWeight: 700, color: colors.text }}>Suggested</div>
              <div style={small}>{FILL_RULE_INFO[opts.fill]?.hint}</div>
              <button style={{ ...buttonPrimary, minHeight: '48px', width: '100%', marginTop: '8px' }} onClick={() => onPick(opts.suggest)} data-testid="swap-suggested">{name(opts.suggest)}</button>
            </div>
          ) : <div style={{ ...small, marginBottom: '8px' }}>{opts.fill === 'manual' ? 'You pick every time (Settings > When someone is swapped out).' : 'Nobody is free to cover. Pick anyone below.'}</div>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the list" aria-label="Search" style={{ ...inputStyle, marginBottom: '4px' }} />
          <div style={{ ...small, fontWeight: 700, color: colors.text, marginTop: '8px' }}>Furthest from his turn first</div>
          {inLine.filter(match).map((id, i) => row(id, id === opts.suggest ? 'suggested' : i === 0 ? 'furthest' : ''))}
          {others.filter(match).length > 0 && <div style={{ ...small, fontWeight: 700, color: colors.text, marginTop: '12px' }}>Away or cannot lead this one</div>}
          {others.filter(match).map((id) => row(id, ''))}
        </>
      )}
    </Sheet>
  );
}

/** Away from - to (to may be left empty: until marked back). */
export function AwaySheet({ person, name, today, onSave, onClose }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState('');
  const bad = to && to < from;
  return (
    <Sheet open onClose={onClose} title={`${name} is away`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '10px' }}>
        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label="From" /></label>
        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>To (last day)<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label="To" /></label>
      </div>
      <div style={{ ...small, marginTop: '8px' }}>Leave “To” empty if you do not know yet: he stays away until you tap Back. The rotation skips him and he rejoins by itself.</div>
      {bad && <div style={{ ...small, color: colors.danger, marginTop: '6px' }}>The last day cannot be before the first.</div>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button style={{ ...buttonPrimary, minHeight: '44px', flex: 1, opacity: bad || !from ? 0.5 : 1 }} disabled={!!bad || !from} onClick={() => onSave(from, to || null)}>Save</button>
        <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

/** Pick people from the roster who are not in the line yet. */
export function AddSheet({ candidates, name, onAdd, onClose }) {
  const [sel, setSel] = useState([]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Sheet open onClose={onClose} title="Add to the rotation">
      {!candidates.length && <div style={small}>Everyone on the bochurim list is already in the rotation.</div>}
      {candidates.map((id) => (
        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '48px', fontFamily: adminFonts.englishBody, color: colors.text, fontWeight: 600 }}>
          <input type="checkbox" checked={sel.includes(id)} onChange={() => toggle(id)} style={{ width: 22, height: 22 }} />{name(id)}
        </label>
      ))}
      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button style={{ ...buttonPrimary, minHeight: '44px', flex: 1, opacity: sel.length ? 1 : 0.5 }} disabled={!sel.length} onClick={() => onAdd(sel)}>Add {sel.length || ''}</button>
        <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={onClose}>Cancel</button>
      </div>
      <div style={{ ...small, marginTop: '8px' }}>New people go to the back of the line (furthest from their turn). New names are added on the Bochurim page.</div>
    </Sheet>
  );
}

/** "Can only lead: Shacharis / Mincha / Maariv". */
export function CanSheet({ person, name, current, onSave, onClose }) {
  const [sel, setSel] = useState(current || TEFILOS);
  const toggle = (t) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  return (
    <Sheet open onClose={onClose} title={`${name} can lead`}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {TEFILOS.map((t) => {
          const on = sel.includes(t);
          return <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)} style={{ ...buttonSecondary, minHeight: '48px', padding: '0 18px', borderColor: on ? colors.accent : colors.line, background: on ? colors.goldBg : 'transparent', fontWeight: 700 }}>{t}</button>;
        })}
      </div>
      <div style={{ ...small, marginTop: '8px' }}>He is only put on the ones that are on. All three on = no limit.</div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button style={{ ...buttonPrimary, minHeight: '44px', flex: 1, opacity: sel.length ? 1 : 0.5 }} disabled={!sel.length} onClick={() => onSave(sel)}>Save</button>
        <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
