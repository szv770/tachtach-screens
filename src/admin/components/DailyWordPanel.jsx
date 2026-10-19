/**
 * Admin → Daily Word. The word-of-the-day list for the DAILY_WORD slide:
 *   - which word shows on any date (preview), and rotation order,
 *   - the list (enable / pin to a date / edit / delete),
 *   - add one word by hand, or paste a batch a chat assistant wrote
 *     (copy the prompt, paste the JSON back: preview, then add).
 * Data lives in data/daily-words.json via /api/daily-words; the kiosk picks the
 * word with the shared pure rules in src/shared/dailyWords.js.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import { apiFetch } from '../hooks/useAdminState.js';
import { ToggleSwitch, ConfirmDialog } from './ui.jsx';
import { useSnackbar, useCopy } from './schedule/scheduleShared.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { pickDailyWord, normalizeWord, upcomingWords, archiveRows, pinWord, addDaysISO, DAILY_WORD_PROMPT, LIMITS } from '../../shared/dailyWords.js';
import { toISODate } from '../../shared/scheduleResolution.js';

const POS = ['', 'noun', 'verb', 'adjective', 'adverb', 'interjection', 'phrase'];
const blank = () => ({ language: 'Yiddish', word: '', transliteration: '', pronunciation: '', partOfSpeech: '', meaning: '', context: '', convo: [{ text: '' }, { text: '' }], tags: [], showOn: '', enabled: true });

const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '18px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const small = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };

function WordForm({ initial, onSave, onCancel, busy }) {
  const [w, setW] = useState(() => ({ ...blank(), ...initial, convo: [0, 1].map((i) => ({ text: initial?.convo?.[i]?.text || '' })), showOn: initial?.showOn || '' }));
  const rootRef = useRef(null);
  // Opened from anywhere in a long list: bring the form into view.
  useEffect(() => { rootRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, []);
  const set = (k, v) => setW((p) => ({ ...p, [k]: v }));
  const setLine = (i, text) => setW((p) => ({ ...p, convo: p.convo.map((l, j) => (j === i ? { text } : l)) }));
  const check = normalizeWord({ ...w, convo: w.convo.filter((l) => l.text.trim()) });
  const field = (k, text, props = {}) => (
    <label style={label}>{text}
      <input value={w[k]} onChange={(e) => set(k, e.target.value)} style={{ ...inputStyle, ...props.style }} maxLength={LIMITS[k]} dir={props.dir} placeholder={props.placeholder} />
    </label>
  );
  return (
    <div ref={rootRef} style={{ ...card, borderColor: colors.gold, margin: '10px 0' }}>
      <h3 style={h3}>{initial?.id ? 'Edit word' : 'Add a word'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
        {field('word', 'Word in Hebrew letters', { dir: 'rtl', style: { fontSize: '20px', fontFamily: adminFonts.hebrewPrimary }, placeholder: 'נחת' })}
        {field('transliteration', 'In English letters', { placeholder: 'nachas' })}
        {field('pronunciation', 'How to say it (stressed part in CAPS)', { placeholder: 'NAH-chas' })}
        <label style={label}>Part of speech
          <select value={w.partOfSpeech} onChange={(e) => set('partOfSpeech', e.target.value)} style={inputStyle}>
            {POS.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
          </select>
        </label>
        {field('language', 'Language')}
        <label style={label}>Show on this date (optional)
          <input type="date" value={w.showOn} onChange={(e) => set('showOn', e.target.value)} style={inputStyle} />
        </label>
      </div>
      <label style={{ ...label, marginTop: '10px' }}>What it means
        <input value={w.meaning} onChange={(e) => set('meaning', e.target.value)} style={inputStyle} maxLength={LIMITS.meaning} placeholder="Quiet pride and joy, especially from children or students." />
      </label>
      <label style={{ ...label, marginTop: '10px' }}>Where it comes from / how it feels (optional)
        <textarea value={w.context} onChange={(e) => set('context', e.target.value)} style={{ ...inputStyle, minHeight: '56px', resize: 'vertical' }} maxLength={LIMITS.context} />
      </label>
      <div style={{ ...small, margin: '10px 0 4px' }}>Using it in conversation. Put the word in *asterisks* to highlight it.</div>
      {[0, 1].map((i) => (
        <input key={i} value={w.convo[i].text} onChange={(e) => setLine(i, e.target.value)} style={{ ...inputStyle, marginBottom: '6px' }} maxLength={LIMITS.convoLine}
          placeholder={i === 0 ? 'How was your son’s bar mitzvah?' : 'We’re *shepping* so much *nachas*.'} />
      ))}
      {check.error && (w.word || w.transliteration || w.meaning) && <div style={{ ...small, color: colors.danger, marginTop: '6px' }}>{check.error}</div>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button style={{ ...buttonPrimary, minHeight: '40px', opacity: check.error || busy ? 0.5 : 1 }} disabled={!!check.error || busy}
          onClick={() => onSave({ ...check.word, id: initial?.id || check.word.id, enabled: initial ? initial.enabled !== false : true })}>Save</button>
        <button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function DailyWordPanel() {
  const isMobile = useIsMobile();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // word | 'new' | null
  const [editDate, setEditDate] = useState(null); // 'Coming up' row the edit form is open under (null = the list)
  const [confirmDel, setConfirmDel] = useState(null);
  const [filter, setFilter] = useState('');
  const todayStr = toISODate(new Date());
  const [view, setView] = useState('upcoming'); // 'upcoming' | 'archive' | 'all'
  const [showAgain, setShowAgain] = useState(null); // { id, date } while choosing a day for an archived word
  const [pasteText, setPasteText] = useState('');
  const [importInfo, setImportInfo] = useState(null);
  const [promptN, setPromptN] = useState(20);
  const { show, node: snack } = useSnackbar();
  const { copy, modal } = useCopy(show);

  const load = useCallback(async () => {
    try { setFile(await apiFetch('/api/daily-words')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (next, okMsg) => {
    setBusy(true);
    try { setFile(await apiFetch('/api/daily-words', { method: 'PUT', body: JSON.stringify(next) })); if (okMsg) show(okMsg); return true; }
    catch (e) { show(e.message, 'error'); return false; }
    finally { setBusy(false); }
  };

  const words = file?.words || [];
  const today = useMemo(() => pickDailyWord(file, todayStr), [file, todayStr]);
  const upcoming = useMemo(() => (file ? upcomingWords(file, todayStr, 14) : []), [file, todayStr]);
  const archive = useMemo(() => (file ? archiveRows(file) : []), [file]);
  const lastShown = useMemo(() => { const m = {}; (file ? archiveRows(file) : []).forEach((r) => { if (r.entry.id && !m[r.entry.id]) m[r.entry.id] = r.date; }); return m; }, [file]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return words.map((w, i) => ({ w, i })).filter(({ w }) => !q || [w.word, w.transliteration, w.meaning, ...(w.tags || [])].join(' ').toLowerCase().includes(q));
  }, [words, filter]);

  const move = (i, d) => { const j = i + d; if (j < 0 || j >= words.length) return; const a = [...words]; [a[i], a[j]] = [a[j], a[i]]; save({ ...file, words: a }); };

  const prompt = DAILY_WORD_PROMPT.replace('{N}', String(promptN)).replace('{LANGUAGE}', 'Yiddish')
    .replace('{EXISTING}', words.map((w) => w.transliteration || w.word).join(', ') || 'none yet');

  const runImport = async (dryRun) => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/daily-words/import', { method: 'POST', body: JSON.stringify({ text: pasteText, mode: 'append', dryRun }) });
      setImportInfo(r);
      if (!dryRun) { setFile(r.file); setPasteText(''); show(`Added ${r.added} word${r.added === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} already on the list` : ''}.`); }
    } catch (e) { setImportInfo({ error: e.message }); } finally { setBusy(false); }
  };

  const renderForm = (initial) => (
    <WordForm
      key={initial ? initial.id : 'new'}
      initial={initial}
      busy={busy}
      onCancel={() => { setEditing(null); setEditDate(null); }}
      onSave={async (w) => {
        const exists = words.some((x) => x.id === w.id);
        const next = exists ? words.map((x) => (x.id === w.id ? w : x)) : [...words, w];
        if (await save({ ...file, words: next }, exists ? 'Word saved.' : 'Word added.')) { setEditing(null); setEditDate(null); }
      }}
    />
  );

  if (error && !file) return <div style={{ ...small, color: colors.danger }}>{error} <button style={buttonSecondary} onClick={load}>Retry</button></div>;
  if (!file) return <div style={small}>Loading…</div>;

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' }}>Daily Word</h2>
      <p style={{ ...small, margin: '0 0 16px' }}>A new word every day for the Daily Word slide (switch that slide on in Slides). {words.filter((w) => w.enabled !== false).length} words on the list.</p>

      <div style={card}>
        <h3 style={h3}>Showing today</h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' }}>
          {today ? (
            <>
              <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '34px', color: colors.text }}>{today.word}</span>
              <span style={{ ...small, fontSize: '15px', color: colors.text }}>{today.transliteration} · {today.pronunciation}</span>
              <span style={small}>{today.meaning}</span>
            </>
          ) : <span style={small}>No words are enabled yet.</span>}
        </div>
        <label style={{ ...label, marginTop: '12px', maxWidth: '420px' }}>Order
          <select value={file.order} disabled={busy} onChange={(e) => save({ ...file, order: e.target.value }, 'Order saved.')} style={inputStyle}>
            <option value="sequential">In list order, one a day</option>
            <option value="shuffle">Shuffled (no repeats until every word was shown)</option>
          </select>
        </label>
        <div style={{ ...small, marginTop: '8px' }}>A word moves to the Archive the day it is shown, and comes around again once the whole list has been shown.</div>
      </div>

      <div style={{ display: 'flex', gap: '6px', margin: '0 0 14px', flexWrap: 'wrap' }} role="tablist">
        {[['upcoming', 'Coming up'], ['archive', `Archive (${archive.length})`], ['all', `All words (${words.length})`]].map(([key, text]) => (
          <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
            style={{ ...buttonSecondary, minHeight: '38px', background: view === key ? colors.goldBg : 'transparent', border: `1px solid ${view === key ? colors.gold : colors.muted}`, color: view === key ? colors.gold : colors.dim }}>
            {text}
          </button>
        ))}
      </div>

      {view === 'upcoming' && (
        <div style={card}>
          <h3 style={h3}>The next two weeks</h3>
          <p style={{ ...small, margin: '0 0 8px' }}>This is what will show each day. Pick a different word for any day and it is pinned there.</p>
          {upcoming.map((u, i) => {
            // Edit the word on the list (by id): a pinned or ordered word, or one the history snapshot points to.
            const liveWord = u.word?.id ? words.find((w) => w.id === u.word.id) : null;
            return (
            <React.Fragment key={u.date}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.muted}`, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <span style={{ ...small, minWidth: '96px', color: i === 0 ? colors.gold : colors.dim }}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${u.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '24px', minWidth: '110px', color: colors.text }}>{u.word?.word}</span>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <div style={{ ...small, color: colors.text, fontSize: '14px' }}>{u.word?.transliteration} <span style={{ color: colors.dim }}>· {u.word?.pronunciation}</span>{u.pinned && <span style={{ color: colors.gold }}> · pinned</span>}</div>
                <div style={small}>{u.word?.meaning}</div>
              </div>
              {liveWord && (
                <button type="button" style={{ ...buttonSecondary, minHeight: '44px', minWidth: '44px', padding: '0 10px' }} disabled={busy}
                  aria-label={`Edit the word for ${u.date}`} title="Edit this word" data-testid={`dw-edit-${u.date}`}
                  onClick={() => { setEditing(liveWord); setEditDate(u.date); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
                </button>
              )}
              {u.locked
                ? <span style={{ ...small, whiteSpace: 'nowrap' }}>{i === 0 ? 'on screen now' : 'locked'}</span>
                : (
                  <select aria-label={`Word for ${u.date}`} value={u.pinned ? u.word.id : ''} disabled={busy} style={{ ...inputStyle, minHeight: '34px', width: 'auto', maxWidth: '190px' }}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) { save({ ...file, words: words.map((w) => (w.showOn === u.date ? (({ showOn, ...rest }) => rest)(w) : w)) }, 'Back to automatic.'); return; }
                      save(pinWord(file, id, u.date), 'Pinned.');
                    }}>
                    <option value="">Automatic</option>
                    {words.filter((w) => w.enabled !== false).map((w) => <option key={w.id} value={w.id}>{w.transliteration || w.word}</option>)}
                  </select>
                )}
            </div>
            {editDate === u.date && editing && editing !== 'new' && renderForm(editing)}
            </React.Fragment>
            );
          })}
        </div>
      )}

      {view === 'archive' && (
        <div style={card}>
          <h3 style={h3}>Archive: words already shown</h3>
          {archive.length === 0 && <div style={small}>Nothing yet. Each day's word is saved here once it has been on the screen.</div>}
          {archive.map((r) => (
            <div key={r.date} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.muted}`, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <span style={{ ...small, minWidth: '110px' }}>{new Date(`${r.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '24px', minWidth: '110px', color: colors.text }}>{r.entry.word}</span>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <div style={{ ...small, color: colors.text, fontSize: '14px' }}>{r.entry.transliteration} <span style={{ color: colors.dim }}>· {r.entry.pronunciation}</span></div>
                <div style={small}>{r.entry.meaning}</div>
              </div>
              {showAgain && showAgain.key === r.date ? (
                <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="date" min={addDaysISO(todayStr, 1)} value={showAgain.date} onChange={(e) => setShowAgain({ ...showAgain, date: e.target.value })} style={{ ...inputStyle, minHeight: '34px', width: 'auto' }} />
                  <button style={{ ...buttonPrimary, minHeight: '34px' }} disabled={busy || !showAgain.date} onClick={async () => { if (await save(pinWord(file, r.live.id, showAgain.date), 'Pinned. It will show again that day.')) setShowAgain(null); }}>Pin</button>
                  <button style={{ ...buttonSecondary, minHeight: '34px' }} onClick={() => setShowAgain(null)}>Cancel</button>
                </span>
              ) : r.live
                ? <button style={{ ...buttonSecondary, minHeight: '32px' }} onClick={() => setShowAgain({ key: r.date, date: addDaysISO(todayStr, 1) })}>Show again…</button>
                : <span style={small} title="This word was deleted from the list">removed from list</span>}
            </div>
          ))}
        </div>
      )}

      {view === 'all' && (
        <>
      <div style={card}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ ...h3, margin: 0, flex: 1 }}>The list</h3>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" style={{ ...inputStyle, maxWidth: '200px' }} />
          <button style={{ ...buttonPrimary, minHeight: '38px' }} onClick={() => { setEditing('new'); setEditDate(null); }}>+ Add a word</button>
        </div>
        {editing === 'new' && renderForm(null)}
        {shown.length === 0 && <div style={small}>Nothing matches.</div>}
        {shown.map(({ w, i }) => (editing && editing !== 'new' && !editDate && editing.id === w.id ? <React.Fragment key={w.id}>{renderForm(editing)}</React.Fragment> : (
          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.muted}`, opacity: w.enabled === false ? 0.5 : 1, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <ToggleSwitch on={w.enabled !== false} label={`Show ${w.transliteration || w.word}`} onChange={(on) => save({ ...file, words: words.map((x) => (x.id === w.id ? { ...x, enabled: on } : x)) })} />
            <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '24px', minWidth: '110px', color: colors.text }}>{w.word}</span>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ ...small, color: colors.text, fontSize: '14px' }}>{w.transliteration} <span style={{ color: colors.dim }}>· {w.pronunciation}</span>{w.showOn && <span style={{ color: colors.gold }}> · pinned {w.showOn}</span>}{lastShown[w.id] && <span style={{ color: colors.dim }}> · last shown {lastShown[w.id]}</span>}</div>
              <div style={small}>{w.meaning}</div>
            </div>
            <button style={{ ...buttonSecondary, minHeight: '32px', padding: '2px 8px' }} onClick={() => move(i, -1)} disabled={busy || i === 0} title="Earlier in the order" aria-label="Move up">↑</button>
            <button style={{ ...buttonSecondary, minHeight: '32px', padding: '2px 8px' }} onClick={() => move(i, 1)} disabled={busy || i === words.length - 1} title="Later in the order" aria-label="Move down">↓</button>
            <button style={{ ...buttonSecondary, minHeight: '32px' }} onClick={() => { setEditing(w); setEditDate(null); }}>Edit</button>
            <button style={{ ...buttonDanger, minHeight: '32px' }} onClick={() => setConfirmDel(w)}>Delete</button>
          </div>
        )))}
      </div>

      <div style={card}>
        <h3 style={h3}>Add lots of words with Claude</h3>
        <p style={{ ...small, margin: '0 0 10px' }}>1) Copy the request below into Claude (or any chat assistant). 2) Paste its answer here. 3) Preview, then add. Words already on the list are skipped. Please look the new words over before relying on them.</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
          <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>How many words
            <input type="number" min={1} max={60} value={promptN} onChange={(e) => setPromptN(Math.max(1, Math.min(60, Number(e.target.value) || 20)))} style={{ ...inputStyle, width: '80px' }} />
          </label>
          <button style={{ ...buttonSecondary, minHeight: '38px' }} onClick={() => copy(prompt, 'Request copied')}>Copy the request for Claude</button>
        </div>
        <textarea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setImportInfo(null); }} placeholder="Paste Claude's answer here (a JSON list)" dir="ltr"
          style={{ ...inputStyle, minHeight: '120px', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '12px' }} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button style={{ ...buttonSecondary, minHeight: '38px' }} disabled={busy || !pasteText.trim()} onClick={() => runImport(true)}>Preview</button>
          <button style={{ ...buttonPrimary, minHeight: '38px', opacity: importInfo?.dryRun && importInfo.added ? 1 : 0.5 }} disabled={busy || !(importInfo?.dryRun && importInfo.added)} onClick={() => runImport(false)}>
            Add {importInfo?.dryRun ? importInfo.added : ''} word{importInfo?.added === 1 ? '' : 's'}
          </button>
        </div>
        {importInfo?.error && <div style={{ ...small, color: colors.danger, marginTop: '8px' }}>{importInfo.error}</div>}
        {importInfo?.dryRun && !importInfo.error && (
          <div style={{ ...small, marginTop: '8px' }}>
            Ready: {importInfo.added} new word{importInfo.added === 1 ? '' : 's'}{importInfo.skipped ? `, ${importInfo.skipped} already on the list` : ''}{importInfo.invalid?.length ? `, ${importInfo.invalid.length} could not be read (${importInfo.invalid.slice(0, 2).map((x) => x.error).join('; ')})` : ''}.
          </div>
        )}
      </div>

        </>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete this word?" message={`${confirmDel.transliteration || confirmDel.word} will be removed from the list.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { const w = confirmDel; setConfirmDel(null); await save({ ...file, words: words.filter((x) => x.id !== w.id) }, 'Word deleted.'); }}
        />
      )}
      {snack}
      {modal}
    </div>
  );
}
