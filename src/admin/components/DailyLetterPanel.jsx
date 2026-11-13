/**
 * Admin → Daily Letter. A letter of the Rebbe for the DAILY_LETTER slide, one a day, typed out on a sheet of letterhead.
 * Same idea and same rules as Daily Story (src/shared/dailyStories.js, one list of its own: data/daily-letters.json via
 * /api/daily-letters, capability `dailyWord.edit`):
 *   - Today: what shows now (change it, write one just for today, hide it),
 *   - Plan ahead: the next 4 weeks, pick a letter for any day (it is pinned) or leave a day on automatic,
 *   - All letters: show/hide, edit, delete, add one (paste the whole letter) or many (a chat assistant formats them),
 *   - Archive: what already showed, show it again on a date.
 * The slide's seconds are Automatic by default: as long as the letter takes to type and read.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { apiFetch } from '../hooks/useAdminState.js';
import { ToggleSwitch, ConfirmDialog } from './ui.jsx';
import DailyTodayCard from './DailyTodayCard.jsx';
import Sheet from './ui/Sheet.jsx';
import LetterEditor from './letters/LetterEditor.jsx';
import { useSnackbar, useCopy } from './schedule/scheduleShared.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { pickDailyStory, normalizeStory, upcomingStories, archiveRows, pinStory, DAILY_LETTER_PROMPT, LIMITS } from '../../shared/dailyStories.js';
import { NEW_LETTER_LOOK } from '../../shared/letterhead.js';
import { parseLetter } from '../../shared/letterParse.js';
import { toISODate } from '../../shared/scheduleResolution.js';

const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '18px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const small = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim };
const preview = (t, n = 120) => { const s = String(t || '').replace(/\s+/g, ' '); return s.length > n ? `${s.slice(0, n).trim()}…` : s; };
const dayName = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
const blankEntry = () => ({ kind: 'letter', title: '', letter: {}, paper: { ...NEW_LETTER_LOOK }, style: null, showOn: '', enabled: true });

/** One letter in a sheet: paste the whole letter (fills the fields), the editor, an optional date. */
function LetterForm({ initial, settings, onSave, onCancel, busy }) {
  const [s, setS] = useState(() => ({ ...blankEntry(), ...initial, letter: { ...(initial?.letter || {}) }, showOn: initial?.showOn || '' }));
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState('');
  const check = normalizeStory({ ...s, kind: 'letter' });
  const body = String(s.letter?.body || '');
  const fill = () => {
    const r = parseLetter(paste);
    if (!r.body) { setNote('Nothing to fill. Paste the whole letter first.'); return; }
    const { found, body: b, ...rest } = r; void found;
    setS((p) => ({ ...p, letter: { ...p.letter, ...rest, body: b }, title: p.title }));
    setPaste('');
    setNote(`Filled in: ${[r.date || r.dateHe ? 'date' : '', r.to ? 'sent to' : '', r.salutation ? 'greeting' : '', 'text', r.signature ? 'closing' : '', r.source || r.sourceHe ? 'source' : ''].filter(Boolean).join(', ')}. Check the fields below.`);
  };
  return (
    <div data-testid="letter-form">
      <div style={{ ...card, background: 'transparent', marginBottom: '12px' }}>
        <label style={label}>Paste the whole letter here (the date, who it was sent to, greeting, text and closing are picked out for you)
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder="Paste a letter, then press Fill in the fields" style={{ ...inputStyle, resize: 'vertical', fontSize: '14px', lineHeight: 1.4 }} aria-label="Paste the whole letter" />
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={{ ...buttonSecondary, minHeight: '40px' }} onClick={fill} disabled={!paste.trim()}>Fill in the fields</button>
          {note && <span style={small}>{note}</span>}
        </div>
      </div>
      <LetterEditor value={s} onChange={(n) => setS((p) => ({ ...p, ...n }))} settings={settings} />
      <label style={{ ...label, margin: '10px 0', maxWidth: '260px' }}>Show on this date (optional: leave empty and the system picks the day)
        <input type="date" value={s.showOn} onChange={(e) => setS((p) => ({ ...p, showOn: e.target.value }))} style={inputStyle} />
      </label>
      <div style={{ ...small, color: body.length > LIMITS.letterBody ? colors.danger : colors.dim, textAlign: 'right' }}>{body.length.toLocaleString()} / {LIMITS.letterBody.toLocaleString()} characters</div>
      {check.error && (body.trim() || s.title) && <div style={{ ...small, color: colors.danger, margin: '6px 0' }}>{check.error}</div>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button style={{ ...buttonPrimary, minHeight: '44px', opacity: check.error || busy ? 0.5 : 1 }} disabled={!!check.error || busy}
          onClick={() => onSave({ ...check.story, id: initial?.id || check.story.id, enabled: initial ? initial.enabled !== false : true })}>Save letter</button>
        <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function DailyLetterPanel({ settings = {}, slides = [], onUpdateSlides, canEditSlides = false }) {
  const isMobile = useIsMobile();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // an entry | 'new' | null (opens the sheet)
  const [confirmDel, setConfirmDel] = useState(null);
  const [view, setView] = useState('upcoming');
  const [showAgain, setShowAgain] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [importInfo, setImportInfo] = useState(null);
  const [promptN, setPromptN] = useState(5);
  const todayStr = file?.today || toISODate(new Date());
  const { show, node: snack } = useSnackbar();
  const { copy, modal } = useCopy(show);

  const load = useCallback(async () => {
    try { setFile(await apiFetch('/api/daily-letters')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (next, okMsg) => {
    setBusy(true);
    try { setFile(await apiFetch('/api/daily-letters', { method: 'PUT', body: JSON.stringify((({ history, ...rest }) => rest)(next)) })); if (okMsg) show(okMsg); return true; }
    catch (e) { show(e.message, 'error'); return false; }
    finally { setBusy(false); }
  };

  const letters = file?.stories || [];
  const today = useMemo(() => pickDailyStory(file, todayStr), [file, todayStr]);
  const upcoming = useMemo(() => (file ? upcomingStories(file, todayStr, 28) : []), [file, todayStr]);
  const archive = useMemo(() => (file ? archiveRows(file) : []), [file]);
  const slide = slides.find((x) => x.type === 'DAILY_LETTER');
  const prompt = DAILY_LETTER_PROMPT.replace('{N}', String(promptN)).replace('{EXISTING}', letters.map((x) => x.title).filter(Boolean).join('; ') || 'none yet');

  const runImport = async (dryRun) => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/daily-letters/import', { method: 'POST', body: JSON.stringify({ text: pasteText, mode: 'append', dryRun }) });
      setImportInfo(r);
      if (!dryRun) { setFile(r.file); setPasteText(''); show(`Added ${r.added} letter${r.added === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} already on the list` : ''}.`); }
    } catch (e) { setImportInfo({ error: e.message }); } finally { setBusy(false); }
  };

  const saveEntry = async (entry) => {
    const exists = letters.some((x) => x.id === entry.id);
    const next = exists ? letters.map((x) => (x.id === entry.id ? entry : x)) : [...letters, entry];
    if (await save({ ...file, stories: next }, exists ? 'Letter saved.' : 'Letter added.')) setEditing(null);
  };

  if (error && !file) return <div style={{ ...small, color: colors.danger }}>{error} <button style={buttonSecondary} onClick={load}>Retry</button></div>;
  if (!file) return <div style={small}>Loading…</div>;

  const row = { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: `1px solid ${colors.muted}`, flexWrap: isMobile ? 'wrap' : 'nowrap' };
  const summary = (s, extra) => (
    <div style={{ flex: 1, minWidth: '170px' }}>
      <div style={{ ...small, color: colors.text, fontSize: '14px', fontWeight: 600 }}>{s?.title || 'Untitled letter'}{extra}</div>
      <div style={{ ...small, marginTop: '2px' }}>{preview(s?.text, 110)}</div>
    </div>
  );
  const enabledCount = letters.filter((x) => x.enabled !== false).length;

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' }}>Daily Letter</h2>
      <p style={{ ...small, margin: '0 0 12px' }}>A letter of the Rebbe, typed out on a sheet of letterhead, one a day. Add them any time, set a date for any letter to plan weeks ahead, or leave it and the system picks a day. {enabledCount} on the list.</p>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 600, color: colors.text }}>Show the Daily Letter in the slideshow</div>
          <div style={small}>It stays up exactly as long as the letter takes to type and read (Automatic). A day with no letter is skipped.</div>
        </div>
        {slide && canEditSlides
          ? <ToggleSwitch on={!!slide.enabled} label="Show the Daily Letter in the slideshow" onChange={() => onUpdateSlides?.(slides.map((x) => (x.type === 'DAILY_LETTER' ? { ...x, enabled: !x.enabled } : x)))} />
          : <span style={small}>{slide ? (slide.enabled ? 'On' : 'Off') : 'Appears in Slides after a restart'}</span>}
      </div>

      <div style={card}>
        <h3 style={h3}>Today's letter</h3>
        <DailyTodayCard
          noun="letter" endpoint="/api/daily-letters" items={letters} entry={today} manual={!!file.history?.[todayStr]?.manual}
          busy={busy} setBusy={setBusy} onFile={setFile} show={show}
          describe={(t) => (<div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '20px', color: colors.text, fontWeight: 600 }}>{t.title || 'Letter'}</div>
            <div style={{ ...small, fontSize: '14px', marginTop: '4px', lineHeight: 1.45 }}>{preview(t.text, 260)}</div>
          </div>)}
          chooseLabel={(x) => x.title || preview(x.text, 50)}
          chooseSearch={(x) => [x.title, x.text, x.source].join(' ')}
          renderOneOff={({ onSave, onCancel, busy: b }) => <LetterForm initial={null} settings={settings} busy={b} onSave={onSave} onCancel={onCancel} />}
          renderEdit={({ entry, onClose }) => <LetterForm initial={entry} settings={settings} busy={busy} onCancel={onClose}
            onSave={async (x) => { if (await save({ ...file, stories: letters.map((y) => (y.id === x.id ? x : y)) }, 'Letter saved.')) onClose(); }} />}
        >
          <label style={{ ...label, marginTop: '12px', maxWidth: '420px' }}>When there is no date set
            <select value={file.order} disabled={busy} onChange={(e) => save({ ...file, order: e.target.value }, 'Order saved.')} style={inputStyle}>
              <option value="shuffle">Shuffled (no repeats until every letter was shown)</option>
              <option value="sequential">In list order, one a day</option>
            </select>
          </label>
        </DailyTodayCard>
      </div>

      <div style={{ display: 'flex', gap: '8px', margin: '0 0 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={{ ...buttonPrimary, minHeight: '44px' }} onClick={() => setEditing('new')} data-testid="add-letter">+ Add a letter</button>
        {[['upcoming', 'Plan ahead'], ['all', `All letters (${letters.length})`], ['archive', `Archive (${archive.length})`], ['many', 'Add many with Claude']].map(([key, text]) => (
          <button key={key} onClick={() => setView(key)}
            style={{ ...buttonSecondary, minHeight: '40px', background: view === key ? colors.goldBg : 'transparent', border: `1px solid ${view === key ? colors.gold : colors.muted}`, color: view === key ? colors.gold : colors.dim }}>{text}</button>
        ))}
      </div>

      {view === 'upcoming' && (
        <div style={card}>
          <h3 style={h3}>The next four weeks</h3>
          <p style={{ ...small, margin: '0 0 8px' }}>This is what will show each day. Pick a letter for a day to pin it there, or leave a day on Automatic.</p>
          {letters.length === 0 && <div style={small}>No letters yet. Press + Add a letter.</div>}
          {upcoming.map((u) => (
            <div key={u.date} style={row}>
              <div style={{ width: '92px', ...small, color: u.date === todayStr ? colors.gold : colors.dim }}>{u.date === todayStr ? 'Today' : dayName(u.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
              {summary(u.story, u.pinned && <span style={{ color: colors.gold }}> · pinned</span>)}
              {u.date !== todayStr && (
                <select aria-label={`Letter for ${u.date}`} value={u.pinned ? u.story.id : ''} disabled={busy} style={{ ...inputStyle, minHeight: '36px', width: 'auto', maxWidth: '220px' }}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) { save({ ...file, stories: letters.map((x) => (x.showOn === u.date ? (({ showOn, ...rest }) => rest)(x) : x)) }, 'Back to automatic.'); return; }
                    save(pinStory(file, id, u.date), 'Pinned.');
                  }}>
                  <option value="">Automatic</option>
                  {letters.filter((x) => x.enabled !== false).map((x) => <option key={x.id} value={x.id}>{x.title || preview(x.text, 30)}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'all' && (
        <div style={card}>
          <h3 style={h3}>All letters</h3>
          {letters.length === 0 && <div style={small}>Nothing yet.</div>}
          {letters.map((x) => (
            <div key={x.id} style={row}>
              <ToggleSwitch on={x.enabled !== false} label={`Show ${x.title || 'this letter'}`} onChange={(on) => save({ ...file, stories: letters.map((y) => (y.id === x.id ? { ...y, enabled: on } : y)) })} />
              {summary(x, x.showOn ? <span style={{ color: colors.gold }}> · {dayName(x.showOn, { month: 'short', day: 'numeric' })}</span> : null)}
              <button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={() => setEditing(x)}>Edit</button>
              <button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={() => setConfirmDel(x)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {view === 'archive' && (
        <div style={card}>
          <h3 style={h3}>Archive: letters already shown</h3>
          {archive.length === 0 && <div style={small}>Nothing yet. Each day's letter is saved here once it has been on the screen.</div>}
          {archive.map((r) => (
            <div key={r.date} style={row}>
              <div style={{ width: '92px', ...small }}>{dayName(r.date, { month: 'short', day: 'numeric' })}</div>
              {summary(r.story)}
              {r.live && (showAgain?.id === r.live.id
                ? <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="date" value={showAgain.date || ''} min={todayStr} onChange={(e) => setShowAgain({ ...showAgain, date: e.target.value })} style={{ ...inputStyle, width: 'auto' }} />
                  <button style={{ ...buttonPrimary, minHeight: '38px' }} disabled={busy || !showAgain.date} onClick={async () => { if (await save(pinStory(file, r.live.id, showAgain.date), 'Pinned.')) setShowAgain(null); }}>Pin</button>
                </span>
                : <button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={() => setShowAgain({ id: r.live.id, date: '' })}>Show again on…</button>)}
            </div>
          ))}
        </div>
      )}

      {view === 'many' && (
        <div style={card}>
          <h3 style={h3}>Add many letters with Claude</h3>
          <p style={{ ...small, margin: '0 0 10px' }}>1) Copy the request below and paste it into Claude (or any chat assistant), then paste the letters under it (for example from the English Rebbe responsa site). 2) Paste its answer here. 3) Preview, then add. It copies the letters exactly: it must not write or shorten them.</p>
          <label style={{ ...label, maxWidth: '180px' }}>How many letters will you paste?
            <input type="number" min={1} max={30} value={promptN} onChange={(e) => setPromptN(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} style={inputStyle} />
          </label>
          <div style={{ margin: '10px 0' }}><button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={() => copy(prompt, 'Request copied')}>Copy the request for Claude</button></div>
          <label style={label}>Paste Claude's answer
            <textarea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setImportInfo(null); }} rows={7} style={{ ...inputStyle, resize: 'vertical', fontSize: '13px' }} aria-label="Claude's answer" />
          </label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button style={buttonSecondary} disabled={busy || !pasteText.trim()} onClick={() => runImport(true)}>Preview</button>
            <button style={{ ...buttonPrimary, minHeight: '40px' }} disabled={busy || !pasteText.trim() || !importInfo?.added} onClick={() => runImport(false)}>Add {importInfo?.dryRun ? importInfo.added : ''} letter{importInfo?.added === 1 ? '' : 's'}</button>
          </div>
          {importInfo?.error && <div style={{ ...small, color: colors.danger, marginTop: '8px' }}>{importInfo.error}</div>}
          {importInfo?.dryRun && <div style={{ ...small, marginTop: '8px' }}>{importInfo.added} new{importInfo.skipped ? `, ${importInfo.skipped} already on the list` : ''}{importInfo.invalid?.length ? `, ${importInfo.invalid.length} could not be read: ${importInfo.invalid[0].error}` : ''}.</div>}
        </div>
      )}

      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a letter' : 'Edit letter'} label="Letter" zIndex={1300} maxWidth={820}>
          <LetterForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} settings={settings} busy={busy} onCancel={() => setEditing(null)} onSave={saveEntry} />
        </Sheet>
      )}
      {confirmDel && (
        <ConfirmDialog title="Delete this letter?" message={`${confirmDel.title || 'This letter'} will be removed from the list.`}
          onConfirm={async () => { const x = confirmDel; setConfirmDel(null); await save({ ...file, stories: letters.filter((y) => y.id !== x.id) }, 'Letter deleted.'); }} onCancel={() => setConfirmDel(null)} />
      )}
      {snack}{modal}
    </div>
  );
}
