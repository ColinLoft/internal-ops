import React, { useRef, useEffect } from 'react';
import {
  Phone,
  Video,
  Info,
  Users as UsersIcon,
  Lock,
  Hash,
  Clock,
  ShieldCheck,
  Search,
  MessageSquare,
  Sparkles,
  Plus,
  UserPlus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

export const ChatFeed: React.FC = () => {
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
    openThread,
    toggleRightDrawer,
    isRightDrawerOpen,
    startCall,
    openUserProfile,
    setIsNewMessageOpen,
    setIsAddTeammateOpen,
  } = useWorkspace();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isChannel = activeTab === 'channels';
  const currentConv = conversations.find((c) => c.id === activeConversationId);
  const currentChan = channels.find((c) => c.id === activeChannelId);

  const targetId = isChannel ? activeChannelId : activeConversationId;
  const currentMessages = messages[targetId] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, targetId]);

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
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50 backdrop-blur-md text-center">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/25 mb-4">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Your Nonprofit Messages</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6 leading-relaxed">
          Connect with team members, coordinate emergency field operations, hold audio/video calls, and share files.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewMessageOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Start a Conversation</span>
          </button>
          <button
            onClick={() => setIsAddTeammateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition-all"
          >
            <UserPlus className="w-4 h-4 text-brand-600" />
            <span>Add Teammate</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 backdrop-blur-md relative overflow-hidden">
      {/* Feed Top Header */}
      <div className="h-16 px-6 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar / Icon */}
          <div className="relative flex-shrink-0">
            {isChannel ? (
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  currentChan?.isPrivate ? 'bg-slate-100 text-slate-700' : 'bg-brand-100 text-brand-700'
                }`}
              >
                {currentChan?.isPrivate ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Hash className="w-5 h-5 font-bold" />
                )}
              </div>
            ) : partnerUser ? (
              <button
                onClick={() => openUserProfile(partnerUser)}
                className="relative block rounded-2xl overflow-hidden focus:outline-none"
              >
                <img
                  src={partnerUser.avatar}
                  alt={partnerUser.name}
                  className="w-10 h-10 rounded-2xl object-cover shadow-2xs"
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                    partnerUser.status === 'online'
                      ? 'bg-emerald-500'
                      : partnerUser.status === 'busy'
                      ? 'bg-rose-500'
                      : partnerUser.status === 'away'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold">
                <UsersIcon className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Title & Status */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {isChannel ? `#${currentChan?.name}` : partnerUser ? partnerUser.name : currentConv?.name}
              </h3>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              {isChannel ? (
                <span>
                  {currentChan?.members.length || 1} member{(currentChan?.members.length || 1) === 1 ? '' : 's'} • {currentChan?.description}
                </span>
              ) : partnerUser ? (
                <>
                  <span className="truncate">{partnerUser.role}</span>
                  <span>•</span>
                  {partnerUser.status === 'online' ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Online
                    </span>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {partnerUser.lastSeen ? `Last seen ${partnerUser.lastSeen}` : 'Offline'}
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
        <div className="flex items-center gap-2">
          {/* Audio Call */}
          <button
            onClick={handleStartAudioCall}
            className="p-2.5 rounded-xl text-slate-600 hover:text-brand-600 hover:bg-brand-50 border border-slate-200/80 transition-all shadow-2xs"
            title="Start Audio Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          {/* Video Call */}
          <button
            onClick={handleStartVideoCall}
            className="p-2.5 rounded-xl text-slate-600 hover:text-brand-600 hover:bg-brand-50 border border-slate-200/80 transition-all shadow-2xs"
            title="Start Video Call with Screen Sharing"
          >
            <Video className="w-4 h-4" />
          </button>

          {/* Right Drawer Info Toggle */}
          <button
            onClick={toggleRightDrawer}
            className={`p-2.5 rounded-xl border transition-all shadow-2xs ${
              isRightDrawerOpen
                ? 'bg-brand-50 border-brand-300 text-brand-600'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200/80'
            }`}
            title="Toggle Details & Files Drawer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {currentMessages.length === 0 ? (
          /* Polished Starter Prompt */
          <div className="text-center py-12 px-4 max-w-md mx-auto">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-3xl bg-brand-50 text-brand-600 mb-3 shadow-2xs">
              {isChannel ? (
                <Hash className="w-7 h-7" />
              ) : (
                <UsersIcon className="w-7 h-7" />
              )}
            </div>

            <h4 className="text-base font-bold text-slate-900">
              {isChannel
                ? `Welcome to #${currentChan?.name}!`
                : `Beginning of conversation with ${partnerUser?.name || currentConv?.name}`}
            </h4>

            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
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
    </div>
  );
};
