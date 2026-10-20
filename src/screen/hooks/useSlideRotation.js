import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * @param {object[]} slides — rotation (regular slides + announcement slides)
 * @param {{ paused?: boolean }} opts — paused: an active takeover or a
 *   "pause everything else" announcement is showing; the timer stops and
 *   resumes on the same slide afterwards. Banners never pause rotation.
 */
export function useSlideRotation(slides, { paused: externalPause = false } = {}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [overrideDuration, setOverrideDuration] = useState(null);
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const startTimeRef = useRef(null);
  // Follow-the-TV: a seek says 'this slide is already elapsedMs in', so the timer only runs the remainder.
  const offsetRef = useRef(0);
  const [syncTick, setSyncTick] = useState(0);

  // Filter to enabled slides; hide PIRKEI_AVOS except on Shabbos
  // Shabbos = Friday sunset through Saturday sunset (simplified: Saturday by day-of-week)
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  const enabledSlides = slides.filter(s => {
    if (!s.enabled) return false;
    if (s.type === 'PIRKEI_AVOS' && dayOfWeek !== 6) return false;
    // Live embed with no URL configured yet has nothing to show — keep it out of rotation
    // (same idea as the disabled check above) rather than displaying a placeholder to the audience.
    if ((s.type === 'MIVTZAH_LIVE_EMBED' || s.type === 'WEB_PAGE') && !(s.embedUrl || '').trim()) return false;
    return true;
  });

  const activeTakeover = externalPause;

  const currentSlide = enabledSlides[currentIndex] || enabledSlides[0];
  // duration 0 on video slides means "play full clip, don't auto-advance"
  const isVideoNoTimer = currentSlide?.type === 'VIDEO_SLIDE' && currentSlide?.duration === 0;
  // overrideDuration allows a slide (e.g. HayomYom) to request a longer duration based on content length
  const duration = isVideoNoTimer ? 0 : ((overrideDuration ?? currentSlide?.duration ?? 13) * 1000);

  // Reset override whenever the slide changes
  useEffect(() => {
    setOverrideDuration(null);
  }, [currentIndex]);

  const advance = useCallback(() => {
    if (enabledSlides.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % enabledSlides.length);
    setProgress(0);
    startTimeRef.current = Date.now();
  }, [enabledSlides.length]);

  const previous = useCallback(() => {
    if (enabledSlides.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + enabledSlides.length) % enabledSlides.length);
    setProgress(0);
    startTimeRef.current = Date.now();
  }, [enabledSlides.length]);

  // Jump to a slide as if it had started elapsedMs ago and re-arm the timer for what is left of it.
  const seekTo = useCallback((index, elapsedMs = 0) => {
    if (index < 0 || index >= enabledSlides.length) return;
    offsetRef.current = Math.max(0, elapsedMs || 0);
    setCurrentIndex(index);
    setProgress(0);
    setSyncTick(t => t + 1);
  }, [enabledSlides.length]);

  const goToSlide = useCallback((index) => {
    if (index < 0 || index >= enabledSlides.length) return;
    setCurrentIndex(index);
    setProgress(0);
    startTimeRef.current = Date.now();
  }, [enabledSlides.length]);

  // Slide timer
  useEffect(() => {
    if (isPaused || activeTakeover || enabledSlides.length === 0 || isVideoNoTimer) {
      clearInterval(timerRef.current);
      cancelAnimationFrame(progressRef.current);
      offsetRef.current = 0; // a stopped timer restarts from zero when it resumes
      return;
    }

    const offset = Math.min(offsetRef.current, Math.max(0, duration - 50));
    offsetRef.current = 0;
    startTimeRef.current = Date.now() - offset;

    timerRef.current = setTimeout(advance, duration - offset);

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(progressRef.current);
    };
  }, [currentIndex, isPaused, activeTakeover, duration, advance, enabledSlides.length, isVideoNoTimer, syncTick]);

  // Reset index if it's out of bounds
  useEffect(() => {
    if (currentIndex >= enabledSlides.length && enabledSlides.length > 0) {
      setCurrentIndex(0);
    }
  }, [enabledSlides.length, currentIndex]);

  return {
    currentSlide,
    currentIndex,
    enabledSlides,
    progress,
    isPaused,
    setIsPaused,
    advance,
    previous,
    seekTo,
    duration,
    goToSlide,
    setOverrideDuration,
  };
}
