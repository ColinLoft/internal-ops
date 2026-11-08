import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, Hash, Info, Lock, MessageSquare, Phone, Plus, Search, Settings, Users, Video, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { groupWithPrevious, messageDay } from './messageLayout';
import { EditChannelModal } from '../modals/EditChannelModal';

export const ChatFeed: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const {
    activeTab, activeConversationId, activeChannelId, conversations, channels, messages, currentUser, users,
    sendMessage, markMessagesSeen, openThread, toggleRightDrawer, isRightDrawerOpen, startCall, openUserProfile, setIsNewMessageOpen,
  } = useWorkspace();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const previousTargetRef = useRef('');
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const isChannel = activeTab === 'channels';
  const conversation = conversations.find(item => item.id === activeConversationId);
  const channel = channels.find(item => item.id === activeChannelId);
  const targetId = isChannel ? activeChannelId : activeConversationId;
  const currentMessages = messages[targetId] || [];
  const partner = !isChannel && conversation?.type === 'direct' ? users.find(user => user.id === conversation.participants.find(id => id !== currentUser.id)) : undefined;
  const title = isChannel ? `#${channel?.name || 'Channel'}` : partner?.name || conversation?.name || 'Messages';
  const restricted = Boolean(isChannel && channel?.type === 'announcement' && !channel.postingRoles.includes(currentUser.systemRole));
  const visibleMessages = query.trim() ? currentMessages.filter(message => `${message.text} ${message.senderName} ${message.attachments?.map(item => item.name).join(' ') || ''}`.toLowerCase().includes(query.trim().toLowerCase())) : currentMessages;
  const markSeenRef = useRef(markMessagesSeen);
  markSeenRef.current = markMessagesSeen;
  const jumpLatest = (smooth = true) => {
    const reduce = document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'end' });
    atBottomRef.current = true; setShowLatest(false);
  };
  useEffect(() => {
    if (query.trim()) return;
    const switched = previousTargetRef.current !== targetId;
    previousTargetRef.current = targetId;
    const last = currentMessages[currentMessages.length - 1];
    if (switched || atBottomRef.current || last?.sendStatus === 'sending' && last.senderId === currentUser.id) jumpLatest(false);
    else setShowLatest(true);
  }, [currentMessages.length, targetId, query, currentUser.id]);
  useEffect(() => { setQuery(''); setShowSearch(false); setIsEditingChannel(false); }, [targetId]);
  useEffect(() => {
    const seen = () => { if (document.visibilityState === 'visible' && targetId) void markSeenRef.current(targetId); };
    seen();
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, [targetId, currentMessages.length]);

  if (!isChannel && !conversation) return <main data-onboarding-target="message-feed" className="flex min-w-0 flex-1 flex-col items-center justify-center bg-slate-50 px-6 text-center">
    <MessageSquare className="mb-4 h-8 w-8 text-slate-500" />
    <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
    <p className="mt-2 max-w-sm text-sm text-slate-500">Choose a conversation or start a new one with your team.</p>
    <button type="button" onClick={() => setIsNewMessageOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" />New message</button>
  </main>;

  return <main data-onboarding-target={isChannel ? 'channel-feed' : 'message-feed'} className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && <button type="button" aria-label="Back to conversations" onClick={onBack} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 md:hidden"><ArrowLeft className="h-4 w-4" /></button>}
        {isChannel ? channel?.imageUrl ? <img src={channel.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" /> : channel?.isPrivate ? <Lock className="h-4 w-4 shrink-0 text-slate-500" /> : <Hash className="h-4 w-4 shrink-0 text-slate-500" />
          : partner ? <button type="button" aria-label={`View ${partner.name}'s profile`} onClick={() => openUserProfile(partner)} className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-slate-100 text-xs">{partner.avatar ? <img src={partner.avatar} alt="" className="h-full w-full object-cover" /> : partner.name.slice(0, 2)}</button> : <Users className="h-4 w-4 shrink-0 text-slate-500" />}
        <h1 className="truncate text-sm font-semibold text-slate-900">{title}</h1>
        {partner?.status === 'online' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Online" />}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" aria-label="Start audio call" title="Start audio call" onClick={() => startCall('audio', partner, isChannel ? channel : undefined)} className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><Phone className="h-4 w-4" /></button>
        <button type="button" aria-label="Start video call" title="Start video call" onClick={() => startCall('video', partner, isChannel ? channel : undefined)} className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><Video className="h-4 w-4" /></button>
        <button type="button" aria-label="Search conversation" aria-expanded={showSearch} onClick={() => { setShowSearch(value => !value); setQuery(''); }} className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><Search className="h-4 w-4" /></button>
        {isChannel && channel && (channel.createdBy === currentUser.id || ['admin', 'coordinator'].includes(currentUser.systemRole)) && <button type="button" aria-label="Edit channel" onClick={() => setIsEditingChannel(true)} className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><Settings className="h-4 w-4" /></button>}
        <button type="button" aria-label="Conversation details and files" aria-expanded={isRightDrawerOpen} onClick={toggleRightDrawer} className={`flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 ${isRightDrawerOpen ? 'text-brand-400' : 'text-slate-500'}`}><Info className="h-4 w-4" /></button>
      </div>
    </header>
    {showSearch && <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2 sm:px-5">
      <Search className="h-4 w-4 shrink-0 text-slate-500" /><input autoFocus aria-label="Search messages in this conversation" placeholder="Search this conversation" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 rounded bg-slate-100 px-2 py-1.5 text-sm text-slate-800" />
      <span className="text-xs text-slate-500">{visibleMessages.length}</span><button type="button" aria-label="Close search" onClick={() => { setShowSearch(false); setQuery(''); }} className="p-1 text-slate-500"><X className="h-4 w-4" /></button>
    </div>}
    <div ref={scrollRef} role="region" aria-label={`${title} message history`} className="min-h-0 flex-1 overflow-y-auto py-2" onScroll={() => {
      const area = scrollRef.current;
      if (!area) return;
      atBottomRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
      if (atBottomRef.current) setShowLatest(false);
    }}>
      {!visibleMessages.length ? <div className="px-5 py-8"><h2 className="text-base font-semibold text-slate-900">{query.trim() ? 'No matching messages' : `Start the conversation${isChannel ? ` in ${title}` : ''}`}</h2><p className="mt-2 text-sm text-slate-500">{query.trim() ? 'Try another name, phrase, or attachment name.' : channel?.description || 'Send a message, share a file, or start a call.'}</p></div>
        : visibleMessages.map((message, index) => {
          const day = messageDay(message);
          const previous = visibleMessages[index - 1];
          return <React.Fragment key={message.id}>
            {day && day !== (previous && messageDay(previous)) && <div className="my-3 flex items-center gap-3 px-4 sm:px-5"><span className="h-px flex-1 bg-slate-200" /><time dateTime={message.createdAt} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500">{day}</time><span className="h-px flex-1 bg-slate-200" /></div>}
            <MessageBubble message={message} isCurrentUser={message.senderId === currentUser.id} grouped={!query.trim() && groupWithPrevious(message, previous)} onOpenThread={openThread} />
          </React.Fragment>;
        })}
      <div ref={bottomRef} />
    </div>
    {showLatest && !query.trim() && <button type="button" onClick={() => jumpLatest()} className="absolute bottom-40 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-800 shadow-elevated"><ArrowDown className="h-3.5 w-3.5" />Jump to latest</button>}
    <div className="shrink-0 px-4 pb-3 pt-1 sm:px-5">
      <MessageComposer key={targetId} onSendMessage={sendMessage} placeholder={`Message ${title}`} isAnnouncementRestricted={restricted} />
    </div>
    {isEditingChannel && channel && <EditChannelModal key={channel.id} channel={channel} onClose={() => setIsEditingChannel(false)} />}
  </main>;
};
