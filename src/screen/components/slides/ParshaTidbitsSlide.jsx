import React, { useEffect, useRef, useState } from 'react';
import { fonts } from '../../styles/tokens.js';

export default function ParshaTidbitsSlide({ cache, tokens }) {
  const tidbits = cache?.parshaTidbits?.items;
  const scrollRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const animRef = useRef(null);

  // Filter to items that have descriptions (meaningful content)
  const items = (tidbits || []).filter(t => t.description);

  // Slow auto-scroll animation
  useEffect(() => {
    if (!scrollRef.current || items.length === 0) return;

    let start = null;
    const speed = 30; // pixels per second

    const tick = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = (timestamp - start) / 1000;
      const el = scrollRef.current;
      if (!el) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      const newOffset = (elapsed * speed) % (maxScroll + 200);

      if (newOffset <= maxScroll) {
        el.scrollTop = newOffset;
      } else {
        // Pause at the bottom briefly, then reset
        if (newOffset > maxScroll + 180) {
          start = timestamp;
          el.scrollTop = 0;
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div style={{
        fontFamily: fonts.englishBody,
        fontSize: '16px',
        color: tokens.dim,
        fontStyle: 'italic',
        direction: 'ltr', unicodeBidi: 'isolate',
      }}>
        No parsha tidbits available
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          paddingRight: '8px',
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              marginBottom: '20px',
              paddingBottom: '20px',
              borderBottom: i < items.length - 1 ? `1px solid ${tokens.muted}` : 'none',
            }}
          >
            <div style={{
              fontFamily: fonts.englishDisplay,
              fontSize: '20px',
              fontWeight: 600,
              color: tokens.text,
              direction: 'ltr', unicodeBidi: 'isolate',
              marginBottom: '8px',
              lineHeight: 1.3,
            }}>
              {item.title}
            </div>
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '15px',
              color: tokens.dim,
              direction: 'ltr', unicodeBidi: 'isolate',
              lineHeight: 1.6,
            }}>
              {item.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
