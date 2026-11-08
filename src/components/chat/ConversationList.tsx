import React, { useState } from 'react';
import {
  Search,
  Plus,
  Pin,
  Users as UsersIcon,
  Hash,
  Lock,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface ConversationListProps {
  onSelect?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ onSelect }) => {
  const {
    conversations,
    channels,
    activeTab,
    activeChannelId,
    activeConversationId,
    setActiveTab,
    setActiveConversationId,
    setActiveChannelId,
    users,
    currentUser,
    messages,
    togglePinConversation,
    setIsNewMessageOpen,
    setIsCreateChannelOpen,
  } = useWorkspace();

  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();

  const filtered = conversations.filter((c) => {
    if (!normalizedSearch) return true;
    const matchesName = c.name.toLowerCase().includes(normalizedSearch);
    const matchesParticipant = c.participants.some((id) =>
      users.find((user) => user.id === id)?.name.toLowerCase().includes(normalizedSearch)
    );
    const matchesMessage = (messages[c.id] || []).some((message) =>
      message.text.toLowerCase().includes(normalizedSearch)
    );
    return matchesName || matchesParticipant || matchesMessage;
  });
  const visibleChannels = channels.filter((channel) => (
    !channel.isPrivate
    || channel.members.includes(currentUser.id)
    || channel.createdBy === currentUser.id
    || currentUser.systemRole === 'admin'
    || currentUser.systemRole === 'coordinator'
  )).filter((channel) => {
    if (!normalizedSearch) return true;
    return channel.name.toLowerCase().includes(normalizedSearch)
      || channel.description.toLowerCase().includes(normalizedSearch)
      || (messages[channel.id] || []).some((message) => message.text.toLowerCase().includes(normalizedSearch));
  });

  const pinnedConversations = filtered.filter((c) => c.isPinned);
  const otherConversations = filtered.filter((c) => !c.isPinned);

  const getPartnerUser = (conv: typeof conversations[0]) => {
    if (conv.type === 'direct') {
      const partnerId = conv.participants.find((id) => id !== currentUser.id);
      return users.find((u) => u.id === partnerId);
    }
    return null;
  };

  const renderConversationItem = (conv: typeof conversations[0]) => {
    const isActive = activeTab === 'messages' && conv.id === activeConversationId;
    const partner = getPartnerUser(conv);

    return (
      <div
        key={conv.id}
        role="button"
        tabIndex={0}
        aria-label={`Open ${partner?.name || conv.name}`}
        aria-current={isActive ? 'true' : undefined}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
          event.preventDefault(); setActiveConversationId(conv.id); setActiveTab('messages'); onSelect?.();
        }}
        onClick={() => {
          setActiveConversationId(conv.id);
          setActiveTab('messages');
          onSelect?.();
        }}
        className={`group relative flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isActive
            ? 'bg-slate-100 text-slate-900'
            : 'hover:bg-slate-100/70 text-slate-700'
        }`}
      >
        {/* Avatar with Status Bubble */}
        <div className="relative flex-shrink-0">
          {conv.avatar || partner?.avatar ? <img src={conv.avatar || partner?.avatar} alt="" className="h-7 w-7 rounded-md object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs font-medium text-slate-600">{(partner?.name || conv.name).slice(0, 2).toUpperCase()}</span>}
          {conv.type === 'direct' && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                partner?.status === 'online'
                  ? 'bg-emerald-500'
                  : 'bg-slate-400'
              }`}
            />
          )}
          {conv.type === 'group' && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px] border border-white">
              <UsersIcon className="w-2 h-2" />
            </span>
          )}
        </div>

        {/* Content details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <h4
              className={`text-[13px] font-medium truncate ${
                isActive ? 'text-brand-900 font-semibold' : 'text-slate-900'
              }`}
            >
              {partner?.name || conv.name}
            </h4>
            <span className="text-[11px] text-slate-400 font-normal whitespace-nowrap ml-1">
              {conv.lastMessage?.timestamp || ''}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <p
              className={`text-xs truncate ${
                conv.unreadCount > 0 ? 'text-slate-900 font-medium' : 'text-slate-500'
              }`}
            >
              {conv.lastMessage?.text || 'No messages yet'}
            </p>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {conv.unreadCount > 0 ? (
                <span className="min-w-[18px] h-[18px] px-1 bg-brand-600 text-white text-[11px] font-semibold rounded-full flex items-center justify-center">
                  {conv.unreadCount}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={conv.isPinned ? `Unpin ${partner?.name || conv.name}` : `Pin ${partner?.name || conv.name}`}
                onClick={event => { event.stopPropagation(); togglePinConversation(conv.id); }}
                className={`flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-brand-400 ${conv.isPinned ? 'text-brand-400' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
              >
                <Pin className={`h-3 w-3 ${conv.isPinned ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  };

  const renderChannelItem = (channel: typeof channels[0]) => {
    const isActive = activeTab === 'channels' && channel.id === activeChannelId;
    return (
      <button
        key={channel.id}
        type="button"
        onClick={() => {
          setActiveChannelId(channel.id);
          setActiveTab('channels');
          onSelect?.();
        }}
        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
          isActive ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`}
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isActive ? 'text-brand-700 bg-brand-100/60' : 'text-slate-400 group-hover:text-slate-600'}`}>
          {channel.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{channel.name}</span>
        {channel.unreadCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{channel.unreadCount}</span>}
      </button>
    );
  };

  return (
    <div data-onboarding-target="conversation-list" className="w-full md:w-60 h-full bg-black border-r border-slate-200/70 flex flex-col flex-shrink-0">
      {/* Top Header */}
      <div className="p-3 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Messages</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateChannelOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="Create a channel"
            aria-label="Create a channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative mb-2.5">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people, channels, or messages..."
            aria-label="Search conversations and channels"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-100/70 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 rounded-lg border border-transparent focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none transition-all"
          />
        </div>

      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2 [scrollbar-width:none]">
        <div className="mb-3">
          <h3 className="mb-1.5 px-2 text-xs font-medium text-slate-500">Channels</h3>
          <div className="space-y-0.5">{visibleChannels.map(renderChannelItem)}</div>
        </div>
        <div className="mb-1.5 flex items-center justify-between px-2 pt-2">
          <h3 className="text-xs font-medium text-slate-500">Direct messages</h3>
          <button type="button" onClick={() => setIsNewMessageOpen(true)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Start direct message">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-0.5">
          {pinnedConversations.map(renderConversationItem)}
          {otherConversations.map(renderConversationItem)}
        </div>
      </div>

    </div>
  );
};
