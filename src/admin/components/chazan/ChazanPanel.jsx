/**
 * Admin > Screen > Chazan. The rotation of who leads Shacharis / Mincha / Maariv (rules: src/shared/chazan.js; data:
 * data/chazan.json via /api/chazan). Names come from the Bochurim list.
 *   Today / Tomorrow / day after cards with a one-tap Swap, the rotation order (who is next, Away, Can lead),
 *   a 14-day forecast, and the settings (which davenings on which days, the fill rule, names).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import Collapsible from '../ui/Collapsible.jsx';
import { addDays, awayRange, isAway, TEFILOS } from '../../../shared/chazan.js';
import { card, h3, small, chip, makeNamer, prettyDate } from './shared.js';
import { DayCard, Forecast } from './DayCards.jsx';
import { SwapSheet, AwaySheet, AddSheet, CanSheet } from './Sheets.jsx';
import ChazanSettings, { settingsSummary } from './ChazanSettings.jsx';

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export default function ChazanPanel({ canEdit = true, onNavigate }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [swap, setSwap] = useState(null);   // { date, tefila }
  const [away, setAway] = useState(null);   // id
  const [can, setCan] = useState(null);     // id
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setView(await apiFetch('/api/chazan')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const run = async (path, method, body, okMsg, undo) => {
    setBusy(true);
    try {
      const next = await apiFetch(path, json(method, body));
      setView(next);
      if (okMsg) notify(okMsg, 'success', undo ? { label: 'Undo', onClick: undo } : null);
      return true;
    } catch (e) { notify(e.message, 'error'); return false; } finally { setBusy(false); }
  };

  const settings = view?.settings;
  const name = useMemo(() => makeNamer(view?.roster, settings?.names), [view, settings?.names]);
  if (!view) return <div style={{ ...small, padding: '20px' }}>{error || 'Loading…'}</div>;

  const today = view.today;
  const ro = !canEdit;
  const upcoming = view.days.filter((d) => d.date >= today);
  const cards = upcoming.slice(0, 3);
  const inLine = new Set(view.order);
  const notIn = view.roster.map((p) => p.id).filter((id) => !inLine.has(id));
  const pos = view.line.position;

  const saveOrder = (order, next, msg, undoOrder) => run('/api/chazan/order', 'PUT', { order, next }, msg, undoOrder && (() => run('/api/chazan/order', 'PUT', { order: undoOrder }, 'Undone')));
  const move = (i, d) => { const o = [...view.order]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; saveOrder(o, null); };
  const doSwap = async (id) => {
    const t = swap; setSwap(null);
    await run('/api/chazan/swap', 'POST', { date: t.date, tefila: t.tefila, personId: id }, `${name(id)} will lead ${t.tefila}`, () => undoSwap(t.date, t.tefila));
  };
  const undoSwap = (date, tefila) => run(`/api/chazan/swap?date=${date}&tefila=${tefila}`, 'DELETE', undefined, 'Swap undone');
  const saveSettings = (patch) => run('/api/chazan/settings', 'PUT', patch);

  return (
    <div data-testid="chazan-panel">
      <p style={{ ...small, margin: '4px 0 14px' }}>
        One line of chazanim for every davening. Whoever is next leads, then goes to the back; at the end it starts again. Names come from the <button type="button" onClick={() => onNavigate?.('roster')} style={{ background: 'none', border: 'none', padding: 0, color: colors.accent, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Bochurim</button> list. Turn the Chazan slide on in <button type="button" onClick={() => onNavigate?.('slides')} style={{ background: 'none', border: 'none', padding: 0, color: colors.accent, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Slides</button>.
      </p>
      {error && <div style={{ ...small, color: colors.danger, marginBottom: '10px' }}>{error}</div>}
      {ro && <div style={{ ...small, marginBottom: '10px' }}>You can look at this page but not change it.</div>}

      {!view.order.length && (
        <div style={card}>
          <h3 style={h3}>Nobody in the rotation yet</h3>
          <p style={small}>Add everyone from the Bochurim list in one tap, then fine-tune below.</p>
          {canEdit && <button style={{ ...buttonPrimary, minHeight: '48px' }} disabled={busy || !view.roster.length} onClick={() => run('/api/chazan/order', 'PUT', { addAll: true }, 'Added everyone')}>Add everyone from the list ({view.roster.length})</button>}
          {!view.roster.length && <p style={small}>The Bochurim list is empty. Add names there first.</p>}
        </div>
      )}

      {cards.map((d) => <DayCard key={d.date} day={d} today={today} name={name} hebrew={settings.hebrewLabels} canEdit={canEdit && !busy} isAwayOn={(id, date) => isAway(view, id, date)} inLine={(id) => inLine.has(id)} onSwap={(date, tefila) => setSwap({ date, tefila })} onUndoSwap={undoSwap} />)}

      <div style={card} data-testid="chazan-order">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h3 style={{ ...h3, margin: 0 }}>Rotation order ({view.order.length})</h3>
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {notIn.length > 0 && view.order.length > 0 && <button style={{ ...buttonSecondary, minHeight: '44px' }} disabled={busy} onClick={() => run('/api/chazan/order', 'PUT', { addAll: true }, `Added ${notIn.length}`)}>Add everyone ({notIn.length})</button>}
              <button style={{ ...buttonPrimary, minHeight: '44px' }} onClick={() => setAdding(true)}>+ Add</button>
            </div>
          )}
        </div>
        <div style={{ ...small, marginTop: '4px' }}>The one marked <b>Next</b> leads the next davening. Use the arrows to change the order.</div>
        <div style={{ marginTop: '8px' }}>
          {view.order.map((id, i) => {
            const range = awayRange(view, id, today);
            const awayNow = isAway(view, id, today);
            const lim = view.can[id];
            return (
              <div key={id} style={{ padding: '10px 0', borderTop: `1px solid ${colors.line}` }} data-testid="chazan-person">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '140px', fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, color: colors.text }}>
                    {name(id)}
                    {pos[id] === 0 && <span style={{ ...chip, marginLeft: '8px', color: colors.accent, borderColor: colors.accent }}>Next</span>}
                    {pos[id] > 0 && <span style={{ ...small, marginLeft: '8px', fontWeight: 500 }}>in {pos[id]}</span>}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={{ ...buttonSecondary, minHeight: '44px', minWidth: '44px' }} onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move ${name(id)} up`}>↑</button>
                      <button style={{ ...buttonSecondary, minHeight: '44px', minWidth: '44px' }} onClick={() => move(i, 1)} disabled={busy || i === view.order.length - 1} aria-label={`Move ${name(id)} down`}>↓</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                  {range && <span style={{ ...chip, color: awayNow ? colors.danger : colors.dim }}>{awayNow ? 'Away' : 'Away later'}: {prettyDate(range.from)}{range.to ? ` – ${prettyDate(range.to)}` : ' – until back'}</span>}
                  {lim && <span style={chip}>Only {lim.join(' / ')}</span>}
                  {canEdit && (
                    <>
                      {awayNow || range ? <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={() => run('/api/chazan/away', 'PUT', { personId: id, back: true }, `${name(id)} is back`)}>Back</button> : null}
                      <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={() => setAway(id)}>Away…</button>
                      <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={() => setCan(id)}>Can lead…</button>
                      {pos[id] !== 0 && <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={() => saveOrder(view.order, id, `${name(id)} is next`)}>Make next</button>}
                      <button style={{ ...buttonSecondary, minHeight: '44px', color: colors.danger }} onClick={() => saveOrder(view.order.filter((x) => x !== id), null, `Removed ${name(id)} from the rotation`, view.order)}>Remove</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Collapsible title="Next 14 days" summary="Who leads what, day by day" id="chazan-forecast">
        <Forecast days={upcoming.slice(0, 14)} today={today} name={name} hebrew={settings.hebrewLabels} />
      </Collapsible>
      <div style={{ height: '12px' }} />
      <Collapsible title="Settings" summary={settingsSummary(settings)} id="chazan-settings">
        <ChazanSettings settings={settings} canEdit={canEdit} onChange={saveSettings} />
      </Collapsible>

      {swap && <SwapSheet target={swap} name={name} roster={view.roster} order={view.order} onPick={doSwap} onClose={() => setSwap(null)} />}
      {away && <AwaySheet person={away} name={name(away)} today={today} onClose={() => setAway(null)}
        onSave={async (from, to) => { const id = away; setAway(null); await run('/api/chazan/away', 'PUT', { personId: id, from, to }, `${name(id)} marked away`); }} />}
      {can && <CanSheet person={can} name={name(can)} current={view.can[can]} onClose={() => setCan(null)}
        onSave={async (list) => { const id = can; setCan(null); await run('/api/chazan/can', 'PUT', { personId: id, tefilos: list }, 'Saved'); }} />}
      {adding && <AddSheet candidates={notIn} name={name} onClose={() => setAdding(false)}
        onAdd={async (ids) => { setAdding(false); await run('/api/chazan/order', 'PUT', { order: [...view.order, ...ids] }, `Added ${ids.length}`); }} />}
    </div>
  );
}
