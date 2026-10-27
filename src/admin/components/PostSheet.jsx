import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Sheet from './ui/Sheet.jsx';
import AnnouncementPreview from './announcements/AnnouncementPreview.jsx';
import { BlankInput } from './quick/QuickFill.jsx';
import { Chip, Row, Btn, ErrorLine, labelStyle, field } from './quick/bits.jsx';
import useQuickTemplates from '../hooks/useQuickTemplates.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { can } from '../../shared/permissions.js';
import { isoToLocalInput, localInputToIso } from './announcements/helpers.js';
import { findTakeoverConflicts, primaryText } from '../../shared/announcements.js';
import { buildAnnouncement, previewValues, RECENT_TYPES, TemplateError, missingBlanks } from '../../shared/quickTemplates.js';
import {
  kindsFor, effectNote, defaultsFor, sanitizePrefs, recordPost, toggleStar, quickPicks, lengthChips, laterChips, expiryFor,
  buildPostBody, postButtonLabel, whenLabel, postedSummary, MESSAGE_SOFT_LIMIT, MESSAGE_HARD_LIMIT,
} from '../../shared/postDefaults.js';
import { loadPrefs, savePrefs } from './postPrefs.js';
import WhatsOnNow from './WhatsOnNow.jsx';

const hint = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, margin: '6px 0 0', lineHeight: 1.4 };
const block = { marginTop: '16px' };
const tplText = (t) => t.text.replace(/\{(\w+)\}/g, (_, k) => `‹${t.blanks.find((b) => b.key === k)?.label || k}›`);

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 900);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 900px)');
    const on = (e) => setWide(e.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  return wide;
}

/** The newest announcement this person posted that has words (for Repeat last). */
function lastOwnPost(announcements, meId) {
  if (!meId) return null;
  return [...(announcements || [])]
    .filter((a) => a.createdById === meId && a.status !== 'draft' && primaryText(a))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
}

/**
 * The one Post sheet behind the + button (spec 01). Type first (keyboard up), live preview, remembered last kind/length,
 * recent + starred templates, Repeat last, Later chips, and 'More options' into the full composer with the draft carried over.
 * `onPost(body)` -> created item | null (App shows the Undo/Edit toast); `onMore(draftItem)` opens the composer.
 */
export default function PostSheet({
  onClose, onPost, onDraft, onMore, onManage, onGoHome, fetchShabbosEnd, caps = [], settings = {}, announcements = [], meId = null, cache = null, freeze = null, slides = [],
}) {
  const qt = useQuickTemplates();
  const isMobile = useIsMobile();
  const wide = useWide();
  const canTakeover = can(caps, 'announcements.takeover');
  const tz = settings?.location?.timezone;
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [now] = useState(() => new Date());
  const [shabbosEndIso, setShabbosEndIso] = useState(null);
  const initial = useMemo(() => defaultsFor(prefs, { canTakeover }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState('');
  const [textHe, setTextHe] = useState('');
  const [showHe, setShowHe] = useState(false);
  const [display, setDisplay] = useState(initial.display);
  const [lengthKey, setLengthKey] = useState(initial.lengthKey);
  const [pickEnd, setPickEnd] = useState('');
  const [laterOpen, setLaterOpen] = useState(false);
  const [laterKey, setLaterKey] = useState(null);
  const [pickStart, setPickStart] = useState('');
  const [tpl, setTpl] = useState(null);
  const [values, setValues] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const areaRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(fetchShabbosEnd?.()).then((r) => { if (alive && r?.available && r.iso) setShabbosEndIso(r.iso); }).catch(() => {});
    return () => { alive = false; };
  }, [fetchShabbosEnd]);

  const kinds = useMemo(() => kindsFor(canTakeover).filter((k) => !tpl || k.display !== 'note'), [canTakeover, tpl]);
  const lengths = useMemo(() => lengthChips(now, { shabbosEndIso }), [now, shabbosEndIso]);
  const laters = useMemo(() => laterChips(now, { tz, candleLighting: cache?.zmanim?.today?.candleLighting, shabbosEndIso }), [now, tz, cache, shabbosEndIso]);
  useEffect(() => { if (lengthKey !== 'pick' && !lengths.some((l) => l.key === lengthKey)) setLengthKey('eod'); }, [lengths, lengthKey]);
  useEffect(() => { if (!kinds.some((k) => k.display === display)) setDisplay('slide'); }, [kinds, display]);

  const startsAtIso = laterKey === 'pick' ? localInputToIso(pickStart) : (laters.find((l) => l.key === laterKey)?.startsAtIso || null);
  const chip = lengthKey === 'pick' ? { key: 'pick', expiresAt: localInputToIso(pickEnd) } : lengths.find((l) => l.key === lengthKey) || lengths[2];
  const startMs = startsAtIso ? Date.parse(startsAtIso) : now.getTime();
  const endIso = expiryFor(chip, startMs, tz);

  // What would be posted (null while there is nothing to post yet) and an error that explains why not.
  const built = useMemo(() => {
    if (tpl) {
      const miss = missingBlanks(tpl, values);
      try {
        const b = buildAnnouncement(tpl, miss.length ? previewValues(tpl, values) : values, { display: display === 'note' ? 'slide' : display, length: { kind: 'forever' } });
        b.display = display; // note is not a template kind: the notice text is shown as a side note
        b.when = { startsAt: startsAtIso || null, expiresAt: endIso, recurrence: null };
        return { body: b, error: miss.length ? `Fill in: ${miss.map((x) => x.label).join(', ')}.` : null, ready: !miss.length };
      } catch (e) { return { body: null, error: e instanceof TemplateError ? e.message : 'Could not build that message.', ready: false }; }
    }
    const r = buildPostBody({ text, textHe, display, chip, startsAtIso, now, tz });
    return { body: r.body, error: r.error, ready: !!r.body };
  }, [tpl, values, text, textHe, display, chip, startsAtIso, endIso, now, tz]);

  const [previewItem, setPreviewItem] = useState(null);
  useEffect(() => {
    const id = setTimeout(() => setPreviewItem(built.body ? { ...built.body, id: 'preview', status: 'published', when: { ...built.body.when, startsAt: null } } : null), 150);
    return () => clearTimeout(id);
  }, [built]);

  const conflicts = useMemo(() => (display === 'takeover' && built.body ? findTakeoverConflicts({ ...built.body, id: '__new__', enabled: true }, announcements, new Date(), { tz }) : []), [display, built, announcements, tz]);
  const endsBeforeStart = !!(endIso && Date.parse(endIso) <= startMs);
  const blocked = !built.ready || conflicts.length > 0 || endsBeforeStart || (lengthKey === 'pick' && !chip.expiresAt) || (laterKey === 'pick' && !startsAtIso);

  const rememberAfterPost = () => {
    const next = recordPost(prefs, { templateId: tpl?.id || null, display, lengthKey });
    setPrefs(next); savePrefs(next);
  };

  const submit = async () => {
    if (busy || blocked) { if (built.error) setError(built.error); return; }
    setBusy(true); setError('');
    const created = await onPost(built.body, { summary: postedSummary({ display, expiresAt: endIso, startsAt: startsAtIso, now: new Date(), tz }) });
    setBusy(false);
    if (!created) { setError('Could not post. Your text is still here, try again.'); return; }
    if (tpl) qt.addRecents(tpl.blanks.filter((b) => RECENT_TYPES.includes(b.type)).map((b) => ({ type: b.type, value: values[b.key] })));
    rememberAfterPost();
    onClose();
  };

  const saveDraft = async () => {
    if (busy || !built.body) { setError(built.error || 'What should the screen say?'); return; }
    setBusy(true); setError('');
    const created = await onDraft?.({ ...built.body, status: 'draft' });
    setBusy(false);
    if (created) onClose(); else setError('Could not save the draft. Your text is still here.');
  };

  const more = () => {
    const base = built.body || { display };
    onMore?.({ ...base, status: 'published', display });
  };

  const pickTemplate = (t) => {
    setTpl(t); setValues({}); setShowAll(false); setError('');
    if (t.display && kindsFor(canTakeover).some((k) => k.display === t.display)) setDisplay(t.display);
  };
  const clearTemplate = () => { setTpl(null); setValues({}); setError(''); setTimeout(() => areaRef.current?.focus(), 0); };
  const repeat = lastOwnPost(announcements, meId);
  const repeatLast = () => {
    if (!repeat) return;
    const c = repeat.content || {};
    setTpl(null); setValues({});
    setText(c.headlineEn || c.headlineHe || primaryText(repeat));
    setTextHe(c.headlineEn && c.headlineHe ? c.headlineHe : '');
    setShowHe(!!(c.headlineEn && c.headlineHe));
    if (kindsFor(canTakeover).some((k) => k.display === repeat.display) && repeat.display !== 'takeover') setDisplay(repeat.display);
    setError('');
  };
  const picks = quickPicks(qt.templates, prefs, 5);
  const shownPicks = picks.length ? picks : qt.templates.slice(0, 3).map((t) => ({ template: t, starred: false }));
  const dir = (s) => (/[֐-׿]/.test(s) ? 'rtl' : 'ltr');

  const onKey = (e) => {
    // Enter posts on a computer; on a phone Enter stays a new line (lists need it) and the Post button is always in reach.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing && !isMobile) { e.preventDefault(); submit(); }
  };

  const left = (
    <>
      {tpl ? (
        <div data-testid="post-template" style={{ ...block, marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div dir="auto" style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim }}><strong style={{ color: colors.text }}>Template</strong> · {tplText(tpl)}</div>
            <Btn onClick={clearTemplate} aria-label="Back to free text" style={{ minHeight: '44px', padding: '0 14px' }}>Free text</Btn>
          </div>
          {tpl.blanks.map((b, i) => (
            <BlankInput key={b.key} blank={b} autoFocus={i === 0} value={values[b.key] || ''} recents={qt.recents} onChange={(v) => { setValues((x) => ({ ...x, [b.key]: v })); setError(''); }} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: '4px' }}>
          <label htmlFor="post-text" style={{ ...labelStyle, position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Message</label>
          <textarea
            id="post-text" ref={areaRef} data-testid="post-text" autoFocus rows={2} dir="auto" enterKeyHint={isMobile ? 'enter' : 'send'} maxLength={MESSAGE_HARD_LIMIT}
            placeholder="What should the screen say?" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} onKeyDown={onKey}
            style={{ ...field, resize: 'none', minHeight: '84px', lineHeight: 1.35 }}
          />
          {text.length >= MESSAGE_SOFT_LIMIT && <div style={{ ...hint, textAlign: 'right' }}>{text.length}/{MESSAGE_HARD_LIMIT}{text.length >= MESSAGE_HARD_LIMIT ? ' (that is the limit)' : ' · shorter reads better from far away'}</div>}
          {showHe ? (
            <textarea aria-label="Hebrew" data-testid="post-text-he" dir="rtl" rows={2} placeholder="מה להודיע?" value={textHe} maxLength={MESSAGE_HARD_LIMIT} onChange={(e) => setTextHe(e.target.value)} style={{ ...field, resize: 'none', fontSize: '20px', marginTop: '8px' }} />
          ) : (
            <Btn onClick={() => setShowHe(true)} data-testid="post-add-hebrew" style={{ minHeight: '44px', marginTop: '6px', padding: '0 12px', border: 'none', background: 'transparent', color: colors.accent }}>+ Add Hebrew</Btn>
          )}
        </div>
      )}

      {!tpl && (repeat || shownPicks.length > 0) && (
        <div style={block} data-testid="post-start-from">
          <div style={labelStyle}>Start from</div>
          <Row>
            {repeat && <Chip on={false} onClick={repeatLast} dataKey="repeat">↻ Repeat last</Chip>}
            {shownPicks.map(({ template: t, starred }) => (
              <button key={t.id} type="button" data-template={t.id} onClick={() => pickTemplate(t)} dir="auto" style={{
                minHeight: '44px', maxWidth: '100%', padding: '0 14px', borderRadius: 'var(--r-pill)', cursor: 'pointer', background: colors.card, color: colors.text,
                border: `1px solid ${colors.line}`, fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{starred ? '★ ' : ''}{tplText(t)}</button>
            ))}
            {qt.templates.length > shownPicks.length && <Chip on={showAll} onClick={() => setShowAll((v) => !v)} dataKey="all">{showAll ? 'Hide list' : 'All ▸'}</Chip>}
          </Row>
          {showAll && (
            <div data-testid="post-all-templates" style={{ display: 'grid', gap: '6px', marginTop: '10px' }}>
              {qt.templates.map((t) => {
                const starred = sanitizePrefs(prefs).starred.includes(t.id);
                return (
                  <div key={t.id} style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                    <button type="button" onClick={() => pickTemplate(t)} dir="auto" style={{ flex: 1, minWidth: 0, minHeight: '48px', padding: '8px 12px', textAlign: 'left', borderRadius: 'var(--r-md)', border: `1px solid ${colors.line}`, background: colors.card, color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>{tplText(t)}</button>
                    <button type="button" aria-pressed={starred} aria-label={starred ? 'Remove from favourites' : 'Add to favourites'} onClick={() => { const n = toggleStar(prefs, t.id); setPrefs(n); savePrefs(n); }} style={{ width: '48px', minHeight: '48px', borderRadius: 'var(--r-md)', border: `1px solid ${starred ? colors.accent : colors.line}`, background: starred ? colors.accentSoft : colors.card, color: starred ? colors.accent : colors.dim, fontSize: '20px', cursor: 'pointer' }}>{starred ? '★' : '☆'}</button>
                  </div>
                );
              })}
              {onManage && <Btn onClick={onManage} style={{ minHeight: '44px' }}>Edit my templates</Btn>}
            </div>
          )}
        </div>
      )}
    </>
  );

  const preview = (
    <div style={block}>
      <div style={labelStyle}>How it will look</div>
      {previewItem ? <AnnouncementPreview item={previewItem} settings={settings} />
        : <div data-testid="post-preview-empty" style={{ border: `1px dashed ${colors.line}`, borderRadius: 'var(--r-md)', padding: '28px 12px', textAlign: 'center', color: colors.dim, fontFamily: adminFonts.englishBody, fontSize: '14px' }}>Type your message to see it here.</div>}
    </div>
  );

  const options = (
    <>
      <div style={block}>
        <div style={labelStyle}>Show as</div>
        <Row>{kinds.map((k) => <Chip key={k.display} dataKey={k.display} on={display === k.display} onClick={() => setDisplay(k.display)}>{k.label}</Chip>)}</Row>
        <p style={hint}>{effectNote(display, { minutes: display === 'takeover' ? (chip?.minutes || null) : null })}</p>
        {conflicts.length > 0 && <p role="alert" style={{ ...hint, color: colors.danger }}>Another takeover is already set for then. Open More options to choose what happens to it.</p>}
        {!canTakeover && <p style={{ ...hint, color: colors.muted }}>Takeovers need extra permission.</p>}
      </div>

      <div style={block}>
        <div style={labelStyle}>{startsAtIso ? 'Then show for' : 'For'}</div>
        <Row>
          {lengths.map((l) => <Chip key={l.key} dataKey={l.key} on={lengthKey === l.key} onClick={() => setLengthKey(l.key)}>{l.label}</Chip>)}
          <Chip dataKey="pick" on={lengthKey === 'pick'} onClick={() => setLengthKey('pick')}>Pick a time…</Chip>
        </Row>
        {lengthKey === 'pick' && <input type="datetime-local" aria-label="Show until" value={pickEnd} onChange={(e) => setPickEnd(e.target.value)} style={{ ...field, marginTop: '8px' }} />}
        {endsBeforeStart && <p role="alert" style={{ ...hint, color: colors.danger }}>That ends before it starts.</p>}
      </div>

      <div style={block}>
        <div style={labelStyle}>When</div>
        <Row>
          <Chip dataKey="now" on={!laterOpen && !laterKey} onClick={() => { setLaterOpen(false); setLaterKey(null); }}>Now</Chip>
          <Chip dataKey="later" on={laterOpen || !!laterKey} onClick={() => setLaterOpen(true)}>Later…</Chip>
        </Row>
        {(laterOpen || laterKey) && (
          <div data-testid="post-later" style={{ marginTop: '10px' }}>
            <Row>
              {laters.map((l) => <Chip key={l.key} dataKey={l.key} on={laterKey === l.key} onClick={() => setLaterKey(l.key)}>{l.label}</Chip>)}
              <Chip dataKey="pick-start" on={laterKey === 'pick'} onClick={() => setLaterKey('pick')}>Pick date & time…</Chip>
            </Row>
            {laterKey === 'pick' && <input type="datetime-local" aria-label="Go live at" value={pickStart} min={isoToLocalInput(now.toISOString())} onChange={(e) => setPickStart(e.target.value)} style={{ ...field, marginTop: '8px' }} />}
          </div>
        )}
        <p style={hint} data-testid="post-when-summary">
          {startsAtIso ? `Goes live ${whenLabel(Date.parse(startsAtIso), { tz, now })}` : 'Goes live right away'}
          {endIso ? `, shows until ${whenLabel(Date.parse(endIso), { tz, now })}.` : ', until you remove it.'}
        </p>
      </div>
    </>
  );

  const nowCard = <WhatsOnNow announcements={announcements} freeze={freeze} slides={slides} settings={settings} display={display} draft={built.body} />;

  return (
    <Sheet open onClose={onClose} title="Post" label="Post a message" zIndex={1300} maxWidth={wide ? 940 : 560}>
      <div data-testid="post-sheet" style={{ display: wide ? 'grid' : 'block', gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(0, 1fr)' : undefined, gap: wide ? '24px' : undefined, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>{left}{!wide && preview}{options}</div>
        <div style={{ minWidth: 0 }}>{wide && preview}{nowCard}</div>
      </div>
      <div style={{ position: 'sticky', bottom: 0, background: colors.card, paddingTop: '12px', marginTop: '16px', zIndex: 2 }}>
        <ErrorLine>{error}</ErrorLine>
        <Btn primary onClick={submit} disabled={busy || blocked} data-testid="post-submit" style={{ width: '100%', minHeight: '52px', fontSize: '16px' }}>
          {busy ? 'Posting…' : postButtonLabel({ display, chip, startsAtIso, now, tz })}
        </Btn>
        <Row style={{ marginTop: '8px', justifyContent: 'space-between' }}>
          <Btn onClick={more} data-testid="post-more" style={{ minHeight: '44px', border: 'none', background: 'transparent', color: colors.accent }}>More options…</Btn>
          {onDraft && <Btn onClick={saveDraft} disabled={busy} data-testid="post-draft" style={{ minHeight: '44px', border: 'none', background: 'transparent', color: colors.dim }}>Save as draft</Btn>}
        </Row>
        {onGoHome && <p style={{ ...hint, textAlign: 'center', marginBottom: 0 }}>Need the whole screen blank? <button type="button" onClick={onGoHome} style={{ background: 'none', border: 'none', padding: '10px 4px', color: colors.accent, font: 'inherit', fontWeight: 700, cursor: 'pointer', minHeight: '44px' }}>Freeze it on Home</button></p>}
      </div>
    </Sheet>
  );
}
