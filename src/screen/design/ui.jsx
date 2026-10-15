import React from 'react';
import { useDesign } from './DesignRoot.jsx';
import { fmt12 } from './time.js';
import { styleVars } from './announceStyles.js';
import { textDir, bidiRuns, isMixed } from '../../shared/bidi.js';

/**
 * Text with the right direction decided by CONTENT, not the kiosk's LTR root
 * (GOTCHAS: bidi). Mixed Hebrew/English text gets each language run isolated
 * so "Mazel Tov! מזל טוב!" keeps both "!" on their own word's trailing side.
 */
export function bidiNodes(text) {
  const s = String(text ?? '');
  if (!isMixed(s)) return s;
  return bidiRuns(s).map((r, i) => <bdi key={i} dir={r.dir}>{r.text}</bdi>);
}
export function Bidi({ text, children, as: Tag = 'span', fallback = 'ltr', style, ...rest }) {
  const t = text ?? children;
  return <Tag dir={textDir(t, fallback)} style={{ unicodeBidi: 'isolate', ...style }} {...rest}>{bidiNodes(t)}</Tag>;
}

/**
 * Primitives of the round-2 system (docs/design/2026-10-14-mockups-r2/
 * README §3–4). All colour comes from roles; all type from font roles.
 */

/** Hebrew size that follows the global Hebrew scale (settings.hebrewFontScale). */
export const he = (px) => `calc(${px}px * var(--he-scale, 1))`;

export const F = {
  heD: 'var(--f-disp-he, var(--f-he-d))',
  he: 'var(--f-he)',
  enD: 'var(--f-disp-en, var(--f-en-d))',
  en: 'var(--f-en)',
  num: 'var(--f-num)',
  th: 'var(--f-th)',
  te: 'var(--f-te)',
};

/** Data attributes for the "lively" stagger (index i). */
export const stagger = (i) => ({ 'data-s': '', style: { '--i': i } });
export const s = (i, style) => ({ 'data-s': '', style: { '--i': i, ...style } });

/**
 * The page panel: the one raised surface. `look` = announcement style id
 * (classic/grand/celebration/…; see announceStyles.js). Panel-local roles
 * (--panel --ink --inkDim --fill --fillInk --accentText --line --past
 * --f-disp-* --disp-w) are what every page paints with, so a style is just a
 * set of overrides.
 */
export function Panel({ look, pad = '30px 40px 32px', style, children, className = '', fullBleed = false, ...rest }) {
  const { upNext, light } = useDesign();
  const neutral = upNext && (!look || look === 'classic');
  const roles = {
    '--panel': 'var(--raised)',
    '--ink': 'var(--text)',
    '--inkDim': 'var(--dim)',
    '--fill': neutral ? 'var(--hi)' : 'var(--accent)',
    '--fillInk': neutral ? 'var(--text)' : 'var(--onAccent)',
    '--accentText': neutral ? 'var(--text)' : 'var(--accent)',
    '--f-disp-he': 'var(--f-he-d)',
    '--f-disp-en': 'var(--f-en-d)',
    '--disp-w': 700,
    ...styleVars(look, light),
  };
  return (
    <section
      className={`tt-panel ${className}`}
      style={{
        ...roles,
        '--line': 'color-mix(in srgb, var(--ink) 15%, transparent)',
        '--past': 'color-mix(in srgb, var(--ink) 34%, transparent)',
        background: 'var(--panelBg, var(--panel))',
        color: 'var(--ink)',
        borderRadius: 32,
        padding: fullBleed ? 0 : pad,
        boxShadow: 'var(--panelRing, none)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        height: '100%',
        ...style,
      }}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Quiet page title: English left (dim), Hebrew right. One line, no chrome. */
export function PageTitle({ en, heText, i = 0, style }) {
  return (
    <header data-s="" style={{ '--i': i, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, marginBottom: 12, flex: 'none', ...style }}>
      <span style={{ fontFamily: F.en, fontSize: 26, color: 'var(--inkDim)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{en}</span>
      {heText ? <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(36), fontWeight: 600, whiteSpace: 'nowrap' }}>{heText}</span> : null}
    </header>
  );
}

/**
 * A clock time with small AM/PM: "12:57 PM". `width` reserves a fixed
 * numeral box (in em) so a column of times lines up on the colon.
 */
export function TimeText({ mins, size, weight = 700, ampmSize, ampmColor = 'var(--inkDim)', width, color, style, ampm = true, gap = 6, spacing = '-.035em' }) {
  if (mins == null) return null;
  const f = fmt12(mins);
  return (
    <span className="tt-num" style={{ fontSize: size, fontWeight: weight, letterSpacing: spacing, lineHeight: 1, whiteSpace: 'nowrap', color, ...style }}>
      <b style={{ display: width ? 'inline-block' : 'inline', minWidth: width, textAlign: 'right', fontWeight: 'inherit' }}>{f.t}</b>
      {ampm && <small style={{ fontSize: ampmSize || Math.round((parseFloat(size) || 40) * 0.38), fontWeight: 600, letterSpacing: 0, color: ampmColor, marginLeft: gap }}>{f.ap}</small>}
    </span>
  );
}

/** Thin hairline rule using the panel's line role. */
export function Rule({ style }) {
  return <div style={{ height: 2, background: 'var(--line)', borderRadius: 1, flex: 'none', ...style }} />;
}

/** Empty-state line for a page with nothing to show (still a calm panel). */
export function Empty({ en, heText }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--inkDim)' }}>
      {heText && <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(44), fontWeight: 600, color: 'var(--ink)' }}>{heText}</div>}
      {en && <div style={{ fontFamily: F.en, fontSize: 28, fontWeight: 500 }}>{en}</div>}
    </div>
  );
}
