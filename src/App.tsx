import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useOverlayA11y } from './hooks/useOverlayA11y';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Sidebar } from './components/navigation/Sidebar';
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
import { ShortcutsHelp } from './components/common/ShortcutsHelp';
import { SettingsPage } from './components/settings/SettingsPage';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { CreatePollModal } from './components/modals/CreatePollModal';
import { NewMessageModal } from './components/modals/NewMessageModal';
import { AddEventModal } from './components/modals/AddEventModal';
import { AddTeammateModal } from './components/modals/AddTeammateModal';
import { InviteReadyModal } from './components/modals/InviteReadyModal';
import { EmailInboxPage } from './components/email/EmailInboxPage';
import { DrivePage } from './components/drive/DrivePage';
import { AccessGate } from './components/common/AccessGate';
import { CustomerPage } from './components/customers/CustomerPage';
import { FinancePage } from './components/finance/FinancePage';
import { LegalPage } from './components/legal/LegalPage';
import { HomePage } from './components/home/HomePage';
import { NotFoundPage } from './components/NotFoundPage';
import { HelpCenterPage } from './components/help/HelpCenterPage';
import { InsightsPage } from './components/insights/InsightsPage';
import { OrganizationPage } from './components/organization/OrganizationPage';
import { ProgramsPage } from './components/programs/ProgramsPage';
import { GTMPage } from './components/gtm/GTMPage';
import { EngineeringPage } from './components/engineering/EngineeringPage';
import { PendingDocumentPrompt } from './components/organization/PolicySigning';

const PublicChatPage = lazy(async () => ({
  default: (await import('./components/support/PublicChatPage')).PublicChatPage,
}));
const CallOverlay = lazy(async () => ({
  default: (await import('./components/call/CallOverlay')).CallOverlay,
}));

const isKnownPath = (pathname: string) => /^\/?(|home|customers(?:\/[^/]+)?|finance(?:\/[^/]+)*|operations(?:\/[^/]+)?|legal(?:\/[^/]+)?|engineering(?:\/[^/]+)?|help|help-center|settings|contact|insights(?:\/[^/]+)?|organization(?:\/[^/]+)?|programs(?:\/[^/]+)*|gtm(?:\/[^/]+)?|messages|channels|calendar|email|inbox|admin(?:\/[^/]+)?|systems(?:\/[^/]+)?|drive|docs(?:\/[^/]+)?|slides(?:\/[^/]+)?|sheets(?:\/[^/]+)?|forms(?:\/[^/]+)?)\/?$/.test(pathname);

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
    workspaceSettings,
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

  if (/^\/contact\/?$/.test(window.location.pathname)) {
    return <Suspense fallback={null}><PublicChatPage /></Suspense>;
  }

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
    <div className="flex h-dvh min-h-dvh w-screen overflow-hidden bg-[#fafbfc]">
      <Sidebar isMobileOpen={isNavOpen} />
      {isNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setIsNavOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
        />
      )}

      {/* 2. Main Workspace Layout */}
      <div className="mb-14 flex min-w-0 flex-1 flex-col overflow-hidden md:mb-0">
        <TopBar />
        {/* Workspace Body */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#fafbfc]">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {activeTab === 'home' && <HomePage />}
          {activeTab === 'customers' && <AccessGate app="customers" name="Customers"><CustomerPage /></AccessGate>}
          {activeTab === 'finance' && <AccessGate app="finance" name="Finance"><FinancePage /></AccessGate>}
          {activeTab === 'legal' && <AccessGate app="legal" name="Legal"><LegalPage /></AccessGate>}
          {activeTab === 'helpcenter' && <HelpCenterPage />}
          {activeTab === 'insights' && <InsightsPage />}
          {activeTab === 'organization' && <OrganizationPage />}
          {activeTab === 'programs' && <ProgramsPage />}
          {activeTab === 'gtm' && <GTMPage />}
          {activeTab === 'settings' && <SettingsPage />}
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
