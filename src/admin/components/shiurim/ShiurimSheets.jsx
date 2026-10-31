// The sheets of Screen > Shiurim: one shiur, one guest speaker, one person, a one-day move, and the import. All text is React
// text; the server validates again (src/shared/shiurim.js is the one normaliser). Phone first: 16 px inputs, 44 px targets, a
// sticky Save.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import { Field, Hint } from '../look/kit.jsx';
import { readFileRows } from '../menu/MenuSheets.jsx';
import {
  btn, small, Chip, inputBase, heInput, DayChips, TimeField, PersonPicker, PhotoField, shiurimApi,
} from './shiurimKit.jsx';
import { GUEST_TITLES, IMPORT_EXAMPLE } from '../../../shared/shiurimCopy.js';
import {
  LIMITS, guestWindow, fmtHHMM, dayRangeLabel, parseShiurimInput, shiurimClaudePrompt, hm,
} from '../../../shared/shiurim.js';

const block = { border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px', display: 'grid', gap: '10px' };
const sticky = { position: 'sticky', bottom: 0, display: 'flex', gap: '8px', padding: '10px 0', background: colors.card, borderTop: `1px solid ${colors.line}`, flexWrap: 'wrap' };
const radio = { display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text };
const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

function PlaceField({ place, placeHe, setPlace, setPlaceHe, places }) {
  const [he, setHe] = useState(!!placeHe);
  return (
    <Field label="Where" hint="The room, in English, Hebrew or both. Tap a recent one to reuse it." style={{ marginTop: 0 }}>
      <div style={{ display: 'grid', gap: '8px' }}>
        <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={LIMITS.place} aria-label="Where, in English" placeholder="Beis Medrash" style={inputBase} />
        {(he || placeHe) ? <input value={placeHe} onChange={(e) => setPlaceHe(e.target.value)} maxLength={LIMITS.place} dir="rtl" aria-label="Where, in Hebrew" placeholder="בעברית (optional)" style={heInput} />
          : <button type="button" style={btn(false, { justifySelf: 'start' })} onClick={() => setHe(true)}>+ Hebrew</button>}
        {places.length > 0 && <div aria-label="Recent places" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{places.map((p) => <Chip key={p} on={place === p} onClick={() => setPlace(p)}>{p}</Chip>)}</div>}
      </div>
    </Field>
  );
}

// ── one shiur ─────────────────────────────────────────────────────────────────

export function ShiurSheet({ open, onClose, file, initial, busy, onSave, onDelete, onDuplicate, preset }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!open) return;
    const s = initial || {};
    setF({
      personId: s.personId ?? preset?.personId ?? null, newName: '', title: s.title || '', titleHe: s.titleHe || '', place: s.place || '', placeHe: s.placeHe || '', note: s.note || '',
      kind: s.when?.kind === 'linked' ? 'linked' : 'weekly', days: s.when?.days || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], start: s.when?.start || '', end: s.when?.end || '',
      entry: s.when?.kind === 'linked' ? (s.when.entryId || s.when.entryName || s.when.entryNameHe) : '', linkNames: s.when?.kind === 'linked' ? { entryName: s.when.entryName, entryNameHe: s.when.entryNameHe, entryId: s.when.entryId } : null,
      season: !!s.season, from: s.season?.from || '', until: s.season?.until || '', enabled: s.enabled !== false, groups: s.groups || [], more: !!(s.season || s.note),
    });
  }, [open, initial, preset]);
  if (!f) return null;
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const blocks = file.blocks || [];
  const groups = file.groups || [];
  const chosen = blocks.find((b) => (b.id || b.name || b.nameHe) === f.entry);
  const gone = f.kind === 'linked' && f.entry && !chosen;
  const person = file.people.find((p) => p.id === f.personId);
  const who = person ? (person.name || person.nameHe) : f.newName.trim();
  const whenText = f.kind === 'linked'
    ? (chosen ? `${chosen.name || chosen.nameHe}${chosen.time ? ` ${fmtHHMM(chosen.time)}` : ''} (follows the schedule)` : '(pick a block)')
    : `${dayRangeLabel(f.days) || '(pick days)'} ${f.start ? fmtHHMM(f.start) : ''}${f.end ? ` - ${fmtHHMM(f.end)}` : ''}`;
  const sentence = [who, f.title || f.titleHe, f.place || f.placeHe, whenText].filter(Boolean).join(' · ');
  const timeErr = f.kind === 'weekly' && f.start && f.end && hm(f.end) <= hm(f.start) ? 'The end time must be after the start time.' : '';
  const ready = (f.title.trim() || f.titleHe.trim()) && (f.kind === 'linked' ? !!chosen || (!!f.linkNames && !!f.entry) : f.days.length > 0 && !!f.start && !timeErr) && !(f.season && (!f.from || !f.until || f.until < f.from));
  const body = () => ({
    personId: f.personId, title: f.title.trim(), titleHe: f.titleHe.trim(), place: f.place.trim(), placeHe: f.placeHe.trim(), note: f.note.trim(), enabled: f.enabled,
    groups: f.kind === 'weekly' ? f.groups : [], season: f.season ? { from: f.from, until: f.until } : null,
    when: f.kind === 'linked'
      ? { kind: 'linked', entryId: chosen?.id || f.linkNames?.entryId || '', entryName: chosen?.name || f.linkNames?.entryName || '', entryNameHe: chosen?.nameHe || f.linkNames?.entryNameHe || '' }
      : { kind: 'weekly', days: f.days, start: f.start, end: f.end || '' },
  });
  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit shiur' : 'Add a shiur'}>
      <div style={{ display: 'grid', gap: '14px', paddingBottom: '90px' }}>
        <PersonPicker people={file.people} value={f.personId} onChange={(v) => set({ personId: v })} newName={f.newName} onNewName={(v) => set({ newName: v })} />
        <Field label="What" hint="The name of the shiur. Students' names do not belong here." style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={LIMITS.title} aria-label="Shiur name in English" placeholder="Gemara - Bava Metzia" style={inputBase} data-testid="shiur-title" />
            <input value={f.titleHe} onChange={(e) => set({ titleHe: e.target.value })} maxLength={LIMITS.title} dir="rtl" aria-label="Shiur name in Hebrew" placeholder="בעברית (optional)" style={heInput} />
          </div>
        </Field>
        <PlaceField place={f.place} placeHe={f.placeHe} setPlace={(v) => set({ place: v })} setPlaceHe={(v) => set({ placeHe: v })} places={file.places || []} />

        <Field label="When" style={{ marginTop: 0 }}>
          <div role="radiogroup" aria-label="When" style={{ display: 'grid', gap: '4px' }}>
            <label style={radio}><input type="radio" name="sh-kind" checked={f.kind === 'weekly'} onChange={() => set({ kind: 'weekly' })} style={{ width: '22px', height: '22px' }} />Its own days and time</label>
            <label style={{ ...radio, opacity: blocks.length ? 1 : 0.55 }}><input type="radio" name="sh-kind" disabled={!blocks.length && !f.entry} checked={f.kind === 'linked'} onChange={() => set({ kind: 'linked' })} style={{ width: '22px', height: '22px' }} />Same as a schedule block (the time always matches the schedule)</label>
          </div>
          {f.kind === 'weekly' ? (
            <div style={{ display: 'grid', gap: '10px', marginTop: '8px' }}>
              <DayChips value={f.days} onChange={(d) => set({ days: d })} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                <TimeField label="Start" value={f.start} onChange={(v) => set({ start: v })} />
                <TimeField label="End" value={f.end} onChange={(v) => set({ end: v })} optional />
              </div>
              {timeErr && <Hint style={{ color: colors.danger, marginTop: 0 }}>{timeErr}</Hint>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
              <select value={f.entry} onChange={(e) => set({ entry: e.target.value })} aria-label="Schedule block" style={inputBase} data-testid="shiur-block">
                <option value="">Pick a block...</option>
                {gone && <option value={f.entry}>{f.linkNames?.entryName || f.linkNames?.entryNameHe} (deleted from the schedule)</option>}
                {blocks.map((b) => <option key={b.id || b.name} value={b.id || b.name || b.nameHe}>{b.name || b.nameHe}{b.time ? ` · ${fmtHHMM(b.time)}` : ''}{Array.isArray(b.days) && b.days.length ? ` · ${dayRangeLabel(b.days)}` : ''}</option>)}
              </select>
              {gone && <Hint style={{ color: colors.danger, marginTop: 0 }}>This block was deleted from the schedule, so the shiur is hidden on the screen. Pick another block or switch to its own time.</Hint>}
              <Hint style={{ marginTop: 0 }}>If the schedule changes that block for one day, or removes it, the shiur follows (it is left out that day).</Hint>
            </div>
          )}
        </Field>

        {groups.length > 0 && f.kind === 'weekly' && (
          <Field label="Who is it for?" hint="Leave all off for everyone." style={{ marginTop: 0 }}>
            <div role="group" aria-label="Who it is for" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {groups.map((g) => <Chip key={g.id} on={f.groups.includes(g.id)} onClick={() => set({ groups: f.groups.includes(g.id) ? f.groups.filter((x) => x !== g.id) : [...f.groups, g.id] })}>{g.name}</Chip>)}
            </div>
          </Field>
        )}

        <div>
          <button type="button" style={btn(false)} aria-expanded={f.more} onClick={() => set({ more: !f.more })}>{f.more ? 'Fewer options' : 'More options'}</button>
          {f.more && (
            <div style={{ ...block, marginTop: '10px' }}>
              <label style={radio}><input type="checkbox" checked={f.season} onChange={(e) => set({ season: e.target.checked })} style={{ width: '22px', height: '22px' }} />Only during certain dates (a winter or summer zman)</label>
              {f.season && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                  <label style={{ ...small, display: 'grid', gap: '4px' }}>From<input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} style={inputBase} /></label>
                  <label style={{ ...small, display: 'grid', gap: '4px' }}>Until (included)<input type="date" value={f.until} onChange={(e) => set({ until: e.target.value })} style={inputBase} /></label>
                </div>
              )}
              <Field label="Note on the row (optional)" hint="A few words shown under the shiur, for example 'Bring a Gemara'." style={{ marginTop: 0 }}>
                <input value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={LIMITS.note} aria-label="Note" style={inputBase} />
              </Field>
              <label style={radio}><input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ width: '22px', height: '22px' }} />This shiur is on (off keeps it saved but not shown)</label>
            </div>
          )}
        </div>
        <p style={{ ...small, margin: 0, fontWeight: 600 }} data-testid="shiur-sentence">On the screen: {sentence || '...'}</p>
      </div>
      <div style={sticky}>
        <button type="button" style={btn(true, { flex: 1, opacity: ready && !busy ? 1 : 0.5 })} disabled={!ready || busy} onClick={() => onSave({ body: body(), newPerson: f.personId ? '' : f.newName.trim() }, initial?.id)} data-testid="shiur-save">Save</button>
        {initial && <button type="button" style={btn(false)} disabled={busy} onClick={() => onDuplicate({ ...body(), personId: f.personId })}>Duplicate</button>}
        {initial && <button type="button" style={btn(false, { color: colors.danger })} disabled={busy} onClick={() => onDelete(initial)}>Delete</button>}
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── one person ────────────────────────────────────────────────────────────────

export function PersonSheet({ open, onClose, initial, busy, onSave, onDelete, onRemovePhoto, shiurCount }) {
  const [f, setF] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (open) { setF({ name: initial?.name || '', nameHe: initial?.nameHe || '', photo: initial?.photo || null }); setConfirm(false); } }, [open, initial]);
  if (!f) return null;
  const ready = f.name.trim() || f.nameHe.trim();
  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit person' : 'Add a person'}>
      <div style={{ display: 'grid', gap: '14px', paddingBottom: '90px' }}>
        <Field label="Name" hint="Rabbi, Rav or any title, exactly as the screen should say it. Rebbeim and teachers only: no students." style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={LIMITS.name} aria-label="Name in English" placeholder="Rabbi Cohen" style={inputBase} data-testid="person-name" />
            <input value={f.nameHe} onChange={(e) => setF({ ...f, nameHe: e.target.value })} maxLength={LIMITS.name} dir="rtl" aria-label="Name in Hebrew" placeholder="בעברית (optional)" style={heInput} />
          </div>
        </Field>
        <PhotoField photo={f.photo} onChange={(p) => setF({ ...f, photo: p })} onRemoveSaved={initial?.photo ? async () => { await onRemovePhoto(initial); setF((p) => ({ ...p, photo: null })); } : undefined} name={f.name || f.nameHe} />
        {confirm && (
          <div role="alertdialog" aria-label="Delete this person" style={{ border: `1px solid ${colors.danger}`, borderRadius: 'var(--r-sm)', padding: '10px' }}>
            <p style={{ ...small, margin: '0 0 8px', color: colors.text }}>Delete {initial.name || initial.nameHe}{shiurCount ? ` and their ${shiurCount} shiur${shiurCount === 1 ? '' : 'im'}` : ''}? You can undo it right after.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={btn(true, { background: colors.danger })} disabled={busy} onClick={() => onDelete(initial)}>Delete</button>
              <button type="button" style={btn(false)} onClick={() => setConfirm(false)}>Keep</button>
            </div>
          </div>
        )}
      </div>
      <div style={sticky}>
        <button type="button" style={btn(true, { flex: 1, opacity: ready && !busy ? 1 : 0.5 })} disabled={!ready || busy} onClick={() => onSave({ name: f.name.trim(), nameHe: f.nameHe.trim(), photo: f.photo }, initial?.id)} data-testid="person-save">Save</button>
        {initial && <button type="button" style={btn(false, { color: colors.danger })} onClick={() => setConfirm(true)}>Delete</button>}
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── one guest speaker ─────────────────────────────────────────────────────────

export function GuestSheet({ open, onClose, file, initial, busy, canTakeover, onSave, onDelete, onRemovePhoto }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!open) return;
    const g = initial;
    const last = [...file.guests].filter((x) => x.start).sort((a, b) => b.date.localeCompare(a.date))[0];
    const plus = (n) => { const d = new Date(`${file.today}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    setF({
      name: g?.name || '', nameHe: g?.nameHe || '', title: g?.title ?? '', titleHe: g?.titleHe ?? '', topic: g?.topic || '', topicHe: g?.topicHe || '', bio: g?.bio || '', bioHe: g?.bioHe || '',
      place: g?.place ?? last?.place ?? '', placeHe: g?.placeHe ?? last?.placeHe ?? '', date: g?.date || plus(3), start: g ? g.start : (last?.start || ''), end: g ? g.end : (last?.end || ''),
      showFrom: g?.showFrom || '', ownFrom: !!g?.showFrom, photo: g?.photo || null, link: g?.link || '',
      takeoverOn: !!g?.takeover?.on, takeoverMin: g?.takeover?.minutes || 10, takeoverAt: g?.takeover?.at || '', banner: !!g?.banner, more: !!(g?.bio || g?.bioHe || g?.link || g?.takeover?.on || g?.banner || g?.showFrom),
    });
  }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const timeErr = f.end && (!f.start || hm(f.end) <= hm(f.start)) ? (f.start ? 'The end time must be after the start time.' : 'Add a start time first.') : '';
  const linkErr = f.link && !/^https:\/\/[^\s/]+\.[^\s/]+/i.test(f.link.trim()) ? 'The link must be a full https:// address.' : '';
  const fromErr = f.ownFrom && f.showFrom && f.showFrom > f.date ? '"Shows from" must be on or before the day of the talk.' : '';
  const ready = (f.name.trim() || f.nameHe.trim()) && f.date && !timeErr && !linkErr && !fromErr;
  const guest = { id: 'preview', name: f.name, nameHe: f.nameHe, date: f.date, start: f.start, end: f.end, showFrom: f.ownFrom && f.showFrom ? f.showFrom : null };
  let win = null;
  try { win = guestWindow(guest, file.settings, file.tz); } catch { /* shown without a preview */ }
  const when = (d) => d.toLocaleString(undefined, { timeZone: file.tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const kicker = f.title.trim() || 'Guest speaker';
  const apply = () => onSave({
    name: f.name.trim(), nameHe: f.nameHe.trim(), title: f.title.trim(), titleHe: f.titleHe.trim(), topic: f.topic.trim(), topicHe: f.topicHe.trim(), bio: f.bio.trim(), bioHe: f.bioHe.trim(),
    place: f.place.trim(), placeHe: f.placeHe.trim(), date: f.date, start: f.start, end: f.end, showFrom: f.ownFrom && f.showFrom ? f.showFrom : null, photo: f.photo, link: f.link.trim(),
    takeover: { on: canTakeover && f.takeoverOn, minutes: f.takeoverMin, at: f.takeoverAt || null }, banner: f.banner,
  }, initial?.id);
  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? 'Edit guest speaker' : 'Guest speaker'}>
      <div style={{ display: 'grid', gap: '14px', paddingBottom: '90px' }}>
        <Field label="Name" hint="As the screen should say it, with Rabbi / Rav / Dr. if you like." style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={LIMITS.name} aria-label="Speaker name in English" placeholder="Rabbi Guest" style={inputBase} data-testid="guest-name" />
            <input value={f.nameHe} onChange={(e) => set({ nameHe: e.target.value })} maxLength={LIMITS.name} dir="rtl" aria-label="Speaker name in Hebrew" placeholder="בעברית (optional)" style={heInput} />
          </div>
        </Field>
        <Field label="Heading above the name" hint="Pick one, or type your own. Empty says 'Guest speaker'." style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <div role="group" aria-label="Heading" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {GUEST_TITLES.map((t) => <Chip key={t.en} on={f.title === t.en} onClick={() => set({ title: t.en, titleHe: t.he })}>{t.en}</Chip>)}
            </div>
            <input value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={LIMITS.title} aria-label="Heading in English" placeholder="Guest speaker" style={inputBase} />
            <input value={f.titleHe} onChange={(e) => set({ titleHe: e.target.value })} maxLength={LIMITS.title} dir="rtl" aria-label="Heading in Hebrew" placeholder="אורח מכובד" style={heInput} />
          </div>
        </Field>
        <Field label="Topic (optional)" style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <input value={f.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={LIMITS.topic} aria-label="Topic in English" placeholder="Emunah in hard times" style={inputBase} />
            <input value={f.topicHe} onChange={(e) => set({ topicHe: e.target.value })} maxLength={LIMITS.topic} dir="rtl" aria-label="Topic in Hebrew" placeholder="בעברית (optional)" style={heInput} />
          </div>
        </Field>
        <PhotoField photo={f.photo} onChange={(p) => set({ photo: p })} onRemoveSaved={initial?.photo ? async () => { await onRemovePhoto(initial); set({ photo: null }); } : undefined} name={f.name || f.nameHe} />
        <Field label="When" style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            <label style={{ ...small, display: 'grid', gap: '4px' }}>Date<input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} style={inputBase} aria-label="Date" data-testid="guest-date" /></label>
            <TimeField label="Start" value={f.start} onChange={(v) => set({ start: v })} optional />
            <TimeField label="End" value={f.end} onChange={(v) => set({ end: v })} optional />
          </div>
          {timeErr && <Hint style={{ color: colors.danger }}>{timeErr}</Hint>}
        </Field>
        <PlaceField place={f.place} placeHe={f.placeHe} setPlace={(v) => set({ place: v })} setPlaceHe={(v) => set({ placeHe: v })} places={file.places || []} />

        <div style={{ ...block, background: colors.bg }} data-testid="guest-preview" aria-label="How it will look">
          <span style={{ ...small, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: colors.accent }}>{kicker}</span>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '22px', fontWeight: 800, color: colors.text, overflowWrap: 'anywhere' }}>{f.name || f.nameHe || 'Name'}</span>
          {(f.topic || f.topicHe) && <span style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, overflowWrap: 'anywhere' }}>{f.topic || f.topicHe}</span>}
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, color: colors.text }}>{fmtDay(f.date)}{f.start ? ` · ${fmtHHMM(f.start)}` : ''}{f.place ? ` · ${f.place}` : ''}</span>
          {win && <span style={small}>Shows on the screen from {when(win.from)} until {when(win.over)}.</span>}
        </div>

        <div>
          <button type="button" style={btn(false)} aria-expanded={f.more} onClick={() => set({ more: !f.more })}>{f.more ? 'Fewer options' : 'More options'}</button>
          {f.more && (
            <div style={{ ...block, marginTop: '10px' }}>
              <label style={radio}><input type="checkbox" checked={f.ownFrom} onChange={(e) => set({ ownFrom: e.target.checked, showFrom: e.target.checked ? (f.showFrom || f.date) : '' })} style={{ width: '22px', height: '22px' }} />Pick the first day it shows (otherwise {file.settings.guestLeadDays} days before)</label>
              {f.ownFrom && <label style={{ ...small, display: 'grid', gap: '4px' }}>Shows from<input type="date" value={f.showFrom} max={f.date} onChange={(e) => set({ showFrom: e.target.value })} style={inputBase} aria-label="Shows from" /></label>}
              {fromErr && <Hint style={{ color: colors.danger, marginTop: 0 }}>{fromErr}</Hint>}
              <Field label="Short bio (optional)" hint="Shown only if it fits big enough to read across the room. Up to 200 characters." style={{ marginTop: 0 }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <textarea value={f.bio} onChange={(e) => set({ bio: e.target.value })} maxLength={LIMITS.bio} rows={3} aria-label="Bio in English" style={{ ...inputBase, resize: 'vertical' }} />
                  <textarea value={f.bioHe} onChange={(e) => set({ bioHe: e.target.value })} maxLength={LIMITS.bio} rows={2} dir="rtl" aria-label="Bio in Hebrew" placeholder="בעברית (optional)" style={{ ...heInput, resize: 'vertical' }} />
                </div>
              </Field>
              <Field label="Link for a QR code (optional)" hint="A sign-up or info page. It shows as a QR code people scan with a phone. https:// only." style={{ marginTop: 0 }}>
                <input value={f.link} onChange={(e) => set({ link: e.target.value })} maxLength={LIMITS.link} inputMode="url" aria-label="Link" placeholder="https://" style={inputBase} />
                {linkErr && <Hint style={{ color: colors.danger }}>{linkErr}</Hint>}
              </Field>
              <label style={radio}><input type="checkbox" checked={f.banner} onChange={(e) => set({ banner: e.target.checked })} style={{ width: '22px', height: '22px' }} />Also a banner on the day</label>
              <label style={{ ...radio, opacity: canTakeover ? 1 : 0.55 }}><input type="checkbox" disabled={!canTakeover} checked={canTakeover && f.takeoverOn} onChange={(e) => set({ takeoverOn: e.target.checked })} style={{ width: '22px', height: '22px' }} />Full screen for a few minutes on the day{canTakeover ? '' : ' (needs the takeover permission)'}</label>
              {canTakeover && f.takeoverOn && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  <label style={{ ...small, display: 'grid', gap: '4px' }}>Minutes<select value={f.takeoverMin} onChange={(e) => set({ takeoverMin: Number(e.target.value) })} style={inputBase} aria-label="Takeover minutes">{[1, 2, 5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                  <TimeField label="At" value={f.takeoverAt} onChange={(v) => set({ takeoverAt: v })} optional />
                </div>
              )}
              {canTakeover && f.takeoverOn && <Hint style={{ marginTop: 0 }}>Empty 'At' means 15 minutes before it starts (9:00 AM if there is no start time).</Hint>}
            </div>
          )}
        </div>
      </div>
      <div style={sticky}>
        <button type="button" style={btn(true, { flex: 1, opacity: ready && !busy ? 1 : 0.5 })} disabled={!ready || busy} onClick={apply} data-testid="guest-save">{initial?.id ? 'Save' : 'Post'}</button>
        {initial?.id && <button type="button" style={btn(false, { color: colors.danger })} disabled={busy} onClick={() => onDelete(initial)}>Delete</button>}
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── move / note one shiur today ───────────────────────────────────────────────

export function MoveSheet({ open, onClose, ctx, busy, onSave }) {
  const [f, setF] = useState({ start: '', end: '', place: '', note: '' });
  useEffect(() => { if (open && ctx) setF({ start: ctx.start || '', end: ctx.end || '', place: ctx.place || '', note: ctx.note || '' }); }, [open, ctx]);
  if (!ctx) return null;
  // moving the start keeps the shiur as long as it was (a new start after the old end would otherwise leave an impossible end time)
  const dur = ctx.start && ctx.end ? hm(ctx.end) - hm(ctx.start) : null;
  const setStart = (v) => {
    const s = hm(v);
    const e = dur && s != null && s + dur < 24 * 60 ? `${String(Math.floor((s + dur) / 60)).padStart(2, '0')}:${String((s + dur) % 60).padStart(2, '0')}` : (dur ? '' : f.end);
    setF({ ...f, start: v, end: e });
  };
  const err = f.end && f.start && hm(f.end) <= hm(f.start) ? 'The end time must be after the start time.' : '';
  return (
    <Sheet open={open} onClose={onClose} title={`Move today · ${ctx.title}`}>
      <div style={{ display: 'grid', gap: '12px', paddingBottom: '90px' }}>
        <p style={{ ...small, margin: 0 }}>For today only. The screen changes at once and tomorrow is back to normal.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          <TimeField label="New start" value={f.start} onChange={setStart} />
          <TimeField label="New end" value={f.end} onChange={(v) => setF({ ...f, end: v })} optional />
        </div>
        {err && <Hint style={{ color: colors.danger, marginTop: 0 }}>{err}</Hint>}
        <Field label="New place (optional)" style={{ marginTop: 0 }}><input value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} maxLength={LIMITS.place} aria-label="New place" style={inputBase} /></Field>
        <Field label="Note on the row (optional)" hint="For example 'Moved to the Zal'." style={{ marginTop: 0 }}><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={LIMITS.note} aria-label="Note" style={inputBase} /></Field>
      </div>
      <div style={sticky}>
        <button type="button" style={btn(true, { flex: 1, opacity: f.start && !err && !busy ? 1 : 0.5 })} disabled={!f.start || !!err || busy} onClick={() => onSave({ op: 'move', shiurId: ctx.id, start: f.start, end: f.end, place: f.place, note: f.note })} data-testid="move-save">Move it</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// ── import ────────────────────────────────────────────────────────────────────

export function ImportSheet({ open, onClose, file, onDone, copyText }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState('replace');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { if (open) { setText(''); setRows(null); setFileName(''); setErr(''); setMode(file.shiurim.length ? 'add' : 'replace'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => {
    if (!rows && !text.trim()) return null;
    try { return parseShiurimInput(rows ? { rows } : { text }, file, { schedule: { entries: file.blocks || [] } }); } catch { return null; }
  }, [text, rows, file]);
  const errors = parsed?.errors || [];
  const ready = parsed && !errors.length && parsed.counts.shiurim > 0;
  const pickFile = async (f) => {
    if (!f) return;
    setErr('');
    try { setRows(await readFileRows(f)); setFileName(f.name); setText(''); } catch { setErr('That file could not be read. Try copying the cells and pasting them instead.'); }
  };
  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const r = await shiurimApi('POST', '/import', { ...(rows ? { rows } : { text }), mode });
      onDone(r, `Imported ${r.counts?.shiurim ?? 0} shiurim`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Import shiurim">
      <div style={{ display: 'grid', gap: '12px', paddingBottom: '80px' }}>
        <p style={{ ...small, margin: 0 }}>Paste a list (one shiur a line: who | what | where | days | time), cells copied from a spreadsheet, or pick an .xlsx / .csv file. You see what was found before anything is saved.</p>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setRows(null); setFileName(''); }} aria-label="Paste the shiurim here" placeholder={IMPORT_EXAMPLE} rows={7} dir="auto"
          style={{ ...inputBase, minHeight: '150px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '16px', resize: 'vertical' }} data-testid="shiurim-import-text" />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={() => fileRef.current?.click()}>Choose .xlsx / .csv</button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" aria-label="Choose a shiurim file" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
          <button type="button" style={btn(false)} onClick={() => copyText(shiurimClaudePrompt(), 'Request copied')}>Copy Claude prompt</button>
        </div>
        <Hint style={{ marginTop: 0 }}>A PDF or photo of the list? Copy the Claude prompt, give Claude the prompt and the picture, then paste its answer above. To link a shiur to the schedule write <b>schedule: Block name</b> as the days.</Hint>
        {fileName && <p style={{ ...small, margin: 0 }}>File: {fileName}</p>}
        {parsed && (
          <div role="status" aria-live="polite" style={{ border: `1px solid ${errors.length ? colors.danger : colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px', display: 'grid', gap: '6px' }} data-testid="shiurim-import-preview">
            {!errors.length && <strong style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>Found: {parsed.counts.shiurim} shiur{parsed.counts.shiurim === 1 ? '' : 'im'} · {parsed.counts.newPeople} new {parsed.counts.newPeople === 1 ? 'person' : 'people'}</strong>}
            {errors.slice(0, 6).map((e, i) => <div key={i} style={{ ...small, color: colors.danger }}>{e.line ? `Line ${e.line}: ` : ''}{e.message}</div>)}
            {errors.length > 6 && <div style={small}>and {errors.length - 6} more.</div>}
            {(parsed.warnings || []).slice(0, 4).map((e, i) => <div key={`w${i}`} style={small}>Note, line {e.line}: {e.message}</div>)}
          </div>
        )}
        {ready && (
          <Field label="How" style={{ marginTop: 0 }}>
            <div role="group" aria-label="How" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Chip on={mode === 'replace'} onClick={() => setMode('replace')}>Replace the shiurim I have</Chip>
              <Chip on={mode === 'add'} onClick={() => setMode('add')}>Add to them</Chip>
            </div>
            {mode === 'replace' && file.shiurim.length > 0 && <Hint>This replaces your {file.shiurim.length} shiur{file.shiurim.length === 1 ? '' : 'im'} (people and photos are kept). You can undo it right after.</Hint>}
          </Field>
        )}
        {err && <p role="alert" style={{ ...small, color: colors.danger }}>{err}</p>}
      </div>
      <div style={sticky}>
        <button type="button" style={btn(true, { flex: 1, opacity: ready && !busy ? 1 : 0.5 })} disabled={!ready || busy} onClick={apply} data-testid="shiurim-import-apply">Use these shiurim</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

