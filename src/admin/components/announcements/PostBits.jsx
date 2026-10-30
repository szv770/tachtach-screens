import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { KIND_LABEL, kindOf, isLetter } from '../../../shared/postList.js';

const TONE = {
  live: { fg: colors.success, bg: colors.successBg },
  scheduled: { fg: colors.accent, bg: colors.accentSoft },
  paused: { fg: colors.warn, bg: colors.warnSoft },
  draft: { fg: colors.dim, bg: colors.sunken },
  ended: { fg: colors.muted, bg: colors.sunken },
};

/** The one status chip every post wears (Live now / Scheduled for ... / Paused / Draft / Ended ...). */
export function PostStatusChip({ status, testid = 'post-status' }) {
  const t = TONE[status.key] || TONE.draft;
  return (
    <span data-testid={testid} data-status={status.key} style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px', borderRadius: '999px', background: t.bg, color: t.fg,
      fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />
      {status.label}
    </span>
  );
}

/** 'Message slide' / 'Banner' / ... (+ 'Letter' when it is one). */
export function KindBadge({ item }) {
  const k = kindOf(item);
  return (
    <span style={{ padding: '1px 8px', borderRadius: '999px', border: `1px solid ${colors.line}`, color: colors.dim, fontFamily: adminFonts.englishBody, fontSize: '12px', whiteSpace: 'nowrap' }}>
      {isLetter(item) ? `${KIND_LABEL[k]} · letter` : KIND_LABEL[k]}
    </span>
  );
}
