import React, { useEffect, useState } from 'react';
import { Field, Hint } from '../look/kit.jsx';
import { LIMITS } from '../../../shared/occasions.js';
import { btn, card, h3, small, Select, TextIn, colors } from './occKit.jsx';

/**
 * 'Live moment': fire something on the TV right now (not stored). `fire(body)` -> { moment } or throws; `stop()`.
 * `choices` = [{ value: '<id>|<startISO>', label }] for the one the last-10-seconds belongs to.
 */
export default function MomentCard({ fire, stop, choices, canEdit, notify }) {
  const [text, setText] = useState({ en: '', he: '' });
  const [key, setKey] = useState('');
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { if (!active) return undefined; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [active]);
  useEffect(() => { if (active && active.until <= Date.now()) setActive(null); });
  const go = async (body, doneMsg) => {
    setBusy(true);
    try { const r = await fire(body); setActive(r.moment); notify(doneMsg, 'success'); } catch (e) { notify(e.message || 'Could not do that', 'error'); } finally { setBusy(false); }
  };
  const left = active ? Math.max(0, Math.ceil((active.until - Date.now()) / 1000)) : 0;
  const k = key || choices[0]?.value || '';
  return (
    <div style={card} data-testid="occ-moment">
      <h3 style={h3}>Live moment</h3>
      <p style={{ ...small, margin: '0 0 10px' }}>Put something on the TV right now. It clears itself, nothing is saved.</p>
      <div style={{ display: 'grid', gap: '10px' }}>
        <button type="button" disabled={!canEdit || busy} style={btn(true, { minHeight: '52px' })} onClick={() => go({ kind: 'burst', ...(k ? { occasionKey: k } : {}) }, 'Confetti on the TV')} data-testid="occ-moment-burst">Confetti burst</button>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '8px' }}>
            <TextIn value={text.en} onChange={(v) => setText({ ...text, en: v })} ariaLabel="Shout-out in English" max={LIMITS.momentText} placeholder="Mazel tov, Class 5!" />
            <TextIn value={text.he} onChange={(v) => setText({ ...text, he: v })} ariaLabel="Shout-out in Hebrew" dir="rtl" max={LIMITS.momentText} placeholder="מזל טוב!" />
          </div>
          <button type="button" disabled={!canEdit || busy || (!text.en.trim() && !text.he.trim())} style={btn(true, { minHeight: '52px' })} onClick={() => go({ kind: 'shoutout', text: { en: text.en.trim(), he: text.he.trim() } }, 'Shout-out on the TV')} data-testid="occ-moment-shoutout">Shout-out</button>
        </div>
        <div>
          {choices.length > 1 && <Field label="For which countdown" style={{ marginTop: 0 }}><Select ariaLabel="Occasion for the last ten seconds" value={k} onChange={setKey} options={choices} /></Field>}
          <button type="button" disabled={!canEdit || busy || !choices.length} style={btn(true, { minHeight: '52px', width: '100%', marginTop: choices.length > 1 ? 8 : 0 })} onClick={() => go({ kind: 'ten', occasionKey: k }, 'Last 10 seconds on the TV')} data-testid="occ-moment-ten">Last 10 seconds</button>
        </div>
        <button type="button" disabled={!canEdit || !active} style={btn(false, { minHeight: '52px', color: colors.danger })} onClick={async () => { try { await stop(); setActive(null); notify('Stopped', 'success'); } catch (e) { notify(e.message || 'Could not stop', 'error'); } }} data-testid="occ-moment-stop">Stop{active ? ` (${left}s left)` : ''}</button>
      </div>
      <Hint>Shout-outs: {LIMITS.momentText} characters at most, no student names please.</Hint>
    </div>
  );
}
