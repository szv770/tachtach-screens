/**
 * Admin > Screen > Bochurim (the roster, with the birthday slide). The ONE list of bochurim (data/roster.json, /api/roster) that the
 * birthday slide uses now and the chazan chart will use next.
 *   - Who is celebrating (today / just was / coming up), exactly as the screen works it out,
 *   - the list (add, edit, delete with Undo; Hebrew birthday only; an English date is converted),
 *   - import from a spreadsheet (.xlsx / .csv) or pasted cells, with a preview before anything is saved,
 *   - birthday slide settings (names, days of "coming up", Friday = weekend, side-rail card).
 * Rules (Hebrew dates, Shabbos -> Thursday + Sunday, spreadsheet reading) are in src/shared/roster.js.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { ToggleSwitch, ConfirmDialog } from './ui.jsx';
import Sheet from './ui/Sheet.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import Collapsible from './ui/Collapsible.jsx';
import {
  MONTHS, normalizePerson, fullName, sortPeople, birthdayLabel, birthdaysFor, birthdayDatesBetween, addDays, weekdayName,
  parseDelimited, parseRosterRows, parseEnglishDate, hebrewBirthdayFromISO, validDay, normalizeSettings, samePerson, LIMITS,
} from '../../shared/roster.js';
import { stripText } from '../../shared/birthdayCopy.js';
import { toISODate } from '../../shared/scheduleResolution.js';

const card = { background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-lg)', padding: '16px', marginBottom: '16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text, margin: '0 0 6px' };
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const small = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.5 };
const row = { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: `1px solid ${colors.line}` };

const prettyDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// ── Add / edit one person ────────────────────────────────────────────────────

function PersonSheet({ person, onSave, onClose, busy }) {
  const [p, setP] = useState(() => ({ first: '', last: '', he: '', month: 'Tishri', day: 1, ...person }));
  const [eng, setEng] = useState('');
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const fromEnglish = (v) => {
    setEng(v);
    const iso = parseEnglishDate(v);
    const b = iso && hebrewBirthdayFromISO(iso);
    if (b) setP((x) => ({ ...x, month: b.month, day: b.day }));
  };
  const check = normalizePerson(p, () => 'pending_id');
  const monthDays = MONTHS.find((m) => m.key === p.month)?.days || 30;
  return (
    <Sheet open onClose={onClose} title={person?.id ? 'Edit person' : 'Add a bochur'}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
        <label style={label}>First name
          <input autoFocus value={p.first} onChange={(e) => set('first', e.target.value)} style={inputStyle} maxLength={LIMITS.name} />
        </label>
        <label style={label}>Last name
          <input value={p.last} onChange={(e) => set('last', e.target.value)} style={inputStyle} maxLength={LIMITS.name} />
        </label>
      </div>
      <div style={{ ...small, margin: '14px 0 4px', fontWeight: 700, color: colors.text }}>Hebrew birthday</div>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '10px' }}>
        <select aria-label="Day" value={p.day} onChange={(e) => set('day', parseInt(e.target.value, 10))} style={inputStyle}>
          {Array.from({ length: monthDays }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select aria-label="Month" value={p.month} onChange={(e) => { const m = e.target.value; setP((x) => ({ ...x, month: m, day: validDay(m, x.day) ? x.day : 1 })); }} style={inputStyle}>
          {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.en}  ·  {m.he}</option>)}
        </select>
      </div>
      <label style={{ ...label, marginTop: '12px' }}>Only have the English date? Type it here and we fill in the Hebrew one (the English date is never shown)
        <input value={eng} onChange={(e) => fromEnglish(e.target.value)} style={inputStyle} placeholder="3/14/2008" inputMode="numeric" />
      </label>
      <label style={{ ...label, marginTop: '12px' }}>Hebrew name (optional, shown small under the name)
        <input value={p.he || ''} onChange={(e) => set('he', e.target.value)} dir="rtl" style={{ ...inputStyle, fontFamily: adminFonts.hebrewPrimary, fontSize: '18px' }} maxLength={LIMITS.he} />
      </label>
      {check.error && (p.first || p.last) && <div style={{ ...small, color: colors.danger, marginTop: '8px' }}>{check.error}</div>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button style={{ ...buttonPrimary, minHeight: '44px', flex: 1, opacity: check.error || busy ? 0.5 : 1 }} disabled={!!check.error || busy}
          onClick={() => onSave({ ...check, id: person?.id })}>Save</button>
        <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── Import ───────────────────────────────────────────────────────────────────

const SAMPLE_CSV = 'First name,Last name,Hebrew birthday\nMoshe,Cohen,23 Adar\nDovid,Levi,כ״ה חשון\nYossi,Katz,5 Av\n';

async function readFileRows(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser'); // only loaded when someone picks a spreadsheet
    return { rows: await readSheet(file) };
  }
  return { text: await file.text() };
}

function ImportCard({ people, canEdit, onDone }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null); // cells from an .xlsx
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const parsed = useMemo(() => {
    const cells = rows || (text.trim() ? parseDelimited(text) : null);
    if (!cells) return null;
    const out = parseRosterRows(cells);
    const fresh = [];
    for (const q of out.people) if (![...people, ...fresh].some((x) => samePerson(q, x))) fresh.push(q);
    return { ...out, fresh, already: out.people.length - fresh.length, fromEnglish: out.people.filter((x) => x.from === 'english').length };
  }, [text, rows, people]);
  const preview = parsed;

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    try {
      const got = await readFileRows(f);
      setFileName(f.name);
      if (got.rows) { setRows(got.rows); setText(''); } else { setRows(null); setText(got.text); }
    } catch { setErr('Could not read that file. Save it as .xlsx or .csv and try again.'); }
  };
  const reset = () => { setText(''); setRows(null); setFileName(''); setErr(''); };
  const run = async (mode) => {
    setBusy(true); setErr('');
    try {
      const res = await apiFetch('/api/roster/import', { method: 'POST', body: JSON.stringify({ rows: rows || undefined, text: rows ? undefined : text, mode }) });
      onDone(res.file, `Added ${res.added} ${res.added === 1 ? 'person' : 'people'}${res.already ? ` (${res.already} already in the list)` : ''}.`);
      reset();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }));
    a.download = 'bochurim-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div>
      <p style={small}>
        Use a spreadsheet with <b>first name, last name, Hebrew birthday</b> (like <i>23 Adar</i> or <i>כ״ג אדר</i>), or one <b>full name</b> column instead.
        If you only have an English birth date, that works too: we turn it into the Hebrew date once and only ever show the Hebrew one.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv" onChange={pick} style={{ display: 'none' }} disabled={!canEdit} />
        <button style={{ ...buttonSecondary, minHeight: '44px' }} disabled={!canEdit} onClick={() => fileRef.current?.click()}>Choose a spreadsheet…</button>
        <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={download}>Get a blank template</button>
      </div>
      {fileName && <div style={{ ...small, marginBottom: '8px' }}>File: <b>{fileName}</b></div>}
      {!rows && (
        <label style={label}>…or paste the cells here (copy them from Excel or Google Sheets)
          <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} style={{ ...inputStyle, minHeight: '96px', resize: 'vertical' }} placeholder={'Moshe\tCohen\t23 Adar\nDovid\tLevi\tכ״ה חשון'} />
        </label>
      )}
      {preview && (
        <div style={{ ...card, background: colors.sunken, marginTop: '12px', marginBottom: 0 }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontWeight: 700, color: colors.text }}>
            {preview.people.length ? `Found ${preview.people.length} ${preview.people.length === 1 ? 'person' : 'people'}` : 'No names with birthdays found'}
            {preview.people.length > 0 && <span style={{ fontWeight: 500, color: colors.dim }}> · {preview.fresh.length} new{preview.already ? `, ${preview.already} already in the list` : ''}</span>}
          </div>
          <div style={{ ...small, marginTop: '6px' }}>
            {preview.people.slice(0, 6).map((q) => `${[q.first, q.last].filter(Boolean).join(' ')} (${birthdayLabel(q)})`).join(' · ')}{preview.people.length > 6 ? ` · +${preview.people.length - 6} more` : ''}
          </div>
          {preview.fromEnglish > 0 && <div style={{ ...small, marginTop: '6px' }}>{preview.fromEnglish} came from English dates. A boy born after dark may have a different Hebrew day, so check those few.</div>}
          {preview.skipped.length > 0 && (
            <div style={{ ...small, marginTop: '6px', color: colors.warn }}>
              Skipped {preview.skipped.length}: {preview.skipped.slice(0, 3).map((s) => `row ${s.row} (${s.why.replace(/\.$/, '').toLowerCase()})`).join(', ')}{preview.skipped.length > 3 ? '…' : ''}
            </div>
          )}
          {preview.people.length > 0 && canEdit && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
              <button style={{ ...buttonPrimary, minHeight: '44px', opacity: busy || !preview.fresh.length ? 0.5 : 1 }} disabled={busy || !preview.fresh.length} onClick={() => run('append')}>Add {preview.fresh.length} to the list</button>
              <button style={{ ...buttonSecondary, minHeight: '44px' }} disabled={busy} onClick={() => run('replace')}>Replace the whole list</button>
              <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={reset}>Clear</button>
            </div>
          )}
        </div>
      )}
      {err && <div style={{ ...small, color: colors.danger, marginTop: '8px' }}>{err}</div>}
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function RosterPanel({ canEdit = true, onNavigate }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // person | 'new' | null
  const [confirmDel, setConfirmDel] = useState(null);
  const [filter, setFilter] = useState('');
  const [order, setOrder] = useState('name'); // 'name' | 'birthday'
  const todayISO = toISODate(new Date());

  const load = useCallback(async () => {
    try { setFile(await apiFetch('/api/roster')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const people = file?.people || [];
  const settings = normalizeSettings(file?.birthdays);

  const savePeople = async (next, okMsg, undo) => {
    setBusy(true);
    try {
      setFile(await apiFetch('/api/roster', { method: 'PUT', body: JSON.stringify({ people: next }) }));
      if (okMsg) notify(okMsg, 'success', undo ? { label: 'Undo', onClick: () => savePeople(undo, 'Undone') } : null);
      return true;
    } catch (e) { notify(e.message, 'error'); return false; } finally { setBusy(false); }
  };
  const saveSettings = async (patch) => {
    try { setFile(await apiFetch('/api/roster/settings', { method: 'PUT', body: JSON.stringify({ ...settings, ...patch }) })); } catch (e) { notify(e.message, 'error'); }
  };

  const onSavePerson = async (p) => {
    const exists = p.id && people.some((x) => x.id === p.id);
    const next = exists ? people.map((x) => (x.id === p.id ? p : x)) : [...people, p];
    if (await savePeople(next, exists ? 'Saved' : `Added ${fullName(p)}`)) setEditing(null);
  };
  const onDelete = async (p) => {
    setConfirmDel(null);
    await savePeople(people.filter((x) => x.id !== p.id), `Removed ${fullName(p)}`, people);
  };

  const next = useMemo(() => {
    const out = {};
    const to = addDays(todayISO, 400);
    for (const p of people) { const d = birthdayDatesBetween(p, todayISO, to)[0]; if (d) out[p.id] = d; }
    return out;
  }, [people, todayISO]);
  const celebrating = useMemo(() => birthdaysFor(people, todayISO, settings), [people, todayISO, file]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = sortPeople(people).filter((p) => !q || `${fullName(p)} ${p.he || ''} ${birthdayLabel(p)}`.toLowerCase().includes(q));
    return order === 'birthday' ? [...list].sort((a, b) => (next[a.id] || '9').localeCompare(next[b.id] || '9')) : list;
  }, [people, filter, order, next]);

  if (!file && !error) return <div style={{ ...small, padding: '20px' }}>Loading…</div>;

  const todayNames = celebrating.today.map((t) => fullName(t.person)).join(', ');
  const ro = !canEdit;

  return (
    <div data-testid="roster-panel">
      <p style={{ ...small, margin: '4px 0 14px' }}>
        One list of bochurim for the whole screen. The <b>birthday slide</b> uses it now (it only shows on a bochur’s <b>Hebrew</b> birthday), and the chazan chart will use the same list, so you only type names once.
      </p>
      {error && <div style={{ ...small, color: colors.danger, marginBottom: '10px' }}>{error}</div>}
      {ro && <div style={{ ...small, marginBottom: '10px' }}>You can look at this list but not change it.</div>}

      <div style={card}>
        <h3 style={h3}>Birthdays right now</h3>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, margin: '4px 0' }}>
          {celebrating.today.length ? <>Today: <b>{todayNames}</b></> : <span style={{ color: colors.dim }}>No birthdays today. The birthday slide skips itself on days like this.</span>}
        </div>
        {[['Just celebrated', celebrating.recent], ['Coming up', celebrating.upcoming]].map(([t, items]) => items.length > 0 && (
          <div key={t} style={{ ...small, marginTop: '2px' }}>{t}: {stripText(items, 'full', 8)}</div>
        ))}
        <div style={{ ...small, marginTop: '8px' }}>
          Turn the slide on or off, or move it in the rotation, in <button type="button" onClick={() => onNavigate?.('slides')} style={{ background: 'none', border: 'none', padding: 0, color: colors.accent, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Slides</button>.
        </div>
      </div>

      <Collapsible title="Import from a spreadsheet" summary="Excel, CSV or paste" defaultOpen={!people.length}>
        <ImportCard people={people} canEdit={canEdit} onDone={(f, msg) => { setFile(f); notify(msg); }} />
      </Collapsible>

      <Collapsible title="Birthday slide settings" summary={`${settings.names === 'short' ? 'First name + initial' : 'Full names'} · ${settings.lookAhead} day${settings.lookAhead === 1 ? '' : 's'} ahead`}>
        <div style={{ display: 'grid', gap: '16px', marginTop: '6px' }}>
          <div>
            <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>How names are shown</div>
            <SegmentedControl ariaLabel="Names" value={settings.names} onChange={(v) => canEdit && saveSettings({ names: v })} options={[{ value: 'full', label: 'Full name' }, { value: 'short', label: 'First name + initial' }]} />
          </div>
          <div>
            <div style={{ ...small, fontWeight: 700, color: colors.text, marginBottom: '6px' }}>Small “just celebrated / coming up” lines</div>
            <SegmentedControl ariaLabel="Days ahead" value={settings.lookAhead} onChange={(v) => canEdit && saveSettings({ lookAhead: v })} options={[{ value: 0, label: 'Off' }, { value: 1, label: '1 day' }, { value: 2, label: '2 days' }, { value: 3, label: '3 days' }]} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontFamily: adminFonts.englishBody, color: colors.text }}>
            <span>Small card in the side rail on a birthday<span style={{ ...small, display: 'block' }}>“Birthday today: Moshe C.” next to the clock.</span></span>
            <ToggleSwitch on={settings.rail} onChange={() => canEdit && saveSettings({ rail: !settings.rail })} label="Side rail card" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontFamily: adminFonts.englishBody, color: colors.text }}>
            <span>Treat Friday like the weekend<span style={{ ...small, display: 'block' }}>A birthday on Shabbos always shows Thursday and Sunday. Turn this on if there is no school on Friday either.</span></span>
            <ToggleSwitch on={settings.fridayIsWeekend} onChange={() => canEdit && saveSettings({ fridayIsWeekend: !settings.fridayIsWeekend })} label="Friday is weekend" />
          </label>
        </div>
      </Collapsible>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h3 style={{ ...h3, margin: 0 }}>Bochurim ({people.length})</h3>
          {canEdit && <button style={{ ...buttonPrimary, minHeight: '44px' }} onClick={() => setEditing('new')}>+ Add a bochur</button>}
        </div>
        {people.length > 6 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 2px' }}>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" aria-label="Search the list" style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }} />
            <SegmentedControl ariaLabel="Sort" value={order} onChange={setOrder} options={[{ value: 'name', label: 'By name' }, { value: 'birthday', label: 'By next birthday' }]} />
          </div>
        )}
        {!people.length && <p style={{ ...small, marginTop: '10px' }}>Nobody yet. Add one, or import a spreadsheet below.</p>}
        <div style={{ marginTop: '8px' }}>
          {shown.map((p) => (
            <div key={p.id} style={row}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: adminFonts.englishBody, fontWeight: 650, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fullName(p)}{p.he && <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary, fontWeight: 400, color: colors.dim, marginLeft: '10px' }}>{p.he}</span>}
                </div>
                <div style={small}>
                  {birthdayLabel(p)} · <span dir="rtl" style={{ fontFamily: adminFonts.hebrewPrimary }}>{birthdayLabel(p, 'he')}</span>
                  {next[p.id] && <> · next {next[p.id] === todayISO ? <b style={{ color: colors.accent }}>today</b> : `${prettyDate(next[p.id])}${weekdayName(next[p.id]) === 'Shabbos' ? ' (shows Thu + Sun)' : ''}`}</>}
                </div>
              </div>
              {canEdit && (
                <>
                  <button style={{ ...buttonSecondary, minHeight: '40px' }} onClick={() => setEditing(p)} aria-label={`Edit ${fullName(p)}`}>Edit</button>
                  <button style={{ ...buttonSecondary, minHeight: '40px', color: colors.danger }} onClick={() => setConfirmDel(p)} aria-label={`Remove ${fullName(p)}`}>Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {editing && <PersonSheet person={editing === 'new' ? null : editing} busy={busy} onSave={onSavePerson} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <ConfirmDialog title={`Remove ${fullName(confirmDel)}?`} message="They will be taken off the list (you can undo this right after)." confirmLabel="Remove" onConfirm={() => onDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
