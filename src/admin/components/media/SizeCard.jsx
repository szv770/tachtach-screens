import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { safeArea, sizeText, SAFE_MARGIN_PERCENT } from '../../../shared/screenSize.js';

const when = (ms) => { try { return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

/** "Best size for this screen" - measured from the kiosk when it has reported, else a default. */
export default function SizeCard({ rec }) {
  const safe = safeArea(rec);
  const measured = rec.source === 'measured';
  return (
    <section id="media-size" data-testid="size-card" style={{
      background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)',
      padding: '16px', fontFamily: adminFonts.englishBody,
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: colors.dim }}>Best size for this screen</div>
      <div data-testid="size-value" style={{ fontFamily: adminFonts.englishDisplay, fontSize: '28px', fontWeight: 600, color: colors.text, margin: '4px 0 2px', letterSpacing: '-.01em' }}>
        {sizeText(rec.width, rec.height)}
      </div>
      <div style={{ fontSize: '14px', color: colors.text }}>
        {rec.ratio}, {rec.orientation}. Keep key content about {SAFE_MARGIN_PERCENT}% from the edges (inside {sizeText(safe.width, safe.height)}).
      </div>
      <div data-testid="size-source" style={{ fontSize: '13px', color: measured ? colors.success : colors.dim, marginTop: '6px' }}>
        {measured
          ? `Measured from your screen${rec.reportedAt ? ` at ${when(rec.reportedAt)}` : ''}`
          : `Default for a ${rec.orientation} screen. It becomes the real size as soon as your screen checks in.`}
      </div>
      <Collapsible title="Pictures, videos and PDFs" summary="What works and what size to use" style={{ marginTop: '14px', boxShadow: 'none' }}>
        <ul style={{ margin: '12px 0 0', paddingLeft: '18px', fontSize: '14px', lineHeight: 1.6, color: colors.text }}>
          <li><strong>Pictures</strong> (JPEG, PNG, WebP): this size or larger. Bigger pictures are shrunk to this size, never enlarged.</li>
          <li><strong>GIFs</strong> are kept exactly as uploaded, so use one close to this size.</li>
          <li><strong>Videos</strong> (MP4 or WebM, up to 50 MB) play as they are. A 1920&times;1080 clip is usually plenty and plays smoothest.</li>
          <li><strong>PDFs</strong> can not be shown. Export each page as a picture at this size and upload those.</li>
        </ul>
      </Collapsible>
    </section>
  );
}
