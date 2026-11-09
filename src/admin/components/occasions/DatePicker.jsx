import React, { useMemo, useState } from 'react';
import { Field, Hint, Choices, fieldStyle } from '../look/kit.jsx';
import { NumberField } from '../ui.jsx';
import { btn, small, label, Group, colors, adminFonts } from './occKit.jsx';
import { MONTH_EN, MONTH_HE, RANGES, SHABBOS_LABEL, SHABBOS_MOVES } from '../../../shared/occasions.js';
import { gematria } from '../../../shared/hebrewCalendar.js';
import { parseDateText } from '../../../shared/occasionDateText.js';
import { datePreview, typedPatch, parsedWords, hebrewRuleFromISO, inDaysText, daysFrom } from './occDates.js';

/**
 * The date of an occasion, made easy (phone first, 44 px targets):
 *   what kind (Hebrew date / Rosh Chodesh / regular calendar) · 'Type it' (understands '19 Kislev', 'Yud Tes Kislev', 'י״ט כסלו',
 *   'Nov 29') · a month chip grid · a day grid with Hebrew numerals · the leap-year and Shabbos choices · how often and how many days ·
 *   a LIVE preview: the Hebrew date, the next day it falls on, the evening the countdown reaches zero, and the next three years ·
 *   'From a regular date': pick a day on a calendar and repeat it on its Hebrew date every year.
 */

const HEB_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]; // Tishrei .. Elul, the Hebrew year
const GREG = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, en: new Date(Date.UTC(2000, i, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) }));

const chip = (on, extra = {}) => ({
  minHeight: '44px', minWidth: 0, padding: '2px 4px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15,
  background: on ? colors.accentSoft : colors.card, color: on ? colors.accent : colors.text, border: `1.5px solid ${on ? colors.accent : colors.border}`, ...extra,
});

function MonthChips({ kind, month, onPick }) {
  if (kind === 'gregorian') {
    return (
      <div role="group" aria-label="Month" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
        {GREG.map((m) => <button key={m.value} type="button" aria-pressed={month === m.value} data-testid={`occ-month-${m.value}`} onClick={() => onPick(m.value)} style={chip(month === m.value)}><span style={{ fontSize: '15px', fontWeight: 700 }}>{m.en}</span></button>)}
      </div>
    );
  }
  const list = kind === 'roshChodesh' ? [0, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6] : HEB_ORDER;
  const sel = kind === 'hebrew' && month === 13 ? 12 : month;
  return (
    <div role="group" aria-label="Month" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
      {list.map((m) => (
        <button key={m} type="button" aria-pressed={sel === m} aria-label={m === 0 ? 'Every month' : MONTH_EN[m]} data-testid={`occ-month-${m}`} onClick={() => onPick(m)} style={chip(sel === m)}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{m === 0 ? 'Every month' : MONTH_EN[m]}</span>
          {m !== 0 && <span dir="rtl" style={{ fontSize: '12px', fontWeight: 500, opacity: 0.85 }}>{MONTH_HE[m]}</span>}
        </button>
      ))}
    </div>
  );
}

function DayGrid({ kind, day, onPick }) {
  const n = kind === 'gregorian' ? 31 : 30;
  return (
    <div role="group" aria-label="Day" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '6px' }}>
      {Array.from({ length: n }, (_, i) => i + 1).map((v) => (
        <button key={v} type="button" aria-pressed={day === v} aria-label={kind === 'gregorian' ? `Day ${v}` : `Day ${v}, ${gematria(v)}`} data-testid={`occ-day-${v}`} onClick={() => onPick(v)} style={chip(day === v)}>
          <span style={{ fontSize: '16px', fontWeight: 700 }}>{v}</span>
          {kind !== 'gregorian' && <span dir="rtl" style={{ fontSize: '12px', fontWeight: 500, opacity: 0.85 }}>{gematria(v)}</span>}
        </button>
      ))}
    </div>
  );
}

/** 'From a regular date': a calendar date -> its Hebrew date -> repeat it every year. */
function FromRegular({ today, apply }) {
  const [iso, setIso] = useState('');
  const r = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? hebrewRuleFromISO(iso) : null), [iso]);
  return (
    <Group title="From a regular date" summary="Pick a day on the calendar and we find its Hebrew date" testId="occ-from-regular">
      <span style={label}>The regular date</span>
      <input type="date" aria-label="Pick a regular date" value={iso} min="2000-01-01" max="2200-12-31" onChange={(e) => setIso(e.target.value)} style={{ ...fieldStyle, maxWidth: '200px' }} data-testid="occ-regular-date" />
      {r && (
        <>
          <p style={{ ...small, color: colors.text, margin: '10px 0 0' }} data-testid="occ-regular-words">
            That day is <strong>{r.words.en}</strong> <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary }}>({r.words.he})</span>. {iso >= today ? `It is ${inDaysText(daysFrom(today, iso))}.` : 'That day has passed.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button type="button" style={btn(true)} onClick={() => apply({ rule: r.rule, adar: r.adar, repeat: 'yearly', year: '' })} data-testid="occ-repeat-hebrew">Repeat every year on this Hebrew date</button>
            <button type="button" style={btn(false)} onClick={() => apply({ rule: { kind: 'gregorian', month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) }, repeat: 'once', year: Number(iso.slice(0, 4)) })} data-testid="occ-once-regular">Only on this day, once</button>
          </div>
          <Hint>The Hebrew date moves around the regular calendar from year to year; this keeps the Hebrew date, so the day stays right (in a leap year it can be a month later).</Hint>
        </>
      )}
    </Group>
  );
}

export default function DatePicker({ d, set, setRule, settings, ctxNow, today }) {
  const kind = d.rule.kind;
  const [typed, setTyped] = useState('');
  const parsed = useMemo(() => (typed.trim() ? parseDateText(typed, { todayISO: today }) : null), [typed, today]);
  const preview = useMemo(() => datePreview(d, settings, ctxNow), [d.rule.kind, d.rule.month, d.rule.day, d.adar, d.missing30, d.shabbos, d.repeat, d.year, d.days, d.beginsAt, d.time, d.timeDay, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const month = Number(d.rule.month); const day = Number(d.rule.day);
  const onType = (v) => { setTyped(v); const p = v.trim() ? parseDateText(v, { todayISO: today }) : null; if (p) set(typedPatch(d, p)); };
  const next = preview?.next;
  const row = next?.row;
  const eveBefore = row && row.begin.evening && row.begin.dateISO !== row.startISO;

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <Field label="What kind of date" style={{ marginTop: 0 }}>
        <Choices ariaLabel="Kind of date" value={kind} onChange={(v) => { setTyped(''); setRule(v === 'roshChodesh' ? { kind: v, month: 9 } : v === 'gregorian' ? { kind: v, month: 1, day: 1 } : { kind: v, month: 9, day: 19 }); }}
          options={[{ value: 'hebrew', label: 'Hebrew date' }, { value: 'roshChodesh', label: 'Rosh Chodesh' }, { value: 'gregorian', label: 'Regular calendar' }]} />
      </Field>

      <div>
        <span style={label}>Type it</span>
        <input value={typed} onChange={(e) => onType(e.target.value)} aria-label="Type the date" placeholder="19 Kislev, Yud Tes Kislev, י״ט כסלו, Nov 29" maxLength={80} style={{ ...fieldStyle, width: '100%' }} data-testid="occ-type-date" autoComplete="off" />
        {typed.trim() && (
          <p style={{ ...small, margin: '4px 0 0', color: parsed ? colors.success : colors.dim }} data-testid="occ-typed-state">
            {parsed ? `Understood: ${parsedWords(parsed)}. Check it below.` : 'Not understood yet. Try: 19 Kislev, Rosh Chodesh Teves, or Nov 29.'}
          </p>
        )}
      </div>

      <div>
        <span style={label}>{kind === 'gregorian' ? 'Month' : 'Hebrew month'}</span>
        <MonthChips kind={kind} month={month} onPick={(m) => { setTyped(''); setRule({ month: m }); }} />
      </div>
      {kind !== 'roshChodesh' && (
        <div>
          <span style={label}>{kind === 'gregorian' ? 'Day of the month' : 'Day of the Hebrew month'}</span>
          <DayGrid kind={kind} day={day} onPick={(v) => { setTyped(''); setRule({ day: v }); }} />
        </div>
      )}
      {kind === 'roshChodesh' && month === 13 && <Hint style={{ margin: 0 }}>Adar II only exists in a leap year; in other years there is no Rosh Chodesh Adar II.</Hint>}

      {kind === 'hebrew' && (month === 12 || month === 13) && (
        <Field label="Only matters in a leap year (two Adars)" style={{ marginTop: 0 }}>
          <Choices ariaLabel="Adar in a leap year" value={d.adar} onChange={(v) => set({ adar: v })} options={[{ value: 'adar2', label: 'Adar II (like Purim)' }, { value: 'adar1', label: 'Adar I' }]} />
        </Field>
      )}
      {kind === 'hebrew' && day === 30 && (
        <Field label="Years when this month has only 29 days" style={{ marginTop: 0 }}>
          <Choices ariaLabel="When the 30th does not exist" value={d.missing30} onChange={(v) => set({ missing30: v })} options={[{ value: '29', label: 'Use the 29th' }, { value: 'first', label: 'Use the 1st of the next month' }]} />
        </Field>
      )}
      {kind === 'hebrew' && (
        <Field label="If the day falls on Shabbos" style={{ marginTop: 0 }} hint={d.shabbos === 'stay' ? 'Only the fasts move (Tisha B’Av, Tzom Gedalya, 17 Tammuz, Taanis Esther).' : ''}>
          <Choices ariaLabel="If the day falls on Shabbos" value={d.shabbos || 'stay'} onChange={(v) => set({ shabbos: v })} options={SHABBOS_MOVES.map((v) => ({ value: v, label: SHABBOS_LABEL[v] }))} />
        </Field>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <span style={label}>How many days it lasts</span>
          <NumberField value={Number(d.days) || 1} min={RANGES.days.min} max={RANGES.days.max} onCommit={(n) => set({ days: n })} ariaLabel="How many days" style={{ ...fieldStyle, maxWidth: '96px' }} />
        </div>
        {kind === 'roshChodesh' && <Hint style={{ margin: 0 }}>Rosh Chodesh is one or two days by itself.</Hint>}
      </div>
      <Field label="Repeats" style={{ marginTop: 0 }}>
        <Choices ariaLabel="Repeats" value={d.repeat} onChange={(v) => set({ repeat: v })} options={[{ value: 'yearly', label: 'Every year' }, { value: 'once', label: 'Only once' }]} />
      </Field>
      {d.repeat === 'once' && (
        <div>
          <span style={label}>{kind === 'gregorian' ? 'Year' : 'Hebrew year (for example 5787)'}</span>
          <input type="number" inputMode="numeric" value={d.year} onChange={(e) => set({ year: e.target.value })} aria-label="Year" style={{ ...fieldStyle, maxWidth: '160px' }} data-testid="occ-year" />
        </div>
      )}

      <div style={{ background: colors.sunken, borderRadius: 'var(--r-md)', padding: '12px', display: 'grid', gap: '6px' }} data-testid="occ-date-preview" aria-live="polite">
        {next ? (
          <>
            <p style={{ ...small, margin: 0, color: colors.text }} data-testid="occ-next">
              Hebrew: <strong>{preview.hebrew}</strong> · Next: <strong>{next.long}</strong> ({next.inText}){next.days > 1 ? ` · lasts ${next.days} days` : ''}{next.name ? ` · ${next.name}` : ''}
            </p>
            <p style={{ ...small, margin: 0, color: colors.text }} data-testid="occ-begins">
              The countdown reaches zero: <strong>{next.beginsText}</strong>{eveBefore ? ' (the evening before the day)' : ''}
            </p>
            {preview.after.length > 0 && (
              <p style={{ ...small, margin: 0 }} data-testid="occ-after">
                After that: {preview.after.map((a) => `${a.year} ${a.short}${a.name ? ` (${a.name})` : ''}`).join(' · ')}
              </p>
            )}
          </>
        ) : <p style={{ ...small, margin: 0 }} data-testid="occ-next-none">{preview ? 'No date from now on (a one-time date that has passed).' : 'Choose a month and a day to see the date.'}</p>}
      </div>

      <FromRegular today={today} apply={(patch) => { setTyped(''); set({ ...patch }); }} />
    </div>
  );
}
