import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Collapsible from './ui/Collapsible.jsx';
import Sheet from './ui/Sheet.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import { Page, Field, Hint, SwitchRow, Choices, fieldStyle, LinkButton } from './look/kit.jsx';
import { NumberField } from './ui.jsx';
import { useCopy } from './schedule/scheduleShared.jsx';
import { notify } from '../hooks/useAdminState.js';
import { MealSheet, ImportSheet, MealTypesEditor } from './menu/MenuSheets.jsx';
import {
  btn, iconBtn, card, h3, small, Chip, DishLine, labelOfDate, dayName, menuApi, undoTo,
} from './menu/menuKit.jsx';
import { DAYS, DAY_EN, DAY_EN_SHORT, TAGS } from '../../shared/menuCopy.js';
import {
  LIMITS, resolveDay, weeklySet, baseWeek, addDays, weekStartOf, dayCodeOf, cycleIndex, formatMenuText, isEmpty,
} from '../../shared/menu.js';

/**
 * Admin > Screen > Menu (spec docs/specs/05-MENU.md). Phone first: one column, 44 px targets, sheets with a sticky Save.
 *   On/Off + when it shows · Today (change today's menu, instant on the TV) · the week (this week / the usual week) ·
 *   Import (paste, cells, .xlsx/.csv, Claude prompt) · Settings (what shows, meals, rotation, tags, footer, copy as text).
 * Every change is one granular request (src/server/routes/menu.js) with an Undo in the toast.
 */

const WHEN = [['always', 'All the time'], ['meals', 'Around meal times'], ['hours', 'Set hours']];
const VIEWS = [['both', 'Today, then the week'], ['today', 'Today only'], ['week', 'The week only']];
const AFTER = [['tomorrow', 'Switch to tomorrow'], ['today', 'Keep showing today']];
const SHABBOS = [['ahead', 'Friday shows the Shabbos meals too'], ['own-day', 'Each on its own day'], ['hidden', 'Never show Shabbos meals']];
const SOURCE = { day: 'Changed for this date', week: 'Only this week', weekly: 'Usual week', cycle: 'Rotation week', none: 'Nothing planned' };

const lineBox = { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${colors.line}`, minWidth: 0 };

function usualMeals(file, set, day) {
  const w = weeklySet(file, set)[day] || {};
  return file.mealTypes.filter((mt) => mt.days.includes(day)).map((mt) => ({ type: mt.id, mt, items: w[mt.id]?.items || [], note: w[mt.id]?.note || '', changed: false }));
}

function MealCard({ m, canEdit, onEdit, children }) {
  return (
    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: '10px', minWidth: 0 }} data-testid={`menu-meal-${m.type}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text }}>{m.mt.en || m.mt.he}</strong>
        {m.mt.time && <span style={small}>{m.mt.time}</span>}
        {m.changed && <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: colors.editedSoft, color: colors.text }}>changed</span>}
        <span style={{ flex: 1 }} />
        {canEdit && <button type="button" aria-label={`Edit ${m.mt.en || m.mt.he}`} onClick={onEdit} style={iconBtn} data-testid={`menu-edit-${m.type}`}>✎</button>}
      </div>
      {m.items.length === 0 ? <p style={{ ...small, margin: '4px 0 0' }}>{canEdit ? 'Nothing yet. Tap the pencil to add dishes.' : 'Nothing yet.'}</p> : children}
      {m.note && <p style={{ ...small, margin: '6px 0 0', fontStyle: 'italic' }}>{m.note}</p>}
    </div>
  );
}

export default function MenuPanel({ canEdit = true, slides = [], onUpdateSlides, canEditSlides = false, onNavigate }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('dates'); // 'dates' = this week's dates, 'usual' = the usual week
  const [date, setDate] = useState(null);
  const [set, setSet] = useState(0);
  const [usualDay, setUsualDay] = useState('Sun');
  const [sheet, setSheet] = useState(null); // { ctx } meal sheet
  const [importOpen, setImportOpen] = useState(false);
  const [noMeals, setNoMeals] = useState(null); // { date, note }
  const [copyDay, setCopyDay] = useState(null); // { from, to }
  const { copy, modal } = useCopy(notify);

  const load = useCallback(async () => {
    try { const f = await menuApi('GET', ''); setFile(f); setError(''); setDate((d) => d || f.today); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = useCallback(async (method, path, body, msg) => {
    const prev = file;
    setBusy(true);
    try {
      const next = await menuApi(method, path, body);
      setFile(next);
      if (msg) notify(msg, 'success', prev ? { label: 'Undo', onClick: () => undoTo(prev, setFile) } : null);
      return true;
    } catch (e) { notify(e.message, 'error'); return false; } finally { setBusy(false); }
  }, [file]);

  const row = slides.find((s) => s.type === 'MENU');
  const today = file?.today;
  const todayR = useMemo(() => (file && today ? resolveDay(file, today, { keepEmpty: true }) : null), [file, today]);

  if (error) return <Page intro="The menu could not be loaded."><Hint style={{ color: colors.danger }}>{error}</Hint><button type="button" style={btn(false)} onClick={load}>Try again</button></Page>;
  if (!file || !todayR || !date) return <Page intro="Loading the menu..."><Hint>One moment.</Hint></Page>;

  const settings = file.settings;
  const cyc = settings.cycleWeeks > 1;
  const saveSettings = (patch, msg) => (canEdit ? change('PUT', '/settings', { settings: patch }, msg) : null);
  const empty = isEmpty(file);

  // ── editing one meal ──
  const openMeal = (m, dateISO, dayCode, from) => {
    if (!canEdit) return;
    const bw = dateISO ? baseWeek(file, dateISO) : null;
    setSheet({
      mode: from === 'usual' ? 'usual' : 'dates', from, date: dateISO, day: dayCode, mealId: m.type, mt: m.mt, items: m.items, note: m.note,
      source: bw?.source, set: from === 'usual' ? set : (bw?.set ?? 0), cycleWeeks: settings.cycleWeeks,
    });
  };
  const saveMeal = async ({ scope, items, note }) => {
    const c = sheet;
    let ok;
    if (c.from === 'today') ok = await change('POST', '/today', { op: 'editMeal', mealId: c.mealId, items, note }, `${c.mt.en || c.mt.he} changed for today`);
    else if (scope === 'day') ok = await change('PUT', '/meal', { scope: { kind: 'day', date: c.date }, mealId: c.mealId, meal: { items, note } }, `${c.mt.en || c.mt.he} changed for ${labelOfDate(c.date, { weekday: 'long', month: 'short', day: 'numeric' })}`);
    else ok = await change('PUT', '/meal', { scope: { kind: 'usual', set: c.set, day: c.day }, mealId: c.mealId, meal: { items, note } }, `${c.mt.en || c.mt.he} changed for every ${DAY_EN[c.day]}`);
    if (ok) setSheet(null);
  };

  const toggleSlide = () => onUpdateSlides?.(slides.map((s) => (s.type === 'MENU' ? { ...s, enabled: !s.enabled } : s)));

  // ── cards ──
  const onOff = (
    <div style={card} data-testid="menu-onoff">
      <h3 style={h3}>On the screen</h3>
      {row && canEditSlides
        ? <SwitchRow on={!!row.enabled} onChange={toggleSlide} label="Show the Menu on the screen" note="Off keeps your menu saved but the screen skips it. It also skips itself when there is no menu to show." testId="menu-slide-switch" />
        : <p style={small}>The Menu slide is {row ? (row.enabled ? 'on' : 'off') : 'not in the slide list yet'}. {canEditSlides ? '' : 'Someone who can change slides switches it on or off.'}</p>}
      <Field label="When it shows" hint={settings.showWhen === 'always' ? 'In the rotation whenever there is a menu.' : settings.showWhen === 'meals' ? `From ${settings.leadMin} minutes before each meal starts until it ends (the meal times are set under Meals).` : `Only between ${settings.hoursFrom} and ${settings.hoursTo}.`} style={{ marginTop: '4px' }}>
        <Choices ariaLabel="When the Menu shows" value={settings.showWhen} onChange={(v) => saveSettings({ showWhen: v }, `Menu shows: ${WHEN.find((w) => w[0] === v)[1].toLowerCase()}`)} options={WHEN.map(([value, label]) => ({ value, label }))} />
      </Field>
      {settings.showWhen === 'meals' && (
        <Field label="Minutes before a meal">
          <NumberField value={settings.leadMin} min={0} max={240} onCommit={(n) => saveSettings({ leadMin: n }, `Shows ${n} minutes before each meal`)} ariaLabel="Minutes before a meal" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
        </Field>
      )}
      {settings.showWhen === 'hours' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Field label="From"><input type="time" aria-label="Show from" value={settings.hoursFrom} disabled={!canEdit} onChange={(e) => e.target.value && saveSettings({ hoursFrom: e.target.value }, `Shows from ${e.target.value}`)} style={{ ...fieldStyle, maxWidth: '150px' }} /></Field>
          <Field label="Until"><input type="time" aria-label="Show until" value={settings.hoursTo} disabled={!canEdit} onChange={(e) => e.target.value && saveSettings({ hoursTo: e.target.value }, `Shows until ${e.target.value}`)} style={{ ...fieldStyle, maxWidth: '150px' }} /></Field>
        </div>
      )}
    </div>
  );

  const todayMeals = todayR.meals;
  const todayChanged = !!file.days[today];
  const swapOptions = (m) => todayMeals.filter((x) => x.type !== m.type);
  const todayCard = (
    <div style={card} data-testid="menu-today">
      <h3 style={h3}>Today · {labelOfDate(today)}</h3>
      <p style={{ ...small, margin: '0 0 4px' }}>What is on the screen now. A change here is for today only and shows on the TV at once.{todayChanged ? ' Today differs from the usual menu.' : ''}</p>
      {todayR.closed && (
        <div style={{ border: `1px solid ${colors.warn}`, background: colors.warnSoft, borderRadius: 'var(--r-sm)', padding: '10px', marginTop: '8px' }}>
          <strong style={{ color: colors.text, fontFamily: adminFonts.englishBody }}>No meals today{todayR.note ? `: ${todayR.note}` : ''}</strong>
          {canEdit && <div style={{ marginTop: '8px' }}><button type="button" style={btn(false)} disabled={busy} onClick={() => change('POST', '/today', { op: 'reopen' }, 'Meals are back on today')}>Serve meals today</button></div>}
        </div>
      )}
      {todayMeals.length === 0 && !todayR.closed && <p style={{ ...small, marginTop: '10px' }}>Nothing is planned for today. {canEdit ? 'Use Import below, or open the week and add dishes.' : ''}</p>}
      {todayMeals.map((m) => (
        <MealCard key={m.type} m={m} canEdit={canEdit} onEdit={() => openMeal(m, today, todayR.dow, 'today')}>
          <div>
            {m.items.map((it) => (
              <div key={it.id} style={lineBox}>
                <div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody, fontSize: '15px' }}><DishLine item={it} /></div>
                {canEdit && <button type="button" aria-label={`Hide ${it.en || it.he} today`} title="Hide this dish today" disabled={busy} onClick={() => change('POST', '/today', { op: 'hideDish', mealId: m.type, itemId: it.id }, `${it.en || it.he} hidden for today`)} style={iconBtn}>✕</button>}
              </div>
            ))}
          </div>
        </MealCard>
      ))}
      {canEdit && todayMeals.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          {todayMeals.map((m) => (
            <label key={m.type} style={{ ...small, display: 'grid', gap: '4px' }}>Swap {m.mt.en || m.mt.he} with
              <select value="" aria-label={`Swap ${m.mt.en || m.mt.he} with`} disabled={busy || swapOptions(m).length === 0} onChange={(e) => e.target.value && change('POST', '/today', { op: 'swap', a: m.type, b: e.target.value }, 'Meals swapped for today')} style={{ ...fieldStyle, minWidth: '140px' }}>
                <option value="">Choose...</option>
                {swapOptions(m).map((x) => <option key={x.type} value={x.type}>{x.mt.en || x.mt.he}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          {todayMeals.map((m) => <button key={m.type} type="button" style={btn(false)} disabled={busy} onClick={() => change('POST', '/today', { op: 'closeMeal', mealId: m.type }, `No ${m.mt.en || m.mt.he} today`)}>No {m.mt.en || m.mt.he} today</button>)}
          {!todayR.closed && <button type="button" style={btn(false)} onClick={() => setNoMeals({ date: today, note: '' })}>No meals today...</button>}
          {todayChanged && <button type="button" style={btn(false)} disabled={busy} onClick={() => change('POST', '/today', { op: 'reset' }, 'Today is back to the usual menu')}>Back to the usual menu</button>}
        </div>
      )}
    </div>
  );

  // ── the week ──
  const ws = weekStartOf(date);
  const weekDates = DAYS.map((_, i) => addDays(ws, i));
  const dayCode = dayCodeOf(date);
  const bw = baseWeek(file, date);
  const dateR = resolveDay(file, date, { keepEmpty: true });
  const weekMeals = mode === 'usual' ? usualMeals(file, set, usualDay) : dateR.meals;
  const sourceLabel = bw.source === 'week' ? 'Only this week' : cyc ? `Rotation week ${bw.set + 1} of ${settings.cycleWeeks}` : 'Usual week';
  const hasChange = (d) => !!file.days[d];

  const weekCard = (
    <div style={card} data-testid="menu-week">
      <h3 style={h3}>The week</h3>
      <SegmentedControl ariaLabel="Which menu" value={mode} onChange={setMode} options={[{ value: 'dates', label: 'This week' }, { value: 'usual', label: 'The usual week' }]} />
      {mode === 'dates' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button type="button" aria-label="Previous week" style={iconBtn} onClick={() => setDate(addDays(date, -7))}>‹</button>
            <strong style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text, flex: 1, textAlign: 'center', minWidth: '150px' }}>Week of {labelOfDate(ws, { month: 'short', day: 'numeric' })}</strong>
            <button type="button" aria-label="Next week" style={iconBtn} onClick={() => setDate(addDays(date, 7))}>›</button>
            {date !== today && <button type="button" style={btn(false)} onClick={() => setDate(today)}>Today</button>}
          </div>
          <p style={{ ...small, margin: '6px 0 0' }}>Showing: <strong>{sourceLabel}</strong>{bw.source === 'week' && canEdit && <> · <LinkButton onClick={() => change('DELETE', `/weeks/${ws}`, undefined, 'This week is back to the usual menu')}>Remove this week's own menu</LinkButton></>}</p>
          <div role="tablist" aria-label="Day" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
            {weekDates.map((d, i) => (
              <Chip key={d} on={d === date} label={`${DAY_EN[DAYS[i]]}${hasChange(d) ? ', changed' : ''}`} onClick={() => setDate(d)} style={{ padding: '0 12px', minWidth: '48px' }}>
                {DAY_EN_SHORT[DAYS[i]]}{d === today ? '*' : ''}{hasChange(d) ? ' •' : ''}
              </Chip>
            ))}
          </div>
          <p style={{ ...small, margin: '10px 0 0', fontWeight: 600 }}>{labelOfDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}{date === today ? ' (today)' : ''}{dateR.closed ? ` · No meals${dateR.note ? `: ${dateR.note}` : ''}` : ''}</p>
        </>
      ) : (
        <>
          {cyc && (
            <div role="group" aria-label="Rotation week" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
              {Array.from({ length: settings.cycleWeeks }, (_, i) => <Chip key={i} on={set === i} onClick={() => setSet(i)}>Week {i + 1}</Chip>)}
            </div>
          )}
          <div role="tablist" aria-label="Day" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
            {DAYS.map((d) => <Chip key={d} on={d === usualDay} label={DAY_EN[d]} onClick={() => setUsualDay(d)} style={{ padding: '0 12px', minWidth: '48px' }}>{DAY_EN_SHORT[d]}</Chip>)}
          </div>
          <p style={{ ...small, margin: '10px 0 0', fontWeight: 600 }}>Every {DAY_EN[usualDay]}{cyc ? `, rotation week ${set + 1}` : ''}</p>
        </>
      )}
      {weekMeals.length === 0 && <p style={{ ...small, marginTop: '10px' }}>No meal is served on this day (change the meals' days under Settings).</p>}
      {weekMeals.map((m) => (
        <MealCard key={m.type} m={m} canEdit={canEdit} onEdit={() => (mode === 'usual' ? openMeal(m, null, usualDay, 'usual') : openMeal(m, date, dayCode, 'dates'))}>
          <div>{m.items.map((it) => <div key={it.id} style={lineBox}><div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody, fontSize: '15px' }}><DishLine item={it} /></div></div>)}</div>
        </MealCard>
      ))}
      {canEdit && mode === 'dates' && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button type="button" style={btn(false)} onClick={() => setCopyDay({ from: date, to: addDays(date, 1) })}>Copy day to...</button>
          {!dateR.closed && <button type="button" style={btn(false)} onClick={() => setNoMeals({ date, note: '' })}>Mark no meals...</button>}
          {dateR.closed && <button type="button" style={btn(false)} disabled={busy} onClick={() => change('PUT', `/days/${date}`, { day: { ...file.days[date], closed: false, note: '', noteHe: '' } }, 'Meals are back on')}>Serve meals this day</button>}
          {hasChange(date) && <button type="button" style={btn(false)} disabled={busy} onClick={() => change('DELETE', `/days/${date}`, undefined, 'Back to the usual menu')}>Back to the usual menu</button>}
        </div>
      )}
    </div>
  );

  const importCard = (
    <div style={card}>
      <h3 style={h3}>Import the kitchen's menu</h3>
      <p style={{ ...small, margin: '0 0 10px' }}>Paste cells from a spreadsheet, pick an .xlsx or .csv, or turn a PDF or photo into text with Claude. You see what was found before anything is saved.</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {canEdit && <button type="button" style={btn(true)} onClick={() => setImportOpen(true)} data-testid="menu-import-open">Import...</button>}
        <button type="button" style={btn(false)} disabled={empty} onClick={() => copy(formatMenuText(file, { set }), 'Menu copied as text')}>Copy as text</button>
      </div>
      {empty && <Hint>Nothing to copy yet.</Hint>}
    </div>
  );

  const previewAt = (q) => window.open(`/screen?preview=true${q}`, '_blank', 'noopener');
  const nextFri = (() => { let d = today; for (let i = 0; i < 7 && dayCodeOf(d) !== 'Fri'; i++) d = addDays(d, 1); return d; })();

  const whatShows = (
    <Collapsible id="menu-what" title="What shows" icon="list" summary={`${VIEWS.find((v) => v[0] === settings.view)[1]} · ${AFTER.find((v) => v[0] === settings.afterLast)[1].toLowerCase()}`}>
      <Field label="View" hint="Today shows every dish of each meal, in big print, with the meal being served highlighted. The week is a grid with a few dishes per meal (so a long dish list is only complete in Today).">
        <Choices ariaLabel="View" value={settings.view} onChange={(v) => saveSettings({ view: v }, `View: ${VIEWS.find((x) => x[0] === v)[1]}`)} options={VIEWS.map(([value, label]) => ({ value, label }))} />
      </Field>
      <Field label="After the last meal of the day" hint="Today's menu is no use at night, so by default the screen shows tomorrow's after the last meal ends (set under Meals).">
        <Choices ariaLabel="After the last meal" value={settings.afterLast} onChange={(v) => saveSettings({ afterLast: v }, `After the last meal: ${AFTER.find((x) => x[0] === v)[1].toLowerCase()}`)} options={AFTER.map(([value, label]) => ({ value, label }))} />
      </Field>
      <Field label="Shabbos meals" hint="Friday night, Shabbos lunch and Seudah Shlishis are the meals marked 'A Shabbos meal' under Meals.">
        <Choices ariaLabel="Shabbos meals" value={settings.shabbosMeals} onChange={(v) => saveSettings({ shabbosMeals: v }, `Shabbos meals: ${SHABBOS.find((x) => x[0] === v)[1].toLowerCase()}`)} options={SHABBOS.map(([value, label]) => ({ value, label }))} />
      </Field>
      <Field label="Dishes per meal in the week grid" hint="More than this shows as '+2 more'. Default 3.">
        <NumberField value={settings.weekDishes} min={1} max={8} onCommit={(n) => saveSettings({ weekDishes: n }, `Week grid: ${n} dishes per meal`)} ariaLabel="Dishes per meal in the week grid" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
      </Field>
      <Field label="Tags the screen shows" hint="Tags help with allergies. They do not replace asking the kitchen. A tag is shown as a short code and a word, never colour alone.">
        <div role="group" aria-label="Tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {TAGS.map((t) => <Chip key={t.id} on={settings.tags.includes(t.id)} disabled={!canEdit} onClick={() => saveSettings({ tags: settings.tags.includes(t.id) ? settings.tags.filter((x) => x !== t.id) : [...settings.tags, t.id] }, `Tag ${t.en} ${settings.tags.includes(t.id) ? 'hidden' : 'shown'}`)}>{t.en}</Chip>)}
        </div>
      </Field>
      <Field label="Small line at the bottom (optional)" hint="For example 'Ask the kitchen about allergies'. Empty = none.">
        <input defaultValue={settings.disclaimer} key={`d${settings.disclaimer}`} maxLength={LIMITS.disclaimer} aria-label="Footer line in English" disabled={!canEdit} onBlur={(e) => e.target.value.trim() !== settings.disclaimer && saveSettings({ disclaimer: e.target.value }, 'Footer line saved')} style={{ ...fieldStyle, width: '100%' }} />
        <input defaultValue={settings.disclaimerHe} key={`h${settings.disclaimerHe}`} maxLength={LIMITS.disclaimer} dir="rtl" aria-label="Footer line in Hebrew" placeholder="בעברית (optional)" disabled={!canEdit} onBlur={(e) => e.target.value.trim() !== settings.disclaimerHe && saveSettings({ disclaimerHe: e.target.value }, 'Footer line saved')} style={{ ...fieldStyle, width: '100%', marginTop: '8px', fontFamily: adminFonts.hebrewPrimary }} />
      </Field>
    </Collapsible>
  );

  const rotation = (
    <Collapsible id="menu-rotation" title="Rotation" icon="clock" summary={cyc ? `${settings.cycleWeeks}-week rotation · this week is week ${cycleIndex(file, today) + 1}` : 'Same menu every week'}>
      <Field label="Weeks in the rotation" hint="1 = the same usual week every week. 2 to 4 = the kitchen repeats a cycle; you fill in each week under 'The usual week'. A week of its own (or a change for one date) still wins.">
        <Choices ariaLabel="Weeks in the rotation" value={String(settings.cycleWeeks)} onChange={(v) => saveSettings({ cycleWeeks: Number(v) }, `Rotation: ${v} week${v === '1' ? '' : 's'}`)} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} />
      </Field>
      {cyc && (
        <>
          <p style={{ ...small, marginTop: '10px' }}>This week is <strong>week {cycleIndex(file, today) + 1} of {settings.cycleWeeks}</strong>. The cycle started on {labelOfDate(settings.cycleStart, { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
          <button type="button" style={btn(false)} disabled={!canEdit} onClick={() => saveSettings({ cycleStart: weekStartOf(today) }, 'This week is now week 1')}>Make this week week 1</button>
        </>
      )}
    </Collapsible>
  );

  return (
    <Page intro="What is for breakfast, lunch and dinner: today's menu and the week, in big print with Hebrew and English. Dishes are food only: please do not put student names or allergies here.">
      {empty && (
        <div style={{ ...card, borderColor: colors.accent }} data-testid="menu-empty">
          <h3 style={h3}>No menu yet</h3>
          <p style={{ ...small, margin: 0 }}>Import the kitchen's menu below, or open 'The week' and add dishes meal by meal. Until there is a menu the screen skips this slide.</p>
        </div>
      )}
      {!canEdit && <Hint>You can look at the menu but not change it.</Hint>}
      {onOff}
      {todayCard}
      {weekCard}
      {importCard}
      <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
        {whatShows}
        <Collapsible id="menu-meals" title="Meals" icon="clock" summary={file.mealTypes.map((m) => m.en || m.he).join(' · ')}>
          <MealTypesEditor file={file} busy={busy} onSave={(list) => (canEdit ? change('PUT', '/settings', { mealTypes: list }, 'Meals saved') : null)} />
        </Collapsible>
        {rotation}
        <Collapsible id="menu-preview" title="Preview" icon="play" summary="See the menu on the screen">
          <Hint style={{ marginTop: 0 }}>Opens a preview of the screen. Nothing changes on the real TV. The slide only appears when it is switched on above and in the slide list.</Hint>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button type="button" style={btn(false)} onClick={() => previewAt('')}>Now</button>
            <button type="button" style={btn(false)} onClick={() => previewAt(`&previewDate=${nextFri}`)}>Friday ({labelOfDate(nextFri, { month: 'short', day: 'numeric' })})</button>
          </div>
          <Hint>Slides: <LinkButton onClick={() => onNavigate?.('slides')}>set its seconds and order</LinkButton>.</Hint>
        </Collapsible>
      </div>

      <MealSheet ctx={sheet} file={file} open={!!sheet} busy={busy} onClose={() => setSheet(null)} onSave={saveMeal} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} file={file} weekStart={ws} copyText={copy}
        onDone={(r, msg) => { setImportOpen(false); const prev = file; setFile(r); notify(msg, 'success', { label: 'Undo', onClick: () => undoTo(prev, setFile) }); }} />
      <Sheet open={!!noMeals} onClose={() => setNoMeals(null)} title={noMeals ? `No meals · ${labelOfDate(noMeals.date)}` : ''}>
        {noMeals && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <Field label="What the screen says" hint="For example 'No meals - trip day'. Leave it empty for just 'No meals'." style={{ marginTop: 0 }}>
              <input value={noMeals.note} onChange={(e) => setNoMeals({ ...noMeals, note: e.target.value })} maxLength={LIMITS.note} aria-label="Why there are no meals" placeholder="No meals - trip day" style={{ ...fieldStyle, width: '100%' }} />
            </Field>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={btn(true, { flex: 1 })} disabled={busy} onClick={async () => { const ok = await change('PUT', `/days/${noMeals.date}`, { day: { ...(file.days[noMeals.date] || {}), closed: true, note: noMeals.note.trim() } }, 'No meals that day'); if (ok) setNoMeals(null); }}>Save</button>
              <button type="button" style={btn(false)} onClick={() => setNoMeals(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet open={!!copyDay} onClose={() => setCopyDay(null)} title="Copy this day to...">
        {copyDay && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <Field label="Copy to this date" hint={`${labelOfDate(copyDay.from, { weekday: 'long', month: 'short', day: 'numeric' })} will be copied onto it as a change for that date only.`} style={{ marginTop: 0 }}>
              <input type="date" value={copyDay.to} onChange={(e) => setCopyDay({ ...copyDay, to: e.target.value })} aria-label="Copy to date" style={{ ...fieldStyle, width: '100%' }} />
            </Field>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={btn(true, { flex: 1 })} disabled={busy || !copyDay.to || copyDay.to === copyDay.from} onClick={async () => {
                const src = resolveDay(file, copyDay.from);
                const meals = Object.fromEntries(src.meals.map((m) => [m.type, { items: m.items, note: m.note }]));
                const ok = await change('PUT', `/days/${copyDay.to}`, { day: { closed: src.closed, note: src.note, meals } }, `Copied to ${dayName(copyDay.to)} ${labelOfDate(copyDay.to, { month: 'short', day: 'numeric' })}`);
                if (ok) setCopyDay(null);
              }}>Copy</button>
              <button type="button" style={btn(false)} onClick={() => setCopyDay(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Sheet>
      {modal}
    </Page>
  );
}
