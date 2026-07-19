import React, { useState } from 'react';
import useAdminState from './hooks/useAdminState.js';
import AdminLayout from './components/AdminLayout.jsx';
import LivePreview from './components/LivePreview.jsx';
import ScreenControls from './components/ScreenControls.jsx';
import SlideManager from './components/SlideManager.jsx';
import MessageComposer from './components/MessageComposer.jsx';
import PinnedManager from './components/PinnedManager.jsx';
import CustomDaysEditor from './components/CustomDaysEditor.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StylePanel from './components/StylePanel.jsx';
import ImageUploader from './components/ImageUploader.jsx';
import GooglePhotosManager from './components/GooglePhotosManager.jsx';
import RSSManager from './components/RSSManager.jsx';
import ScheduleEditor from './components/ScheduleEditor.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import { colors, adminFonts, buttonPrimary } from './styles/admin-tokens.js';

export default function App() {
  const [activeSection, setActiveSection] = useState('slides');
  const {
    state, loading, error, retry,
    toasts, dismissToast,
    updateSettings, updateSlides, createSlide, deleteSlide,
    createMessage, deleteMessage,
    createPinned, updatePinned, deletePinned,
    createCustomDay, deleteCustomDay,
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
          />
        );
      case 'schedule':
        return (
          <ScheduleEditor
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
      case 'messages':
        return (
          <>
            <MessageComposer
              messages={state?.messages || []}
              onCreate={createMessage}
              onDelete={deleteMessage}
              bannerSettings={state?.settings?.banner || {}}
              onSaveBannerSettings={(s) => updateSettings({ ...(state?.settings || {}), banner: s })}
            />
            <hr style={{ border: 'none', borderTop: `1px solid ${colors.goldBd}`, margin: '28px 0' }} />
            <PinnedManager
              embedded
              pinned={state?.pinned || []}
              onCreate={createPinned}
              onUpdate={updatePinned}
              onDelete={deletePinned}
            />
          </>
        );
      case 'custom-days':
        return (
          <CustomDaysEditor
            customDays={state?.customDays || []}
            onCreate={createCustomDay}
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
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
