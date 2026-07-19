import React, { useState, useEffect, useMemo } from 'react';
import { fonts } from '../../styles/tokens.js';

/**
 * Pick which RSS item to display based on the display mode.
 * - 'latest' => first item in the list (most recent)
 * - 'random' => deterministic random based on the current date (changes daily)
 */
function pickItem(items, displayMode) {
  if (!items || items.length === 0) return null;
  if (displayMode === 'random') {
    // Use the date string as a seed for deterministic daily selection
    const today = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < today.length; i++) {
      hash = ((hash << 5) - hash) + today.charCodeAt(i);
      hash |= 0;
    }
    return items[Math.abs(hash) % items.length];
  }
  // 'latest' — first item
  return items[0];
}

export default function RSSSlide({ slide, tokens, rssCache, rssFeeds }) {
  const feedId = slide?.rssFeedId;
  const displayMode = slide?.rssDisplayMode || 'latest';

  // Local cache state — fetched client-side as a fallback if rssCache isn't provided
  const [localCache, setLocalCache] = useState(null);

  useEffect(() => {
    if (!feedId || rssCache?.[feedId]) return;
    fetch(`/api/rss/cache/${feedId}`)
      .then(r => r.json())
      .then(data => setLocalCache(data))
      .catch(() => {});
  }, [feedId, rssCache]);

  const cacheData = rssCache?.[feedId] || localCache;
  const items = cacheData?.items || [];

  const item = useMemo(() => pickItem(items, displayMode), [items, displayMode]);

  if (!item) {
    return (
      <div style={{
        width: '100%',
        textAlign: 'center',
        color: tokens.dim,
        fontFamily: fonts.englishBody,
        fontSize: '16px',
      }}>
        Waiting for feed content...
      </div>
    );
  }

  // Look up the feed config from rssFeeds to get the mapping
  const feedConfig = (rssFeeds || []).find(f => f.id === feedId);
  const mapping = feedConfig?.mapping || {
    primary: 'title',
    secondary: 'author',
    body: 'description',
    attribution: 'author',
  };

  const primary = item[mapping.primary] || '';
  const secondary = item[mapping.secondary] || '';
  const body = item[mapping.body] || '';
  const attribution = item[mapping.attribution] || '';

  return (
    <div style={{
      width: '100%',
      maxWidth: '700px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: '12px',
    }}>
      {/* Decorative quote mark for body-heavy content */}
      {body && !primary && (
        <div style={{
          fontFamily: 'Georgia, serif',
          fontSize: '72px',
          color: tokens.gold,
          lineHeight: 0.6,
          opacity: 0.5,
        }}>
          {'\u201C'}
        </div>
      )}

      {/* Primary text */}
      {primary && (
        <div style={{
          fontFamily: fonts.englishDisplay,
          fontSize: body ? '32px' : '40px',
          fontWeight: 500,
          color: tokens.text,
          lineHeight: 1.3,
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}>
          {primary}
        </div>
      )}

      {/* Secondary text */}
      {secondary && secondary !== attribution && (
        <div style={{
          fontFamily: fonts.englishDisplay,
          fontSize: '18px',
          fontWeight: 300,
          fontStyle: 'italic',
          color: tokens.dim,
          lineHeight: 1.4,
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}>
          {secondary}
        </div>
      )}

      {/* Divider */}
      {primary && body && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '60%', margin: '4px 0' }}>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
          <span style={{ color: tokens.gold, fontSize: '10px' }}>{'\u2726'}</span>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
        </div>
      )}

      {/* Body text */}
      {body && (
        <div style={{
          fontFamily: fonts.englishDisplay,
          fontSize: primary ? '18px' : '24px',
          fontWeight: primary ? 300 : 400,
          fontStyle: primary ? 'normal' : 'italic',
          color: primary ? tokens.dim : tokens.text,
          lineHeight: 1.6,
          direction: 'ltr',
          unicodeBidi: 'isolate',
          maxHeight: '200px',
          overflow: 'hidden',
        }}>
          {body}
        </div>
      )}

      {/* Attribution */}
      {attribution && (
        <div style={{
          fontFamily: fonts.englishBody,
          fontSize: '14px',
          color: tokens.gold,
          letterSpacing: '0.06em',
          marginTop: '8px',
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}>
          — {attribution}
        </div>
      )}
    </div>
  );
}
