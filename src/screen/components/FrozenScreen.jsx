import React from 'react';
import { Bidi, F } from '../design/ui.jsx';
import { useDesign } from '../design/DesignRoot.jsx';
import { DEFAULT_MESSAGE } from '../../shared/freeze.js';

/**
 * The whole screen while a Freeze / Blank freeze is on (modes blank, logo, message; the 'freeze'
 * mode keeps the normal screen and only stops the rotation, see App.jsx). Nothing else is mounted
 * under it, so nothing keeps animating. Rules: src/shared/freeze.js; data: /api/state `freeze`.
 *
 *   blank    solid black (deliberately not a theme colour: it is the "screen is dark" look)
 *   logo     the credit logo (settings.credit.logo.url) else the bundled TachTach mark, on black
 *   message  plain    big centred text in the display roles, on the theme background
 *            terminal monospace on black in the theme accent (lightened on a light theme so it still
 *                     reads on black), `> text` + a static block cursor; typed out ONCE (finite steps animation, never loops). The mono stack
 *                     is --f-mono (design/globalCss.js); no glow, blur or scanline filters.
 */
const HE = /[֐-׿]/;
const BLACK = '#000';
const FALLBACK_LOGO = '/icons/logo-mark.png';

const KEYFRAMES = '@keyframes tt-freeze-type { from { width: 0 } to { width: var(--tt-chars) } }';

function Plain({ text }) {
  const n = [...text].length;
  const heb = HE.test(text);
  const px = n <= 14 ? 150 : n <= 30 ? 112 : n <= 60 ? 84 : 62;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: '6%' }}>
      <Bidi text={text} style={{
        display: 'block', maxWidth: '88%', textAlign: 'center', color: 'var(--text)', textWrap: 'balance', overflowWrap: 'anywhere',
        fontFamily: heb ? F.heD : F.enD, fontSize: heb ? `calc(${px}px * var(--he-scale, 1))` : px, fontWeight: 600, lineHeight: 1.18, letterSpacing: heb ? 0 : '-.01em',
      }} />
    </div>
  );
}

function Terminal({ text, portrait, still }) {
  const { light } = useDesign();
  const ink = light ? 'color-mix(in srgb, var(--accent) 45%, #fff)' : 'var(--accent)';
  const n = [...text].length;
  const heb = HE.test(text);
  const avail = portrait ? 760 : 1400;
  const fit = avail / (0.6 * (n + 3));
  const oneLine = !heb && fit >= 40;
  const px = oneLine ? Math.min(96, Math.floor(fit)) : 48;
  const type = oneLine && !still;
  const cursor = (
    <span aria-hidden="true" style={{ display: 'inline-block', width: '.55em', height: '1.02em', marginLeft: '.12em', verticalAlign: '-.14em', background: ink }} />
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: BLACK, display: 'flex', alignItems: 'center', padding: '0 7%' }}>
      <style>{KEYFRAMES}</style>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: px, lineHeight: 1.3, color: ink, fontWeight: 500, whiteSpace: oneLine ? 'pre' : 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' }}>
        <span>{'> '}</span>
        {oneLine ? (
          <span style={{
            display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', '--tt-chars': `${n}ch`, width: type ? undefined : `${n}ch`,
            animation: type ? `tt-freeze-type ${Math.min(2.4, 0.5 + n * 0.07).toFixed(2)}s steps(${Math.max(1, n)}, end) 0.4s 1 both` : undefined,
          }}>{text}</span>
        ) : (
          <Bidi text={text} />
        )}
        {cursor}
      </div>
    </div>
  );
}

export default function FrozenScreen({ freeze, credit, portrait = false, motion = 'smooth' }) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  if (!freeze) return null;
  const { mode, style } = freeze;
  const text = (freeze.message || '').trim() || DEFAULT_MESSAGE;

  if (mode === 'logo') {
    const url = !logoFailed && credit?.logo?.url ? credit.logo.url : FALLBACK_LOGO;
    return (
      <div style={{ position: 'absolute', inset: 0, background: BLACK, display: 'grid', placeItems: 'center' }}>
        <img
          src={url} alt="" onError={() => { if (url !== FALLBACK_LOGO) setLogoFailed(true); }}
          style={{ maxWidth: portrait ? '70%' : '46%', maxHeight: portrait ? '40%' : '56%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }
  if (mode === 'message') {
    return style === 'terminal'
      ? <Terminal text={text} portrait={portrait} still={motion === 'minimal'} />
      : <Plain text={text} />;
  }
  return <div style={{ position: 'absolute', inset: 0, background: BLACK }} />; // blank
}
