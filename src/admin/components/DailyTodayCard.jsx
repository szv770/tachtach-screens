/**
 * "Today's word / story" card shared by Admin > Daily Word and Daily Story.
 * Shows what is on the TV right now and always lets an admin change it, instantly:
 *   Show a different one (random) · Choose from the list… · Write one just for today · Edit this one ·
 *   Hide this one (skip it) · Go back to automatic.
 * Every button is one POST to `<endpoint>/today` (rules: src/shared/dailyToday.js); the server archives what actually
 * showed and broadcasts over SSE, so the TV and the live preview follow at once. Sheets use the shared ui kit.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { apiFetch } from '../hooks/useAdminState.js';
import Sheet from './ui/Sheet.jsx';
import { ConfirmDialog } from './ui.jsx';
import { RANDOM_FROM, RANDOM_FROM_LABEL, DEFAULT_RANDOM_FROM, randomFrom } from '../../shared/dailyToday.js';

const small = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const btn = (primary) => ({ ...(primary ? buttonPrimary : buttonSecondary), minHeight: '44px', minWidth: '44px', padding: '0 14px', flex: '1 1 200px', maxWidth: '100%', boxSizing: 'border-box' });

export default function DailyTodayCard({
  noun, // 'word' | 'story'
  endpoint, // '/api/daily-words'
  items, // the whole list
  entry, // what shows today (live entry or archive copy)
  manual, // today's pick was made by hand
  busy, setBusy, onFile, show,
  describe, // (item) => node for the current entry
  chooseLabel, // (item) => string for the picker rows
  chooseSearch, // (item) => string searched
  renderOneOff, // ({ onSave, onCancel, busy }) => form node
  renderEdit, // ({ entry, onClose }) => form node (saves through the panel)
  children, // order select etc.
}) {
  const [sheet, setSheet] = useState(null); // 'choose' | 'oneoff' | 'edit' | null
  const [q, setQ] = useState('');
  const [confirmHide, setConfirmHide] = useState(false);
  const [rf, setRf] = useState(DEFAULT_RANDOM_FROM);
  const live = entry?.id ? items.find((x) => x.id === entry.id) : null;
  // Same rule as the server (dailyToday.js 'random'): needs another switched-on entry. Say why instead of letting the button answer 400.
  const hasOther = items.some((x) => x.enabled !== false && x.id !== entry?.id);

  useEffect(() => {
    let off = false;
    apiFetch('/api/settings').then((s) => { if (!off) setRf(randomFrom(s)); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const run = async (op, extra, okMsg) => {
    setBusy(true);
    try {
      const r = await apiFetch(`${endpoint}/today`, { method: 'POST', body: JSON.stringify({ op, ...extra }) });
      onFile(r);
      show(okMsg);
      return true;
    } catch (e) { show(e.message, 'error'); return false; } finally { setBusy(false); }
  };

  const saveRf = async (v) => {
    const prev = rf; setRf(v);
    try { await apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify({ dailyPick: { randomFrom: v } }) }); show('Saved.'); }
    catch (e) { setRf(prev); show(e.message, 'error'); }
  };

  const pickable = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((x) => x.enabled !== false && (!t || chooseSearch(x).toLowerCase().includes(t)));
  }, [items, q, chooseSearch]);

  return (
    <div data-testid={`today-card-${noun}`}>
      <div style={{ ...small, marginBottom: '8px' }}>
        {manual ? `Chosen by hand for today. Tomorrow goes back to automatic.` : `Chosen automatically.`}
      </div>
      {entry ? describe(entry) : <span style={small}>{`No ${noun}s are switched on yet.`}</span>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
        <button type="button" style={btn(true)} disabled={busy || !hasOther} aria-describedby={hasOther ? undefined : `today-random-why-${noun}`} data-testid="today-random" onClick={() => run('random', {}, `Showing a different ${noun} now.`)}>Show a different one</button>
        <button type="button" style={btn()} disabled={busy} data-testid="today-choose" onClick={() => { setQ(''); setSheet('choose'); }}>Choose from the list…</button>
        <button type="button" style={btn()} disabled={busy} data-testid="today-oneoff" onClick={() => setSheet('oneoff')}>{`Write one just for today`}</button>
        {live && <button type="button" style={btn()} disabled={busy} data-testid="today-edit" onClick={() => setSheet('edit')}>Edit this one</button>}
        {entry && <button type="button" style={btn()} disabled={busy} data-testid="today-hide" onClick={() => setConfirmHide(true)}>Hide this one (skip it)</button>}
        <button type="button" style={btn()} disabled={busy || (!manual && !entry)} data-testid="today-auto" onClick={() => run('automatic', {}, 'Back to automatic.')}>Go back to automatic</button>
      </div>
      {!hasOther && <div id={`today-random-why-${noun}`} style={{ ...small, marginTop: '8px' }}>{`There is no other ${noun} switched on to show. Add or switch on another one first.`}</div>}
      <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '14px', maxWidth: '420px' }}>
        {`“Show a different one” picks from`}
        <select value={rf} onChange={(e) => saveRf(e.target.value)} style={{ ...inputStyle, minHeight: '44px' }} data-testid="today-random-from">
          {RANDOM_FROM.map((v) => <option key={v} value={v}>{RANDOM_FROM_LABEL[v]}</option>)}
        </select>
      </label>
      {children}

      <Sheet open={sheet === 'choose'} onClose={() => setSheet(null)} title={`Choose today's ${noun}`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" style={{ ...inputStyle, minHeight: '44px', width: '100%', boxSizing: 'border-box', margin: '8px 0' }} aria-label="Search the list" />
        <div style={{ ...small, marginBottom: '6px' }}>Only entries that are switched on are listed.</div>
        {pickable.length === 0 && <div style={small}>Nothing matches.</div>}
        {pickable.map((x) => (
          <button key={x.id} type="button" disabled={busy} data-testid={`today-pick-${x.id}`}
            onClick={async () => { if (await run('pick', { id: x.id }, `Showing this ${noun} now.`)) setSheet(null); }}
            style={{ display: 'block', width: '100%', textAlign: 'start', minHeight: '44px', padding: '8px 10px', margin: '0 0 4px', boxSizing: 'border-box', borderRadius: '8px', cursor: 'pointer',
              background: x.id === entry?.id ? colors.goldBg : 'transparent', border: `1px solid ${x.id === entry?.id ? colors.gold : colors.muted}`, color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '14px', overflowWrap: 'anywhere' }}>
            {chooseLabel(x)}{x.id === entry?.id ? ' (showing now)' : ''}
          </button>
        ))}
      </Sheet>

      <Sheet open={sheet === 'oneoff'} onClose={() => setSheet(null)} title={`A ${noun} just for today`}>
        <div style={{ ...small, margin: '4px 0 8px' }}>It shows today only. It is kept on the list, switched off, so it never comes round by itself.</div>
        {sheet === 'oneoff' && renderOneOff({
          busy,
          onCancel: () => setSheet(null),
          onSave: async (e) => { if (await run('oneoff', { entry: e }, `Showing your ${noun} now.`)) setSheet(null); },
        })}
      </Sheet>

      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title={`Edit today's ${noun}`}>
        {sheet === 'edit' && live && renderEdit({ entry: live, onClose: () => setSheet(null) })}
      </Sheet>

      {confirmHide && (
        <ConfirmDialog
          title={`Hide this ${noun}?`} confirmLabel="Hide"
          message={`It is switched off on the list (switch it back on any time) and the screen picks another ${noun} for today.`}
          onCancel={() => setConfirmHide(false)}
          onConfirm={async () => { setConfirmHide(false); await run('hide', {}, `Hidden. Showing another ${noun}.`); }}
        />
      )}
    </div>
  );
}
