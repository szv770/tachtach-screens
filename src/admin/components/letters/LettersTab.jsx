import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import { Btn, Chip, Row, ErrorLine, labelStyle, field } from '../quick/bits.jsx';
import PagePreview from './PagePreview.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { notify } from '../../hooks/useAdminState.js';
import useOwnedList from '../../hooks/useOwnedList.js';
import { can } from '../../../shared/permissions.js';
import { matchesLetter, toAnnouncement } from '../../../shared/savedLetters.js';
import { endOfDay } from '../announcements/helpers.js';

const LENGTHS = [
  { key: '60', label: '1 hour', minutes: 60 },
  { key: 'eod', label: 'Rest of today', eod: true },
  { key: 'day', label: '24 hours', minutes: 1440 },
  { key: 'forever', label: 'Until I remove it' },
];
const expiryOf = (l) => (l.eod ? endOfDay(new Date()).toISOString() : l.minutes ? new Date(Date.now() + l.minutes * 60000).toISOString() : null);
const snippet = (rec) => String(rec[rec.kind]?.body || '').replace(/\s+/g, ' ').slice(0, 110);

function PostAgain({ rec, settings, onPost, onClose }) {
  const [len, setLen] = useState('eod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true); setError('');
    const l = LENGTHS.find((x) => x.key === len);
    const created = await onPost(toAnnouncement(rec, { expiresAt: expiryOf(l) }));
    setBusy(false);
    if (created) onClose(); else setError('Could not post. Try again.');
  };
  return (
    <Sheet open onClose={onClose} title="Post again" label="Post this letter again" zIndex={1300} maxWidth={640}>
      <div data-testid="post-again">
        <div dir="auto" style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, color: colors.text, margin: '4px 0 12px' }}>{rec.title}</div>
        <PagePreview item={{ content: { [rec.kind]: rec[rec.kind] }, look: { layout: rec.kind, style: rec.style || null, fit: 'auto' } }} settings={settings} />
        <div style={{ ...labelStyle, marginTop: '16px' }}>How long should it show?</div>
        <Row>{LENGTHS.map((l) => <Chip key={l.key} on={len === l.key} onClick={() => setLen(l.key)}>{l.label}</Chip>)}</Row>
        <ErrorLine>{error}</ErrorLine>
        <Btn primary onClick={go} disabled={busy} data-testid="post-again-go" style={{ width: '100%', minHeight: '52px', marginTop: '14px' }}>{busy ? 'Posting…' : 'Post to screen'}</Btn>
      </div>
    </Sheet>
  );
}

/** Announce > Letters: the saved letters library (search, preview, post again, delete with undo). */
export default function LettersTab({ caps, settings = {}, onPostLetter, onOpenComposer }) {
  const lib = useOwnedList('/api/saved-letters', 'letters');
  const [q, setQ] = useState('');
  const [again, setAgain] = useState(null);
  const [view, setView] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const canShared = can(caps, 'announcements.edit');
  const list = useMemo(() => lib.items.filter((r) => matchesLetter(r, q)), [lib.items, q]);

  const del = async (rec) => {
    const gone = await lib.remove(rec.id);
    if (!gone) return;
    notify('Deleted from the library', 'success', {
      label: 'Undo',
      onClick: () => { lib.create({ kind: rec.kind, [rec.kind]: rec[rec.kind], title: rec.title, style: rec.style }, { shared: rec.shared }); },
    });
  };

  return (
    <div style={{ display: 'grid', gap: '12px', fontFamily: adminFonts.englishBody }} data-testid="letters-tab">
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ flex: '1 1 240px', margin: 0, fontSize: '13.5px', color: colors.dim, lineHeight: 1.45 }}>
          Letters and sicha excerpts you saved, ready to post again. Save one from the composer (Letter or Sicha layout).
        </p>
        <Btn primary onClick={() => onOpenComposer?.({ display: 'slide', look: { layout: 'letter' } })} data-testid="letter-new">+ New letter</Btn>
      </div>
      <input type="search" aria-label="Search saved letters" placeholder="Search by words, title or source" value={q} onChange={(e) => setQ(e.target.value)} style={field} />
      {lib.loading && <div style={{ color: colors.dim }}>Loading…</div>}
      <ErrorLine>{lib.error}</ErrorLine>
      {!lib.loading && list.length === 0 && (
        <div style={{ color: colors.dim, fontSize: '14px', padding: '16px 2px' }}>{q ? 'Nothing matches that.' : 'No saved letters yet.'}</div>
      )}
      {list.map((r) => (
        <div key={r.id} data-testid="letter-row" data-id={r.id} style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span dir="auto" style={{ fontSize: '16px', fontWeight: 700, color: colors.text, lineHeight: 1.3 }}>{r.title}</span>
            <span style={{ fontSize: '12px', color: colors.dim }}>{r.kind === 'sicha' ? 'Sicha' : 'Letter'} · {r.shared ? 'Shared' : 'Mine'}</span>
          </div>
          <div dir="auto" style={{ fontSize: '13.5px', color: colors.dim, margin: '4px 0 10px', lineHeight: 1.4 }}>{snippet(r)}</div>
          <Row style={{ gap: '6px' }}>
            <Btn primary onClick={() => setAgain(r)} style={{ minHeight: '44px' }} data-testid="letter-again">Post again</Btn>
            <Btn onClick={() => setView(r)} style={{ minHeight: '44px' }}>Preview</Btn>
            {(!r.shared || canShared) && <Btn danger onClick={() => setConfirmDel(r)} style={{ minHeight: '44px' }}>Delete</Btn>}
          </Row>
        </div>
      ))}
      {again && <PostAgain rec={again} settings={settings} onPost={onPostLetter} onClose={() => setAgain(null)} />}
      {view && (
        <Sheet open onClose={() => setView(null)} title="Preview" label="Letter preview" zIndex={1300} maxWidth={640}>
          <div dir="auto" style={{ fontSize: '15px', fontWeight: 700, margin: '4px 0 12px', color: colors.text }}>{view.title}</div>
          <PagePreview item={{ content: { [view.kind]: view[view.kind] }, look: { layout: view.kind, style: view.style || null, fit: 'auto' } }} settings={settings} />
        </Sheet>
      )}
      {confirmDel && (
        <ConfirmDialog title="Delete this saved letter?" message={`“${confirmDel.title.slice(0, 80)}” will be removed from the library${confirmDel.shared ? ' for everyone' : ''}. You can undo right after.`}
          onConfirm={() => { const r = confirmDel; setConfirmDel(null); del(r); }} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
