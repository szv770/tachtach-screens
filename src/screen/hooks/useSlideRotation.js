import { useState, useEffect, useRef, useCallback } from 'react';

export function useSlideRotation(slides, messages) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [overrideDuration, setOverrideDuration] = useState(null);
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const startTimeRef = useRef(null);

  // Filter to enabled slides; hide PIRKEI_AVOS except on Shabbos
  // Shabbos = Friday sunset through Saturday sunset (simplified: Saturday by day-of-week)
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  const enabledSlides = slides.filter(s => {
    if (!s.enabled) return false;
    if (s.type === 'PIRKEI_AVOS' && dayOfWeek !== 6) return false;
    // Live embed with no URL configured yet has nothing to show — keep it out of rotation
    // (same idea as the disabled check above) rather than displaying a placeholder to the audience.
    if (s.type === 'MIVTZAH_LIVE_EMBED' && !(s.embedUrl || '').trim()) return false;
    return true;
  });

  // Check for active takeover message (pauses everything)
  const activeTakeover = messages.find(m =>
    m.type === 'takeover' &&
    (!m.expiresAt || new Date(m.expiresAt) > new Date())
  );

  // Check for active board messages (replace slide content)
  const activeBoards = messages.filter(m =>
    m.type === 'board' &&
    (!m.expiresAt || new Date(m.expiresAt) > new Date())
  );

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
      return;
    }

    startTimeRef.current = Date.now();

    timerRef.current = setTimeout(advance, duration);

    // Progress bar animation
    const animate = () => {
      if (startTimeRef.current) {
        const elapsed = Date.now() - startTimeRef.current;
        setProgress(Math.min(elapsed / duration, 1));
      }
      progressRef.current = requestAnimationFrame(animate);
    };
    progressRef.current = requestAnimationFrame(animate);

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(progressRef.current);
    };
  }, [currentIndex, isPaused, activeTakeover, duration, advance, enabledSlides.length, isVideoNoTimer]);

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
    activeTakeover,
    activeBoards,
    advance,
    goToSlide,
    setOverrideDuration,
  };
}
