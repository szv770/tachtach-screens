import React, { useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Icon from '../ui/Icon.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import { Btn, ErrorLine, labelStyle } from './bits.jsx';
import TemplateEditor from './TemplateEditor.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { can } from '../../../shared/permissions.js';
import { lengthLabel } from '../../../shared/quickTemplates.js';

const showText = (t) => t.text.replace(/\{(\w+)\}/g, (_, k) => `‹${t.blanks.find((b) => b.key === k)?.label || k}›`);
const strip = (t) => ({ text: t.text, textHe: t.textHe, blanks: t.blanks, focus: t.focus, display: t.display, style: t.style, length: t.length });

function IconBtn({ label, onClick, disabled, children }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{
      width: 44, height: 44, borderRadius: 'var(--r-md)', border: `1px solid ${colors.line}`, background: colors.card, color: colors.dim,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: '15px', fontFamily: adminFonts.englishBody, display: 'grid', placeItems: 'center',
    }}>{children}</button>
  );
}

function Row({ t, i, count, canChange, onUse, onEdit, onDup, onDelete, onMove }) {
  return (
    <div data-testid="template-row" data-id={t.id} style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
      <div dir="auto" style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, color: colors.text, lineHeight: 1.3 }}>{showText(t)}</div>
      <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12.5px', color: colors.dim, margin: '3px 0 10px' }}>
        {lengthLabel(t.length)} · {t.display}{t.textHe ? ' · has Hebrew' : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        <Btn primary onClick={() => onUse(t)} style={{ minHeight: '44px', padding: '0 18px' }}>Use</Btn>
        {canChange && <Btn onClick={() => onEdit(t)} style={{ minHeight: '44px' }}>Edit</Btn>}
        <Btn onClick={() => onDup(t)} style={{ minHeight: '44px' }}>Duplicate</Btn>
        {canChange && <IconBtn label="Move up" onClick={() => onMove(t, -1)} disabled={i === 0}>▲</IconBtn>}
        {canChange && <IconBtn label="Move down" onClick={() => onMove(t, 1)} disabled={i === count - 1}>▼</IconBtn>}
        {canChange && <Btn danger onClick={() => onDelete(t)} style={{ minHeight: '44px' }}>Delete</Btn>}
      </div>
    </div>
  );
}

/** Announce > Quick messages: my templates + shared ones, add / edit / duplicate / delete / reorder. */
export default function QuickTemplatesTab({ qt, caps, onUse }) {
  const canShared = can(caps, 'announcements.edit');
  const [editor, setEditor] = useState(null); // null | { initial }
  const [confirmDel, setConfirmDel] = useState(null);
  const [editError, setEditError] = useState('');
  const mine = qt.templates.filter((t) => t.mine);
  const shared = qt.templates.filter((t) => t.shared);

  const save = async (data, { shared: asShared }) => {
    setEditError('');
    const initial = editor?.initial;
    const rec = initial?.id ? await qt.update(initial.id, data) : await qt.create(data, { shared: asShared });
    if (!rec) { setEditError('Could not save. Check the message and try again.'); return false; }
    notify(initial?.id ? 'Quick message saved' : 'Quick message added');
    return true;
  };

  const dup = async (t) => {
    const rec = await qt.create(strip(t), { shared: false });
    if (rec) notify('Copied to My templates');
  };

  const del = async (t) => {
    const gone = await qt.remove(t.id);
    if (!gone) return;
    notify('Quick message deleted', 'success', {
      label: 'Undo',
      onClick: () => { qt.create(strip(t), { shared: t.shared }); },
    });
  };

  const move = async (list, t, dir) => {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(t.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await qt.reorder(ids);
  };

  const group = (title, list, isShared) => (
    <section aria-label={title} style={{ display: 'grid', gap: '8px' }}>
      <div style={{ ...labelStyle, margin: '8px 0 0' }}>{title}</div>
      {list.length === 0 && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, padding: '8px 2px' }}>{isShared ? 'Nothing shared yet.' : 'Nothing here yet. Add one, or copy a shared one with Duplicate.'}</div>}
      {list.map((t, i) => (
        <Row key={t.id} t={t} i={i} count={list.length} canChange={!isShared || canShared}
          onUse={onUse} onEdit={(x) => { setEditError(''); setEditor({ initial: x }); }} onDup={dup} onDelete={setConfirmDel} onMove={(x, d) => move(list, x, d)} />
      ))}
    </section>
  );

  return (
    <div style={{ display: 'grid', gap: '12px', fontFamily: adminFonts.englishBody }} data-testid="quick-tab">
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ flex: '1 1 240px', margin: 0, fontSize: '13.5px', color: colors.dim, lineHeight: 1.45 }}>
          Saved messages with blanks, for the things you send all the time. Use one from the <Icon name="plus" size={13} /> button anywhere in the admin.
        </p>
        <Btn primary onClick={() => { setEditError(''); setEditor({ initial: null }); }} data-testid="template-new">+ New quick message</Btn>
      </div>
      {qt.loading && <div style={{ color: colors.dim }}>Loading…</div>}
      <ErrorLine>{qt.error}</ErrorLine>
      {group('My templates', mine, false)}
      {group('Shared', shared, true)}
      <Collapsible title="How blanks work" summary="Write the message once, fill in the names each time">
        <p style={{ fontSize: '14px', color: colors.dim, lineHeight: 1.5, margin: '12px 0 0' }}>
          A blank is a gap like {'{bochur}'}. When you use the message you type or tap the name; the blank you mark &quot;show big&quot; fills the screen,
          and the words around it go small above and below. Names you used lately show up as quick buttons.
        </p>
      </Collapsible>
      {editor && <TemplateEditor initial={editor.initial} canShare={canShared} canTakeover={can(caps, 'announcements.takeover')} onSave={save} onClose={() => setEditor(null)} error={editError} />}
      {confirmDel && (
        <ConfirmDialog title="Delete this quick message?" message={`“${showText(confirmDel).slice(0, 80)}” will be removed${confirmDel.shared ? ' for everyone' : ''}. You can undo right after.`}
          onConfirm={() => { const t = confirmDel; setConfirmDel(null); del(t); }} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
