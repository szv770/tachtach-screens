import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';

const TONES = {
  ok: { bg: colors.successBg, fg: colors.success, word: 'OK' },
  warn: { bg: colors.warnSoft, fg: colors.warn, word: 'Watch' },
  bad: { bg: colors.dangerBg, fg: colors.danger, word: 'Fix' },
  info: { bg: colors.sunken, fg: colors.dim, word: 'Note' },
  live: { bg: colors.successBg, fg: colors.success, word: 'Live' },
  off: { bg: colors.dangerBg, fg: colors.danger, word: 'Offline' },
};

/** Small pill with a dot and a word (never colour alone). `label` overrides the word. */
export default function StatusChip({ tone = 'info', label, style }) {
  const t = TONES[tone] || TONES.info;
  return (
    <span data-tone={tone} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '24px', padding: '0 10px', borderRadius: '999px',
      background: t.bg, color: t.fg, fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', ...style,
    }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: t.fg }} />
      {label || t.word}
    </span>
  );
}
