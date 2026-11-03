import React, { useEffect, useRef, useState } from 'react';
import { House, Search, Bell, CirclePlus, MessageSquarePlus, MailPlus, Hash, CalendarPlus } from 'lucide-react';
import { ProfilePopover } from '../profile/ProfilePopover';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useRecordSearch } from '../../lib/useRecordSearch';
import { NotificationCenter } from '../notifications/NotificationCenter';

export const TopBar: React.FC = () => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const {
    activeTab,
    activeConversationId,
    activeChannelId,
    conversations,
    channels,
    messages,
    users,
    calendarEvents,
    searchQuery,
    setSearchQuery,
    setActiveTab,
    setActiveConversationId,
    setActiveChannelId,
    openUserProfile,
    unreadNotificationCount,
    callSession,
    startCall,
    currentUser,
    setIsNewMessageOpen,
    setIsCreateChannelOpen,
    setIsAddEventOpen,
    requestEmailCompose,
  } = useWorkspace();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (quickRef.current && !quickRef.current.contains(event.target as Node)) setIsQuickOpen(false);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentConv = conversations.find((conversation) => conversation.id === activeConversationId);
  const currentChan = channels.find((channel) => channel.id === activeChannelId);
  const pathSection = window.location.pathname.split('/')[2];
  const badgeLabel =
    activeTab === 'messages' ? currentConv?.name || 'Direct messages'
    : activeTab === 'channels' ? (currentChan ? `#${currentChan.name}` : 'Channels')
    : activeTab === 'calendar' ? 'Schedule'
    : activeTab === 'inbox' ? 'Connected mailboxes'
    : activeTab === 'drive' ? 'My Drive'
    : activeTab === 'organization' ? 'Directory'
    : 'Overview';
  const query = searchQuery.trim().toLowerCase();
  const recordHits = useRecordSearch(searchQuery);
  const searchResults = query
    ? [
        ...channels
          .filter((channel) => `${channel.name} ${channel.description}`.toLowerCase().includes(query))
          .map((channel) => ({
            id: `channel-${channel.id}`,
            type: 'Channel' as const,
            title: `#${channel.name}`,
            detail: channel.description,
            onSelect: () => {
              setActiveTab('channels');
              setActiveChannelId(channel.id);
            },
          })),
        ...conversations
          .filter((conversation) =>
            `${conversation.name} ${conversation.lastMessage?.text || ''}`.toLowerCase().includes(query)
          )
          .map((conversation) => ({
            id: `conversation-${conversation.id}`,
            type: 'Direct message' as const,
            title: conversation.name,
            detail: conversation.lastMessage?.text || 'Open conversation',
            onSelect: () => {
              setActiveTab('messages');
              setActiveConversationId(conversation.id);
            },
          })),
        ...Object.entries(messages).flatMap(([targetId, targetMessages]) => {
          const isChannel = channels.some((channel) => channel.id === targetId);
          const conversation = conversations.find((item) => item.id === targetId);
          if (!isChannel && !conversation) return [];

          return targetMessages
            .filter((message) => message.text.toLowerCase().includes(query))
            .map((message) => ({
              id: `message-${message.id}`,
              type: 'Message' as const,
              title: message.senderName,
              detail: message.text,
              onSelect: () => {
                if (isChannel) {
                  setActiveTab('channels');
                  setActiveChannelId(targetId);
                } else {
                  setActiveTab('messages');
                  setActiveConversationId(targetId);
                }
              },
            }));
        }),
        ...users
          .filter((user) => `${user.name} ${user.role} ${user.email}`.toLowerCase().includes(query))
          .map((user) => ({
            id: `user-${user.id}`,
            type: 'Person' as const,
            title: user.name,
            detail: `${user.role} · ${user.department}`,
            onSelect: () => openUserProfile(user),
          })),
        ...calendarEvents
          .filter((event) => `${event.title} ${event.description || ''} ${event.location || ''}`.toLowerCase().includes(query))
          .map((event) => ({
            id: `event-${event.id}`,
            type: 'Calendar event' as const,
            title: event.title,
            detail: `${event.date}${event.location ? ` · ${event.location}` : ''}`,
            onSelect: () => setActiveTab('calendar'),
          })),
        ...recordHits.map((hit) => ({
          id: hit.id,
          type: hit.type,
          title: hit.title,
          detail: hit.detail,
          onSelect: () => {
            window.history.pushState({}, '', hit.path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          },
        })),
      ].slice(0, 12)
    : [];

  const appLabels: Record<string, string> = {
    home: 'Home', messages: 'Messages', channels: 'Channels', calendar: 'Calendar', inbox: 'Email', drive: 'Drive',
    engineering: 'Engineering', gtm: 'Marketing', legal: 'Legal', finance: 'Grants', customers: 'Relationships',
    programs: 'Projects', admin: 'Systems', help: 'Support', insights: 'Insights', organization: 'Organization',
  };
  const subLabel = activeTab === 'insights' && pathSection ? pathSection.charAt(0).toUpperCase() + pathSection.slice(1) : badgeLabel;
  const quickItems = [
    { label: 'New chat', icon: MessageSquarePlus, run: () => { setActiveTab('messages'); setIsNewMessageOpen(true); } },
    { label: 'New email', icon: MailPlus, run: () => requestEmailCompose() },
    { label: 'New channel', icon: Hash, run: () => { setActiveTab('channels'); setIsCreateChannelOpen(true); } },
    { label: 'New event', icon: CalendarPlus, run: () => { setActiveTab('calendar'); setIsAddEventOpen(true); } },
  ];
  const statusColor = currentUser.status === 'busy' ? 'bg-rose-500' : currentUser.status === 'online' || currentUser.status === 'away' ? 'bg-emerald-400' : 'bg-slate-400';
  const goHome = () => {
    setActiveTab('home');
    if (window.location.pathname !== '/home') window.history.pushState({}, '', '/home');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <>
      <header className="z-[60] flex h-12 flex-shrink-0 items-center gap-3 bg-[#0f2347] px-3 text-white md:px-4">
        <button type="button" onClick={goHome} className="flex items-center gap-2 rounded-lg pr-2 hover:opacity-90" title="Flown home">
          <img src="/brand-icon.png" alt="" className="h-6 w-6 object-contain" />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">Flown</span>
        </button>

        <div className="relative mx-auto min-w-0 flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200/70" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchQuery('');
              if (event.key === 'Enter' && searchResults[0]) {
                searchResults[0].onSelect();
                setSearchQuery('');
              }
            }}
            placeholder="Search everything..."
            aria-label="Search everything"
            className="w-full rounded-lg border border-white/10 bg-white/10 py-1.5 pl-9 pr-3 text-xs font-medium text-white outline-none transition-colors placeholder:text-blue-200/60 focus:border-white/30 focus:bg-white/15"
          />
          {query && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl">
              {searchResults.length > 0 ? searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    result.onSelect();
                    setSearchQuery('');
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-50"
                >
                  <span className="block text-xs font-semibold text-brand-600">{result.type}</span>
                  <span className="block truncate text-xs font-semibold text-slate-800">{result.title}</span>
                  <span className="block truncate text-xs text-slate-500">{result.detail}</span>
                </button>
              )) : (
                <p className="px-3 py-4 text-center text-xs text-slate-500">No matching results</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {callSession.active && (
            <div className="flex animate-pulse items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>{Math.floor(callSession.durationSeconds / 60)}:{(callSession.durationSeconds % 60).toString().padStart(2, '0')}</span>
            </div>
          )}
          <div className="relative" ref={quickRef}>
            <button
              type="button"
              onClick={() => { setIsQuickOpen((open) => !open); setIsNotificationsOpen(false); setIsProfileOpen(false); }}
              aria-label="Quick add"
              aria-haspopup="menu"
              aria-expanded={isQuickOpen}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-400"
            >
              <CirclePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Quick add</span>
            </button>
            {isQuickOpen && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-2xl">
                {quickItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" role="menuitem" onClick={() => { item.run(); setIsQuickOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-brand-50">
                      <Icon className="h-4 w-4 text-brand-600" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => { setIsNotificationsOpen((open) => !open); setIsQuickOpen(false); setIsProfileOpen(false); }}
              aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              title="Notifications"
              className={`relative rounded-lg p-2 transition-colors ${isNotificationsOpen ? 'bg-white/20' : 'hover:bg-white/10'}`}
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-[#0f2347]">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>
            {isNotificationsOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 text-slate-800">
                <NotificationCenter onClose={() => setIsNotificationsOpen(false)} />
              </div>
            )}
          </div>
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              data-onboarding-target="profile-button"
              onClick={() => { setIsProfileOpen((open) => !open); setIsQuickOpen(false); setIsNotificationsOpen(false); }}
              title={`${currentUser.name} (${currentUser.role})`}
              aria-label="Profile and status"
              className="relative rounded-full ring-white/0 transition hover:ring-2 hover:ring-white/40"
            >
              <img src={currentUser.avatar} alt={currentUser.name} className="h-8 w-8 rounded-full border border-white/30 object-cover" />
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0f2347] ${statusColor}`} />
            </button>
            {isProfileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 text-slate-800">
                <ProfilePopover onClose={() => setIsProfileOpen(false)} />
              </div>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Breadcrumb" className="hidden h-10 flex-shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/60 px-6 text-xs md:flex">
        <button type="button" onClick={goHome} aria-label="Home" className="text-slate-400 hover:text-brand-600"><House className="h-4 w-4" /></button>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-600">{appLabels[activeTab] ?? 'Workspace'}</span>
        {subLabel && subLabel !== appLabels[activeTab] && (
          <>
            <span className="text-slate-300">/</span>
            <span className="rounded-md bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{subLabel}</span>
          </>
        )}
      </nav>
    </>
  );
};
