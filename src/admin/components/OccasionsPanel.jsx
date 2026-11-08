import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Collapsible from './ui/Collapsible.jsx';
import Sheet from './ui/Sheet.jsx';
import { Field, Hint, SwitchRow, Choices, fieldStyle } from './look/kit.jsx';
import { btn, card, h3, small, label, Select, TextIn, Chip, Group } from './occasions/occKit.jsx';
import ExplainBox from './occasions/ExplainBox.jsx';
import { HypeGlobal, HypeOwn } from './occasions/HypeSection.jsx';
import { WordsEditor } from './occasions/WordsSection.jsx';
import { LookEditor, DisplayField } from './occasions/LookSection.jsx';
import { LayoutEditor } from './occasions/LayoutSection.jsx';
import { SoundGlobal, SoundOwn } from './occasions/SoundSection.jsx';
import AdventEditor from './occasions/AdventSection.jsx';
import DatePicker from './occasions/DatePicker.jsx';
import LibraryPicker from './occasions/LibraryPicker.jsx';
import Timeline from './occasions/Timeline.jsx';
import { ViewsGlobal, ViewsOwn } from './occasions/ViewsSection.jsx';
import { advancedSummary, datePreview, shareFor, weekShare } from './occasions/occDates.js';
import { libraryDraft } from '../../shared/occasionLibrary.js';
import MomentCard from './occasions/MomentCard.jsx';
import { adventPreview, hypeSummary } from './occasions/occHelpers.js';
import { NumberField, ConfirmDialog } from './ui.jsx';
import { useCopy } from './schedule/scheduleShared.jsx';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import {
  upcoming, ctxFrom, daysUntil, normalizeOccasion, resolveLook, resolveOccLayout, occasionProblem, vortPrompt, countdownOf, countdownWords,
  CATEGORIES, CATEGORY_LABEL, TAP_FORMS, BEGINS, BEGINS_LABEL, PICKS, PICK_LABEL, LANGS, LANG_LABEL, RANGES, LIMITS, MONTH_EN, ZERO_WORDS, OCC_STYLES, SETTINGS_DEFAULTS, beginsOf, timeEn, STAGE_TEXT_DEFAULTS, LAYOUT_DEFAULTS, LOOK_DEFAULTS, windowDays,
} from '../../shared/occasions.js';

/**
 * Admin > Screen > Occasions: the Countdown slide (OCCASION). Phone first: one column, 44 px targets, a bottom sheet with a sticky Save.
 *   On the screen (the slide's switch, which one shows, days ahead) · the list (next date + days left, On/Off, Edit) · Add / Edit sheet
 *   (name, Hebrew date or regular date, repeat, how many days, when it begins, greeting, event line, explanation + source, Claude prompt,
 *   rail / banner / takeover) · how it looks · rail card, banner, takeover · preview at a chosen moment.
 * Every change is one granular request (src/server/routes/occasions.js) with an Undo in the toast (the whole previous list goes back).
 * Owner rule: the explanation only shows with a source; the starter list ships names and dates only.
 */

const api = (method, path = '', body) => apiFetch(`/api/occasions${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const HEB_MONTHS = [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6].map((m) => ({ value: m, label: m === 12 ? 'Adar (Adar I / II in a leap year: see below)' : m === 13 ? 'Adar II (leap years; Adar otherwise)' : MONTH_EN[m] }));
const GREG_MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' }) }));
const ZERO_LABEL = {
  gutYomTov: 'Gut Yom Tov!', chodeshTov: 'Chodesh Tov!', chag: 'Chag Sameach!', pesach: "Chag Kasher V'Sameach!", kesiva: 'Kesiva Vachasima Tova',
  gmar: "G'mar Chasima Tova", chanukah: 'Happy Chanukah!', purim: 'Happy Purim!', here: "It's here!", quiet: 'No greeting (just "Today is")',
};
const STYLE_LABEL = { hype: 'Hype', chassidic: 'Chassidic', yomtov: 'Yom Tov', roshchodesh: 'Rosh Chodesh', chanukah: 'Chanukah', purim: 'Purim', pesach: 'Pesach', lagbaomer: 'Lag BaOmer', celebration: 'Celebration', farbrengen: 'Farbrengen', grand: 'Grand', classic: 'Classic' };

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DDTHH:MM' in this browser's local time (the kiosk preview reads it the same way). */
const localStamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const openPreview = (ms) => window.open(`/screen?preview=true${ms ? `&previewAt=${localStamp(ms)}` : ''}`, '_blank', 'noopener');

const emptyDraft = () => ({
  on: true, nameEn: '', nameHe: '', rule: { kind: 'hebrew', month: 9, day: 19 }, repeat: 'yearly', year: '', days: 1, adar: 'adar2', missing30: '29',
  beginsAt: 'default', time: '19:00', timeDay: 'eve', showDays: 0, explainEn: '', explainHe: '', explainShortEn: '', explainShortHe: '', shabbos: 'stay', category: 'custom', tapForms: null, autoForms: null, source: '', eventEn: '', eventHe: '',
  zeroKey: 'gutYomTov', zeroEn: '', zeroHe: '', celebrate: true, rail: true, banner: true, takeover: true, style: 'hype',
  explainChecked: false, milestoneOn: null, finalOn: null, milestones: null, stageText: {}, milestoneText: {}, look: {}, layout: {},
  kind: 'countdown', from: null, total: 8, display: null, advent: { on: false, photo: '', grid: '3x3', daily: {} }, soundOn: null, touch: true,
});

const stepH = { fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text, margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: '10px' };
const stepNum = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: colors.accentSoft, color: colors.accent, fontSize: '14px', fontWeight: 700, flex: 'none' };
function Step({ n, title, children, testId }) {
  return (
    <section style={{ display: 'grid', gap: '14px', minWidth: 0 }} aria-label={`Step ${n}: ${title}`} data-testid={testId}>
      <h3 style={stepH}><span style={stepNum} aria-hidden="true">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

/** Add / edit one occasion (bottom sheet, sticky Save): 1 Name and date, 2 What the bochurim see, 3 Countdown options, 4 Advanced. */
function OccasionSheet({ initial, onClose, onSave, onDelete, settings, ctxNow, busy, copy, appSettings, cache, today }) {
  const [d, setD] = useState(() => ({ ...emptyDraft(), ...(initial || {}), year: initial?.year ?? '' }));
  const [advOpen, setAdvOpen] = useState(false);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setRule = (patch) => setD((x) => ({ ...x, rule: { ...x.rule, ...patch } }));
  const countup = d.kind === 'countup';
  const from = d.from || { kind: 'gregorian', month: 1, day: 1, year: new Date().getFullYear() };
  const setFrom = (patch) => setD((x) => ({ ...x, from: { ...(x.from || from), ...patch } }));
  const payload = countup
    ? { ...d, kind: 'countup', from: { ...from, month: Number(from.month), day: Number(from.day), year: Number(from.year) }, total: Number(d.total) || 0, days: Number(d.total) || 1, showDays: Number(d.showDays) || 0 }
    : { ...d, kind: 'countdown', from: null, year: d.repeat === 'once' ? Number(d.year) : null, days: Number(d.days) || 1, showDays: Number(d.showDays) || 0 };
  const problem = occasionProblem(payload);
  // what this rule gives next (for the count-up line and the Claude prompt)
  const next = useMemo(() => {
    if (problem) return null;
    try {
      const o = normalizeOccasion({ ...payload, id: 'draft', on: true, rule: { ...d.rule, month: Number(d.rule.month), day: Number(d.rule.day) } });
      if (!o) return null;
      const f = { version: 1, settings, occasions: [o] };
      const { now, ctx } = ctxNow();
      return upcoming(f, now, ctx, { horizonDays: 800 })[0] || null;
    } catch { return null; }
  }, [JSON.stringify(payload), settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const advPrev = useMemo(() => adventPreview(payload, settings, appSettings, cache), [JSON.stringify(payload.advent), JSON.stringify(payload.from), JSON.stringify(payload.rule), payload.showDays, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const lead = Number(d.showDays) > 0 ? Number(d.showDays) : settings.withinDays;
  const effBegins = beginsOf(d, settings);
  const nextLine = countup && next ? datePreview({ ...d, rule: { kind: from.kind, month: from.month, day: from.day }, repeat: 'once', year: from.year, days: d.total }, settings, ctxNow) : null;

  return (
    <Sheet open onClose={onClose} title={initial?.id ? 'Edit occasion' : 'Add an occasion'} label="Occasion">
      <div style={{ display: 'grid', gap: '22px', paddingBottom: '84px' }} data-testid="occ-sheet">
        <Step n={1} title="Name and date" testId="occ-step-1">
          <div>
            <span style={label}>Name in English</span>
            <TextIn value={d.nameEn} onChange={(v) => set({ nameEn: v })} ariaLabel="Name in English" max={LIMITS.name} testId="occ-name-en" placeholder="Yud-Tes Kislev" />
          </div>
          <div>
            <span style={label}>Name in Hebrew</span>
            <TextIn value={d.nameHe} onChange={(v) => set({ nameHe: v })} ariaLabel="Name in Hebrew" dir="rtl" max={LIMITS.name} testId="occ-name-he" placeholder="י״ט כסלו" />
          </div>
          <Field label="What kind" style={{ marginTop: 0 }}>
            <Choices ariaLabel="Kind" value={d.kind} onChange={(v) => set({ kind: v, ...(v === 'countup' && !d.from ? { from } : {}) })}
              options={[{ value: 'countdown', label: 'Countdown to a day' }, { value: 'countup', label: 'Count up: a run of days (Day 3 of 8)' }]} />
          </Field>
          <Field label="Which kind of day" style={{ marginTop: 0 }}>
            <Select ariaLabel="Which kind of day" testId="occ-category" value={d.category || 'custom'} onChange={(v) => set({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
          </Field>
          {countup ? (
            <>
              <Field label="The run starts on" style={{ marginTop: 0 }}>
                <Choices ariaLabel="Kind of start date" value={from.kind} onChange={(v) => setFrom(v === 'hebrew' ? { kind: v, month: 9, day: 1, year: 5787 } : { kind: v, month: 1, day: 1, year: new Date().getFullYear() })} options={[{ value: 'gregorian', label: 'Regular date' }, { value: 'hebrew', label: 'Hebrew date' }]} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                <div><span style={label}>Month</span><Select ariaLabel="Start month" value={from.month} onChange={(v) => setFrom({ month: Number(v) })} options={from.kind === 'gregorian' ? GREG_MONTHS : HEB_MONTHS} /></div>
                <div><span style={label}>Day</span><Select ariaLabel="Start day" value={from.day} onChange={(v) => setFrom({ day: Number(v) })} options={Array.from({ length: from.kind === 'gregorian' ? 31 : 30 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} /></div>
                <div><span style={label}>{from.kind === 'gregorian' ? 'Year' : 'Hebrew year'}</span><input type="number" inputMode="numeric" value={from.year} onChange={(e) => setFrom({ year: e.target.value })} aria-label="Start year" style={{ ...fieldStyle, width: '100%' }} /></div>
              </div>
              <div><span style={label}>How many days it runs (1-400)</span><NumberField value={Number(d.total) || 1} min={RANGES.total.min} max={RANGES.total.max} onCommit={(n) => set({ total: n })} ariaLabel="How many days it runs" style={{ ...fieldStyle, maxWidth: '110px' }} /></div>
              <Hint>Before it starts the page counts down to the first day; then it says "Day 3 of 8" until the run is over.</Hint>
              {nextLine?.next && (
                <p style={{ ...small, margin: 0, color: colors.text }} data-testid="occ-next">
                  Hebrew: <strong>{nextLine.hebrew}</strong> · Starts: <strong>{nextLine.next.long}</strong> ({nextLine.next.inText})
                </p>
              )}
            </>
          ) : (
            <DatePicker d={d} set={set} setRule={setRule} settings={settings} ctxNow={ctxNow} today={today} />
          )}
        </Step>

        <Step n={2} title="What the bochurim see" testId="occ-step-2">
          <p style={{ ...small, margin: '-6px 0 0' }}>The name and the dates always show. Here you can add why the day is special and why we celebrate it: a short line for the screen and the whole story, with the source.</p>
          <ExplainBox d={d} set={set} copyPrompt={() => copy(vortPrompt(next, d.nameEn || d.nameHe), 'Prompt copied')} />
        </Step>

        <Step n={3} title="Countdown options" testId="occ-step-3">
          <Field label="When it begins (the countdown's zero)" style={{ marginTop: 0 }} hint={effBegins === 'candles' ? 'Candle lighting uses the minutes set in Location & weather. When that evening is itself Shabbos or Yom Tov, candles are lit after nightfall, so the countdown goes to nightfall.' : effBegins === 'midnight' ? 'Counts to 12:00 AM of the day.' : effBegins === 'time' ? '' : 'From the screen\'s zmanim for that evening.'}>
            <Choices ariaLabel="When it begins" value={d.beginsAt} onChange={(v) => set({ beginsAt: v })}
              options={[{ value: 'default', label: `Same as the others (${BEGINS_LABEL[settings.beginsAt].toLowerCase()})` }, ...BEGINS.map((v) => ({ value: v, label: BEGINS_LABEL[v] }))]} />
          </Field>
          {effBegins === 'time' && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div><span style={label}>Time</span><input type="time" aria-label="Begins at" value={d.time || settings.time} onChange={(e) => e.target.value && set({ time: e.target.value })} style={{ ...fieldStyle, maxWidth: '150px' }} /></div>
              <div style={{ minWidth: 0 }}><span style={label}>On</span>
                <Choices ariaLabel="Which day" value={d.timeDay} onChange={(v) => set({ timeDay: v })} options={[{ value: 'eve', label: 'The evening before' }, { value: 'day', label: 'The day itself' }]} /></div>
            </div>
          )}
          <div>
            <span style={label}>Show only in the last ... days (0 = same as the others, {settings.withinDays})</span>
            <NumberField value={Number(d.showDays) || 0} min={RANGES.showDays.min} max={RANGES.showDays.max} onCommit={(n) => set({ showDays: n })} ariaLabel="Show only in the last days" style={{ ...fieldStyle, maxWidth: '96px' }} />
          </div>

          <Field label="At the moment it begins, the screen says" style={{ marginTop: 0 }}>
            <Select ariaLabel="Greeting" value={d.zeroKey || 'here'} onChange={(v) => set({ zeroKey: v })} options={Object.keys(ZERO_WORDS).map((k) => ({ value: k, label: ZERO_LABEL[k] }))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
            <div><span style={label}>Or your own words (English)</span><TextIn value={d.zeroEn} onChange={(v) => set({ zeroEn: v })} ariaLabel="Own greeting in English" max={LIMITS.zero} placeholder="L'chaim!" /></div>
            <div><span style={label}>Hebrew</span><TextIn value={d.zeroHe} onChange={(v) => set({ zeroHe: v })} ariaLabel="Own greeting in Hebrew" dir="rtl" max={LIMITS.zero} placeholder="לחיים!" /></div>
          </div>
          <SwitchRow on={d.celebrate !== false} onChange={() => set({ celebrate: d.celebrate === false })} label="Confetti at that moment" note="A short burst that falls once and is gone. Turn it off for a solemn day." testId="occ-celebrate" />

          <div>
            <span style={label}>Event line (when and where), optional</span>
            <TextIn value={d.eventEn} onChange={(v) => set({ eventEn: v })} ariaLabel="Event line in English" max={LIMITS.event} placeholder="Farbrengen 8:30 PM, main hall" testId="occ-event-en" />
            <div style={{ height: '8px' }} />
            <TextIn value={d.eventHe} onChange={(v) => set({ eventHe: v })} ariaLabel="Event line in Hebrew" dir="rtl" max={LIMITS.event} placeholder="התוועדות 8:30 בערב" />
            <Hint>Shown on the last day and on the day itself. No student names.</Hint>
          </div>

          <div>
            <SwitchRow on={d.rail !== false} onChange={() => set({ rail: d.rail === false })} label="Rail card ('5 days to ...')" note="When the rail card is on for the Countdown (below the list)." />
            <SwitchRow on={d.banner !== false} onChange={() => set({ banner: d.banner === false })} label="Banner on the day" note="When banners are on for the Countdown." />
            <SwitchRow on={d.takeover !== false} onChange={() => set({ takeover: d.takeover === false })} label="Full-screen takeover at the moment it begins" note="When takeovers are on for the Countdown." />
            <div style={{ marginTop: '6px' }}>
              <span style={label}>Takeover style</span>
              <Select ariaLabel="Takeover style" value={d.style} onChange={(v) => set({ style: v })} options={OCC_STYLES.map((v) => ({ value: v, label: STYLE_LABEL[v] || v }))} />
            </div>
          </div>
          {next && (
            <div>
              <button type="button" style={btn(false)} onClick={() => copy(shareFor(next, settings, ctxNow), 'Copied. Paste it into WhatsApp.')} data-testid="occ-share">Copy for WhatsApp</button>
              <Hint>A message with the countdown, the day, the Hebrew date and when it begins{`${d.explainChecked ? ', and the short line about why it is special' : ''}`}.</Hint>
            </div>
          )}
        </Step>

        <Step n={4} title="Advanced" testId="occ-step-4">
          <button type="button" aria-expanded={advOpen} onClick={() => setAdvOpen(!advOpen)} data-testid="occ-advanced-toggle"
            style={{ ...btn(false), width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', padding: '8px 14px', minHeight: '56px' }}>
            <span><strong style={{ fontSize: '15px' }}>Look, layout, hype, advent, sound</strong><span style={{ ...small, display: 'block', fontWeight: 400 }} data-testid="occ-advanced-summary">{advancedSummary(d, settings)}</span></span>
            <span aria-hidden="true">{advOpen ? '−' : '+'}</span>
          </button>
          {advOpen && (
            <div style={{ display: 'grid', gap: '14px' }} data-testid="occ-advanced">
              <p style={{ ...small, margin: 0 }}>Each choice below can follow the default set for every countdown, or be different for this occasion only.</p>
              <Group title="Hype moments" summary="Milestone takeovers and the final minute" testId="occ-own-hype"><HypeOwn d={d} set={set} s={settings} /></Group>
              <Group title="Words for each stage" summary={`${Object.keys(d.stageText || {}).length + Object.keys(d.milestoneText || {}).length} of its own`} testId="occ-own-words">
                <WordsEditor level="own" stageText={d.stageText || {}} milestoneText={d.milestoneText || {}} baseStage={settings.stageText} baseMilestone={settings.milestoneText} onChange={(patch) => set(patch)} />
              </Group>
              <Group title="Look" summary={Object.keys(d.look || {}).length ? 'Its own look' : 'Follows the default'} testId="occ-own-look">
                <DisplayField level="own" value={d.display} base={settings.display} onChange={(v) => set({ display: v })} />
                <LookEditor level="own" look={d.look || {}} base={settings.look} onChange={(l) => set({ look: l })} />
              </Group>
              <Group title="Layout" summary={Object.keys(d.layout || {}).length ? 'Its own layout' : 'Follows the default'} testId="occ-own-layout">
                <LayoutEditor level="own" layout={d.layout || {}} base={settings.layout} onChange={(l) => set({ layout: l })} />
              </Group>
              <Group title="Countdown views" summary={Array.isArray(d.tapForms) || d.autoForms ? 'Its own views' : 'Follows the default'} testId="occ-own-views"><ViewsOwn d={d} set={set} s={settings} /></Group>
              <Group title="Sound" summary={d.soundOn == null ? 'Follows the default' : d.soundOn ? 'On' : 'Off'}><SoundOwn d={d} set={set} sound={settings.sound} /></Group>
              <Group title="Advent calendar" summary={d.advent?.on ? 'On' : 'Off'} testId="occ-own-advent"><AdventEditor d={d} set={set} lead={lead} preview={advPrev} /></Group>
              <SwitchRow on={d.touch !== false} onChange={() => set({ touch: d.touch === false })} label="Touch on the TV" note="Lets people tap this countdown on a touch screen (also needs touch switched on for the screen)." />
            </div>
          )}
        </Step>
        {initial?.id && <button type="button" style={btn(false, { color: colors.danger || colors.text })} onClick={onDelete} data-testid="occ-delete">Remove this occasion</button>}
      </div>
      <div style={{ position: 'sticky', bottom: 0, background: colors.surface || colors.card, padding: '10px 0', borderTop: `1px solid ${colors.line}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={btn(true)} disabled={!!problem || busy} onClick={() => onSave(payload)} data-testid="occ-save">Save</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
        {problem && <span style={{ ...small, color: colors.danger || colors.text }} data-testid="occ-problem">{problem}</span>}
      </div>
    </Sheet>
  );
}

export default function OccasionsPanel({ canEdit = true, slides = [], onUpdateSlides, canEditSlides = false, settings: appSettings = {}, cache, onNavigate }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // occasion | {} (new)
  const [confirm, setConfirm] = useState(null);
  const [adding, setAdding] = useState(false);
  const { copy, modal } = useCopy(notify);

  const load = useCallback(async () => {
    try { setFile(await api('GET')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = useCallback(async (method, path, body, msg) => {
    const prev = file;
    setBusy(true);
    try {
      const next = await api(method, path, body);
      setFile(next);
      if (msg) {
        notify(msg, 'success', prev ? { label: 'Undo', onClick: async () => {
          try { setFile(await api('PUT', '/all', { file: { occasions: prev.occasions, settings: prev.settings } })); notify('Undone', 'success'); } catch (e) { notify(e.message || 'Could not undo', 'error'); }
        } } : null);
      }
      return next;
    } catch (e) { notify(e.message, 'error'); return null; } finally { setBusy(false); }
  }, [file]);

  const ctxNow = useCallback(() => {
    const now = new Date();
    return { now, ctx: ctxFrom(appSettings, cache, now) };
  }, [appSettings, cache]);

  const rows = useMemo(() => {
    if (!file) return [];
    try { const { now, ctx } = ctxNow(); return upcoming(file, now, ctx, { includeOff: true }); } catch { return []; }
  }, [file, ctxNow]);

  if (error) return <div style={{ display: 'grid', gap: '12px', maxWidth: '760px' }}><Hint style={{ color: colors.danger }}>{error}</Hint><button type="button" style={btn(false)} onClick={load}>Try again</button></div>;
  if (!file) return <Hint>Loading the occasions...</Hint>;

  const s = file.settings;
  const today = file.today;
  const row = slides.find((x) => x.type === 'OCCASION');
  const saveSettings = (patch, msg) => (canEdit ? change('PUT', '/settings', { settings: patch }, msg) : null);
  const toggleSlide = () => onUpdateSlides?.(slides.map((x) => (x.type === 'OCCASION' ? { ...x, enabled: !x.enabled } : x)));
  const onRows = rows.filter((r) => r.occasion.on);
  const offCount = file.occasions.filter((o) => !o.on).length;
  const now = new Date();
  // what the TV shows now (the same rules as the kiosk)
  const nowRows = onRows.filter((r) => r.running || daysUntil(r, today) <= (r.occasion.showDays || s.withinDays));
  const hero = s.pick === 'pinned' && s.pinnedId ? rows.find((r) => r.id === s.pinnedId) || nowRows[0] : nowRows[0] || onRows[0];

  const save = async (payload) => {
    const isNew = !sheet?.id;
    const next = isNew
      ? await change('POST', '', { occasion: payload }, `Added ${payload.nameEn || payload.nameHe}`)
      : await change('PUT', `/${sheet.id}`, { occasion: payload }, `Saved ${payload.nameEn || payload.nameHe}`);
    if (next) setSheet(null);
  };
  const toggle = (o) => change('PUT', `/${o.id}`, { occasion: { on: !o.on } }, `${o.nameEn || o.nameHe}: ${o.on ? 'off' : 'on'}`);
  const remove = async (o) => { setConfirm(null); if (await change('DELETE', `/${o.id}`, undefined, `Removed ${o.nameEn || o.nameHe}`)) setSheet(null); };

  const heroForm = hero ? countdownOf(hero, now, s, today) : null;
  const heroWords = heroForm ? countdownWords(heroForm) : null;

  return (
    <div style={{ display: 'grid', gap: '12px', maxWidth: '760px', fontFamily: adminFonts.englishBody }} data-testid="occ-panel">
      <p style={{ margin: 0, color: colors.dim, fontSize: '14px', lineHeight: 1.5 }}>
        A countdown to the next Chassidic or Jewish day, or a school event: its name, its Hebrew date, and a countdown to the evening it begins that changes as the time gets close. Dates come from the Hebrew calendar and times from the screen's zmanim.
      </p>

      <MomentCard canEdit={canEdit} notify={notify} choices={onRows.filter((r) => !r.running).map((r) => ({ value: `${r.id}|${r.startISO}`, label: r.nameEn || r.nameHe }))}
        fire={(body) => api('POST', '/moment', body)} stop={() => api('DELETE', '/moment')} />

      <div style={card} data-testid="occ-onoff">
        <h3 style={h3}>On the screen</h3>
        {row && canEditSlides
          ? <SwitchRow on={!!row.enabled} onChange={toggleSlide} label="Show the Countdown" note="Also the switch for its rail card, banner and takeover. The page skips itself when nothing is close enough." testId="occ-slide-switch" />
          : <p style={small}>The Countdown slide is {row ? (row.enabled ? 'on' : 'off') : 'not in the slide list yet'}. {canEditSlides ? '' : 'Someone who can change slides switches it on or off.'}</p>}
        <Field label="Which one shows">
          <Choices ariaLabel="Which one shows" value={s.pick} onChange={(v) => saveSettings({ pick: v }, `Countdown shows: ${PICK_LABEL[v].toLowerCase()}`)} options={PICKS.map((v) => ({ value: v, label: PICK_LABEL[v] }))} />
        </Field>
        {s.pick === 'pinned' && (
          <Field label="The one to show" hint="Shows whatever the distance (even months away). If it is switched off, the nearest one shows.">
            <Select ariaLabel="The one to show" value={s.pinnedId} onChange={(v) => saveSettings({ pinnedId: v }, 'Pinned occasion changed')} disabled={!canEdit}
              options={[{ value: '', label: 'Choose...' }, ...file.occasions.filter((o) => o.on).map((o) => ({ value: o.id, label: o.nameEn || o.nameHe }))]} />
          </Field>
        )}
        {s.pick === 'cycle' && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Field label="How many take turns"><NumberField value={s.cycleCount} min={RANGES.cycleCount.min} max={RANGES.cycleCount.max} onCommit={(n) => saveSettings({ cycleCount: n }, `${n} take turns`)} ariaLabel="How many take turns" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
            <Field label="Seconds each"><NumberField value={s.cycleSeconds} min={RANGES.cycleSeconds.min} max={RANGES.cycleSeconds.max} onCommit={(n) => saveSettings({ cycleSeconds: n }, `${n} seconds each`)} ariaLabel="Seconds each" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          </div>
        )}
        <Field label="Show it from how many days before" hint={`${RANGES.withinDays.min} to ${RANGES.withinDays.max}. Default ${SETTINGS_DEFAULTS.withinDays}. An occasion can have its own number.`}>
          <NumberField value={s.withinDays} min={RANGES.withinDays.min} max={RANGES.withinDays.max} onCommit={(n) => saveSettings({ withinDays: n }, `Shows from ${n} days before`)} ariaLabel="Days before" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
        </Field>
        <p style={{ ...small, margin: '8px 0 0', color: colors.text }} data-testid="occ-now">
          {hero && (s.pick === 'pinned' || nowRows.length)
            ? <>Now on the screen: <strong>{hero.nameEn || hero.nameHe}</strong>{heroWords?.big ? ` · ${heroWords.big} ${heroWords.unit.en}` : heroForm?.form === 'day' ? ' · today' : ''}{s.pick === 'cycle' && nowRows.length > 1 ? ` (+${Math.min(nowRows.length, s.cycleCount) - 1} more taking turns)` : ''}</>
            : `Nothing within ${s.withinDays} days, so the Countdown skips itself.`}
          {hero && !hero.begin.exact ? ' · The screen has no location for zmanim, so times are approximate (~).' : ''}
        </p>
      </div>

      <div style={card} data-testid="occ-list">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h3 style={{ ...h3, margin: 0, flex: 1 }}>Coming up</h3>
          {canEdit && <button type="button" style={btn(true)} onClick={() => setAdding(true)} data-testid="occ-add">+ Add an occasion</button>}
        </div>
        <p style={{ ...small, margin: '4px 0 10px' }} data-testid="occ-explain-dates">Each day is listed by the day it falls on. The countdown reaches zero when the day <strong>begins</strong>, which is usually the evening before, so "In 20 days" means 20 days until it begins.</p>
        <Timeline rows={rows} today={today} tz={file.tz} canEdit={canEdit} offCount={offCount} onEdit={(o) => setSheet(o)} onToggle={toggle} />
        <p style={{ ...small, marginTop: '10px' }} data-testid="occ-footnote">
          The starter dates are calendar rules only: a name and a Hebrew date, no explanations. Please check them with your rav and your minhag (for example Yom Tov is one day shorter in Israel). Add your own school events too: a dinner, a trip, a siyum.
        </p>
        <button type="button" style={btn(false, { marginTop: '6px', marginRight: '8px' })} onClick={() => copy(weekShare(file, ctxNow), 'Copied. Paste it into WhatsApp.')} data-testid="occ-share-week">Copy this week's days</button>
        {canEdit && <button type="button" style={btn(false, { marginTop: '6px' })} onClick={() => change('POST', '/restore-starters', undefined, 'Starter dates put back')} data-testid="occ-restore">Put back starter dates I removed</button>}
      </div>

      <Collapsible id="occ-look" title="How the Countdown looks" icon="list" summary={`${LANG_LABEL[s.language]}${s.comingUp ? ` · ${s.comingUpCount} coming up` : ''}${s.celebrate ? ' · confetti' : ''}`}>
        <Field label="Language"><Choices ariaLabel="Language" value={s.language} onChange={(v) => saveSettings({ language: v }, `Countdown: ${LANG_LABEL[v]}`)} options={LANGS.map((v) => ({ value: v, label: LANG_LABEL[v] }))} /></Field>
        <SwitchRow on={s.hebrewDate} onChange={() => saveSettings({ hebrewDate: !s.hebrewDate }, s.hebrewDate ? 'Hebrew date hidden' : 'Hebrew date shown')} label="Show the Hebrew date" />
        <SwitchRow on={s.civilDate} onChange={() => saveSettings({ civilDate: !s.civilDate }, s.civilDate ? 'Date hidden' : 'Date shown')} label="Show the regular date" />
        <SwitchRow on={s.seconds} onChange={() => saveSettings({ seconds: !s.seconds }, s.seconds ? 'Seconds off' : 'Seconds on')} label="Seconds in the last hour (12:07)" note="Off: whole minutes only. With approximate times there are never seconds." />
        <SwitchRow on={s.comingUp} onChange={() => saveSettings({ comingUp: !s.comingUp }, s.comingUp ? 'Coming up hidden' : 'Coming up shown')} label="'Coming up' strip with the next ones" />
        {s.comingUp && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Field label="How many"><NumberField value={s.comingUpCount} min={RANGES.comingUpCount.min} max={RANGES.comingUpCount.max} onCommit={(n) => saveSettings({ comingUpCount: n }, `${n} coming up`)} ariaLabel="How many coming up" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
            <Field label="Within days"><NumberField value={s.comingUpDays} min={RANGES.comingUpDays.min} max={RANGES.comingUpDays.max} onCommit={(n) => saveSettings({ comingUpDays: n }, `Coming up within ${n} days`)} ariaLabel="Coming up within days" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          </div>
        )}
        <SwitchRow on={s.celebrate} onChange={() => saveSettings({ celebrate: !s.celebrate }, s.celebrate ? 'Confetti off' : 'Confetti on')} label="Confetti at the moment it begins" note="Falls once and is gone; never on Minimal motion. Each occasion can turn it off for itself." />
        <Field label="The celebration shows for (minutes)" hint="Then the page says 'Today is' / 'Tonight is'.">
          <NumberField value={s.zeroMinutes} min={RANGES.zeroMinutes.min} max={RANGES.zeroMinutes.max} onCommit={(n) => saveSettings({ zeroMinutes: n }, `Celebration ${n} minutes`)} ariaLabel="Celebration minutes" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
          <div><span style={label}>Words for every occasion (English)</span><input defaultValue={s.zeroEn} aria-label="Words for every occasion in English" placeholder="Leave empty: each its own" maxLength={LIMITS.zero} onBlur={(e) => e.target.value.trim() !== s.zeroEn && saveSettings({ zeroEn: e.target.value.trim() }, 'Words saved')} style={{ ...fieldStyle, width: '100%' }} disabled={!canEdit} /></div>
          <div><span style={label}>Hebrew</span><input defaultValue={s.zeroHe} dir="rtl" aria-label="Words for every occasion in Hebrew" maxLength={LIMITS.zero} onBlur={(e) => e.target.value.trim() !== s.zeroHe && saveSettings({ zeroHe: e.target.value.trim() }, 'Words saved')} style={{ ...fieldStyle, width: '100%' }} disabled={!canEdit} /></div>
        </div>
        <SwitchRow on={s.shareEmoji} onChange={() => saveSettings({ shareEmoji: !s.shareEmoji }, s.shareEmoji ? 'Share text without a star' : 'Share text with a star')} label="A star at the start of the WhatsApp message" note="Off by default." testId="occ-share-emoji" />
        <SwitchRow on={s.explain} onChange={() => saveSettings({ explain: !s.explain }, s.explain ? 'Explanations hidden' : 'Explanations shown')} label="Show explanations (only ever with their source)" />
        {s.explain && <SwitchRow on={s.credit} onChange={() => saveSettings({ credit: !s.credit }, s.credit ? 'Source line hidden' : 'Source line shown')} label="Show the source under the explanation" note="Recommended. Off hides the line on the screen; an explanation still needs a source to show." />}
        <Field label="When an occasion begins (unless it has its own)">
          <Choices ariaLabel="When an occasion begins" value={s.beginsAt} onChange={(v) => saveSettings({ beginsAt: v }, `Begins: ${BEGINS_LABEL[v].toLowerCase()}`)} options={BEGINS.filter((v) => v !== 'time').map((v) => ({ value: v, label: BEGINS_LABEL[v] }))} />
        </Field>
        <Field label="If the screen has no zmanim, count to" hint="Used only when the screen has no location and no zmanim. The page then marks times with ~ and never shows seconds.">
          <input type="time" aria-label="Fallback time" value={s.fallbackTime} onChange={(e) => e.target.value && saveSettings({ fallbackTime: e.target.value }, `Fallback time ${e.target.value}`)} style={{ ...fieldStyle, maxWidth: '150px' }} disabled={!canEdit} />
        </Field>
      </Collapsible>

      <Collapsible id="occ-extras" title="Rail card, banner and takeover" icon="message" summary={[s.rail ? `rail ${s.railDays} days` : '', s.banner ? 'banner' : '', s.takeover ? 'takeover' : ''].filter(Boolean).join(' · ') || 'Off'}>
        <Hint style={{ marginTop: 0 }}>These only show while the Countdown is switched on (above). Each occasion can also skip any of them.</Hint>
        <SwitchRow on={s.rail} onChange={() => saveSettings({ rail: !s.rail }, s.rail ? 'Rail card off' : 'Rail card on')} label="Rail card: '5 days to Yud-Tes Kislev'" note="In the side rail, until the moment it begins." testId="occ-rail" />
        {s.rail && <Field label="From how many days before"><NumberField value={s.railDays} min={RANGES.railDays.min} max={RANGES.railDays.max} onCommit={(n) => saveSettings({ railDays: n }, `Rail card from ${n} days before`)} ariaLabel="Rail card days" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>}
        <SwitchRow on={s.banner} onChange={() => saveSettings({ banner: !s.banner }, s.banner ? 'Banner off' : 'Banner on')} label="Banner on the day: 'Today: Yud-Tes Kislev · Farbrengen 8 PM'" note="From the moment it begins until it ends. Banners never pause the slides." testId="occ-banner" />
        <SwitchRow on={s.takeover} onChange={() => saveSettings({ takeover: !s.takeover }, s.takeover ? 'Takeover off' : 'Takeover on')} label="Full-screen takeover at the moment it begins" note="Pauses the slides for a few minutes with the greeting. Only with exact zmanim, never on an approximate time." testId="occ-takeover" />
        {s.takeover && <Field label="Takeover minutes"><NumberField value={s.takeoverMinutes} min={RANGES.takeoverMinutes.min} max={RANGES.takeoverMinutes.max} onCommit={(n) => saveSettings({ takeoverMinutes: n }, `Takeover ${n} minutes`)} ariaLabel="Takeover minutes" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>}
      </Collapsible>

      <Collapsible id="occ-hype" title="Hype moments" icon="star" summary={hypeSummary(s)}>
        <HypeGlobal s={s} save={saveSettings} canEdit={canEdit} hero={hero} openPreview={openPreview} />
      </Collapsible>

      <Collapsible id="occ-views" title="Countdown views" icon="play" summary={`${s.tapForms.length} view${s.tapForms.length === 1 ? '' : 's'}${s.autoForms.on ? ` \u00b7 changes every ${s.autoForms.seconds} s` : ''}`}>
        <ViewsGlobal s={s} save={saveSettings} canEdit={canEdit} />
      </Collapsible>

      <Collapsible id="occ-cats" title="Which kinds of days show" icon="list" summary={s.showCategories.length === CATEGORIES.length ? 'All kinds' : s.showCategories.map((c) => CATEGORY_LABEL[c]).join(', ') || 'None'}>
        <Hint style={{ marginTop: 0 }}>For a Countdown with only Chabad days, switch the others off. This covers the page, the coming-up strip, the rail card, the banner and the takeovers. The list above always shows everything.</Hint>
        {CATEGORIES.map((c) => (
          <SwitchRow key={c} on={s.showCategories.includes(c)} onChange={() => saveSettings({ showCategories: CATEGORIES.filter((x) => (x === c ? !s.showCategories.includes(c) : s.showCategories.includes(x))) }, `${CATEGORY_LABEL[c]}: ${s.showCategories.includes(c) ? 'hidden' : 'shown'}`)} label={CATEGORY_LABEL[c]} testId={`occ-showcat-${c}`} />
        ))}
        {s.showCategories.length === 0 && <Hint style={{ color: colors.danger }}>Nothing is switched on, so the Countdown has nothing to show.</Hint>}
      </Collapsible>

      <Collapsible id="occ-words" title="Words for each stage" icon="word" summary={`${Object.keys(s.stageText).length + Object.keys(s.milestoneText).length} of your own lines`}>
        <WordsEditor level="global" stageText={s.stageText} milestoneText={s.milestoneText} disabled={!canEdit} onChange={(patch, msg) => saveSettings(patch, msg)} />
      </Collapsible>

      <Collapsible id="occ-look2" title="Look" icon="palette" summary={`${s.display === 'flip' ? 'Flip clock' : 'Classic'}${s.look.accent ? ` · ${s.look.accent}` : ''}${s.look.photo ? ' · photo' : ''}`}>
        <Hint style={{ marginTop: 0 }}>For every countdown. Each occasion can have its own look in its edit sheet.</Hint>
        <DisplayField level="global" value={s.display} onChange={(v) => saveSettings({ display: v }, `Numbers: ${v === 'flip' ? 'flip clock' : 'classic'}`)} />
        <LookEditor level="global" look={s.look} disabled={!canEdit} onChange={(l, msg) => saveSettings({ look: l }, msg)} />
      </Collapsible>

      <Collapsible id="occ-layout" title="Layout" icon="list" summary={`${s.layout.side === 'right' ? 'Numbers on the right' : 'Numbers on the left'} · ${s.layout.scale}%`}>
        <Hint style={{ marginTop: 0 }}>For every countdown. Each occasion can have its own in its edit sheet.</Hint>
        <LayoutEditor level="global" layout={s.layout} disabled={!canEdit} onChange={(l, msg) => saveSettings({ layout: l }, msg)} />
      </Collapsible>

      <Collapsible id="occ-sound" title="Sound" icon="play" summary={s.sound.on ? `On \u00b7 ${s.sound.chime}` : 'Off'}>
        <SoundGlobal sound={s.sound} save={saveSettings} canEdit={canEdit} />
      </Collapsible>

      <Collapsible id="occ-preview" title="Preview" icon="play" summary={hero ? `See ${hero.nameEn || hero.nameHe} at a chosen moment` : 'Add an occasion first'}>
        {hero ? (
          <>
            <Hint style={{ marginTop: 0 }}>Opens the screen at that moment, for <strong>{hero.nameEn || hero.nameHe}</strong>. Nothing changes on the real TV. The page shows in the preview only when the Countdown is switched on.</Hint>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              {[['In 30 days', hero.begin.ms - 30 * 86400000 + 3 * 3600000], ['Tomorrow', hero.begin.ms - 26 * 3600000], ['The last hour', hero.begin.ms - 20 * 60000], ['At zero', hero.begin.ms + 30000], ['The day', Date.parse(`${hero.startISO}T12:00:00`)]].map(([t, ms]) => (
                <button key={t} type="button" style={btn(false)} onClick={() => openPreview(ms)} data-testid={`occ-preview-${t.replace(/\s+/g, '-').toLowerCase()}`}>{t}</button>
              ))}
              <button type="button" style={btn(false)} onClick={() => openPreview(0)}>Now</button>
            </div>
          </>
        ) : <Hint style={{ marginTop: 0 }}>Nothing is switched on.</Hint>}
      </Collapsible>

      {canEditSlides && onNavigate && (
        <button type="button" style={btn(false, { justifySelf: 'start' })} onClick={() => onNavigate('slides')}>Seconds on screen and order: Slides</button>
      )}

      {adding && (
        <LibraryPicker file={file} today={today} busy={busy} onClose={() => setAdding(false)} onOwn={() => { setAdding(false); setSheet({}); }}
          onPick={async (e) => { const next = await change('POST', '', { occasion: libraryDraft(e) }, `Added ${e.en}`); if (next) { setAdding(false); setSheet(next.occasions.find((o) => o.id === next.id) || null); } }} />
      )}
      {sheet && (
        <OccasionSheet
          key={sheet.id || 'new'} initial={sheet.id ? sheet : null} settings={s} ctxNow={ctxNow} busy={busy} copy={copy} appSettings={appSettings} cache={cache} today={today}
          onClose={() => setSheet(null)} onSave={save} onDelete={() => setConfirm(sheet)}
        />
      )}
      {confirm && <ConfirmDialog title="Remove this occasion?" message={`${confirm.nameEn || confirm.nameHe} leaves the list. You can Undo right after.`} confirmLabel="Remove" onConfirm={() => remove(confirm)} onCancel={() => setConfirm(null)} />}
      {modal}
    </div>
  );
}

export { timeEn };
