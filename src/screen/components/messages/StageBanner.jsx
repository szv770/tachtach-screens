import React from 'react';
import { F, he, Bidi } from '../../design/ui.jsx';
import { isHebrew } from '../../design/time.js';
import { BANNER_HEIGHT } from './Banner.jsx';

/**
 * Attention stage 2 (src/shared/stageNow.js): "Seder just started", in the banner row for the
 * few minutes after a block begins. An accent strip (the one loud banner), static: no motion,
 * never pauses the rotation. English "<name> just started" and Hebrew "עכשיו: <name>" (a
 * gender-neutral form: "now: X"), each only when that name exists.
 */
export default function StageBanner({ started }) {
  if (!started) return null;
  const en = started.name ? `${started.name} just started` : '';
  const hbName = started.nameHe ? `עכשיו: ${started.nameHe}` : '';
  const enIsHe = isHebrew(started.name);
  return (
    <div data-stage="started" style={{
      flex: 'none', height: BANNER_HEIGHT, background: 'var(--accent)', color: 'var(--onAccent)', borderRadius: 24,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 32px', overflow: 'hidden', whiteSpace: 'nowrap',
    }}>
      {en && <Bidi text={en} style={{ fontFamily: enIsHe ? F.he : F.enD, fontSize: enIsHe ? he(36) : 36, fontWeight: 700, letterSpacing: '-.005em' }} />}
      {en && hbName && <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', opacity: 0.55, flex: 'none' }} />}
      {hbName && <Bidi text={hbName} fallback="rtl" style={{ fontFamily: F.heD, fontSize: he(38), fontWeight: 600 }} />}
    </div>
  );
}
