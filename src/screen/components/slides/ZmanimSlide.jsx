import React from 'react';
import { fonts } from '../../styles/tokens.js';
import { ZMANIM_DISPLAY } from '../../../shared/constants.js';

function parseTimeToMinutes(timeStr) {
  const match = timeStr?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function getNextZmanKey(allTimes, currentMinutes) {
  let earliest = null;
  let earliestKey = null;

  for (const z of ZMANIM_DISPLAY) {
    const mins = parseTimeToMinutes(allTimes[z.k]);
    if (mins === null) continue;
    if (mins > currentMinutes && (earliest === null || mins < earliest)) {
      earliest = mins;
      earliestKey = z.k;
    }
  }
  return earliestKey;
}

function getZmanState(key, timeStr, allTimes) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const zmanMinutes = parseTimeToMinutes(timeStr);

  if (zmanMinutes === null) return 'upcoming';

  const nextKey = getNextZmanKey(allTimes, currentMinutes);

  if (key === nextKey) return 'next';
  if (zmanMinutes < currentMinutes - 30) return 'past';
  if (zmanMinutes < currentMinutes) return 'justPassed';
  return 'upcoming';
}

function ZmanRow({ zman, time, state, tokens, compact = false }) {
  const isNext = state === 'next';
  const isPast = state === 'past';
  const isJustPassed = state === 'justPassed';

  const pastColor = isPast || isJustPassed ? tokens.dim : tokens.text;
  const pad = compact ? '5px 10px' : '10px 20px';
  const heSize = compact ? '20px' : '26px';
  const enSize = compact ? '11px' : '13px';
  const timeSize = compact ? '22px' : '28px';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      direction: 'rtl',
      padding: pad,
      borderRadius: isNext ? '4px' : '0',
      opacity: isPast ? 0.55 : isJustPassed ? 0.7 : 1,
      ...(isNext ? {
        background: tokens.goldBg,
        border: `1px solid ${tokens.goldBd}`,
        boxShadow: `0 0 20px ${tokens.goldBg}, inset 0 0 12px ${tokens.goldBg}`,
      } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{
          fontFamily: fonts.hebrewPrimary,
          fontSize: heSize,
          fontWeight: 500,
          color: isNext ? tokens.gold : pastColor,
        }}>
          {zman.he}
        </span>
        <span style={{
          fontFamily: fonts.englishBody,
          fontSize: enSize,
          color: isNext ? tokens.gold : tokens.dim,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          direction: 'ltr',
          unicodeBidi: 'isolate',
          display: 'inline-block',
        }}>
          {zman.en}
        </span>
      </div>
      <span style={{
        fontFamily: fonts.englishDisplay,
        fontWeight: 300,
        fontSize: timeSize,
        color: isNext ? tokens.gold : pastColor,
        direction: 'ltr',
        unicodeBidi: 'isolate',
        letterSpacing: '0.02em',
      }}>
        {time}
      </span>
    </div>
  );
}

export default function ZmanimSlide({ cache, tokens, settings, portrait = false, portraitLayout = 'compact' }) {
  const todayZmanim = cache?.zmanim?.today || {};
  const tomorrowZmanim = cache?.zmanim?.tomorrow;

  // Filter displayed zmanim — if zmanimVisible is set, only show those keys (in canonical order)
  const visibleKeys = settings?.zmanimVisible;
  const displayList = (visibleKeys?.length > 0)
    ? ZMANIM_DISPLAY.filter(z => visibleKeys.includes(z.k))
    : ZMANIM_DISPLAY;

  // Check if after sunset
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sunsetMinutes = parseTimeToMinutes(todayZmanim.sunset);
  const afterSunset = sunsetMinutes !== null && currentMinutes > sunsetMinutes;

  const isCompact = portrait && portraitLayout !== 'scroll';

  return (
    <div style={{ width: '100%', maxWidth: '720px' }}>
      {/* Today's zmanim */}
      {displayList.map(z => {
        const time = todayZmanim[z.k];
        if (!time) return null;

        const state = getZmanState(z.k, time, todayZmanim);

        return (
          <ZmanRow
            key={z.k}
            zman={z}
            time={time}
            state={state}
            tokens={tokens}
            compact={isCompact}
          />
        );
      })}

      {/* Tomorrow's zmanim (shown after sunset) */}
      {afterSunset && tomorrowZmanim && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '20px 0 12px', padding: '0 16px',
          }}>
            <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
            <span style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: '14px',
              color: tokens.copper,
              fontWeight: 500,
              display: 'inline-block',
              padding: '2px 12px',
              background: 'rgba(184,128,58,0.08)',
              border: '1px solid rgba(184,128,58,0.2)',
              borderRadius: '3px',
            }}>
              למחר
            </span>
            <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
          </div>
          {displayList.slice(0, 5).map(z => {
            const time = tomorrowZmanim[z.k];
            if (!time) return null;
            return (
              <div key={`tmrw-${z.k}`} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', direction: 'rtl',
                padding: isCompact ? '4px 10px' : '8px 20px',
              }}>
                <span style={{ fontFamily: fonts.hebrewPrimary, fontSize: isCompact ? '18px' : '22px', fontWeight: 500, color: tokens.copper }}>
                  {z.he}
                </span>
                <span style={{ fontFamily: fonts.englishDisplay, fontWeight: 300, fontSize: isCompact ? '20px' : '24px', color: tokens.copper, direction: 'ltr', unicodeBidi: 'isolate' }}>
                  {time}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
