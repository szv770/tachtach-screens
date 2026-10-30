import React, { useEffect, useState } from 'react';
import { colors } from '../styles/admin-tokens.js';
import usePolled from '../hooks/usePolled.js';
import { opsApi } from '../api/ops.js';
import { describeTv } from '../../shared/tvStatus.js';
import { slideLabel, announcementTitle } from '../search/labels.js';
import { freezeInForce } from '../../shared/freeze.js';
import { postIdFromSlideId } from '../../shared/postList.js';

const TONES = { live: colors.success, warn: colors.warn, off: colors.danger, unknown: colors.dim };

const loadStatus = () => opsApi.screenStatus().then((d) => ({ ...d, fetchedAt: Date.now() }));

/**
 * "TV is on: Zmanim, slide 4 of 11 · online" or "TV offline since 10:42 · probably on: Zmanim (estimate)".
 * Polls /api/screen/status (and again at once when `reloadSignal` changes: the preview bumps it when the TV
 * reports a slide). The estimate comes from the pure rules in src/shared (rotationPosition + tvStatus).
 */
export default function TvStatusLine({ state, reloadSignal = 0, compact = false }) {
  const { data, reload } = usePolled(loadStatus, 10000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (reloadSignal) reload(); }, [reloadSignal, reload]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);

  const slides = state?.slides || [];
  const anns = state?.announcements || [];
  const nameOf = (id) => {
    const s = slides.find((x) => x.id === id);
    const pid = !s && postIdFromSlideId(id);
    if (pid) { const a = anns.find((x) => x.id === pid); return a ? announcementTitle(a) : 'A message'; }
    if (!s) return 'a slide';
    if (s.type === 'ANNOUNCEMENT') { const a = anns.find((x) => x.id === s.announcementId); return a ? announcementTitle(a) : 'A message'; }
    return slideLabel(s);
  };
  const frozen = freezeInForce(state?.freeze, now);
  // The estimate walks the list the TV itself reported (it includes message slides the admin list lacks).
  const d = describeTv(data, { now, nameOf, frozen, tz: state?.settings?.location?.timezone });
  const color = TONES[d.tone] || colors.dim;

  return (
    <div data-testid="tv-status" data-tone={d.tone} data-estimated={d.estimated ? 'true' : 'false'} role="status" style={{
      display: 'flex', gap: '8px', alignItems: 'flex-start', padding: compact ? '4px 0 0' : '8px 10px',
      borderRadius: compact ? 0 : '8px', background: compact ? 'transparent' : colors.sunken, marginBottom: compact ? 0 : '8px',
    }}>
      <span aria-hidden style={{ flex: '0 0 auto', width: 8, height: 8, borderRadius: '50%', background: color, marginTop: '5px' }} />
      <div style={{ minWidth: 0 }}>
        <div data-testid="tv-status-headline" style={{ fontSize: '13px', fontWeight: 700, color: colors.text, overflowWrap: 'anywhere' }}>{d.headline}</div>
        {d.detail && !compact && <div style={{ fontSize: '12px', color: colors.dim, marginTop: '2px' }}>{d.detail}</div>}
      </div>
    </div>
  );
}
