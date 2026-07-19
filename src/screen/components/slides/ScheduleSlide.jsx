import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { fonts } from '../../styles/tokens.js';
import { ScheduleIcon } from '../../../shared/ScheduleIcons.jsx';

// ── Keyframes ─────────────────────────────────────────────────────────────
const SCHEDULE_KEYFRAMES = `
@keyframes scheduleNextGlow {
  0%, 100% { box-shadow: 0 0 18px var(--glow-color), inset 0 0 6px var(--glow-color); }
  50%      { box-shadow: 0 0 28px var(--glow-color), inset 0 0 12px var(--glow-color); }
}
.schedule-scroll::-webkit-scrollbar { display: none; }
@keyframes scheduleTickerScroll {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
`;

// ── Speed lookup ──────────────────────────────────────────────────────────
const SPEED_MAP = { slow: 15, medium: 30, fast: 50 };

// ── Time helpers ──────────────────────────────────────────────────────────

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const m12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2]);
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const m24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  return null;
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return timeStr;
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

function getEntryState(entry, now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMins = parseTimeToMinutes(entry.time);
  const endMins = entry.endTime ? parseTimeToMinutes(entry.endTime) : null;
  if (startMins === null) return 'upcoming';
  if (endMins !== null && currentMinutes >= startMins && currentMinutes < endMins) return 'current';
  if (endMins !== null && currentMinutes >= endMins) return 'past';
  if (endMins === null && currentMinutes > startMins + 5) return 'past';
  return 'upcoming';
}

function findNextEntryIndex(entries, now) {
  // Prefer currently-running entry over upcoming
  for (let i = 0; i < entries.length; i++) {
    if (getEntryState(entries[i], now) === 'current') return i;
  }
  // Nothing running — find soonest upcoming
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < entries.length; i++) {
    const mins = parseTimeToMinutes(entries[i].time);
    if (mins === null) continue;
    const diff = mins - currentMinutes;
    if (diff > 0 && diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }
  return bestIdx;
}

function buildCategoryMap(categories) {
  const map = {};
  if (!categories) return map;
  for (const c of categories) map[c.id] = c;
  return map;
}

// ── Entry Row ─────────────────────────────────────────────────────────────

function EntryRow({ entry, state, isNext, categoryData, tokens, lang, compact, scale = 1.0 }) {
  const isPast = state === 'past';
  const isCurrent = state === 'current';
  const isHighlighted = isNext || isCurrent;
  const catColor = categoryData?.color || tokens.dim;

  const hebrewPrimary = lang !== 'en';
  const primaryName = hebrewPrimary ? (entry.nameHe || entry.name) : (entry.name || entry.nameHe);
  const secondaryName = hebrewPrimary
    ? (entry.nameHe && entry.name ? entry.name : null)
    : (entry.name && entry.nameHe ? entry.nameHe : null);

  const icon = entry.icon || categoryData?.icon || null;

  // Sizing — compact mode uses slightly smaller text for two-column layout
  // scale multiplier applied for shrink-to-fit full-day mode
  const timeSize = compact ? (isHighlighted ? `${Math.round(22 * scale)}px` : `${Math.round(19 * scale)}px`) : (isHighlighted ? `${Math.round(28 * scale)}px` : `${Math.round(24 * scale)}px`);
  const nameSize = compact ? (isHighlighted ? `${Math.round(20 * scale)}px` : `${Math.round(18 * scale)}px`) : (isHighlighted ? `${Math.round(26 * scale)}px` : `${Math.round(23 * scale)}px`);
  const subSize = compact ? `${Math.round(12 * scale)}px` : `${Math.round(14 * scale)}px`;
  const iconSize = compact ? (isHighlighted ? Math.round(18 * scale) : Math.round(16 * scale)) : (isHighlighted ? Math.round(22 * scale) : Math.round(20 * scale));
  const timeColWidth = compact ? `${Math.round(100 * scale)}px` : `${Math.round(130 * scale)}px`;
  const vPadN = compact
    ? (isHighlighted ? Math.round(10 * scale) : Math.round(8 * scale))
    : (isHighlighted ? Math.round(14 * scale) : Math.round(11 * scale));
  const hPadR = compact ? Math.round(14 * scale) : Math.round(24 * scale);
  const hPadL = compact ? Math.round(11 * scale) : Math.round(21 * scale);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `${vPadN}px ${hPadR}px ${vPadN}px ${hPadL}px`,
        borderRadius: isHighlighted ? '6px' : '0',
        position: 'relative',
        opacity: isPast ? 0.55 : 1,
        transition: 'opacity 0.6s ease, background 0.6s ease',
        borderLeft: `3px solid ${isHighlighted ? tokens.gold : catColor}`,
        ...(isHighlighted ? {
          background: tokens.goldBg,
          border: `1px solid ${tokens.goldBd}`,
          borderLeft: `4px solid ${tokens.gold}`,
          '--glow-color': tokens.goldBg,
          animation: 'scheduleNextGlow 4s ease-in-out infinite',
        } : {}),
      }}
    >
      {/* Time column */}
      <div style={{
        width: timeColWidth,
        flexShrink: 0,
        textAlign: 'right',
        paddingRight: compact ? `${Math.round(12 * scale)}px` : `${Math.round(20 * scale)}px`,
      }}>
        <div style={{
          fontFamily: fonts.englishDisplay,
          fontWeight: 300,
          fontSize: timeSize,
          color: isHighlighted ? tokens.gold : (isPast ? tokens.dim : tokens.text),
          direction: 'ltr',
          unicodeBidi: 'isolate',
          letterSpacing: '0.02em',
          lineHeight: 1.2,
          transition: 'color 0.5s ease',
        }}>
          {formatTime12(entry.time)}
        </div>
        {entry.endTime && (
          <div style={{
            fontFamily: fonts.englishDisplay,
            fontSize: compact ? `${Math.round(11 * scale)}px` : `${Math.round(13 * scale)}px`,
            fontWeight: 300,
            color: isHighlighted ? `${tokens.gold}88` : tokens.muted,
            direction: 'ltr',
            unicodeBidi: 'isolate',
            marginTop: '1px',
            letterSpacing: '0.01em',
          }}>
            {'\u2013'} {formatTime12(entry.endTime)}
          </div>
        )}
      </div>

      {/* Icon column */}
      {icon && (
        <div style={{
          width: compact ? `${Math.round(24 * scale)}px` : `${Math.round(30 * scale)}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: compact ? `${Math.round(6 * scale)}px` : `${Math.round(10 * scale)}px`,
          opacity: isPast ? 0.55 : 0.9,
          transition: 'opacity 0.5s ease',
        }}>
          <ScheduleIcon
            iconKey={icon}
            size={iconSize}
            color={isHighlighted ? tokens.gold : (isPast ? tokens.dim : catColor)}
          />
        </div>
      )}

      {/* Name column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: hebrewPrimary ? fonts.hebrewPrimary : fonts.englishBody,
          fontSize: nameSize,
          fontWeight: isHighlighted ? 600 : 500,
          color: isHighlighted ? tokens.gold : (isPast ? tokens.dim : tokens.text),
          lineHeight: 1.35,
          transition: 'color 0.5s ease',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          direction: hebrewPrimary ? 'rtl' : 'ltr',
        }}>
          {primaryName}
        </div>
        {secondaryName && (
          <div style={{
            fontFamily: hebrewPrimary ? fonts.englishBody : fonts.hebrewPrimary,
            fontSize: subSize,
            color: isHighlighted ? `${tokens.gold}BB` : tokens.dim,
            textTransform: hebrewPrimary ? 'uppercase' : 'none',
            letterSpacing: hebrewPrimary ? '0.06em' : '0',
            direction: hebrewPrimary ? 'ltr' : 'rtl',
            unicodeBidi: 'isolate',
            marginTop: '3px',
            lineHeight: 1.25,
          }}>
            {secondaryName}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function SlideHeader({ tokens, isHebrew, title }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '8px 0 14px',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: isHebrew ? fonts.hebrewDisplay : fonts.englishDisplay,
        fontSize: '26px',
        fontWeight: 500,
        color: tokens.gold,
        letterSpacing: isHebrew ? '0' : '0.08em',
        textTransform: isHebrew ? 'none' : 'uppercase',
      }}>
        {title}
      </span>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginTop: '10px',
        padding: '0 24px',
      }}>
        <div style={{
          flex: 1, height: '1px',
          background: `linear-gradient(to right, transparent, ${tokens.muted})`,
        }} />
        <div style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: tokens.gold, opacity: 0.5,
        }} />
        <div style={{
          flex: 1, height: '1px',
          background: `linear-gradient(to left, transparent, ${tokens.muted})`,
        }} />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ tokens, isHebrew }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '60px 20px',
      fontFamily: isHebrew ? fonts.hebrewPrimary : fonts.englishBody,
      fontSize: '22px',
      color: tokens.dim,
      lineHeight: 1.6,
    }}>
      {isHebrew
        ? '\u05D0\u05D9\u05DF \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05D1\u05E1\u05D3\u05E8 \u05D4\u05D9\u05D5\u05DD'
        : 'No schedule entries today'}
    </div>
  );
}

// ── Mode: Full Day ────────────────────────────────────────────────────────

function FullDayMode({ entries, now, nextIdx, categoryMap, tokens, lang }) {
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(obs => {
      const h = obs[0]?.contentRect?.height ?? 0;
      if (h > 0) setContainerHeight(h);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const NATURAL_ROW_HEIGHT = 54;
  const MIN_SCALE = 0.45;
  const scale = containerHeight > 0
    ? Math.max(MIN_SCALE, Math.min(1.0, containerHeight / (entries.length * NATURAL_ROW_HEIGHT + 8)))
    : 1.0;
  const gap = Math.round(3 * scale);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', padding: '4px 0' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
        {entries.map((entry, i) => {
          const state = getEntryState(entry, now);
          const isNext = i === nextIdx;
          const catData = categoryMap[entry.category] || null;
          return (
            <EntryRow
              key={entry.id || i}
              entry={entry}
              state={isNext ? 'next' : state}
              isNext={isNext}
              categoryData={catData}
              tokens={tokens}
              lang={lang}
              scale={scale}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Mode: Auto-scroll (ticker) ────────────────────────────────────────────

function AutoScrollMode({ entries, now, nextIdx, categoryMap, tokens, lang, scrollSpeed, scrollStart = 'beginning' }) {
  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // If scrollStart === 'current' and we have a highlighted entry, reorder to start there
  const displayEntries = useMemo(() => {
    if (scrollStart !== 'current' || nextIdx <= 0) return entries;
    // Start 1 before the current/next entry for context
    const start = Math.max(0, nextIdx - 1);
    return [...entries.slice(start), ...entries.slice(0, start)];
  }, [entries, nextIdx, scrollStart]);

  // Two-pass approach: first render without duplication to measure real content,
  // then enable scrolling once we know it overflows.
  const [measured, setMeasured] = useState(false);

  // Locked pre-duplication height — set once when measured transitions to true,
  // never updated again so animDuration stays stable and the CSS animation
  // doesn't restart on subsequent ResizeObserver firings.
  const lockedHeightRef = useRef(0);

  useEffect(() => {
    const inner = innerRef.current;
    const container = containerRef.current;
    if (!inner || !container) return;
    const measure = () => {
      const ch = container.clientHeight;
      setContainerHeight(ch);
      // Only update contentHeight (and potentially lock) before duplication.
      // Once measured===true the inner div contains two copies + a gap spacer,
      // so scrollHeight / 2 would include the gap — don't use it to drive state.
      if (!measured) {
        const realHeight = inner.scrollHeight;
        setContentHeight(realHeight);
        if (realHeight > ch) {
          lockedHeightRef.current = realHeight;
          setMeasured(true);
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    ro.observe(container);
    return () => ro.disconnect();
  }, [displayEntries.length, measured]);

  const needsScroll = measured && contentHeight > containerHeight;
  // Use the locked pre-duplication height so animDuration never changes after
  // the ticker starts, preventing the CSS animation from restarting.
  const animDuration = needsScroll ? lockedHeightRef.current / scrollSpeed : 0;

  const renderEntries = (keyPrefix) =>
    displayEntries.map((entry, i) => {
      const state = getEntryState(entry, now);
      const isNext = i === nextIdx;
      const catData = categoryMap[entry.category] || null;
      return (
        <div key={`${keyPrefix}${entry.id || i}`}>
          <EntryRow
            entry={entry}
            state={isNext ? 'next' : state}
            isNext={isNext}
            categoryData={catData}
            tokens={tokens}
            lang={lang}
          />
        </div>
      );
    });

  return (
    <div
      ref={containerRef}
      className="schedule-scroll"
      style={{
        flex: 1,
        overflowY: 'hidden',
        overflowX: 'hidden',
        position: 'relative',
        padding: '4px 0',
      }}
    >
      <div
        ref={innerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          ...(needsScroll ? {
            animation: `scheduleTickerScroll ${animDuration}s linear infinite`,
          } : {}),
        }}
      >
        {renderEntries('')}
        {needsScroll && (
          <>
            <div style={{ height: '48px' }} />
            {renderEntries('dup-')}
          </>
        )}
      </div>
    </div>
  );
}

// ── Mode: Two-column ──────────────────────────────────────────────────────

function TwoColumnMode({ entries, now, nextIdx, categoryMap, tokens, lang }) {
  const mid = Math.ceil(entries.length / 2);
  const leftEntries = entries.slice(0, mid);
  const rightEntries = entries.slice(mid);

  const renderColumn = (colEntries, offsetIdx) =>
    colEntries.map((entry, i) => {
      const globalIdx = offsetIdx + i;
      const state = getEntryState(entry, now);
      const isNext = globalIdx === nextIdx;
      const catData = categoryMap[entry.category] || null;
      return (
        <div key={entry.id || globalIdx}>
          <EntryRow
            entry={entry}
            state={isNext ? 'next' : state}
            isNext={isNext}
            categoryData={catData}
            tokens={tokens}
            lang={lang}
            compact
          />
        </div>
      );
    });

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      gap: '2px',
      overflowY: 'auto',
      overflowX: 'hidden',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      padding: '4px 0',
    }}>
      {/* Left column */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        borderRight: `1px solid ${tokens.muted}`,
        paddingRight: '4px',
      }}>
        {renderColumn(leftEntries, 0)}
      </div>
      {/* Right column */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        paddingLeft: '4px',
      }}>
        {renderColumn(rightEntries, mid)}
      </div>
    </div>
  );
}

// ── Main slide ────────────────────────────────────────────────────────────

export default function ScheduleSlide({ schedule, tokens, settings }) {
  const [now, setNow] = useState(() => new Date());

  const entries = useMemo(
    () => [...(schedule?.entries || [])].sort(
      (a, b) => (parseTimeToMinutes(a.time) ?? 9999) - (parseTimeToMinutes(b.time) ?? 9999)
    ),
    [schedule?.entries]
  );
  const categories = schedule?.categories || [];
  const categoryMap = useMemo(() => buildCategoryMap(categories), [categories]);

  const lang = settings?.language || 'he';
  const isHebrew = lang !== 'en';
  const title = isHebrew ? '\u05E1\u05D3\u05E8 \u05D4\u05D9\u05D5\u05DD' : 'Schedule';

  // Display mode: 'full' | 'scroll' | 'two-column'
  const displayMode = settings?.scheduleDisplayMode || 'full';
  // Scroll speed for ticker mode
  const speedKey = settings?.scheduleScrollSpeed || 'medium';
  const scrollSpeed = SPEED_MAP[speedKey] || SPEED_MAP.medium;
  // Scroll start position for ticker mode
  const scrollStart = settings?.scheduleScrollStart || 'beginning';

  // Update clock every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const nextIdx = useMemo(() => findNextEntryIndex(entries, now), [entries, now]);

  const sharedProps = { entries, now, nextIdx, categoryMap, tokens, lang };

  return (
    <div style={{
      width: '100%',
      maxWidth: displayMode === 'two-column' ? '960px' : '720px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 16px',
    }}>
      <style>{SCHEDULE_KEYFRAMES}</style>

      <SlideHeader tokens={tokens} isHebrew={isHebrew} title={title} />

      {entries.length === 0 ? (
        <EmptyState tokens={tokens} isHebrew={isHebrew} />
      ) : displayMode === 'scroll' ? (
        <AutoScrollMode {...sharedProps} scrollSpeed={scrollSpeed} scrollStart={scrollStart} />
      ) : displayMode === 'two-column' ? (
        <TwoColumnMode {...sharedProps} />
      ) : (
        <FullDayMode {...sharedProps} />
      )}
    </div>
  );
}
