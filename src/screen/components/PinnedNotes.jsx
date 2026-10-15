import React, { useEffect, useState } from 'react';
import { F, he, bidiNodes } from '../design/ui.jsx';
import { isHebrew } from '../design/time.js';
import { textDir } from '../../shared/bidi.js';

/**
 * Rail side notes (announcements shown as "Side note"), R2 §5.3: each is a
 * raised card holding ONE text in the language it was written in, clamped to
 * 3 lines. At most 2 are visible; more rotate in place every 8 s (a one-shot
 * fade, no looping animation).
 */
const MAX_VISIBLE = 2;
const ROTATE_MS = 8000;

export function noteText(n) {
  const h = String(n.textHe || '').trim();
  const e = String(n.textEn || n.text || '').trim();
  if (h && !e) return { text: h, he: true };
  if (e && !h) return { text: e, he: isHebrew(e) };
  if (h && e) return { text: h, he: true };
  return { text: '', he: false };
}

export default function PinnedNotes({ pinned, visibility, align = 'left', style }) {
  const notes = (pinned || []).filter((p) => p.displayMode !== 'slide' && noteText(p).text);
  const [start, setStart] = useState(0);

  useEffect(() => {
    if (notes.length <= MAX_VISIBLE) { setStart(0); return undefined; }
    const id = setInterval(() => setStart((s) => (s + MAX_VISIBLE) % notes.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [notes.length]);

  if (visibility?.pinnedNotes === false || !notes.length) return null;
  const visible = [];
  for (let i = 0; i < Math.min(MAX_VISIBLE, notes.length); i++) visible.push(notes[(start + i) % notes.length]);

  return (
    <div style={{ width: '100%', ...style }}>
      {visible.map((n) => {
        const t = noteText(n);
        return (
          <div
            key={`${n.id}-${start}`}
            className={`tt-clamp3 ${notes.length > MAX_VISIBLE ? 'tt-fadein' : ''}`}
            dir={textDir(t.text, t.he ? 'rtl' : 'ltr')}
            style={{
              background: 'var(--raised)', borderRadius: 24, padding: '18px 24px', width: '100%', marginBottom: 14,
              textAlign: align, whiteSpace: 'pre-line',
              fontFamily: t.he ? F.he : F.en,
              fontSize: t.he ? he(28) : 25, lineHeight: t.he ? 1.25 : 1.3, fontWeight: 500,
            }}
          >
            {bidiNodes(t.text)}
          </div>
        );
      })}
    </div>
  );
}
