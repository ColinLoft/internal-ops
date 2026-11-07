import React, { useRef, useEffect } from 'react';
import {
  Phone,
  Video,
  Info,
  Users as UsersIcon,
  Lock,
  Hash,
  Clock,
  MessageSquare,
  Plus,
  UserPlus,
  ArrowLeft,
  Settings,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { EditChannelModal } from '../modals/EditChannelModal';

interface ChatFeedProps {
  onBack?: () => void;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({ onBack }) => {
  const {
    activeTab,
    activeConversationId,
    activeChannelId,
    conversations,
    channels,
    messages,
    currentUser,
    users,
    sendMessage,
    markMessagesSeen,
    openThread,
    toggleRightDrawer,
    isRightDrawerOpen,
    startCall,
    openUserProfile,
    setIsNewMessageOpen,
  } = useWorkspace();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isEditingChannel, setIsEditingChannel] = React.useState(false);

  const isChannel = activeTab === 'channels';
  const currentConv = conversations.find((c) => c.id === activeConversationId);
  const currentChan = channels.find((c) => c.id === activeChannelId);

  const targetId = isChannel ? activeChannelId : activeConversationId;
  const currentMessages = messages[targetId] || [];
  const markMessagesSeenRef = useRef(markMessagesSeen);
  markMessagesSeenRef.current = markMessagesSeen;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, targetId]);

  useEffect(() => {
    const markVisibleConversationSeen = () => {
      if (document.visibilityState === 'visible' && targetId) {
        void markMessagesSeenRef.current(targetId);
      }
    };
    markVisibleConversationSeen();
    document.addEventListener('visibilitychange', markVisibleConversationSeen);
    return () => document.removeEventListener('visibilitychange', markVisibleConversationSeen);
  }, [activeTab, targetId, currentMessages.length]);

  const partnerUser =
    !isChannel && currentConv?.type === 'direct'
      ? users.find((u) => u.id === currentConv.participants.find((id) => id !== currentUser.id))
      : null;

  // Announcement permissions check:
  const isAnnouncementRestricted =
    isChannel &&
    currentChan?.type === 'announcement' &&
    !currentChan.postingRoles.includes(currentUser.systemRole);

  const handleStartAudioCall = () => {
    if (isChannel) {
      startCall('audio', undefined, currentChan);
    } else {
      startCall('audio', partnerUser);
    }
  };

  const handleStartVideoCall = () => {
    if (isChannel) {
      startCall('video', undefined, currentChan);
    } else {
      startCall('video', partnerUser);
    }
  };

  // If in Messages tab but no conversation is active yet
  if (!isChannel && !currentConv) {
    return (
      <div data-onboarding-target="message-feed" className="flex-1 flex flex-col items-center justify-center p-8 bg-[#fafbfc] text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center shadow-xs mb-4">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 tracking-tight">Your Messages</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6 leading-relaxed">
          Connect with team members, coordinate operations, hold audio/video calls, and share files.
        </p>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsNewMessageOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Start a Conversation</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-onboarding-target={isChannel ? 'channel-feed' : 'message-feed'} className="flex-1 flex flex-col h-full bg-[#fafbfc] relative overflow-hidden">
      {/* Feed Top Header */}
      <div className="h-14 px-4 md:px-6 bg-white border-b border-slate-200/70 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="-ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {/* Avatar / Icon */}
          <div className="relative flex-shrink-0">
            {isChannel ? (
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  currentChan?.isPrivate ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-600 border border-brand-100/60'
                }`}
              >
                {currentChan?.imageUrl ? (
                  <img src={currentChan.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : currentChan?.isPrivate ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Hash className="w-4 h-4 font-semibold" />
                )}
              </div>
            ) : partnerUser ? (
              <button
                onClick={() => openUserProfile(partnerUser)}
                className="relative block rounded-full overflow-hidden focus:outline-none"
              >
                <img
                  src={partnerUser.avatar}
                  alt={partnerUser.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    partnerUser.status === 'online'
                      ? 'bg-emerald-500'
                      : 'bg-slate-400'
                  }`}
                />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-xs">
                <UsersIcon className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Title & Status */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                {isChannel ? `#${currentChan?.name}` : partnerUser ? partnerUser.name : currentConv?.name}
              </h3>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-normal">
              {isChannel ? (
                <span>
                  {currentChan?.members.length ?? 0} member{(currentChan?.members.length ?? 0) === 1 ? '' : 's'} • {currentChan?.description}
                </span>
              ) : partnerUser ? (
                <>
                  <span className="truncate">{partnerUser.role}</span>
                  <span>•</span>
                  {partnerUser.status === 'online' ? (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Online
                    </span>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {partnerUser.lastSeen ? `Offline · Last seen ${partnerUser.lastSeen}` : 'Offline'}
                    </span>
                  )}
                </>
              ) : (
                <span>{currentConv?.description || 'Group conversation'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1">
          {/* Audio Call */}
          <button
            onClick={handleStartAudioCall}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Start Audio Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          {/* Video Call */}
          <button
            onClick={handleStartVideoCall}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Start Video Call with Screen Sharing"
          >
            <Video className="w-4 h-4" />
          </button>

          {isChannel && currentChan && (currentChan.createdBy === currentUser.id || currentUser.systemRole === 'admin' || currentUser.systemRole === 'coordinator') && (
            <button
              type="button"
              onClick={() => setIsEditingChannel(true)}
              aria-label="Edit channel"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Edit channel"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Right Drawer Info Toggle */}
          <button
            onClick={toggleRightDrawer}
            className={`p-2 rounded-lg transition-colors ${
              isRightDrawerOpen
                ? 'bg-brand-50 text-brand-600 font-medium'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
            title="Toggle Details & Files Drawer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 [scrollbar-width:none]">
        {currentMessages.length === 0 ? (
          /* Polished Starter Prompt */
          <div className="text-center py-16 px-4 max-w-md mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100/70 text-brand-600 mb-3 shadow-xs">
              {isChannel ? (
                <Hash className="w-6 h-6" />
              ) : (
                <UsersIcon className="w-6 h-6" />
              )}
            </div>

            <h4 className="text-base font-semibold text-slate-900 tracking-tight">
              {isChannel
                ? `Welcome to #${currentChan?.name}!`
                : `Beginning of conversation with ${partnerUser?.name || currentConv?.name}`}
            </h4>

            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              {isChannel
                ? currentChan?.description || 'Send the first message to get the discussion started.'
                : 'Send a message, upload project files, or start a voice or video call.'}
            </p>
          </div>
        ) : (
          currentMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isCurrentUser={msg.senderId === currentUser.id}
              onOpenThread={openThread}
            />
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer */}
      <div className="p-4 pt-2">
        <MessageComposer
          onSendMessage={sendMessage}
          placeholder={`Message ${isChannel ? '#' + currentChan?.name : partnerUser?.name || currentConv?.name}...`}
          isAnnouncementRestricted={isAnnouncementRestricted}
        />
      </div>
      {isEditingChannel && currentChan && <EditChannelModal key={currentChan.id} channel={currentChan} onClose={() => setIsEditingChannel(false)} />}
    </div>
  );
};
