// The sheets of Screen > Menu: edit one meal, import a menu, edit the meal types. All text is React text; the server
// validates again (src/shared/menu.js is the one normaliser).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import { Field, Hint, fieldStyle } from '../look/kit.jsx';
import {
  btn, iconBtn, Chip, small, labelOfDate, menuApi,
} from './menuKit.jsx';
import { DAYS, DAY_EN, DAY_EN_SHORT, tagInfo } from '../../../shared/menuCopy.js';
import {
  LIMITS, parseMenuInput, parseDelimited, menuClaudePrompt,
} from '../../../shared/menu.js';

const inputBase = { ...fieldStyle, width: '100%' };

// ── one meal ──────────────────────────────────────────────────────────────────

let seq = 0;
const key = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * ctx = { mode: 'dates'|'usual', date?, day, mealId, mt, items, note, source, set, cycleWeeks }.
 * Says in words which of 'only this date' / 'every weekday' will change (the slip it prevents: changing it forever by accident).
 */
export function MealSheet({ ctx, file, open, onClose, onSave, busy }) {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [scope, setScope] = useState('day');
  const [draft, setDraft] = useState('');
  const addRef = useRef(null);
  useEffect(() => {
    if (!ctx || !open) return;
    setRows((ctx.items || []).map((i) => ({ k: key(), id: i.id, en: i.en || '', he: i.he || '', tags: [...(i.tags || [])] })));
    setNote(ctx.note || '');
    setScope(ctx.mode === 'usual' ? 'usual' : 'day');
    setDraft('');
  }, [ctx, open]);
  const tagsOn = file.settings.tags;
  const sugg = useMemo(() => {
    const have = new Set(rows.map((r) => `${r.en}|${r.he}`));
    const q = draft.trim().toLowerCase();
    return (file.suggestions || []).filter((s) => !have.has(`${s.en}|${s.he}`) && (!q || `${s.en} ${s.he}`.toLowerCase().includes(q))).slice(0, 10);
  }, [file.suggestions, rows, draft]);
  if (!ctx) return null;
  const full = rows.length >= LIMITS.dishes;
  const setRow = (k, patch) => setRows((p) => p.map((r) => (r.k === k ? { ...r, ...patch } : r)));
  const move = (i, d) => setRows((p) => { const a = [...p]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); return a; });
  const add = (item) => {
    if (full) return;
    setRows((p) => [...p, { k: key(), en: item.en || '', he: item.he || '', tags: [...(item.tags || [])] }]);
    setDraft('');
    setTimeout(() => addRef.current?.focus(), 0);
  };
  const addTyped = () => { const t = draft.trim(); if (t) add(/[֐-׿]/.test(t) && !/[A-Za-z]/.test(t) ? { he: t } : { en: t }); };
  const wd = DAY_EN[ctx.day];
  const cyc = ctx.cycleWeeks > 1;
  const clean = rows.filter((r) => r.en.trim() || r.he.trim());
  const tooLong = clean.some((r) => r.en.length > LIMITS.dish || r.he.length > LIMITS.dish);

  const apply = () => {
    const items = clean.map((r) => ({ id: r.id, en: r.en.trim(), he: r.he.trim(), tags: r.tags }));
    onSave({ scope, items, note: note.trim() });
  };
  const where = ctx.mode === 'usual'
    ? `Changes every ${wd} in the usual week${cyc ? ` (week ${ctx.set + 1} of ${ctx.cycleWeeks})` : ''}.`
    : scope === 'day' ? `Changes only ${labelOfDate(ctx.date)}. Other ${wd}s stay as they are.` : `Changes every ${wd} in the usual week${cyc ? ` (week ${ctx.set + 1} of ${ctx.cycleWeeks})` : ''}, from now on.`;

  return (
    <Sheet open={open} onClose={onClose} title={`${ctx.mode === 'usual' ? wd : labelOfDate(ctx.date, { weekday: 'long' })} · ${ctx.mt.en || ctx.mt.he}`}>
      <div style={{ display: 'grid', gap: '12px', paddingBottom: '90px' }}>
        {ctx.mode === 'dates' && ctx.source !== 'week' && ctx.from !== 'today' && (
          <div role="radiogroup" aria-label="Apply to" style={{ display: 'grid', gap: '8px' }}>
            {[['day', `Only ${labelOfDate(ctx.date)}`], ['usual', `Every ${wd}${cyc ? ` (week ${ctx.set + 1} of ${ctx.cycleWeeks})` : ''}`]].map(([v, l]) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>
                <input type="radio" name="menu-scope" checked={scope === v} onChange={() => setScope(v)} style={{ width: '22px', height: '22px' }} />{l}
              </label>
            ))}
          </div>
        )}
        <p style={{ ...small, margin: 0, fontWeight: 600 }} data-testid="menu-scope-note">{where}</p>

        {rows.length === 0 && <p style={small}>No dishes yet. Type one below, or tap a suggestion. A meal with no dishes does not show.</p>}
        {rows.map((r, i) => (
          <div key={r.k} style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px', display: 'grid', gap: '8px' }}>
            <input value={r.en} onChange={(e) => setRow(r.k, { en: e.target.value })} maxLength={LIMITS.dish} aria-label={`Dish ${i + 1} in English`} placeholder="Dish" style={inputBase} />
            <input value={r.he} onChange={(e) => setRow(r.k, { he: e.target.value })} maxLength={LIMITS.dish} dir="rtl" aria-label={`Dish ${i + 1} in Hebrew`} placeholder="עברית (optional)" style={{ ...inputBase, fontFamily: adminFonts.hebrewPrimary }} />
            {tagsOn.length > 0 && (
              <div role="group" aria-label={`Tags for dish ${i + 1}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tagsOn.map((t) => (
                  <Chip key={t} on={r.tags.includes(t)} onClick={() => setRow(r.k, { tags: r.tags.includes(t) ? r.tags.filter((x) => x !== t) : [...r.tags, t].slice(0, LIMITS.tagsPerDish) })} style={{ minHeight: '44px' }}>{tagInfo(t)?.en || t}</Chip>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={iconBtn}>↑</button>
              <button type="button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)} style={iconBtn}>↓</button>
              <button type="button" aria-label="Remove dish" onClick={() => setRows((p) => p.filter((x) => x.k !== r.k))} style={iconBtn}>✕</button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '8px' }}>
          <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }} disabled={full} aria-label="Add a dish" placeholder={full ? `${LIMITS.dishes} dishes at most` : 'Type a dish, press Enter'} style={{ ...inputBase, flex: 1 }} maxLength={LIMITS.dish} />
          <button type="button" onClick={addTyped} disabled={full || !draft.trim()} style={btn(false)}>Add</button>
        </div>
        {sugg.length > 0 && (
          <div aria-label="Suggestions" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {sugg.map((s) => <Chip key={`${s.en}|${s.he}`} onClick={() => add(s)} disabled={full}>+ {s.en || s.he}</Chip>)}
          </div>
        )}

        <Field label="Note (optional)" hint="For example 'Served in the zal'. Food only: please do not put a student's name or allergy here.">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.note} style={inputBase} aria-label="Note" />
        </Field>
        {tooLong && <Hint style={{ color: colors.danger }}>A dish is longer than {LIMITS.dish} characters.</Hint>}
      </div>
      <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: '8px', padding: '10px 0', background: colors.card, borderTop: `1px solid ${colors.line}` }}>
        <button type="button" style={btn(true, { flex: 1 })} onClick={apply} disabled={busy || tooLong} data-testid="menu-meal-save">Save</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── import ────────────────────────────────────────────────────────────────────

async function readFileRows(f) {
  if (/\.xlsx$/i.test(f.name)) {
    const { readSheet } = await import('read-excel-file/browser'); // only loaded when someone picks a spreadsheet
    return (await readSheet(f)).map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
  }
  const t = await f.text();
  return parseDelimited(t, /\t/.test(t.slice(0, 2000)) ? '\t' : ',');
}

export function ImportSheet({ open, onClose, file, weekStart, onDone, copyText }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [place, setPlace] = useState('week');
  const [mode, setMode] = useState('replace');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { if (open) { setText(''); setRows(null); setFileName(''); setErr(''); setPlace('week'); setMode('replace'); } }, [open]);
  const parsed = useMemo(() => {
    if (!rows && !text.trim()) return null;
    try { return parseMenuInput(rows ? { rows } : { text }, file); } catch { return null; }
  }, [text, rows, file]);
  const n = file.settings.cycleWeeks || 1;
  const target = place === 'week' ? { kind: 'week', weekStart } : { kind: 'usual', set: Number(place.replace('usual', '')) || 0 };
  const errors = parsed?.errors || [];
  const ready = parsed && !errors.length;

  const pickFile = async (f) => {
    if (!f) return;
    setErr('');
    try { setRows(await readFileRows(f)); setFileName(f.name); setText(''); } catch { setErr('That file could not be read. Try copying the cells and pasting them instead.'); }
  };
  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const body = { ...(rows ? { rows } : { text }), target, mode };
      const r = await menuApi('POST', '/import', body);
      onDone(r, `Menu imported: ${r.counts?.dishes ?? 0} dishes`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Import a menu">
      <div style={{ display: 'grid', gap: '12px', paddingBottom: '80px' }}>
        <p style={{ ...small, margin: 0 }}>Paste the kitchen's cells from a spreadsheet, or text in the TachTach format, or pick an .xlsx / .csv file. Nothing is saved until you press the button below.</p>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setRows(null); setFileName(''); }} aria-label="Paste the menu here" placeholder={'Paste here, for example:\n@ every Sun-Thu\nLunch: Chicken schnitzel [meat]; Rice; Salad'} rows={7} dir="auto"
          style={{ ...inputBase, minHeight: '150px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '16px', resize: 'vertical' }} data-testid="menu-import-text" />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={() => fileRef.current?.click()}>Choose .xlsx / .csv</button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" aria-label="Choose a menu file" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
          <button type="button" style={btn(false)} onClick={() => copyText(menuClaudePrompt(file), 'Request copied')}>Copy Claude prompt</button>
        </div>
        <Hint style={{ marginTop: 0 }}>A PDF or photo of the menu? Copy the Claude prompt, give Claude the prompt and the picture, then paste its answer above.</Hint>
        {fileName && <p style={{ ...small, margin: 0 }}>File: {fileName}</p>}

        {parsed && (
          <div role="status" aria-live="polite" style={{ border: `1px solid ${errors.length ? colors.danger : colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px', display: 'grid', gap: '6px' }} data-testid="menu-import-preview">
            {!errors.length && <strong style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>Found: {parsed.counts.days} day{parsed.counts.days === 1 ? '' : 's'} · {parsed.counts.meals} meal{parsed.counts.meals === 1 ? '' : 's'} · {parsed.counts.dishes} dish{parsed.counts.dishes === 1 ? '' : 'es'}</strong>}
            {errors.slice(0, 6).map((e, i) => <div key={i} style={{ ...small, color: colors.danger }}>{e.line ? `${e.row ? 'Row' : 'Line'} ${e.line}: ` : ''}{e.message}</div>)}
            {errors.length > 6 && <div style={small}>and {errors.length - 6} more.</div>}
            {(parsed.warnings || []).slice(0, 3).map((e, i) => <div key={`w${i}`} style={small}>Note, line {e.line}: {e.message}</div>)}
          </div>
        )}

        {ready && parsed.template && (
          <Field label="Put it in" style={{ marginTop: 0 }}>
            <div role="radiogroup" aria-label="Put it in" style={{ display: 'grid', gap: '6px' }}>
              {[['week', `Only the week of ${labelOfDate(weekStart, { month: 'short', day: 'numeric' })}`], ...Array.from({ length: n }, (_, i) => [`usual${i}`, n > 1 ? `The usual menu, rotation week ${i + 1} of ${n}` : 'The usual week (every week)'])].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>
                  <input type="radio" name="menu-place" checked={place === v || (place === 'usual' && v === 'usual0')} onChange={() => setPlace(v)} style={{ width: '22px', height: '22px' }} />{l}
                </label>
              ))}
            </div>
          </Field>
        )}
        {ready && (
          <Field label="How" style={{ marginTop: 0 }}>
            <div role="group" aria-label="How" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Chip on={mode === 'replace'} onClick={() => setMode('replace')}>Replace what is there</Chip>
              <Chip on={mode === 'add'} onClick={() => setMode('add')}>Add to it</Chip>
            </div>
          </Field>
        )}
        {err && <p role="alert" style={{ ...small, color: colors.danger }}>{err}</p>}
      </div>
      <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: '8px', padding: '10px 0', background: colors.card, borderTop: `1px solid ${colors.line}` }}>
        <button type="button" style={btn(true, { flex: 1, opacity: ready && !busy ? 1 : 0.5 })} disabled={!ready || busy} onClick={apply} data-testid="menu-import-apply">Use this menu</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── meal types ────────────────────────────────────────────────────────────────

export function MealTypesEditor({ file, onSave, busy }) {
  const [list, setList] = useState(file.mealTypes);
  useEffect(() => setList(file.mealTypes), [file.mealTypes]);
  const dirty = JSON.stringify(list) !== JSON.stringify(file.mealTypes);
  const set = (i, patch) => setList((p) => p.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i, d) => setList((p) => { const a = [...p]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); return a; });
  const [confirm, setConfirm] = useState(null);
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <Hint style={{ marginTop: 0 }}>The meals you serve, in the order they show. Rename them, change the days, or add your own (up to {LIMITS.mealTypes}). The window (from / to) decides which meal is highlighted as 'Now' and when the screen switches to tomorrow.</Hint>
      {list.map((m, i) => (
        <div key={m.id || i} style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px', display: 'grid', gap: '8px' }} data-testid={`menu-mealtype-${m.id}`}>
          <input value={m.en} onChange={(e) => set(i, { en: e.target.value })} maxLength={LIMITS.name} aria-label={`Meal ${i + 1} name in English`} placeholder="Name" style={inputBase} />
          <input value={m.he} onChange={(e) => set(i, { he: e.target.value })} maxLength={LIMITS.name} dir="rtl" aria-label={`Meal ${i + 1} name in Hebrew`} placeholder="שם בעברית (optional)" style={{ ...inputBase, fontFamily: adminFonts.hebrewPrimary }} />
          <div role="group" aria-label={`Days for ${m.en || m.he}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {DAYS.map((d) => <Chip key={d} on={m.days.includes(d)} label={DAY_EN[d]} onClick={() => set(i, { days: m.days.includes(d) ? m.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || m.days.includes(x)) })} style={{ padding: '0 12px' }}>{DAY_EN_SHORT[d]}</Chip>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            <label style={{ ...small, display: 'grid', gap: '4px' }}>From<input type="time" value={m.from} onChange={(e) => set(i, { from: e.target.value })} style={inputBase} /></label>
            <label style={{ ...small, display: 'grid', gap: '4px' }}>Until<input type="time" value={m.to} onChange={(e) => set(i, { to: e.target.value })} style={inputBase} /></label>
            <label style={{ ...small, display: 'grid', gap: '4px' }}>Time shown<input value={m.time} onChange={(e) => set(i, { time: e.target.value })} maxLength={LIMITS.time} placeholder="12:30" style={inputBase} /></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
            <input type="checkbox" checked={!!m.shabbos} onChange={(e) => set(i, { shabbos: e.target.checked })} style={{ width: '22px', height: '22px' }} />A Shabbos meal (follows the 'Shabbos meals' choice)
          </label>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" aria-label="Move meal up" disabled={i === 0} onClick={() => move(i, -1)} style={iconBtn}>↑</button>
            <button type="button" aria-label="Move meal down" disabled={i === list.length - 1} onClick={() => move(i, 1)} style={iconBtn}>↓</button>
            <button type="button" aria-label={`Remove ${m.en || m.he}`} disabled={list.length <= 1} onClick={() => setConfirm(i)} style={iconBtn}>✕</button>
          </div>
          {confirm === i && (
            <div role="alertdialog" aria-label="Remove this meal" style={{ border: `1px solid ${colors.danger}`, borderRadius: 'var(--r-sm)', padding: '10px' }}>
              <p style={{ ...small, margin: '0 0 8px', color: colors.text }}>Remove {m.en || m.he}? Its dishes stop showing (they stay saved, so adding a meal with the same name brings them back).</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" style={btn(true, { background: colors.danger })} onClick={() => { setList((p) => p.filter((_, j) => j !== i)); setConfirm(null); }}>Remove</button>
                <button type="button" style={btn(false)} onClick={() => setConfirm(null)}>Keep</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" style={btn(false)} disabled={list.length >= LIMITS.mealTypes} onClick={() => setList((p) => [...p, { id: '', en: '', he: '', days: DAYS.slice(0, 5), from: '', to: '', time: '', shabbos: false }])}>+ Add a meal</button>
        <button type="button" style={btn(true, { opacity: dirty && !busy ? 1 : 0.5 })} disabled={!dirty || busy || list.some((m) => !m.en.trim() && !m.he.trim())} onClick={() => onSave(list)} data-testid="menu-mealtypes-save">Save meals</button>
        {dirty && <button type="button" style={btn(false)} onClick={() => setList(file.mealTypes)}>Undo my changes</button>}
      </div>
    </div>
  );
}

