import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fonts } from '../../styles/tokens.js';

const LOAD_TIMEOUT_MS = 15000;

function NotConfiguredMessage({ tokens, title, subtitle }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      gap: '12px',
    }}>
      <div style={{
        fontFamily: fonts.englishBody,
        fontSize: '18px',
        color: tokens.dim,
        direction: 'ltr',
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: fonts.englishBody,
        fontSize: '13px',
        color: tokens.muted,
        direction: 'ltr',
        maxWidth: '420px',
      }}>
        {subtitle}
      </div>
    </div>
  );
}

export default function MivtzahLiveEmbedSlide({ slide, tokens }) {
  const embedUrl = (slide?.embedUrl || '').trim();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    clearTimeout(timeoutRef.current);

    if (!embedUrl) return undefined;

    timeoutRef.current = setTimeout(() => {
      setLoaded((isLoaded) => {
        if (!isLoaded) setFailed(true);
        return isLoaded;
      });
    }, LOAD_TIMEOUT_MS);

    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl]);

  const handleLoad = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setLoaded(true);
    setFailed(false);
  }, []);

  const handleError = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setFailed(true);
  }, []);

  // Not yet configured
  if (!embedUrl) {
    return (
      <NotConfiguredMessage
        tokens={tokens}
        title="Mivtzah Live Screen"
        subtitle="Embed URL not yet configured"
      />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <iframe
        key={embedUrl}
        src={embedUrl}
        title="Mivtzah Live Screen"
        onLoad={handleLoad}
        onError={handleError}
        sandbox="allow-scripts allow-same-origin allow-forms"
        allow="autoplay; fullscreen"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          background: tokens.bg,
          visibility: failed ? 'hidden' : 'visible',
        }}
      />
      {failed && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background: tokens.bg,
        }}>
          <NotConfiguredMessage
            tokens={tokens}
            title="Mivtzah Live Screen"
            subtitle="Unable to load the live screen right now. It will retry automatically the next time this slide comes up."
          />
        </div>
      )}
    </div>
  );
}
