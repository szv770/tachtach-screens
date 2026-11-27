import React, { useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { opsApi } from '../api/ops.js';
import { notify } from '../hooks/useAdminState.js';
import { ConfirmDialog } from './ui.jsx';
import { durationLabel, ago } from '../../shared/health.js';

/**
 * Home: is the TV really painting, and two ways to fix it without SSH.
 *  - "Reload the page": the TV's page starts over (works while its JavaScript still runs).
 *  - "Restart the screen": the TV's browser restarts (works even when the page is frozen; needs the one-time update on the box).
 * `st` is /api/screen/status: alive (painting?), watchdog (what the server did by itself), restart (is the button set up).
 * Both need screen.control; the parent only renders this for people who have it.
 */
export default function ScreenRestartCard({ st, onDone }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = st?.alive;
  const dog = st?.watchdog;
  const frozen = alive?.status === 'frozen';

  const run = async (level, okText) => {
    setBusy(true);
    try {
      const r = await opsApi.restartScreen(level);
      notify(r?.message || okText, 'success');
      setTimeout(() => onDone?.(), 8000);
    } catch (e) { notify(e.message, 'error'); }
    setBusy(false);
  };

  let headline = 'The screen looks fine';
  let detail = alive?.aliveAt ? `The TV reported a fresh picture ${ago(Date.now() - Date.parse(alive.aliveAt))}.` : 'It checks in every 20 seconds.';
  let tone = colors.success;
  if (!st?.online) { headline = 'No screen is connected'; detail = 'Check the TV and the screen box are on. Restarting needs a connected screen.'; tone = colors.danger; }
  else if (dog?.needsPerson) { headline = 'The screen keeps freezing'; detail = `It restarted itself ${dog.restartsLastHour} times in the last hour and stopped. Someone needs to look at it.`; tone = colors.danger; }
  else if (frozen) { headline = 'The TV looks frozen'; detail = alive.reason === 'not-painting' ? `Its picture stopped ${alive.frameAgeMs != null ? `${durationLabel(alive.frameAgeMs)} ago` : 'a while ago'}. It will restart itself, or you can do it now.` : 'Its page stopped answering. It will restart itself, or you can do it now.'; tone = colors.warn; }
  else if (alive?.status === 'unknown') { headline = 'The screen is starting up'; detail = 'Waiting for its first check-in.'; tone = colors.dim; }

  const btn = { minHeight: '48px', padding: '8px 16px', borderRadius: 'var(--r-md)', border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 };
  return (
    <section data-testid="screen-restart" data-frozen={frozen ? 'true' : 'false'} style={{ border: `1px solid ${frozen || dog?.needsPerson ? tone : colors.line}`, background: colors.card, borderRadius: 'var(--r-lg)', padding: '14px 16px', boxShadow: 'var(--e1)', fontFamily: adminFonts.englishBody }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <span aria-hidden style={{ flex: '0 0 auto', width: 10, height: 10, borderRadius: '50%', background: tone, marginTop: '6px' }} />
        <div style={{ minWidth: 0 }}>
          <div data-testid="screen-restart-headline" style={{ fontSize: '15px', fontWeight: 800, color: colors.text }}>{headline}</div>
          <div style={{ fontSize: '13px', color: colors.dim, marginTop: '2px', lineHeight: 1.45 }}>{detail}</div>
          {dog?.lastAction && <div style={{ fontSize: '12px', color: colors.dim, marginTop: '4px' }}>{dog.lastAction.what} · {ago(Date.now() - Date.parse(dog.lastAction.at))}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button type="button" disabled={busy || !st?.online} data-testid="reload-page" style={btn} onClick={() => run('page', 'The page is reloading.')}>Reload the TV page</button>
        <button type="button" disabled={busy} data-testid="restart-screen" style={btn} onClick={() => setConfirm(true)}>Restart the screen</button>
      </div>
      {st && st.restart && !st.restart.installed && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: colors.dim, lineHeight: 1.45 }}>“Restart the screen” needs a one-time update of the screen box (bash ~/tachtach-screens/deploy/update.sh). “Reload the TV page” works now.</p>
      )}
      {confirm && (
        <ConfirmDialog title="Restart the screen?" danger={false} confirmLabel="Restart it"
          message="The TV goes blank for about 30 seconds while its browser restarts. Messages and the schedule are not touched."
          onConfirm={() => { setConfirm(false); run('screen', 'Restarting the screen.'); }} onCancel={() => setConfirm(false)} />
      )}
    </section>
  );
}
