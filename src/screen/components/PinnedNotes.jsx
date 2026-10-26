import React, { useEffect, useState } from 'react';
import { F, he, bidiNodes } from '../design/ui.jsx';
import { isHebrew } from '../design/time.js';
import { textDir } from '../../shared/bidi.js';
import { SIDE_NOTES_DEFAULT_MAX, SIDE_NOTES_DEFAULT_SECONDS } from '../../shared/railNotes.js';

/**
 * Rail side notes (announcements shown as "Side note"), R2 §5.3: each is a
 * raised card holding English text (primary) with an optional Hebrew line beneath, each clamped to
 * 3 lines. At most 2 are visible; more rotate in place every 8 s (a one-shot
 * fade, no looping animation).
 */
// Defaults; the admin can change both (settings.rail.sideNotesMax / sideNotesSeconds, src/shared/railNotes.js).

/**
 * The lines of one note, English first (the primary language), then Hebrew as an extra line when
 * the note has both. A note with only one language shows just that one.
 */
export function noteLines(n) {
  const h = String(n.textHe || '').trim();
  const e = String(n.textEn || n.text || '').trim();
  const out = [];
  if (e) out.push({ text: e, he: isHebrew(e) });
  if (h) out.push({ text: h, he: true });
  return out;
}
export const noteText = (n) => noteLines(n)[0] || { text: '', he: false };

export default function PinnedNotes({ pinned, visibility, align = 'left', style, max = SIDE_NOTES_DEFAULT_MAX, seconds = SIDE_NOTES_DEFAULT_SECONDS }) {
  const MAX_VISIBLE = max;
  const ROTATE_MS = seconds * 1000;
  const notes = (pinned || []).filter((p) => p.displayMode !== 'slide' && noteLines(p).length);
  const [start, setStart] = useState(0);

  useEffect(() => {
    if (notes.length <= MAX_VISIBLE) { setStart(0); return undefined; }
    const id = setInterval(() => setStart((s) => (s + MAX_VISIBLE) % notes.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [notes.length, MAX_VISIBLE, ROTATE_MS]);

  if (visibility?.pinnedNotes === false || !notes.length) return null;
  const visible = [];
  for (let i = 0; i < Math.min(MAX_VISIBLE, notes.length); i++) visible.push(notes[(start + i) % notes.length]);

  return (
    <div style={{ width: '100%', ...style }}>
      {visible.map((n) => {
        const lines = noteLines(n);
        return (
          <div
            key={`${n.id}-${start}`}
            className={notes.length > MAX_VISIBLE ? 'tt-fadein' : undefined}
            style={{
              background: 'var(--raised)', borderRadius: 24, padding: '18px 24px', width: '100%', marginBottom: 14,
              textAlign: align, whiteSpace: 'pre-line',
            }}
          >
            {lines.map((t, i) => (
              <div
                key={i}
                className="tt-clamp3"
                dir={textDir(t.text, t.he ? 'rtl' : 'ltr')}
                style={{
                  fontFamily: t.he ? F.he : F.en,
                  fontSize: t.he ? he(i === 0 ? 28 : 26) : 25, lineHeight: t.he ? 1.25 : 1.3, fontWeight: 500,
                  marginTop: i === 0 ? 0 : 8, opacity: i === 0 ? 1 : 0.8,
                }}
              >
                {bidiNodes(t.text)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
