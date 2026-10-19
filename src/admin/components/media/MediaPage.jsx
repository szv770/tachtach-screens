import React, { useMemo } from 'react';
import { adminFonts } from '../../styles/admin-tokens.js';
import { can } from '../../../shared/permissions.js';
import { recommendedSize } from '../../../shared/screenSize.js';
import { MEDIA_TABS, MEDIA_TAB_VALUES, DEFAULT_MEDIA_TAB } from '../../nav.js';
import useQueryParam from '../../hooks/useQueryParam.js';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import MediaLibrary from './MediaLibrary.jsx';
import WebPagesTab from './WebPagesTab.jsx';
import GooglePhotosManager from '../GooglePhotosManager.jsx';
import RSSManager from '../RSSManager.jsx';

/**
 * The Media page (/admin/images?tab=library|photos|web|feeds): everything that puts pictures,
 * videos, albums, websites or news on the screen. Controls follow the person's capabilities.
 */
export default function MediaPage({ me, slides = [], settings = {}, screenDisplay = null, onCreateSlide, onUpdateSlides, onDeleteSlide }) {
  const caps = me?.caps || [];
  const isAdmin = me?.role === 'admin';
  const has = (c) => isAdmin || can(caps, c);
  const visible = useMemo(() => MEDIA_TABS.filter((t) => isAdmin || t.needs.some((c) => can(caps, c))), [isAdmin, caps]);
  const [wanted, setTab] = useQueryParam('tab', MEDIA_TAB_VALUES, DEFAULT_MEDIA_TAB);
  const tab = visible.some((t) => t.value === wanted) ? wanted : (visible[0]?.value || DEFAULT_MEDIA_TAB);
  const rec = useMemo(() => recommendedSize(screenDisplay, settings.orientation), [screenDisplay, settings.orientation]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px', maxWidth: '900px', fontFamily: adminFonts.englishBody }}>
      <SegmentedControl ariaLabel="Media sections" options={visible} value={tab} onChange={setTab} fill />
      {tab === 'library' && (
        <MediaLibrary
          rec={rec} slides={slides}
          canUpload={has('media.upload')} canDelete={has('media.delete')} canAdd={has('slides.edit')} canRemoveSlides={has('slides.delete')}
          onCreateSlide={onCreateSlide} onDeleteSlide={onDeleteSlide}
        />
      )}
      {tab === 'photos' && (
        <GooglePhotosManager
          canEdit={has('feeds.edit')} canEditSlides={has('slides.edit')}
          onSlideCreated={onCreateSlide} onDeleteSlide={onDeleteSlide} slides={slides} onUpdateSlides={onUpdateSlides}
        />
      )}
      {tab === 'web' && (
        <WebPagesTab
          slides={slides} canEdit={has('slides.edit')} canDelete={has('slides.delete')}
          onCreate={onCreateSlide} onUpdateSlides={onUpdateSlides} onDeleteSlide={onDeleteSlide}
        />
      )}
      {tab === 'feeds' && (
        <RSSManager
          canEdit={has('feeds.edit')} canEditSlides={has('slides.edit')}
          onSlideCreated={onCreateSlide} slides={slides} onUpdateSlides={onUpdateSlides} onDeleteSlide={onDeleteSlide}
        />
      )}
    </div>
  );
}
