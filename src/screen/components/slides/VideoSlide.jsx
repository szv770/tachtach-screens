import React, { useRef, useEffect } from 'react';

export default function VideoSlide({ slide, tokens, onEnded }) {
  const { videoUrl } = slide || {};
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [videoUrl]);

  if (!videoUrl) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <video
        ref={videoRef}
        src={videoUrl}
        autoPlay
        muted
        playsInline
        loop={slide.duration > 0}
        onEnded={slide.duration === 0 ? onEnded : undefined}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 2,
        }}
      />
    </div>
  );
}
