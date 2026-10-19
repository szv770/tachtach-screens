import React, { useCallback, useEffect, useState } from 'react';
import { colors, adminFonts, buttonSecondary } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { ToggleSwitch } from '../ui.jsx';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { can } from '../../../shared/permissions.js';
import { KL_END_RULES } from '../../../shared/kiddushLevana.js';

const fmt = (ms, tz, o) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(ms);
const when = (ms, tz) => fmt(ms, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const PHASE = { none: 'Not this week', upcoming: 'Opens soon', open: 'Open now (nights)', 'last-night': 'Last night' };

/**
 * The automatic Kiddush Levana announcement (Announce > Posts). It is computed from the Hebrew
 * calendar and the screen's location; people can only switch it on/off and pick the rules.
 * Needs announcements.edit to change anything.
 */
export default function KiddushLevanaCard({ caps = [] }) {
  const editable = can(caps, 'announcements.edit');
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setInfo(await apiFetch('/api/kiddush-levana')); setErr(''); } catch (e) { setErr(e.message || 'Could not load.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(patch) {
    try { setInfo(await apiFetch('/api/kiddush-levana/settings', { method: 'PUT', body: JSON.stringify(patch) })); notify?.('Saved'); }
    catch (e) { setErr(e.message || 'Could not save.'); }
  }
  const s = info?.settings;
  const tz = info?.timezone;
  const opt = (cur, v, l, key) => (
    <button key={v} type="button" aria-pressed={cur === v} disabled={!editable}
      onClick={() => save({ [key]: v })}
      style={{ ...buttonSecondary, minHeight: '44px', padding: '6px 14px', borderColor: cur === v ? colors.gold : colors.border, color: cur === v ? colors.gold : colors.text, background: cur === v ? colors.goldBg : 'transparent' }}>{l}</button>
  );
  const row = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' };
  const lab = { width: '120px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim };
  const line = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text, margin: '2px 0' };
  const summary = !s ? 'Loading…' : !s.enabled ? 'Off' : `${PHASE[info.phase]} · can start ${when(info.start, tz)}`;
  return (
    <Collapsible id="announce-kiddush-levana" title="Kiddush Levana (automatic)" summary={summary} style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
        <div style={{ ...line, color: colors.dim }}>
          Worked out by itself from the Hebrew calendar and this screen's location. On the nights it can be said it shows a
          banner, all day a note beside the clock, and a one-time message when it opens and on the last night.
        </div>
        {err && <div role="alert" style={{ ...line, color: colors.danger }}>{err}</div>}
        {s && (
          <>
            <div style={row}>
              <span style={lab}>Show it</span>
              <ToggleSwitch on={s.enabled} label="Show Kiddush Levana automatically" onChange={() => editable && save({ enabled: !s.enabled })} />
              <span style={{ ...line, color: colors.dim }}>{s.enabled ? 'On' : 'Off'}</span>
            </div>
            <div style={row}>
              <span style={lab}>Starts</span>
              {opt(s.startAfterDays, 7, '7 days after the molad', 'startAfterDays')}
              {opt(s.startAfterDays, 3, '3 days after', 'startAfterDays')}
            </div>
            <div style={row}>
              <span style={lab}>Ends</span>
              {KL_END_RULES.map((r) => opt(s.endRule, r.id, r.id === 'halfway' ? 'Halfway point (Chabad)' : '15 days after', 'endRule'))}
            </div>
            <div style={row}>
              <span style={lab}>Customs</span>
              {opt(s.skipCustoms, true, 'Skip Tisha B’Av / Rosh Hashana–Yom Kippur nights', 'skipCustoms')}
              {opt(s.skipCustoms, false, 'Don’t skip', 'skipCustoms')}
            </div>
            {info.start && (
              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '10px' }}>
                <div style={line}><strong>This month:</strong> molad {when(info.molad, tz)} (Jerusalem mean time, shown on your clock)</div>
                <div style={line}>Can start {when(info.start, tz)}</div>
                <div style={line}>Last night {fmt(info.lastNight.start, tz, { weekday: 'long', month: 'short', day: 'numeric' })} · cutoff {when(info.end, tz)}</div>
                {info.motzeiShabbos && <div style={line}>Motzei Shabbos in the window: {fmt(info.motzeiShabbos.start, tz, { month: 'short', day: 'numeric' })}</div>}
                {(info.notes || []).map((n) => <div key={n.date} style={{ ...line, color: colors.dim }}>{n.date}: {n.en}{n.skipped ? ' (skipped)' : ''}</div>)}
                {info.approx && <div style={{ ...line, color: colors.dim }}>Nightfall is estimated until this screen's location and zmanim have loaded.</div>}
                <div style={{ ...line, color: colors.dim, marginTop: '6px' }}>Please confirm the exact Chabad cutoff with your rav.</div>
              </div>
            )}
          </>
        )}
      </div>
    </Collapsible>
  );
}
