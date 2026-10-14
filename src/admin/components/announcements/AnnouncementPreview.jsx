import React, { useEffect, useRef, useState } from 'react';
import { getTokens, applyFontSettings, fonts } from '../../../screen/styles/tokens.js';
import Layout from '../../../screen/components/Layout.jsx';
import Clock from '../../../screen/components/Clock.jsx';
import PinnedNotes from '../../../screen/components/PinnedNotes.jsx';
import SlideCarousel from '../../../screen/components/SlideCarousel.jsx';
import Banner, { bannerHeightFor } from '../../../screen/components/messages/Banner.jsx';
import { AnnouncementTakeover } from '../../../screen/components/slides/AnnouncementSlide.jsx';
import { toRotationSlide, toBannerRow, toNoteRow } from '../../../screen/lib/announcementView.js';
import { colors } from '../../styles/admin-tokens.js';

const W = 1600;
const H = 900;

function clockNow() {
  const d = new Date();
  const h = d.getHours();
  return {
    formatted: `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`,
    ampm: h < 12 ? 'AM' : 'PM',
    seconds: String(d.getSeconds()).padStart(2, '0'),
  };
}

/** Placeholder slide shown behind a banner / side note preview. */
function PlaceholderSlide({ tokens }) {
  return (
    <div style={{ fontFamily: fonts.englishDisplay, fontSize: '34px', color: tokens.muted, fontStyle: 'italic', textAlign: 'center' }}>
      (your slides keep playing here)
    </div>
  );
}

/**
 * Live preview of an announcement using the real kiosk components (Layout,
 * SlideCarousel, Banner, PinnedNotes, Takeover) on the real 1600×900 canvas,
 * scaled down to the available width.
 */
export default function AnnouncementPreview({ item, settings = {}, maxHeight }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => {
      let s = el.clientWidth / W;
      if (maxHeight) s = Math.min(s, maxHeight / H);
      setScale(s || 0.2);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [maxHeight]);

  applyFontSettings(settings);
  const tokens = getTokens(settings.theme, settings.customTheme);
  const clock = clockNow();
  const display = item?.display || 'slide';
  const previewItem = item ? { ...item, id: item.id || 'preview', createdAt: item.createdAt || new Date().toISOString() } : null;

  const notes = display === 'note' && previewItem ? [toNoteRow(previewItem)] : [];
  const banners = display === 'banner' && previewItem ? [toBannerRow(previewItem)] : [];
  const slide = display === 'slide' && previewItem ? toRotationSlide(previewItem) : null;
  const fullscreen = !!slide?.fullscreen;

  const leftColumn = (
    <>
      <Clock formatted={clock.formatted} ampm={clock.ampm} seconds={clock.seconds} tokens={tokens} />
      <PinnedNotes pinned={notes} tokens={tokens} visibility={settings.visibility} />
    </>
  );
  const rightColumn = slide ? (
    <SlideCarousel
      currentSlide={slide}
      currentIndex={0}
      enabledSlides={[slide]}
      progress={0}
      cache={{}}
      tokens={tokens}
      settings={settings}
      hold={null}
      googleAlbums={[]}
      rssCache={{}}
      rssFeeds={[]}
    />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <PlaceholderSlide tokens={tokens} />
    </div>
  );

  return (
    <div
      ref={boxRef}
      style={{
        width: '100%',
        maxWidth: maxHeight ? `${(maxHeight * W) / H}px` : undefined,
        margin: '0 auto',
        height: `${H * scale}px`,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '6px',
        border: `1px solid ${colors.border}`,
        background: tokens.bg,
      }}
      aria-label="Screen preview"
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, width: `${W}px`, height: `${H}px`,
        transform: `scale(${scale})`, transformOrigin: 'top left', direction: 'ltr', pointerEvents: 'none',
      }}>
        <Layout
          leftColumn={leftColumn}
          rightColumn={rightColumn}
          progressDots={null}
          banner={banners.length ? <Banner banners={banners} tokens={tokens} bannerSettings={settings.banner} /> : null}
          bannerHeight={bannerHeightFor(banners, settings.banner)}
          theme={settings.theme}
          tokens={tokens}
          fullscreen={fullscreen}
          credit={null}
          clockSide={settings.clockSide || 'left'}
          portrait={false}
        />
        {display === 'takeover' && previewItem && <AnnouncementTakeover item={previewItem} tokens={tokens} />}
      </div>
    </div>
  );
}
