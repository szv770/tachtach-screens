import { useEffect, useState } from 'react';

/**
 * Current time, re-rendering every `ms` (aligned to the wall clock so all
 * pages flip state on the same second). Pages own their tick so the App's
 * 1 s clock doesn't re-render page content (SlideCarousel is memoized).
 */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t;
    const tick = () => {
      setNow(new Date());
      t = setTimeout(tick, ms - (Date.now() % ms) + 20);
    };
    t = setTimeout(tick, ms - (Date.now() % ms) + 20);
    return () => clearTimeout(t);
  }, [ms]);
  return now;
}

/** Place name for page titles ("Zmanim · Miami Beach"). */
export function placeName(cache, settings) {
  return cache?.weather?.location?.name || settings?.location?.placeName || '';
}
