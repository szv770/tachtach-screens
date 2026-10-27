import React, { useState, useEffect, useCallback } from 'react';
import useSectionRoute from './hooks/useSectionRoute.js';
import useAdminState, { notify } from './hooks/useAdminState.js';
import useMe from './hooks/useMe.js';
import { canOpenSection, effectiveCaps, can } from '../shared/permissions.js';
import AdminLayout from './components/AdminLayout.jsx';
import { SECTION_KEYS, SECTION_ALIASES, SECTION_TABS, resolveTarget } from './nav.js';
import { writeQueryParam, readQueryParam } from './hooks/useQueryParam.js';
import Home from './components/Home.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import NewSheet from './components/NewSheet.jsx';
import UiKit from './components/UiKit.jsx';
import ThemeSwitch from './components/ThemeSwitch.jsx';
import { confirmLeave } from './components/ui/dirty.js';
import { jumpTo } from './search/jump.js';
import LivePreview from './components/LivePreview.jsx';
import ScreenControls from './components/ScreenControls.jsx';
import SlideManager from './components/SlideManager.jsx';
import { requestSlideOpen } from './components/slides/openRequest.js';
import AnnouncePage from './components/announcements/AnnouncePage.jsx';
import AnnouncementComposer from './components/announcements/AnnouncementComposer.jsx';
import QuickAnnounceSheet from './components/QuickAnnounceSheet.jsx';
import PostSheet from './components/PostSheet.jsx';
import { postStyle } from '../shared/postDefaults.js';
import CustomDaysEditor from './components/CustomDaysEditor.jsx';
import ThemesPage from './components/look/ThemesPage.jsx';
import FontsPage from './components/look/FontsPage.jsx';
import LayoutPage from './components/look/LayoutPage.jsx';
import LogoPage from './components/look/LogoPage.jsx';
import MotionPage from './components/look/MotionPage.jsx';
import LocationPage from './components/look/LocationPage.jsx';
import ShowsPage from './components/look/ShowsPage.jsx';
import ScheduleDisplayPage from './components/look/ScheduleDisplayPage.jsx';
import SecurityPage from './components/look/SecurityPage.jsx';
import ThisScreenPage from './components/look/ThisScreenPage.jsx';
import MediaPage from './components/media/MediaPage.jsx';
import ScheduleSection from './components/ScheduleSection.jsx';
import DailyWordPanel from './components/DailyWordPanel.jsx';
import DailyStoryPanel from './components/DailyStoryPanel.jsx';
import RosterPanel from './components/RosterPanel.jsx';
import ChazanPanel from './components/chazan/ChazanPanel.jsx';
import HelpPanel from './components/HelpPanel.jsx';
import TeamPanel from './components/TeamPanel.jsx';
import AccountPanel from './components/AccountPanel.jsx';
import HistoryPage from './components/ops/HistoryPage.jsx';
import HealthPage from './components/ops/HealthPage.jsx';
import ChangeDaySheet from './components/schedule/ChangeDaySheet.jsx';
import WelcomeTour from './components/WelcomeTour.jsx';
import { TOUR_KEY } from './help/helpContent.js';
import ToastContainer from './components/ToastContainer.jsx';
import { colors, adminFonts, buttonPrimary } from './styles/admin-tokens.js';


// The old /admin/rss-feeds address is now Media > News feeds. Rewrite it before the router reads it.
try {
  if (/^\/admin\/rss-feeds\/?$/.test(window.location.pathname)) {
    window.history.replaceState(window.history.state, '', '/admin/images?tab=feeds');
  }
} catch { /* ignore */ }

export default function App() {
  const [routeSection, setRouteSection] = useSectionRoute(SECTION_KEYS, 'home', SECTION_ALIASES);
  const { me, ready: meReady, refreshMe } = useMe();
  const role = me; // the whole person: tabs come from their capabilities (permissions.js), not just admin/editor
  // A section this person's role can't open (e.g. an editor following a /admin/team
  // link) shows Home instead, and the address bar is tidied without a Back-button trap.
  const activeSection = canOpenSection(role, routeSection) ? routeSection : 'home';
  useEffect(() => {
    if (!meReady || activeSection === routeSection) return;
    window.history.replaceState({ section: activeSection }, '', `/admin/${activeSection}`);
    setRouteSection(activeSection);
  }, [meReady, activeSection, routeSection, setRouteSection]);
  // Accepts 'images', 'images?tab=web' and retired keys such as 'rss-feeds' (= Media > News feeds).
  const setActiveSection = useCallback((rawKey) => {
    const { section: key, tab } = resolveTarget(rawKey);
    if (!canOpenSection(role, key)) { notify('Only an admin can open that part.', 'error'); return false; }
    if (key !== routeSection && !confirmLeave()) return false;
    setRouteSection(key);
    if (SECTION_TABS[key]) writeQueryParam('tab', tab);
    return true;
  }, [role, routeSection, setRouteSection]);
  // Go to a section, optionally on one of its tabs (Media: library | photos | web | feeds). Returns false when the person
  // stayed put (unsaved-changes prompt, no access).
  const goSection = useCallback((key, opts) => setActiveSection(opts?.tab ? `${key}?tab=${opts.tab}` : key), [setActiveSection]);
  // Announcement composer (overlay): null | an item to edit | a preset for a new one.
  const [composer, setComposer] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickStart, setQuickStart] = useState(null); // a template to open straight into its fill step
  const [newOpen, setNewOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false); // the one Post sheet (settings.post.style = 'sheet')
  const [changeDay, setChangeDay] = useState(null); // null | 'today' | 'tomorrow': the one-day schedule sheet (Home and Schedule)
  const [searchOpen, setSearchOpen] = useState(false);
  // First visit in this browser: show the welcome tour once (remembered in localStorage).
  const [tourOpen, setTourOpen] = useState(() => { try { return !localStorage.getItem(TOUR_KEY); } catch { return false; } });
  const closeTour = () => { setTourOpen(false); try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } };
  const {
    state, loading, error, retry,
    toasts, dismissToast,
    updateSettings, updateSlides, createSlide, deleteSlide,
    createAnnouncement, updateAnnouncement, reactivateAnnouncement,
    duplicateAnnouncement, deleteAnnouncement, quickPostAnnouncement, postFromSheet, fetchShabbosEnd,
    createCustomDay, updateCustomDay, deleteCustomDay,
    fetchSchedule, updateScheduleEntries, createScheduleEntry,
    updateScheduleEntry, deleteScheduleEntry, updateScheduleCategories,
    loadScheduleTemplate,
    fetchScheduleTemplates, saveScheduleTemplate, updateScheduleTemplate, deleteScheduleTemplate,
    refresh, screenCommand,
  } = useAdminState();

  const siteName = state?.settings?.siteName || 'My screen';
  const canPost = canOpenSection(role, 'announcements');
  const myCaps = me ? (me.caps || []) : effectiveCaps({ role: 'editor' });
  // The + button, New on a computer, the home-screen shortcut and search 'Quick message': one door, or the classic cards (Look & Settings > What shows > Post button).
  const sheetStyle = postStyle(state?.settings) === 'sheet';
  const openPost = () => { if (sheetStyle) setPostOpen(true); else setQuickOpen(true); };
  // Home-screen icon shortcuts (public/manifest.webmanifest): /admin/?action=post | tomorrow.
  useEffect(() => {
    if (!meReady || !state) return; // wait for the settings too: the Post button style decides which door opens
    const act = readQueryParam('action');
    if (!act) return;
    writeQueryParam('action', null);
    if (act === 'post' && can(myCaps, 'announcements.post')) openPost();
    if (act === 'tomorrow' && can(myCaps, 'schedule.edit')) setChangeDay('tomorrow');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meReady, !!state]);

  // "/" opens search from anywhere (unless typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickNew = (kind) => {
    setNewOpen(false);
    if (kind === 'quick') setQuickOpen(true);
    else setComposer({ display: kind });
  };

  // Run what a search result (or Home tile) asks for.
  const runAction = (a) => {
    if (!a) return;
    switch (a.type) {
      case 'go': setActiveSection(a.tab ? `${a.section}?tab=${a.tab}` : a.section); if (a.anchor || a.match) jumpTo({ anchor: a.anchor, match: a.match }); break;
      case 'slide-popup': if (setActiveSection(a.section || 'slides') !== false) requestSlideOpen(a.slide); break;
      case 'new': setComposer({ display: a.kind }); break;
      case 'quick': openPost(); break;
      case 'change-day': setChangeDay(a.when || 'tomorrow'); break;
      case 'command': screenCommand(a.name); break;
      case 'preview': window.open('/screen?preview=true', '_blank', 'noopener'); break;
      case 'edit-announcement': setComposer(a.item); break;
      case 'toggle-announcement': updateAnnouncement(a.item.id, { enabled: a.enabled }, a.enabled ? 'Resumed' : 'Paused'); break;
      default: break;
    }
  };

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

  const settings = state?.settings || {};
  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return (
          <Home
            state={state} me={me} siteName={siteName}
            onGo={setActiveSection} onQuick={openPost} onCommand={screenCommand}
            onNew={(kind) => setComposer({ display: kind })} onRefreshData={refresh} onChangeDay={setChangeDay}
          />
        );
      case 'history':
        return <HistoryPage me={me} onChanged={() => retry({ silent: true })} />;
      case 'health':
        return <HealthPage me={me} onGo={setActiveSection} />;
      case 'kit':
        return <UiKit />;
      case 'slides':
        return (
          <SlideManager
            slides={state?.slides || []}
            onUpdate={updateSlides}
            onCreate={createSlide}
            onDelete={deleteSlide}
            settings={state?.settings || {}}
            onSaveSettings={updateSettings}
            onNavigate={goSection}
            caps={me ? (me.caps || []) : effectiveCaps({ role: 'editor' })}
            announcements={state?.announcements || []}
            onNewMessage={() => setComposer({ display: 'slide' })}
            onEditAnnouncement={(item) => setComposer(item)}
            onDeleteAnnouncement={deleteAnnouncement}
            onToggleAnnouncement={(item, enabled) => updateAnnouncement(item.id, { enabled }, enabled ? 'Resumed' : 'Paused')}
          />
        );
      case 'schedule':
        return (
          <ScheduleSection
            scheduleDates={state?.scheduleDates || {}}
            settings={state?.settings || {}}
            onSaveSettings={updateSettings}
            onRefreshSchedule={fetchSchedule}
            onNavigate={goSection}
            onChangeDay={setChangeDay}
            caps={me ? (me.caps || []) : effectiveCaps({ role: 'editor' })}
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
          <AnnouncePage
            caps={myCaps}
            onUseQuick={(t) => { setQuickStart(t); setQuickOpen(true); }}
            onPostLetter={quickPostAnnouncement}
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
      case 'daily-story':
        return <DailyStoryPanel />;
      case 'roster':
        return <RosterPanel canEdit={can(myCaps, 'roster.edit')} onNavigate={setActiveSection} />;
      case 'chazan':
        return <ChazanPanel canEdit={can(myCaps, 'chazan.edit')} onNavigate={setActiveSection} />;
      case 'help':
        return <HelpPanel role={role} onNavigate={setActiveSection} onTour={() => setTourOpen(true)} />;
      case 'team':
        return <TeamPanel />;
      case 'account':
        return (
          <>
            <div style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.dim, marginBottom: '8px' }}>Appearance on this device</div>
              <ThemeSwitch />
            </div>
            <button type="button" data-testid="account-history" onClick={() => setActiveSection('history')} style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '64px', padding: '10px 16px', marginBottom: '16px', textAlign: 'left', cursor: 'pointer',
              background: colors.card, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)', border: '1px solid var(--line)', color: colors.text, fontFamily: adminFonts.englishBody,
            }}>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '16px', fontWeight: 700 }}>Recent changes</span>
                <span style={{ display: 'block', fontSize: '13px', color: colors.dim }}>See who changed what, and undo a mistake</span>
              </span>
              <span aria-hidden style={{ color: colors.muted, fontSize: '20px' }}>›</span>
            </button>
            <AccountPanel me={me} onChanged={refreshMe} />
          </>
        );
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
          <MediaPage
            me={me} slides={state?.slides || []} settings={settings} screenDisplay={state?.screenDisplay || null}
            onCreateSlide={createSlide} onUpdateSlides={updateSlides} onDeleteSlide={deleteSlide}
          />
        );
      case 'themes':
        return <ThemesPage settings={settings} onSave={updateSettings} />;
      case 'style':
        return <FontsPage settings={settings} onSave={updateSettings} />;
      case 'layout':
        return <LayoutPage settings={settings} onSave={updateSettings} onNavigate={setActiveSection} />;
      case 'logo':
        return <LogoPage settings={settings} onSave={updateSettings} slides={state?.slides || []} />;
      case 'motion':
        return <MotionPage settings={settings} onSave={updateSettings} />;
      case 'location':
        return <LocationPage settings={settings} onSave={updateSettings} onNavigate={setActiveSection} />;
      case 'shows':
        return <ShowsPage settings={settings} onSave={updateSettings} />;
      case 'schedule-display':
        return <ScheduleDisplayPage settings={settings} onSave={updateSettings} />;
      case 'security':
        return <SecurityPage onNavigate={setActiveSection} />;
      case 'this-screen':
        return <ThisScreenPage settings={settings} onSave={updateSettings} me={me} />;
      default:
        return null;
    }
  };

  const previewSlot = (
    <>
      <LivePreview state={state} />
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
        siteName={siteName}
        canPost={canPost && !tourOpen}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenNew={() => (sheetStyle ? setPostOpen(true) : setNewOpen(true))}
      >
        {renderSection()}
      </AdminLayout>
      {changeDay && (
        <ChangeDaySheet
          open startWith={changeDay} tz={state?.settings?.location?.timezone}
          schedule={{ entries: state?.scheduleEntries || [], categories: state?.scheduleCategories || [] }}
          scheduleDates={state?.scheduleDates || {}}
          onClose={() => setChangeDay(null)}
          onSaved={() => retry({ silent: true })}
        />
      )}
      {tourOpen && <WelcomeTour onClose={closeTour} onGo={setActiveSection} />}
      <NewSheet open={newOpen && !sheetStyle} onClose={() => setNewOpen(false)} onPick={pickNew} />
      {postOpen && sheetStyle && (
        <PostSheet
          caps={myCaps} settings={state?.settings || {}} announcements={state?.announcements || []} slides={state?.slides || []}
          cache={state?.cache || null} freeze={state?.freeze || null} meId={me?.id || null}
          fetchShabbosEnd={fetchShabbosEnd}
          onClose={() => setPostOpen(false)}
          onPost={(body, opts) => postFromSheet(body, { ...opts, onEdit: can(myCaps, 'announcements.edit') ? setComposer : null })}
          onDraft={(body) => createAnnouncement(body, 'Draft saved')}
          onMore={(draft) => { setPostOpen(false); setComposer(draft); }}
          onManage={() => { setPostOpen(false); goSection('announcements', { tab: 'quick' }); }}
          onGoHome={() => { setPostOpen(false); setActiveSection('home'); }}
        />
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} state={state} role={role} onRun={runAction} />
      {quickOpen && (
        <QuickAnnounceSheet
          key={quickStart?.id || 'list'}
          caps={myCaps}
          startWith={quickStart}
          onClose={() => { setQuickOpen(false); setQuickStart(null); }}
          onPost={quickPostAnnouncement}
          onManage={() => { setQuickOpen(false); setQuickStart(null); goSection('announcements', { tab: 'quick' }); }}
        />
      )}
      {composer && (
        <AnnouncementComposer
          key={composer.id || 'new'}
          initial={composer}
          caps={myCaps}
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
