import React from 'react';
import { Panel, PageTitle, Empty, F } from '../../design/ui.jsx';

const MAX_ROWS = 16;

function relative(iso) {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(diff)) return null;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  return `${Math.floor(diff / 3600)} hr ago`;
}

/** Mivtzah leaderboard: ruled two-column board, the leader carries the accent. */
export default function MivtzahLeaderboardSlide({ cache }) {
  const mv = cache?.mivtzah;
  const rows = Array.isArray(mv?.leaderboard) ? mv.leaderboard.slice(0, MAX_ROWS) : [];
  const upd = relative(mv?.fetchedAt);
  const title = <PageTitle en={`Mivtzah leaderboard${upd ? ` · updated ${upd}` : ''}`} heText="מבצעים" />;
  if (!rows.length) return <Panel>{title}<Empty en={mv ? 'No entries yet' : 'Leaderboard data not yet available'} /></Panel>;
  const per = Math.ceil(rows.length / (rows.length > 8 ? 2 : 1));
  const cols = [rows.slice(0, per), rows.slice(per)].filter((c) => c.length);
  return (
    <Panel pad="30px 48px 34px">
      {title}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`, columnGap: 48, minHeight: 0 }}>
        {cols.map((col, c) => (
          <div key={c} style={{ display: 'grid', gridTemplateRows: `repeat(${per}, minmax(0, 1fr))`, minHeight: 0 }}>
            {col.map((b, k) => {
              const rank = c * per + k + 1;
              const lead = rank === 1;
              return (
                <div key={b.short_code || rank} data-s="" style={{
                  '--i': rank, display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12,
                  borderTop: '2px solid var(--line)', padding: lead ? '0 18px' : 0, borderRadius: lead ? 18 : 0,
                  background: lead ? 'var(--fill)' : 'transparent', color: lead ? 'var(--fillInk)' : 'var(--ink)',
                }}>
                  <span className="tt-num" style={{ fontSize: 34, fontWeight: 700, color: lead ? 'var(--fillInk)' : 'var(--inkDim)' }}>{rank}</span>
                  <span style={{ fontFamily: F.en, fontSize: 34, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.full_name || b.short_code || 'Unknown'}</span>
                  <span className="tt-num" style={{ fontSize: 38, fontWeight: 700 }}>{typeof b.total_points === 'number' ? b.total_points.toLocaleString() : (b.total_points ?? '—')}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}
