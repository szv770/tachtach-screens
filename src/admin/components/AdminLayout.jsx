import React, { useState, useEffect, useRef } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { canOpenSection, ROLE_LABEL } from '../../shared/permissions.js';
import { navItems, AREAS, LOOK_GROUPS, areaOfSection, areaInfo, sectionInfo, sectionsOfArea, sectionsOfGroup, firstSectionOfArea, areasFor } from '../nav.js';
import Icon from './ui/Icon.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import ThemeSwitch from './ThemeSwitch.jsx';
import FreezeBanner from './FreezeBanner.jsx';
import UpdateBanner from './ops/UpdateBanner.jsx';
import { lockScroll } from './ui/scrollLock.js';

export { navItems };

/** Viewport query hook (the shell switches layout at 900px and the preview at 1280px). */
function useMedia(query) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = (e) => setM(e.matches);
    setM(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Small "Admin" / "Editor" pill. */
export function RoleChip({ role, style }) {
  const admin = role === 'admin';
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: '999px', fontFamily: adminFonts.englishBody,
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.3px', lineHeight: '16px',
      color: admin ? colors.edited : colors.dim, background: admin ? colors.editedSoft : colors.sunken,
      whiteSpace: 'nowrap', ...style,
    }}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

export function handleLogout() {
  const csrfMatch = document.cookie.match(/(^| )_csrf=([^;]+)/);
  const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[2]) : '';
  fetch('/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } })
    .then(() => { window.location.href = '/login'; })
    .catch(() => { window.location.href = '/login'; });
}

const iconBtn = {
  width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'transparent', color: colors.text,
  display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flexShrink: 0,
};

/** Name + role chip; tap opens My account. */
function NameChip({ me, onOpen }) {
  if (!me) return null;
  return (
    <button type="button" onClick={onOpen} title="My account" data-testid="name-chip" style={{
      display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '0 12px 0 6px', borderRadius: '999px',
      border: `1px solid ${colors.line}`, background: colors.card, cursor: 'pointer', color: colors.text, fontFamily: adminFonts.englishBody,
    }}>
      <span aria-hidden="true" style={{
        width: 28, height: 28, borderRadius: '50%', background: colors.accentSoft, color: colors.accent,
        display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '13px',
      }}>{String(me.name || '?').trim().charAt(0).toUpperCase()}</span>
      <span style={{ fontSize: '13.5px', fontWeight: 700, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</span>
      <RoleChip role={me.role} />
    </button>
  );
}

/** Open the live preview in its own browser tab. */
export function NewTabPreviewLink({ style, children }) {
  return (
    <a href="/screen?preview=true" target="_blank" rel="noopener noreferrer" data-testid="preview-new-tab" style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '0 14px', borderRadius: '999px',
      border: `1px solid ${colors.border}`, color: colors.text, textDecoration: 'none', fontFamily: adminFonts.englishBody,
      fontSize: '13.5px', fontWeight: 700, background: 'transparent', ...style,
    }}>
      <Icon name="external" size={16} />{children || 'Open live preview in a new tab'}
    </a>
  );
}

/** Mobile bottom sheet / desktop slide-over that holds the Live Preview + Screen Controls. */
function PreviewDrawer({ open, onClose, children, side }) {
  useEffect(() => {
    if (!open) return undefined;
    const unlock = lockScroll();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="presentation" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: colors.scrim, display: 'flex',
      justifyContent: side ? 'flex-end' : 'center', alignItems: side ? 'stretch' : 'flex-end',
    }}>
      <div role="dialog" aria-label="Live preview" onClick={(e) => e.stopPropagation()} data-testid="preview-drawer" style={{
        background: colors.bg, color: colors.text, boxShadow: 'var(--e3)', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        ...(side
          ? { width: 'min(420px, 100%)', padding: '16px' }
          : { width: '100%', maxHeight: '92dvh', borderRadius: 'var(--r-xl) var(--r-xl) 0 0', padding: '12px 16px calc(20px + env(safe-area-inset-bottom))' }),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 800, color: colors.dim, textTransform: 'uppercase', letterSpacing: '.1em' }}>Screen preview</span>
          <button type="button" onClick={onClose} aria-label="Close preview" style={{ ...iconBtn, background: colors.sunken, color: colors.dim }}><Icon name="close" size={18} /></button>
        </div>
        <NewTabPreviewLink style={{ marginBottom: '12px' }} />
        {children}
      </div>
    </div>
  );
}

/** Title shown big at the top of a page. */
function pageTitle(section, area, siteName) {
  if (section === 'home') return siteName;
  const info = sectionInfo(section);
  const a = areaInfo(area);
  if (a && a.key === 'look') return info?.en || a.en; // Look & Settings: each page is named; the sub-nav shows where you are
  if (a && a.key !== 'home' && a.key !== 'announce') return a.en;
  return info?.en || '';
}

export default function AdminLayout({
  activeSection, onSectionChange, children, preview, me, siteName = 'My screen',
  onOpenSearch, onOpenNew, onOpenPreviewTab, canPost = true, hasSavebar = false,
}) {
  const wide = useMedia('(min-width: 900px)');
  const roomForPreview = useMedia('(min-width: 1280px)');
  const [previewOpen, setPreviewOpen] = useState(false);
  const role = me; // the whole person: tabs come from their capabilities (permissions.js), not just admin/editor
  const area = areaOfSection(activeSection);
  const siblings = area ? sectionsOfArea(area, role) : [];
  const areas = areasFor(role);
  const lookFirst = firstSectionOfArea('look', role);
  const title = pageTitle(activeSection, area, siteName);
  // Sections that are not a tab (Look & Settings pages, account, help) get a back arrow.
  const showBack = !wide && activeSection !== 'home' && !['screen', 'schedule', 'announce'].includes(area);
  const go = (key) => { if (key) onSectionChange(key); };
  const goArea = (a) => go(firstSectionOfArea(a, role));

  // Publish the sticky mobile header's height as --tt-header-h so a section's own
  // sticky bar (e.g. Settings' Save) sits below it; and the tab bar height for the Save bar.
  const headerRef = useRef(null);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--tt-tabbar-h', wide ? '0px' : '64px');
    if (wide || !headerRef.current) { root.style.setProperty('--tt-header-h', '0px'); return () => root.style.setProperty('--tt-tabbar-h', '0px'); }
    const el = headerRef.current;
    const set = () => root.style.setProperty('--tt-header-h', `${el.offsetHeight}px`);
    set();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(set); ro.observe(el); }
    return () => { ro?.disconnect(); root.style.setProperty('--tt-tabbar-h', '0px'); };
  }, [wide]);

  // Desktop sidebar accordion: only one area is open; it follows the page you are on.
  const [openArea, setOpenArea] = useState(area);
  useEffect(() => { setOpenArea(area); }, [area]);

  // Close the drawer when the layout changes or a section changes.
  useEffect(() => { setPreviewOpen(false); }, [activeSection, wide, roomForPreview]);

  // Look & Settings has many small pages: two rows on a phone (group, then page); the sidebar does this on desktop.
  const lookGroups = area === 'look' ? LOOK_GROUPS.map((g) => ({ ...g, items: sectionsOfGroup(g.key, role) })).filter((g) => g.items.length) : [];
  const activeGroup = sectionInfo(activeSection)?.group;
  const groupItems = lookGroups.find((g) => g.key === activeGroup)?.items || [];
  const subNav = area === 'look' ? (
    wide ? null : (
      <div data-testid="look-subnav" style={{ display: 'grid', gap: '8px', marginBottom: '16px', minWidth: 0 }}>
        {lookGroups.length > 1 && (
          <SegmentedControl
            ariaLabel="Look and settings groups" fill value={activeGroup}
            onChange={(g) => go(lookGroups.find((x) => x.key === g)?.items[0]?.key)}
            options={lookGroups.map((g) => ({ value: g.key, label: g.en }))}
          />
        )}
        {groupItems.length > 1 && (
          <SegmentedControl
            ariaLabel="Pages" value={activeSection} onChange={go}
            options={groupItems.map((s) => ({ value: s.key, label: s.en }))}
          />
        )}
      </div>
    )
  ) : siblings.length > 1 ? (
    <SegmentedControl
      ariaLabel={`${areaInfo(area)?.en || ''} sections`}
      value={activeSection}
      onChange={go}
      options={siblings.map((s) => ({ value: s.key, label: s.en }))}
      style={{ marginBottom: '16px' }}
    />
  ) : null;

  const heading = (
    <h1 data-testid="page-title" style={{
      fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: wide ? '30px' : '32px', letterSpacing: '-.01em',
      lineHeight: 1.1, margin: wide ? '0 0 16px' : '4px 0 14px', color: colors.text,
    }}>{title}</h1>
  );

  // ------------------------------------------------------------------ mobile
  if (!wide) {
    const tabs = [
      { area: 'home' }, { area: 'screen' }, { fab: true }, { area: 'schedule' }, { area: 'announce' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: colors.bg }}>
        <div ref={headerRef} style={{
          position: 'sticky', top: 0, zIndex: 100, background: colors.bg, flexShrink: 0,
          padding: 'calc(6px + env(safe-area-inset-top)) 8px 6px 8px', display: 'flex', alignItems: 'center', gap: '2px',
        }}>
          {showBack ? (
            <button type="button" aria-label="Back" data-testid="back" onClick={() => go('home')} style={{ ...iconBtn, width: 'auto', padding: '0 12px 0 6px', borderRadius: '999px', gap: '2px', fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '15px', color: colors.accent, display: 'flex', alignItems: 'center' }}>
              <Icon name="back" size={22} />Home
            </button>
          ) : (
            <span style={{ padding: '0 8px', fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '18px', color: colors.text }}>TachTach</span>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" aria-label="Search" data-testid="open-search" onClick={onOpenSearch} style={iconBtn}><Icon name="search" /></button>
          <button type="button" aria-label="Live preview" data-testid="open-preview" onClick={() => setPreviewOpen(true)} style={iconBtn}><Icon name="eye" /></button>
          {lookFirst ? (
            <button type="button" aria-label="Look and settings" data-testid="gear" onClick={() => go(lookFirst)} style={{ ...iconBtn, color: area === 'look' ? colors.accent : colors.text }}><Icon name="gear" /></button>
          ) : (
            <button type="button" aria-label="My account" onClick={() => go('account')} style={iconBtn}><Icon name="user" /></button>
          )}
        </div>

        <main style={{ flex: 1, minWidth: 0, padding: `4px 16px calc(var(--tt-tabbar-h) + 32px + env(safe-area-inset-bottom))` }}>
          <FreezeBanner me={me} />
          <UpdateBanner me={me} onOpen={() => go('health')} />
          {heading}
          {subNav}
          {children}
        </main>

        <nav aria-label="Main" data-testid="tabbar" style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 120,
          height: 'calc(var(--tt-tabbar-h) + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'color-mix(in srgb, var(--surface) 96%, transparent)', borderTop: `1px solid ${colors.line}`,
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        }}>
          {tabs.map((t, i) => {
            if (t.fab) {
              return (
                <div key="fab" style={{ display: 'grid', placeItems: 'start center' }}>
                  {canPost && (
                    <button type="button" aria-label="New" data-testid="fab" onClick={onOpenNew} style={{
                      width: 58, height: 58, borderRadius: '50%', border: 'none', cursor: 'pointer', marginTop: '-22px',
                      background: colors.accent, color: colors.accentInk, display: 'grid', placeItems: 'center',
                      boxShadow: '0 8px 20px color-mix(in srgb, var(--accent) 40%, transparent), 0 0 0 5px var(--bg)',
                    }}><Icon name="plus" size={28} stroke={2.4} /></button>
                  )}
                </div>
              );
            }
            const a = areaInfo(t.area);
            if (!areas.some((x) => x.key === a.key)) return <span key={a.key + i} />;
            const on = area === a.key;
            return (
              <button key={a.key} type="button" data-testid={`tab-${a.key}`} aria-current={on ? 'page' : undefined} onClick={() => (a.key === 'home' ? go('home') : goArea(a.key))} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                background: 'transparent', border: 'none', cursor: 'pointer', color: on ? colors.accent : colors.muted,
                fontFamily: adminFonts.englishBody, fontSize: '11px', fontWeight: 700, padding: 0,
              }}>
                <Icon name={a.icon} size={24} />{a.en}
              </button>
            );
          })}
        </nav>

        <PreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)}>{previewOpen && preview}</PreviewDrawer>
      </div>
    );
  }

  // ----------------------------------------------------------------- desktop
  const cols = roomForPreview ? '248px minmax(0, 1fr) 360px' : '248px minmax(0, 1fr)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, minHeight: '100vh', background: colors.bg }}>
      <aside aria-label="Main" data-testid="sidebar" style={{
        background: colors.surface, borderRight: `1px solid ${colors.line}`, display: 'flex', flexDirection: 'column',
        padding: '16px 12px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Site switcher slot: static today; becomes a menu when one login can run several screens. */}
        <div data-testid="site-card" style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: 'var(--r-md)',
          background: colors.card, border: `1px solid ${colors.line}`, boxShadow: 'var(--e1)', marginBottom: '16px',
        }}>
          <img src="/icons/icon-192.png" alt="" width={36} height={36} style={{ borderRadius: '10px', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: adminFonts.englishBody, fontWeight: 800, fontSize: '14px', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{siteName}</div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted }}>TachTach screen</div>
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          <SideItem label="Home" icon="home" active={activeSection === 'home'} onClick={() => go('home')} />
          {AREAS.filter((a) => a.key !== 'home').map((a) => {
            const items = sectionsOfArea(a.key, role);
            if (!items.length) return null;
            const open = openArea === a.key;
            return (
              <div key={a.key} style={{ marginTop: '6px' }}>
                <button type="button" aria-expanded={open} data-testid={`side-area-${a.key}`} onClick={() => setOpenArea(open ? null : a.key)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: '40px', padding: '0 10px', borderRadius: 'var(--r-sm)',
                  border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: adminFonts.englishBody,
                  fontSize: '14px', fontWeight: 800, color: area === a.key ? colors.accent : colors.text,
                }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{a.en}</span>
                  <span aria-hidden="true" style={{ display: 'inline-block', color: colors.muted, transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                </button>
                {open && (
                  <div style={{ marginLeft: '14px', paddingLeft: '8px', borderLeft: `1px solid ${colors.line}` }}>
                    {a.key === 'look'
                      ? LOOK_GROUPS.map((g) => {
                        const gi = items.filter((it) => it.group === g.key);
                        if (!gi.length) return null;
                        return (
                          <div key={g.key} style={{ marginTop: '6px' }}>
                            <div style={{ padding: '6px 10px 2px', fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, color: colors.muted }}>{g.en}</div>
                            {gi.map((it) => <SideItem key={it.key} label={it.en} active={activeSection === it.key} onClick={() => go(it.key)} />)}
                          </div>
                        );
                      })
                      : items.map((it) => (
                        <SideItem key={it.key} label={it.en} active={activeSection === it.key} onClick={() => go(it.key)} />
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: '12px', display: 'grid', gap: '10px' }}>
          <ThemeSwitch fill style={{ width: '100%' }} />
          <button type="button" onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '0 10px', borderRadius: 'var(--r-sm)',
            border: 'none', background: 'transparent', color: colors.dim, cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600,
          }}><Icon name="logout" size={18} />Sign out</button>
        </div>
      </aside>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 100, height: '64px', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '0 24px', background: colors.bg, borderBottom: `1px solid ${colors.line}`,
        }}>
          <button type="button" data-testid="open-search" onClick={onOpenSearch} aria-label="Search" style={{
            flex: '1 1 160px', minWidth: 0, maxWidth: '560px', height: '40px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 14px',
            borderRadius: '999px', border: `1px solid ${colors.line}`, background: colors.card, color: colors.muted, cursor: 'pointer',
            fontFamily: adminFonts.englishBody, fontSize: '14px', textAlign: 'left',
          }}>
            <Icon name="search" size={18} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Search settings, messages, help…</span>
            <kbd style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '1px 7px', color: colors.dim }}>/</kbd>
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {canPost && (
            <button type="button" data-testid="new-btn" onClick={onOpenNew} style={{
              display: 'flex', alignItems: 'center', gap: '6px', minHeight: '40px', padding: '0 16px', borderRadius: '999px', border: 'none',
              background: colors.accent, color: colors.accentInk, fontFamily: adminFonts.englishBody, fontWeight: 800, fontSize: '14px', cursor: 'pointer',
            }}><Icon name="plus" size={18} stroke={2.6} />New</button>
          )}
          {!roomForPreview && (
            <button type="button" data-testid="open-preview" onClick={() => setPreviewOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '0 14px', borderRadius: '999px',
              border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            }}><Icon name="eye" size={18} />Preview</button>
          )}
          <button type="button" aria-label="Help" title="Help" data-testid="help-btn" onClick={() => go('help')} style={{ ...iconBtn, color: activeSection === 'help' ? colors.accent : colors.text }}><Icon name="help" /></button>
          <NameChip me={me} onOpen={() => go('account')} />
          </div>
        </header>

        <main style={{ padding: '24px 32px calc(96px + env(safe-area-inset-bottom))', minWidth: 0 }}>
          <FreezeBanner me={me} />
          <UpdateBanner me={me} onOpen={() => go('health')} />
          {heading}
          {subNav}
          {children}
        </main>
      </div>

      {roomForPreview && (
        <aside aria-label="Live preview" style={{
          borderLeft: `1px solid ${colors.line}`, padding: '16px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', background: colors.bg,
        }}>
          <NewTabPreviewLink style={{ marginBottom: '12px', width: '100%', justifyContent: 'center' }} />
          {preview}
        </aside>
      )}
      {!roomForPreview && <PreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)} side>{previewOpen && preview}</PreviewDrawer>}
    </div>
  );
}

function SideItem({ label, icon, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} style={{
      display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: '38px', padding: '0 10px', borderRadius: 'var(--r-sm)',
      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: adminFonts.englishBody, fontSize: '14px',
      fontWeight: active ? 800 : 600, background: active ? colors.accentSoft : 'transparent', color: active ? colors.accent : colors.text,
    }}>
      {icon && <Icon name={icon} size={18} />}{label}
    </button>
  );
}
