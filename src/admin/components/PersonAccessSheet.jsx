/**
 * Team -> a person's access sheet: pick a preset (Full editor / Messages only /
 * View only), then optionally "Fine-tune" single abilities. What is saved is the
 * preset plus how the person differs from it (overrides). Rules + labels live in
 * src/shared/permissions.js; the server enforces them (enforceRole).
 * Mounted only while open, so closing the sheet drops any unsaved edits.
 */
import React from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { ToggleSwitch } from './ui.jsx';
import Sheet from './ui/Sheet.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import Collapsible from './ui/Collapsible.jsx';
import SaveBar from './ui/SaveBar.jsx';
import useDirtyForm from './ui/useDirtyForm.js';
import { CAPABILITIES, PRESETS, ASSIGNABLE_PRESETS, DEFAULT_PRESET, effectiveCaps, presetCaps, sanitizeOverrides } from '../../shared/permissions.js';

const PRESET_OPTIONS = ASSIGNABLE_PRESETS.map((id) => ({ value: id, label: PRESETS[id].label }));
const groups = CAPABILITIES.reduce((acc, c) => { (acc[c.group] ||= []).push(c); return acc; }, {});
const p = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.5, margin: 0 };

/** Turn one ability on or off, expressed as a change from the preset. */
export function toggleCap(preset, overrides, cap, on) {
  const base = presetCaps(preset).includes(cap);
  const grant = new Set(overrides.grant);
  const deny = new Set(overrides.deny);
  grant.delete(cap); deny.delete(cap);
  if (on && !base) grant.add(cap);
  if (!on && base) deny.add(cap);
  return sanitizeOverrides(preset, { grant: [...grant], deny: [...deny] });
}

export default function PersonAccessSheet({ person, onClose, onSaved }) {
  const isAdmin = person.role === 'admin';
  const form = useDirtyForm(
    { preset: person.preset && ASSIGNABLE_PRESETS.includes(person.preset) ? person.preset : DEFAULT_PRESET, overrides: sanitizeOverrides(person.preset, person.overrides) },
    {
      label: `${person.name}'s access`,
      onSave: async (v) => {
        await apiFetch(`/api/team/${person.id}`, { method: 'PATCH', body: JSON.stringify({ preset: v.preset, overrides: v.overrides }) });
        notify(`${person.name}'s access was updated. It applies straight away.`);
        onSaved();
        return true;
      },
    },
  );
  const { preset, overrides } = form.values;
  const caps = effectiveCaps({ role: 'editor', preset, overrides });
  const nChanges = overrides.grant.length + overrides.deny.length;
  const summary = nChanges ? `${nChanges} change${nChanges === 1 ? '' : 's'} from ${PRESETS[preset].label}` : `Just what ${PRESETS[preset].label} gives`;

  const pick = (id) => { form.set('preset', id); form.set('overrides', { grant: [], deny: [] }); };

  return (
    <>
      <Sheet open onClose={onClose} title={person.name} zIndex={840} label={`Access for ${person.name}`}>
        <p style={{ ...p, marginTop: '-6px' }}>@{person.username}</p>
        {isAdmin ? (
          <div style={{ marginTop: '14px' }}>
            <p style={{ ...p, color: colors.text, fontWeight: 700 }}>Admin — everything</p>
            <p style={{ ...p, marginTop: '6px' }}>Admins can do everything, including Settings, Style and the team, so there is nothing to limit. To limit this person, first make them an Editor (Manage, then Rename / change role).</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px', marginTop: '14px', paddingBottom: form.dirty ? '96px' : 0 }}>
            <div>
              <div style={{ ...p, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>What can {person.name.split(/\s+/)[0]} do?</div>
              <SegmentedControl fill ariaLabel="Access level" value={preset} onChange={pick} options={PRESET_OPTIONS} />
              <p style={{ ...p, marginTop: '8px' }}>{PRESETS[preset].blurb}</p>
            </div>
            <Collapsible id="team-finetune" title="Fine-tune" summary={summary} edited={nChanges > 0}>
              <p style={{ ...p, margin: '10px 0 4px' }}>Switch single abilities on or off. A gold dot marks where this person differs from {PRESETS[preset].label}.</p>
              {Object.entries(groups).map(([group, list]) => (
                <div key={group} style={{ marginTop: '10px' }}>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: colors.muted }}>{group}</div>
                  {list.map((c) => {
                    const on = caps.includes(c.id);
                    const differs = overrides.grant.includes(c.id) || overrides.deny.includes(c.id);
                    return (
                      <div key={c.id} data-testid={`cap-${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', padding: '6px 0', borderTop: `1px solid ${colors.line}` }}>
                        <div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody }}>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {c.label}
                            {differs && <span title="Different from the preset" aria-label="Different from the preset" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flex: 'none' }} />}
                          </div>
                          <div style={{ fontSize: '13px', color: colors.dim }}>{c.adminOnly ? 'Admins only' : c.hint}</div>
                        </div>
                        {c.adminOnly
                          ? <span style={{ fontSize: '12px', fontWeight: 700, color: colors.muted, whiteSpace: 'nowrap' }}>Off</span>
                          : <ToggleSwitch on={on} label={`${c.label}: ${on ? 'on' : 'off'}`} onChange={() => form.set('overrides', toggleCap(preset, overrides, c.id, !on))} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </Collapsible>
            <p style={{ ...p, fontSize: '13px' }}>Changes apply straight away; {person.name.split(/\s+/)[0]} does not need to sign in again. Tabs they cannot use are hidden for them.</p>
          </div>
        )}
      </Sheet>
      {!isAdmin && <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />}
    </>
  );
}
