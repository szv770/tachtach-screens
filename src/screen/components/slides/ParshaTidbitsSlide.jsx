import React from 'react';
import { Panel, PageTitle, Empty, F } from '../../design/ui.jsx';
import { isHebrew } from '../../design/time.js';
import { parshaEnglish } from '../Rail.jsx';

/** Parsha tidbits: the first few articles as ruled rows (static — no scroll loop). */
export default function ParshaTidbitsSlide({ cache }) {
  const items = (cache?.parshaTidbits?.items || []).filter((t) => t.description).slice(0, 4);
  const parsha = cache?.parsha;
  return (
    <Panel pad="30px 48px 34px">
      <PageTitle en={parsha?.name ? parshaEnglish(parsha.name) : 'This week’s parsha'} heText={parsha?.hebrew || 'פרשת השבוע'} />
      {items.length === 0 ? <Empty en="No parsha articles available" /> : (
        <div style={{ flex: 1, display: 'grid', gridAutoRows: 'minmax(0, 1fr)', minHeight: 0, marginTop: 8 }}>
          {items.map((t, i) => {
            const hb = isHebrew(t.title);
            return (
              <div key={i} data-s="" style={{ '--i': i + 1, borderTop: '2px solid var(--line)', padding: '18px 0 10px', minHeight: 0, overflow: 'hidden' }}>
                <div dir={hb ? 'rtl' : 'ltr'} style={{ fontFamily: hb ? 'var(--f-he-d)' : F.enD, fontSize: hb ? 'calc(40px * var(--he-scale))' : 40, fontWeight: 600, lineHeight: 1.15, textAlign: 'start' }}>{t.title}</div>
                <div className="tt-clamp3" style={{ fontFamily: F.en, fontSize: 26, color: 'var(--inkDim)', lineHeight: 1.4, marginTop: 8, fontWeight: 500 }}>{t.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
