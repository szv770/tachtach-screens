import React from 'react';
import { Panel } from '../../design/ui.jsx';
import { pickDailyWord, splitEmphasis } from '../../../shared/dailyWords.js';

/**
 * Daily Word page (placeholder layout; the real design replaces this body).
 * Props: dailyWords = { order, words } from /api/state, dateISO = the kiosk's
 * date (or the admin's preview date). The word is a pure function of the date
 * (src/shared/dailyWords.js), so every screen shows the same one.
 */
export default function DailyWordSlide({ dailyWords, dateISO }) {
  const w = pickDailyWord(dailyWords, dateISO);
  if (!w) return null;
  return (
    <Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', height: '100%' }}>
        <div style={{ fontSize: 120, direction: 'rtl', fontFamily: 'var(--fHe)' }}>{w.word}</div>
        <div style={{ fontSize: 40 }}>{w.transliteration} · {w.pronunciation}</div>
        <div style={{ fontSize: 32 }}>{w.meaning}</div>
        {w.convo.map((l, i) => (
          <div key={i} style={{ fontSize: 28 }}>
            {splitEmphasis(l.text).map((p, j) => (p.em ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}
          </div>
        ))}
      </div>
    </Panel>
  );
}
