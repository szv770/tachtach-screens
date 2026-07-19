import React from 'react';
import { fonts } from '../styles/tokens.js';
import { hNum } from '../../shared/constants.js';

const SEFIROS = ['חֶסֶד', 'גְּבוּרָה', 'תִּפְאֶרֶת', 'נֶצַח', 'הוֹד', 'יְסוֹד', 'מַלְכוּת'];
const SEFIROS_PLAIN = ['חסד', 'גבורה', 'תפארת', 'נצח', 'הוד', 'יסוד', 'מלכות'];

function getSefira(count) {
  if (!count || count < 1 || count > 49) return null;
  const weekIdx = Math.floor((count - 1) / 7);
  const dayIdx = (count - 1) % 7;
  return `${SEFIROS_PLAIN[dayIdx]} שב${SEFIROS_PLAIN[weekIdx]}`;
}

// Map Hebrew month names between Hebcal format and CustomDays editor format
const MONTH_ALIASES = {
  'Iyyar': 'Iyar', 'Iyar': 'Iyyar',
  'Tevet': 'Teves', 'Teves': 'Tevet',
  'Heshvan': 'Cheshvan', 'Cheshvan': 'Heshvan',
};

function getTodayCustomDays(customDays, hebrewDate) {
  if (!customDays?.length || !hebrewDate) return [];
  const now = new Date();
  const gMonth = now.getMonth() + 1;
  const gDay = now.getDate();
  const hMonth = hebrewDate.hebrewMonth;
  const hDay = hebrewDate.hebrewDay;

  return customDays.filter(d => {
    if (d.hebrewMonth) {
      const monthMatch = d.hebrewMonth === hMonth || d.hebrewMonth === MONTH_ALIASES[hMonth];
      return monthMatch && d.hebrewDay === hDay;
    }
    if (d.gregorianMonth) {
      return d.gregorianMonth === gMonth && d.gregorianDay === gDay;
    }
    return false;
  });
}

/**
 * Strip the "ב" prefix (with optional niqqud) from Hebrew month names.
 * e.g. "ו׳ בְּאִיָיר תשפ״ו" → "ו׳ אִיָיר תשפ״ו"
 */
function stripBetPrefix(str) {
  if (!str) return str;
  return str.replace(/\s+ב[\u0590-\u05CF]*(?=[א-ת])/, ' ');
}

export default function HebrewDate({ hebrewDate, parsha, omer, tokens, visibility, customDays, compact = false }) {
  const englishDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  if (compact) {
    // Compact portrait top-bar mode — tight horizontal layout
    return (
      <div style={{ padding: '0 8px', direction: 'rtl' }}>
        {visibility?.hebrewDate !== false && hebrewDate?.hebrew && (
          <div style={{
            fontFamily: fonts.hebrewDisplay,
            fontSize: '24px',
            fontWeight: 500,
            color: tokens.text,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {stripBetPrefix(hebrewDate.hebrew)}
          </div>
        )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginTop: '2px',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: fonts.englishBody,
            fontSize: '11px',
            color: tokens.dim,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            direction: 'ltr',
            unicodeBidi: 'isolate',
            flexShrink: 0,
          }}>
            {englishDate}
          </span>
          {visibility?.parsha !== false && parsha?.hebrew && (
            <span style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: '13px',
              fontWeight: 500,
              color: tokens.gold,
              padding: '1px 8px',
              background: tokens.goldBg,
              border: `1px solid ${tokens.goldBd}`,
              borderRadius: '3px',
              flexShrink: 0,
            }}>
              {parsha.hebrew}
            </span>
          )}
          {visibility?.omer !== false && omer?.count && (
            <span style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: '16px',
              fontWeight: 600,
              color: tokens.gold,
              flexShrink: 0,
              direction: 'rtl',
              unicodeBidi: 'isolate',
            }}>
              {hNum(omer.count)} לעומר
              {getSefira(omer.count) && (
                <span style={{ fontWeight: 400, opacity: 0.75, marginRight: '6px', fontSize: '13px' }}>
                  {' · '}{getSefira(omer.count)}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '0 16px' }}>
      {/* Ornamental divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          margin: '12px 0',
        }}
      >
        <div
          style={{
            flex: 1,
            height: '1px',
            background: `linear-gradient(to right, transparent, ${tokens.muted})`,
          }}
        />
        <span style={{ color: tokens.gold, fontSize: '10px', letterSpacing: '0.2em' }}>
          ✦
        </span>
        <div
          style={{
            flex: 1,
            height: '1px',
            background: `linear-gradient(to left, transparent, ${tokens.muted})`,
          }}
        />
      </div>

      {/* Hebrew date - large */}
      {visibility?.hebrewDate !== false && hebrewDate?.hebrew && (
        <div
          style={{
            fontFamily: fonts.hebrewDisplay,
            fontSize: '52px',
            fontWeight: 500,
            color: tokens.text,
            lineHeight: 1.2,
            marginBottom: '4px',
          }}
        >
          {stripBetPrefix(hebrewDate.hebrew)}
        </div>
      )}

      {/* English date - smaller */}
      <div
        style={{
          fontFamily: fonts.englishBody,
          fontSize: '16px',
          color: tokens.dim,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          direction: 'ltr',
          unicodeBidi: 'isolate',
          marginBottom: '16px',
        }}
      >
        {englishDate}
      </div>

      {/* Parsha badge */}
      {visibility?.parsha !== false && parsha?.hebrew && (
        <div
          style={{
            display: 'inline-block',
            padding: '4px 16px',
            background: tokens.goldBg,
            border: `1px solid ${tokens.goldBd}`,
            borderRadius: '4px',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: '18px',
              fontWeight: 500,
              color: tokens.gold,
            }}
          >
            {parsha.hebrew}
          </span>
        </div>
      )}

      {/* Custom days */}
      {getTodayCustomDays(customDays, hebrewDate).map((day, i) => (
        <div
          key={day.id || i}
          style={{
            display: 'inline-block',
            padding: '4px 16px',
            background: tokens.goldBg,
            border: `1px solid ${tokens.goldBd}`,
            borderRadius: '4px',
            marginBottom: '8px',
            marginTop: i === 0 ? '4px' : 0,
          }}
        >
          <span style={{
            fontFamily: fonts.hebrewPrimary,
            fontSize: '16px',
            fontWeight: 500,
            color: tokens.gold,
          }}>
            {day.title}
          </span>
          {day.subtitle && (
            <span style={{
              fontFamily: fonts.englishBody,
              fontSize: '12px',
              color: tokens.dim,
              display: 'block',
              direction: 'ltr',
              unicodeBidi: 'isolate',
            }}>
              {day.subtitle}
            </span>
          )}
        </div>
      ))}

      {/* Omer count */}
      {visibility?.omer !== false && omer?.count && (
        <div style={{ marginTop: '8px', direction: 'rtl' }}>
          <div style={{
            fontFamily: fonts.hebrewPrimary,
            fontSize: '22px',
            fontWeight: 600,
            color: tokens.gold,
          }}>
            {hNum(omer.count)} לעומר
          </div>
          {getSefira(omer.count) && (
            <div style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: '16px',
              fontWeight: 400,
              color: tokens.gold,
              opacity: 0.7,
              marginTop: '2px',
            }}>
              {getSefira(omer.count)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
