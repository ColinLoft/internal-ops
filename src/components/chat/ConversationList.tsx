import React, { useState } from 'react';
import {
  Search,
  Plus,
  Pin,
  CheckCheck,
  Check,
  Users as UsersIcon,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const ConversationList: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    users,
    currentUser,
    togglePinConversation,
    setIsNewMessageOpen,
    setIsAddTeammateOpen,
  } = useWorkspace();

  const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all');
  const [search, setSearch] = useState('');

  // Filter conversations
  const filtered = conversations.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (filterTab === 'unread') {
      return matchesSearch && (c.unreadCount || 0) > 0;
    }
    return matchesSearch;
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
    const isActive = conv.id === activeConversationId;
    const partner = getPartnerUser(conv);

    return (
      <div
        key={conv.id}
        onClick={() => setActiveConversationId(conv.id)}
        className={`group relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-150 ${
          isActive
            ? 'bg-brand-50/80 border border-brand-200/60 shadow-xs'
            : 'hover:bg-slate-100/70 border border-transparent'
        }`}
      >
        {/* Avatar with Status Bubble */}
        <div className="relative flex-shrink-0">
          <img
            src={conv.avatar || (partner?.avatar ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150')}
            alt={conv.name}
            className="w-11 h-11 rounded-2xl object-cover shadow-2xs"
          />
          {conv.type === 'direct' && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                partner?.status === 'online'
                  ? 'bg-brand-500'
                  : partner?.status === 'busy'
                  ? 'bg-rose-500'
                  : partner?.status === 'away'
                  ? 'bg-brand-500'
                  : 'bg-slate-400'
              }`}
            />
          )}
          {conv.type === 'group' && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px] border-2 border-white">
              <UsersIcon className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Content details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4
              className={`text-xs font-bold truncate ${
                isActive ? 'text-brand-900' : 'text-slate-900'
              }`}
            >
              {conv.name}
            </h4>
            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">
              {conv.lastMessage?.timestamp || 'Just now'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <p
              className={`text-xs truncate ${
                conv.unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'
              }`}
            >
              {conv.lastMessage?.text || 'No messages yet'}
            </p>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {conv.unreadCount > 0 ? (
                <span className="min-w-[18px] h-[18px] px-1 bg-brand-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
                  {conv.unreadCount}
                </span>
              ) : (
                <CheckCheck className="w-3.5 h-3.5 text-brand-600" />
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

  return (
    <div data-onboarding-target="conversation-list" className="w-80 h-full bg-white/80 backdrop-blur-xl border-r border-slate-200/80 flex flex-col flex-shrink-0 select-none">
      {/* Top Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Messages</h2>
            <p className="text-[11px] text-slate-500 font-medium">Direct chats & private groups</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsAddTeammateOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors shadow-2xs"
              title="Add Teammate / Invite Colleague"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsNewMessageOpen(true)}
              className="p-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-600 transition-colors shadow-2xs"
              title="Start New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chat or person..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-100/80 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 rounded-xl border border-transparent focus:border-brand-500/40 outline-none transition-all"
          />
        </div>

        {/* All vs Unread Tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-xl">
          <button
            onClick={() => setFilterTab('all')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filterTab === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            All ({conversations.length})
          </button>
          <button
            onClick={() => setFilterTab('unread')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filterTab === 'unread'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Unread ({conversations.filter((c) => (c.unreadCount || 0) > 0).length})
          </button>
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {conversations.length === 0 ? (
          /* Polished Clean Empty State */
          <div className="p-6 text-center flex flex-col items-center justify-center my-8">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No conversations yet</h4>
            <p className="text-xs text-slate-400 mt-1 mb-4 leading-relaxed max-w-[200px]">
              Start a direct conversation with a teammate or create a group chat.
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => setIsNewMessageOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Conversation</span>
              </button>
              <button
                onClick={() => setIsAddTeammateOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
              >
                <UserPlus className="w-3.5 h-3.5 text-brand-600" />
                <span>Add Teammate</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedConversations.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-2 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <Pin className="w-3 h-3 fill-slate-400" /> Pinned Chats
                </div>
                <div className="space-y-1">{pinnedConversations.map(renderConversationItem)}</div>
              </div>
            )}

            {/* All Messages Section */}
            <div>
              <div className="px-2 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                All Messages
              </div>
              <div className="space-y-1">
                {otherConversations.length > 0 ? (
                  otherConversations.map(renderConversationItem)
                ) : (
                  <p className="text-center py-6 text-xs text-slate-400">No chats found</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
