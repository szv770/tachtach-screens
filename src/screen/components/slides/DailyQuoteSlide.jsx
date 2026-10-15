import React from 'react';
import { Panel, Bidi, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { isHebrew } from '../../design/time.js';
import { gematria } from '../../../shared/limudim.js';

/**
 * Daily Quote (the owner's "Tanya page": Chabad.org's daily quote is very
 * often a line of Tanya) — the Inspiration "quote" look (R2 §6), polished:
 *   - the text in the Torah-text role (EB Garamond italic / Frank Ruhl for
 *     Hebrew, or whatever the owner assigned), auto-fit and balanced, on a
 *     calm reading measure instead of edge to edge;
 *   - soft quote marks in the dim role (English; Hebrew stays unmarked);
 *   - a short accent rule (the page's one accent), then the source line in
 *     the Torah-text role, with the Hebrew source beside it when we can name
 *     it ("Tanya, chapter 12" → "תניא, פרק י״ב").
 */

const SOURCES = [
  [/^tanya\b[,\s]*(?:ch(?:apter|\.)?\s*(\d+))?/i, (m) => (m[1] ? `תניא, פרק ${gematria(Number(m[1]))}` : 'תניא')],
  [/^hayom yom\b/i, () => 'היום יום'],
  [/^likkutei sichos\b/i, () => 'לקוטי שיחות'],
  [/^igros kodesh\b|^igrot kodesh\b/i, () => 'אגרות קודש'],
  [/^pirkei avos\b|^ethics of the fathers\b/i, () => 'פרקי אבות'],
];

export function hebrewSource(source) {
  const s = String(source || '').trim();
  for (const [re, f] of SOURCES) {
    const m = s.match(re);
    if (m) return f(m);
  }
  return '';
}

const stripQuotes = (t) => String(t || '').trim().replace(/^["“”„«»']+|["“”„«»']+$/g, '').trim();

export default function DailyQuoteSlide({ cache }) {
  const quote = cache?.dailyQuote;
  if (!quote?.text) return null;
  const text = stripQuotes(quote.text);
  const hb = isHebrew(text);
  const srcHe = hb ? '' : hebrewSource(quote.source);
  const srcIsHe = isHebrew(quote.source || '');
  const mark = { color: 'var(--inkDim)', fontStyle: 'normal' };
  // Quote, rule and source are one group, centred together (the source sits
  // under the text, not pinned to the panel foot); only the quote scales.
  return (
    <Panel pad="60px 88px 52px">
      <Fit key={`${text}|${quote.source || ""}`} data-s="" vcenter wrap max={hb ? 120 : 72} min={30} dir={hb ? 'rtl' : 'ltr'} style={{
        '--i': 1, width: '100%', flex: 1, minHeight: 0, textAlign: 'center',
        lineHeight: hb ? 1.3 : 1.24, letterSpacing: hb ? 0 : '-.005em',
        fontFamily: hb ? 'var(--f-th)' : 'var(--f-te)', fontWeight: hb ? 500 : 450, fontStyle: hb ? 'normal' : 'italic', color: 'var(--ink)',
      }}>
        <div style={{ maxWidth: hb ? '86%' : '80%', margin: '0 auto' }}>
          {hb ? bidiNodes(text) : <><span style={mark}>“</span>{text}<span style={mark}>”</span></>}
        </div>
        {quote.source && (
          <div dir="ltr" style={{ fontStyle: 'normal', letterSpacing: 0, lineHeight: 1.3 }}>
            <div style={{ width: 56, height: 3, borderRadius: 2, background: 'var(--accentText)', margin: '38px auto 22px' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', columnGap: 18, rowGap: 4 }}>
              <Bidi text={quote.source} style={{ fontFamily: srcIsHe ? 'var(--f-th)' : 'var(--f-te)', fontSize: srcIsHe ? 'calc(31px * var(--he-scale, 1))' : 30, color: 'var(--inkDim)', fontWeight: 500, letterSpacing: '.01em' }} />
              {srcHe && (
                <>
                  <span aria-hidden style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--line)', alignSelf: 'center' }} />
                  <span className="tt-he" style={{ fontFamily: 'var(--f-th)', fontSize: 'calc(31px * var(--he-scale, 1))', color: 'var(--inkDim)', fontWeight: 500 }}>{srcHe}</span>
                </>
              )}
            </div>
          </div>
        )}
      </Fit>
    </Panel>
  );
}
