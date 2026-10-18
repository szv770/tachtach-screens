import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Panel } from '../design/ui.jsx';
import { useDesign } from '../design/DesignRoot.jsx';
import ZmanimSlide from './slides/ZmanimSlide.jsx';
import LimudimSlide from './slides/LimudimSlide.jsx';
import HayomYomSlide from './slides/HayomYomSlide.jsx';
import ImageSlide from './slides/ImageSlide.jsx';
import PirkeiAvosSlide from './slides/PirkeiAvosSlide.jsx';
import DailyQuoteSlide from './slides/DailyQuoteSlide.jsx';
import DailyWordSlide from './slides/DailyWordSlide.jsx';
import ParshaTidbitsSlide from './slides/ParshaTidbitsSlide.jsx';
import VideoSlide from './slides/VideoSlide.jsx';
import GooglePhotosSlide from './slides/GooglePhotosSlide.jsx';
import ScheduleSlide from './slides/ScheduleSlide.jsx';
import RSSSlide from './slides/RSSSlide.jsx';
import WeatherSlide from './slides/WeatherSlide.jsx';
import MivtzahLeaderboardSlide from './slides/MivtzahLeaderboardSlide.jsx';
import MivtzahLiveEmbedSlide from './slides/MivtzahLiveEmbedSlide.jsx';
import WebPageSlide from './slides/WebPageSlide.jsx';
import CountdownOverlay from './CountdownOverlay.jsx';
import AnnouncementSlide from './slides/AnnouncementSlide.jsx';

/**
 * The page area: ONE page at a time, inside the rounded panel (R2 §4/§8).
 * Page transitions are the only motion (settings.motion): smooth = fade +
 * 14 px rise, minimal = crossfade, lively = fade + staggered children
 * ([data-s], CSS). Only opacity/transform; nothing loops. No category chip,
 * no slide index or progress (rotation is ambient).
 *
 * Pages that draw their own <Panel> (zmanim, schedule, limudim, …) are
 * rendered as is; media pages are framed in a full-bleed panel here.
 */

// Raw legacy rows (migrated at startup, kept for old servers) render as Big words.
function legacyItem(slide) {
  const b = slide._board || {};
  return {
    id: slide.id,
    content: {
      headlineHe: slide.titleHe ?? slide.textHe ?? b.textHe, headlineEn: slide.titleEn ?? slide.textEn ?? b.textEn ?? b.text,
      bodyHe: slide.bodyHe, bodyEn: slide.bodyEn, attribution: slide.attribution, subtitle: slide.subtitle ?? b.subtitle, target: b.target,
    },
    look: { layout: 'bigwords', style: slide.style || null },
  };
}

const MEDIA = new Set(['IMAGE_SLIDE', 'VIDEO_SLIDE', 'GOOGLE_PHOTOS_SLIDE', 'MIVTZAH_LIVE_EMBED', 'WEB_PAGE']);

const VARIANTS = {
  smooth: { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0, transition: { duration: 0.48, ease: [0.22, 0.7, 0.2, 1] } }, exit: { opacity: 0, transition: { duration: 0.26, ease: 'easeIn' } } },
  minimal: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.5, ease: 'linear' } }, exit: { opacity: 0, transition: { duration: 0.3, ease: 'linear' } } },
  lively: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.22 } }, exit: { opacity: 0, y: -10, transition: { duration: 0.3, ease: 'easeIn' } } },
};

export default function SlideCarousel({
  currentSlide, currentIndex, cache, tokens, settings, hold, onVideoEnded, onRequestDuration, googleAlbums,
  schedule, countdown, onCountdownComplete, rssCache, rssFeeds, portrait = false, portraitLayout = 'compact',
  dailyWords, dateISO,
}) {
  const { motion: mode } = useDesign();
  if (hold) currentSlide = hold;

  // Slide-mode schedule countdown shows in the page area (rotation not paused).
  if (countdown && !hold) {
    return (
      <Panel>
        <CountdownOverlay countdown={countdown} tokens={tokens} onComplete={onCountdownComplete} embedded />
      </Panel>
    );
  }
  if (!currentSlide) return null;

  function renderSlide(slide) {
    switch (slide.type) {
      case 'ZMANIM': return <ZmanimSlide cache={cache} tokens={tokens} settings={settings} />;
      case 'LIMUDIM': return <LimudimSlide cache={cache} tokens={tokens} settings={settings} portrait={portrait} portraitLayout={portraitLayout} />;
      case 'HAYOM_YOM': return <HayomYomSlide cache={cache} tokens={tokens} settings={settings} onRequestDuration={onRequestDuration} />;
      case 'PIRKEI_AVOS': return <PirkeiAvosSlide cache={cache} tokens={tokens} />;
      case 'DAILY_QUOTE': return <DailyQuoteSlide cache={cache} tokens={tokens} />;
      case 'DAILY_WORD': return <DailyWordSlide dailyWords={dailyWords} dateISO={dateISO} />;
      case 'PARSHA_TIDBITS': return <ParshaTidbitsSlide cache={cache} tokens={tokens} />;
      case 'IMAGE_SLIDE': return <ImageSlide slide={slide} tokens={tokens} />;
      case 'VIDEO_SLIDE': return <VideoSlide slide={slide} tokens={tokens} onEnded={onVideoEnded} />;
      case 'TEXT_SLIDE':
      case 'custom':
      case 'PINNED_SLIDE':
      case 'BOARD_SLIDE': return <AnnouncementSlide item={legacyItem(slide)} />;
      case 'GOOGLE_PHOTOS_SLIDE': return <GooglePhotosSlide slide={slide} tokens={tokens} googleAlbums={googleAlbums} />;
      case 'RSS_SLIDE': return <RSSSlide slide={slide} tokens={tokens} rssCache={rssCache} rssFeeds={rssFeeds} />;
      case 'WEATHER': return <WeatherSlide cache={cache} settings={settings} />;
      case 'MIVTZAH_LEADERBOARD': return <MivtzahLeaderboardSlide cache={cache} tokens={tokens} />;
      case 'MIVTZAH_LIVE_EMBED': return <MivtzahLiveEmbedSlide slide={slide} tokens={tokens} />;
      case 'WEB_PAGE': return <WebPageSlide slide={slide} />;
      case 'SCHEDULE': return <ScheduleSlide schedule={schedule} tokens={tokens} settings={settings} />;
      case 'COUNTDOWN': return <CountdownOverlay countdown={countdown} tokens={tokens} onComplete={onCountdownComplete} embedded />;
      case 'ANNOUNCEMENT': return <AnnouncementSlide item={slide._ann} onRequestDuration={onRequestDuration} />;
      default: return null;
    }
  }

  const v = VARIANTS[mode] || VARIANTS.smooth;
  const body = MEDIA.has(currentSlide.type)
    ? <Panel fullBleed style={{ borderRadius: 32 }}>{renderSlide(currentSlide)}</Panel>
    : renderSlide(currentSlide);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${currentSlide.id}-${currentIndex}`}
          className={mode === 'lively' ? 'tt-page tt-enter' : 'tt-page'}
          initial={v.initial}
          animate={v.animate}
          exit={v.exit}
          style={{
            position: 'absolute', inset: 0, display: 'flex', minHeight: 0,
            overflowY: portrait && portraitLayout === 'scroll' ? 'auto' : 'hidden',
          }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
