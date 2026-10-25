import React from 'react';
import { Panel, PageTitle, Empty, F, Bidi, bidiNodes } from '../../design/ui.jsx';
import { isHebrew } from '../../design/time.js';
import { parshaEnglish } from '../Rail.jsx';
import SourceCredit, { NOT_IN_PACK } from '../SourceCredit.jsx';

/** Parsha tidbits: the first few articles as ruled rows (static — no scroll loop). */
export default function ParshaTidbitsSlide({ cache, settings }) {
  const items = (cache?.parshaTidbits?.items || []).filter((t) => t.description).slice(0, 4);
  const parsha = cache?.parsha;
  return (
    <Panel pad="30px 48px 34px">
      <PageTitle en={parsha?.name ? parshaEnglish(parsha.name) : 'This week’s parsha'} heText={parsha?.hebrew || 'פרשת השבוע'} />
      {items.length === 0 ? <Empty en={cache?.parshaTidbits?.missing ? NOT_IN_PACK : 'No parsha articles available'} /> : (
        <div style={{ flex: 1, display: 'grid', gridAutoRows: 'minmax(0, 1fr)', minHeight: 0, marginTop: 8 }}>
          {items.map((t, i) => {
            const hb = isHebrew(t.title);
            return (
              <div key={i} data-s="" style={{ '--i': i + 1, borderTop: '2px solid var(--line)', padding: '18px 0 10px', minHeight: 0, overflow: 'hidden' }}>
                <Bidi as="div" text={t.title} style={{ fontFamily: hb ? 'var(--f-he-d)' : F.enD, fontSize: hb ? 'calc(40px * var(--he-scale))' : 40, fontWeight: 600, lineHeight: 1.15, textAlign: 'start' }} />
                <Bidi as="div" className="tt-clamp3" text={t.description} style={{ fontFamily: F.en, fontSize: 26, color: 'var(--inkDim)', lineHeight: 1.4, marginTop: 8, fontWeight: 500, textAlign: 'start' }} />
              </div>
            );
          })}
        </div>
      )}
      {items.length > 0 && <SourceCredit settings={settings} cache={cache} />}
    </Panel>
  );
}
