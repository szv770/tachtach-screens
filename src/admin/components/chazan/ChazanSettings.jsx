import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { ToggleSwitch } from '../ui.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { TEFILOS, DAY_SHORT, GRID_PRESETS, FILL_RULES, FILL_RULE_INFO, matchPreset, applyPreset } from '../../../shared/chazan.js';
import { small } from './shared.js';

const sw = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontFamily: adminFonts.englishBody, color: colors.text, minHeight: '44px' };

export function settingsSummary(s) {
  const p = matchPreset(s);
  return `${p ? GRID_PRESETS[p].label : 'Custom days'} · ${s.names === 'short' ? 'first + initial' : 'full names'}`;
}

export default function ChazanSettings({ settings: s, canEdit, onChange }) {
  const preset = matchPreset(s);
  const toggleCell = (i, t) => canEdit && onChange({ grid: s.grid.map((r, k) => (k === i ? { ...r, [t]: !r[t] } : r)) });
  return (
    <div style={{ display: 'grid', gap: '18px', marginTop: '6px' }}>
      <div>
        <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>Which davenings have a chazan</div>
        <SegmentedControl ariaLabel="Presets" value={preset || 'custom'} onChange={(v) => canEdit && v !== 'custom' && onChange(applyPreset(s, v))}
          options={[...Object.entries(GRID_PRESETS).map(([value, p]) => ({ value, label: p.label })), ...(preset ? [] : [{ value: 'custom', label: 'Custom' }])]} />
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.text, minWidth: '100%' }} data-testid="chazan-grid">
            <thead><tr><th />{DAY_SHORT.map((d, i) => <th key={d} style={{ padding: '4px 2px', color: colors.dim, fontWeight: 700, opacity: i === 6 && !s.shabbos ? 0.45 : 1 }}>{d}</th>)}</tr></thead>
            <tbody>
              {TEFILOS.map((t) => (
                <tr key={t}>
                  <td style={{ paddingRight: '8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t}</td>
                  {DAY_SHORT.map((d, i) => (
                    <td key={d} style={{ textAlign: 'center' }}>
                      <button type="button" aria-pressed={!!s.grid[i][t]} aria-label={`${t} on ${d}`} onClick={() => toggleCell(i, t)} disabled={!canEdit}
                        style={{ width: '44px', height: '44px', borderRadius: '10px', border: `1px solid ${s.grid[i][t] ? colors.accent : colors.line}`, background: s.grid[i][t] ? colors.goldBg : 'transparent', color: colors.text, cursor: canEdit ? 'pointer' : 'default', opacity: i === 6 && !s.shabbos ? 0.45 : 1, fontWeight: 800 }}>
                        {s.grid[i][t] ? '✓' : ''}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <label style={sw}><span>Shabbos tefilos<span style={{ ...small, display: 'block' }}>Off: Shabbos never has a chazan from the list, whatever the Shabbos column says.</span></span>
        <ToggleSwitch on={s.shabbos} onChange={() => canEdit && onChange({ shabbos: !s.shabbos })} label="Shabbos tefilos" /></label>
      <label style={sw}><span>Rosh Chodesh days<span style={{ ...small, display: 'block' }}>Off: no chazan from the list on Rosh Chodesh.</span></span>
        <ToggleSwitch on={s.roshChodesh} onChange={() => canEdit && onChange({ roshChodesh: !s.roshChodesh })} label="Rosh Chodesh days" /></label>
      <label style={sw}><span>Yom Tov days<span style={{ ...small, display: 'block' }}>Off: no chazan from the list on Yom Tov. A day marked “No chazan” in Custom days is always skipped.</span></span>
        <ToggleSwitch on={s.yomTov} onChange={() => canEdit && onChange({ yomTov: !s.yomTov })} label="Yom Tov days" /></label>
      <div>
        <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>Names already on the screen stay put</div>
        <SegmentedControl ariaLabel="Protected days" value={s.lockDays} onChange={(v) => canEdit && onChange({ lockDays: v })}
          options={[{ value: 0, label: 'Off' }, ...[1, 2, 3, 5, 7].map((v) => ({ value: v, label: `${v} day${v === 1 ? '' : 's'}` }))]} />
        <div style={{ ...small, marginTop: '6px' }} data-testid="lock-explain">
          {s.lockDays > 0
            ? `Once a name has been on the screen for the next ${s.lockDays} day${s.lockDays === 1 ? '' : 's'}, it won’t move. If someone is away or you swap a davening in those days, only that one davening changes (the person furthest from his turn covers) and nobody else is moved.`
            : 'Off: any change (the order, away dates, a swap) can move the names on the screen right away.'}
        </div>
      </div>
      <div>
        <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>When someone is swapped out or away (days not on the screen yet)</div>
        <div style={{ ...small, marginBottom: '6px' }}>These choices only apply to days after the protected ones, where nobody has seen a name yet and shifting is harmless.</div>
        {FILL_RULES.map((r) => (
          <label key={r} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '8px 0', minHeight: '44px', cursor: canEdit ? 'pointer' : 'default' }}>
            <input type="radio" name="fill" checked={s.fill === r} onChange={() => canEdit && onChange({ fill: r })} style={{ width: 22, height: 22, marginTop: 2 }} />
            <span style={{ fontFamily: adminFonts.englishBody, color: colors.text, fontWeight: 650 }}>{FILL_RULE_INFO[r].label}{r === 'furthest' && <span style={{ ...small, fontWeight: 600 }}> (default)</span>}
              <span style={{ ...small, display: 'block', fontWeight: 400 }}>{FILL_RULE_INFO[r].hint}</span></span>
          </label>
        ))}
      </div>
      <div>
        <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>How names are shown</div>
        <SegmentedControl ariaLabel="Names" value={s.names} onChange={(v) => canEdit && onChange({ names: v })} options={[{ value: 'full', label: 'Full name' }, { value: 'short', label: 'First name + initial' }]} />
      </div>
      <label style={sw}><span>Hebrew labels (שחרית / מנחה / מעריב)<span style={{ ...small, display: 'block' }}>Beside the English on the slide and here.</span></span>
        <ToggleSwitch on={s.hebrewLabels} onChange={() => canEdit && onChange({ hebrewLabels: !s.hebrewLabels })} label="Hebrew labels" /></label>
      <label style={sw}><span>Show chazan names on the schedule<span style={{ ...small, display: 'block' }}>On the davening rows of the schedule (only when there is room).</span></span>
        <ToggleSwitch on={s.showOnSchedule} onChange={() => canEdit && onChange({ showOnSchedule: !s.showOnSchedule })} label="Names on the schedule" /></label>
      <label style={sw}><span>Side-rail card before each davening<span style={{ ...small, display: 'block' }}>“Mincha chazan: Moshe” starting {s.railMinutes} minutes before.</span></span>
        <ToggleSwitch on={s.rail} onChange={() => canEdit && onChange({ rail: !s.rail })} label="Side rail card" /></label>
      {s.rail && (
        <div>
          <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>Card appears</div>
          <SegmentedControl ariaLabel="Minutes before" value={s.railMinutes} onChange={(v) => canEdit && onChange({ railMinutes: v })} options={[15, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} min before` }))} />
        </div>
      )}
    </div>
  );
}
