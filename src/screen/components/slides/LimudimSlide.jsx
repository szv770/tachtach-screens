import React, { useRef, useState, useEffect } from 'react';

import { fonts } from '../../styles/tokens.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripMishnehPrefix(text, isHebrew) {
  if (!text) return '';
  if (isHebrew) return text.replace(/^משנה\s+תורה[,،]?\s*/u, '').trim();
  return text.replace(/^Mishneh Torah[,]?\s*/i, '').trim();
}

function stripTrailingChapterRef(heRef) {
  return heRef
    .replace(/\s+[\u05D0-\u05EA][\u05F3''][–\-]?[\u05D0-\u05EA]?[\u05F3'']?\s*$/u, '')
    .replace(/\s+פרק\s+[\u05D0-\u05EA][\u05F3'']?\s*$/u, '')
    .trim();
}

function stripWithRashi(text) {
  if (!text) return text;
  return text
    .replace(/\s+with Rashi$/i, '')
    .replace(/\s+עם\s+פירוש\s+רש[״"]י\s*$/u, '')
    .replace(/\s+עם\s+רש[״"]י\s*$/u, '')
    .trim();
}

function renderLines(text) {
  if (typeof text !== 'string') return text;
  const lines = text.split('\n');
  if (lines.length === 1) return text;
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ));
}

// ── Rambam group parsers ──────────────────────────────────────────────────────

/**
 * Parse English Rambam description into per-tractate groups.
 * Input:  "Sotah - Chapter 4, Issurei Biah - Chapter 1, Issurei Biah - Chapter 2"
 * Output: [
 *   { type: 'chapter', tractate: 'Sotah', chapters: [4] },
 *   { type: 'chapter', tractate: 'Issurei Biah', chapters: [1, 2] },
 * ]
 * Non-chapter text (introduction, counting of mitzvos) → { type: 'plain', label }
 */
function parseRambamGroups(text) {
  if (!text) return [];
  const groups = [];
  for (const seg of text.split(/,\s*/)) {
    const t = seg.trim();
    // "Tractate - Chapter N" or "Tractate - Chapters N-M"
    const m = t.match(/^(.+?)\s*(?:-\s*)?[Cc]hapters?\s+(\d+)(?:-(\d+))?\s*$/);
    if (m) {
      const tractate = m[1].trim();
      const from = parseInt(m[2]);
      const to = m[3] ? parseInt(m[3]) : from;
      const chapters = [];
      for (let i = from; i <= to; i++) chapters.push(i);
      const last = groups[groups.length - 1];
      if (last?.type === 'chapter' && last.tractate === tractate) {
        last.chapters.push(...chapters);
      } else {
        groups.push({ type: 'chapter', tractate, chapters });
      }
    } else if (t) {
      groups.push({ type: 'plain', label: t });
    }
  }
  return groups;
}

/**
 * Parse Hebrew Rambam description into per-tractate groups.
 * Input:  "סוטה - פרק ד, איסורי ביאה - פרק א, איסורי ביאה - פרק ב"
 * Output: [
 *   { type: 'chapter', tractate: 'סוטה', letters: ['ד׳'] },
 *   { type: 'chapter', tractate: 'איסורי ביאה', letters: ['א׳', 'ב׳'] },
 * ]
 */
function parseRambamGroupsHe(text) {
  if (!text) return [];
  const groups = [];
  for (const seg of text.split(/,\s*/)) {
    const t = seg.trim();
    // "X - פרק ד" or "X פרק טו" — one or more Hebrew letters, optional geresh/gershayim
    const m = t.match(/^(.+?)\s*(?:-\s*)?פרק\s+([\u05D0-\u05EA][\u05D0-\u05EA\u05F3\u05F4"'\u0027]*)\s*$/u);
    if (m) {
      const tractate = m[1].trim();
      // Strip any geresh/gershayim punctuation, then add normalized geresh at end
      const raw = m[2].replace(/[\u05F3\u05F4"'\u0027]/g, '');
      const letter = raw + '\u05F3'; // normalize to geresh ׳
      const last = groups[groups.length - 1];
      if (last?.type === 'chapter' && last.tractate === tractate) {
        last.letters.push(letter);
      } else {
        groups.push({ type: 'chapter', tractate, letters: [letter] });
      }
    } else if (t) {
      groups.push({ type: 'plain', label: t });
    }
  }
  return groups;
}

// ── Chips ─────────────────────────────────────────────────────────────────────

function ChapterChip({ chapter, tokens, size }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      background: tokens.goldBg,
      border: `1px solid ${tokens.goldBd}`,
      borderRadius: '3px',
      fontFamily: fonts.hebrewPrimary,
      fontSize: size ? `${size}px` : '17px',
      fontWeight: 600,
      color: tokens.gold,
      margin: '0 3px',
      verticalAlign: 'middle',
    }}>
      {chapter}
    </span>
  );
}

function ArabicChip({ num, tokens, size }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      background: tokens.goldBg,
      border: `1px solid ${tokens.goldBd}`,
      borderRadius: '3px',
      fontFamily: fonts.englishBody,
      fontSize: size ? `${size}px` : '17px',
      fontWeight: 600,
      color: tokens.gold,
      margin: '0 3px',
      verticalAlign: 'middle',
    }}>
      {num}
    </span>
  );
}

// ── Hebrew study text parser (Tehillim, Tanya, Chumash chips) ─────────────────

/**
 * Try to extract chapter/perek references from Hebrew study text.
 * Returns { prefix, chapters } or null if no chapter pattern found.
 * Handles:
 *   "פרקים פ״ח-פ״ט"        → { prefix: null, chapters: ['פ״ח','פ״ט'] }
 *   "פרק מ"ט"               → { prefix: null, chapters: ['מ"ט'] }
 *   "ספר של בינונים, פרק מ״ט" → { prefix: 'ספר של בינונים', chapters: ['מ״ט'] }
 *   "פרק פ״ח, פרק פ״ט"     → { prefix: null, chapters: ['פ״ח','פ״ט'] }
 */
const HE_NUM_RE = '[\u05D0-\u05EA][\u05D0-\u05EA\u05F3\u05F4"\']*';
const PEREK_RE = new RegExp(
  `^(.*?)\\s*פרקים?\\s+(${HE_NUM_RE})(?:\\s*[-\u2013]\\s*(${HE_NUM_RE}))?\\s*$`, 'u'
);

function parseHebrewChapters(text) {
  if (!text) return null;

  // Range: [prefix] פרקים X-Y  or  [prefix] פרק X-Y
  const rm = text.match(PEREK_RE);
  if (rm) {
    const prefix = rm[1].replace(/[,،\s]+$/u, '').trim() || null;
    return { prefix, chapters: rm[3] ? [rm[2], rm[3]] : [rm[2]] };
  }

  // Comma-separated: פרק X, פרק Y
  const segs = text.split(/,\s*/);
  const chapters = [];
  let prefix = null;
  for (const seg of segs) {
    const m = seg.trim().match(new RegExp(`^(.*?)\\s*פרקים?\\s+(${HE_NUM_RE})\\s*$`, 'u'));
    if (m) {
      const pre = m[1].replace(/[,،\s]+$/u, '').trim();
      if (pre && !prefix) prefix = pre;
      chapters.push(m[2]);
    }
  }
  if (chapters.length > 0) return { prefix, chapters };

  return null;
}

/**
 * Smart renderer for Hebrew study text:
 *   - Chumash: splits "(sefer verse)" onto its own line
 *   - Tehillim / Tanya: extracts perek numbers and renders as chips
 */
function HebrewStudyBlock({ text, labelHe, size, tokens }) {
  if (!text) return null;

  // Chumash: "בהר-בחוקותי, שלישי (ויקרא כ״ה:כ״ט-כ״ה:ל״ח)"
  // → "בהר-בחוקותי, שלישי\nויקרא כ״ה:כ״ט-כ״ה:ל״ח"
  if (labelHe === 'חומש') {
    const reformatted = text.replace(/\s*\(([^)]+)\)\s*$/, '\n$1');
    return <>{renderLines(reformatted)}</>;
  }

  const parsed = parseHebrewChapters(text);
  if (!parsed) return <>{renderLines(text)}</>;

  return (
    <>
      {parsed.prefix && <div style={{ marginBottom: '4px' }}>{parsed.prefix}</div>}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap', justifyContent: 'center', direction: 'rtl' }}>
        {parsed.chapters.map((ch, i) => (
          <ChapterChip key={i} chapter={ch} tokens={tokens} size={size} />
        ))}
      </div>
    </>
  );
}

// ── SectionDivider ────────────────────────────────────────────────────────────

function SectionDivider({ tokens }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '7px 0' }}>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
      <span style={{ color: tokens.gold, fontSize: '10px', letterSpacing: '0.3em' }}>{'\u2726 \u25C7 \u2726'}</span>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
    </div>
  );
}

// ── VortCardLabel — decorative centered label for single-language card mode ───

function VortCardLabel({ label, isHebrew, tokens, compact, headScale = 1.0 }) {
  if (isHebrew) {
    const lblSize = Math.round((compact ? 13 : 15) * headScale);
    return (
      <div style={{
        direction: 'rtl',
        textAlign: 'center',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}>
        <span style={{ color: tokens.gold, fontSize: '11px', opacity: 0.7 }}>✦</span>
        <span style={{
          fontFamily: fonts.hebrewDisplay,
          fontSize: `${lblSize}px`,
          fontWeight: 700,
          color: tokens.gold,
          letterSpacing: '0.06em',
        }}>
          {label}
        </span>
        <span style={{ color: tokens.gold, fontSize: '11px', opacity: 0.7 }}>✦</span>
      </div>
    );
  }
  // English
  const lblSize = Math.round((compact ? 11 : 13) * headScale);
  return (
    <div style={{
      direction: 'ltr',
      textAlign: 'center',
      marginBottom: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
    }}>
      <span style={{ color: tokens.gold, fontSize: '10px', opacity: 0.6 }}>—</span>
      <span style={{
        fontFamily: fonts.englishDisplay,
        fontSize: `${lblSize}px`,
        fontWeight: 600,
        color: tokens.gold,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
      }}>
        {label}
      </span>
      <span style={{ color: tokens.gold, fontSize: '10px', opacity: 0.6 }}>—</span>
    </div>
  );
}

// ── StudyRow ──────────────────────────────────────────────────────────────────

function StudyRow({ labelHe, labelEn, value, valueHe, tokens, lang, compact = false, heScale = 1.0, headScale = 1.0, index = 0, excerptFirst, excerptLast }) {
  const hasHe = Boolean(valueHe);
  const hasEn = Boolean(value);
  if (!hasHe && !hasEn) return null;

  const displayHe = stripWithRashi(hasHe ? valueHe : '');
  const displayEn = stripWithRashi(value || '');
  const mb = compact ? '6px' : '8px';

  const hasExcerpt = excerptFirst || excerptLast;
  const excerptIsHe = /[\u05D0-\u05EA]/.test(excerptFirst || excerptLast || '');

  const cardStyle = {
    background: tokens.goldBg,
    borderRadius: '10px',
    borderTop: `2px solid ${tokens.gold}`,
    borderRight: `1px solid ${tokens.goldBd}`,
    borderBottom: `1px solid ${tokens.goldBd}`,
    borderLeft: `1px solid ${tokens.goldBd}`,
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
    padding: compact ? '6px 14px' : '8px 16px',
    boxSizing: 'border-box',
  };

  const excerptSize = compact ? '15px' : '19px';
  const excerptEllipsisSize = compact ? '13px' : '16px';

  if (lang === 'hebrew') {
    const heSize = Math.round((compact ? 22 : 27) * heScale);
    return (
      <div style={{ ...cardStyle, marginBottom: mb, direction: 'rtl' }}>
        <VortCardLabel label={labelHe} isHebrew tokens={tokens} compact={compact} headScale={headScale} />
        <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: `${heSize}px`, fontWeight: 400, color: tokens.text, lineHeight: 1.45, direction: 'rtl', textAlign: 'center' }}>
          <HebrewStudyBlock text={displayHe || displayEn} labelHe={labelHe} size={heSize} tokens={tokens} />
        </div>
        {hasExcerpt && (
          <div style={{ marginTop: '6px', textAlign: 'center', direction: excerptIsHe ? 'rtl' : 'ltr' }}>
            <span style={{ fontFamily: excerptIsHe ? fonts.hebrewPrimary : fonts.englishBody, fontSize: excerptSize, color: tokens.dim, lineHeight: 1.6 }}>{excerptFirst}</span>
            {excerptFirst && excerptLast && <span style={{ color: tokens.gold, margin: '0 10px', fontSize: excerptEllipsisSize }}>{'\u2026'}</span>}
            <span style={{ fontFamily: excerptIsHe ? fonts.hebrewPrimary : fonts.englishBody, fontSize: excerptSize, color: tokens.dim, lineHeight: 1.6 }}>{excerptLast}</span>
          </div>
        )}
      </div>
    );
  }

  if (lang === 'english') {
    const enSize = compact ? 22 : 26;
    return (
      <div style={{ ...cardStyle, marginBottom: mb, direction: 'ltr' }}>
        <VortCardLabel label={labelEn} isHebrew={false} tokens={tokens} compact={compact} headScale={headScale} />
        <div style={{ fontFamily: fonts.englishBody, fontSize: `${enSize}px`, fontWeight: 400, color: tokens.text, lineHeight: 1.4, direction: 'ltr', textAlign: 'center' }}>
          {renderLines(displayEn || displayHe)}
        </div>
        {hasExcerpt && (
          <div style={{ marginTop: '6px', textAlign: 'center', direction: excerptIsHe ? 'rtl' : 'ltr' }}>
            <span style={{ fontFamily: excerptIsHe ? fonts.hebrewPrimary : fonts.englishBody, fontSize: excerptSize, color: tokens.dim, lineHeight: 1.6 }}>{excerptFirst}</span>
            {excerptFirst && excerptLast && <span style={{ color: tokens.gold, margin: '0 10px', fontSize: excerptEllipsisSize }}>{'\u2026'}</span>}
            <span style={{ fontFamily: excerptIsHe ? fonts.hebrewPrimary : fonts.englishBody, fontSize: excerptSize, color: tokens.dim, lineHeight: 1.6 }}>{excerptLast}</span>
          </div>
        )}
      </div>
    );
  }

  // Both mode — clean two-column layout
  const heBothSize = Math.round((compact ? 22 : 26) * heScale);
  const enBothSize = compact ? '18px' : '21px';
  const colLblSize = `${Math.round((compact ? 13 : 15) * headScale)}px`;

  return (
    <div style={{ marginBottom: mb }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* English column — LEFT */}
        {hasEn && (
          <div style={{ flex: 1, direction: 'ltr', textAlign: 'left', paddingRight: hasHe ? '16px' : 0 }}>
            <div style={{ fontFamily: fonts.englishDisplay, fontSize: colLblSize, fontWeight: 700, color: tokens.gold, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '3px', opacity: 0.85, textAlign: 'left' }}>
              {labelEn}
            </div>
            <div style={{ fontFamily: fonts.englishBody, fontSize: enBothSize, fontWeight: 400, color: tokens.text, lineHeight: 1.5, textAlign: 'left' }}>
              {renderLines(displayEn)}
            </div>
          </div>
        )}
        {/* Vertical divider */}
        {hasHe && hasEn && (
          <div style={{ width: '1px', flexShrink: 0, alignSelf: 'stretch', background: tokens.goldBd || 'rgba(212,168,75,0.2)', margin: '2px 0' }} />
        )}
        {/* Hebrew column — RIGHT */}
        {hasHe && (
          <div style={{ flex: 1, direction: 'rtl', textAlign: 'right', paddingLeft: hasEn ? '16px' : 0 }}>
            <div style={{ fontFamily: fonts.hebrewDisplay, fontSize: colLblSize, fontWeight: 700, color: tokens.gold, letterSpacing: '0.04em', marginBottom: '3px', opacity: 0.85, textAlign: 'right' }}>
              {labelHe}
            </div>
            <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: `${heBothSize}px`, fontWeight: 400, color: tokens.text, lineHeight: 1.5, textAlign: 'right', direction: 'rtl' }}>
              <HebrewStudyBlock text={displayHe} labelHe={labelHe} size={heBothSize} tokens={tokens} />
            </div>
          </div>
        )}
      </div>
      {hasExcerpt && (
        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <span style={{ fontFamily: excerptIsHe ? fonts.hebrewPrimary : fonts.englishBody, fontSize: compact ? '16px' : '19px', color: tokens.dim, lineHeight: 1.6 }}>
            {excerptFirst}
          </span>
          {excerptFirst && excerptLast && <span style={{ color: tokens.gold, margin: '0 12px', fontSize: '15px' }}>{'\u2026'}</span>}
          <span style={{ fontFamily: excerptIsHe ? fonts.hebrewPrimary : fonts.englishBody, fontSize: compact ? '16px' : '19px', color: tokens.dim, lineHeight: 1.6 }}>
            {excerptLast}
          </span>
        </div>
      )}
    </div>
  );
}

// ── RambamRow ─────────────────────────────────────────────────────────────────

function RambamRow({ labelHe, labelEn, data, tokens, lang, compact = false, heScale = 1.0, headScale = 1.0 }) {
  if (!data) return null;

  const heText = data.displayHe || '';
  const enText = data.displayEn || '';
  const mb = compact ? '6px' : '8px';

  const enGroups = parseRambamGroups(enText);
  const heGroups = parseRambamGroupsHe(heText);

  const cardStyle = {
    background: tokens.goldBg,
    borderRadius: '10px',
    borderTop: `2px solid ${tokens.gold}`,
    borderRight: `1px solid ${tokens.goldBd}`,
    borderBottom: `1px solid ${tokens.goldBd}`,
    borderLeft: `1px solid ${tokens.goldBd}`,
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
    padding: compact ? '6px 14px' : '8px 16px',
    boxSizing: 'border-box',
    marginBottom: mb,
  };

  // Inline group renderer — all groups on ONE line, chips right after their tractate
  function InlineGroups({ groups, isHebrew, size, chipComponent: Chip, chipProp }) {
    if (!groups.length) return null;
    return (
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        direction: isHebrew ? 'rtl' : 'ltr',
      }}>
        {groups.map((g, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span style={{ color: tokens.gold, opacity: 0.45, fontSize: `${Math.round(size * 0.8)}px`, userSelect: 'none' }}>·</span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              {g.type === 'chapter' ? (
                <>
                  <span style={{
                    fontFamily: isHebrew ? fonts.hebrewPrimary : fonts.englishBody,
                    fontSize: `${size}px`,
                    fontWeight: 400,
                    color: tokens.text,
                    lineHeight: 1.4,
                  }}>
                    {g.tractate}
                  </span>
                  {(isHebrew ? g.letters : g.chapters).map((v, j) =>
                    isHebrew
                      ? <ChapterChip key={j} chapter={v} tokens={tokens} size={size} />
                      : <ArabicChip key={j} num={v} tokens={tokens} size={size} />
                  )}
                </>
              ) : (
                <span style={{
                  fontFamily: isHebrew ? fonts.hebrewPrimary : fonts.englishBody,
                  fontSize: `${size}px`,
                  fontWeight: 400,
                  color: tokens.text,
                  lineHeight: 1.4,
                }}>
                  {g.label}
                </span>
              )}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (lang === 'hebrew') {
    const heSize = Math.round((compact ? 22 : 27) * heScale);
    return (
      <div style={{ ...cardStyle, direction: 'rtl' }}>
        <VortCardLabel label={labelHe} isHebrew tokens={tokens} compact={compact} headScale={headScale} />
        {heGroups.length > 0
          ? <InlineGroups groups={heGroups} isHebrew size={heSize} />
          : <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: `${heSize}px`, color: tokens.text, textAlign: 'center', display: 'block' }}>{heText}</span>
        }
      </div>
    );
  }

  if (lang === 'english') {
    const enSize = compact ? 22 : 26;
    return (
      <div style={{ ...cardStyle, direction: 'ltr' }}>
        <VortCardLabel label={labelEn} isHebrew={false} tokens={tokens} compact={compact} headScale={headScale} />
        {enGroups.length > 0
          ? <InlineGroups groups={enGroups} isHebrew={false} size={enSize} />
          : <span style={{ fontFamily: fonts.englishBody, fontSize: `${enSize}px`, color: tokens.text, textAlign: 'center', display: 'block' }}>{enText}</span>
        }
      </div>
    );
  }

  // Both mode — two-column, each column gets its own inline groups
  const heBothSize = Math.round((compact ? 22 : 26) * heScale);
  const enBothSize = compact ? 18 : 21;
  const colLblSize = `${Math.round((compact ? 13 : 15) * headScale)}px`;

  return (
    <div style={{ marginBottom: mb }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* English — LEFT */}
        <div style={{ flex: 1, direction: 'ltr', textAlign: 'left', paddingRight: '12px' }}>
          <div style={{ fontFamily: fonts.englishDisplay, fontSize: colLblSize, fontWeight: 700, color: tokens.gold, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '4px', opacity: 0.85 }}>
            {labelEn}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px' }}>
            {enGroups.map((g, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: tokens.gold, opacity: 0.4, fontSize: `${Math.round(enBothSize * 0.8)}px` }}>·</span>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
                  {g.type === 'chapter' ? <>
                    <span style={{ fontFamily: fonts.englishBody, fontSize: `${enBothSize}px`, color: tokens.text }}>{g.tractate}</span>
                    {g.chapters.map((ch, j) => <ArabicChip key={j} num={ch} tokens={tokens} size={enBothSize} />)}
                  </> : (
                    <span style={{ fontFamily: fonts.englishBody, fontSize: `${enBothSize}px`, color: tokens.text }}>{g.label}</span>
                  )}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', flexShrink: 0, alignSelf: 'stretch', background: tokens.goldBd || 'rgba(212,168,75,0.2)', margin: '2px 0' }} />

        {/* Hebrew — RIGHT */}
        <div style={{ flex: 1, direction: 'rtl', textAlign: 'right', paddingLeft: '12px' }}>
          <div style={{ fontFamily: fonts.hebrewDisplay, fontSize: colLblSize, fontWeight: 700, color: tokens.gold, letterSpacing: '0.04em', marginBottom: '4px', opacity: 0.85 }}>
            {labelHe}
          </div>
          <div style={{ direction: 'rtl', textAlign: 'right', lineHeight: 1.6 }}>
            {heGroups.map((g, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: tokens.gold, opacity: 0.4, fontSize: `${Math.round(heBothSize * 0.8)}px`, margin: '0 4px' }}>·</span>}
                {g.type === 'chapter' ? <>
                  <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: `${heBothSize}px`, color: tokens.text }}>{g.tractate}</span>
                  {g.letters.map((l, j) => <ChapterChip key={j} chapter={l} tokens={tokens} size={heBothSize} />)}
                </> : (
                  <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: `${heBothSize}px`, color: tokens.text }}>{g.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TanyaExcerpt ──────────────────────────────────────────────────────────────

function TanyaExcerpt({ firstWords, lastWords, tokens }) {
  if (!firstWords && !lastWords) return null;
  const isHebrew = /[\u05D0-\u05EA]/.test(firstWords || lastWords || '');
  return (
    <div style={{
      marginTop: '-4px',
      marginBottom: '14px',
      padding: '8px 18px',
      background: tokens.goldBg || 'rgba(212,168,75,0.06)',
      borderRadius: '8px',
      border: `1px solid ${tokens.goldBd || 'rgba(212,168,75,0.15)'}`,
      textAlign: 'center',
      direction: isHebrew ? 'rtl' : 'ltr',
    }}>
      {firstWords && (
        <span style={{ fontFamily: isHebrew ? fonts.hebrewPrimary : fonts.englishBody, fontSize: '18px', color: tokens.dim, lineHeight: 1.7 }}>
          {firstWords}
        </span>
      )}
      {firstWords && lastWords && (
        <span style={{ color: tokens.gold, margin: '0 12px', fontSize: '15px' }}>{'\u2026'}</span>
      )}
      {lastWords && (
        <span style={{ fontFamily: isHebrew ? fonts.hebrewPrimary : fonts.englishBody, fontSize: '18px', color: tokens.dim, lineHeight: 1.7 }}>
          {lastWords}
        </span>
      )}
    </div>
  );
}

// ── LimudimSlide ──────────────────────────────────────────────────────────────

export default function LimudimSlide({ cache, tokens, settings, portrait = false, portraitLayout = 'compact' }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1.0);

  useEffect(() => {
    if (!outerRef.current || !innerRef.current) return;
    const measure = () => {
      const avail = outerRef.current.getBoundingClientRect().height;
      const natural = innerRef.current.scrollHeight;
      if (avail > 0 && natural > 0) {
        // Scale to fill available space, cap at 2.0×
        setScale(Math.min(2.0, Math.max(0.6, (avail - 16) / natural)));
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(outerRef.current);
    ro.observe(innerRef.current);
    measure();
    return () => ro.disconnect();
  }, []);

  const limudim = cache?.limudim || {};
  const rambam1 = cache?.rambam1;
  const rambam3 = cache?.rambam3;
  const seferHamitzvot = cache?.seferHamitzvot;
  const lang = settings?.limudimLang || 'both';
  const compact = portrait && portraitLayout !== 'scroll';
  const heScale = settings?.hebrewFontScale ?? 1.0;
  const headScale = settings?.hebrewHeadingScale ?? settings?.hebrewFontScale ?? 1.0;

  const items = settings?.limudimItems || {};
  const showChumash   = items.chumash    !== false;
  const showTehillim  = items.tehillim   !== false;
  const showTanya     = items.tanya      !== false;
  const showRambam1   = items.rambam1    !== false;
  const showRambam3   = items.rambam3    !== false;
  const showSefer     = items.sefer      !== false;

  const today = new Date().toISOString().slice(0, 10);
  const isStale = cache?.fetchedDate && cache.fetchedDate !== today;

  const hasChitas = (showChumash && (limudim.chumash || limudim.chumashHe)) ||
                    (showTehillim && (limudim.tehillim || limudim.tehillimHe)) ||
                    (showTanya && (limudim.tanya || limudim.tanyaHe));
  const hasSeferData = Boolean(seferHamitzvot?.displayEn || seferHamitzvot?.displayHe);
  const hasSefer = showSefer && hasSeferData;
  const hasRambam = (showRambam1 && rambam1) || (showRambam3 && rambam3) || hasSefer;

  return (
    <div ref={outerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <div
      ref={innerRef}
      style={{
        width: '100%',
        maxWidth: '920px',
        padding: '4px 12px 8px',
        boxSizing: 'border-box',
        ...(scale < 0.99 ? { transform: `scale(${scale})`, transformOrigin: 'center center' } : {}),
      }}
    >
      {isStale && (
        <div style={{ padding: '4px 12px', marginBottom: '12px', background: 'rgba(184,128,58,0.1)', border: '1px solid rgba(184,128,58,0.25)', borderRadius: '3px', fontFamily: fonts.englishBody, fontSize: '11px', color: tokens.copper || tokens.gold, textAlign: 'center' }}>
          Data from {cache.fetchedDate} — may need refresh
        </div>
      )}

      {hasChitas && (
        <>
          {showChumash && <StudyRow labelHe="חומש" labelEn="Chumash" value={limudim.chumash} valueHe={limudim.chumashHe} tokens={tokens} lang={lang} compact={compact} heScale={heScale} headScale={headScale} index={0} />}
          {showTehillim && <StudyRow labelHe="תהילים" labelEn="Tehillim" value={limudim.tehillim} valueHe={limudim.tehillimHe} tokens={tokens} lang={lang} compact={compact} heScale={heScale} headScale={headScale} index={1} />}
          {showTanya && <StudyRow labelHe="תניא" labelEn="Tanya" value={limudim.tanya} valueHe={limudim.tanyaHe} tokens={tokens} lang={lang} compact={compact} heScale={heScale} headScale={headScale} index={2} excerptFirst={limudim.tanyaFirstWords} excerptLast={limudim.tanyaLastWords} />}
        </>
      )}

      {hasChitas && hasRambam && <SectionDivider tokens={tokens} />}

      {hasRambam && (
        <>
          {showRambam1 && <RambamRow labelHe="רמב״ם פרק אחד" labelEn="Rambam 1 Chapter" data={rambam1} tokens={tokens} lang={lang} compact={compact} heScale={heScale} headScale={headScale} />}
          {showRambam3 && <RambamRow labelHe="רמב״ם ג׳ פרקים" labelEn="Rambam 3 Chapters" data={rambam3} tokens={tokens} lang={lang} compact={compact} heScale={heScale} headScale={headScale} />}
          {hasSefer && (
            <StudyRow labelHe="ספר המצות" labelEn="Sefer HaMitzvot" value={seferHamitzvot.displayEn} valueHe={seferHamitzvot.displayHe} tokens={tokens} lang={lang} compact={compact} heScale={heScale} headScale={headScale} index={5} />
          )}
        </>
      )}

    </div>
    </div>
  );
}
