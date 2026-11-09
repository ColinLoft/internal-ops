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
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { CreatePollModal } from './components/modals/CreatePollModal';
import { NewMessageModal } from './components/modals/NewMessageModal';
import { AddEventModal } from './components/modals/AddEventModal';
import { AddTeammateModal } from './components/modals/AddTeammateModal';
import { InviteReadyModal } from './components/modals/InviteReadyModal';
import { isRetiredWorkspacePath, RetiredWorkspacePage } from './components/RetiredWorkspacePage';
import { AccessGate } from './components/common/AccessGate';
import { HomePage } from './components/home/HomePage';
import { NotFoundPage } from './components/NotFoundPage';
import { NotificationsPage } from './components/notifications/NotificationsPage';
import { PendingDocumentPrompt } from './components/organization/PolicySigning';
import { isKnownWorkspacePath, legacyWorkspaceRedirect, workspaceTabFromPath } from './lib/workspaceRoutes';
import { TableSkeleton } from './components/common/Feedback';
import { MotionEffects } from './components/common/MotionEffects';
import { BackendStatusBanner } from './components/common/BackendStatusBanner';

const SettingsPage = lazy(() => import('./components/settings/SettingsPage').then(module => ({ default: module.SettingsPage })));
const CustomerPage = lazy(() => import('./components/customers/CustomerPage').then(module => ({ default: module.CustomerPage })));
const CompanyPage = lazy(() => import('./components/company/CompanyPage').then(module => ({ default: module.CompanyPage })));
const InsightsPage = lazy(() => import('./components/insights/InsightsPage').then(module => ({ default: module.InsightsPage })));
const ProgramsPage = lazy(() => import('./components/programs/ProgramsPage').then(module => ({ default: module.ProgramsPage })));
const EngineeringPage = lazy(() => import('./components/engineering/EngineeringPage').then(module => ({ default: module.EngineeringPage })));
const WildfirePage = lazy(() => import('./components/wildfire/WildfirePage').then(module => ({ default: module.WildfirePage })));
const SystemsPage = lazy(() => import('./components/systems').then(module => ({ default: module.SystemsPage })));

const PublicChatPage = lazy(async () => ({
  default: (await import('./components/support/PublicChatPage')).PublicChatPage,
}));
const PublicFormPage = lazy(async () => ({
  default: (await import('./components/forms/PublicFormPage')).PublicFormPage,
}));
const PublicContractSigning = lazy(async () => ({
  default: (await import('./components/customers/PublicContractSigning')).PublicContractSigning,
}));
const PublicQuoteAcceptance = lazy(async () => ({
  default: (await import('./components/wildfire/PublicQuoteAcceptance')).PublicQuoteAcceptance,
}));
const CallOverlay = lazy(async () => ({
  default: (await import('./components/call/CallOverlay')).CallOverlay,
}));

const WorkspaceShell: React.FC = () => {
  const {
    isAuthenticated,
    isAuthLoading,
    isWorkspaceLoading,
    workspaceLoadError,
    requiresPasswordSetup,
    requiresOnboarding,
    activeTab: selectedTab,
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
  const activeTab = workspaceTabFromPath(routePath) ?? selectedTab;
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [mobileChatPane, setMobileChatPane] = useState<'list' | 'feed'>('list');

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
    window.addEventListener('flown-onboarding-target-notifications', openNavForTour);
    window.addEventListener('flown-onboarding-tour-finished', finishTour);
    return () => {
      window.removeEventListener('popstate', closeNav);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('flown-onboarding-target-notifications', openNavForTour);
      window.removeEventListener('flown-onboarding-tour-finished', finishTour);
    };
  }, []);

  useEffect(() => {
    const target = legacyWorkspaceRedirect(routePath, window.location.search);
    if (!target) return;
    window.history.replaceState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [routePath]);

  const publicForm = routePath.match(/^\/company\/forms\/respond\/([^/]+)\/?$/);
  if (publicForm) {
    return <Suspense fallback={<div role="status" className="p-6">Loading form...</div>}><PublicFormPage token={publicForm[1]} /></Suspense>;
  }

  if (/^\/contract-signature\/?$/.test(routePath)) {
    return <Suspense fallback={<div role="status" className="p-6">Loading document...</div>}><PublicContractSigning token={new URLSearchParams(window.location.search).get('token') || ''} /></Suspense>;
  }
  if (/^\/wildfire-quote\/?$/.test(routePath)) {
    return <Suspense fallback={<div role="status" className="p-6">Loading quote...</div>}><PublicQuoteAcceptance token={new URLSearchParams(window.location.search).get('token') || ''} /></Suspense>;
  }

  if (/^\/contact\/?$/.test(routePath)) {
    return <Suspense fallback={null}><PublicChatPage /></Suspense>;
  }

  // If not authenticated, render the Auth Portal
  if (isAuthLoading) {
    return <div className="min-h-screen bg-black p-6 text-white"><p role="status" className="mb-5 text-sm text-slate-400">Opening your workspace...</p><TableSkeleton /></div>;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  const isUnknownPath = !isKnownWorkspacePath(routePath) && !isRetiredWorkspacePath(routePath) && !legacyWorkspaceRedirect(routePath);
  const isNotificationsPath = /^\/notifications\/?$/.test(routePath);

  return (
    <div className="flex h-dvh min-h-dvh w-screen overflow-hidden bg-black">
      <Sidebar isMobileOpen={isNavOpen} onOpenMobile={() => setIsNavOpen(true)} />
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
          <BackendStatusBanner />
          <div data-workspace-content className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-black">
          <Suspense fallback={<div className="flex-1 bg-black p-6"><TableSkeleton /></div>}>
          {isUnknownPath ? (
            <NotFoundPage
              onGoHome={() => {
                window.history.pushState({}, '', '/home');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            />
          ) : isNotificationsPath ? <NotificationsPage /> : isRetiredWorkspacePath(routePath) ? <RetiredWorkspacePage /> : <>
          {activeTab === 'home' && <HomePage />}
          {activeTab === 'customers' && <AccessGate app="customers" name="Customers"><CustomerPage /></AccessGate>}
          {activeTab === 'company' && <CompanyPage />}
          {activeTab === 'insights' && <InsightsPage />}
          {activeTab === 'programs' && <ProgramsPage />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'systems' && <SystemsPage />}
          {activeTab === 'engineering' && <EngineeringPage />}
          {activeTab === 'wildfire' && <WildfirePage />}
          {(['messages', 'channels', 'calendar'].includes(activeTab)) && (workspaceLoadError ? <section className="flex-1 p-6"><p role="alert" className="text-sm text-slate-400">{workspaceLoadError}</p><button type="button" className="mt-4 text-brand-500 underline" onClick={() => window.location.reload()}>Reload messages and calendar</button></section> : isWorkspaceLoading ? <div className="flex-1 p-6"><TableSkeleton /></div> : null)}
          {activeTab === 'messages' && !isWorkspaceLoading && !workspaceLoadError && (
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

          {activeTab === 'channels' && !isWorkspaceLoading && !workspaceLoadError && (
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

          {activeTab === 'calendar' && !isWorkspaceLoading && !workspaceLoadError && <CalendarView />}
          </>}
          </Suspense>
          </div>
        </div>
      </div>

      <ShortcutsHelp />
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
      <CreateChannelModal onCreated={() => setMobileChatPane('feed')} />
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
      <MotionEffects><WorkspaceShell /></MotionEffects>
    </WorkspaceProvider>
  );
}

export default App;
