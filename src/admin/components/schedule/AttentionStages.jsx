/**
 * "Attention stages" for one block or one category: what the screen does before, at and
 * during a seder/davening/class. Closed by default, with a plain-English summary.
 * Data shape + rules: src/shared/scheduleStages.js (admin + data model only - the kiosk
 * renders the later stages in a separate track).
 *
 *   mode 'entry'    : before = this block's own alert (alertBefore + countdownDisplay),
 *                     the other two stages "same as its category" unless set here.
 *   mode 'category' : before = the category's default alert (defaultAlert, used when
 *                     pasting), the other two are defaults for every block of the category.
 */
import React from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { resolveStages, stagesSummary, DEFAULT_JUST_STARTED } from '../../../shared/scheduleStages.js';

const LEAD_OPTIONS = [0, 1, 2, 5, 10, 15];
const STARTED_OPTIONS = [1, 2, 3, 5, 10, 15];

const label = { fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 700, color: colors.text };
const help = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.45, margin: '2px 0 8px' };
const select = { ...inputStyle, fontFamily: adminFonts.englishBody, minHeight: '44px', fontSize: '15px' };

function Stage({ n, title, children, hint }) {
  return (
    <div style={{ padding: '12px 0', borderTop: n > 1 ? `1px solid ${colors.line}` : 'none' }}>
      <div style={label}><span style={{ color: colors.muted, marginRight: '6px' }}>{n}.</span>{title}</div>
      {hint && <p style={help}>{hint}</p>}
      {children}
    </div>
  );
}

/**
 * @param {object}   props
 * @param {'entry'|'category'} props.mode
 * @param {object}   props.stages         the stored { justStarted?, inSession? } (may be undefined)
 * @param {(next: object|undefined) => void} props.onStages
 * @param {number}   props.lead           alertBefore (entry) / defaultAlert (category)
 * @param {(n: number) => void} props.onLead
 * @param {'slide'|'takeover'} [props.leadDisplay]  entry only
 * @param {(d: string) => void} [props.onLeadDisplay]
 * @param {object}   [props.category]     the block's category (entry mode: for "same as category" text)
 * @param {object}   [props.entry]        the block (summary)
 */
export default function AttentionStages({
  mode = 'entry', stages, onStages, lead = 0, onLead, leadDisplay = 'slide', onLeadDisplay, category, entry, disabled = false, id,
}) {
  const isEntry = mode === 'entry';
  const st = stages || {};
  const resolved = isEntry
    ? resolveStages({ ...(entry || {}), alertBefore: lead, countdownDisplay: leadDisplay, stages }, category)
    : resolveStages({ alertBefore: lead, stages }, null);
  const summary = stagesSummary(resolved);

  const set = (key, value) => {
    const next = { ...st };
    if (value === undefined) delete next[key]; else next[key] = value;
    onStages(Object.keys(next).length ? next : undefined);
  };
  const inherit = (what) => (isEntry && category ? `Same as ${category.name}${what ? ` (${what})` : ''}` : 'Automatic');
  const startedVal = st.justStarted === undefined ? '' : String(st.justStarted);
  const sessionVal = st.inSession === undefined ? 'auto' : st.inSession ? 'on' : 'off';
  const catStarted = category?.stages?.justStarted;
  const catSession = category?.stages?.inSession;
  const startedInherit = catStarted !== undefined ? (catStarted > 0 ? `${catStarted} min` : 'off') : (lead > 0 ? `${DEFAULT_JUST_STARTED} min` : 'off');
  const sessionInherit = catSession === undefined ? 'off' : catSession ? 'on' : 'off';

  return (
    <Collapsible id={id} title="Attention stages" summary={summary} icon="bolt" style={{ boxShadow: 'none' }}>
      <Stage n={1} title="Before it starts - get moving" hint={isEntry
        ? 'A countdown on the screen ("Get moving - Seder in 7:42") this many minutes before the start time.'
        : 'Default countdown for pasted blocks of this category. Each block can still choose its own.'}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label="Countdown before start" disabled={disabled} value={lead || 0} onChange={(e) => onLead(Number(e.target.value))} style={{ ...select, flex: '1 1 160px', width: 'auto' }}>
            {LEAD_OPTIONS.map((n) => <option key={n} value={n}>{n === 0 ? 'No countdown' : `${n} min before`}</option>)}
            {lead > 0 && !LEAD_OPTIONS.includes(lead) && <option value={lead}>{lead} min before</option>}
          </select>
          {isEntry && lead > 0 && (
            <SegmentedControl ariaLabel="How the countdown shows" value={leadDisplay} onChange={onLeadDisplay}
              options={[{ value: 'slide', label: 'In the slides' }, { value: 'takeover', label: 'Full screen' }]} />
          )}
        </div>
      </Stage>
      <Stage n={2} title="Just started" hint={`A short message right after the start time ("Seder just started").`}>
        <select aria-label="Just started message" disabled={disabled} value={startedVal}
          onChange={(e) => set('justStarted', e.target.value === '' ? undefined : Number(e.target.value))} style={select}>
          <option value="">{inherit(startedInherit)}</option>
          <option value="0">Off</option>
          {STARTED_OPTIONS.map((n) => <option key={n} value={n}>Show for {n} min</option>)}
        </select>
      </Stage>
      <Stage n={3} title="In session" hint='A badge from the start until the end time ("Now in session: Night Seder"). Needs an end time on the block.'>
        <SegmentedControl ariaLabel="In-session badge" fill value={sessionVal}
          onChange={(v) => set('inSession', v === 'auto' ? undefined : v === 'on')}
          options={[{ value: 'auto', label: `Default (${sessionInherit})` }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </Stage>
    </Collapsible>
  );
}
