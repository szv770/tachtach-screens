import React, { useEffect, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import DesignRoot from '../../../screen/design/DesignRoot.jsx';
import { TakeoverStage } from '../../../screen/takeover/TakeoverStage.jsx';
import { resolveActiveTheme } from '../../../shared/dayNight.js';
import { Btn } from '../quick/bits.jsx';

const W = 1600;
const H = 900;

/**
 * Page-by-page preview of a letter / sicha, drawn by the real kiosk stage.
 * The kiosk steps through the pages on its own; here you flip through them.
 * `item` = { content, look: { layout, style } } (an announcement-shaped object).
 */
export default function PagePreview({ item, settings = {} }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.2);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setScale((el.clientWidth / W) || 0.2);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  useEffect(() => { if (page > pages - 1) setPage(Math.max(0, pages - 1)); }, [pages, page]);

  const themeId = resolveActiveTheme(settings, {}, new Date()).themeId;
  const stageItem = { id: 'page-preview', display: 'slide', ...item, createdAt: new Date().toISOString() };

  return (
    <div data-testid="page-preview">
      <div ref={boxRef} aria-label="Page preview" style={{ width: '100%', height: `${H * scale}px`, position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-md)', border: `1px solid ${colors.line}` }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: `${W}px`, height: `${H}px`, transform: `scale(${scale})`, transformOrigin: 'top left', direction: 'ltr', pointerEvents: 'none' }}>
          <DesignRoot settings={settings} themeId={themeId} style={{ position: 'absolute', inset: 0 }}>
            <TakeoverStage key={JSON.stringify(stageItem.look)} item={stageItem} w={W} h={H} showClock={false} entrance={false} animation="off" page={page} onPages={setPages} />
          </DesignRoot>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontFamily: adminFonts.englishBody }}>
        <Btn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0} style={{ minHeight: '44px' }} aria-label="Previous page">Previous</Btn>
        <div data-testid="page-label" style={{ flex: 1, textAlign: 'center', fontSize: '14px', color: colors.dim }}>{pages > 1 ? `Page ${page + 1} of ${pages}` : 'Fits on one page'}</div>
        <Btn onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} style={{ minHeight: '44px' }} aria-label="Next page">Next</Btn>
      </div>
    </div>
  );
}
