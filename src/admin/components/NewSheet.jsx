import React from 'react';
import Sheet from './ui/Sheet.jsx';
import Icon from './ui/Icon.jsx';
import { colors, adminFonts } from '../styles/admin-tokens.js';

// What the + button can start. `kind` is handled by the caller (App.jsx).
export const NEW_KINDS = [
  { kind: 'quick', icon: 'bolt', title: 'Quick message', text: 'Two taps: a few big words on the screen right now.' },
  { kind: 'slide', icon: 'message', title: 'Announcement', text: 'A slide that takes its turn with the others.' },
  { kind: 'banner', icon: 'banner', title: 'Banner', text: 'A strip along the bottom. Never pauses the slides.' },
  { kind: 'takeover', icon: 'takeover', title: 'Takeover', text: 'Covers the whole screen and pauses everything.' },
];

/** The "+" bottom sheet: a sideways row of the kinds of thing you can post. */
export default function NewSheet({ open, onClose, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title="New" label="New post" zIndex={1200}>
      <div data-testid="new-kinds" style={{ display: 'flex', gap: '10px', overflowX: 'auto', margin: '8px -16px 10px', padding: '2px 16px 6px', scrollbarWidth: 'none' }}>
        {NEW_KINDS.map((k) => (
          <button key={k.kind} type="button" data-kind={k.kind} onClick={() => onPick(k.kind)} style={{
            flex: '0 0 auto', width: '104px', padding: '14px 8px', borderRadius: 'var(--r-md)', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontFamily: adminFonts.englishBody,
            background: k.kind === 'quick' ? colors.accentSoft : colors.surface, color: k.kind === 'quick' ? colors.accent : colors.text,
            border: `1px solid ${k.kind === 'quick' ? colors.accent : colors.line}`, fontWeight: 700, fontSize: '13px',
          }}>
            <Icon name={k.icon} size={26} />
            {k.title}
          </button>
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: '8px', fontFamily: adminFonts.englishBody, fontSize: '13.5px', color: colors.dim, lineHeight: 1.4 }}>
        {NEW_KINDS.map((k) => (
          <li key={k.kind}><strong style={{ color: colors.text }}>{k.title}</strong> &middot; {k.text}</li>
        ))}
      </ul>
    </Sheet>
  );
}
