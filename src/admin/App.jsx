import React, { useState, useEffect, useCallback } from 'react';
import useSectionRoute from './hooks/useSectionRoute.js';
import useAdminState, { notify } from './hooks/useAdminState.js';
import useMe from './hooks/useMe.js';
import { canOpenSection } from '../shared/permissions.js';
import AdminLayout, { navItems } from './components/AdminLayout.jsx';
import LivePreview from './components/LivePreview.jsx';
import ScreenControls from './components/ScreenControls.jsx';
import SlideManager from './components/SlideManager.jsx';
import HomePanel from './components/HomePanel.jsx';
import AnnouncementsPanel from './components/announcements/AnnouncementsPanel.jsx';
import AnnouncementComposer from './components/announcements/AnnouncementComposer.jsx';
import QuickAnnounceSheet from './components/QuickAnnounceSheet.jsx';
import CustomDaysEditor from './components/CustomDaysEditor.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StylePanel from './components/StylePanel.jsx';
import ImageUploader from './components/ImageUploader.jsx';
import GooglePhotosManager from './components/GooglePhotosManager.jsx';
import RSSManager from './components/RSSManager.jsx';
import ScheduleSection from './components/ScheduleSection.jsx';
import DailyWordPanel from './components/DailyWordPanel.jsx';
import HelpPanel from './components/HelpPanel.jsx';
import TeamPanel from './components/TeamPanel.jsx';
import AccountPanel from './components/AccountPanel.jsx';
import WelcomeTour from './components/WelcomeTour.jsx';
import { TOUR_KEY } from './help/helpContent.js';
import ToastContainer from './components/ToastContainer.jsx';
import { colors, adminFonts, buttonPrimary } from './styles/admin-tokens.js';

// Admin sections that have their own URL (/admin/<key>).
const SECTION_KEYS = navItems.map((n) => n.key);

export default function App() {
  const [routeSection, setRouteSection] = useSectionRoute(SECTION_KEYS, 'home');
  const { me, ready: meReady, refreshMe } = useMe();
  const role = me?.role;
  // A section this person's role can't open (e.g. an editor following a /admin/team
  // link) shows Slides instead, and the address bar is tidied without a Back-button trap.
  const activeSection = canOpenSection(role, routeSection) ? routeSection : 'home';
  useEffect(() => {
    if (!meReady || activeSection === routeSection) return;
    window.history.replaceState({ section: activeSection }, '', `/admin/${activeSection}`);
    setRouteSection(activeSection);
  }, [meReady, activeSection, routeSection, setRouteSection]);
  const setActiveSection = useCallback((key) => {
    if (!canOpenSection(role, key)) { notify('Only an admin can open that part.', 'error'); return; }
    setRouteSection(key);
  }, [role, setRouteSection]);
  // Announcement composer (overlay): null | an item to edit | a preset for a new one.
  const [composer, setComposer] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  // First visit in this browser: show the welcome tour once (remembered in localStorage).
  const [tourOpen, setTourOpen] = useState(() => { try { return !localStorage.getItem(TOUR_KEY); } catch { return false; } });
  const closeTour = () => { setTourOpen(false); try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } };
  const {
    state, loading, error, retry,
    toasts, dismissToast,
    updateSettings, updateSlides, createSlide, deleteSlide,
    createAnnouncement, updateAnnouncement, reactivateAnnouncement,
    duplicateAnnouncement, deleteAnnouncement, quickPostAnnouncement, fetchShabbosEnd,
    createCustomDay, updateCustomDay, deleteCustomDay,
    fetchSchedule, updateScheduleEntries, createScheduleEntry,
    updateScheduleEntry, deleteScheduleEntry, updateScheduleCategories,
    loadScheduleTemplate,
    fetchScheduleTemplates, saveScheduleTemplate, updateScheduleTemplate, deleteScheduleTemplate,
    refresh, screenCommand,
  } = useAdminState();

  // Start-up animation (public/splash/) fades out once the panel can render.
  useEffect(() => { if (!loading && meReady) window.ttSplash?.done(); }, [loading, meReady]);

  if (loading || !meReady) {
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
      case 'home':
        return (
          <HomePanel
            state={state}
            onQuick={() => setQuickOpen(true)}
            onEdit={(item) => item && setComposer(item)}
            onPause={(id) => updateAnnouncement(id, { enabled: false }, 'Paused')}
            onRemove={deleteAnnouncement}
            onGo={setActiveSection}
            screenCommand={screenCommand}
            refresh={refresh}
          />
        );
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
      case 'help':
        return <HelpPanel role={role} onNavigate={setActiveSection} onTour={() => setTourOpen(true)} />;
      case 'team':
        return <TeamPanel />;
      case 'account':
        return <AccountPanel me={me} onChanged={refreshMe} />;
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
        me={me}
      >
        {renderSection()}
      </AdminLayout>
      {tourOpen && <WelcomeTour onClose={closeTour} onGo={setActiveSection} />}
      {!tourOpen && canOpenSection(role, 'announcements') && (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label="Quick announcement"
          title="Quick announcement"
          style={{
            position: 'fixed',
            right: 'calc(16px + env(safe-area-inset-right))',
            bottom: 'calc(16px + env(safe-area-inset-bottom))',
            zIndex: 900,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: `1px solid ${colors.goldBd}`,
            background: colors.gold,
            color: '#1a1304',
            fontSize: '26px',
            lineHeight: 1,
            fontFamily: adminFonts.englishBody,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(0,0,0,.45)',
          }}
        >
          {'+'}
        </button>
      )}
      {quickOpen && (
        <QuickAnnounceSheet
          onClose={() => setQuickOpen(false)}
          onPost={quickPostAnnouncement}
          tz={state?.settings?.location?.timezone || undefined}
        />
      )}
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
