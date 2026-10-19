import React from 'react';
import { adminFonts } from '../../styles/admin-tokens.js';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import AnnouncementsPanel from './AnnouncementsPanel.jsx';
import QuickTemplatesTab from '../quick/QuickTemplatesTab.jsx';
import LettersTab from '../letters/LettersTab.jsx';
import useQuickTemplates from '../../hooks/useQuickTemplates.js';
import useQueryParam from '../../hooks/useQueryParam.js';
import { ANNOUNCE_TABS, ANNOUNCE_TAB_VALUES, DEFAULT_ANNOUNCE_TAB } from '../../nav.js';

/**
 * The Announce area (/admin/announcements?tab=posts|quick|letters):
 * posts (slides, banners, notes, takeovers), quick messages (saved templates), and the
 * saved letters library.
 */
export default function AnnouncePage({ caps = [], onUseQuick, onPostLetter, onOpenComposer, settings, ...panelProps }) {
  const [tab, setTab] = useQueryParam('tab', ANNOUNCE_TAB_VALUES, DEFAULT_ANNOUNCE_TAB);
  const qt = useQuickTemplates({ enabled: tab === 'quick' });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px', maxWidth: '900px', fontFamily: adminFonts.englishBody }}>
      <SegmentedControl ariaLabel="Announce sections" options={ANNOUNCE_TABS} value={tab} onChange={setTab} fill />
      {tab === 'posts' && <AnnouncementsPanel {...panelProps} caps={caps} settings={settings} onOpenComposer={onOpenComposer} />}
      {tab === 'quick' && <QuickTemplatesTab qt={qt} caps={caps} onUse={onUseQuick} />}
      {tab === 'letters' && <LettersTab caps={caps} settings={settings} onPostLetter={onPostLetter} onOpenComposer={onOpenComposer} />}
    </div>
  );
}
