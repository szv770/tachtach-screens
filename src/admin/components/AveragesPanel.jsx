import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Sheet from './ui/Sheet.jsx';
import { Page, Field, Hint, SwitchRow, Choices, fieldStyle } from './look/kit.jsx';
import { NumberField } from './ui.jsx';
import { useCopy } from './schedule/scheduleShared.jsx';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { btn, iconBtn, card, h3, small } from './menu/menuKit.jsx';
import { board, summary, fmtAvg, plan, planSeconds, starterCsv, whyHidden, TEMPLATE_CSV, CLAUDE_PROMPT, LIMITS } from '../../shared/averages.js';

/**
 * Admin > Screen > Test Averages. Phone first: one column, 44 px targets, sheets with a sticky Save.
 *   On/Off · Add scores (paste or upload a CSV, with a template and a preview) · Google Sheet link (keeps the screen in sync) ·
 *   Students (tap one to fix a score) · What the screen shows.
 * Shows student names and marks, so it is behind its own permission (averages.edit).
 */

const api = (method, path, body) => apiFetch(`/api/averages${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const TRANSITION_LABELS = [['mix', 'Mix of all'], ['cube', 'Cube'], ['cards', 'Cards'], ['door', 'Door'], ['carousel', 'Carousel'], ['tilt', 'Tilt'], ['sweep', 'Light sweep'], ['curtain', 'Curtain'], ['zoom', 'Zoom'], ['rise', 'Rise'], ['flip', 'Flip'], ['fade', 'Simple fade']];
const timeText = (sec) => (sec >= 90 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} seconds`);
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
  const [avgOnly, setAvgOnly] = useState('');
  useEffect(() => { if (open) { setName(student?.name || ''); setGrade(student?.grade || ''); setTrack(student?.track || ''); setScores(scoresText(student?.scores)); setAvgOnly(student?.avg != null ? String(student.avg) : ''); } }, [open, student]);
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
      <Field label="Or just an average (no individual tests)" htmlFor="avg-avgonly" hint="Used only while there are no test scores above."><input id="avg-avgonly" inputMode="decimal" value={avgOnly} onChange={(e) => setAvgOnly(e.target.value)} style={{ ...fieldStyle, maxWidth: '120px' }} /></Field>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px', position: 'sticky', bottom: 0 }}>
        <button type="button" style={btn(true)} disabled={busy || bad || !name.trim()} onClick={() => onSave({ name, grade, track, scores: list, avg: avgOnly.trim() === '' ? null : Number(avgOnly) })} data-testid="avg-save-student">Save</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
        {student?.id && <button type="button" style={btn(false, { color: colors.danger, marginLeft: 'auto' })} onClick={() => onDelete(student)} data-testid="avg-delete-student">Remove</button>}
      </div>
    </Sheet>
  );
}

/** Prize levels: an average and a name for each (Gold 90, Silver 80...). A star and the level's name show by anyone who reaches it. */
function PrizeLevels({ levels, note, canEdit, onSave }) {
  const [rows, setRows] = useState(levels);
  const [text, setText] = useState(note || '');
  useEffect(() => { setRows(levels); setText(note || ''); }, [levels, note]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(levels) || text !== (note || '');
  const set = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ marginTop: '10px' }} data-testid="avg-prizes">
      <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, color: colors.text }}>Prize levels</div>
      <p style={{ ...small, margin: '2px 0 8px' }}>Each level is an average and a name. Students who reach one get a star and its name, and the levels are listed at the bottom of the screen. The highest level a student reaches is the one that counts. None added = no prizes shown.</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <input aria-label={`Prize level ${i + 1} average`} inputMode="decimal" value={r.at} disabled={!canEdit} onChange={(e) => set(i, { at: e.target.value })} style={{ ...fieldStyle, maxWidth: '84px' }} />
          <span style={small}>and above</span>
          <input aria-label={`Prize level ${i + 1} name`} value={r.label} disabled={!canEdit} maxLength={LIMITS.prizeLabel} placeholder="e.g. Gold" onChange={(e) => set(i, { label: e.target.value })} style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
          {canEdit && <button type="button" aria-label={`Remove prize level ${i + 1}`} style={iconBtn} onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</button>}
        </div>
      ))}
      {canEdit && rows.length < LIMITS.prizes && <button type="button" style={btn(false)} onClick={() => setRows([...rows, { at: rows.length ? Math.max(1, Number(rows[rows.length - 1].at) - 5) : 90, label: '' }])} data-testid="avg-add-prize">Add a prize level</button>}
      <Field label="Note under the levels (optional)" htmlFor="avg-prize-note" style={{ marginTop: '10px' }}><input id="avg-prize-note" value={text} disabled={!canEdit} maxLength={120} placeholder="e.g. Prizes are given out at the end of the year" onChange={(e) => setText(e.target.value)} style={fieldStyle} /></Field>
      {canEdit && <button type="button" style={btn(true, { marginTop: '4px' })} disabled={!dirty} onClick={() => onSave(rows.map((r) => ({ at: Number(r.at), label: String(r.label || '').trim() })).filter((r) => r.at > 0), text.trim())} data-testid="avg-save-prizes">Save prize levels</button>}
    </div>
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
  const [check, setCheck] = useState(null);
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
  const avgOf = (st) => (st.scores.length ? st.scores.reduce((a, b) => a + b, 0) / st.scores.length : (st.avg ?? null));
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
          {rows.length ? `${rows.length} ${rows.length === 1 ? 'student is' : 'students are'} on the board${s.showMarks ? `, class average ${fmtAvg(sum.avg, s.decimals)}` : ''}. One full run takes about ${timeText(planSeconds(steps))}.` : 'Nobody is on the board yet. Add scores below.'}
        </p>
      </div>

      {canEdit && (
        <div style={card} data-testid="avg-sheet">
          <h3 style={h3}>Link a Google Sheet</h3>
          <p style={small}>Keep the scores in a Google Sheet and the screen follows it. Already have a sheet? Use it as it is: it needs a Name column (or First and Last) and either an Average column or one column per test. English or Hebrew headings both work, a date above each test column is fine, and title lines above the headings are fine. An empty cell means the student did not take that test and is not counted; a 0 is a real mark and lowers the average. Press <strong>Check the sheet</strong> to see how it was understood before anything changes. Starting fresh? Use the template (File, Import, Upload).</p>
          <ol style={{ ...small, margin: '8px 0 0', paddingLeft: '20px' }}>
            <li>In the sheet, press <strong>Share</strong>. Add the people who will type scores as <strong>Editors</strong>.</li>
            <li>Under General access choose <strong>Anyone with the link</strong> and set it to <strong>Viewer</strong>. This is how the screen reads it. Anyone with the link can see the names and marks, so only share the link with staff.</li>
            <li>Copy the link, paste it below, press <strong>Save link</strong>, then <strong>Sync now</strong>.</li>
          </ol>
          {file.rosterCount > 0 && (
            <div style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: '10px' }} data-testid="avg-roster-start">
              <strong style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>Start from your Bochurim list</strong>
              <p style={{ ...small, margin: '4px 0 8px' }}>Your Bochurim list already has {file.rosterCount} names. Start the sheet with them so staff only type scores, and names are spelled the same everywhere.</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" style={btn(false)} data-testid="avg-roster-download" onClick={async () => { try { const r = await api('GET', '/roster-names'); download('test-averages-starter.csv', starterCsv(r.names)); } catch (e) { notify(e.message, 'error'); } }}>Download starter sheet</button>
                <button type="button" style={btn(false)} data-testid="avg-roster-copy" onClick={async () => { try { const r = await api('GET', '/roster-names'); copy(r.names.join('\n'), 'Names copied'); } catch (e) { notify(e.message, 'error'); } }}>Copy the names</button>
              </div>
              <p style={{ ...small, margin: '8px 0 0' }}>In Google Sheets: File, Import, Upload the starter sheet, then "Replace spreadsheet". A name in the sheet that is not on the Bochurim list is flagged after each sync, so typos are easy to catch.</p>
            </div>
          )}
          <p style={{ ...small, margin: '8px 0 0' }}>The screen reads the first tab (or the tab the link opens). The Average column, if there is one, is worked out for you and ignored.</p>
          <Field label="Sheet link" htmlFor="avg-sheet-url" style={{ marginTop: '10px' }}><input id="avg-sheet-url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." style={fieldStyle} autoComplete="off" /></Field>
          <SwitchRow on={!!file.sheet.auto} onChange={() => run(() => api('PUT', '/sheet', { url: file.sheet.url, auto: !file.sheet.auto }))} label="Keep it in sync automatically" note="The sheet is the whole truth: students not in it are removed when it syncs." />
          {file.sheet.auto && (
            <Field label="Look at the sheet every" hint="A look is one tiny download and does nothing if the sheet has not changed, so every minute is safe for the Pi. A change shows on the screen within about this long.">
              <Choices ariaLabel="How often to look at the sheet" value={String(file.sheet.everyMin)} onChange={(v) => run(() => api('PUT', '/sheet', { url: file.sheet.url, everyMin: Number(v) }), 'Saved')} options={[{ value: '1', label: '1 minute' }, { value: '2', label: '2 minutes' }, { value: '5', label: '5 minutes' }, { value: '10', label: '10 minutes' }]} />
            </Field>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <button type="button" style={btn(false)} disabled={busy || sheetUrl.trim() === file.sheet.url} onClick={async () => { const ok = await run(() => api('PUT', '/sheet', { url: sheetUrl.trim() }), sheetUrl.trim() ? 'Link saved' : 'Link removed'); if (ok && sheetUrl.trim()) run(() => api('POST', '/sync'), 'Synced from the sheet'); }} data-testid="avg-sheet-save">Save link</button>
            <button type="button" style={btn(false)} disabled={busy || !(sheetUrl.trim() || file.sheet.url)} onClick={async () => { setBusy(true); try { setCheck(await api('POST', '/sheet/check', { url: sheetUrl.trim() })); } catch (e) { setCheck(null); notify(e.message, 'error'); } finally { setBusy(false); } }} data-testid="avg-sheet-check">Check the sheet</button>
            <button type="button" style={btn(true)} disabled={busy || !file.sheet.url} onClick={() => run(() => api('POST', '/sync'), 'Synced from the sheet')} data-testid="avg-sheet-sync">Sync now</button>
          </div>
          {check && (
            <div style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: '10px' }} data-testid="avg-check-result">
              <strong style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>What the sheet looks like</strong>
              <p style={{ ...small, margin: '4px 0' }}>{check.counts.students} students found{check.counts.averageOnly ? ` (${check.counts.averageOnly} with only an average)` : ''}. {check.wouldShow} would show on the screen{check.minAverage > 0 ? ` (minimum average ${check.minAverage})` : ''}.</p>
              {check.columns?.length > 0 && <p style={{ ...small, margin: '4px 0' }}>Columns: {check.columns.map((c) => `${c.header} = ${({ name: 'name', first: 'first name', last: 'last name', grade: 'grade', track: 'track', average: 'average', score: 'test score', ignored: 'ignored' })[c.as] || c.as}`).join(' · ')}</p>}
              {check.preview.map((r, i) => <p key={i} style={{ ...small, margin: '2px 0' }}>{r.name}: {r.avg != null ? fmtAvg(r.avg, 1) : 'no average'}{r.scores ? ` (${r.scores} tests)` : ''}</p>)}
              {check.errors.map((e, i) => <p key={`e${i}`} style={{ ...small, color: colors.danger, margin: '2px 0' }}>{e.line ? `Row ${e.line}: ` : ''}{e.message}</p>)}
              {check.warnings.map((w, i) => <p key={`w${i}`} style={{ ...small, margin: '2px 0' }}>{w.message}</p>)}
              {check.notOnListCount > 0 && <p style={{ ...small, margin: '4px 0 0' }}>Not on the Bochurim list (check the spelling): {check.notOnList.join(', ')}{check.notOnListCount > check.notOnList.length ? ` and ${check.notOnListCount - check.notOnList.length} more` : ''}.</p>}
            </div>
          )}
          <p style={{ ...small, margin: '8px 0 0', color: file.sheet.lastError ? colors.danger : colors.dim }}>
            {file.sheet.lastError ? `Last sync failed: ${file.sheet.lastError}` : file.sheet.lastSync ? `Last synced ${when(file.sheet.lastSync)} (${file.sheet.lastCount} students).` : file.sheet.url ? 'Not synced yet.' : 'No sheet linked.'}
          </p>
          {file.sheet.unmatchedCount > 0 && <p style={{ ...small, margin: '6px 0 0' }} data-testid="avg-unmatched">Not on the Bochurim list (check the spelling): {file.sheet.unmatched.join(', ')}{file.sheet.unmatchedCount > file.sheet.unmatched.length ? ` and ${file.sheet.unmatchedCount - file.sheet.unmatched.length} more` : ''}.</p>}
        </div>
      )}

      {canEdit && (
        <div style={card} data-testid="avg-add">
          <h3 style={h3}>Or paste or upload scores</h3>
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

      <div style={card} data-testid="avg-students">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ ...h3, margin: 0, flex: 1 }}>Students ({file.students.length})</h3>
          {canEdit && <button type="button" style={btn(false)} onClick={() => setEdit({})} data-testid="avg-add-student">Add one</button>}
        </div>
        {canEdit && file.rosterNew > 0 && <button type="button" style={btn(false, { marginTop: '10px' })} disabled={busy} onClick={() => run(() => api('POST', '/from-roster'), 'Names added from the Bochurim list')} data-testid="avg-from-roster">Add the {file.rosterNew} names from the Bochurim list</button>}
        {file.students.length > 8 && <input aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" style={{ ...fieldStyle, marginTop: '10px' }} />}
        {file.students.length === 0 ? <p style={{ ...small, marginTop: '8px' }}>No students yet.</p> : (
          <div style={{ marginTop: '8px' }}>
            {shown.map((st) => {
              const a = avgOf(st);
              const out = !!st.scores.length && st.scores.length < needs;
              return (
                <button key={st.id} type="button" onClick={() => canEdit && setEdit(st)} disabled={!canEdit} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '10px', minHeight: '44px', padding: '6px 0', border: 'none', borderBottom: `1px solid ${colors.line}`, background: 'transparent', textAlign: 'left', cursor: canEdit ? 'pointer' : 'default', color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '15px' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}{st.track ? <span style={{ ...small, marginLeft: '8px' }}>{st.track}</span> : null}</span>
                    {whyHidden(st, file.settings) ? <span style={{ ...small, display: 'block', fontSize: '12px' }} data-testid="avg-why-hidden">Not on the screen: {whyHidden(st, file.settings)}</span> : null}
                  </span>
                  <span style={{ ...small, whiteSpace: 'nowrap' }}>{st.scores.length ? `${st.scores.length} ${st.scores.length === 1 ? 'test' : 'tests'}` : 'average only'}</span>
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
        <h4 style={{ ...h3, fontSize: '15px', margin: '16px 0 2px' }}>Page heading</h4>
        <Field label="Heading (Hebrew)" htmlFor="avg-title-he" hint="Shown large at the top, in the screen's Hebrew font."><input id="avg-title-he" key={`h-${s.titleHe}`} dir="rtl" defaultValue={s.titleHe} disabled={!canEdit} maxLength={80} onBlur={(e) => e.target.value.trim() !== s.titleHe && saveSettings({ titleHe: e.target.value.trim() }, 'Heading saved')} style={fieldStyle} /></Field>
        <Field label="Line under the heading" htmlFor="avg-subtitle" hint="Says what the numbers are. Every average also shows a % sign."><input id="avg-subtitle" key={`s-${s.subtitle}`} dir="auto" defaultValue={s.subtitle} disabled={!canEdit} maxLength={80} placeholder="Leave empty for none" onBlur={(e) => e.target.value.trim() !== s.subtitle && saveSettings({ subtitle: e.target.value.trim() }, 'Saved')} style={fieldStyle} /></Field>
        <Field label="Heading (English, optional)" htmlFor="avg-title"><input id="avg-title" key={`t-${s.title}`} defaultValue={s.title} disabled={!canEdit} maxLength={80} placeholder="Leave empty for Hebrew only" onBlur={(e) => e.target.value.trim() !== s.title && saveSettings({ title: e.target.value.trim() }, 'Heading saved')} style={fieldStyle} /></Field>

        <h4 style={{ ...h3, fontSize: '15px', margin: '16px 0 2px' }}>Who shows</h4>
        <SwitchRow on={s.minAverage > 0} onChange={() => saveSettings({ minAverage: s.minAverage > 0 ? 0 : 60 }, s.minAverage > 0 ? 'Everyone entered will show' : 'Minimum average on')} label="Only show students at or above a minimum average" note={s.minAverage > 0 ? 'Students below it stay saved but are not on the screen. They appear as soon as their average reaches it.' : 'Off: everyone you enter is on the screen, whatever their average.'} testId="avg-min-switch" />
        {s.minAverage > 0 && (
          <Field label="Minimum average"><NumberField value={s.minAverage} min={1} max={150} onCommit={(n) => saveSettings({ minAverage: n }, 'Saved')} ariaLabel="Minimum average" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
        )}
        <Field label="Tests needed to appear" hint="A student with test scores needs at least this many. An average typed in without tests always counts."><NumberField value={s.minTests} min={1} max={20} onCommit={(n) => saveSettings({ minTests: n }, 'Saved')} ariaLabel="Tests needed to appear" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>

        <h4 style={{ ...h3, fontSize: '15px', margin: '16px 0 2px' }}>The list</h4>
        <p style={{ ...small, margin: '2px 0 8px' }}>Everyone shown, highest average first, every name the same size. Names read down the first column, then the next.</p>
        <Field label="Columns (a portrait screen always uses 2)"><Choices ariaLabel="Columns" value={String(s.columns)} onChange={(v) => saveSettings({ columns: Number(v) }, 'Saved')} options={[{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]} /></Field>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Field label="Names per column" hint="Fewer = bigger names."><NumberField value={s.rowsPerColumn} min={4} max={12} onCommit={(n) => saveSettings({ rowsPerColumn: n }, 'Saved')} ariaLabel="Names per column" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          <Field label="Seconds per page" hint="Time to find your name."><NumberField value={s.seconds} min={6} max={40} onCommit={(n) => saveSettings({ seconds: n }, 'Saved')} ariaLabel="Seconds per page" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
        </div>
        <Field label="Pace" hint="Scales how long every page stays up."><Choices ariaLabel="Pace" value={s.pace} onChange={(v) => saveSettings({ pace: v }, 'Saved')} options={[{ value: 'calm', label: 'Calm' }, { value: 'normal', label: 'Normal' }, { value: 'quick', label: 'Quick' }]} /></Field>
        <SwitchRow on={s.flipNames} onChange={() => saveSettings({ flipNames: !s.flipNames }, 'Saved')} label="Show &quot;Last, First&quot; names as &quot;First Last&quot;" note="Only for names with one comma, like the ones in your sheet." />
        <SwitchRow on={s.showRank} onChange={() => saveSettings({ showRank: !s.showRank }, 'Saved')} label="Show each student's position number" />
        <SwitchRow on={s.showMarks} onChange={() => saveSettings({ showMarks: !s.showMarks }, 'Saved')} label="Show each average" note="Off shows only the names, in order." />
        <SwitchRow on={s.showGrade} onChange={() => saveSettings({ showGrade: !s.showGrade }, 'Saved')} label="Show the grade next to the name" note="Off by default: a screen for the whole yeshiva does not need a grade by each name." />
        <SwitchRow on={s.showTests} onChange={() => saveSettings({ showTests: !s.showTests }, 'Saved')} label="Show how many tests each student took" />
        <SwitchRow on={s.showAvatars} onChange={() => saveSettings({ showAvatars: !s.showAvatars }, 'Saved')} label="Round initials beside each name" />
        <SwitchRow on={s.zeroIsAbsent} onChange={() => saveSettings({ zeroIsAbsent: !s.zeroIsAbsent }, 'Saved')} label="Leave out zeros (a 0 means the student did not take the test)" note="Off (recommended): a 0 is a real mark and lowers the average. On: zeros are left out like empty cells. An empty cell is never counted either way." testId="avg-zero-switch" />
        <Field label="Decimals"><Choices ariaLabel="Decimals" value={String(s.decimals)} onChange={(v) => saveSettings({ decimals: Number(v) }, 'Saved')} options={[{ value: '1', label: '94.5' }, { value: '0', label: '95' }]} /></Field>

        <h4 style={{ ...h3, fontSize: '15px', margin: '16px 0 2px' }}>Look and motion</h4>
        <Field label="Change between pages" hint="Mix plays a different one each time.">
          <Choices ariaLabel="Transition" value={s.transition} onChange={(v) => saveSettings({ transition: v }, 'Saved')} options={TRANSITION_LABELS.map(([value, label]) => ({ value, label }))} />
        </Field>

        <SwitchRow on={s.showOnLive} onChange={() => saveSettings({ showOnLive: !s.showOnLive }, s.showOnLive ? 'Not shown on the live link' : 'Shown on the live link')} label="Also show on the live link" note={s.showOnLive ? 'On: anyone you gave the live word or link to can see the student names and averages that are on the screen. Students below the minimum are never sent.' : 'Off: the live link does not show the Test Averages. Turn on only if everyone with the live word may see student names and marks.'} testId="avg-live-switch" />
        <PrizeLevels levels={s.prizes} note={s.prizeNote} canEdit={canEdit} onSave={(prizes, prizeNote) => saveSettings({ prizes, prizeNote }, 'Prize levels saved')} />

        <h4 style={{ ...h3, fontSize: '15px', margin: '16px 0 2px' }}>Extra pages (all off until you turn them on)</h4>
        <SwitchRow on={s.showTop3} onChange={() => saveSettings({ showTop3: !s.showTop3 }, 'Saved')} label="Top 3 get their own pages" note="3rd, 2nd, then the leader, each on their own, then all three on a podium. Plays before the list." />
        {s.showTop3 && (
          <>
            <Field label="Top 3 style"><Choices ariaLabel="Top 3 style" value={s.spotlight} onChange={(v) => saveSettings({ spotlight: v }, 'Saved')} options={[{ value: 'each', label: 'Each one in turn, then the podium' }, { value: 'podium', label: 'The podium only' }]} /></Field>
            <SwitchRow on={s.sparkles} onChange={() => saveSettings({ sparkles: !s.sparkles }, 'Saved')} label="Sparkles for the leader" />
          </>
        )}
        <SwitchRow on={s.showImproved} onChange={() => saveSettings({ showImproved: !s.showImproved }, 'Saved')} label="Most improved page" note="Needs 3 or more tests. Only shows students who climbed 2 points or more." />
        <SwitchRow on={s.byTrack} onChange={() => saveSettings({ byTrack: !s.byTrack }, 'Saved')} label="A page for each track" note={file.tracks?.length >= 2 ? `Tracks found: ${file.tracks.join(', ')}.` : 'Needs two or more tracks (the Track column).'} />
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
