import React, { useState } from 'react';
import {
  Search,
  Plus,
  Pin,
  CheckCheck,
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
        onClick={() => {
          setActiveConversationId(conv.id);
          setActiveTab('messages');
          onSelect?.();
        }}
        className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
          isActive
            ? 'bg-brand-50/90 text-slate-900 ring-1 ring-brand-200/60'
            : 'hover:bg-slate-100/70 text-slate-700'
        }`}
      >
        {/* Avatar with Status Bubble */}
        <div className="relative flex-shrink-0">
          <img
            src={conv.avatar || (partner?.avatar ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150')}
            alt={conv.name}
            className="w-9 h-9 rounded-full object-cover"
          />
          {conv.type === 'direct' && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                partner?.status === 'online'
                  ? 'bg-emerald-500'
                  : partner?.status === 'busy'
                  ? 'bg-rose-500'
                  : partner?.status === 'away'
                  ? 'bg-amber-400'
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
              {conv.name}
            </h4>
            <span className="text-[11px] text-slate-400 font-normal whitespace-nowrap ml-1">
              {conv.lastMessage?.timestamp || 'Just now'}
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
              ) : (
                <CheckCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-500" />
              )}
            </div>
          </div>
        </div>

        {/* Pin action button on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePinConversation(conv.id);
          }}
          className={`absolute top-2 right-2 p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-white transition-opacity ${
            conv.isPinned ? 'opacity-100 text-brand-600' : 'opacity-0 group-hover:opacity-100'
          }`}
          title={conv.isPinned ? 'Unpin' : 'Pin conversation'}
        >
          <Pin className={`w-3 h-3 ${conv.isPinned ? 'fill-brand-600' : ''}`} />
        </button>
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
          isActive ? 'bg-brand-50/90 text-brand-900 font-medium ring-1 ring-brand-200/50' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
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
    <div data-onboarding-target="conversation-list" className="w-full md:w-80 h-full bg-white border-r border-slate-200/70 flex flex-col flex-shrink-0">
      {/* Top Header */}
      <div className="p-3.5 pb-2 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Messages</h2>
            <p className="text-[11px] text-slate-500 font-normal">Channels and direct messages</p>
          </div>
          <button
            type="button"
            onClick={() => setIsNewMessageOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="Start a message or choose a channel"
            aria-label="Start a message or choose a channel"
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
            className="w-full pl-8 pr-3 py-1.5 bg-slate-100/70 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 rounded-lg border border-transparent focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none transition-all"
          />
        </div>

      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2 [scrollbar-width:none]">
        <div className="mb-3">
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Channels</p>
          <div className="space-y-0.5">{visibleChannels.map(renderChannelItem)}</div>
        </div>
        <div className="mb-1.5 flex items-center justify-between px-2 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Direct messages</p>
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
