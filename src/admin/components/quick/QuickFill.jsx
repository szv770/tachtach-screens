import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { Chip, Row, Btn, ErrorLine, labelStyle, field } from './bits.jsx';
import {
  DAYS, buildAnnouncement, noticeContent, lengthLabel, TemplateError, RECENT_TYPES, TEMPLATE_DISPLAYS,
} from '../../../shared/quickTemplates.js';
import { endOfDay } from '../announcements/helpers.js';

const LENGTHS = [
  { kind: 'minutes', minutes: 15 }, { kind: 'minutes', minutes: 60 }, { kind: 'eod' }, { kind: 'forever' },
];
const DISPLAY_LABEL = { slide: 'Slide', banner: 'Banner', takeover: 'Takeover' };

/** What the message will say, with ‹blanks› still showing for anything not filled in. */
export function previewParts(tpl, values) {
  const shown = {};
  for (const b of tpl.blanks) shown[b.key] = String(values[b.key] ?? '').trim() || `‹${b.label}›`;
  return noticeContent({ ...tpl, blanks: tpl.blanks.map((b) => (shown[b.key].startsWith('‹') ? { ...b, type: 'text' } : b)) }, shown);
}

/** The big-text preview card (mirrors the screen's notice layout: small line, BIG focus, small line). */
export function NoticePreview({ parts }) {
  const big = parts.focus || parts.focusHe;
  return (
    <div data-testid="quick-preview" style={{
      background: colors.sunken, borderRadius: 'var(--r-md)', border: `1px solid ${colors.line}`, padding: '16px 14px',
      textAlign: 'center', minHeight: '132px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', overflow: 'hidden',
    }}>
      {(parts.pre || parts.preHe) && <div dir="auto" style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600, color: colors.dim }}>{parts.pre}{parts.pre && parts.preHe ? ' · ' : ''}{parts.preHe}</div>}
      <div dir="auto" style={{ fontFamily: adminFonts.englishDisplay || adminFonts.englishBody, fontSize: big && big.length > 14 ? '30px' : '42px', fontWeight: 800, lineHeight: 1.1, color: colors.accent, wordBreak: 'break-word' }}>
        {parts.focus}{parts.focus && parts.focusHe ? ' · ' : ''}{parts.focusHe}
      </div>
      {(parts.post || parts.postHe) && <div dir="auto" style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 600, color: colors.dim }}>{parts.post}{parts.post && parts.postHe ? ' · ' : ''}{parts.postHe}</div>}
    </div>
  );
}

function BlankInput({ blank, value, onChange, recents, autoFocus }) {
  const chips = RECENT_TYPES.includes(blank.type) ? (recents?.[blank.type] || []) : [];
  const id = `qf-${blank.key}`;
  return (
    <div style={{ marginBottom: '14px' }} data-blank={blank.key}>
      <label htmlFor={id} style={labelStyle}>{blank.label}</label>
      {blank.type === 'day' ? (
        <>
          <Row style={{ marginBottom: '8px' }}>
            {DAYS.map(([k, en]) => <Chip key={k} dataKey={k} on={value === k} onClick={() => onChange(k)}>{en}</Chip>)}
          </Row>
          <input id={id} type="text" aria-label={`${blank.label}, or type your own`} placeholder="Or type your own (e.g. Purim)" value={DAYS.some(([k]) => k === value) ? '' : value || ''} onChange={(e) => onChange(e.target.value)} style={field} />
        </>
      ) : blank.type === 'time' ? (
        <input id={id} type="time" value={/^\d{1,2}:\d{2}$/.test(value || '') ? value.padStart(5, '0') : ''} onChange={(e) => onChange(e.target.value)} style={field} />
      ) : (
        <>
          <input id={id} type="text" autoFocus={autoFocus} autoComplete="off" enterKeyHint="done" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={blank.type === 'name' ? 'Name' : blank.type === 'place' ? 'Place' : ''} style={field} dir="auto" />
          {chips.length > 0 && (
            <Row style={{ marginTop: '8px' }} >
              {chips.map((c) => <Chip key={c} on={value === c} onClick={() => onChange(c)}>{c}</Chip>)}
            </Row>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Fill in one template's blanks, check the preview, pick how long / how, and post.
 * `onPost(announcementBody)` -> the created announcement or null (shows the toast + Undo itself).
 */
export default function QuickFill({ tpl, recents, canTakeover, onPost, onBack, onDone, onRecents }) {
  const [values, setValues] = useState({});
  const [length, setLength] = useState(tpl.length);
  const [display, setDisplay] = useState(tpl.display);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lengths = useMemo(() => (LENGTHS.some((l) => lengthLabel(l) === lengthLabel(tpl.length)) ? LENGTHS : [tpl.length, ...LENGTHS]), [tpl.length]);
  const displays = TEMPLATE_DISPLAYS.filter((d) => d !== 'takeover' || canTakeover || tpl.display === 'takeover');
  const parts = useMemo(() => previewParts(tpl, values), [tpl, values]);

  const post = async () => {
    if (busy) return;
    setError('');
    let body;
    try { body = buildAnnouncement(tpl, values, { display, length, endOfDay }); } catch (e) {
      setError(e instanceof TemplateError ? e.message : 'Could not build that message.');
      return;
    }
    setBusy(true);
    const created = await onPost(body);
    setBusy(false);
    if (!created) { setError('Could not post. Try again.'); return; }
    onRecents?.(tpl.blanks.filter((b) => RECENT_TYPES.includes(b.type)).map((b) => ({ type: b.type, value: values[b.key] })));
    onDone?.(created);
  };

  return (
    <div data-testid="quick-fill">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px' }}>
        {onBack && <Btn onClick={onBack} style={{ minHeight: '44px', padding: '0 14px' }} aria-label="Back to the list">Back</Btn>}
        <div dir="auto" style={{ flex: 1, fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, minWidth: 0 }}>{tpl.text.replace(/\{(\w+)\}/g, (_, k) => `‹${tpl.blanks.find((b) => b.key === k)?.label || k}›`)}</div>
      </div>
      {tpl.blanks.map((b, i) => (
        <BlankInput key={b.key} blank={b} autoFocus={i === 0} value={values[b.key] || ''} recents={recents} onChange={(v) => { setValues((x) => ({ ...x, [b.key]: v })); setError(''); }} />
      ))}
      <div style={{ ...labelStyle, marginTop: '4px' }}>How it will look</div>
      <NoticePreview parts={parts} />
      <div style={{ ...labelStyle, marginTop: '16px' }}>How long should it show?</div>
      <Row style={{ marginBottom: '12px' }}>
        {lengths.map((l) => <Chip key={lengthLabel(l)} on={lengthLabel(l) === lengthLabel(length)} onClick={() => setLength(l)}>{l.kind === 'eod' ? 'Rest of today' : lengthLabel(l)}</Chip>)}
      </Row>
      <Collapsible title="How it shows" summary={`${DISPLAY_LABEL[display]} · ${tpl.style ? tpl.style : 'Theme look'}`}>
        <Row style={{ marginTop: '12px' }}>
          {displays.map((d) => <Chip key={d} on={display === d} onClick={() => setDisplay(d)}>{DISPLAY_LABEL[d]}</Chip>)}
        </Row>
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, margin: '10px 0 0' }}>
          {display === 'slide' ? 'Takes its turn with the other slides.' : display === 'banner' ? 'A strip along the bottom. Never stops the slides.' : 'Covers the whole screen and pauses everything.'}
        </p>
      </Collapsible>
      <ErrorLine>{error}</ErrorLine>
      <Btn primary onClick={post} disabled={busy} style={{ width: '100%', minHeight: '52px', fontSize: '16px', marginTop: '14px' }} data-testid="quick-post">
        {busy ? 'Posting…' : 'Post to screen'}
      </Btn>
    </div>
  );
}
