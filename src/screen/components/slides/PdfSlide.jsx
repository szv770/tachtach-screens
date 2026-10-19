import React, { useEffect, useState } from 'react';
import ImageSlide from './ImageSlide.jsx';
import { clampPageSeconds } from '../../../shared/pdfPages.js';

/**
 * A PDF turned into page pictures (server side): shows each page for `pageSeconds`, one after another,
 * and asks the rotation to keep the slide up for pages x seconds, so the whole document plays once.
 * Pages are drawn by ImageSlide (fit / fill / edge treatment). No animation of its own.
 */
export default function PdfSlide({ slide, tokens, onRequestDuration }) {
  const pages = Array.isArray(slide?.pdfPages) ? slide.pdfPages : [];
  const per = clampPageSeconds(slide?.pageSeconds);
  const [i, setI] = useState(0);
  const key = pages.join('|');

  useEffect(() => {
    setI(0);
    if (!pages.length) return undefined;
    onRequestDuration?.(pages.length * per);
    if (pages.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % pages.length), per * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, per]);

  // Warm the next page so the change is instant.
  useEffect(() => {
    if (pages.length > 1) { const img = new Image(); img.src = pages[(i + 1) % pages.length]; }
  }, [i, key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pages.length) return null;
  return <ImageSlide slide={{ ...slide, imageUrl: pages[i], blurUrl: undefined }} tokens={tokens} />;
}
