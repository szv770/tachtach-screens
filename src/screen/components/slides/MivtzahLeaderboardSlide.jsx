import React from 'react';
import { fonts } from '../../styles/tokens.js';

const MAX_ROWS = 15;

function formatRelativeTime(isoString) {
  if (!isoString) return null;
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) {
      const m = Math.floor(diff / 60);
      return `${m} min ago`;
    }
    const h = Math.floor(diff / 3600);
    return `${h} hr ago`;
  } catch {
    return null;
  }
}

function rankMedal(rank) {
  if (rank === 1) return { color: '#D4A84B', label: '1' }; // gold
  if (rank === 2) return { color: '#A8A9AD', label: '2' }; // silver
  if (rank === 3) return { color: '#CD7F32', label: '3' }; // bronze
  return { color: null, label: String(rank) };
}

export default function MivtzahLeaderboardSlide({ cache, tokens }) {
  const mivtzah = cache?.mivtzah;
  const leaderboard = mivtzah?.leaderboard;
  const fetchedAt = mivtzah?.fetchedAt;
  const relativeTime = formatRelativeTime(fetchedAt);

  // Not yet configured or no data
  if (!mivtzah) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '560px',
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
          Mivtzah Leaderboard
        </div>
        <div style={{
          fontFamily: fonts.englishBody,
          fontSize: '13px',
          color: tokens.muted,
          direction: 'ltr',
        }}>
          Leaderboard data not yet available
        </div>
      </div>
    );
  }

  const rows = Array.isArray(leaderboard) ? leaderboard.slice(0, MAX_ROWS) : [];

  if (rows.length === 0) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '560px',
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
          Mivtzah Leaderboard
        </div>
        <div style={{
          fontFamily: fonts.englishBody,
          fontSize: '13px',
          color: tokens.muted,
          direction: 'ltr',
        }}>
          No entries yet
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: '640px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
      direction: 'ltr',
    }}>
      {/* Title */}
      <div style={{
        fontFamily: fonts.englishBody,
        fontSize: '13px',
        fontWeight: 700,
        color: tokens.gold,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        textAlign: 'center',
        marginBottom: '14px',
      }}>
        Mivtzah Leaderboard
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        alignItems: 'center',
        gap: '0 12px',
        padding: '5px 14px',
        borderBottom: `1px solid ${tokens.goldBd || tokens.border || 'rgba(212,168,75,0.25)'}`,
        marginBottom: '4px',
      }}>
        <span style={{ fontFamily: fonts.englishBody, fontSize: '10px', fontWeight: 600, color: tokens.dim, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>#</span>
        <span style={{ fontFamily: fonts.englishBody, fontSize: '10px', fontWeight: 600, color: tokens.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Name</span>
        <span style={{ fontFamily: fonts.englishBody, fontSize: '10px', fontWeight: 600, color: tokens.dim, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right' }}>Points</span>
      </div>

      {/* Rows */}
      {rows.map((bochur, idx) => {
        const rank = idx + 1;
        const medal = rankMedal(rank);
        const isTop3 = rank <= 3;
        const rowBg = isTop3
          ? (rank === 1 ? 'rgba(212,168,75,0.10)' : 'rgba(212,168,75,0.05)')
          : 'transparent';

        return (
          <div
            key={bochur.short_code || idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr auto',
              alignItems: 'center',
              gap: '0 12px',
              padding: isTop3 ? '9px 14px' : '6px 14px',
              background: rowBg,
              borderRadius: isTop3 ? '4px' : '0',
              marginBottom: '2px',
              borderLeft: isTop3 ? `2px solid ${medal.color}` : '2px solid transparent',
            }}
          >
            {/* Rank */}
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: isTop3 ? '15px' : '13px',
              fontWeight: isTop3 ? 700 : 400,
              color: medal.color || tokens.dim,
              textAlign: 'center',
            }}>
              {medal.label}
            </div>

            {/* Name */}
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: isTop3 ? '16px' : '14px',
              fontWeight: isTop3 ? 600 : 400,
              color: isTop3 ? tokens.text : tokens.dim,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {bochur.full_name || bochur.short_code || 'Unknown'}
            </div>

            {/* Points */}
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: isTop3 ? '15px' : '13px',
              fontWeight: isTop3 ? 700 : 500,
              color: isTop3 ? medal.color || tokens.gold : tokens.dim,
              textAlign: 'right',
              letterSpacing: '0.02em',
            }}>
              {typeof bochur.total_points === 'number'
                ? bochur.total_points.toLocaleString()
                : bochur.total_points ?? '—'}
            </div>
          </div>
        );
      })}

      {/* Last updated */}
      {relativeTime && (
        <div style={{
          fontFamily: fonts.englishBody,
          fontSize: '10px',
          color: tokens.muted,
          textAlign: 'right',
          marginTop: '10px',
          letterSpacing: '0.04em',
        }}>
          Updated {relativeTime}
        </div>
      )}
    </div>
  );
}
