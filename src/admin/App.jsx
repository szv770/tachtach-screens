import React, { useState } from 'react';
import useAdminState from './hooks/useAdminState.js';
import AdminLayout from './components/AdminLayout.jsx';
import LivePreview from './components/LivePreview.jsx';
import ScreenControls from './components/ScreenControls.jsx';
import SlideManager from './components/SlideManager.jsx';
import AnnouncementsPanel from './components/announcements/AnnouncementsPanel.jsx';
import AnnouncementComposer from './components/announcements/AnnouncementComposer.jsx';
import CustomDaysEditor from './components/CustomDaysEditor.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StylePanel from './components/StylePanel.jsx';
import ImageUploader from './components/ImageUploader.jsx';
import GooglePhotosManager from './components/GooglePhotosManager.jsx';
import RSSManager from './components/RSSManager.jsx';
import ScheduleSection from './components/ScheduleSection.jsx';
import DailyWordPanel from './components/DailyWordPanel.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import { colors, adminFonts, buttonPrimary } from './styles/admin-tokens.js';

export default function App() {
  const [activeSection, setActiveSection] = useState('slides');
  // Announcement composer (overlay): null | an item to edit | a preset for a new one.
  const [composer, setComposer] = useState(null);
  const {
    state, loading, error, retry,
    toasts, dismissToast,
    updateSettings, updateSlides, createSlide, deleteSlide,
    createAnnouncement, updateAnnouncement, reactivateAnnouncement,
    duplicateAnnouncement, deleteAnnouncement, fetchShabbosEnd,
    createCustomDay, updateCustomDay, deleteCustomDay,
    fetchSchedule, updateScheduleEntries, createScheduleEntry,
    updateScheduleEntry, deleteScheduleEntry, updateScheduleCategories,
    loadScheduleTemplate,
    fetchScheduleTemplates, saveScheduleTemplate, updateScheduleTemplate, deleteScheduleTemplate,
    refresh, screenCommand,
  } = useAdminState();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
      }}>
        <span style={{
          fontFamily: adminFonts.englishDisplay,
          fontSize: '20px',
          color: colors.dim,
          fontStyle: 'italic',
        }}>
          Loading...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: colors.bg,
      }}>
        <span style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '16px',
          color: colors.danger,
        }}>
          {error}
        </span>
        <button style={buttonPrimary} onClick={retry}>
          Retry
        </button>
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'slides':
        return (
          <SlideManager
            slides={state?.slides || []}
            onUpdate={updateSlides}
            onCreate={createSlide}
            onDelete={deleteSlide}
            settings={state?.settings || {}}
            onSaveSettings={updateSettings}
            onNavigate={setActiveSection}
            announcements={state?.announcements || []}
            onNewMessage={() => setComposer({ display: 'slide' })}
            onEditAnnouncement={(item) => setComposer(item)}
            onToggleAnnouncement={(item, enabled) => updateAnnouncement(item.id, { enabled }, enabled ? 'Resumed' : 'Paused')}
          />
        );
      case 'schedule':
        return (
          <ScheduleSection
            scheduleDates={state?.scheduleDates || {}}
            settings={state?.settings || {}}
            onRefreshSchedule={fetchSchedule}
            entries={state?.scheduleEntries || []}
            categories={state?.scheduleCategories || []}
            onUpdateEntries={updateScheduleEntries}
            onCreateEntry={createScheduleEntry}
            onUpdateEntry={updateScheduleEntry}
            onDeleteEntry={deleteScheduleEntry}
            onUpdateCategories={updateScheduleCategories}
            onLoadTemplate={loadScheduleTemplate}
            savedTemplates={state?.scheduleTemplates || []}
            onFetchTemplates={fetchScheduleTemplates}
            onSaveTemplate={saveScheduleTemplate}
            onUpdateTemplate={updateScheduleTemplate}
            onDeleteTemplate={deleteScheduleTemplate}
          />
        );
      case 'announcements':
        return (
          <AnnouncementsPanel
            announcements={state?.announcements || []}
            settings={state?.settings || {}}
            onSaveSettings={updateSettings}
            onOpenComposer={setComposer}
            onUpdate={updateAnnouncement}
            onReactivate={reactivateAnnouncement}
            onDuplicate={duplicateAnnouncement}
            onDelete={deleteAnnouncement}
            fetchShabbosEnd={fetchShabbosEnd}
          />
        );
      case 'daily-word':
        return <DailyWordPanel />;
      case 'custom-days':
        return (
          <CustomDaysEditor
            customDays={state?.customDays || []}
            onCreate={createCustomDay}
            onUpdate={updateCustomDay}
            onDelete={deleteCustomDay}
          />
        );
      case 'images':
        return (
          <>
            <h2 style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '24px',
              fontWeight: 600,
              color: colors.gold,
              marginBottom: '20px',
            }}>
              Media
            </h2>

            <h3 style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '18px',
              fontWeight: 500,
              color: colors.text,
              marginBottom: '12px',
            }}>
              Upload Media
            </h3>
            <ImageUploader
              onSlideCreated={createSlide}
            />

            <h3 style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '18px',
              fontWeight: 500,
              color: colors.text,
              margin: '28px 0 12px',
            }}>
              Google Photos
            </h3>
            <GooglePhotosManager
              onSlideCreated={createSlide}
              onDeleteSlide={deleteSlide}
              slides={state?.slides || []}
              onUpdateSlides={updateSlides}
            />
          </>
        );
      case 'rss-feeds':
        return (
          <RSSManager
            onSlideCreated={createSlide}
            slides={state?.slides || []}
            onUpdateSlides={updateSlides}
            onDeleteSlide={deleteSlide}
          />
        );
      case 'style':
        return (
          <StylePanel
            settings={state?.settings || {}}
            onSave={updateSettings}
          />
        );
      case 'settings':
        return (
          <SettingsPanel
            settings={state?.settings || {}}
            onSave={updateSettings}
            slides={state?.slides || []}
            onUpdateSlides={updateSlides}
            onCreateSlide={createSlide}
          />
        );
      default:
        return null;
    }
  };

  const previewSlot = (
    <>
      <LivePreview />
      <ScreenControls onCommand={screenCommand} onRefresh={refresh} />
    </>
  );

  return (
    <>
      <AdminLayout
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        preview={previewSlot}
      >
        {renderSection()}
      </AdminLayout>
      {composer && (
        <AnnouncementComposer
          key={composer.id || 'new'}
          initial={composer}
          announcements={state?.announcements || []}
          settings={state?.settings || {}}
          onClose={() => setComposer(null)}
          onCreate={createAnnouncement}
          onUpdate={updateAnnouncement}
          fetchShabbosEnd={fetchShabbosEnd}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
