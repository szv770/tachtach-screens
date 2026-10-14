import React from 'react';
import { Panel, F, he } from '../../design/ui.jsx';
import { getCurrentPerek } from '../../../shared/pirkeiAvos.js';

/** Pirkei Avos (Shabbos, Pesach → Rosh Hashana): the title and today's perek. */
export default function PirkeiAvosSlide({ cache }) {
  const perek = getCurrentPerek(cache?.hebrewDate);
  return (
    <Panel pad="56px 72px">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <div data-s="" className="tt-he" style={{ '--i': 1, fontFamily: 'var(--f-th)', fontSize: he(150), fontWeight: 600, lineHeight: 1.1 }}>פרקי אבות</div>
        <div data-s="" style={{ '--i': 2, fontFamily: 'var(--f-te)', fontStyle: 'italic', fontSize: 48, color: 'var(--inkDim)' }}>Ethics of the Fathers</div>
        <div data-s="" style={{ '--i': 3, width: 72, height: 3, borderRadius: 2, background: 'var(--accentText)', margin: '18px 0 6px' }} />
        {perek ? (
          <div data-s="" style={{ '--i': 4 }}>
            <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(72), fontWeight: 600, color: 'var(--accentText)' }}>{perek.hebrewName}</div>
            <div style={{ fontFamily: F.en, fontSize: 34, color: 'var(--inkDim)', fontWeight: 500, marginTop: 4 }}>{perek.englishName}</div>
          </div>
        ) : (
          <div style={{ fontFamily: F.en, fontSize: 30, color: 'var(--inkDim)' }}>Not in season</div>
        )}
      </div>
    </Panel>
  );
}
