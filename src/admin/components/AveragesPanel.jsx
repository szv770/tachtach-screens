import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Sheet from './ui/Sheet.jsx';
import { Page, Field, Hint, SwitchRow, Choices, fieldStyle } from './look/kit.jsx';
import { NumberField } from './ui.jsx';
import { useCopy } from './schedule/scheduleShared.jsx';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { btn, iconBtn, card, h3, small } from './menu/menuKit.jsx';
import { board, summary, fmtAvg, plan, planSeconds, TEMPLATE_CSV, CLAUDE_PROMPT, LIMITS } from '../../shared/averages.js';

/**
 * Admin > Screen > Test Averages. Phone first: one column, 44 px targets, sheets with a sticky Save.
 *   On/Off · Add scores (paste or upload a CSV, with a template and a preview) · Google Sheet link (keeps the screen in sync) ·
 *   Students (tap one to fix a score) · What the screen shows.
 * Shows student names and marks, so it is behind its own permission (averages.edit).
 */

const api = (method, path, body) => apiFetch(`/api/averages${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const VIEWS = [['both', 'Leaderboard, then everyone'], ['top', 'Leaderboard only'], ['all', 'Everyone (no leaderboard)']];
const scoresText = (s) => (s || []).join(', ');
const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

const cell = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const toCsv = (students) => students.map((st) => [st.name, st.grade, st.track, ...st.scores].map(cell).join(',')).join('\n');

function download(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { notify('Could not download. Use Copy template instead.', 'error'); }
}

function StudentSheet({ open, student, onClose, onSave, onDelete, busy }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [scores, setScores] = useState('');
  useEffect(() => { if (open) { setName(student?.name || ''); setGrade(student?.grade || ''); setTrack(student?.track || ''); setScores(scoresText(student?.scores)); } }, [open, student]);
  const list = scores.split(/[\s,;]+/).filter(Boolean).map((x) => Number(x.replace('%', '')));
  const bad = list.some((n) => !Number.isFinite(n) || n < 0 || n > LIMITS.maxScore);
  const avg = !bad && list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  return (
    <Sheet open={open} onClose={onClose} title={student?.id ? 'Edit student' : 'Add a student'} label="Student">
      <Field label="Name" htmlFor="avg-name"><input id="avg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} style={fieldStyle} autoComplete="off" /></Field>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Field label="Grade (optional)" htmlFor="avg-grade" style={{ flex: 1, minWidth: '120px' }}><input id="avg-grade" value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={LIMITS.grade} style={fieldStyle} /></Field>
        <Field label="Track (optional)" htmlFor="avg-track" style={{ flex: 1, minWidth: '120px' }}><input id="avg-track" value={track} onChange={(e) => setTrack(e.target.value)} maxLength={LIMITS.track} style={fieldStyle} placeholder="e.g. Gemoro" /></Field>
      </div>
      <Field label="Test scores, oldest first" htmlFor="avg-scores" hint={bad ? 'Scores must be numbers from 0 to 150.' : avg != null ? `Average: ${fmtAvg(avg, 1)} over ${list.length} ${list.length === 1 ? 'test' : 'tests'}.` : 'Separate scores with commas, e.g. 92, 88, 95.'}>
        <input id="avg-scores" inputMode="decimal" value={scores} onChange={(e) => setScores(e.target.value)} style={{ ...fieldStyle, borderColor: bad ? colors.danger : undefined }} />
      </Field>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px', position: 'sticky', bottom: 0 }}>
        <button type="button" style={btn(true)} disabled={busy || bad || !name.trim()} onClick={() => onSave({ name, grade, track, scores: list })} data-testid="avg-save-student">Save</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
        {student?.id && <button type="button" style={btn(false, { color: colors.danger, marginLeft: 'auto' })} onClick={() => onDelete(student)} data-testid="avg-delete-student">Remove</button>}
      </div>
    </Sheet>
  );
}

export default function AveragesPanel({ canEdit = true, slides = [], onUpdateSlides, canEditSlides = false }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('replace');
  const [preview, setPreview] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null); // student | {} (new) | null
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef(null);
  const { copy, modal } = useCopy(notify);

  const load = useCallback(async () => {
    try { const f = await api('GET', ''); setFile(f); setSheetUrl(f.sheet?.url || ''); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = useCallback(async (fn, okMsg, undo) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next && next.students) setFile(next);
      if (okMsg) notify(okMsg, 'success', undo || null);
      return next || true;
    } catch (e) { notify(e.message, 'error'); return false; } finally { setBusy(false); }
  }, []);

  const rows = useMemo(() => (file ? board(file) : []), [file]);
  const sum = useMemo(() => summary(rows), [rows]);
  const steps = useMemo(() => (file ? plan(file) : []), [file]);
  const slide = slides.find((s) => s.type === 'AVERAGES');

  if (error) return <Page intro="The test averages could not be loaded."><Hint style={{ color: colors.danger }}>{error}</Hint><button type="button" style={btn(false)} onClick={load}>Try again</button></Page>;
  if (!file) return <Page intro="Loading..."><Hint>One moment.</Hint></Page>;
  const s = file.settings;
  const saveSettings = (patch, msg) => (canEdit ? run(() => api('PUT', '/settings', { settings: patch }), msg) : null);

  const doPreview = async () => {
    setBusy(true);
    try { setPreview(await api('POST', '/import', { text, mode, dryRun: true })); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };
  const doImport = async () => {
    const prev = file;
    const back = () => run(() => (prev.students.length ? api('POST', '/import', { text: toCsv(prev.students), mode: 'replace' }) : api('POST', '/clear', { confirm: true })), 'Put back');
    const ok = await run(() => api('POST', '/import', { text, mode }), mode === 'add' ? 'Scores added' : 'List updated', { label: 'Undo', onClick: back });
    if (ok) { setText(''); setPreview(null); }
  };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 512 * 1024) { notify('That file is too big. Save the sheet as a CSV and try again.', 'error'); return; }
    if (/\.(xlsx?|numbers)$/i.test(f.name)) { notify('Please save it as a CSV first (in Excel or Sheets: File, Save as, CSV).', 'error'); return; }
    const r = new FileReader();
    r.onload = () => { setText(String(r.result || '')); setPreview(null); };
    r.readAsText(f);
  };

  const filtered = (file.students || []).filter((st) => !q.trim() || st.name.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = showAll || q ? filtered : filtered.slice(0, 12);
  const avgOf = (st) => (st.scores.length ? st.scores.reduce((a, b) => a + b, 0) / st.scores.length : null);
  const needs = s.minTests;

  return (
    <Page intro="Show the Gemoro and Girsa test averages on the screen: a leaderboard, the most improved, and everyone who is in the program.">
      {modal}
      <div style={card} data-testid="avg-onoff">
        <h3 style={h3}>On the screen</h3>
        {slide && canEditSlides
          ? <SwitchRow on={!!slide.enabled} onChange={() => onUpdateSlides?.(slides.map((x) => (x.type === 'AVERAGES' ? { ...x, enabled: !x.enabled } : x)))} label="Show the Test Averages on the screen" note="Off keeps everything saved but the screen skips it. It also skips itself until at least one student has a score." testId="avg-slide-switch" />
          : <p style={small}>The Test Averages slide is {slide ? (slide.enabled ? 'on' : 'off') : 'not in the slide list yet'}.</p>}
        <p style={{ ...small, margin: '8px 0 0' }}>
          {rows.length ? `${rows.length} ${rows.length === 1 ? 'student is' : 'students are'} on the board${s.showMarks ? `, class average ${fmtAvg(sum.avg, s.decimals)}` : ''}. The slide takes about ${planSeconds(steps)} seconds to show every page.` : 'Nobody is on the board yet. Add scores below.'}
        </p>
      </div>

      {canEdit && (
        <div style={card} data-testid="avg-add">
          <h3 style={h3}>Add scores</h3>
          <p style={small}>One student per row: name, then each test score. Grade and track are optional. Paste from a sheet, or upload a CSV.</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0' }}>
            <button type="button" style={btn(false)} onClick={() => copy(TEMPLATE_CSV, 'Template copied. Paste it into a sheet.')} data-testid="avg-copy-template">Copy template</button>
            <button type="button" style={btn(false)} onClick={() => download('test-averages-template.csv', TEMPLATE_CSV)}>Download template</button>
            <button type="button" style={btn(false)} onClick={() => copy(CLAUDE_PROMPT, 'Copied. Give this to Claude with your list.')}>Copy Claude prompt</button>
          </div>
          <textarea aria-label="Paste student scores" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} rows={7} spellCheck={false} placeholder={'Name, Grade, Track, Test 1, Test 2, Test 3\nMoshe Example, 9th, Gemoro, 92, 88, 95'} style={{ ...fieldStyle, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '14px', minHeight: '140px', resize: 'vertical' }} data-testid="avg-text" />
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} style={{ display: 'none' }} aria-label="Upload a CSV file" />
          <Field label="What should this do?" style={{ marginTop: '10px' }}>
            <Choices ariaLabel="Import mode" value={mode} onChange={(v) => { setMode(v); setPreview(null); }} options={[{ value: 'replace', label: 'This is the full list (replace)' }, { value: 'add', label: 'Add these scores to what is there' }]} />
          </Field>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={btn(false)} onClick={() => fileRef.current?.click()}>Upload a CSV</button>
            <button type="button" style={btn(false)} disabled={busy || !text.trim()} onClick={doPreview} data-testid="avg-preview">Check it first</button>
            <button type="button" style={btn(true)} disabled={busy || !text.trim() || !!preview?.errors?.length} onClick={doImport} data-testid="avg-import">{mode === 'add' ? 'Add the scores' : 'Replace the list'}</button>
          </div>
          {preview && (
            <div style={{ marginTop: '12px' }} data-testid="avg-preview-result">
              {preview.errors?.length ? preview.errors.slice(0, 5).map((e, i) => <p key={i} style={{ ...small, color: colors.danger, margin: '2px 0' }}>{e.line ? `Row ${e.line}: ` : ''}{e.message}</p>)
                : <p style={{ ...small, color: colors.text, margin: 0 }}>Found {preview.counts.students} students and {preview.counts.scores} scores. {mode === 'replace' ? 'Anyone not in this list will be removed.' : 'Existing scores stay and these are added after them.'}</p>}
              {preview.warnings?.slice(0, 4).map((w, i) => <p key={i} style={{ ...small, margin: '2px 0' }}>{w.message}</p>)}
              {!preview.errors?.length && preview.preview?.map((r, i) => <p key={i} style={{ ...small, margin: '2px 0' }}>{r.name}: {r.scores.join(', ') || 'no scores yet'}</p>)}
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div style={card} data-testid="avg-sheet">
          <h3 style={h3}>Link a Google Sheet</h3>
          <p style={small}>Keep the list in a Google Sheet and the screen follows it. Use the same columns as the template (first row = headings). In the sheet: Share, then General access: <strong>Anyone with the link can view</strong>.</p>
          <Field label="Sheet link" htmlFor="avg-sheet-url" style={{ marginTop: '10px' }}><input id="avg-sheet-url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." style={fieldStyle} autoComplete="off" /></Field>
          <SwitchRow on={!!file.sheet.auto} onChange={() => run(() => api('PUT', '/sheet', { url: file.sheet.url, auto: !file.sheet.auto }))} label="Keep it in sync (every 15 minutes)" note="The sheet is the whole truth: students not in it are removed when it syncs." />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <button type="button" style={btn(false)} disabled={busy || sheetUrl.trim() === file.sheet.url} onClick={() => run(() => api('PUT', '/sheet', { url: sheetUrl.trim() }), sheetUrl.trim() ? 'Link saved' : 'Link removed')} data-testid="avg-sheet-save">Save link</button>
            <button type="button" style={btn(true)} disabled={busy || !file.sheet.url} onClick={() => run(() => api('POST', '/sync'), 'Synced from the sheet')} data-testid="avg-sheet-sync">Sync now</button>
          </div>
          <p style={{ ...small, margin: '8px 0 0', color: file.sheet.lastError ? colors.danger : colors.dim }}>
            {file.sheet.lastError ? `Last sync failed: ${file.sheet.lastError}` : file.sheet.lastSync ? `Last synced ${when(file.sheet.lastSync)} (${file.sheet.lastCount} students).` : file.sheet.url ? 'Not synced yet.' : 'No sheet linked.'}
          </p>
        </div>
      )}

      <div style={card} data-testid="avg-students">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ ...h3, margin: 0, flex: 1 }}>Students ({file.students.length})</h3>
          {canEdit && <button type="button" style={btn(false)} onClick={() => setEdit({})} data-testid="avg-add-student">Add one</button>}
        </div>
        {file.students.length > 8 && <input aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" style={{ ...fieldStyle, marginTop: '10px' }} />}
        {file.students.length === 0 ? <p style={{ ...small, marginTop: '8px' }}>No students yet.</p> : (
          <div style={{ marginTop: '8px' }}>
            {shown.map((st) => {
              const a = avgOf(st);
              const out = st.scores.length < needs;
              return (
                <button key={st.id} type="button" onClick={() => canEdit && setEdit(st)} disabled={!canEdit} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '10px', minHeight: '44px', padding: '6px 0', border: 'none', borderBottom: `1px solid ${colors.line}`, background: 'transparent', textAlign: 'left', cursor: canEdit ? 'pointer' : 'default', color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '15px' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}{st.track ? <span style={{ ...small, marginLeft: '8px' }}>{st.track}</span> : null}</span>
                  <span style={{ ...small, whiteSpace: 'nowrap' }}>{st.scores.length} {st.scores.length === 1 ? 'test' : 'tests'}</span>
                  <strong style={{ minWidth: '48px', textAlign: 'right', color: out ? colors.dim : colors.text }}>{a == null ? '–' : fmtAvg(a, 1)}</strong>
                </button>
              );
            })}
            {!showAll && !q && filtered.length > 12 && <button type="button" style={btn(false, { marginTop: '10px' })} onClick={() => setShowAll(true)}>Show all {filtered.length}</button>}
            {canEdit && file.students.length > 0 && <button type="button" style={btn(false, { marginTop: '14px', color: colors.danger })} disabled={busy} onClick={() => { if (window.confirm('Remove every student and score? This cannot be undone.')) run(() => api('POST', '/clear', { confirm: true }), 'Everyone removed'); }}>Remove everyone</button>}
          </div>
        )}
      </div>

      <div style={card} data-testid="avg-settings">
        <h3 style={h3}>What the screen shows</h3>
        <Field label="Title (English)" htmlFor="avg-title"><input id="avg-title" key={`t-${s.title}`} defaultValue={s.title} disabled={!canEdit} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.title && saveSettings({ title: e.target.value.trim() }, 'Title saved')} style={fieldStyle} /></Field>
        <Field label="Title (Hebrew)" htmlFor="avg-title-he"><input id="avg-title-he" key={`h-${s.titleHe}`} dir="rtl" defaultValue={s.titleHe} disabled={!canEdit} maxLength={80} onBlur={(e) => e.target.value.trim() !== s.titleHe && saveSettings({ titleHe: e.target.value.trim() }, 'Title saved')} style={fieldStyle} /></Field>
        <Field label="Pages">
          <Choices ariaLabel="Pages" value={s.view} onChange={(v) => saveSettings({ view: v }, 'Saved')} options={VIEWS.map(([value, label]) => ({ value, label }))} />
        </Field>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Field label="Leaderboard size" hint="Top 3 on the pillars, the rest beside them."><NumberField value={s.topCount} min={3} max={10} onCommit={(n) => saveSettings({ topCount: n }, 'Saved')} ariaLabel="Leaderboard size" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          <Field label="Seconds per list page"><NumberField value={s.seconds} min={5} max={30} onCommit={(n) => saveSettings({ seconds: n }, 'Saved')} ariaLabel="Seconds per list page" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Field label="Lowest average shown" hint="0 shows everyone entered."><NumberField value={s.minAverage} min={0} max={150} onCommit={(n) => saveSettings({ minAverage: n }, 'Saved')} ariaLabel="Lowest average shown" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          <Field label="Tests needed to appear"><NumberField value={s.minTests} min={1} max={20} onCommit={(n) => saveSettings({ minTests: n }, 'Saved')} ariaLabel="Tests needed to appear" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Field label="Prize average" hint="A star shows by anyone at or above it. 0 = no prize line."><NumberField value={s.prizeAt} min={0} max={150} onCommit={(n) => saveSettings({ prizeAt: n }, 'Saved')} ariaLabel="Prize average" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          <Field label="Prize wording (optional)" htmlFor="avg-prize" style={{ flex: 1, minWidth: '180px' }}><input id="avg-prize" key={`p-${s.prizeLine}`} defaultValue={s.prizeLine} disabled={!canEdit} maxLength={120} placeholder="e.g. earns a pizza party" onBlur={(e) => e.target.value.trim() !== s.prizeLine && saveSettings({ prizeLine: e.target.value.trim() }, 'Saved')} style={fieldStyle} /></Field>
        </div>
        <SwitchRow on={s.showMarks} onChange={() => saveSettings({ showMarks: !s.showMarks }, 'Saved')} label="Show each average" note="Off shows only the ranking and names." />
        <SwitchRow on={s.showGrade} onChange={() => saveSettings({ showGrade: !s.showGrade }, 'Saved')} label="Show the grade next to the name" />
        <SwitchRow on={s.showTests} onChange={() => saveSettings({ showTests: !s.showTests }, 'Saved')} label="Show how many tests each student took" />
        <SwitchRow on={s.showImproved} onChange={() => saveSettings({ showImproved: !s.showImproved }, 'Saved')} label="Most improved page" note="Needs 3 or more tests. Only shows students who climbed 2 points or more." />
        <SwitchRow on={s.byTrack} onChange={() => saveSettings({ byTrack: !s.byTrack }, 'Saved')} label="A page for each track" note={file.tracks?.length >= 2 ? `Tracks found: ${file.tracks.join(', ')}.` : 'Needs two or more tracks (the Track column).'} />
        <Field label="Decimals"><Choices ariaLabel="Decimals" value={String(s.decimals)} onChange={(v) => saveSettings({ decimals: Number(v) }, 'Saved')} options={[{ value: '1', label: '94.5' }, { value: '0', label: '95' }]} /></Field>
      </div>

      <StudentSheet
        open={!!edit} student={edit} busy={busy} onClose={() => setEdit(null)}
        onSave={async (d) => { const ok = await run(() => (edit?.id ? api('PUT', `/students/${edit.id}`, d) : api('POST', '/students', d)), 'Saved'); if (ok) setEdit(null); }}
        onDelete={async (st) => {
          const ok = await run(() => api('DELETE', `/students/${st.id}`), `${st.name} removed`, { label: 'Undo', onClick: () => run(() => api('POST', '/students', st), 'Restored') });
          if (ok) setEdit(null);
        }}
      />
    </Page>
  );
}
