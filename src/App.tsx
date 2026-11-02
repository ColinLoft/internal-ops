import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useOverlayA11y } from './hooks/useOverlayA11y';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Rail } from './components/navigation/Rail';
import { TopBar } from './components/navigation/TopBar';
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
import { SettingsModal } from './components/profile/SettingsModal';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { CreatePollModal } from './components/modals/CreatePollModal';
import { NewMessageModal } from './components/modals/NewMessageModal';
import { AddEventModal } from './components/modals/AddEventModal';
import { AddTeammateModal } from './components/modals/AddTeammateModal';
import { InviteReadyModal } from './components/modals/InviteReadyModal';
import { EmailInboxPage } from './components/email/EmailInboxPage';
import { WorkspaceAssistant } from './components/assistant/WorkspaceAssistant';
import { DrivePage } from './components/drive/DrivePage';
import { AccessGate } from './components/common/AccessGate';
import { CustomerPage } from './components/customers/CustomerPage';
import { FinancePage } from './components/finance/FinancePage';
import { LegalPage } from './components/legal/LegalPage';
import { AdminPage } from './components/admin/AdminPage';
import { HomePage } from './components/home/HomePage';
import { NotFoundPage } from './components/NotFoundPage';
import { SupportPage } from './components/support/SupportPage';
import { InsightsPage } from './components/insights/InsightsPage';
import { OrganizationPage } from './components/organization/OrganizationPage';
import { ProgramsPage } from './components/programs/ProgramsPage';
import { GTMPage } from './components/gtm/GTMPage';
import { EngineeringPage } from './components/engineering/EngineeringPage';
import { PendingDocumentPrompt } from './components/organization/PolicySigning';

const CallOverlay = lazy(async () => ({
  default: (await import('./components/call/CallOverlay')).CallOverlay,
}));

const isKnownPath = (pathname: string) => /^\/?(|home|customers(?:\/[^/]+)?|finance(?:\/[^/]+)*|operations(?:\/[^/]+)?|legal(?:\/[^/]+)?|engineering(?:\/[^/]+)?|help|insights(?:\/[^/]+)?|organization(?:\/[^/]+)?|programs(?:\/[^/]+)*|gtm(?:\/[^/]+)?|messages|channels|calendar|email|inbox|admin(?:\/[^/]+)?|systems(?:\/[^/]+)?|drive|docs(?:\/[^/]+)?|slides(?:\/[^/]+)?|sheets(?:\/[^/]+)?|forms(?:\/[^/]+)?)\/?$/.test(pathname);

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
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [mobileChatPane, setMobileChatPane] = useState<'list' | 'feed'>('list');

  useEffect(() => {
    setIsNavOpen(false);
    if (activeTab !== 'messages' && activeTab !== 'channels') setMobileChatPane('list');
  }, [activeTab]);

  useEffect(() => {
    const closeNav = () => setIsNavOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsNavOpen(false); };
    window.addEventListener('popstate', closeNav);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', closeNav);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // If not authenticated, render the Auth Portal
  if (isAuthLoading) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-100 via-brand-50/70 to-brand-50/90" aria-label="Loading session" />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (!isKnownPath(window.location.pathname)) {
    return <NotFoundPage onGoHome={() => {
      window.history.pushState({}, '', '/drive');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }} />;
  }

  return (
    <div className="flex min-h-dvh h-dvh w-screen overflow-hidden bg-gradient-to-br from-slate-100 via-brand-50/70 to-brand-50/90">
      {/* 1. Left Icon Rail */}
      <Rail isMobileOpen={isNavOpen} />
      {isNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setIsNavOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
        />
      )}

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pb-14 md:pb-0">
        {/* Top Bar with Search and Shortcuts */}
        <TopBar />

        {/* Workspace Body */}
        <div className="flex-1 flex min-w-0 h-full overflow-hidden">
          {activeTab === 'home' && <HomePage />}
          {activeTab === 'customers' && <AccessGate app="customers" name="Relationships"><CustomerPage /></AccessGate>}
          {activeTab === 'finance' && <AccessGate app="finance" name="Finance"><FinancePage /></AccessGate>}
          {activeTab === 'legal' && <AccessGate app="legal" name="Legal"><LegalPage /></AccessGate>}
          {activeTab === 'help' && <SupportPage />}
          {activeTab === 'insights' && <InsightsPage />}
          {activeTab === 'organization' && <OrganizationPage />}
          {activeTab === 'programs' && <ProgramsPage />}
          {activeTab === 'gtm' && <GTMPage />}
          {activeTab === 'admin' && <AdminPage />}
          {activeTab === 'engineering' && <EngineeringPage />}
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
          {activeTab === 'inbox' && <EmailInboxPage />}
          {activeTab === 'drive' && <DrivePage />}
        </div>
      </div>

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
      <SettingsModal />
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
      <WorkspaceAssistant />
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
