import React, { useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Collapsible from './ui/Collapsible.jsx';
import { Page, Field, Hint, SwitchRow, Choices, useInstant, fieldStyle, LinkButton } from './look/kit.jsx';
import { NumberField } from './ui.jsx';
import {
  shabbosOptions, cleanReminderText, reminderListProblem, DURING, DURING_LABEL, GREETINGS, SPELLINGS,
  REMINDER_MAX, REMINDER_CHARS, EREV_HOURS, MOTZEI_MINUTES, SHABBOS_DEFAULTS,
} from '../../shared/shabbosPage.js';
import { zmanMinutes } from '../../shared/dayNight.js';

/**
 * Screen > Shabbos (spec docs/specs/02-SHABBOS-PAGE.md): the Friday 'Good Shabbos' page, the Motzei 'Shavua Tov'
 * page, their reminder lines, and what the TV does between candle lighting and nightfall. Everything is
 * settings.shabbos (one PATCH per change, Undo in the toast); the two pages themselves are switched on and off as
 * slide rows (SHABBOS / MOTZEI). Times are never typed here: they come from the screen's zmanim.
 */

const GREETING_LABEL = { both: 'Hebrew and English', hebrew: 'Hebrew only', english: 'English only', none: 'No greeting' };
const SPELLING_LABEL = { shabbos: 'Shabbos / Parshas', shabbat: 'Shabbat / Parashat' };
const DURING_NOTE = {
  rotate: 'The slides keep rotating. Slides you marked "Hide on Shabbos and Yom Tov" drop out until nightfall. This is how the screen worked before.',
  sign: 'One calm page: the greeting, the parsha and when Shabbos ends. No rotation, no countdown, no clock, nothing moving.',
  off: 'The screen goes black at candle lighting and comes back by itself at nightfall. It uses the same blank screen as Freeze.',
};

const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d, mins) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
function nextDow(dow, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}
const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function ReminderEditor({ initial, onSave, onCancel }) {
  const [en, setEn] = useState(initial?.en || '');
  const [heText, setHe] = useState(initial?.he || '');
  const enC = cleanReminderText(en); const heC = cleanReminderText(heText);
  const tooLong = [...en.trim()].length > REMINDER_CHARS || [...heText.trim()].length > REMINDER_CHARS;
  const empty = !enC && !heC;
  return (
    <div style={{ display: 'grid', gap: '8px', padding: '12px', border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', marginTop: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: 700, color: colors.dim }}>English
        <input value={en} onChange={(e) => setEn(e.target.value)} maxLength={REMINDER_CHARS + 20} style={{ ...fieldStyle, width: '100%', marginTop: '4px' }} placeholder="Shabbos candles: girls and women light 18 minutes before sunset" data-testid="shabbos-rem-en" />
      </label>
      <label style={{ fontSize: '13px', fontWeight: 700, color: colors.dim }}>Hebrew (optional)
        <input value={heText} onChange={(e) => setHe(e.target.value)} dir="rtl" maxLength={REMINDER_CHARS + 20} style={{ ...fieldStyle, width: '100%', marginTop: '4px' }} data-testid="shabbos-rem-he" />
      </label>
      <Hint style={{ margin: 0, color: tooLong ? colors.danger || colors.text : colors.dim }}>
        {tooLong ? `${REMINDER_CHARS} characters at most so it can be read from across the room.` : 'One short line. English only, Hebrew only, or both.'}
      </Hint>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" disabled={empty || tooLong} onClick={() => onSave({ en: enC, he: heC })} style={btn(true)} data-testid="shabbos-rem-save">Save</button>
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
      </div>
    </div>
  );
}

function btn(primary) {
  return {
    minHeight: '44px', padding: '0 18px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700,
    border: primary ? 'none' : `1px solid ${colors.line}`, background: primary ? colors.accent : 'transparent', color: primary ? 'var(--on-accent, #fff)' : colors.text,
  };
}
const iconBtn = { minWidth: '44px', minHeight: '44px', border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: '16px' };

function ReminderList({ which, list, canEdit, onChange }) {
  const [editing, setEditing] = useState(null); // id | 'new' | null
  const save = (i, text) => {
    const next = i === 'new' ? [...list, { id: newId(), ...text }] : list.map((r) => (r.id === i ? { ...r, ...text } : r));
    if (reminderListProblem(next)) return;
    onChange(next, i === 'new' ? 'Reminder added' : 'Reminder changed');
    setEditing(null);
  };
  const move = (k, d) => { const next = [...list]; const [x] = next.splice(k, 1); next.splice(k + d, 0, x); onChange(next, 'Reminder moved'); };
  return (
    <div data-testid={`shabbos-reminders-${which}`}>
      {list.length === 0 && <Hint style={{ marginTop: 0 }}>No lines yet. The page simply leaves this part out.</Hint>}
      {list.map((r, k) => (
        <div key={r.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${colors.line}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {r.en && <div style={{ fontSize: '15px', color: colors.text }}>{r.en}</div>}
              {r.he && <div dir="rtl" style={{ fontSize: '15px', color: r.en ? colors.dim : colors.text }}>{r.he}</div>}
            </div>
            {canEdit && (
              <>
                <button type="button" aria-label="Edit" onClick={() => setEditing(r.id)} style={iconBtn}>✎</button>
                <button type="button" aria-label="Move up" disabled={k === 0} onClick={() => move(k, -1)} style={iconBtn}>↑</button>
                <button type="button" aria-label="Move down" disabled={k === list.length - 1} onClick={() => move(k, 1)} style={iconBtn}>↓</button>
                <button type="button" aria-label="Remove" onClick={() => onChange(list.filter((x) => x.id !== r.id), 'Reminder removed')} style={iconBtn}>✕</button>
              </>
            )}
          </div>
          {editing === r.id && <ReminderEditor initial={r} onSave={(t) => save(r.id, t)} onCancel={() => setEditing(null)} />}
        </div>
      ))}
      {canEdit && editing !== 'new' && list.length < REMINDER_MAX && (
        <button type="button" onClick={() => setEditing('new')} style={{ ...btn(false), marginTop: '10px' }} data-testid={`shabbos-add-${which}`}>+ Add a line</button>
      )}
      {editing === 'new' && <ReminderEditor onSave={(t) => save('new', t)} onCancel={() => setEditing(null)} />}
      {list.length >= REMINDER_MAX && <Hint>{REMINDER_MAX} lines at most. Three show at a time; more take turns every 8 seconds.</Hint>}
    </div>
  );
}

export default function ShabbosPanel({ settings = {}, onSave, slides = [], onUpdateSlides, cache, canEdit = true, canEditSlides = false, onNavigate }) {
  const apply = useInstant(settings, onSave);
  const o = shabbosOptions(settings);
  const set = (patch, msg) => (canEdit ? apply({ shabbos: patch }, msg) : null);
  const row = (type) => slides.find((s) => s.type === type);
  const erevRow = row('SHABBOS'); const motzeiRow = row('MOTZEI');
  const toggleRow = (type) => {
    if (!onUpdateSlides) return;
    onUpdateSlides(slides.map((s) => (s.type === type ? { ...s, enabled: !s.enabled } : s)));
  };

  // Preview buttons: next Friday ~1 h before candle lighting, Shabbos midday, Motzei ~20 min after nightfall.
  const z = cache?.zmanim?.today || {};
  const sunset = zmanMinutes(z.sunset);
  const tzeis = zmanMinutes(z.tzeit7083deg);
  const friAt = sunset != null ? Math.max(6 * 60, sunset - 18 - 60) : 15 * 60 + 30;
  const motzeiAt = tzeis != null ? Math.min(23 * 60 + 30, tzeis + 20) : 20 * 60;
  const open = (q) => window.open(`/screen?preview=true${q}`, '_blank', 'noopener');
  const fri = nextDow(5); const sat = nextDow(6);

  const statusLine = (r) => (!r ? 'Not in the slide list yet (it is added when the server starts)' : r.enabled ? 'On' : 'Off');

  return (
    <Page intro="A 'Good Shabbos' page on Friday afternoon and a 'Shavua Tov' page on Motzei Shabbos. Times come from the screen's zmanim (candle lighting uses the minutes set in Location & weather); nothing here is typed by hand. Each page only shows in its own window.">
      <Collapsible id="shabbos-pages" title="The two pages" icon="star" summary={`Good Shabbos: ${statusLine(erevRow)} · Shavua Tov: ${statusLine(motzeiRow)}`} defaultOpen>
        {[['SHABBOS', erevRow, 'Good Shabbos page (Friday)', `From ${o.erevHours} hours before candle lighting until candle lighting. The page leaves on the same minute as slides marked 'Hide on Shabbos'.`],
          ['MOTZEI', motzeiRow, 'Shavua Tov page (Motzei Shabbos)', `For ${o.motzeiMinutes} minutes after Shabbos ends (nightfall).`]].map(([type, r, label, note]) => (
          canEditSlides && r
            ? <SwitchRow key={type} on={!!r.enabled} onChange={() => toggleRow(type)} label={label} note={note} testId={`shabbos-row-${type}`} />
            : <div key={type} style={{ padding: '8px 0' }}><strong>{label}</strong>: {statusLine(r)}<Hint style={{ marginTop: 2 }}>{note}</Hint></div>
        ))}
        <Hint>You can also switch them on, set their seconds and order them in <LinkButton onClick={() => onNavigate?.('slides')}>Slides</LinkButton>.</Hint>
      </Collapsible>

      <Collapsible id="shabbos-during" title="During Shabbos / Yom Tov (candle lighting to nightfall)" icon="moon" summary={DURING_LABEL[o.during]}>
        <Field label="What the screen does" hint={DURING_NOTE[o.during]}>
          <Choices ariaLabel="During Shabbos" value={o.during} onChange={(v) => set({ during: v }, `During Shabbos: ${DURING_LABEL[v]}`)} options={DURING.map((v) => ({ value: v, label: DURING_LABEL[v] }))} />
        </Field>
        <Hint>
          Starts at candle lighting on Friday (or the eve of Yom Tov) and ends at nightfall on the last day, both from the screen's zmanim.
          If the zmanim are missing or out of date, the screen does not guess: it keeps showing normally. A Freeze you start by hand still wins.
          {' '}Default: {DURING_LABEL[SHABBOS_DEFAULTS.during]}.
        </Hint>
      </Collapsible>

      <Collapsible id="shabbos-when" title="When the pages show" icon="clock" summary={`Friday from ${o.erevHours} h before candles · Motzei ${o.motzeiMinutes} min`}>
        <Field label="Friday page starts (hours before candle lighting)" hint={`${EREV_HOURS.min} to ${EREV_HOURS.max}. Never before 6:00 AM. Default ${SHABBOS_DEFAULTS.erevHours}.`}>
          <NumberField value={o.erevHours} min={EREV_HOURS.min} max={EREV_HOURS.max} onCommit={(n) => set({ erevHours: n }, `Friday page: ${n} hours before candle lighting`)} ariaLabel="Hours before candle lighting" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
        </Field>
        <Field label="Motzei page shows for (minutes after nightfall)" hint={`${MOTZEI_MINUTES.min} to ${MOTZEI_MINUTES.max}. Default ${SHABBOS_DEFAULTS.motzeiMinutes}. Only after the last day: between two days of Yom Tov there is no Motzei page.`}>
          <NumberField value={o.motzeiMinutes} min={MOTZEI_MINUTES.min} max={MOTZEI_MINUTES.max} onCommit={(n) => set({ motzeiMinutes: n }, `Motzei page: ${n} minutes`)} ariaLabel="Minutes after nightfall" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
        </Field>
        <Hint>Second night of Yom Tov: candles are lit after nightfall, so the page shows 'Candles tonight after nightfall' with that time and no countdown. Erev Yom Tov uses the same page with the Yom Tov words.</Hint>
      </Collapsible>

      <Collapsible id="shabbos-what" title="What the Friday page shows" icon="list" summary={`${GREETING_LABEL[o.greeting]} · ${SPELLING_LABEL[o.spelling]}${o.countdown ? ' · countdown' : ''}`}>
        <SwitchRow on={o.countdown} onChange={() => set({ countdown: !o.countdown }, o.countdown ? 'Countdown off' : 'Countdown on')} label="Countdown to candle lighting" note="'in 2 h 14 min' under the time (minutes and seconds in the last hour). Never shown when the time is not known." testId="shabbos-countdown" />
        <Field label="Greeting">
          <Choices ariaLabel="Greeting" value={o.greeting} onChange={(v) => set({ greeting: v }, `Greeting: ${GREETING_LABEL[v]}`)} options={GREETINGS.map((v) => ({ value: v, label: GREETING_LABEL[v] }))} />
        </Field>
        <Field label="Spelling">
          <Choices ariaLabel="Spelling" value={o.spelling} onChange={(v) => set({ spelling: v }, `Spelling: ${SPELLING_LABEL[v]}`)} options={SPELLINGS.map((v) => ({ value: v, label: SPELLING_LABEL[v] }))} />
        </Field>
        <Hint>Times on the page: Plag Hamincha, candle lighting and shkia from today's zmanim, and this week's parsha.</Hint>
      </Collapsible>

      <Collapsible id="shabbos-reminders-erev" title="Friday reminder lines" icon="message" summary={o.remindersErev.length ? `${o.remindersErev.length} line${o.remindersErev.length === 1 ? '' : 's'}` : 'None'}>
        <Hint style={{ marginTop: 0 }}>Short lines of your own, for example 'Shabbos candles: girls and women light 18 minutes before sunset' or 'Tzedakah before candle lighting'.</Hint>
        <ReminderList which="erev" list={o.remindersErev} canEdit={canEdit} onChange={(next, msg) => set({ remindersErev: next }, msg)} />
      </Collapsible>

      <Collapsible id="shabbos-reminders-motzei" title="Motzei Shabbos reminder lines" icon="message" summary={o.remindersMotzei.length ? `${o.remindersMotzei.length} line${o.remindersMotzei.length === 1 ? '' : 's'}` : 'None'}>
        <ReminderList which="motzei" list={o.remindersMotzei} canEdit={canEdit} onChange={(next, msg) => set({ remindersMotzei: next }, msg)} />
      </Collapsible>

      <Collapsible id="shabbos-preview" title="Preview" icon="play" summary="See the pages at a chosen time">
        <Hint style={{ marginTop: 0 }}>Opens a preview of the screen at that time with that day's own zmanim. Nothing changes on the real TV.</Hint>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          <button type="button" style={btn(false)} onClick={() => open(`&previewAt=${isoLocal(fri, friAt)}`)} data-testid="shabbos-preview-friday">Friday afternoon</button>
          <button type="button" style={btn(false)} onClick={() => open(`&previewAt=${isoLocal(sat, 12 * 60)}`)}>During Shabbos</button>
          <button type="button" style={btn(false)} onClick={() => open(`&previewAt=${isoLocal(sat, motzeiAt)}`)}>Motzei Shabbos</button>
          <button type="button" style={btn(false)} onClick={() => open('')}>Now</button>
        </div>
        <Hint>The page only appears in the preview when it is switched on above.</Hint>
      </Collapsible>
    </Page>
  );
}
