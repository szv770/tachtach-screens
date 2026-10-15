import React, { useState, useEffect, useMemo } from 'react';
import { Panel, Empty, F, Bidi } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { isHebrew } from '../../design/time.js';

/** 'latest' = first item; 'random' = deterministic per day. */
function pickItem(items, mode) {
  if (!items || items.length === 0) return null;
  if (mode === 'random') {
    const today = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < today.length; i++) { hash = ((hash << 5) - hash) + today.charCodeAt(i); hash |= 0; }
    return items[Math.abs(hash) % items.length];
  }
  return items[0];
}

/** RSS page in the quote look: Torah-text face, one accent rule, the source. */
export default function RSSSlide({ slide, rssCache, rssFeeds }) {
  const feedId = slide?.rssFeedId;
  const [localCache, setLocalCache] = useState(null);
  useEffect(() => {
    if (!feedId || rssCache?.[feedId]) return;
    fetch(`/api/rss/cache/${feedId}`).then((r) => r.json()).then(setLocalCache).catch(() => {});
  }, [feedId, rssCache]);

  const items = (rssCache?.[feedId] || localCache)?.items || [];
  const item = useMemo(() => pickItem(items, slide?.rssDisplayMode || 'latest'), [items, slide?.rssDisplayMode]);
  if (!item) return <Panel><Empty en="Waiting for feed content…" /></Panel>;

  const m = (rssFeeds || []).find((f) => f.id === feedId)?.mapping || { primary: 'title', secondary: 'author', body: 'description', attribution: 'author' };
  const primary = String(item[m.primary] || '').trim();
  const body = String(item[m.body] || '').trim();
  const attribution = String(item[m.attribution] || '').trim();
  const secondary = String(item[m.secondary] || '').trim();
  const lead = primary || body;
  const hb = isHebrew(lead);
  const showBody = primary && body;

  return (
    <Panel pad="56px 72px 48px">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0, gap: 22 }}>
        <Fit data-s="" vcenter wrap max={showBody ? 92 : 120} dir={hb ? 'rtl' : 'ltr'} style={{
          '--i': 1, width: '92%', flex: showBody ? 1.3 : 1, minHeight: 0, textAlign: 'center', lineHeight: 1.2,
          fontFamily: hb ? 'var(--f-th)' : 'var(--f-te)', fontWeight: 500, fontStyle: !primary && !hb ? 'italic' : 'normal',
        }}>{lead}</Fit>
        {showBody && (
          <Fit data-s="" vcenter wrap max={44} dir={isHebrew(body) ? 'rtl' : 'ltr'} style={{ '--i': 2, width: '84%', flex: 1, minHeight: 0, textAlign: 'center', lineHeight: 1.4, color: 'var(--inkDim)', fontFamily: F.en, fontWeight: 500 }}>{body}</Fit>
        )}
        {(attribution || secondary) && (
          <>
            <div data-s="" style={{ '--i': 3, width: 72, height: 3, borderRadius: 2, background: 'var(--accentText)', flex: 'none' }} />
            <Bidi as="div" text={attribution || secondary} data-s="" style={{ '--i': 4, fontFamily: F.en, fontSize: 30, color: 'var(--inkDim)', fontWeight: 500, flex: 'none' }} />
          </>
        )}
      </div>
    </Panel>
  );
}
