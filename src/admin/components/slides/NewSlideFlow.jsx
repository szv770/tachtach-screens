import React, { useState, useEffect } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import Icon from '../ui/Icon.jsx';
import { normalizeWebUrl } from '../../../shared/embedCheck.js';
import { TypeFields } from './SlideFields.jsx';
import { SLIDE_GROUPS, typesInGroup } from './slideTypes.js';

const ff = adminFonts.englishBody;

const Steps = ({ step }) => (
  <div aria-hidden="true" style={{ display: 'flex', gap: '6px', margin: '4px 0 0' }}>
    {[1, 2].map((n) => <i key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? colors.accent : colors.line }} />)}
  </div>
);

function GroupCard({ group, onPick }) {
  const types = typesInGroup(group.id);
  return (
    <button type="button" onClick={() => onPick(group)} data-testid={`new-group-${group.id}`} style={{
      gridColumn: group.big ? '1 / -1' : undefined, display: 'flex', flexDirection: group.big ? 'row' : 'column', textAlign: 'left', padding: 0, overflow: 'hidden',
      background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', cursor: 'pointer', fontFamily: ff, color: colors.text,
    }}>
      <span style={{
        display: 'grid', placeItems: 'center', background: group.big ? colors.accentSoft : colors.sunken, color: group.big ? colors.accent : colors.dim,
        ...(group.big ? { width: 96, borderRight: `1px solid ${colors.line}` } : { height: 72, borderBottom: `1px solid ${colors.line}` }),
      }}><Icon name={group.icon} size={30} stroke={1.5} /></span>
      <span style={{ padding: '10px 12px 12px', flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '15px', fontWeight: 800 }}>{group.label}</span>
        <span style={{ display: 'block', fontSize: '12.5px', color: colors.dim, marginTop: '2px', lineHeight: 1.35 }}>{group.blurb}</span>
        {group.big && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
            {types.map((t) => <span key={t.id} style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-pill)', background: colors.sunken, color: colors.dim }}>{t.variant || t.label}</span>)}
          </span>
        )}
      </span>
    </button>
  );
}

function TypeRow({ t, note, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={`new-type-${t.id}`} style={{
      display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '60px', padding: '10px 12px', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
      background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', fontFamily: ff, color: colors.text, opacity: disabled ? 0.6 : 1,
    }}>
      <span style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: colors.sunken, color: colors.dim, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={t.icon} size={20} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '15px', fontWeight: 700 }}>{t.label}</span>
        <span style={{ display: 'block', fontSize: '12.5px', color: colors.dim, lineHeight: 1.35 }}>{t.desc}</span>
      </span>
      {note && <span style={{ fontSize: '12px', fontWeight: 700, color: colors.accent, whiteSpace: 'nowrap' }}>{note}</span>}
      <Icon name="chevron" size={18} style={{ color: colors.muted }} />
    </button>
  );
}

/**
 * New slide in two steps. Step 1: cards by TYPE (registry groups). Step 2: only that type's
 * choices/fields. Media pages (library, albums, feeds) are made in the Media area, so choosing
 * those goes there; web pages and embeds are made right here.
 */
export default function NewSlideFlow({ open, onClose, slides, onCreate, onUpdate, onNewMessage, go, onEdit }) {
  const [group, setGroup] = useState(null);   // step 2 when set
  const [web, setWeb] = useState(null);        // the type being created with an address form
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setGroup(null); setWeb(null); setUrl(''); setError(''); } }, [open]);

  const finish = () => onClose();
  const pickGroup = (g) => {
    const types = typesInGroup(g.id);
    if (types.length === 1 && types[0].create.kind === 'composer') { finish(); onNewMessage?.(); return; }
    setGroup(g);
  };
  const back = () => { if (web) { setWeb(null); setError(''); } else setGroup(null); };

  const pickType = async (t) => {
    const c = t.create;
    if (c.kind === 'composer') { finish(); onNewMessage?.(); return; }
    if (c.kind === 'navigate') { finish(); go?.(c.section, c.tab ? { tab: c.tab } : undefined); return; }
    if (c.kind === 'web' || c.kind === 'embed') { setWeb(t); setUrl(''); setError(''); return; }
    if (c.kind === 'builtin') {
      setBusy(true);
      try {
        const existing = slides.find((s) => s.type === t.id);
        let id = existing?.id;
        if (existing) {
          if (existing.enabled === false) await onUpdate(slides.map((s) => (s.id === existing.id ? { ...s, enabled: true } : s)));
        } else {
          const created = await onCreate({ type: t.id, duration: t.defaults?.duration || 15, enabled: true });
          id = created?.id;
          if (!created) return;
        }
        finish();
        if (id && !t.editGo) onEdit?.(id);
      } finally { setBusy(false); }
    }
  };

  const createWeb = async () => {
    const raw = url.trim();
    const value = web.id === 'WEB_PAGE' ? normalizeWebUrl(raw) : raw;
    if (!value) { setError('Enter a full web address, like https://charidy.com/miami+'); return; }
    setBusy(true);
    try {
      const created = await onCreate({ type: web.id, ...(web.defaults || {}), embedUrl: value, enabled: true });
      if (created) { finish(); if (!web.editGo) onEdit?.(created.id); }
    } finally { setBusy(false); }
  };

  const title = web ? web.label : group ? group.label : 'New slide';
  return (
    <Sheet open={open} onClose={onClose} title={title} label="New slide" zIndex={1150}>
      <div data-testid="new-slide">
        <Steps step={group ? 2 : 1} />
        {group && (
          <button type="button" onClick={back} data-testid="new-back" style={{ display: 'flex', alignItems: 'center', gap: '2px', minHeight: '44px', margin: '4px -8px 0', padding: '0 8px', background: 'none', border: 'none', color: colors.accent, fontWeight: 700, fontSize: '15px', fontFamily: ff, cursor: 'pointer' }}>
            <Icon name="back" size={18} /> Back
          </button>
        )}
        {!group && (
          <>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: colors.accent, margin: '12px 0 2px', fontFamily: ff }}>Step 1 of 2</div>
            <p style={{ margin: '0 0 14px', fontFamily: 'var(--f-display)', fontSize: '24px', fontWeight: 600, color: colors.text }}>What kind of slide?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {SLIDE_GROUPS.map((g) => <GroupCard key={g.id} group={g} onPick={pickGroup} />)}
            </div>
          </>
        )}
        {group && !web && (
          <>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: colors.accent, margin: '4px 0 10px', fontFamily: ff }}>Step 2 of 2 · {group.label}</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {typesInGroup(group.id).map((t) => {
                const row = t.create.kind === 'builtin' ? slides.find((s) => s.type === t.id) : null;
                const note = t.create.kind === 'builtin' ? (row ? (row.enabled === false ? 'Turn on' : 'On · set up') : 'Add') : t.create.kind === 'navigate' ? 'In Media' : '';
                return <TypeRow key={t.id} t={t} note={note} onClick={() => pickType(t)} disabled={busy} />;
              })}
            </div>
          </>
        )}
        {web && (
          <div>
            <TypeFields slide={{ type: web.id }} form={{ values: { embedUrl: url }, set: (_k, v) => { setUrl(v); setError(''); } }} />
            {error && <div role="alert" style={{ marginTop: '10px', color: colors.danger, fontSize: '14px', fontFamily: ff }}>{error}</div>}
            <button type="button" onClick={createWeb} disabled={busy} data-testid="new-create" style={{ marginTop: '18px', width: '100%', minHeight: '48px', borderRadius: 'var(--r-sm)', border: 'none', background: colors.accent, color: '#fff', fontWeight: 800, fontSize: '15px', fontFamily: ff, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Adding…' : 'Add to the screen'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
