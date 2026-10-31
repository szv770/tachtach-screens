import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Collapsible from './ui/Collapsible.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import { Page, Field, Hint, SwitchRow, Choices, fieldStyle, LinkButton } from './look/kit.jsx';
import { NumberField } from './ui.jsx';
import { useCopy } from './schedule/scheduleShared.jsx';
import { notify } from '../hooks/useAdminState.js';
import {
  btn, iconBtn, card, h3, small, Chip, Thumb, shiurimApi, undoRestore, inputBase,
} from './shiurim/shiurimKit.jsx';
import {
  ShiurSheet, GuestSheet, PersonSheet, MoveSheet, ImportSheet,
} from './shiurim/ShiurimSheets.jsx';
import {
  personName, whenLabel, fmt12, fmtHHMM, guestPhase, formatShiurimText, hasHeb, isEmpty, addDays, DEFAULT_SETTINGS,
} from '../../shared/shiurim.js';

/**
 * Admin > Screen > Shiurim (spec docs/specs/06-SPEAKER-SHIURIM.md section 3). Phone first: one column, 44 px targets, sheets with
 * a sticky Save. Today (cancel or move today's shiur in one tap, instant on the TV) · Shiurim by rebbe · Guest speakers · People ·
 * Import (paste, cells, .xlsx/.csv, Claude prompt) · Settings (what shows, when, guests). Two slides share this page: Today's
 * shiurim (also the week) and Guest speaker. Every change is one granular request (src/server/routes/shiurim.js) with an Undo.
 */

const VIEWS = [['both', 'Today, then the week'], ['today', 'Today only'], ['week', 'The week only']];
const WEEK_BY = [['rebbe', 'By rebbe'], ['day', 'By day']];
const SORT = [['time', 'By time'], ['rebbe', 'By rebbe']];
const PAST = [['dim', 'Fade them'], ['hide', 'Hide them']];
const CANCELLED = [['mark', "Show 'Cancelled'"], ['hide', 'Hide it']];
const NONE = [['week', 'Show the week'], ['hide', 'Skip the slide']];
const LANG = [['both', 'English and Hebrew'], ['en', 'English'], ['he', 'Hebrew']];
const WHEN = [['always', 'All the time'], ['hours', 'Set hours']];

const lineBox = { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${colors.line}`, minWidth: 0 };
const nameOf = (s) => s.title || s.titleHe;
const labelOf = (arr, v) => (arr.find((x) => x[0] === v) || [])[1] || v;
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export default function ShiurimPanel({ canEdit = true, slides = [], onUpdateSlides, canEditSlides = false, canTakeover = false, onNavigate }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('shiurim');
  const [query, setQuery] = useState('');
  const [shiurSheet, setShiurSheet] = useState(null); // { initial, preset }
  const [guestSheet, setGuestSheet] = useState(null); // { initial }
  const [personSheet, setPersonSheet] = useState(null); // { initial }
  const [moveCtx, setMoveCtx] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const { copy, modal } = useCopy(notify);

  const load = useCallback(async () => {
    try { setFile(await shiurimApi('GET', '')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** One request (or a few in order) + a toast with Undo. `run()` returns the saved document. */
  const act = useCallback(async (run, msg, undo) => {
    setBusy(true);
    try {
      const next = await run();
      setFile(next);
      if (msg) notify(msg, 'success', undo ? { label: 'Undo', onClick: () => undoRestore(undo, setFile) } : null);
      return next;
    } catch (e) { notify(e.message, 'error'); return null; } finally { setBusy(false); }
  }, []);

  const now = useMemo(() => new Date(), [file]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = file?.today;
  const rowSlide = slides.find((s) => s.type === 'SHIURIM');
  const guestSlide = slides.find((s) => s.type === 'SPEAKER');

  if (error) return <Page intro="The shiurim could not be loaded."><Hint style={{ color: colors.danger }}>{error}</Hint><button type="button" style={btn(false)} onClick={load}>Try again</button></Page>;
  if (!file || !today) return <Page intro="Loading the shiurim..."><Hint>One moment.</Hint></Page>;

  const settings = { ...DEFAULT_SETTINGS, ...file.settings };
  const saveSettings = (patch, msg) => (canEdit ? act(() => shiurimApi('PUT', '/settings', { settings: patch }), msg) : null);
  const empty = isEmpty(file);
  const byId = Object.fromEntries(file.shiurim.map((s) => [s.id, s]));
  const peopleById = Object.fromEntries(file.people.map((p) => [p.id, p]));
  const toggleSlide = (type) => onUpdateSlides?.(slides.map((s) => (s.type === type ? { ...s, enabled: !s.enabled } : s)));

  // ── saving ──
  const prevChange = (id) => (file.changes?.[today] || {})[id];
  // Undo of a one-day change: put the earlier change back, or reset when there was none
  const todayAction = async (body, msg) => {
    const p = prevChange(body.shiurId);
    setBusy(true);
    try {
      const next = await shiurimApi('POST', '/today', body);
      setFile(next);
      notify(msg, 'success', {
        label: 'Undo',
        onClick: async () => {
          try { setFile(p ? await shiurimApi('POST', '/restore', { upsert: { changes: { [today]: { [body.shiurId]: p } } } }) : await shiurimApi('POST', '/today', { op: 'reset', shiurId: body.shiurId })); notify('Undone', 'success'); } catch (e) { notify(e.message, 'error'); }
        },
      });
      return true;
    } catch (e) { notify(e.message, 'error'); return false; } finally { setBusy(false); }
  };

  const saveShiur = async ({ body, newPerson }, id) => {
    setBusy(true);
    try {
      let pid = body.personId; let createdPerson = null;
      if (newPerson) {
        const r = await shiurimApi('POST', '/people', hasHeb(newPerson) && !/[A-Za-z]/.test(newPerson) ? { nameHe: newPerson } : { name: newPerson });
        pid = r.id; createdPerson = r.id;
      }
      const prev = id ? byId[id] : null;
      const r = id ? await shiurimApi('PUT', `/shiurim/${id}`, { ...body, personId: pid }) : await shiurimApi('POST', '/shiurim', { ...body, personId: pid });
      setFile(r);
      setShiurSheet(null);
      notify(id ? 'Shiur saved' : 'Shiur added', 'success', { label: 'Undo', onClick: () => undoRestore(id ? { upsert: { shiurim: [prev] } } : { remove: { shiurim: [r.id], people: createdPerson ? [createdPerson] : [] } }, setFile) });
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };
  const deleteShiur = async (s) => {
    const ok = await act(() => shiurimApi('DELETE', `/shiurim/${s.id}`), `'${nameOf(s)}' deleted`, { upsert: { shiurim: [s] } });
    if (ok) setShiurSheet(null);
  };
  const duplicateShiur = async (body) => {
    const r = await act(() => shiurimApi('POST', '/shiurim', body), 'Copy added');
    if (r) { const copyRec = r.shiurim[r.shiurim.length - 1]; setShiurSheet({ initial: copyRec }); }
  };
  const savePerson = async (body, id) => {
    const prev = id ? peopleById[id] : null;
    const r = await act(() => (id ? shiurimApi('PUT', `/people/${id}`, body) : shiurimApi('POST', '/people', body)), id ? 'Saved' : `${body.name || body.nameHe} added`, id ? { upsert: { people: [prev] } } : null);
    if (r) setPersonSheet(null);
  };
  const deletePerson = async (p) => {
    const gone = file.shiurim.filter((s) => s.personId === p.id);
    const r = await act(() => shiurimApi('DELETE', `/people/${p.id}`), `${personName(p)} deleted`, { upsert: { people: [p], shiurim: gone } });
    if (r) setPersonSheet(null);
  };
  const movePerson = (p, dir) => act(() => shiurimApi('POST', `/people/${p.id}/move`, { dir }));
  const removePhoto = async (kind, rec) => { await act(() => shiurimApi('DELETE', `/${kind}/${rec.id}/photo`), 'Photo removed'); };
  const saveGuest = async (body, id) => {
    const prev = id ? file.guests.find((g) => g.id === id) : null;
    setBusy(true);
    try {
      const r = id ? await shiurimApi('PUT', `/guests/${id}`, body) : await shiurimApi('POST', '/guests', body);
      setFile(r); setGuestSheet(null);
      notify(id ? 'Guest speaker saved' : 'Guest speaker posted', 'success', { label: 'Undo', onClick: () => undoRestore(id ? { upsert: { guests: [prev] } } : { remove: { guests: [r.id] } }, setFile) });
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };
  const deleteGuest = async (g) => {
    const r = await act(() => shiurimApi('DELETE', `/guests/${g.id}`), `${g.name || g.nameHe} removed`, { upsert: { guests: [g] } });
    if (r) setGuestSheet(null);
  };
  const toggleShiur = (s) => act(() => shiurimApi('PUT', `/shiurim/${s.id}`, { enabled: s.enabled === false }), s.enabled === false ? `'${nameOf(s)}' is on` : `'${nameOf(s)}' is off`, { upsert: { shiurim: [s] } });

  // ── cards ──
  const onOff = (
    <div style={card} data-testid="shiurim-onoff">
      <h3 style={h3}>On the screen</h3>
      {canEditSlides && rowSlide
        ? <SwitchRow on={!!rowSlide.enabled} onChange={() => toggleSlide('SHIURIM')} label="Show the shiurim on the screen" note="Today's list and the week. It skips itself when there is nothing to show." testId="shiurim-slide-switch" />
        : <p style={small}>The shiurim slide is {rowSlide ? (rowSlide.enabled ? 'on' : 'off') : 'not in the slide list yet'}. {canEditSlides ? '' : 'Someone who can change slides switches it on or off.'}</p>}
      {canEditSlides && guestSlide
        ? <SwitchRow on={!!guestSlide.enabled} onChange={() => toggleSlide('SPEAKER')} label="Show guest speakers on the screen" note={`A guest card appears ${settings.guestLeadDays} days ahead and goes after the talk. Nothing shows when no guest is announced.`} testId="speaker-slide-switch" />
        : <p style={small}>The guest speaker slide is {guestSlide ? (guestSlide.enabled ? 'on' : 'off') : 'not in the slide list yet'}.</p>}
      <Field label="When the shiurim slide shows" hint={settings.showWhen === 'always' ? 'In the rotation whenever there is a shiur to show.' : `Only between ${fmtHHMM(settings.hoursFrom)} and ${fmtHHMM(settings.hoursTo)}.`} style={{ marginTop: '4px' }}>
        <Choices ariaLabel="When the shiurim slide shows" value={settings.showWhen} onChange={(v) => saveSettings({ showWhen: v }, `Shows: ${labelOf(WHEN, v).toLowerCase()}`)} options={WHEN.map(([value, label]) => ({ value, label }))} />
      </Field>
      {settings.showWhen === 'hours' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Field label="From"><input type="time" aria-label="Show from" value={settings.hoursFrom} disabled={!canEdit} onChange={(e) => e.target.value && saveSettings({ hoursFrom: e.target.value }, `Shows from ${fmtHHMM(e.target.value)}`)} style={{ ...fieldStyle, maxWidth: '150px' }} /></Field>
          <Field label="Until"><input type="time" aria-label="Show until" value={settings.hoursTo} disabled={!canEdit} onChange={(e) => e.target.value && saveSettings({ hoursTo: e.target.value }, `Shows until ${fmtHHMM(e.target.value)}`)} style={{ ...fieldStyle, maxWidth: '150px' }} /></Field>
        </div>
      )}
    </div>
  );

  const todayRows = (file.todayRows || []).map((r) => ({ ...r, s: byId[r.id] })).filter((r) => r.s);
  const guestsToday = file.guests.filter((g) => g.date === today && !g.archivedAt);
  const todayCard = (
    <div style={card} data-testid="shiurim-today">
      <h3 style={h3}>Today · {longDay(today)}</h3>
      <p style={{ ...small, margin: '0 0 4px' }}>What is on the screen now. A change here is for today only and shows on the TV at once.</p>
      {todayRows.length === 0 && <p style={{ ...small, marginTop: '10px' }}>{file.shiurim.length ? 'No shiurim today.' : 'No shiurim yet. Add one below, or import a list.'}</p>}
      {todayRows.map((r) => {
        const who = r.s.personId ? personName(peopleById[r.s.personId]) : '';
        const hiddenBySchedule = r.reason === 'schedule';
        const cancelled = r.cancelled && r.reason === 'today';
        return (
          <div key={r.id} style={{ ...lineBox, flexWrap: 'wrap', alignItems: 'flex-start' }} data-testid={`today-row-${r.id}`}>
            <div style={{ flex: '1 1 200px', minWidth: 0, fontFamily: adminFonts.englishBody }}>
              <div style={{ fontSize: '15px', color: colors.text, textDecoration: cancelled ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
                <strong>{fmt12(r.start)}</strong> {nameOf(r.s)}{who ? ` · ${who}` : ''}{r.place ? ` · ${r.place}` : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {cancelled && <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: colors.warnSoft, color: colors.text }}>Cancelled today</span>}
                {hiddenBySchedule && <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: colors.editedSoft, color: colors.text }}>Not today: the schedule has no such block today</span>}
                {r.moved && !cancelled && <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: colors.editedSoft, color: colors.text }}>Moved</span>}
                {r.linked && !hiddenBySchedule && <span style={{ fontSize: '12px', padding: '2px 8px', color: colors.dim }}>follows the schedule</span>}
              </div>
            </div>
            {canEdit && !hiddenBySchedule && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {cancelled
                  ? <button type="button" style={btn(false)} disabled={busy} onClick={() => todayAction({ op: 'restore', shiurId: r.id }, `'${nameOf(r.s)}' is back on`)}>Back on</button>
                  : <button type="button" style={btn(false)} disabled={busy} onClick={() => todayAction({ op: 'cancel', shiurId: r.id }, `'${nameOf(r.s)}' cancelled today`)} data-testid={`cancel-${r.id}`}>Cancel today</button>}
                {!cancelled && <button type="button" style={btn(false)} disabled={busy} onClick={() => setMoveCtx({ id: r.id, title: nameOf(r.s), start: String(Math.floor(r.start / 60)).padStart(2, '0') + ':' + String(r.start % 60).padStart(2, '0'), end: r.end != null ? String(Math.floor(r.end / 60)).padStart(2, '0') + ':' + String(r.end % 60).padStart(2, '0') : '', place: r.place, note: r.note })}>Move...</button>}
                {(r.moved || (file.changes?.[today] || {})[r.id]) && <button type="button" style={btn(false)} disabled={busy} onClick={() => todayAction({ op: 'reset', shiurId: r.id }, 'Back to normal')}>Reset</button>}
              </div>
            )}
          </div>
        );
      })}
      {guestsToday.length > 0 && (
        <p style={{ ...small, marginTop: '10px' }}>Guest speaker today: <strong>{guestsToday.map((g) => g.name || g.nameHe).join(', ')}</strong> · <LinkButton onClick={() => { setTab('guests'); }}>see guests</LinkButton></p>
      )}
    </div>
  );

  // ── shiurim by rebbe ──
  const q = query.trim().toLowerCase();
  const match = (s) => !q || [s.title, s.titleHe, s.place, s.placeHe, personName(peopleById[s.personId], 'en'), personName(peopleById[s.personId], 'he')].join(' ').toLowerCase().includes(q);
  const groups = [...file.people.map((p) => ({ p, list: file.shiurim.filter((s) => s.personId === p.id && match(s)) })), { p: null, list: file.shiurim.filter((s) => !s.personId && match(s)) }].filter((g) => g.list.length || (!q && g.p));
  const attention = file.attention || [];
  const shiurimTab = (
    <>
      {attention.length > 0 && (
        <div role="status" style={{ border: `1px solid ${colors.warn}`, background: colors.warnSoft, borderRadius: 'var(--r-sm)', padding: '10px', marginTop: '12px', display: 'grid', gap: '6px' }} data-testid="shiurim-attention">
          {attention.map((a) => <div key={a.shiurId} style={{ ...small, color: colors.text }}>{a.text} {canEdit && byId[a.shiurId] && <LinkButton onClick={() => setShiurSheet({ initial: byId[a.shiurId] })}>Fix</LinkButton>}</div>)}
        </div>
      )}
      {file.shiurim.length > 6 && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shiurim, rebbeim, places" aria-label="Search shiurim" style={{ ...inputBase, marginTop: '12px' }} />}
      {groups.length === 0 && <p style={{ ...small, marginTop: '12px' }}>{q ? 'Nothing matches.' : 'No shiurim yet.'}</p>}
      {groups.map(({ p, list }) => (
        <div key={p?.id || 'none'} style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {p && <Thumb photo={p.photo} name={personName(p)} size={36} />}
            <strong style={{ flex: 1, fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, minWidth: 0, overflowWrap: 'anywhere' }}>{p ? personName(p) : 'No one named'} <span style={small}>({list.length})</span></strong>
            {canEdit && p && <button type="button" style={btn(false)} onClick={() => setShiurSheet({ initial: null, preset: { personId: p.id } })} aria-label={`Add a shiur for ${personName(p)}`}>+ Add</button>}
          </div>
          {list.length === 0 && <p style={{ ...small, margin: '6px 0 0' }}>No shiurim yet.</p>}
          {list.map((s) => (
            <div key={s.id} style={{ ...lineBox, opacity: s.enabled === false ? 0.6 : 1 }} data-testid={`shiur-${s.id}`}>
              <div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody }}>
                <div style={{ fontSize: '15px', color: colors.text, overflowWrap: 'anywhere' }}>{nameOf(s)}{s.title && s.titleHe ? <span dir="rtl" style={{ color: colors.dim, marginInlineStart: '8px', fontFamily: adminFonts.hebrewPrimary }}>{s.titleHe}</span> : null}</div>
                <div style={small}>{whenLabel(s, { entries: file.blocks })}{s.place || s.placeHe ? ` · ${s.place || s.placeHe}` : ''}{s.season ? ` · ${dayLabel(s.season.from)} to ${dayLabel(s.season.until)}` : ''}{s.enabled === false ? ' · off' : ''}</div>
              </div>
              {canEdit && <button type="button" role="switch" aria-checked={s.enabled !== false} aria-label={`${nameOf(s)} on`} onClick={() => toggleShiur(s)} disabled={busy} style={{ ...iconBtn, color: s.enabled !== false ? colors.accent : colors.dim }}>{s.enabled !== false ? '●' : '○'}</button>}
              {canEdit && <button type="button" aria-label={`Edit ${nameOf(s)}`} style={iconBtn} onClick={() => setShiurSheet({ initial: s })}>✎</button>}
            </div>
          ))}
        </div>
      ))}
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          <button type="button" style={btn(true)} onClick={() => setShiurSheet({ initial: null })} data-testid="shiur-add">+ Add a shiur</button>
          <button type="button" style={btn(false)} onClick={() => setImportOpen(true)} data-testid="shiurim-import-open">Import...</button>
          <button type="button" style={btn(false)} disabled={!file.shiurim.length} onClick={() => copy(formatShiurimText(file), 'Shiurim copied as text')}>Copy as text</button>
        </div>
      )}
    </>
  );

  // ── guests ──
  const phases = file.guests.map((g) => ({ g, phase: guestPhase(g, now, settings, file.tz) }));
  const upcoming = phases.filter((x) => x.phase !== 'over' && !x.g.archivedAt).sort((a, b) => a.g.date.localeCompare(b.g.date) || String(a.g.start).localeCompare(String(b.g.start)));
  const past = phases.filter((x) => x.phase === 'over' || x.g.archivedAt).sort((a, b) => b.g.date.localeCompare(a.g.date));
  const statusText = (x) => (x.phase === 'scheduled' ? `Shows from ${dayLabel(x.g.showFrom || addDays(x.g.date, -settings.guestLeadDays))}` : x.phase === 'now' ? 'On the screen now (talk is on)' : x.phase === 'over' ? 'Over' : 'On the screen now');
  const guestRow = (x) => (
    <div key={x.g.id} style={lineBox} data-testid={`guest-${x.g.id}`}>
      <Thumb photo={x.g.photo} name={x.g.name || x.g.nameHe} size={44} />
      <div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody }}>
        <div style={{ fontSize: '15px', color: colors.text, overflowWrap: 'anywhere' }}><strong>{x.g.name || x.g.nameHe}</strong>{x.g.topic ? ` · ${x.g.topic}` : ''}</div>
        <div style={small}>{dayLabel(x.g.date)}{x.g.start ? ` · ${fmtHHMM(x.g.start)}` : ''}{x.g.place ? ` · ${x.g.place}` : ''} · {statusText(x)}</div>
      </div>
      {canEdit && x.phase === 'over' && <button type="button" style={btn(false)} onClick={() => setGuestSheet({ initial: { ...x.g, id: undefined, date: '', showFrom: null, archivedAt: null } })}>Reuse</button>}
      {canEdit && <button type="button" aria-label={`Edit ${x.g.name || x.g.nameHe}`} style={iconBtn} onClick={() => setGuestSheet({ initial: x.g })}>✎</button>}
    </div>
  );
  const guestsTab = (
    <>
      {upcoming.length === 0 && <p style={{ ...small, marginTop: '12px' }}>No guest speaker is announced. Add one: it shows {settings.guestLeadDays} days ahead and goes after the talk.</p>}
      {upcoming.map(guestRow)}
      {canEdit && <div style={{ marginTop: '14px' }}><button type="button" style={btn(true)} onClick={() => setGuestSheet({ initial: null })} data-testid="guest-add">+ Guest speaker</button></div>}
      {past.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <button type="button" style={btn(false)} aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>{showPast ? 'Hide' : 'Show'} past guests ({past.length})</button>
          {showPast && past.map(guestRow)}
          {showPast && <Hint>Past guests are cleared (with their photos) 60 days after the talk.</Hint>}
        </div>
      )}
    </>
  );

  // ── people ──
  const peopleTab = (
    <>
      <Hint>The rebbeim who give shiurim, in the order they show on the By-rebbe page. Add a photo or leave it: without one the screen shows a letter in a circle.</Hint>
      {file.people.length === 0 && <p style={{ ...small, marginTop: '12px' }}>No one yet. Add a person here, or just type a new name when you add a shiur.</p>}
      {file.people.map((p, i) => (
        <div key={p.id} style={lineBox} data-testid={`person-${p.id}`}>
          <Thumb photo={p.photo} name={personName(p)} size={44} />
          <div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody }}>
            <div style={{ fontSize: '15px', color: colors.text, overflowWrap: 'anywhere' }}>{personName(p)}{p.name && p.nameHe ? <span dir="rtl" style={{ color: colors.dim, marginInlineStart: '8px', fontFamily: adminFonts.hebrewPrimary }}>{p.nameHe}</span> : null}</div>
            <div style={small}>{file.shiurim.filter((s) => s.personId === p.id).length} shiurim{p.photo ? ' · photo' : ''}</div>
          </div>
          {canEdit && <button type="button" aria-label={`Move ${personName(p)} up`} disabled={i === 0 || busy} onClick={() => movePerson(p, -1)} style={iconBtn}>↑</button>}
          {canEdit && <button type="button" aria-label={`Move ${personName(p)} down`} disabled={i === file.people.length - 1 || busy} onClick={() => movePerson(p, 1)} style={iconBtn}>↓</button>}
          {canEdit && <button type="button" aria-label={`Edit ${personName(p)}`} style={iconBtn} onClick={() => setPersonSheet({ initial: p })}>✎</button>}
        </div>
      ))}
      {canEdit && <div style={{ marginTop: '14px' }}><button type="button" style={btn(true)} onClick={() => setPersonSheet({ initial: null })} data-testid="person-add">+ Add a person</button></div>}
    </>
  );

  const listCard = (
    <div style={card} data-testid="shiurim-lists">
      <SegmentedControl ariaLabel="Shiurim, guest speakers or people" value={tab} onChange={setTab} options={[
        { value: 'shiurim', label: `Shiurim${file.shiurim.length ? ` · ${file.shiurim.length}` : ''}` },
        { value: 'guests', label: `Guests${upcoming.length ? ` · ${upcoming.length}` : ''}` },
        { value: 'people', label: `People${file.people.length ? ` · ${file.people.length}` : ''}` },
      ]} />
      {tab === 'shiurim' && shiurimTab}
      {tab === 'guests' && guestsTab}
      {tab === 'people' && peopleTab}
    </div>
  );

  const previewAt = (qs) => window.open(`/screen?preview=true${qs}`, '_blank', 'noopener');
  const tomorrow = addDays(today, 1);
  const set1 = (key, label, opts, extra) => (
    <Field label={label} hint={extra} key={key}>
      <Choices ariaLabel={label} value={settings[key]} onChange={(v) => saveSettings({ [key]: v }, `${label}: ${labelOf(opts, v).toLowerCase()}`)} options={opts.map(([value, l]) => ({ value, label: l }))} />
    </Field>
  );
  const whatShows = (
    <Collapsible id="shiurim-what" title="What shows" icon="list" summary={`${labelOf(VIEWS, settings.view)} · ${labelOf(WEEK_BY, settings.weekBy).toLowerCase()}`}>
      {set1('view', 'Pages', VIEWS, "Today is the list of today's shiurim in time order. The week is the cards.")}
      {set1('weekBy', 'The week page', WEEK_BY, "By rebbe: one card per rebbe with their days. By day: one card per day.")}
      {set1('todaySort', "Today's list order", SORT)}
      {set1('past', 'Shiurim that already finished', PAST, "Fading keeps them readable but quiet; hiding leaves only what is still to come.")}
      {set1('cancelledShow', 'A cancelled shiur', CANCELLED, "'Show Cancelled' keeps the row with a Cancelled mark so nobody walks to an empty room.")}
      {set1('whenNone', 'On a day with no shiur', NONE)}
      {set1('language', 'Language', LANG)}
      <SwitchRow on={settings.showPhotos} onChange={() => saveSettings({ showPhotos: !settings.showPhotos }, settings.showPhotos ? 'Photos hidden' : 'Photos shown')} label="Show photos" note="Off means no photo column at all, so the text gets wider." />
      <SwitchRow on={settings.showPlace} onChange={() => saveSettings({ showPlace: !settings.showPlace }, settings.showPlace ? 'Places hidden' : 'Places shown')} label="Show the place (room)" />
      <SwitchRow on={settings.showOnSchedule} onChange={() => saveSettings({ showOnSchedule: !settings.showOnSchedule }, settings.showOnSchedule ? 'Rebbe names off the schedule' : 'Rebbe names on the schedule')} label="Show the rebbe's name on the schedule" note="Under a shiur linked to a schedule block, for example 'Rabbi Cohen · Beis Medrash'." />
      <SwitchRow on={settings.liveView} onChange={() => saveSettings({ liveView: !settings.liveView }, settings.liveView ? 'Photos off the live link' : 'Photos on the live link')} label="Photos on the public live link" note="Names always show on the live link (they are on the TV too). This only decides about photos." />
    </Collapsible>
  );
  const guestSettings = (
    <Collapsible id="shiurim-guests" title="Guest speakers" icon="user" summary={`Shows ${settings.guestLeadDays} days ahead${settings.guestAfterMin ? `, stays ${settings.guestAfterMin} min after` : ''}`}>
      <Field label="Days ahead it shows" hint="A guest is announced this many days before the talk (0 to 14). Each guest can also pick its own first day.">
        <NumberField value={settings.guestLeadDays} min={0} max={14} onCommit={(n) => saveSettings({ guestLeadDays: n }, `Guests show ${n} day${n === 1 ? '' : 's'} ahead`)} ariaLabel="Days ahead" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
      </Field>
      <Field label="Keep it up after the talk ends (minutes)" hint="0 removes the card the minute the talk is over.">
        <NumberField value={settings.guestAfterMin} min={0} max={240} onCommit={(n) => saveSettings({ guestAfterMin: n }, `Guests stay ${n} minutes after`)} ariaLabel="Minutes after the talk" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
      </Field>
      <SwitchRow on={settings.guestBio} onChange={() => saveSettings({ guestBio: !settings.guestBio }, settings.guestBio ? 'Bios hidden' : 'Bios shown')} label="Show the short bio" note="Only when it fits big enough to read across the room." />
      <SwitchRow on={settings.guestQr} onChange={() => saveSettings({ guestQr: !settings.guestQr }, settings.guestQr ? 'QR codes hidden' : 'QR codes shown')} label="Show the QR code when a guest has a link" />
    </Collapsible>
  );

  return (
    <Page intro="Who gives which shiur, where and when, and guest speakers. Rebbeim and guests only: please do not put student names here.">
      {empty && (
        <div style={{ ...card, borderColor: colors.accent }} data-testid="shiurim-empty">
          <h3 style={h3}>Nothing here yet</h3>
          <p style={{ ...small, margin: 0 }}>Add a shiur below, or import your list. Until there is something to show the screen skips these slides.</p>
        </div>
      )}
      {!canEdit && <Hint>You can look at the shiurim but not change them.</Hint>}
      {onOff}
      {todayCard}
      {listCard}
      <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
        {whatShows}
        {guestSettings}
        <Collapsible id="shiurim-preview" title="Preview" icon="play" summary="See it on the screen">
          <Hint style={{ marginTop: 0 }}>Opens a preview of the screen. Nothing changes on the real TV. A slide only appears when it is switched on above and in the slide list.</Hint>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button type="button" style={btn(false)} onClick={() => previewAt('')}>Now</button>
            <button type="button" style={btn(false)} onClick={() => previewAt(`&previewDate=${tomorrow}`)}>Tomorrow ({dayLabel(tomorrow)})</button>
          </div>
          <Hint>Slides: <LinkButton onClick={() => onNavigate?.('slides')}>set their seconds and order</LinkButton>.</Hint>
        </Collapsible>
      </div>

      <ShiurSheet open={!!shiurSheet} onClose={() => setShiurSheet(null)} file={file} initial={shiurSheet?.initial} preset={shiurSheet?.preset} busy={busy} onSave={saveShiur} onDelete={deleteShiur} onDuplicate={duplicateShiur} />
      <PersonSheet open={!!personSheet} onClose={() => setPersonSheet(null)} initial={personSheet?.initial} busy={busy} onSave={savePerson} onDelete={deletePerson} onRemovePhoto={(p) => removePhoto('people', p)} shiurCount={personSheet?.initial ? file.shiurim.filter((s) => s.personId === personSheet.initial.id).length : 0} />
      <GuestSheet open={!!guestSheet} onClose={() => setGuestSheet(null)} file={file} initial={guestSheet?.initial} busy={busy} canTakeover={canTakeover} onSave={saveGuest} onDelete={deleteGuest} onRemovePhoto={(g) => removePhoto('guests', g)} />
      <MoveSheet open={!!moveCtx} onClose={() => setMoveCtx(null)} ctx={moveCtx} busy={busy} onSave={async (b) => { if (await todayAction(b, `'${moveCtx.title}' moved for today`)) setMoveCtx(null); }} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} file={file} copyText={copy}
        onDone={(r, msg) => {
          setImportOpen(false);
          const prev = file;
          setFile(r);
          const before = new Set(prev.shiurim.map((s) => s.id));
          const peopleBefore = new Set(prev.people.map((p) => p.id));
          notify(msg, 'success', { label: 'Undo', onClick: () => undoRestore({ upsert: { shiurim: prev.shiurim, people: prev.people }, remove: { shiurim: r.shiurim.filter((s) => !before.has(s.id)).map((s) => s.id), people: r.people.filter((p) => !peopleBefore.has(p.id)).map((p) => p.id) } }, setFile) });
        }} />
      {modal}
    </Page>
  );
}
