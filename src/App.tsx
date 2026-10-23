import React from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Rail } from './components/navigation/Rail';
import { TopBar } from './components/navigation/TopBar';
import { ConversationList } from './components/chat/ConversationList';
import { ChannelList } from './components/chat/ChannelList';
import { ChatFeed } from './components/chat/ChatFeed';
import { ThreadPanel } from './components/chat/ThreadPanel';
import { RightDrawer } from './components/chat/RightDrawer';
import { CalendarView } from './components/calendar/CalendarView';
import { CallOverlay } from './components/call/CallOverlay';

// Auth & Modals
import { AuthScreen } from './components/auth/AuthScreen';
import { PasswordSetupModal } from './components/auth/PasswordSetupModal';
import { ProfileModal } from './components/profile/ProfileModal';
import { EditProfileModal } from './components/profile/EditProfileModal';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { CreatePollModal } from './components/modals/CreatePollModal';
import { NewMessageModal } from './components/modals/NewMessageModal';
import { AddEventModal } from './components/modals/AddEventModal';
import { AddTeammateModal } from './components/modals/AddTeammateModal';
import { InviteReadyModal } from './components/modals/InviteReadyModal';

const WorkspaceShell: React.FC = () => {
  const {
    isAuthenticated,
    isAuthLoading,
    requiresPasswordSetup,
    activeTab,
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-100 via-sky-50/70 to-blue-50/90 select-none">
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
        </div>
      </div>

      {/* Floating In-App Voice & Video Call Overlay */}
      <CallOverlay />

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
