import React, { useEffect, useRef } from 'react';
import { fonts } from '../../styles/tokens.js';
import { hNum } from '../../../shared/constants.js';

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const SCROLL_SPEED = 28;        // px per second
const SCROLL_START_DELAY = 1200; // ms pause at top before scrolling starts
const OVERFLOW_THRESHOLD = 10;   // px — below this we don't bother scrolling

// Strip the date/shiurim preamble from Hayom Yom Hebrew text.
// Removes: "יום ראשון יא אייר, ... שיעורים: חומש: ... תניא: some text."
function stripHayomPreamble(text) {
  if (!text) return text;
  const shiurimIdx = text.indexOf('\u05E9\u05D9\u05E2\u05D5\u05E8\u05D9\u05DD:'); // שיעורים:
  if (shiurimIdx === -1) return text;
  // Find תניא: after שיעורים: and take everything after its first period
  const tanyaMarker = '\u05EA\u05E0\u05D9\u05D0:'; // תניא:
  const tanyaIdx = text.indexOf(tanyaMarker, shiurimIdx);
  let result;
  if (tanyaIdx !== -1) {
    const searchWindow = text.slice(tanyaIdx, tanyaIdx + 80);
    const lastDotInWindow = searchWindow.lastIndexOf('.');
    if (lastDotInWindow !== -1) {
      result = text.slice(tanyaIdx + lastDotInWindow + 1).trim();
    }
  }
  if (!result) {
    // Fallback: skip 3 periods from שיעורים:
    let pos = shiurimIdx, dots = 0;
    while (pos < text.length && dots < 3) { if (text[pos] === '.') dots++; pos++; }
    result = dots === 3 ? text.slice(pos).trim() : text;
  }
  // Strip any stray leading period(s) that can appear from typesetting artifacts
  return result.replace(/^[.\s]+/, '');
}

export default function HayomYomSlide({ cache, tokens, settings, onRequestDuration }) {
  const hayomYom = cache?.hayomYom || {};
  const hebrewDate = cache?.hebrewDate || {};
  const omer = cache?.omer;
  const lang = settings?.hayomYomLang || 'both';

  const showHe = lang === 'hebrew' || lang === 'both';
  const showEn = lang === 'english' || lang === 'both';
  const onlyOne = lang !== 'both';

  const dayName = HE_DAYS[new Date().getDay()] || '';
  const omerHe = omer?.count ? `${hNum(omer.count)} לָעֹמֶר` : null;

  const heText = stripHayomPreamble(hayomYom.he);
  const enText = hayomYom.en;
  const hasContent = heText || enText;

  // Render text with preserved newlines
  function renderWithBreaks(text) {
    if (!text) return null;
    const lines = text.split('\n');
    if (lines.length === 1) return text;
    return lines.map((line, i) => (
      <React.Fragment key={i}>
        {i > 0 && <br />}
        {line}
      </React.Fragment>
    ));
  }

  // scrollRef sits on the root div itself.
  // With alignSelf: 'stretch', the root fills the parent's full height (overriding the
  // parent motion.div's align-items: center), giving a DEFINITE clientHeight.
  // overflow: hidden clips the excess and allows programmatic scrollTop.
  const scrollRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    cancelAnimationFrame(animRef.current);
    clearTimeout(animRef._startTimer);
    el.scrollTop = 0;

    // Double-rAF: ensures browser has fully computed layout (important for
    // percentage-based heights and font-dependent text measurements).
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll <= OVERFLOW_THRESHOLD) return; // fits — no scroll needed

        // Extend the slide duration so it lasts long enough to finish scrolling
        if (onRequestDuration) {
          const scrollSecs = maxScroll / SCROLL_SPEED;
          const totalSecs = Math.ceil(SCROLL_START_DELAY / 1000 + scrollSecs + 2);
          onRequestDuration(Math.max(13, totalSecs));
        }

        // Start scrolling after the initial pause
        animRef._startTimer = setTimeout(() => {
          let start = null;

          const tick = (timestamp) => {
            if (!start) start = timestamp;
            if (!scrollRef.current) return;
            const elapsed = (timestamp - start) / 1000;
            const target = elapsed * SCROLL_SPEED;
            const cur = scrollRef.current;
            const curMax = cur.scrollHeight - cur.clientHeight;

            if (target >= curMax) {
              cur.scrollTop = curMax;
              return; // reached bottom — slide will auto-advance from duration override
            }

            cur.scrollTop = target;
            animRef.current = requestAnimationFrame(tick);
          };

          animRef.current = requestAnimationFrame(tick);
        }, SCROLL_START_DELAY);
      });
      animRef._r2 = r2;
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(animRef._r2);
      cancelAnimationFrame(animRef.current);
      clearTimeout(animRef._startTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heText, enText]);

  return (
    // alignSelf: 'stretch' overrides parent's align-items: center for this element,
    // giving the root a definite clientHeight equal to the container's inner height.
    // This is the key fix: without it, height: 100% would resolve to auto in many
    // browsers when the parent uses align-items: center, and scrollHeight === clientHeight.
    <div
      ref={scrollRef}
      style={{
        width: '100%',
        maxWidth: '720px',
        alignSelf: 'stretch',
        overflow: 'hidden',
        padding: '0 16px',
        boxSizing: 'border-box',
      }}
    >

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        direction: 'rtl',
        borderBottom: `1px solid ${tokens.goldBd || 'rgba(212,168,75,0.2)'}`,
        paddingBottom: '12px',
        marginBottom: '22px',
        marginTop: '4px',
      }}>
        <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: '18px', fontWeight: 600, color: tokens.gold }}>
          {dayName ? `יום ${dayName}` : ''}
        </span>
        <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: '16px', color: tokens.text, textAlign: 'center' }}>
          {hebrewDate.hebrew || ''}
          {omerHe && <span style={{ color: tokens.gold, margin: '0 8px' }}>·</span>}
          {omerHe && <span>{omerHe}</span>}
        </span>
        {hebrewDate.hebrewYear > 0 && (
          <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: '15px', color: tokens.dim }}>
            ({hNum(hebrewDate.hebrewYear % 1000)})
          </span>
        )}
      </div>

      {/* ── No data ────────────────────────────────────────────────────── */}
      {!hasContent && (
        <div style={{ textAlign: 'center', color: tokens.dim, fontFamily: fonts.englishBody, fontSize: '14px' }}>
          No Hayom Yom data available
        </div>
      )}

      {/* ── Text — side by side in "both" mode ─────────────────────────── */}
      {hasContent && !onlyOne && showHe && showEn && heText && enText && (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* English — LEFT */}
          <div style={{
            flex: 1,
            fontFamily: fonts.englishBody,
            fontSize: '18px',
            fontStyle: 'italic',
            color: tokens.dim,
            direction: 'ltr',
            textAlign: 'left',
            lineHeight: 1.9,
            paddingRight: '14px',
          }}>
            {renderWithBreaks(enText)}
          </div>
          <div style={{ width: '1px', alignSelf: 'stretch', flexShrink: 0, background: tokens.goldBd || 'rgba(212,168,75,0.2)' }} />
          {/* Hebrew — RIGHT */}
          <div style={{
            flex: 1,
            fontFamily: fonts.hebrewPrimary,
            fontSize: '22px',
            fontWeight: 500,
            color: tokens.text,
            direction: 'rtl',
            textAlign: 'right',
            lineHeight: 1.9,
            paddingLeft: '14px',
          }}>
            {renderWithBreaks(heText)}
          </div>
        </div>
      )}

      {/* ── Single language mode ────────────────────────────────────────── */}
      {hasContent && onlyOne && (
        <>
          {showHe && heText && (
            <div style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: '26px',
              fontWeight: 500,
              color: tokens.text,
              lineHeight: 1.9,
              textAlign: 'right',
              direction: 'rtl',
              background: tokens.goldBg || 'rgba(212,168,75,0.04)',
              border: `1px solid ${tokens.goldBd || 'rgba(212,168,75,0.12)'}`,
              borderRadius: '6px',
              padding: '16px 22px',
            }}>
              {renderWithBreaks(heText)}
            </div>
          )}
          {showEn && enText && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '20px',
              color: tokens.text,
              lineHeight: 1.9,
              direction: 'ltr',
              textAlign: 'left',
              fontStyle: 'italic',
              background: tokens.goldBg || 'rgba(212,168,75,0.04)',
              border: `1px solid ${tokens.goldBd || 'rgba(212,168,75,0.12)'}`,
              borderRadius: '6px',
              padding: '16px 22px',
            }}>
              {renderWithBreaks(enText)}
            </div>
          )}
        </>
      )}

      {/* ── Both mode: only one side has data ──────────────────────────── */}
      {hasContent && !onlyOne && !(heText && enText) && (
        <>
          {showHe && heText && (
            <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: '24px', fontWeight: 500, color: tokens.text, direction: 'rtl', textAlign: 'right', lineHeight: 1.9 }}>
              {renderWithBreaks(heText)}
            </div>
          )}
          {showEn && enText && (
            <div style={{ fontFamily: fonts.englishBody, fontSize: '18px', color: tokens.dim, fontStyle: 'italic', lineHeight: 1.9, direction: 'ltr', textAlign: 'left' }}>
              {renderWithBreaks(enText)}
            </div>
          )}
        </>
      )}

    </div>
  );
}
