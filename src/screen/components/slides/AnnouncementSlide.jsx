import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';
import FitText, { useFitSize } from '../FitText.jsx';
import TextSlide from './TextSlide.jsx';
import StyledSlide from './StyledSlide.jsx';
import PinnedSlide from './PinnedSlide.jsx';
import BoardDisplay from './BoardSlide.jsx';
import Takeover, { TakeoverCard } from '../messages/Takeover.jsx';
import { styledTokens } from '../../styles/announcementStyles.js';
import { layoutOf, to12h } from '../../../shared/announcements.js';
import { toLegacyTextSlide, toLegacyBoard, toLegacyTakeover } from '../../lib/announcementView.js';

/*
 * Announcement renderers. Layouts (look.layout):
 *   bigwords  — headline/body auto-sized to fill the area (default for new)
 *   event     — title + day/time "tiles" + place
 *   list      — heading + up to 8 items
 *   quicktime — "Mincha 1:45": name, a big distinct time, optional place
 *   classic   — the pre-announcements renderers (TextSlide / StyledSlide /
 *               board / pinned), used for migrated items so they look the same
 * Visuals use the current tokens; the Phase 4 redesign restyles these.
 */

const isHebrew = (s) => /[֐-׿]/.test(String(s || ''));
const has = (s) => !!String(s ?? '').trim();

function Divider({ tokens, width = '40%' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width, margin: '0 auto', flexShrink: 0 }}>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
      <span style={{ color: tokens.gold, fontSize: '12px' }}>{'✦'}</span>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
    </div>
  );
}

function Eyebrow({ text, tokens, size = 18 }) {
  if (!has(text)) return null;
  return (
    <div style={{
      fontFamily: isHebrew(text) ? fonts.hebrewPrimary : fonts.englishBody,
      fontSize: `${size}px`, color: tokens.gold, letterSpacing: '0.08em',
      textAlign: 'center', flexShrink: 0, unicodeBidi: 'plaintext',
    }}>{text}</div>
  );
}

// ── Big words ───────────────────────────────────────────────────────────────

export function BigWords({ item, tokens, scale = 1 }) {
  const c = item.content || {};
  const capMax = item.look?.maxFontPx || null;
  const [headPx, setHeadPx] = useState(null);
  const heads = [
    has(c.headlineHe) && { key: 'hh', text: c.headlineHe, he: true },
    has(c.headlineEn) && { key: 'he', text: c.headlineEn, he: false },
  ].filter(Boolean);
  const bodies = [
    has(c.bodyHe) && { key: 'bh', text: c.bodyHe, he: true },
    has(c.bodyEn) && { key: 'be', text: c.bodyEn, he: false },
  ].filter(Boolean);
  // A lone body (no headline) is promoted to headline size.
  const primary = heads.length ? heads : bodies;
  const secondary = heads.length ? bodies : [];
  const headMax = Math.round((capMax || 260) * scale);
  const bodyMax = Math.max(18, Math.round(Math.min(110 * scale, (headPx || headMax) * 0.62)));

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${14 * scale}px` }}>
      <Eyebrow text={c.target} tokens={tokens} size={20 * scale} />
      {primary.map((p, i) => (
        <div key={p.key} style={{ flex: primary.length > 1 && i > 0 ? 2 : 3, minHeight: 0 }}>
          <FitText
            text={p.text}
            dir={p.he ? 'rtl' : 'ltr'}
            min={18}
            max={i === 0 ? headMax : Math.round(headMax * 0.6)}
            lineHeight={1.12}
            onFit={i === 0 ? setHeadPx : undefined}
            style={{
              fontFamily: p.he ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontWeight: i === 0 ? 700 : 400,
              color: i === 0 ? tokens.text : tokens.dim,
            }}
          />
        </div>
      ))}
      {secondary.length > 0 && <Divider tokens={tokens} />}
      {secondary.map((b) => (
        <div key={b.key} style={{ flex: 2, minHeight: 0 }}>
          <FitText
            text={b.text}
            dir={b.he ? 'rtl' : 'ltr'}
            min={14}
            max={bodyMax}
            lineHeight={1.3}
            style={{ fontFamily: b.he ? fonts.hebrewPrimary : fonts.englishBody, fontWeight: 500, color: tokens.text }}
          />
        </div>
      ))}
      {(has(c.subtitle) || has(c.attribution)) && (
        <div style={{
          flexShrink: 0, textAlign: 'center', fontFamily: fonts.englishBody, fontSize: `${22 * scale}px`,
          color: tokens.dim, fontStyle: 'italic', whiteSpace: 'pre-wrap', unicodeBidi: 'plaintext',
        }}>
          {[c.subtitle, has(c.attribution) ? `— ${c.attribution}` : ''].filter(has).join('\n')}
        </div>
      )}
    </div>
  );
}

// ── Event card ──────────────────────────────────────────────────────────────

function TimeFace({ hhmm, tokens, size }) {
  const t = to12h(hhmm);
  const m = /^(\d{1,2}:\d{2})\s*(AM|PM)$/.exec(t);
  return (
    <span style={{ fontFamily: fonts.englishDisplay, fontVariantNumeric: 'tabular-nums lining-nums', fontWeight: 600, color: tokens.gold, lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: `${size}px` }}>{m ? m[1] : t}</span>
      {m && <span style={{ fontSize: `${Math.round(size * 0.32)}px`, marginLeft: `${Math.round(size * 0.08)}px`, color: tokens.dim, letterSpacing: '0.06em' }}>{m[2]}</span>}
    </span>
  );
}

function Tile({ label, children, tokens, scale }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: `${8 * scale}px`, padding: `${20 * scale}px ${34 * scale}px`, minWidth: `${180 * scale}px`,
      background: tokens.goldBg, border: `1px solid ${tokens.goldBd}`, borderRadius: `${12 * scale}px`,
    }}>
      {label && <div style={{ fontFamily: fonts.englishBody, fontSize: `${17 * scale}px`, color: tokens.dim, letterSpacing: '0.1em' }}>{label}</div>}
      {children}
    </div>
  );
}

export function EventCard({ item, tokens, scale = 1 }) {
  const e = item.content?.event || {};
  const dayIsHe = isHebrew(e.day);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${22 * scale}px` }}>
      <div style={{ flex: has(e.titleHe) && has(e.title) ? 2.4 : 3, minHeight: 0 }}>
        <FitText
          text={has(e.title) ? e.title : e.titleHe}
          dir={has(e.title) ? (isHebrew(e.title) ? 'rtl' : 'ltr') : 'rtl'}
          min={20} max={Math.round((item.look?.maxFontPx || 170) * scale)} lineHeight={1.1}
          style={{ fontFamily: isHebrew(has(e.title) ? e.title : e.titleHe) ? fonts.hebrewDisplay : fonts.englishDisplay, fontWeight: 700, color: tokens.text }}
        />
      </div>
      {has(e.title) && has(e.titleHe) && (
        <div style={{ flex: 1.1, minHeight: 0 }}>
          <FitText text={e.titleHe} dir="rtl" min={16} max={Math.round(90 * scale)} style={{ fontFamily: fonts.hebrewDisplay, fontWeight: 500, color: tokens.dim }} />
        </div>
      )}
      {(has(e.day) || has(e.time)) && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: `${24 * scale}px`, flexShrink: 0 }}>
          {has(e.day) && (
            <Tile tokens={tokens} scale={scale}>
              <div style={{
                fontFamily: dayIsHe ? fonts.hebrewDisplay : fonts.englishDisplay, fontSize: `${64 * scale}px`, fontWeight: 600,
                color: tokens.text, lineHeight: 1.05, whiteSpace: 'pre-wrap', textAlign: 'center', unicodeBidi: 'plaintext',
              }}>{e.day}</div>
            </Tile>
          )}
          {has(e.time) && (
            <Tile tokens={tokens} scale={scale}>
              <TimeFace hhmm={e.time} tokens={tokens} size={Math.round(92 * scale)} />
            </Tile>
          )}
        </div>
      )}
      {(has(e.place) || has(e.placeHe)) && (
        <div style={{ flex: 0.9, minHeight: 0 }}>
          <FitText
            text={[e.place, e.placeHe].filter(has).join('  ·  ')}
            min={16} max={Math.round(56 * scale)}
            style={{ fontFamily: fonts.englishBody, color: tokens.dim, fontStyle: 'italic' }}
          />
        </div>
      )}
    </div>
  );
}

// ── List ────────────────────────────────────────────────────────────────────

export function ListCard({ item, tokens, scale = 1 }) {
  const l = item.content?.list || {};
  const items = (l.items || []).filter(has).slice(0, 8);
  const heading = [l.heading, l.headingHe].filter(has);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const anyHe = items.some(isHebrew);
  const size = useFitSize(boxRef, listRef, [items.join('\u0001')], { min: 16, max: Math.round(84 * scale) });
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: `${18 * scale}px` }}>
      {heading.length > 0 && (
        <div style={{ flex: items.length ? 1.2 : 3, minHeight: 0 }}>
          <FitText
            text={heading.join('\n')}
            min={20} max={Math.round((item.look?.maxFontPx || 120) * scale)} lineHeight={1.1}
            style={{ fontFamily: isHebrew(heading[0]) ? fonts.hebrewDisplay : fonts.englishDisplay, fontWeight: 700, color: tokens.gold }}
          />
        </div>
      )}
      {heading.length > 0 && items.length > 0 && <Divider tokens={tokens} width="30%" />}
      {items.length > 0 && (
        <div ref={boxRef} style={{ flex: 3, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ul
            ref={listRef}
            dir={anyHe ? 'rtl' : 'ltr'}
            style={{
              listStyle: 'none', margin: 0, padding: 0, maxWidth: '100%',
              fontSize: size ? `${size}px` : '16px', lineHeight: 1.25,
              display: 'flex', flexDirection: 'column', gap: '0.35em',
            }}
          >
            {items.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: '0.55em', alignItems: 'baseline' }}>
                <span style={{ color: tokens.gold, fontSize: '0.55em', flexShrink: 0, transform: 'translateY(-0.15em)' }}>{'◆'}</span>
                <span style={{
                  fontFamily: isHebrew(t) ? fonts.hebrewPrimary : fonts.englishBody, color: tokens.text,
                  whiteSpace: 'pre-wrap', overflowWrap: 'normal', unicodeBidi: 'plaintext',
                }}>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Quick time ──────────────────────────────────────────────────────────────

export function QuickTime({ item, tokens, scale = 1 }) {
  const q = item.content?.quicktime || {};
  const names = [q.name, q.nameHe].filter(has);
  const t = to12h(q.time);
  const m = /^(\d{1,2}:\d{2})\s*(AM|PM)$/.exec(t);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${10 * scale}px` }}>
      <div style={{ flex: 2, minHeight: 0 }}>
        <FitText
          text={names.join('\n')}
          min={20} max={Math.round(130 * scale)} lineHeight={1.08} valign="bottom"
          style={{ fontFamily: isHebrew(names[0]) ? fonts.hebrewDisplay : fonts.englishDisplay, fontWeight: 600, color: tokens.text }}
        />
      </div>
      <div style={{ flex: 3, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${16 * scale}px` }}>
        <div style={{ width: `${70 * scale}px`, height: '2px', background: tokens.goldBd, flexShrink: 0 }} />
        <div style={{ height: '100%', flex: '0 1 auto', minWidth: 0, width: '62%' }}>
          <FitText
            text={m ? m[1] : t}
            min={30} max={Math.round((item.look?.maxFontPx || 330) * scale)} lineHeight={1}
            style={{ fontFamily: fonts.englishDisplay, fontWeight: 700, color: tokens.gold, fontVariantNumeric: 'tabular-nums lining-nums', letterSpacing: '-0.02em' }}
          />
        </div>
        {m && (
          <div style={{ fontFamily: fonts.englishBody, fontSize: `${40 * scale}px`, color: tokens.dim, letterSpacing: '0.1em', flexShrink: 0 }}>{m[2]}</div>
        )}
        <div style={{ width: `${70 * scale}px`, height: '2px', background: tokens.goldBd, flexShrink: 0 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {has(q.place) && (
          <FitText
            text={q.place}
            min={16} max={Math.round(54 * scale)} valign="top"
            style={{ fontFamily: isHebrew(q.place) ? fonts.hebrewPrimary : fonts.englishBody, color: tokens.dim, fontStyle: isHebrew(q.place) ? 'normal' : 'italic' }}
          />
        )}
      </div>
    </div>
  );
}

const LAYOUT_COMPONENTS = { bigwords: BigWords, event: EventCard, list: ListCard, quicktime: QuickTime };

// Styles StyledSlide has; the other takeover styles render via TakeoverCard.
const STYLED_SLIDE_STYLES = new Set(['classic', 'grand', 'emergency', 'sleek', 'celebration', 'urgent']);

/**
 * Rotation / hold slide body for an announcement item.
 * Layout and style are independent: the classic layout uses the original
 * template/style renderers; the other layouts take the style's palette.
 */
export default function AnnouncementSlide({ item, tokens }) {
  if (!item) return null;
  const layout = layoutOf(item);
  const auto = item.look?.fit !== 'fixed';
  const style = item.look?.style || null;
  if (layout === 'classic') {
    const tmpl = item.look?.template;
    if (!auto && tmpl === 'board' && !style) return <BoardDisplay boards={[toLegacyBoard(item)]} tokens={tokens} />;
    if (!auto && tmpl === 'pinned' && !style) {
      return <PinnedSlide slide={{ textHe: item.content?.headlineHe, textEn: item.content?.headlineEn }} tokens={tokens} />;
    }
    if (style && STYLED_SLIDE_STYLES.has(style)) return <StyledSlide slide={toLegacyTextSlide(item)} tokens={tokens} />;
    if (style) return <TakeoverCard takeover={toLegacyTakeover(item)} tokens={tokens} />;
    // Text templates (headline / quote / info / announcement) keep their look.
    return <TextSlide slide={toLegacyTextSlide(item)} tokens={tokens} />;
  }
  const C = LAYOUT_COMPONENTS[layout] || BigWords;
  const { tokens: t, background } = styledTokens(style, tokens);
  if (!background) return <C item={item} tokens={t} />;
  return (
    <div data-fit-root="" style={{
      position: 'absolute', inset: 0, background, borderRadius: '4px', overflow: 'hidden',
      padding: '52px 44px 36px', boxSizing: 'border-box', display: 'flex',
    }}>
      <C item={item} tokens={t} />
    </div>
  );
}

/**
 * Full-screen takeover for an announcement. Classic layout uses the
 * Takeover.jsx styles (with auto-fit primary text unless fit is 'fixed');
 * the other layouts render full canvas on the style's (or theme's) background.
 */
export function AnnouncementTakeover({ item, tokens }) {
  const layout = item ? layoutOf(item) : null;
  if (!item || layout === 'classic') {
    return <Takeover takeover={item ? toLegacyTakeover(item) : null} tokens={tokens} />;
  }
  const C = LAYOUT_COMPONENTS[layout] || BigWords;
  const { tokens: t, background } = styledTokens(item.look?.style, tokens);
  return (
    <AnimatePresence>
      <motion.div
        key={item.id}
        data-fit-root=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 100, background: background || tokens.bg,
          padding: '70px 90px', boxSizing: 'border-box', display: 'flex',
        }}
      >
        <div style={{ position: 'absolute', inset: '18px', border: `1px solid ${t.goldBd}`, pointerEvents: 'none' }} />
        <C item={item} tokens={t} scale={1.35} />
      </motion.div>
    </AnimatePresence>
  );
}
