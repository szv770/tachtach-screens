import React, { useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import Sheet from './ui/Sheet.jsx';
import Icon from './ui/Icon.jsx';
import QuickFill from './quick/QuickFill.jsx';
import { Chip, Row, Btn, ErrorLine, labelStyle, field } from './quick/bits.jsx';
import useQuickTemplates from '../hooks/useQuickTemplates.js';
import { can } from '../../shared/permissions.js';
import { lengthLabel } from '../../shared/quickTemplates.js';
import { emptyItem, endOfDay } from './announcements/helpers.js';

const DURATIONS = [
  { key: '15', label: '15 min', minutes: 15 },
  { key: '60', label: '1 hour', minutes: 60 },
  { key: 'eod', label: 'Rest of today', minutes: null, eod: true },
  { key: 'forever', label: 'Until I remove it', minutes: null },
];

const showText = (t) => t.text.replace(/\{(\w+)\}/g, (_, k) => `‹${t.blanks.find((b) => b.key === k)?.label || k}›`);

function TemplateRow({ t, onPick }) {
  return (
    <button type="button" data-testid="quick-template" data-id={t.id} onClick={() => onPick(t)} style={{
      display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '60px', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
      background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', color: colors.text, fontFamily: adminFonts.englishBody,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span dir="auto" style={{ display: 'block', fontSize: '16px', fontWeight: 700, lineHeight: 1.3 }}>{showText(t)}</span>
        <span style={{ display: 'block', fontSize: '12.5px', color: colors.dim, marginTop: '2px' }}>{lengthLabel(t.length)}{t.display !== 'slide' ? ` · ${t.display}` : ''}</span>
      </span>
      <Icon name="chevron" size={18} style={{ color: colors.muted }} />
    </button>
  );
}

/** The free-text fast path (the old Quick Announcement): a Big-words slide. */
function WriteYourOwn({ onPost, onBack, onDone }) {
  const [he, setHe] = useState('');
  const [en, setEn] = useState('');
  const [key, setKey] = useState('eod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy || !(he.trim() || en.trim())) return;
    setBusy(true); setError('');
    const item = emptyItem('slide');
    item.content.headlineHe = he.trim();
    item.content.headlineEn = en.trim();
    const d = DURATIONS.find((x) => x.key === key) || DURATIONS[2];
    item.when.expiresAt = d.eod ? endOfDay(new Date()).toISOString() : d.minutes ? new Date(Date.now() + d.minutes * 60000).toISOString() : null;
    const created = await onPost(item);
    setBusy(false);
    if (created) onDone(created); else setError("Couldn't post. Try again.");
  };
  return (
    <div data-testid="quick-custom">
      <Btn onClick={onBack} style={{ minHeight: '44px', padding: '0 14px', margin: '4px 0 12px' }}>Back</Btn>
      <label style={labelStyle} htmlFor="qc-en">Message</label>
      <textarea id="qc-en" autoFocus rows={2} dir="auto" placeholder="What should the screen say?" value={en} onChange={(e) => setEn(e.target.value)} style={{ ...field, resize: 'vertical', marginBottom: '10px' }} />
      <label style={labelStyle} htmlFor="qc-he">Hebrew (optional)</label>
      <textarea id="qc-he" dir="rtl" rows={2} placeholder="מה להודיע?" value={he} onChange={(e) => setHe(e.target.value)} style={{ ...field, resize: 'vertical', fontSize: '20px', marginBottom: '14px' }} />
      <div style={labelStyle}>How long should it show?</div>
      <Row style={{ marginBottom: '14px' }}>{DURATIONS.map((d) => <Chip key={d.key} on={key === d.key} onClick={() => setKey(d.key)}>{d.label}</Chip>)}</Row>
      <ErrorLine>{error}</ErrorLine>
      <Btn primary onClick={submit} disabled={busy || !(he.trim() || en.trim())} style={{ width: '100%', minHeight: '52px', fontSize: '16px' }}>{busy ? 'Posting…' : 'Post to screen'}</Btn>
    </div>
  );
}

/**
 * The quick-message sheet (the "+" sheet's first kind, and Announce > Quick messages > Use):
 * pick a saved template, fill its blanks, post. Everything posts as an ordinary announcement.
 * `startWith` opens a template's fill step directly.
 */
export default function QuickAnnounceSheet({ onClose, onPost, onManage, caps = [], startWith = null }) {
  const qt = useQuickTemplates();
  const [picked, setPicked] = useState(startWith);
  const [view, setView] = useState(startWith ? 'fill' : 'list');
  const mine = qt.templates.filter((t) => t.mine);
  const shared = qt.templates.filter((t) => t.shared);
  const done = () => onClose();

  return (
    <Sheet open onClose={onClose} title="Quick message" label="Quick message" zIndex={1300}>
      {view === 'fill' && picked && (
        <QuickFill tpl={picked} recents={qt.recents} canTakeover={can(caps, 'announcements.takeover')} onPost={onPost}
          onBack={startWith ? undefined : () => { setView('list'); setPicked(null); }} onDone={done} onRecents={qt.addRecents} />
      )}
      {view === 'custom' && <WriteYourOwn onPost={onPost} onBack={() => setView('list')} onDone={done} />}
      {view === 'list' && (
        <div data-testid="quick-list">
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13.5px', color: colors.dim, margin: '4px 0 12px' }}>Tap a saved message, fill in the blanks, post. Or write your own.</p>
          <Row style={{ margin: '0 0 14px' }}>
            <Btn onClick={() => setView('custom')} data-testid="quick-own" style={{ flex: 1 }}>Write your own</Btn>
            {onManage && <Btn onClick={onManage} style={{ flex: 1 }} data-testid="quick-manage">Edit my templates</Btn>}
          </Row>
          {qt.loading && <div style={{ color: colors.dim, fontFamily: adminFonts.englishBody, padding: '16px 0' }}>Loading…</div>}
          <ErrorLine>{qt.error}</ErrorLine>
          {mine.length > 0 && (
            <section aria-label="My templates" style={{ marginBottom: '16px' }}>
              <div style={labelStyle}>My templates</div>
              <div style={{ display: 'grid', gap: '8px' }}>{mine.map((t) => <TemplateRow key={t.id} t={t} onPick={(x) => { setPicked(x); setView('fill'); }} />)}</div>
            </section>
          )}
          {shared.length > 0 && (
            <section aria-label="Shared templates" style={{ marginBottom: '16px' }}>
              <div style={labelStyle}>Shared</div>
              <div style={{ display: 'grid', gap: '8px' }}>{shared.map((t) => <TemplateRow key={t.id} t={t} onPick={(x) => { setPicked(x); setView('fill'); }} />)}</div>
            </section>
          )}
          {!qt.loading && !qt.templates.length && !qt.error && <div style={{ color: colors.dim, fontFamily: adminFonts.englishBody, padding: '8px 0 16px' }}>No quick messages yet. Add one under Announce.</div>}
        </div>
      )}
    </Sheet>
  );
}
