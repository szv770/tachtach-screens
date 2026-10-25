/**
 * Admin → Daily Story. The story / thought of the day for the DAILY_STORY slide (same pattern as Daily Word):
 *   - what shows today, rotation order,
 *   - Coming up: the next two weeks, pin any story to a day,
 *   - Archive: what already showed (Show again… pins it to a future day),
 *   - All stories: show/hide, edit, delete, add by hand, or paste a batch a chat assistant wrote.
 * Data: data/daily-stories.json via /api/daily-stories (capability `dailyWord.edit`); the kiosk picks the story
 * with the shared pure rules in src/shared/dailyStories.js. Until the first save the starter library shows.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import { apiFetch } from '../hooks/useAdminState.js';
import { ToggleSwitch, ConfirmDialog } from './ui.jsx';
import { useSnackbar, useCopy } from './schedule/scheduleShared.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { pickDailyStory, normalizeStory, upcomingStories, archiveRows, pinStory, addDaysISO, DAILY_STORY_PROMPT, LIMITS } from '../../shared/dailyStories.js';
import { toISODate } from '../../shared/scheduleResolution.js';

const blank = () => ({ kind: 'story', title: '', titleHe: '', text: '', textHe: '', source: '', tags: [], showOn: '', enabled: true });

const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '18px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const small = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const preview = (t, n = 120) => { const s = String(t || ''); return s.length > n ? `${s.slice(0, n).trim()}…` : s; };
const dayName = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);

function StoryForm({ initial, onSave, onCancel, busy }) {
  const [s, setS] = useState(() => ({ ...blank(), ...initial, showOn: initial?.showOn || '' }));
  const rootRef = useRef(null);
  useEffect(() => { rootRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, []);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const check = normalizeStory(s);
  const area = (k, text, props = {}) => (
    <label style={{ ...label, marginTop: '10px' }}>{text}
      <textarea value={s[k]} onChange={(e) => set(k, e.target.value)} dir={props.dir} maxLength={LIMITS[k]} placeholder={props.placeholder}
        style={{ ...inputStyle, minHeight: '120px', resize: 'vertical', fontSize: props.dir === 'rtl' ? '17px' : '15px', lineHeight: 1.45, fontFamily: props.dir === 'rtl' ? adminFonts.hebrewPrimary : undefined }} />
      <span style={{ ...small, alignSelf: 'flex-end' }}>{String(s[k] || '').length} / {LIMITS[k]}</span>
    </label>
  );
  return (
    <div ref={rootRef} style={{ ...card, borderColor: colors.gold, margin: '10px 0' }}>
      <h3 style={h3}>{initial?.id ? 'Edit story' : 'Add a story'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
        <label style={label}>Kind
          <select value={s.kind} onChange={(e) => set('kind', e.target.value)} style={inputStyle}>
            <option value="story">Story</option>
            <option value="thought">Thought</option>
          </select>
        </label>
        <label style={label}>Title
          <input value={s.title} onChange={(e) => set('title', e.target.value)} style={inputStyle} maxLength={LIMITS.title} placeholder="The shepherd boy’s whistle" />
        </label>
        <label style={label}>Title in Hebrew (optional)
          <input value={s.titleHe} onChange={(e) => set('titleHe', e.target.value)} dir="rtl" style={{ ...inputStyle, fontFamily: adminFonts.hebrewPrimary, fontSize: '17px' }} maxLength={LIMITS.titleHe} />
        </label>
        <label style={label}>Show on this date (optional)
          <input type="date" value={s.showOn} onChange={(e) => set('showOn', e.target.value)} style={inputStyle} />
        </label>
      </div>
      {area('text', 'The story (English). Short reads best: about 60 to 90 words.', { placeholder: 'Once, on Yom Kippur…' })}
      {area('textHe', 'In Hebrew (optional, shows beside the English)', { dir: 'rtl' })}
      <label style={{ ...label, marginTop: '10px' }}>Source (optional)
        <input value={s.source} onChange={(e) => set('source', e.target.value)} style={inputStyle} maxLength={LIMITS.source} placeholder="Told about the Baal Shem Tov" />
      </label>
      {check.error && (s.title || s.text || s.textHe) && <div style={{ ...small, color: colors.danger, marginTop: '6px' }}>{check.error}</div>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button style={{ ...buttonPrimary, minHeight: '40px', opacity: check.error || busy ? 0.5 : 1 }} disabled={!!check.error || busy}
          onClick={() => onSave({ ...check.story, id: initial?.id || check.story.id, enabled: initial ? initial.enabled !== false : true })}>Save</button>
        <button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function DailyStoryPanel() {
  const isMobile = useIsMobile();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // story | 'new' | null
  const [editDate, setEditDate] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('upcoming');
  const [showAgain, setShowAgain] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [importInfo, setImportInfo] = useState(null);
  const [promptN, setPromptN] = useState(20);
  const todayStr = toISODate(new Date());
  const { show, node: snack } = useSnackbar();
  const { copy, modal } = useCopy(show);

  const load = useCallback(async () => {
    try { setFile(await apiFetch('/api/daily-stories')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (next, okMsg) => {
    setBusy(true);
    try { setFile(await apiFetch('/api/daily-stories', { method: 'PUT', body: JSON.stringify((({ history, ...rest }) => rest)(next)) })); if (okMsg) show(okMsg); return true; }
    catch (e) { show(e.message, 'error'); return false; }
    finally { setBusy(false); }
  };

  const stories = file?.stories || [];
  const today = useMemo(() => pickDailyStory(file, todayStr), [file, todayStr]);
  const upcoming = useMemo(() => (file ? upcomingStories(file, todayStr, 14) : []), [file, todayStr]);
  const archive = useMemo(() => (file ? archiveRows(file) : []), [file]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return stories.map((s, i) => ({ s, i })).filter(({ s }) => !q || [s.title, s.titleHe, s.text, s.source].join(' ').toLowerCase().includes(q));
  }, [stories, filter]);
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= stories.length) return; const a = [...stories]; [a[i], a[j]] = [a[j], a[i]]; save({ ...file, stories: a }); };
  const prompt = DAILY_STORY_PROMPT.replace('{N}', String(promptN)).replace('{EXISTING}', stories.map((s) => s.title).filter(Boolean).join('; ') || 'none yet');

  const runImport = async (dryRun) => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/daily-stories/import', { method: 'POST', body: JSON.stringify({ text: pasteText, mode: 'append', dryRun }) });
      setImportInfo(r);
      if (!dryRun) { setFile(r.file); setPasteText(''); show(`Added ${r.added} stor${r.added === 1 ? 'y' : 'ies'}${r.skipped ? `, skipped ${r.skipped} already on the list` : ''}.`); }
    } catch (e) { setImportInfo({ error: e.message }); } finally { setBusy(false); }
  };

  const renderForm = (initial) => (
    <StoryForm key={initial ? initial.id : 'new'} initial={initial} busy={busy}
      onCancel={() => { setEditing(null); setEditDate(null); }}
      onSave={async (s) => {
        const exists = stories.some((x) => x.id === s.id);
        const next = exists ? stories.map((x) => (x.id === s.id ? s : x)) : [...stories, s];
        if (await save({ ...file, stories: next }, exists ? 'Story saved.' : 'Story added.')) { setEditing(null); setEditDate(null); }
      }} />
  );

  const row = { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.muted}`, flexWrap: isMobile ? 'wrap' : 'nowrap' };
  const summary = (s, extra) => (
    <div style={{ flex: 1, minWidth: '170px' }}>
      <div style={{ ...small, color: colors.text, fontSize: '14px', fontWeight: 600 }}>{s?.title || s?.titleHe || 'Untitled'} <span style={{ color: colors.dim, fontWeight: 400 }}>· {s?.kind === 'thought' ? 'thought' : 'story'}</span>{extra}</div>
      <div style={small}>{preview(s?.text || s?.textHe)}</div>
    </div>
  );

  if (error && !file) return <div style={{ ...small, color: colors.danger }}>{error} <button style={buttonSecondary} onClick={load}>Retry</button></div>;
  if (!file) return <div style={small}>Loading…</div>;

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' }}>Daily Story</h2>
      <p style={{ ...small, margin: '0 0 16px' }}>A short story or thought to read, a new one every day, for the Daily Story slide (switch that slide on in Slides). {stories.filter((s) => s.enabled !== false).length} on the list.</p>

      <div style={card}>
        <h3 style={h3}>Showing today</h3>
        {today ? (
          <div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '20px', color: colors.text, fontWeight: 600 }}>{today.title || today.titleHe}</div>
            <div style={{ ...small, fontSize: '14px', marginTop: '4px', lineHeight: 1.45 }}>{preview(today.text || today.textHe, 260)}</div>
          </div>
        ) : <span style={small}>Nothing is switched on yet.</span>}
        <label style={{ ...label, marginTop: '12px', maxWidth: '420px' }}>Order
          <select value={file.order} disabled={busy} onChange={(e) => save({ ...file, order: e.target.value }, 'Order saved.')} style={inputStyle}>
            <option value="shuffle">Shuffled (no repeats until every story was shown)</option>
            <option value="sequential">In list order, one a day</option>
          </select>
        </label>
        <div style={{ ...small, marginTop: '8px' }}>A story moves to the Archive the day it is shown, and comes around again once the whole list has been shown.</div>
      </div>

      <div style={{ display: 'flex', gap: '6px', margin: '0 0 14px', flexWrap: 'wrap' }} role="tablist">
        {[['upcoming', 'Coming up'], ['archive', `Archive (${archive.length})`], ['all', `All stories (${stories.length})`]].map(([key, text]) => (
          <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
            style={{ ...buttonSecondary, minHeight: '38px', background: view === key ? colors.goldBg : 'transparent', border: `1px solid ${view === key ? colors.gold : colors.muted}`, color: view === key ? colors.gold : colors.dim }}>
            {text}
          </button>
        ))}
      </div>

      {view === 'upcoming' && (
        <div style={card}>
          <h3 style={h3}>The next two weeks</h3>
          <p style={{ ...small, margin: '0 0 8px' }}>This is what will show each day. Pick a different story for any day and it is pinned there.</p>
          {upcoming.map((u, i) => {
            const live = u.story?.id ? stories.find((s) => s.id === u.story.id) : null;
            return (
              <React.Fragment key={u.date}>
                <div style={row}>
                  <span style={{ ...small, minWidth: '96px', color: i === 0 ? colors.gold : colors.dim }}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayName(u.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  {summary(u.story, u.pinned && <span style={{ color: colors.gold }}> · pinned</span>)}
                  {live && (
                    <button type="button" style={{ ...buttonSecondary, minHeight: '44px', minWidth: '44px', padding: '0 10px' }} disabled={busy}
                      aria-label={`Edit the story for ${u.date}`} title="Edit this story" onClick={() => { setEditing(live); setEditDate(u.date); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
                    </button>
                  )}
                  {u.locked
                    ? <span style={{ ...small, whiteSpace: 'nowrap' }}>{i === 0 ? 'on screen now' : 'locked'}</span>
                    : (
                      <select aria-label={`Story for ${u.date}`} value={u.pinned ? u.story.id : ''} disabled={busy} style={{ ...inputStyle, minHeight: '34px', width: 'auto', maxWidth: '200px' }}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) { save({ ...file, stories: stories.map((s) => (s.showOn === u.date ? (({ showOn, ...rest }) => rest)(s) : s)) }, 'Back to automatic.'); return; }
                          save(pinStory(file, id, u.date), 'Pinned.');
                        }}>
                        <option value="">Automatic</option>
                        {stories.filter((s) => s.enabled !== false).map((s) => <option key={s.id} value={s.id}>{s.title || preview(s.text, 30)}</option>)}
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
          <h3 style={h3}>Archive: stories already shown</h3>
          {archive.length === 0 && <div style={small}>Nothing yet. Each day's story is saved here once it has been on the screen.</div>}
          {archive.map((r) => (
            <div key={r.date} style={row}>
              <span style={{ ...small, minWidth: '110px' }}>{dayName(r.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              {summary(r.entry)}
              {showAgain && showAgain.key === r.date ? (
                <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="date" min={addDaysISO(todayStr, 1)} value={showAgain.date} onChange={(e) => setShowAgain({ ...showAgain, date: e.target.value })} style={{ ...inputStyle, minHeight: '34px', width: 'auto' }} />
                  <button style={{ ...buttonPrimary, minHeight: '34px' }} disabled={busy || !showAgain.date} onClick={async () => { if (await save(pinStory(file, r.live.id, showAgain.date), 'Pinned. It will show again that day.')) setShowAgain(null); }}>Pin</button>
                  <button style={{ ...buttonSecondary, minHeight: '34px' }} onClick={() => setShowAgain(null)}>Cancel</button>
                </span>
              ) : r.live
                ? <button style={{ ...buttonSecondary, minHeight: '32px' }} onClick={() => setShowAgain({ key: r.date, date: addDaysISO(todayStr, 1) })}>Show again…</button>
                : <span style={small} title="This story was deleted from the list">removed from list</span>}
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
              <button style={{ ...buttonPrimary, minHeight: '38px' }} onClick={() => { setEditing('new'); setEditDate(null); }}>+ Add a story</button>
            </div>
            {editing === 'new' && renderForm(null)}
            {shown.length === 0 && <div style={small}>Nothing matches.</div>}
            {shown.map(({ s, i }) => (editing && editing !== 'new' && !editDate && editing.id === s.id ? <React.Fragment key={s.id}>{renderForm(editing)}</React.Fragment> : (
              <div key={s.id} style={{ ...row, opacity: s.enabled === false ? 0.5 : 1 }}>
                <ToggleSwitch on={s.enabled !== false} label={`Show ${s.title || 'this story'}`} onChange={(on) => save({ ...file, stories: stories.map((x) => (x.id === s.id ? { ...x, enabled: on } : x)) })} />
                {summary(s, s.showOn && <span style={{ color: colors.gold }}> · pinned {s.showOn}</span>)}
                <button style={{ ...buttonSecondary, minHeight: '32px', padding: '2px 8px' }} onClick={() => move(i, -1)} disabled={busy || i === 0} title="Earlier in the order" aria-label="Move up">↑</button>
                <button style={{ ...buttonSecondary, minHeight: '32px', padding: '2px 8px' }} onClick={() => move(i, 1)} disabled={busy || i === stories.length - 1} title="Later in the order" aria-label="Move down">↓</button>
                <button style={{ ...buttonSecondary, minHeight: '32px' }} onClick={() => { setEditing(s); setEditDate(null); }}>Edit</button>
                <button style={{ ...buttonDanger, minHeight: '32px' }} onClick={() => setConfirmDel(s)}>Delete</button>
              </div>
            )))}
          </div>

          <div style={card}>
            <h3 style={h3}>Add lots of stories with Claude</h3>
            <p style={{ ...small, margin: '0 0 10px' }}>1) Copy the request below into Claude (or any chat assistant). 2) Paste its answer here. 3) Preview, then add. Titles already on the list are skipped. Please read new stories over before they go on the screen.</p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
              <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>How many
                <input type="number" min={1} max={40} value={promptN} onChange={(e) => setPromptN(Math.max(1, Math.min(40, Number(e.target.value) || 20)))} style={{ ...inputStyle, width: '80px' }} />
              </label>
              <button style={{ ...buttonSecondary, minHeight: '38px' }} onClick={() => copy(prompt, 'Request copied')}>Copy the request for Claude</button>
            </div>
            <textarea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setImportInfo(null); }} placeholder="Paste Claude's answer here (a JSON list)" dir="ltr"
              style={{ ...inputStyle, minHeight: '120px', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '12px' }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button style={{ ...buttonSecondary, minHeight: '38px' }} disabled={busy || !pasteText.trim()} onClick={() => runImport(true)}>Preview</button>
              <button style={{ ...buttonPrimary, minHeight: '38px', opacity: importInfo?.dryRun && importInfo.added ? 1 : 0.5 }} disabled={busy || !(importInfo?.dryRun && importInfo.added)} onClick={() => runImport(false)}>
                Add {importInfo?.dryRun ? importInfo.added : ''} stor{importInfo?.added === 1 ? 'y' : 'ies'}
              </button>
            </div>
            {importInfo?.error && <div style={{ ...small, color: colors.danger, marginTop: '8px' }}>{importInfo.error}</div>}
            {importInfo?.dryRun && !importInfo.error && (
              <div style={{ ...small, marginTop: '8px' }}>
                Ready: {importInfo.added} new{importInfo.skipped ? `, ${importInfo.skipped} already on the list` : ''}{importInfo.invalid?.length ? `, ${importInfo.invalid.length} could not be read (${importInfo.invalid.slice(0, 2).map((x) => x.error).join('; ')})` : ''}.
              </div>
            )}
          </div>
        </>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete this story?" message={`${confirmDel.title || 'This story'} will be removed from the list.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { const s = confirmDel; setConfirmDel(null); await save({ ...file, stories: stories.filter((x) => x.id !== s.id) }, 'Story deleted.'); }}
        />
      )}
      {snack}
      {modal}
    </div>
  );
}
