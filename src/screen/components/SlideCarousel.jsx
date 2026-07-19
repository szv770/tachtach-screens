import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts, slideTransition } from '../styles/tokens.js';

function BoardDisplay({ boards, tokens }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      padding: '32px',
    }}>
      {boards.map(board => (
        <div key={board.id} style={{
          width: '100%', maxWidth: '640px',
          padding: '28px 32px',
          background: tokens.surface,
          border: `1px solid ${tokens.goldBd}`,
          borderRadius: '6px',
          marginBottom: '16px',
          textAlign: 'center',
        }}>
          {board.target && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '11px',
              fontWeight: 600,
              color: tokens.gold,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: '12px',
              direction: 'ltr',
              unicodeBidi: 'isolate',
            }}>
              {board.target}
            </div>
          )}
          <div style={{
            fontFamily: fonts.hebrewPrimary,
            fontSize: '26px',
            fontWeight: 500,
            color: tokens.text,
            lineHeight: 1.5,
          }}>
            {board.textHe || board.textEn || board.text}
          </div>
          {board.textEn && board.textHe && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '15px',
              color: tokens.dim,
              marginTop: '10px',
              direction: 'ltr',
              unicodeBidi: 'isolate',
            }}>
              {board.textEn}
            </div>
          )}
          {board.subtitle && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '13px',
              color: tokens.dim,
              marginTop: '10px',
              direction: 'ltr',
              unicodeBidi: 'isolate',
              fontStyle: 'italic',
            }}>
              {board.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function getLogoBlendFilter(blend, tokens) {
  if (!blend || blend === 'original') return {};
  if (blend === 'subtle') return { filter: 'none', opacity: 0.2 };
  if (blend === 'mono-gold') return { filter: 'sepia(1) saturate(3) brightness(0.8) hue-rotate(15deg)' };
  if (blend === 'match-theme') {
    const bg = (tokens.bg || '').trim();
    const isDark = /^#[0-3]/i.test(bg) || bg.startsWith('rgb(0') || bg.startsWith('rgb(1') || bg.startsWith('rgb(2') || bg.startsWith('rgb(3');
    return { filter: isDark ? 'brightness(0) invert(1)' : 'brightness(0)' };
  }
  return {};
}

function SlideCreditContent({ credit, tokens }) {
  const logo = credit.logo;
  const logoSizePx = logo?.size === 'large' ? 64 : logo?.size === 'small' ? 28 : 44;
  const logoPosition = logo?.position || 'above';
  const textFontSize = credit.size === 'large' ? '20px' : credit.size === 'medium' ? '15px' : '11px';
  const blendStyle = getLogoBlendFilter(logo?.blend, tokens);

  const creditOpacity = credit.size === 'large' ? 1.0 : credit.size === 'medium' ? 0.8 : 0.55;
  const textEl = credit.text ? (
    <span style={{ fontFamily: fonts.englishBody, fontSize: textFontSize, color: tokens.dim }}>
      {credit.text}
    </span>
  ) : null;

  const logoEl = logo?.url ? (
    <img
      src={logo.url}
      alt=""
      style={{
        height: `${logoSizePx}px`,
        width: 'auto',
        objectFit: 'contain',
        opacity: blendStyle.opacity !== undefined ? blendStyle.opacity : 1,
        display: 'block',
        ...(blendStyle.filter ? { filter: blendStyle.filter } : {}),
      }}
    />
  ) : null;

  if (!logoEl && !textEl) return null;
  if (!logoEl) return textEl;
  if (!textEl) return logoEl;

  if (logoPosition === 'above') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        {logoEl}
        {textEl}
      </div>
    );
  }

  const isLeft = logoPosition === 'left';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexDirection: isLeft ? 'row' : 'row-reverse' }}>
      {logoEl}
      {textEl}
    </div>
  );
}
import ZmanimSlide from './slides/ZmanimSlide.jsx';
import LimudimSlide from './slides/LimudimSlide.jsx';
import HayomYomSlide from './slides/HayomYomSlide.jsx';
import TextSlide from './slides/TextSlide.jsx';
import StyledSlide from './slides/StyledSlide.jsx';
import ImageSlide from './slides/ImageSlide.jsx';
import PirkeiAvosSlide from './slides/PirkeiAvosSlide.jsx';
import DailyQuoteSlide from './slides/DailyQuoteSlide.jsx';
import ParshaTidbitsSlide from './slides/ParshaTidbitsSlide.jsx';
import PinnedSlide from './slides/PinnedSlide.jsx';
import VideoSlide from './slides/VideoSlide.jsx';
import GooglePhotosSlide from './slides/GooglePhotosSlide.jsx';
import ScheduleSlide from './slides/ScheduleSlide.jsx';
import RSSSlide from './slides/RSSSlide.jsx';
import MivtzahLeaderboardSlide from './slides/MivtzahLeaderboardSlide.jsx';
import MivtzahLiveEmbedSlide from './slides/MivtzahLiveEmbedSlide.jsx';
import CountdownOverlay from './CountdownOverlay.jsx';

const SLIDE_LABELS = {
  ZMANIM: 'זמנים',
  LIMUDIM: 'לימודים',
  HAYOM_YOM: 'היום יום',
  PIRKEI_AVOS: 'פרקי אבות',
  DAILY_QUOTE: 'ציטוט היום',
  PARSHA_TIDBITS: 'פרשת השבוע',
  IMAGE_SLIDE: 'תמונה',
  VIDEO_SLIDE: 'סרטון',
  TEXT_SLIDE: 'הודעה',
  PINNED_SLIDE: 'הצמדה',
  GOOGLE_PHOTOS_SLIDE: 'תמונות',
  SCHEDULE: 'סדר הישיבה',
  COUNTDOWN: 'ספירה לאחור',
  RSS_SLIDE: 'RSS',
  MIVTZAH_LEADERBOARD: 'Mivtzah',
  MIVTZAH_LIVE_EMBED: 'Mivtzah Live',
};

export default function SlideCarousel({ currentSlide, currentIndex, enabledSlides, progress, cache, tokens, settings, activeBoards, onVideoEnded, onRequestDuration, googleAlbums, schedule, countdown, onCountdownComplete, credit, rssCache, rssFeeds, portrait = false, portraitLayout = 'compact' }) {
  if (!currentSlide) return null;

  // Blocking board messages replace all slides (opt-in via board.blocking flag)
  const blockingBoards = activeBoards?.filter(b => b.blocking) || [];
  if (blockingBoards.length > 0) {
    return <BoardDisplay boards={blockingBoards} tokens={tokens} />;
  }

  const label = currentSlide.label || currentSlide.title || SLIDE_LABELS[currentSlide.type] || '';

  function renderSlide(slide) {
    switch (slide.type) {
      case 'ZMANIM': return <ZmanimSlide cache={cache} tokens={tokens} settings={settings} portrait={portrait} portraitLayout={portraitLayout} />;
      case 'LIMUDIM': return <LimudimSlide cache={cache} tokens={tokens} settings={settings} portrait={portrait} portraitLayout={portraitLayout} />;
      case 'HAYOM_YOM': return <HayomYomSlide cache={cache} tokens={tokens} settings={settings} onRequestDuration={onRequestDuration} />;
      case 'PIRKEI_AVOS': return <PirkeiAvosSlide cache={cache} tokens={tokens} />;
      case 'DAILY_QUOTE': return <DailyQuoteSlide cache={cache} tokens={tokens} />;
      case 'PARSHA_TIDBITS': return <ParshaTidbitsSlide cache={cache} tokens={tokens} />;
      case 'IMAGE_SLIDE': return <ImageSlide slide={slide} tokens={tokens} />;
      case 'VIDEO_SLIDE': return <VideoSlide slide={slide} tokens={tokens} onEnded={onVideoEnded} />;
      case 'TEXT_SLIDE':
      case 'custom': return slide.style ? <StyledSlide slide={slide} tokens={tokens} /> : <TextSlide slide={slide} tokens={tokens} />;
      case 'PINNED_SLIDE': return <PinnedSlide slide={slide} tokens={tokens} />;
      case 'GOOGLE_PHOTOS_SLIDE': return <GooglePhotosSlide slide={slide} tokens={tokens} googleAlbums={googleAlbums} />;
      case 'RSS_SLIDE': return <RSSSlide slide={slide} tokens={tokens} rssCache={rssCache} rssFeeds={rssFeeds} />;
      case 'MIVTZAH_LEADERBOARD': return <MivtzahLeaderboardSlide cache={cache} tokens={tokens} />;
      case 'MIVTZAH_LIVE_EMBED': return <MivtzahLiveEmbedSlide slide={slide} tokens={tokens} />;
      case 'SCHEDULE': return <ScheduleSlide schedule={schedule} tokens={tokens} settings={settings} />;
      case 'COUNTDOWN': return <CountdownOverlay countdown={countdown} tokens={tokens} onComplete={onCountdownComplete} />;
      case 'BOARD_SLIDE': return <BoardDisplay boards={[slide._board]} tokens={tokens} />;
      default: return null;
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Category chip -- top right */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        zIndex: 5,
        padding: '3px 12px',
        background: tokens.goldBg,
        border: `1px solid ${tokens.goldBd}`,
        borderRadius: '3px',
      }}>
        <span style={{
          fontFamily: fonts.hebrewPrimary,
          fontSize: '13px',
          fontWeight: 500,
          color: tokens.gold,
          letterSpacing: '0.04em',
        }}>
          {label}
        </span>
      </div>

      {/* Slide content with AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${currentSlide.id}-${currentIndex}`}
          initial={slideTransition.initial}
          animate={slideTransition.animate}
          exit={slideTransition.exit}
          transition={slideTransition.transition}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: portrait && portraitLayout === 'scroll' ? 'flex-start' : 'center',
            justifyContent: 'center',
            overflowY: portrait && portraitLayout === 'scroll' ? 'auto' : 'hidden',
            padding: (() => {
              if (currentSlide.type === 'IMAGE_SLIDE' || currentSlide.type === 'VIDEO_SLIDE' || currentSlide.type === 'GOOGLE_PHOTOS_SLIDE' || currentSlide.type === 'MIVTZAH_LIVE_EMBED') return '8px';
              if (portrait) return portraitLayout === 'scroll' ? '48px 14px 16px' : '44px 14px 12px';
              return '48px 40px 32px';
            })(),
          }}
        >
          {renderSlide(currentSlide)}
        </motion.div>
      </AnimatePresence>

      {/* Credit line — on specific slide */}
      {credit?.enabled && (credit?.text || credit?.logo?.url) && credit?.position === 'slide' && credit?.slideId === currentSlide.id && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '16px',
          opacity: creditOpacity,
          zIndex: 6,
          direction: 'ltr',
          pointerEvents: 'none',
        }}>
          <SlideCreditContent credit={credit} tokens={tokens} />
        </div>
      )}

    </div>
  );
}
