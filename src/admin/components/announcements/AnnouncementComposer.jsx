import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import AnnouncementPreview from './AnnouncementPreview.jsx';
import {
  DISPLAY_OPTIONS, LAYOUT_OPTIONS, STYLE_OPTIONS, TEMPLATE_OPTIONS, DAY_CHIPS,
  isoToLocalInput, localInputToIso, parseTimeInput, timeToDisplay, minutesLabel, endOfDay,
  emptyItem, withDefaults, LAYOUT_LABEL,
} from './helpers.js';
import { findTakeoverConflicts, hasText, formatWhen, recurrenceLabel, describeTiming } from '../../../shared/announcements.js';

// ── Small building blocks ───────────────────────────────────────────────────

const label = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' };
const sectionTitle = { fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };

function Section({ title, children, hint }) {
  return (
    <section style={{ padding: '16px 0', borderTop: `1px solid ${colors.border}` }}>
      <h3 style={sectionTitle}>{title}</h3>
      {hint && <p style={{ ...label, marginTop: '-4px', marginBottom: '10px', color: colors.muted }}>{hint}</p>}
      {children}
    </section>
  );
}

function Chip({ active, onClick, children, disabled, title, ariaPressed = true }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ariaPressed ? !!active : undefined}
      style={{
        padding: '8px 14px', minHeight: '40px', borderRadius: '20px', cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${active ? colors.gold : colors.border}`,
        background: active ? colors.goldBg : 'transparent',
        color: disabled ? colors.muted : active ? colors.gold : colors.text,
        fontFamily: adminFonts.englishBody, fontSize: '14px', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Field({ title, children, style }) {
  return (
    <label style={{ display: 'block', marginBottom: '12px', ...style }}>
      <span style={label}>{title}</span>
      {children}
    </label>
  );
}

function TextArea({ value, onChange, rtl, rows = 2, placeholder, ariaLabel }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      dir={rtl ? 'rtl' : 'ltr'}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45, fontFamily: rtl ? adminFonts.hebrewPrimary : adminFonts.englishBody, fontSize: '15px' }}
    />
  );
}

function TextInput({ value, onChange, rtl, placeholder, ariaLabel, onBlur, inputMode }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      dir={rtl ? 'rtl' : 'ltr'}
      placeholder={placeholder}
      aria-label={ariaLabel}
      inputMode={inputMode}
      style={{ ...inputStyle, minHeight: '40px', fontFamily: rtl ? adminFonts.hebrewPrimary : adminFonts.englishBody, fontSize: '15px' }}
    />
  );
}

/** Typeable time box: accepts "9:30 pm", "21:30", "930p"; stores "HH:MM". */
function TimeInput({ value, onChange, ariaLabel, placeholder = 'e.g. 9:30 PM' }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? timeToDisplay(value);
  const bad = draft != null && draft.trim() && parseTimeInput(draft) == null;
  return (
    <div>
      <input
        type="text"
        value={shown}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onFocus={() => setDraft(timeToDisplay(value))}
        onChange={(e) => {
          setDraft(e.target.value);
          const t = parseTimeInput(e.target.value);
          if (t != null) onChange(t);
        }}
        onBlur={() => setDraft(null)}
        style={{ ...inputStyle, minHeight: '40px', fontFamily: adminFonts.englishBody, fontSize: '15px', borderColor: bad ? colors.danger : colors.border }}
      />
      {bad && <span style={{ ...label, color: colors.danger, marginTop: '4px' }}>Type a time like 9:30 PM or 21:30</span>}
    </div>
  );
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)} ariaPressed>{o.label}</Chip>
      ))}
    </div>
  );
}

// ── Layout thumbnails ───────────────────────────────────────────────────────

function LayoutThumb({ layout }) {
  const bar = (w, h, c = colors.dim, extra = {}) => <div style={{ width: w, height: h, background: c, borderRadius: 2, ...extra }} />;
  const box = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 };
  switch (layout) {
    case 'bigwords': return <div style={box}>{bar('80%', 12, colors.text)}{bar('60%', 12, colors.text)}</div>;
    case 'event': return (
      <div style={box}>
        {bar('70%', 8, colors.text)}
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 20, height: 14, border: `1px solid ${colors.gold}`, borderRadius: 3 }} />
          <div style={{ width: 24, height: 14, border: `1px solid ${colors.gold}`, borderRadius: 3, background: colors.goldBg }} />
        </div>
        {bar('40%', 4)}
      </div>
    );
    case 'list': return (
      <div style={{ ...box, alignItems: 'flex-start', paddingLeft: '18%' }}>
        {bar('50%', 6, colors.gold)}
        {[0, 1, 2].map((i) => <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}><div style={{ width: 3, height: 3, background: colors.gold }} />{bar(30 + i * 6, 4)}</div>)}
      </div>
    );
    case 'quicktime': return <div style={box}>{bar('50%', 6, colors.text)}<div style={{ fontFamily: adminFonts.englishDisplay, fontWeight: 700, fontSize: 18, color: colors.gold, lineHeight: 1 }}>1:45</div></div>;
    default: return <div style={box}><div style={{ width: '86%', height: '80%', background: 'linear-gradient(135deg,#1a1000,#7a5a10)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bar('50%', 6, '#FFD700')}</div></div>;
  }
}

// ── Takeover conflict dialog (owner decision 3) ─────────────────────────────

function ConflictDialog({ conflicts, onChoose, onCancel, tz }) {
  const now = new Date();
  const canQueue = conflicts.every((c) => c.when?.expiresAt);
  const names = conflicts.map((c) => c.content?.headlineEn || c.content?.headlineHe || c.content?.event?.title || 'another takeover');
  const opts = [
    { key: 'replace', title: 'Replace', text: 'Show the new one now. The other one is paused (not deleted).' },
    { key: 'share', title: 'Share', text: 'Both take turns full screen, switching every 10 seconds.' },
    ...(canQueue ? [{ key: 'queue', title: 'Queue after', text: `Start the new one when the other ends (${formatWhen(Date.parse(conflicts.map((c) => c.when.expiresAt).sort().pop()), now, { tz })}).` }] : []),
  ];
  return (
    <div role="presentation" onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,5,.7)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div role="dialog" aria-modal="true" aria-label="Another takeover is already on" onClick={(e) => e.stopPropagation()} style={{ background: colors.bg, border: `1px solid ${colors.goldBd}`, borderRadius: '10px', padding: '20px', maxWidth: '440px', width: '100%' }}>
        <h4 style={{ fontFamily: adminFonts.englishBody, fontSize: '17px', color: colors.text, margin: '0 0 6px' }}>Another takeover is already on</h4>
        <p style={{ ...label, fontSize: '14px', lineHeight: 1.5, marginBottom: '14px' }}>
          “{names.join('”, “')}” {conflicts.length > 1 ? 'are' : 'is'} live or scheduled at the same time ({conflicts.map((c) => describeTiming(c, now, { tz })).join('; ')}). Only one takeover can cover the screen. What should happen?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {opts.map((o) => (
            <button key={o.key} type="button" onClick={() => onChoose(o.key)} style={{ ...buttonSecondary, textAlign: 'left', padding: '10px 14px', minHeight: '48px', borderColor: colors.goldBd }}>
              <div style={{ fontWeight: 600, color: colors.gold }}>{o.title}</div>
              <div style={{ fontSize: '13px', color: colors.dim, marginTop: '2px' }}>{o.text}</div>
            </button>
          ))}
          <button type="button" onClick={onCancel} style={{ ...buttonSecondary, minHeight: '44px' }}>Cancel — keep editing</button>
        </div>
      </div>
    </div>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────

/**
 * Full-screen sheet (phone) / wide side panel (desktop) to create or edit an
 * announcement. props.initial: an existing item (edit) or a partial preset
 * (new, e.g. { display: 'slide' } from the Slides tab).
 */
export default function AnnouncementComposer({
  initial, announcements = [], settings = {}, onClose,
  onCreate, onUpdate, fetchShabbosEnd,
}) {
  const isMobile = useIsMobile();
  const editing = !!initial?.id;
  const [item, setItem] = useState(() => (editing ? withDefaults(initial) : { ...emptyItem(initial?.display || 'slide'), ...(initial || {}), ...(initial?.display ? { display: initial.display } : {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [shabbos, setShabbos] = useState(null);
  const [endMode, setEndMode] = useState(() => (initial?.when?.expiresAt ? 'at' : 'never'));
  const [startMode, setStartMode] = useState(() => (initial?.when?.startsAt ? 'at' : 'now'));
  const [repeatOn, setRepeatOn] = useState(() => !!initial?.when?.recurrence);
  const tz = settings?.location?.timezone || 'America/New_York';

  useEffect(() => {
    let alive = true;
    fetchShabbosEnd?.().then((r) => { if (alive) setShabbos(r || { available: false }); });
    return () => { alive = false; };
  }, [fetchShabbosEnd]);

  // Lock background scroll + Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !conflicts) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose, conflicts]);

  const set = useCallback((path, value) => {
    setItem((prev) => {
      const next = { ...prev };
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...(cur[keys[i]] || {}) };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
    setError('');
  }, []);

  const d = item.display;
  const usesLayout = d === 'slide' || d === 'takeover';
  const layout = usesLayout ? (item.look.layout || 'bigwords') : 'bigwords';
  const style = item.look.style || '';
  const c = item.content;
  const rec = item.when.recurrence || { days: [], monthDays: [], windows: [], from: null, until: null };

  // ── When helpers
  const startBase = () => (item.when.startsAt ? new Date(item.when.startsAt) : new Date());
  const setEndIn = (mins) => { setEndMode('at'); set('when.expiresAt', new Date(startBase().getTime() + mins * 60000).toISOString()); };
  const endChips = [
    { key: '15', label: '15 min', on: () => setEndIn(15) },
    { key: '60', label: '1 hour', on: () => setEndIn(60) },
    { key: '120', label: '2 hours', on: () => setEndIn(120) },
    { key: 'eod', label: 'End of day', on: () => { setEndMode('at'); set('when.expiresAt', endOfDay(startBase()).toISOString()); } },
  ];
  const shabbosLabel = shabbos?.available ? `Until end of Shabbos (${formatWhen(Date.parse(shabbos.iso), new Date(), { tz })})` : 'Until end of Shabbos';

  // ── Payload
  const buildPayload = (status) => {
    const content = { ...item.content };
    content.list = { ...content.list, items: (content.list.items || []).map((s) => s).filter((s) => String(s).trim()) };
    const recurrence = repeatOn ? {
      days: rec.days || [], monthDays: rec.monthDays || [],
      windows: (rec.windows || []).filter((w) => w.start && w.end), from: rec.from || null, until: rec.until || null,
    } : null;
    return {
      status,
      display: item.display,
      hold: d === 'slide' ? !!item.hold : false,
      enabled: item.enabled !== false,
      content,
      look: { ...item.look, style: item.look.style || null, layout: usesLayout ? layout : (item.look.layout || 'bigwords') },
      slide: item.slide,
      note: item.note,
      takeover: item.takeover,
      banner: item.banner,
      when: {
        startsAt: startMode === 'at' ? item.when.startsAt : null,
        expiresAt: endMode === 'never' ? null : item.when.expiresAt,
        recurrence,
      },
    };
  };

  const submit = async (status, resolve) => {
    const payload = buildPayload(status);
    if (status !== 'draft' && !hasText(payload)) {
      setError(layout === 'quicktime' && usesLayout ? 'Fill in a name and a time.' : 'Type some text first (English or Hebrew).');
      return;
    }
    if (payload.when.startsAt && payload.when.expiresAt && payload.when.expiresAt <= payload.when.startsAt) {
      setError('The end time must be after the start time.');
      return;
    }
    if (status !== 'draft' && payload.when.expiresAt && Date.parse(payload.when.expiresAt) <= Date.now()) {
      setError('That end time has already passed. Pick a later one.');
      return;
    }
    if (status !== 'draft' && d === 'takeover' && !resolve) {
      const found = findTakeoverConflicts({ ...payload, id: initial?.id || '__new__', enabled: true }, announcements, new Date(), { tz });
      if (found.length) { setConflicts(found); setPendingStatus(status); return; }
    }
    if (resolve) payload.resolve = resolve;
    setSaving(true);
    const msg = status === 'draft' ? 'Draft saved' : editing ? 'Saved' : 'Posted';
    const res = editing ? await onUpdate(initial.id, payload, msg) : await onCreate(payload, msg);
    setSaving(false);
    if (res) onClose(res);
  };

  const preview = useMemo(() => {
    const p = buildPayload(item.status || 'published');
    return { ...p, id: initial?.id || 'preview', createdAt: initial?.createdAt, legacy: initial?.legacy, status: 'published' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, startMode, endMode, repeatOn]);

  // ── Sections
  const showAs = (
    <Section title="Show as">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '8px' }}>
        {DISPLAY_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={d === o.value}
            onClick={() => set('display', o.value)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', minHeight: '64px',
              border: `1px solid ${d === o.value ? colors.gold : colors.border}`,
              background: d === o.value ? colors.goldBg : colors.surface,
            }}
          >
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 600, color: d === o.value ? colors.gold : colors.text }}>{o.label}</div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '3px', lineHeight: 1.35 }}>{o.explain}</div>
          </button>
        ))}
      </div>
    </Section>
  );

  const layoutPicker = usesLayout && (
    <Section title="Layout">
      <div role="radiogroup" aria-label="Layout" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch' }}>
        {LAYOUT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={layout === o.value}
            onClick={() => set('look.layout', o.value)}
            title={o.explain}
            style={{
              flex: '0 0 auto', width: '104px', padding: '6px', borderRadius: '8px', cursor: 'pointer',
              border: `1px solid ${layout === o.value ? colors.gold : colors.border}`,
              background: layout === o.value ? colors.goldBg : colors.surface,
            }}
          >
            <div style={{ height: '52px', borderRadius: '4px', background: colors.panel, overflow: 'hidden' }}><LayoutThumb layout={o.value} /></div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: layout === o.value ? colors.gold : colors.text, marginTop: '5px' }}>{o.label}</div>
          </button>
        ))}
      </div>
      <p style={{ ...label, marginTop: '6px', color: colors.muted }}>{LAYOUT_OPTIONS.find((o) => o.value === layout)?.explain}</p>
    </Section>
  );

  const pair = (titleEn, keyEn, titleHe, keyHe, multi = true, rows = 2) => (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
      <Field title={titleEn}>
        {multi ? <TextArea value={keyEn.split('.').reduce((o, k) => o?.[k], item)} onChange={(v) => set(keyEn, v)} rows={rows} ariaLabel={titleEn} />
          : <TextInput value={keyEn.split('.').reduce((o, k) => o?.[k], item)} onChange={(v) => set(keyEn, v)} ariaLabel={titleEn} />}
      </Field>
      <Field title={titleHe}>
        {multi ? <TextArea rtl value={keyHe.split('.').reduce((o, k) => o?.[k], item)} onChange={(v) => set(keyHe, v)} rows={rows} ariaLabel={titleHe} />
          : <TextInput rtl value={keyHe.split('.').reduce((o, k) => o?.[k], item)} onChange={(v) => set(keyHe, v)} ariaLabel={titleHe} />}
      </Field>
    </div>
  );

  let textFields;
  if (!usesLayout) {
    textFields = (
      <>
        {pair('Text (English)', 'content.headlineEn', 'Text (Hebrew)', 'content.headlineHe', true, 3)}
        {d === 'banner' && <p style={{ ...label, color: colors.muted }}>The banner is one scrolling line: line breaks show as “ · ”. It shows the Hebrew text if there is some, otherwise the English.</p>}
      </>
    );
  } else if (layout === 'event') {
    textFields = (
      <>
        {pair('Event (English)', 'content.event.title', 'Event (Hebrew)', 'content.event.titleHe', false)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Field title="Day">
            <TextInput value={c.event.day} onChange={(v) => set('content.event.day', v)} placeholder="Thursday / Tonight / Oct 22" ariaLabel="Day" />
          </Field>
          <Field title="Time"><TimeInput value={c.event.time} onChange={(v) => set('content.event.time', v)} ariaLabel="Event time" /></Field>
        </div>
        {pair('Place (English)', 'content.event.place', 'Place (Hebrew)', 'content.event.placeHe', false)}
      </>
    );
  } else if (layout === 'list') {
    const items = c.list.items || [];
    textFields = (
      <>
        {pair('Heading (English)', 'content.list.heading', 'Heading (Hebrew)', 'content.list.headingHe', false)}
        <span style={label}>Items (up to 8; Enter = new line inside an item)</span>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <TextArea value={t} rows={1} onChange={(v) => set('content.list.items', items.map((x, j) => (j === i ? v : x)))} rtl={/[֐-׿]/.test(t)} ariaLabel={`Item ${i + 1}`} />
            </div>
            <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => set('content.list.items', items.filter((_, j) => j !== i))} style={{ ...buttonSecondary, minWidth: '40px', minHeight: '40px', padding: 0, color: colors.danger }}>×</button>
          </div>
        ))}
        {items.length < 8 && <button type="button" onClick={() => set('content.list.items', [...items, ''])} style={{ ...buttonSecondary, minHeight: '40px' }}>+ Add item</button>}
      </>
    );
  } else if (layout === 'quicktime') {
    textFields = (
      <>
        {pair('What (English)', 'content.quicktime.name', 'What (Hebrew)', 'content.quicktime.nameHe', false)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Field title="Time"><TimeInput value={c.quicktime.time} onChange={(v) => set('content.quicktime.time', v)} ariaLabel="Time" placeholder="e.g. 1:45 PM" /></Field>
          <Field title="Where (optional)"><TextInput value={c.quicktime.place} onChange={(v) => set('content.quicktime.place', v)} placeholder="in the zal" ariaLabel="Where" /></Field>
        </div>
      </>
    );
  } else {
    textFields = (
      <>
        {pair('Main line (English)', 'content.headlineEn', 'Main line (Hebrew)', 'content.headlineHe', true, 2)}
        {pair('Second line (English)', 'content.bodyEn', 'Second line (Hebrew)', 'content.bodyHe', true, 2)}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
          <Field title="Small line on top (optional)"><TextInput value={c.target} onChange={(v) => set('content.target', v)} placeholder="Shiur Gimmel / Everyone" ariaLabel="Small line on top" /></Field>
          <Field title="Subtitle (optional)"><TextInput value={c.subtitle} onChange={(v) => set('content.subtitle', v)} ariaLabel="Subtitle" /></Field>
        </div>
        {layout === 'classic' && !style && (item.look.template === 'quote') && (
          <Field title="Attribution"><TextInput value={c.attribution} onChange={(v) => set('content.attribution', v)} ariaLabel="Attribution" /></Field>
        )}
      </>
    );
  }

  const showStyle = usesLayout;
  const showTemplate = d === 'slide' && layout === 'classic' && !style;
  const showFit = (usesLayout && layout === 'classic' && (style || d === 'takeover')) || d === 'note';
  const templateOpts = [...TEMPLATE_OPTIONS, ...(['board', 'pinned'].includes(item.look.template) ? [{ value: item.look.template, label: item.look.template === 'board' ? 'Board (old)' : 'Pinned (old)' }] : [])];

  const lookSection = (showStyle || showTemplate || showFit || d === 'slide') && (
    <Section title="Look">
      {showStyle && (
        <>
          <span style={label}>Style</span>
          <div role="radiogroup" aria-label="Style" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '10px', WebkitOverflowScrolling: 'touch' }}>
            {STYLE_OPTIONS.map((o) => (
              <button
                key={o.value || 'theme'}
                type="button"
                role="radio"
                aria-checked={style === o.value}
                onClick={() => set('look.style', o.value || null)}
                title={o.desc}
                style={{
                  flex: '0 0 auto', width: '84px', padding: '6px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                  border: `1px solid ${style === o.value ? colors.gold : colors.border}`,
                  background: style === o.value ? colors.goldBg : 'transparent',
                }}
              >
                <div style={{ height: '28px', borderRadius: '4px', background: o.swatch || colors.panel, border: o.swatch ? 'none' : `1px dashed ${colors.border}` }} />
                <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: style === o.value ? colors.gold : colors.text, marginTop: '4px' }}>{o.label}</div>
              </button>
            ))}
          </div>
        </>
      )}
      {showTemplate && (
        <Field title="Template">
          <Segmented ariaLabel="Template" options={templateOpts} value={item.look.template || 'announcement'} onChange={(v) => set('look.template', v)} />
        </Field>
      )}
      {showFit && (
        <Field title="Text size">
          <Segmented ariaLabel="Text size" options={[{ value: 'auto', label: 'Auto (fit the space)' }, { value: 'fixed', label: 'Fixed' }]} value={item.look.fit || 'auto'} onChange={(v) => set('look.fit', v)} />
        </Field>
      )}
      {d === 'slide' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <Chip active={!!item.look.fullscreen} onClick={() => set('look.fullscreen', !item.look.fullscreen)}>
            {item.look.fullscreen ? '✓ ' : ''}Full screen (hide the side column)
          </Chip>
          {!item.hold && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim }}>
              Seconds on screen
              <input
                type="text" inputMode="numeric" value={item.slide.duration ?? 12}
                onChange={(e) => { const n = e.target.value.replace(/\D/g, ''); set('slide.duration', n === '' ? '' : Number(n)); }}
                onBlur={() => set('slide.duration', Math.min(600, Math.max(3, Number(item.slide.duration) || 12)))}
                aria-label="Seconds on screen"
                style={{ ...inputStyle, width: '70px', minHeight: '40px', textAlign: 'center' }}
              />
            </label>
          )}
        </div>
      )}
    </Section>
  );

  const holdSection = d === 'slide' && (
    <Section title="While this is showing">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[
          { v: false, t: 'Keep rotating other slides', s: 'It takes its turn in the slideshow.' },
          { v: true, t: 'Pause everything else', s: 'It stays on screen until it ends; the slideshow then picks up where it left off.' },
        ].map((o) => (
          <button key={String(o.v)} type="button" role="radio" aria-checked={!!item.hold === o.v} onClick={() => set('hold', o.v)}
            style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', minHeight: '52px', border: `1px solid ${!!item.hold === o.v ? colors.gold : colors.border}`, background: !!item.hold === o.v ? colors.goldBg : 'transparent' }}>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: !!item.hold === o.v ? colors.gold : colors.text }}>{o.t}</div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>{o.s}</div>
          </button>
        ))}
      </div>
    </Section>
  );

  const toggleDay = (day) => {
    const days = rec.days || [];
    set('when.recurrence', { ...rec, days: days.includes(day) ? days.filter((x) => x !== day) : [...days, day] });
  };
  const windows = rec.windows || [];

  const whenSection = (
    <Section title="When">
      <span style={label}>Start</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <Chip active={startMode === 'now'} onClick={() => { setStartMode('now'); set('when.startsAt', null); }}>Now</Chip>
        <Chip active={startMode === 'at'} onClick={() => { setStartMode('at'); if (!item.when.startsAt) set('when.startsAt', new Date(Date.now() + 3600000).toISOString()); }}>At a date &amp; time…</Chip>
      </div>
      {startMode === 'at' && (
        <input type="datetime-local" aria-label="Start date and time" value={isoToLocalInput(item.when.startsAt)} onChange={(e) => set('when.startsAt', localInputToIso(e.target.value))} style={{ ...inputStyle, minHeight: '42px', marginBottom: '12px', maxWidth: '280px' }} />
      )}
      <span style={label}>End</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <Chip active={endMode === 'never'} onClick={() => { setEndMode('never'); set('when.expiresAt', null); }}>Until I remove it</Chip>
        {endChips.map((ch) => <Chip key={ch.key} ariaPressed={false} onClick={ch.on}>{ch.label}</Chip>)}
        <Chip
          ariaPressed={false}
          disabled={!shabbos?.available}
          title={shabbos?.available ? `Tzeis on Shabbos ${shabbos.date}` : 'Shabbos end time is not available (no zmanim)'}
          onClick={() => { setEndMode('at'); set('when.expiresAt', shabbos.iso); }}
        >
          {shabbosLabel}
        </Chip>
        <Chip active={endMode === 'at'} onClick={() => { setEndMode('at'); if (!item.when.expiresAt) set('when.expiresAt', endOfDay(startBase()).toISOString()); }}>At a date &amp; time…</Chip>
      </div>
      {endMode === 'at' && (
        <>
          <input type="datetime-local" aria-label="End date and time" value={isoToLocalInput(item.when.expiresAt)} onChange={(e) => set('when.expiresAt', localInputToIso(e.target.value))} style={{ ...inputStyle, minHeight: '42px', maxWidth: '280px' }} />
          {item.when.expiresAt && <p style={{ ...label, marginTop: '6px', color: colors.gold }}>Ends {formatWhen(Date.parse(item.when.expiresAt), new Date(), { tz })}{item.when.startsAt || startMode === 'now' ? ` · ${minutesLabel(Math.max(0, Math.round((Date.parse(item.when.expiresAt) - startBase().getTime()) / 60000)))}` : ''}</p>}
        </>
      )}

      <div style={{ marginTop: '14px' }}>
        <Chip active={repeatOn} onClick={() => { setRepeatOn(!repeatOn); if (!item.when.recurrence) set('when.recurrence', { days: [], monthDays: [], windows: [], from: null, until: null }); }}>
          {repeatOn ? '✓ ' : ''}Repeat on certain days / times
        </Chip>
      </div>
      {repeatOn && (
        <div style={{ marginTop: '12px', padding: '12px', border: `1px solid ${colors.border}`, borderRadius: '8px' }}>
          <span style={label}>Days (none = every day)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {DAY_CHIPS.map((day) => <Chip key={day} active={(rec.days || []).includes(day)} onClick={() => toggleDay(day)}>{day}</Chip>)}
          </div>
          <Field title="Days of the month (optional, e.g. 1, 15)">
            <TextInput
              value={(rec.monthDays || []).join(', ')}
              onChange={(v) => set('when.recurrence', { ...rec, monthDays: v.split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 31) })}
              inputMode="numeric"
              ariaLabel="Days of the month"
            />
          </Field>
          <span style={label}>Time windows (none = all day)</span>
          {windows.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}><TimeInput value={w.start} placeholder="from 7:00 AM" ariaLabel={`Window ${i + 1} start`} onChange={(v) => set('when.recurrence', { ...rec, windows: windows.map((x, j) => (j === i ? { ...x, start: v } : x)) })} /></div>
              <span style={{ color: colors.dim }}>–</span>
              <div style={{ flex: 1 }}><TimeInput value={w.end} placeholder="to 9:30 AM" ariaLabel={`Window ${i + 1} end`} onChange={(v) => set('when.recurrence', { ...rec, windows: windows.map((x, j) => (j === i ? { ...x, end: v } : x)) })} /></div>
              <button type="button" aria-label={`Remove window ${i + 1}`} onClick={() => set('when.recurrence', { ...rec, windows: windows.filter((_, j) => j !== i) })} style={{ ...buttonSecondary, minWidth: '40px', minHeight: '40px', padding: 0, color: colors.danger }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => set('when.recurrence', { ...rec, windows: [...windows, { start: '', end: '' }] })} style={{ ...buttonSecondary, minHeight: '40px', marginBottom: '12px' }}>+ Add time window</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Field title="From date (optional)"><input type="date" aria-label="Repeat from date" value={rec.from || ''} onChange={(e) => set('when.recurrence', { ...rec, from: e.target.value || null })} style={{ ...inputStyle, minHeight: '42px' }} /></Field>
            <Field title="Until date (optional)"><input type="date" aria-label="Repeat until date" value={rec.until || ''} onChange={(e) => set('when.recurrence', { ...rec, until: e.target.value || null })} style={{ ...inputStyle, minHeight: '42px' }} /></Field>
          </div>
          {recurrenceLabel(buildPayload('published').when.recurrence) && (
            <p style={{ ...label, color: colors.gold, margin: 0 }}>Shows: {recurrenceLabel(buildPayload('published').when.recurrence)}</p>
          )}
        </div>
      )}
    </Section>
  );

  const previewBlock = (
    <div>
      <h3 style={sectionTitle}>Preview</h3>
      <AnnouncementPreview item={preview} settings={settings} />
      <p style={{ ...label, marginTop: '6px', color: colors.muted }}>
        {d === 'takeover' ? 'Covers the whole screen.' : d === 'banner' ? 'The banner text scrolls in from the right.' : ''}
        {' '}{describeTiming({ ...preview, createdAt: new Date().toISOString() }, new Date(), { tz })}
      </p>
    </div>
  );

  const isDraft = initial?.status === 'draft';
  const footer = (
    <div style={{
      display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
      padding: isMobile ? '10px 14px calc(10px + env(safe-area-inset-bottom))' : '12px 20px',
      borderTop: `1px solid ${colors.border}`, background: colors.panel,
    }}>
      {error && <span role="alert" style={{ flex: '1 1 100%', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.danger }}>{error}</span>}
      {(!editing || isDraft) && (
        <button type="button" disabled={saving} onClick={() => submit('draft')} style={{ ...buttonSecondary, minHeight: '44px', flex: isMobile ? 1 : undefined }}>Save draft</button>
      )}
      <button type="button" disabled={saving} onClick={() => submit('published')} style={{ ...buttonPrimary, minHeight: '44px', flex: isMobile ? 1.4 : undefined, opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : editing && !isDraft ? 'Save changes' : 'Post'}
      </button>
    </div>
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: isMobile ? '10px 14px' : '14px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.panel }}>
      <button type="button" onClick={() => onClose()} aria-label="Close" style={{ ...buttonSecondary, minWidth: '44px', minHeight: '44px', padding: 0, fontSize: '20px' }}>×</button>
      <h2 style={{ flex: 1, fontFamily: adminFonts.englishBody, fontSize: '19px', fontWeight: 600, color: colors.gold, margin: 0 }}>
        {editing ? (isDraft ? 'Edit draft' : 'Edit announcement') : 'New announcement'}
      </h2>
      {usesLayout && <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>{LAYOUT_LABEL[layout]}</span>}
    </div>
  );

  const formBody = (
    <>
      {showAs}
      {layoutPicker}
      <Section title="Text" hint={usesLayout && layout !== 'classic' ? 'Text grows to fill the screen: a few words show huge.' : undefined}>{textFields}</Section>
      {lookSection}
      {holdSection}
      {isMobile && <section style={{ padding: '16px 0', borderTop: `1px solid ${colors.border}` }}>{previewBlock}</section>}
      {whenSection}
    </>
  );

  return (
    <div
      role="presentation"
      onClick={isMobile ? undefined : () => onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: isMobile ? colors.bg : 'rgba(10,8,5,.6)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit announcement' : 'New announcement'}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 'min(1180px, 96vw)', height: '100%', background: colors.bg,
          display: 'flex', flexDirection: 'column', boxShadow: isMobile ? 'none' : '-20px 0 60px rgba(0,0,0,.5)',
        }}
      >
        {header}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {isMobile ? (
            <div style={{ padding: '0 14px 24px' }}>{formBody}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', padding: '0 20px 24px' }}>
              <div>{formBody}</div>
              <div style={{ position: 'sticky', top: 0, alignSelf: 'start', paddingTop: '16px' }}>{previewBlock}</div>
            </div>
          )}
        </div>
        {footer}
      </div>
      {conflicts && (
        <ConflictDialog
          conflicts={conflicts}
          tz={tz}
          onCancel={() => { setConflicts(null); setPendingStatus(null); }}
          onChoose={(action) => {
            const ids = conflicts.map((x) => x.id);
            setConflicts(null);
            submit(pendingStatus || 'published', { action, ids });
          }}
        />
      )}
    </div>
  );
}
