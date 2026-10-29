import React, { lazy, Suspense } from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Rail } from './components/navigation/Rail';
import { TopBar } from './components/navigation/TopBar';
import { ConversationList } from './components/chat/ConversationList';
import { ChannelList } from './components/chat/ChannelList';
import { ChatFeed } from './components/chat/ChatFeed';
import { ThreadPanel } from './components/chat/ThreadPanel';
import { RightDrawer } from './components/chat/RightDrawer';
import { CalendarView } from './components/calendar/CalendarView';
import { AdminPage } from './components/admin/AdminPage';

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
import { NotFoundPage } from './components/NotFoundPage';

const CallOverlay = lazy(async () => ({
  default: (await import('./components/call/CallOverlay')).CallOverlay,
}));

const isKnownPath = (pathname: string) => /^\/?(|messages|channels|calendar|email|inbox|admin|drive|docs(?:\/[^/]+)?|slides(?:\/[^/]+)?|sheets(?:\/[^/]+)?|forms(?:\/[^/]+)?)\/?$/.test(pathname);

const WorkspaceShell: React.FC = () => {
  const {
    isAuthenticated,
    isAuthLoading,
    requiresPasswordSetup,
    requiresOnboarding,
    activeTab,
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

  // If not authenticated, render the Auth Portal
  if (isAuthLoading) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50/70 to-blue-50/90" aria-label="Loading session" />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (!isKnownPath(window.location.pathname)) {
    return <NotFoundPage onGoHome={() => {
      window.history.pushState({}, '', '/messages');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }} />;
  }

  return (
    <div className="flex min-h-screen h-full w-screen overflow-hidden bg-gradient-to-br from-slate-100 via-sky-50/70 to-blue-50/90 select-none">
      {/* 1. Left Icon Rail */}
      <Rail />

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Bar with Search and Shortcuts */}
        <TopBar />

        {/* Workspace Body */}
        <div className="flex-1 flex min-w-0 h-full overflow-hidden">
          {activeTab === 'messages' && (
            <>
              {/* Messages Sidebar */}
              <ConversationList />
              {/* Chat Feed */}
              <ChatFeed />
              {/* Thread Side Panel or Info Drawer */}
              {activeThreadMessageId && <ThreadPanel />}
              {isRightDrawerOpen && !activeThreadMessageId && <RightDrawer />}
            </>
          )}

          {activeTab === 'channels' && (
            <>
              {/* Channels Sidebar */}
              <ChannelList />
              {/* Channel Feed */}
              <ChatFeed />
              {/* Thread Side Panel or Info Drawer */}
              {activeThreadMessageId && <ThreadPanel />}
              {isRightDrawerOpen && !activeThreadMessageId && <RightDrawer />}
            </>
          )}

          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'inbox' && <EmailInboxPage />}
          {activeTab === 'admin' && <AdminPage />}
          {activeTab === 'drive' && <DrivePage />}
        </div>
      </div>

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
