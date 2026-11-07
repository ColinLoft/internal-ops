import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useOverlayA11y } from './hooks/useOverlayA11y';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Sidebar } from './components/navigation/Sidebar';
import { MobileTabBar } from './components/navigation/MobileTabBar';
import { ConversationList } from './components/chat/ConversationList';
import { ChatFeed } from './components/chat/ChatFeed';
import { ThreadPanel } from './components/chat/ThreadPanel';
import { RightDrawer } from './components/chat/RightDrawer';
import { CalendarView } from './components/calendar/CalendarView';

// Auth & Modals
import { AuthScreen } from './components/auth/AuthScreen';
import { PasswordSetupModal } from './components/auth/PasswordSetupModal';
import { FirstLoginOnboarding } from './components/auth/FirstLoginOnboarding';
import { ProfileModal } from './components/profile/ProfileModal';
import { EditProfileModal } from './components/profile/EditProfileModal';
import { ShortcutsHelp } from './components/common/ShortcutsHelp';
import { SettingsPage } from './components/settings/SettingsPage';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { CreatePollModal } from './components/modals/CreatePollModal';
import { NewMessageModal } from './components/modals/NewMessageModal';
import { AddEventModal } from './components/modals/AddEventModal';
import { AddTeammateModal } from './components/modals/AddTeammateModal';
import { InviteReadyModal } from './components/modals/InviteReadyModal';
import { isRetiredWorkspacePath, RetiredWorkspacePage } from './components/RetiredWorkspacePage';
import { AccessGate } from './components/common/AccessGate';
import { CustomerPage } from './components/customers/CustomerPage';
import { CompanyPage } from './components/company/CompanyPage';
import { HomePage } from './components/home/HomePage';
import { NotFoundPage } from './components/NotFoundPage';
import { BugReportDialog } from './components/bug-report/BugReportDialog';
import { InsightsPage } from './components/insights/InsightsPage';
import { ProgramsPage } from './components/programs/ProgramsPage';
import { EngineeringPage } from './components/engineering/EngineeringPage';
import { PendingDocumentPrompt } from './components/organization/PolicySigning';
import { WildfireSolutionsPage } from './components/wildfire/WildfireSolutionsPage';
import { SystemsPage } from './components/systems';
import { isKnownWorkspacePath } from './lib/workspaceRoutes';

const PublicChatPage = lazy(async () => ({
  default: (await import('./components/support/PublicChatPage')).PublicChatPage,
}));
const PublicFormPage = lazy(async () => ({
  default: (await import('./components/forms/PublicFormPage')).PublicFormPage,
}));
const PublicContractSigning = lazy(async () => ({
  default: (await import('./components/customers/PublicContractSigning')).PublicContractSigning,
}));
const CallOverlay = lazy(async () => ({
  default: (await import('./components/call/CallOverlay')).CallOverlay,
}));

const WorkspaceShell: React.FC = () => {
  const {
    isAuthenticated,
    isAuthLoading,
    requiresPasswordSetup,
    requiresOnboarding,
    activeTab,
    currentUser,
    callSession,
    incomingCall,
    callError,
    activeThreadMessageId,
    isRightDrawerOpen,
    isAddTeammateOpen,
    setIsAddTeammateOpen,
    inviteReadyData,
    setInviteReadyData,
  } = useWorkspace();
  useOverlayA11y();
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [mobileChatPane, setMobileChatPane] = useState<'list' | 'feed'>('list');
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugReportSeed, setBugReportSeed] = useState<{ subject: string; details: string } | null>(null);

  useEffect(() => {
    setIsNavOpen(false);
    if (activeTab !== 'messages' && activeTab !== 'channels') setMobileChatPane('list');
  }, [activeTab]);

  useEffect(() => {
    const closeNav = () => { setIsNavOpen(false); setRoutePath(window.location.pathname); };
    const openNavForTour = () => setIsNavOpen(true);
    const finishTour = () => setIsNavOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsNavOpen(false); };
    window.addEventListener('popstate', closeNav);
    window.addEventListener('keydown', onKey);
    window.addEventListener('flown-onboarding-target-bug-report', openNavForTour);
    window.addEventListener('flown-onboarding-tour-finished', finishTour);
    return () => {
      window.removeEventListener('popstate', closeNav);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('flown-onboarding-target-bug-report', openNavForTour);
      window.removeEventListener('flown-onboarding-tour-finished', finishTour);
    };
  }, []);

  useEffect(() => {
    const legacyForm = routePath.match(/^\/forms(?:\/([^/]+))?\/?$/);
    if (!legacyForm) return;
    window.history.replaceState({}, '', `/company/forms${legacyForm[1] ? `?form=${encodeURIComponent(legacyForm[1])}` : ''}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [routePath]);

  const publicForm = routePath.match(/^\/company\/forms\/respond\/([^/]+)\/?$/);
  if (publicForm) {
    return <Suspense fallback={<div role="status" className="p-6">Loading form...</div>}><PublicFormPage token={publicForm[1]} /></Suspense>;
  }

  if (/^\/contract-signature\/?$/.test(routePath)) {
    return <Suspense fallback={<div role="status" className="p-6">Loading document...</div>}><PublicContractSigning token={new URLSearchParams(window.location.search).get('token') || ''} /></Suspense>;
  }

  if (/^\/contact\/?$/.test(routePath)) {
    return <Suspense fallback={null}><PublicChatPage /></Suspense>;
  }

  // If not authenticated, render the Auth Portal
  if (isAuthLoading) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-100 via-brand-50/70 to-brand-50/90" aria-label="Loading session" />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (!isKnownWorkspacePath(routePath) && !isRetiredWorkspacePath(routePath)) {
    return (
      <>
        <NotFoundPage
          onGoHome={() => {
            window.history.pushState({}, '', '/home');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          onReportBug={() => {
            setBugReportSeed({
              subject: `Broken page: ${window.location.pathname}`,
              details: `I reached a page that returned 404: ${window.location.pathname}`,
            });
            setBugReportOpen(true);
          }}
        />
        {bugReportOpen && <BugReportDialog initialSubject={bugReportSeed?.subject} initialDetails={bugReportSeed?.details} onClose={() => setBugReportOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex h-dvh min-h-dvh w-screen overflow-hidden bg-[#fafbfc]">
      <Sidebar isMobileOpen={isNavOpen} onOpenMobile={() => setIsNavOpen(true)} onOpenBugReport={() => { setBugReportSeed(null); setBugReportOpen(true); }} />
      {isNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setIsNavOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
        />
      )}

      {/* 2. Main Workspace Layout */}
      <div className="mb-[calc(3.5rem+env(safe-area-inset-bottom))] flex min-w-0 flex-1 flex-col overflow-hidden md:mb-0">
        {/* Workspace Body */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#fafbfc]">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {isRetiredWorkspacePath(routePath) ? <RetiredWorkspacePage /> : <>
          {activeTab === 'home' && <HomePage />}
          {activeTab === 'customers' && <AccessGate app="customers" name="Customers"><CustomerPage /></AccessGate>}
          {activeTab === 'company' && <CompanyPage />}
          {activeTab === 'insights' && <InsightsPage />}
          {activeTab === 'programs' && <ProgramsPage />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'systems' && <SystemsPage />}
          {activeTab === 'engineering' && <EngineeringPage />}
          {activeTab === 'wildfire' && <WildfireSolutionsPage />}
          {activeTab === 'messages' && (
            <>
              {/* Combined channels and direct messages sidebar */}
              <div className={`${mobileChatPane === 'list' ? 'flex' : 'hidden'} w-full md:w-auto md:flex`}>
                <ConversationList onSelect={() => setMobileChatPane('feed')} />
              </div>
              {/* Chat Feed */}
              <div className={`${mobileChatPane === 'feed' ? 'flex' : 'hidden'} min-w-0 flex-1 md:flex`}>
                <ChatFeed onBack={() => setMobileChatPane('list')} />
              </div>
              {/* Thread Side Panel or Info Drawer */}
              {activeThreadMessageId && <ThreadPanel />}
              {isRightDrawerOpen && !activeThreadMessageId && <RightDrawer />}
            </>
          )}

          {activeTab === 'channels' && (
            <>
              {/* Combined channels and direct messages sidebar */}
              <div className={`${mobileChatPane === 'list' ? 'flex' : 'hidden'} w-full md:w-auto md:flex`}>
                <ConversationList onSelect={() => setMobileChatPane('feed')} />
              </div>
              {/* Channel Feed */}
              <div className={`${mobileChatPane === 'feed' ? 'flex' : 'hidden'} min-w-0 flex-1 md:flex`}>
                <ChatFeed onBack={() => setMobileChatPane('list')} />
              </div>
              {/* Thread Side Panel or Info Drawer */}
              {activeThreadMessageId && <ThreadPanel />}
              {isRightDrawerOpen && !activeThreadMessageId && <RightDrawer />}
            </>
          )}

          {activeTab === 'calendar' && <CalendarView />}
          </>}
          </div>
        </div>
      </div>

      <ShortcutsHelp />
      {bugReportOpen && <BugReportDialog initialSubject={bugReportSeed?.subject} initialDetails={bugReportSeed?.details} onClose={() => setBugReportOpen(false)} />}
      <MobileTabBar isMenuOpen={isNavOpen} onToggleMenu={() => setIsNavOpen((open) => !open)} />

      {/* Floating In-App Voice & Video Call Overlay */}
      {(callSession.active || incomingCall || callError) && (
        <Suspense fallback={null}>
          <CallOverlay />
        </Suspense>
      )}

      {/* Modals & Dialogs */}
      <ProfileModal />
      <EditProfileModal />
      <CreateChannelModal />
      <CreatePollModal />
      <NewMessageModal />
      <AddEventModal />
      <AddTeammateModal
        isOpen={isAddTeammateOpen}
        onClose={() => setIsAddTeammateOpen(false)}
      />
      <InviteReadyModal
        isOpen={!!inviteReadyData}
        onClose={() => setInviteReadyData(null)}
        inviteData={inviteReadyData}
      />
      {requiresPasswordSetup && <PasswordSetupModal />}
      {!requiresPasswordSetup && requiresOnboarding && <FirstLoginOnboarding />}
      {!requiresPasswordSetup && !requiresOnboarding && <PendingDocumentPrompt userId={currentUser.id} />}
    </div>
  );
};

export function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}

export default App;
