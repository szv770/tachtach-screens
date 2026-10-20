import React, { useState, useEffect, useMemo, useRef } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { search, tokenize, highlight } from '../search/searchIndex.js';
import Icon from './ui/Icon.jsx';
import { lockScroll } from './ui/scrollLock.js';

function Marked({ text, tokens }) {
  return highlight(text, tokens).map((p, i) => (p.hit
    ? <mark key={i} style={{ background: colors.editedSoft, color: colors.edited, borderRadius: '3px', padding: '0 1px' }}>{p.text}</mark>
    : <React.Fragment key={i}>{p.text}</React.Fragment>));
}

/**
 * Global search overlay: Settings & features / On the screen / Quick actions / Help.
 * `onRun(action)` does the work (App.jsx); the overlay closes first.
 */
export default function GlobalSearch({ open, onClose, state, role, onRun }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const groups = useMemo(() => (open ? search(q, { state, role }) : []), [open, q, state, role]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const tokens = useMemo(() => tokenize(q), [q]);

  useEffect(() => { if (open) { setQ(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => {
    if (!open) return undefined;
    return lockScroll();
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, flat]);

  if (!open) return null;
  const run = (action) => { onClose(); setTimeout(() => onRun(action), 0); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && flat[cursor]) { e.preventDefault(); run(flat[cursor].action); }
  };

  let idx = -1;
  return (
    <div role="presentation" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: colors.scrim, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
    }}>
      <div role="dialog" aria-modal="true" aria-label="Search" data-testid="search-overlay" onClick={(e) => e.stopPropagation()} onKeyDown={onKey} style={{
        width: '100%', maxWidth: '680px', height: '100%', maxHeight: '100dvh', display: 'flex', flexDirection: 'column',
        background: colors.bg, color: colors.text, fontFamily: adminFonts.englishBody,
        ...(window.innerWidth >= 900 ? { height: 'auto', maxHeight: '78vh', marginTop: '9vh', borderRadius: 'var(--r-xl)', boxShadow: 'var(--e3)', overflow: 'hidden' } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: 'calc(10px + env(safe-area-inset-top)) 12px 10px 16px', borderBottom: `1px solid ${colors.line}`, background: colors.surface }}>
          <Icon name="search" size={20} style={{ color: colors.muted }} />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings, messages, help…"
            aria-label="Search" data-testid="search-input" autoComplete="off" autoCorrect="off" spellCheck={false}
            style={{ flex: 1, minWidth: 0, height: '44px', border: 'none', outline: 'none', background: 'transparent', color: colors.text, fontFamily: 'inherit', fontSize: '17px' }}
          />
          <button type="button" onClick={onClose} style={{ minHeight: '44px', padding: '0 12px', border: 'none', background: 'transparent', color: colors.accent, fontWeight: 700, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        </div>

        <div ref={listRef} role="listbox" data-testid="search-results" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px calc(24px + env(safe-area-inset-bottom))' }}>
          {!flat.length && tokens.length > 0 && (
            <p style={{ textAlign: 'center', color: colors.dim, padding: '40px 16px', fontSize: '15px' }}>Nothing found for “{q.trim()}”. Try a shorter word, or “help”.</p>
          )}
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title} style={{ marginTop: '12px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: colors.muted, margin: '0 6px 6px' }}>{g.title}</h3>
              <div style={{ background: colors.card, borderRadius: 'var(--r-md)', border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
                {g.items.map((it, i) => {
                  idx += 1;
                  const my = idx;
                  const active = my === cursor;
                  return (
                    <div key={it.id} role="option" aria-selected={active} data-active={active ? 'true' : 'false'} data-testid="search-row" style={{
                      display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '8px 12px',
                      borderTop: i ? `1px solid ${colors.line}` : 'none', background: active ? colors.accentSoft : 'transparent',
                    }}>
                      <button type="button" onClick={() => run(it.action)} onMouseMove={() => setCursor(my)} style={{
                        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', background: 'transparent', border: 'none', cursor: 'pointer',
                        textAlign: 'left', color: 'inherit', fontFamily: 'inherit', padding: 0, minHeight: '44px',
                      }}>
                        <span style={{ width: 36, height: 36, borderRadius: 11, background: colors.sunken, color: colors.dim, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={it.icon} size={18} /></span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Marked text={it.title} tokens={tokens} /></span>
                          <span style={{ display: 'block', fontSize: '12.5px', color: colors.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</span>
                        </span>
                        {!it.inline && <Icon name="chevron" size={16} style={{ color: colors.muted }} />}
                      </button>
                      {it.inline && (
                        <button type="button" onClick={() => run(it.inline.action)} style={{
                          minHeight: '36px', padding: '0 14px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent',
                          color: colors.text, fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                        }}>{it.inline.label}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
