import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { ConfirmDialog } from './ui.jsx';
import useIsMobile from '../hooks/useIsMobile.js';

const MAPPING_SLOTS = [
  { key: 'primary', label: 'Main Text' },
  { key: 'secondary', label: 'Subtitle' },
  { key: 'body', label: 'Body' },
  { key: 'attribution', label: 'Attribution' },
];

const REFRESH_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'every6hours', label: 'Every 6 Hours' },
  { value: 'daily', label: 'Daily' },
];

const DISPLAY_MODES = [
  { value: 'latest', label: 'Latest Item' },
  { value: 'random', label: 'Random Daily' },
];

const SLIDE_STYLES = [
  { value: '', label: 'None' },
  { value: 'classic', label: 'Classic' },
  { value: 'grand', label: 'Grand' },
  { value: 'sleek', label: 'Sleek' },
];

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  const res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.text();
    let msg;
    try { msg = JSON.parse(body).error; } catch { msg = body; }
    throw new Error(msg || `${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function MiniPreview({ item, mapping }) {
  const primary = item[mapping.primary] || '';
  const secondary = item[mapping.secondary] || '';
  const body = item[mapping.body] || '';
  const attribution = item[mapping.attribution] || '';

  return (
    <div style={{
      background: '#12100C',
      borderRadius: '6px',
      padding: '20px',
      textAlign: 'center',
      border: '1px solid rgba(212,168,75,.3)',
      minHeight: '120px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '8px',
    }}>
      {primary && (
        <div style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: '20px',
          fontWeight: 500,
          color: '#EFE3C0',
          lineHeight: 1.4,
        }}>
          {primary.length > 120 ? primary.slice(0, 120) + '...' : primary}
        </div>
      )}
      {secondary && (
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '14px',
          color: 'rgba(239,227,192,.6)',
          fontStyle: 'italic',
        }}>
          {secondary.length > 80 ? secondary.slice(0, 80) + '...' : secondary}
        </div>
      )}
      {body && (
        <div style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: '14px',
          color: 'rgba(239,227,192,.7)',
          lineHeight: 1.5,
          maxHeight: '60px',
          overflow: 'hidden',
        }}>
          {body.length > 200 ? body.slice(0, 200) + '...' : body}
        </div>
      )}
      {attribution && (
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '12px',
          color: '#D4A84B',
          letterSpacing: '0.04em',
        }}>
          — {attribution.length > 60 ? attribution.slice(0, 60) + '...' : attribution}
        </div>
      )}
    </div>
  );
}

export default function RSSManager({ onSlideCreated }) {
  const isMobile = useIsMobile();
  const [feeds, setFeeds] = useState([]);
  const [loadingFeeds, setLoadingFeeds] = useState(true);

  // Add feed flow
  const [showAdd, setShowAdd] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [feedName, setFeedName] = useState('');
  const [mapping, setMapping] = useState({
    primary: 'title',
    secondary: 'author',
    body: 'description',
    attribution: 'author',
  });
  const [refreshInterval, setRefreshInterval] = useState('daily');
  const [displayMode, setDisplayMode] = useState('latest');
  const [slideStyle, setSlideStyle] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFeeds = useCallback(async () => {
    try {
      const result = await apiFetch('/api/rss/feeds');
      setFeeds(result || []);
    } catch (err) {
      console.error('Failed to load RSS feeds:', err);
    } finally {
      setLoadingFeeds(false);
    }
  }, []);

  useEffect(() => { fetchFeeds(); }, [fetchFeeds]);

  const handlePreview = async () => {
    if (!feedUrl.trim()) return;
    setPreviewing(true);
    setPreviewError('');
    setPreviewData(null);
    try {
      const result = await apiFetch('/api/rss/preview', {
        method: 'POST',
        body: JSON.stringify({ url: feedUrl.trim() }),
      });
      setPreviewData(result);
      if (!feedName && result.feedTitle) setFeedName(result.feedTitle);
      // Auto-select mapping based on available fields
      if (result.availableFields) {
        setMapping(prev => {
          const updated = { ...prev };
          for (const slot of MAPPING_SLOTS) {
            if (!result.availableFields.includes(updated[slot.key])) {
              updated[slot.key] = result.availableFields[0] || 'title';
            }
          }
          return updated;
        });
      }
    } catch (err) {
      setPreviewError(err.message || 'Failed to fetch feed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!feedName.trim() || !feedUrl.trim()) return;
    setSaving(true);
    try {
      const newFeed = await apiFetch('/api/rss/feeds', {
        method: 'POST',
        body: JSON.stringify({
          url: feedUrl.trim(),
          name: feedName.trim(),
          mapping,
          refreshInterval,
        }),
      });

      // Create a slide for this feed
      if (onSlideCreated && newFeed) {
        await onSlideCreated({
          type: 'RSS_SLIDE',
          rssFeedId: newFeed.id,
          rssDisplayMode: displayMode,
          label: feedName.trim(),
          style: slideStyle || undefined,
          duration: 15,
          enabled: true,
        });
      }

      // Reset form
      setFeedUrl('');
      setFeedName('');
      setPreviewData(null);
      setPreviewError('');
      setMapping({ primary: 'title', secondary: 'author', body: 'description', attribution: 'author' });
      setRefreshInterval('daily');
      setDisplayMode('latest');
      setSlideStyle('');
      setShowAdd(false);
      await fetchFeeds();
    } catch (err) {
      setPreviewError(err.message || 'Failed to save feed');
    } finally {
      setSaving(false);
    }
  };

  // Per-feed action feedback — previously Sync/Delete gave no visual
  // feedback at all and errors only went to the console.
  const [syncingId, setSyncingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [feedError, setFeedError] = useState(null); // { id, message }
  const [confirmDelete, setConfirmDelete] = useState(null); // feed object

  const handleSync = async (id) => {
    setSyncingId(id);
    setFeedError(null);
    try {
      await apiFetch(`/api/rss/feeds/${id}/sync`, { method: 'POST' });
      // Give the server a moment to fetch before refreshing the list
      await new Promise(r => setTimeout(r, 2000));
      await fetchFeeds();
    } catch (err) {
      setFeedError({ id, message: err.message || 'Sync failed' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setFeedError(null);
    try {
      await apiFetch(`/api/rss/feeds/${id}`, { method: 'DELETE' });
      setFeeds(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      setFeedError({ id, message: err.message || 'Delete failed' });
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: 0 }}>
          RSS Feeds
        </h2>
        <button style={buttonPrimary} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Feed'}
        </button>
      </div>

      {/* Add Feed Form */}
      {showAdd && (
        <div style={{
          padding: isMobile ? '16px' : '20px',
          background: colors.surface,
          borderRadius: '4px',
          border: `1px solid ${colors.muted}`,
        }}>
          <h3 style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, marginBottom: '16px' }}>
            Add RSS Feed
          </h3>

          {/* Step 1: URL + Preview */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              style={{ ...inputStyle, flex: 1, minWidth: isMobile ? '100%' : '200px' }}
              onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
            />
            <button
              style={{ ...buttonSecondary, opacity: previewing ? 0.6 : 1, whiteSpace: 'nowrap', minHeight: '40px' }}
              onClick={handlePreview}
              disabled={previewing || !feedUrl.trim()}
            >
              {previewing ? 'Loading...' : 'Preview'}
            </button>
          </div>

          {previewError && (
            <div style={{
              padding: '8px 12px',
              background: colors.dangerBg,
              borderRadius: '4px',
              color: colors.danger,
              fontFamily: adminFonts.englishBody,
              fontSize: '13px',
              marginBottom: '12px',
            }}>
              {previewError}
            </div>
          )}

          {/* Step 2: Preview items */}
          {previewData && (
            <>
              <div style={{
                fontFamily: adminFonts.englishBody,
                fontSize: '13px',
                color: colors.dim,
                marginBottom: '8px',
              }}>
                Found {previewData.items.length} items
                {previewData.feedTitle ? ` from "${previewData.feedTitle}"` : ''}
                {' | Fields: '}
                {previewData.availableFields?.join(', ') || 'none'}
              </div>

              {/* Preview cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '8px',
                marginBottom: '16px',
                maxHeight: '320px',
                overflowY: 'auto',
              }}>
                {previewData.items.slice(0, 5).map((item, i) => (
                  <div key={i} style={{
                    padding: '10px',
                    background: colors.bg,
                    borderRadius: '4px',
                    border: `1px solid ${colors.muted}`,
                  }}>
                    {previewData.availableFields?.map(field => (
                      <div key={field} style={{ marginBottom: '4px' }}>
                        <span style={{
                          fontFamily: adminFonts.englishBody,
                          fontSize: '10px',
                          color: colors.gold,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>
                          {field}
                        </span>
                        <div style={{
                          fontFamily: adminFonts.englishBody,
                          fontSize: '12px',
                          color: colors.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          direction: 'ltr',
                        }}>
                          {(item[field] || '').slice(0, 100) || '(empty)'}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Step 3: Mapping controls */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: colors.text,
                  marginBottom: '8px',
                }}>
                  Field Mapping
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: '8px',
                }}>
                  {MAPPING_SLOTS.map(slot => (
                    <div key={slot.key}>
                      <label style={{
                        fontFamily: adminFonts.englishBody,
                        fontSize: '12px',
                        color: colors.dim,
                      }}>
                        {slot.label}
                      </label>
                      <select
                        value={mapping[slot.key] || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, [slot.key]: e.target.value }))}
                        style={{ ...inputStyle, marginTop: '2px', cursor: 'pointer' }}
                      >
                        <option value="">(none)</option>
                        {(previewData.availableFields || []).map(field => (
                          <option key={field} value={field}>{field}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: colors.text,
                  marginBottom: '8px',
                }}>
                  Slide Preview
                </div>
                <MiniPreview item={previewData.items[0] || {}} mapping={mapping} />
              </div>

              {/* Step 4: Name, interval, display mode, style */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                gap: '12px',
                marginBottom: '16px',
              }}>
                <div>
                  <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                    Feed Name
                  </label>
                  <input
                    type="text"
                    value={feedName}
                    onChange={(e) => setFeedName(e.target.value)}
                    placeholder="My Feed"
                    style={{ ...inputStyle, marginTop: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                    Refresh Interval
                  </label>
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(e.target.value)}
                    style={{ ...inputStyle, marginTop: '4px', cursor: 'pointer' }}
                  >
                    {REFRESH_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                    Display Mode
                  </label>
                  <select
                    value={displayMode}
                    onChange={(e) => setDisplayMode(e.target.value)}
                    style={{ ...inputStyle, marginTop: '4px', cursor: 'pointer' }}
                  >
                    {DISPLAY_MODES.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                    Slide Style
                  </label>
                  <select
                    value={slideStyle}
                    onChange={(e) => setSlideStyle(e.target.value)}
                    style={{ ...inputStyle, marginTop: '4px', cursor: 'pointer' }}
                  >
                    {SLIDE_STYLES.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Save button */}
              <button
                style={{
                  ...buttonPrimary,
                  opacity: saving || !feedName.trim() ? 0.6 : 1,
                  minHeight: '44px',
                  width: isMobile ? '100%' : 'auto',
                }}
                onClick={handleSave}
                disabled={saving || !feedName.trim()}
              >
                {saving ? 'Saving...' : 'Save & Add as Slide'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Feed list */}
      {loadingFeeds ? (
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim }}>Loading feeds...</div>
      ) : feeds.length === 0 && !showAdd ? (
        <div style={{
          padding: '32px',
          textAlign: 'center',
          color: colors.dim,
          fontFamily: adminFonts.englishBody,
          fontSize: '14px',
        }}>
          No RSS feeds configured. Click "+ Add Feed" to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {feeds.map(feed => (
            <div key={feed.id} style={{
              padding: isMobile ? '12px' : '12px 16px',
              background: colors.surface,
              borderRadius: '4px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: isMobile ? '8px' : '12px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: colors.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {feed.name}
                </div>
                <div style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '11px',
                  color: colors.muted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  direction: 'ltr',
                }}>
                  {feed.url}
                </div>
                <div style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '11px',
                  color: colors.dim,
                  marginTop: '2px',
                }}>
                  {feed.itemCount || 0} items
                  {feed.lastFetched ? ` | Last: ${new Date(feed.lastFetched).toLocaleString()}` : ' | Not fetched yet'}
                  {` | ${REFRESH_OPTIONS.find(o => o.value === feed.refreshInterval)?.label || feed.refreshInterval}`}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleSync(feed.id)}
                    disabled={syncingId === feed.id}
                    title="Fetch the latest items from this feed now"
                    style={{
                      ...buttonSecondary,
                      padding: '6px 12px',
                      fontSize: '12px',
                      minHeight: '32px',
                      opacity: syncingId === feed.id ? 0.6 : 1,
                    }}
                  >
                    {syncingId === feed.id ? 'Syncing…' : 'Sync Now'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(feed)}
                    disabled={deletingId === feed.id}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${colors.danger}`,
                      borderRadius: '4px',
                      color: colors.danger,
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontFamily: adminFonts.englishBody,
                      minHeight: '32px',
                      opacity: deletingId === feed.id ? 0.6 : 1,
                    }}
                  >
                    {deletingId === feed.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
                {feedError?.id === feed.id && (
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: colors.danger,
                  }}>
                    {feedError.message}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm feed delete */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete RSS feed?"
          message={`"${confirmDelete.name}" will stop updating. Any slide using this feed will no longer show content.`}
          confirmLabel="Delete Feed"
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
