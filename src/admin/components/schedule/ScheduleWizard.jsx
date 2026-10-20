/**
 * "Build my year schedule": a guided, one-question-per-screen wizard that makes the BASE (weekly)
 * schedule. Full screen on a phone, a centred card on a wide screen.
 *   1 Days    which days have the same day (Sun-Thu / Friday / Shabbos / your own groups)
 *   2 Blocks  quick rows per group (category chips, clock times, "next block starts when this ends")
 *   3 Review  a timeline per group with warnings (overlaps, gaps, missing times)
 *   4 Save    name it and save it as the active weekly schedule (auto-backup of the old one)
 * Or "paste from Claude/AI instead" (reuses ScheduleImport in weekly mode).
 * Pure logic (conversion, checks) lives in src/shared/scheduleWizard.js; the data tables
 * (day groups, quick block chips) in src/shared/scheduleWizardPresets.js.
 */
import { missingEndTime } from '../../../shared/scheduleStages.js';
import React, { useState, useMemo, useEffect } from 'react';
import { colors, adminFonts, alpha } from '../../styles/admin-tokens.js';
import Icon from '../ui/Icon.jsx';
import { ConfirmDialog } from '../ui.jsx';
import ScheduleImport from './ScheduleImport.jsx';
import { TimeField, scheduleApi } from './scheduleShared.jsx';
import { Field, textInput, primaryBtn, secondaryBtn, subtleBtn, chip, Dot, DayChips, CategoryChips } from './scheduleFields.jsx';
import { DAY_PATTERN_PRESETS, BLOCK_PRESETS } from '../../../shared/scheduleWizardPresets.js';
import {
  makeBlock, makePattern, patternsFromEntries, cloneBlocks, nextStartAfter, wizardToEntries, checkPatterns,
  hasBlockingIssues, daysLabel, categoryFor, isUsableBlock,
} from '../../../shared/scheduleWizard.js';
import { minutesOf } from '../../../shared/scheduleResolution.js';
import { formatTime12 } from '../../../shared/schedulePaste.js';
import GroupTimesEditor from './GroupTimesEditor.jsx';
import { groupChip, groupIssues, splitSummary } from '../../../shared/scheduleGroupsEdit.js';
import { toISODate } from '../../../shared/scheduleResolution.js';

const STEPS_BASE = ['Days', 'Blocks', 'Review', 'Save'];
const STEPS_GROUPS = ['Days', 'Blocks', 'Groups', 'Review', 'Save'];
const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);
const sortedBlocks = (blocks) => [...blocks].sort((a, b) => (minutesOf(a.time) ?? 9999) - (minutesOf(b.time) ?? 9999));

function initialPatterns(entries) {
  if (entries?.length) return patternsFromEntries(entries);
  return DAY_PATTERN_PRESETS.filter((p) => p.on).map((p) => makePattern({ label: p.label, days: p.days }));
}

// ── Step 1 ────────────────────────────────────────────────────────────────

function DaysStep({ patterns, setPatterns }) {
  const presetOn = (pr) => patterns.some((p) => sameDays(p.days, pr.days));
  const togglePreset = (pr) => {
    if (presetOn(pr)) setPatterns(patterns.filter((p) => !sameDays(p.days, pr.days)));
    else setPatterns([...patterns, makePattern({ label: pr.label, days: pr.days })]);
  };
  const customs = patterns.filter((p) => !DAY_PATTERN_PRESETS.some((pr) => sameDays(p.days, pr.days)));
  const usedBy = (d) => patterns.filter((p) => p.days.includes(d)).length;
  const overlap = [0, 1, 2, 3, 4, 5, 6].some((d) => usedBy(d) > 1);
  return (
    <div>
      <p style={lead}>Which days have the <b>same</b> day? Tick each group that has its own timetable. You will fill in the day once per group, not once per day.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {DAY_PATTERN_PRESETS.map((pr) => (
          <button key={pr.id} type="button" role="checkbox" aria-checked={presetOn(pr)} data-testid={`pattern-${pr.id}`} onClick={() => togglePreset(pr)}
            style={{ ...card(presetOn(pr)), textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '64px' }}>
            <span aria-hidden="true" style={tick(presetOn(pr))}>{presetOn(pr) && <Icon name="check" size={16} stroke={3} />}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '16px', color: colors.text }}>{pr.label}</span>
              <span style={{ display: 'block', fontSize: '13px', color: colors.dim }}>{pr.hint}</span>
            </span>
          </button>
        ))}
        {customs.map((p) => (
          <div key={p.id} style={card(true)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <input aria-label="Group name" value={p.label} maxLength={40} placeholder="Name, e.g. Sundays in summer"
                onChange={(e) => setPatterns(patterns.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)))} style={{ ...textInput, flex: 1, minWidth: 0 }} />
              <button type="button" aria-label="Remove this group" onClick={() => setPatterns(patterns.filter((x) => x.id !== p.id))} style={iconBtn}><Icon name="close" size={18} /></button>
            </div>
            <DayChips days={p.days} onChange={(days) => setPatterns(patterns.map((x) => (x.id === p.id ? { ...x, days } : x)))} />
          </div>
        ))}
        <button type="button" data-testid="add-group" onClick={() => setPatterns([...patterns, makePattern({ label: '', days: [] })])}
          style={{ ...subtleBtn, color: colors.gold, borderStyle: 'dashed', minHeight: '52px' }}>+ Another group of days (e.g. Mon + Wed only)</button>
      </div>
      {overlap && <p role="alert" style={{ ...note, color: colors.warn }}>A day is in two groups, so both would show on it. That is allowed, but is usually a mistake.</p>}
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────

function BlockRow({ block, categories, onChange, onRemove, onAddNext, onCreateCategory, issues, index }) {
  const [catOpen, setCatOpen] = useState(false);
  const [heOpen, setHeOpen] = useState(!!block.nameHe);
  const cat = categories.find((c) => c.id === block.category);
  const bad = issues.length > 0;
  return (
    <div data-testid="block-row" style={{ ...card(false), borderColor: bad ? colors.warn : colors.line, padding: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <input aria-label={`Block ${index + 1} name`} value={block.name} maxLength={200} placeholder="Name, e.g. Shacharis"
          onChange={(e) => onChange({ name: e.target.value })} style={{ ...textInput, flex: 1, minWidth: 0 }} />
        <button type="button" aria-label={`Remove block ${index + 1}`} onClick={onRemove} style={iconBtn}><Icon name="close" size={18} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div><span style={mini}>Starts</span><TimeField value={block.time} onCommit={(t) => onChange({ time: t })} ariaLabel={`Block ${index + 1} start`} style={{ minHeight: '44px', fontSize: '16px' }} /></div>
        <div><span style={mini}>Ends (optional)</span><TimeField value={block.endTime} onCommit={(t) => onChange({ endTime: t })} allowEmpty placeholder="optional" ariaLabel={`Block ${index + 1} end`} style={{ minHeight: '44px', fontSize: '16px' }} /></div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
        <button type="button" aria-expanded={catOpen} onClick={() => setCatOpen((o) => !o)} style={chip(!!cat, cat?.color)}>
          <Dot color={cat?.color} /> {cat ? cat.name : 'Category'} <span aria-hidden="true" style={{ fontSize: '10px' }}>{catOpen ? '▴' : '▾'}</span>
        </button>
        {!heOpen && <button type="button" onClick={() => setHeOpen(true)} style={{ ...chip(false), color: colors.dim }}>+ Hebrew name</button>}
        {(block.endTime || block.time) && (
          <button type="button" data-testid="add-next" onClick={onAddNext} style={{ ...chip(false), color: colors.gold }}>+ Next block at {formatTime12(nextStartAfter(block))}</button>
        )}
      </div>
      {catOpen && <div style={{ marginTop: '8px' }}><CategoryChips value={block.category} categories={categories} onCreate={onCreateCategory} onChange={(id) => { onChange({ category: id }); setCatOpen(false); }} /></div>}
      {heOpen && <input aria-label={`Block ${index + 1} Hebrew name`} dir="rtl" value={block.nameHe} maxLength={200} placeholder="Hebrew name (optional)"
        onChange={(e) => onChange({ nameHe: e.target.value })} style={{ ...textInput, fontFamily: adminFonts.hebrewPrimary, marginTop: '8px' }} />}
      {missingEndTime(block) && <div data-testid="no-end-chip" style={{ ...note, color: colors.warn, margin: '8px 0 0' }}>No end time yet. Add one so the screen can show "now in session" and the week reads clearly.</div>}
      {issues.map((i, k) => <div key={k} role="alert" style={{ ...note, color: colors.warn, margin: '8px 0 0' }}>{i.message}</div>)}
    </div>
  );
}

function BlocksStep({ patterns, setPatterns, categories, onCreateCategory, sel, setSel, checked }) {
  const p = patterns[sel] || patterns[0];
  if (!p) return <p style={lead}>Go back and tick at least one group of days.</p>;
  const update = (blocks) => setPatterns(patterns.map((x) => (x.id === p.id ? { ...x, blocks } : x)));
  const patch = (id, ch) => update(p.blocks.map((b) => (b.id === id ? { ...b, ...ch } : b)));
  const last = p.blocks[p.blocks.length - 1];
  const addPreset = (pr) => {
    const cat = categoryFor(categories, pr.category);
    update([...p.blocks, makeBlock({ name: pr.name, nameHe: pr.nameHe, category: cat ? cat.id : '', time: nextStartAfter(last) })]);
  };
  const addNext = (b) => {
    const i = p.blocks.findIndex((x) => x.id === b.id);
    const nb = makeBlock({ time: nextStartAfter(b), category: b.category });
    update([...p.blocks.slice(0, i + 1), nb, ...p.blocks.slice(i + 1)]);
  };
  const others = patterns.filter((x) => x.id !== p.id && x.blocks.length);
  const issuesFor = (id) => (checked.find((c) => c.pattern.id === p.id)?.issues || []).filter((i) => i.blockId === id && ['missing-time', 'missing-name', 'bad-range'].includes(i.type));
  const label = (x) => x.label || daysLabel(x.days);
  return (
    <div>
      {patterns.length > 1 && (
        <div role="tablist" aria-label="Group of days" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
          {patterns.map((x, i) => (
            <button key={x.id} type="button" role="tab" aria-selected={x === p} data-testid={`blocks-tab-${i}`} onClick={() => setSel(i)} style={{ ...chip(x === p), flex: '0 0 auto' }}>
              {label(x)} <span style={{ color: colors.muted, fontWeight: 600 }}>{x.blocks.filter(isUsableBlock).length}</span>
            </button>
          ))}
        </div>
      )}
      <p style={{ ...lead, marginBottom: '10px' }}>What happens on <b>{label(p)}</b>{p.days.length ? ` (${daysLabel(p.days)})` : ''}? Tap a quick block, or add your own. Times are clock times, like 7:30 AM.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }} aria-label="Quick blocks">
        {BLOCK_PRESETS.map((pr) => {
          const cat = categoryFor(categories, pr.category);
          return <button key={pr.key} type="button" data-testid={`quick-${pr.key}`} onClick={() => addPreset(pr)} style={chip(false, cat?.color)}><Dot color={cat?.color} /> + {pr.name}</button>;
        })}
        <button type="button" data-testid="quick-blank" onClick={() => update([...p.blocks, makeBlock({ time: nextStartAfter(last) })])} style={{ ...chip(false), color: colors.gold, borderStyle: 'dashed' }}>+ Blank block</button>
      </div>
      {!p.blocks.length && others.length > 0 && (
        <div style={{ ...card(false), marginBottom: '12px' }}>
          <span style={{ ...mini, marginBottom: '8px' }}>Same as another day? Start from a copy</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {others.map((o) => <button key={o.id} type="button" data-testid="copy-from" onClick={() => update(cloneBlocks(o.blocks))} style={chip(false)}>Copy from {label(o)}</button>)}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {p.blocks.map((b, i) => (
          <BlockRow key={b.id} index={i} block={b} categories={categories} issues={issuesFor(b.id)}
            onChange={(ch) => patch(b.id, ch)} onRemove={() => update(p.blocks.filter((x) => x.id !== b.id))}
            onAddNext={() => addNext(b)} onCreateCategory={onCreateCategory} />
        ))}
        {!p.blocks.length && <div style={{ fontSize: '14px', color: colors.muted, padding: '8px 2px' }}>No blocks yet.</div>}
      </div>
    </div>
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────────

function ReviewStep({ checked, categories, goFix }) {
  const total = checked.reduce((n, c) => n + c.pattern.blocks.filter(isUsableBlock).length, 0);
  return (
    <div data-testid="wizard-review">
      <p style={lead}>Here is your week. Check it over: <b>{total}</b> block{total === 1 ? '' : 's'} in {checked.length} group{checked.length === 1 ? '' : 's'}.</p>
      {checked.map(({ pattern, issues }, pi) => (
        <section key={pattern.id} style={{ ...card(false), marginBottom: '12px' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '19px', fontWeight: 600, marginBottom: '2px' }}>{pattern.label || daysLabel(pattern.days)}</div>
          <div style={{ fontSize: '13px', color: colors.dim, marginBottom: '10px' }}>{daysLabel(pattern.days)}</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortedBlocks(pattern.blocks.filter(isUsableBlock)).map((b) => {
              const cat = categories.find((c) => c.id === b.category);
              return (
                <li key={b.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', borderLeft: `4px solid ${cat?.color || colors.muted}`, background: alpha(cat?.color || colors.muted, 10), borderRadius: 'var(--r-xs)', padding: '8px 10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: colors.dim, minWidth: '86px', flexShrink: 0 }}>{formatTime12(b.time)}{b.endTime ? ` - ${formatTime12(b.endTime)}` : ''}</span>
                  <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{b.name || b.nameHe}</span>
                </li>
              );
            })}
          </ol>
          {issues.map((i, k) => (
            <div key={k} role="alert" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px', fontSize: '13px', color: ['missing-time', 'missing-name', 'bad-range'].includes(i.type) ? colors.danger : colors.warn, lineHeight: 1.4 }}>
              <span aria-hidden="true">⚠</span><span>{i.message}</span>
            </div>
          ))}
          {issues.length > 0 && <button type="button" onClick={() => goFix(pi)} style={{ ...subtleBtn, marginTop: '10px' }}>Fix in the Blocks step</button>}
        </section>
      ))}
      <p style={note}>Warnings about overlaps and long gaps will not stop you from saving. Missing names or times will, because those blocks cannot show on the screen.</p>
    </div>
  );
}

// ── Groups step (only when the screen has groups) ────────────────────────

function GroupsStep({ patterns, setPatterns, groups }) {
  const [open, setOpen] = useState(null);
  const label = (x) => x.label || daysLabel(x.days);
  const patchBlock = (pid, bid, ch) => setPatterns(patterns.map((p) => (p.id !== pid ? p : { ...p, blocks: p.blocks.map((b) => (b.id !== bid ? b : { ...b, extra: { ...(b.extra || {}), ...ch } })) })));
  const asEntry = (b) => ({ time: b.time, endTime: b.endTime, groupTimes: b.extra?.groupTimes || {}, groups: b.extra?.groups || [] });
  return (
    <div data-testid="wizard-groups">
      <p style={lead}><b>Does everyone share these times?</b> Most blocks are the same for every group ({groups.map((g) => g.name).join(', ')}). Open only the few that differ, like night seder, dorm attendance or lights out, and give the group its own time.</p>
      {patterns.map((p) => {
        const blocks = sortedBlocks(p.blocks.filter(isUsableBlock));
        if (!blocks.length) return null;
        return (
          <section key={p.id} style={{ ...card(false), marginBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>{label(p)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {blocks.map((b) => {
                const e = asEntry(b);
                const chipText = groupChip(e, groups);
                const key = `${p.id}:${b.id}`;
                const isOpen = open === key;
                return (
                  <div key={b.id} data-testid="wizard-group-block" style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: colors.dim, minWidth: '86px' }}>{formatTime12(b.time)}{b.endTime ? ` - ${formatTime12(b.endTime)}` : ''}</span>
                      <span style={{ flex: '1 1 120px', fontWeight: 600, overflowWrap: 'anywhere' }}>{b.name || b.nameHe}</span>
                      {chipText && <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 8px', borderRadius: 'var(--r-pill)', border: `1px solid ${colors.gold}` }}>{chipText}</span>}
                      <button type="button" aria-expanded={isOpen} data-testid="wizard-group-toggle" onClick={() => setOpen(isOpen ? null : key)} style={{ ...chip(isOpen || !!chipText) }}>{chipText ? 'Edit group times' : 'Different for groups'}</button>
                    </div>
                    {chipText && !isOpen && splitSummary(e, groups, formatTime12) && <div style={{ fontSize: '12px', color: colors.dim, marginTop: '4px' }}>{splitSummary(e, groups, formatTime12)}</div>}
                    {isOpen && (
                      <div style={{ marginTop: '10px' }}>
                        <GroupTimesEditor defaultOn compact groups={groups} value={e} issues={groupIssues(e, groups)} onChange={(patch) => patchBlock(p.id, b.id, patch)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Step 4 ────────────────────────────────────────────────────────────────

function SaveStep({ name, setName, keepTemplate, setKeepTemplate, existing, count, error }) {
  return (
    <div>
      <p style={lead}>Last step. This becomes your <b>base schedule</b>: it repeats every week, all year. A date you change under "Change one day" still wins over it.</p>
      <Field label="Name for this schedule" hint="Just for you, so you can find it later under Saved schedules.">
        <input aria-label="Schedule name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={textInput} />
      </Field>
      <label style={{ display: 'flex', gap: '12px', alignItems: 'center', minHeight: '44px', fontSize: '15px', cursor: 'pointer' }}>
        <input type="checkbox" checked={keepTemplate} onChange={(e) => setKeepTemplate(e.target.checked)} style={{ width: 22, height: 22 }} />
        Also keep a copy under Saved schedules
      </label>
      <div style={{ ...card(false), marginTop: '14px', fontSize: '14px', lineHeight: 1.5, color: colors.dim }}>
        {count} block{count === 1 ? '' : 's'} will be saved.{' '}
        {existing > 0 ? `Your current weekly schedule (${existing} item${existing === 1 ? '' : 's'}) is saved automatically as an "Auto-backup" first, so you can switch back.` : 'You have no weekly schedule yet.'}
      </div>
      {error && <div role="alert" style={{ ...note, color: colors.danger }}>{error}</div>}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────

export default function ScheduleWizard({
  entries, categories, scheduleDates, settings, onClose, onSaved, onSaveTemplate, onCreateCategory, notify, copy, groups = [],
}) {
  const STEPS = groups.length ? STEPS_GROUPS : STEPS_BASE;
  const LAST = STEPS.length - 1;
  const [patterns, setPatterns] = useState(() => initialPatterns(entries));
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(0);
  const [name, setName] = useState('Regular year schedule');
  const [keepTemplate, setKeepTemplate] = useState(true);
  const [mode, setMode] = useState('wizard'); // 'wizard' | 'paste'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [wide, setWide] = useState(typeof window !== 'undefined' && window.innerWidth >= 900);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 900);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const checked = useMemo(() => checkPatterns(patterns), [patterns]);
  const newEntries = useMemo(() => wizardToEntries(patterns, categories), [patterns, categories]);
  const blocking = hasBlockingIssues(checked);
  const touched = patterns.some((p) => p.blocks.length);

  const stepKey = STEPS[step];
  const groupBlocking = groups.length > 0 && newEntries.some((e) => groupIssues(e, groups).some((i) => i.type === 'bad-time' || i.type === 'bad-range'));
  const canNext = {
    Days: patterns.length > 0 && patterns.every((p) => p.days.length > 0),
    Blocks: true,
    Groups: !groupBlocking,
    Review: !blocking && newEntries.length > 0,
    Save: false,
  }[stepKey];
  const nextHint = {
    Days: patterns.length === 0 ? 'Tick at least one group of days.' : 'Every group needs at least one day.',
    Groups: 'A group time is missing a start or ends before it starts.',
    Review: newEntries.length === 0 ? 'Add at least one block with a name and a start time.' : 'Fix the red items first.',
  }[stepKey] || '';

  const requestClose = () => (touched && step < LAST && mode === 'wizard' ? setConfirmClose(true) : onClose());

  const save = async () => {
    setSaving(true); setError('');
    try {
      const r = await scheduleApi.weeklySave(newEntries);
      if (keepTemplate && name.trim()) await onSaveTemplate?.(name.trim(), r.schedule.entries, r.schedule.categories);
      notify?.(`Saved ${r.count} block${r.count === 1 ? '' : 's'} as your weekly schedule.${r.backupName ? ` The old one is saved as "${r.backupName}".` : ''}`, 'success');
      onSaved?.(r);
    } catch (e) {
      setError(e?.message || 'Could not save. Nothing was changed.');
    } finally { setSaving(false); }
  };

  const body = mode === 'paste' ? (
    <div>
      <p style={lead}>Paste the weekly schedule you got from Claude or another AI. Use "Copy Claude prompt" to get the right wording first.</p>
      <ScheduleImport mode="weekly" schedule={{ entries, categories }} scheduleDates={scheduleDates} selectedDate={toISODate(new Date())} settings={settings}
        onApplied={() => {}} onWeeklyApplied={(r) => onSaved?.(r)} onEditDate={() => {}} notify={notify} copy={copy} isMobile={!wide} />
    </div>
  ) : {
    Days: <DaysStep key="d" patterns={patterns} setPatterns={setPatterns} />,
    Blocks: <BlocksStep key="b" patterns={patterns} setPatterns={setPatterns} categories={categories} onCreateCategory={onCreateCategory} sel={sel} setSel={setSel} checked={checked} />,
    Groups: <GroupsStep key="g" patterns={patterns} setPatterns={setPatterns} groups={groups} />,
    Review: <ReviewStep key="r" checked={checked} categories={categories} goFix={(i) => { setSel(i); setStep(1); }} />,
    Save: <SaveStep key="s" name={name} setName={setName} keepTemplate={keepTemplate} setKeepTemplate={setKeepTemplate} existing={entries.length} count={newEntries.length} error={error} />,
  }[stepKey];

  return (
    <div role="dialog" aria-modal="true" aria-label="Build my year schedule" data-testid="schedule-wizard"
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: wide ? colors.scrim : colors.bg, display: 'flex', alignItems: wide ? 'center' : 'stretch', justifyContent: 'center' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: '100%', maxWidth: wide ? 760 : undefined, height: wide ? 'min(860px, 92vh)' : '100%',
        background: colors.bg, borderRadius: wide ? 'var(--r-xl)' : 0, boxShadow: wide ? 'var(--e3)' : 'none', overflow: 'hidden', fontFamily: adminFonts.englishBody, color: colors.text,
      }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px 10px 16px', borderBottom: `1px solid ${colors.line}`, minHeight: '64px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '21px', fontWeight: 600, margin: 0, lineHeight: 1.15 }}>Build my year schedule</h2>
            {mode === 'wizard' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }} aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
                {STEPS.map((s, i) => (
                  <span key={s} aria-hidden="true" title={s} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i <= step ? colors.gold : colors.line, transition: 'width var(--t-base) var(--ease)' }} />
                ))}
                <span style={{ fontSize: '12px', color: colors.dim, marginLeft: '6px' }}>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
              </div>
            ) : <div style={{ fontSize: '12px', color: colors.dim, marginTop: '4px' }}>Paste from Claude / AI</div>}
          </div>
          <button type="button" aria-label="Close" data-testid="wizard-close" onClick={requestClose} style={{ ...iconBtn, background: colors.sunken, borderRadius: '50%' }}><Icon name="close" size={18} /></button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch' }}>{body}</div>

        <footer style={{ borderTop: `1px solid ${colors.line}`, padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', background: colors.card }}>
          {mode === 'paste' ? (
            <button type="button" onClick={() => setMode('wizard')} style={secondaryBtn}>Back to the step-by-step builder</button>
          ) : (
            <>
              {!canNext && nextHint && step < LAST && <div style={{ fontSize: '12px', color: colors.dim, marginBottom: '6px' }}>{nextHint}</div>}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {step > 0 ? <button type="button" data-testid="wizard-back" onClick={() => setStep(step - 1)} style={secondaryBtn}>Back</button>
                  : <button type="button" data-testid="wizard-paste" onClick={() => setMode('paste')} style={{ ...subtleBtn, border: 'none', color: colors.gold }}>Paste from Claude / AI instead</button>}
                <span style={{ flex: 1 }} />
                {step < LAST
                  ? <button type="button" data-testid="wizard-next" disabled={!canNext} onClick={() => { setSel(0); setStep(step + 1); }} style={{ ...primaryBtn, opacity: canNext ? 1 : 0.5 }}>Next</button>
                  : <button type="button" data-testid="wizard-save" disabled={saving || !newEntries.length} onClick={save} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save as my weekly schedule'}</button>}
              </div>
            </>
          )}
        </footer>
      </div>
      {confirmClose && (
        <ConfirmDialog title="Leave without saving?" message="What you typed in this builder will be lost. Your current schedule is not changed." confirmLabel="Leave"
          onConfirm={() => { setConfirmClose(false); onClose(); }} onCancel={() => setConfirmClose(false)} />
      )}
    </div>
  );
}

const lead = { fontSize: '15px', lineHeight: 1.55, color: colors.text, margin: '0 0 14px' };
const note = { fontSize: '13px', lineHeight: 1.5, color: colors.dim, margin: '12px 0 0' };
const mini = { display: 'block', fontSize: '12px', fontWeight: 700, color: colors.dim, marginBottom: '4px' };
const card = (on) => ({ background: colors.card, border: `1.5px solid ${on ? colors.gold : colors.line}`, borderRadius: 'var(--r-md)', padding: '14px', boxShadow: 'var(--e1)', color: colors.text, fontFamily: adminFonts.englishBody });
const tick = (on) => ({ width: 26, height: 26, borderRadius: 8, border: `2px solid ${on ? colors.gold : colors.border}`, background: on ? colors.gold : 'transparent', color: colors.accentInk, display: 'grid', placeItems: 'center', flexShrink: 0 });
const iconBtn = { width: 44, height: 44, minWidth: 44, border: 'none', background: 'transparent', color: colors.dim, cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: '50%', flexShrink: 0 };
