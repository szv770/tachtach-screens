import React from 'react';
import { Panel, F, he } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { isHebrew } from '../../design/time.js';

/** Daily Quote — the Inspiration "quote" look (R2 §6): Torah-text font, big
 *  balanced text, a 72 px accent rule (the page's one accent), the source. */
export default function DailyQuoteSlide({ cache }) {
  const quote = cache?.dailyQuote;
  if (!quote?.text) return null;
  const hb = isHebrew(quote.text);
  return (
    <Panel pad="56px 72px 48px">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0 }}>
        <Fit data-s="" wrap max={hb ? 150 : 84} dir={hb ? 'rtl' : 'ltr'} style={{
          '--i': 1, width: hb ? '92%' : '86%', flex: 1, minHeight: 0, textAlign: 'center', lineHeight: 1.22,
          fontFamily: hb ? 'var(--f-th)' : 'var(--f-te)', fontWeight: 500, fontStyle: hb ? 'normal' : 'italic', color: 'var(--ink)',
        }}>{quote.text}</Fit>
        {quote.source && (
          <>
            <div data-s="" style={{ '--i': 2, width: 72, height: 3, borderRadius: 2, background: 'var(--accentText)', margin: '30px 0 22px', flex: 'none' }} />
            <div data-s="" style={{ '--i': 3, fontFamily: F.en, fontSize: 30, color: 'var(--inkDim)', fontWeight: 500, flex: 'none' }}>{quote.source}</div>
          </>
        )}
      </div>
    </Panel>
  );
}
void he;
