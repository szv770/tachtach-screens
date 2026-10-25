import React from 'react';
import { F } from '../design/ui.jsx';

/**
 * "Courtesy of Chabad.org": the small credit on every page that shows Chabad.org content
 * (Hayom Yom, Chitas / Rambam / Tanya, Daily Quote, Parsha Tidbits, zmanim from its feed).
 * Chabad.org allows its content to be used with credit (owner decision 2026-10-25).
 *
 * Layout rule: it is a normal block in the panel's flex column (`flex: none`), NOT an overlay, so the
 * page's own fitting (Fit / Paged / Reader / grid rows) simply has that line less to work with and text
 * can never run under it. Roles only (ink mixed down, the English font role), static, no blur.
 * Off with `settings.showChabadCredit === false` (admin: Look & Settings > Chabad.org credit).
 */
export const chabadCreditOn = (settings) => settings?.showChabadCredit !== false;

export const CREDIT_NAME = 'Chabad.org';
/** The name comes from the installed data pack's manifest when there is one (cache.packInfo.credit), else Chabad.org. */
export const creditText = (cache) => `Courtesy of ${String(cache?.packInfo?.credit || CREDIT_NAME).slice(0, 60)}`;
export const CREDIT_TEXT = creditText();
export const NOT_IN_PACK = 'Not in the data pack yet';

export default function SourceCredit({ settings, cache, show = true, align = 'flex-end', inline = false, style }) {
  if (!show || !chabadCreditOn(settings)) return null;
  return (
    <div
      data-credit=""
      dir="ltr"
      style={{
        flex: 'none', display: 'flex', justifyContent: align, alignItems: 'center', gap: 10,
        fontFamily: F.en, fontSize: 17, fontWeight: 500, letterSpacing: '.05em', lineHeight: 1,
        color: 'color-mix(in srgb, var(--ink) 52%, transparent)',
        whiteSpace: 'nowrap', pointerEvents: 'none',
        ...(inline ? null : { marginTop: 12 }),
        ...style,
      }}
    >
      <span aria-hidden style={{ width: 16, height: 2, borderRadius: 1, background: 'var(--line)' }} />
      <span>{creditText(cache)}</span>
    </div>
  );
}
