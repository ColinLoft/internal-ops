import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Bell,
  HardDrive,
  UsersRound,
  Settings2,
  Landmark,
  MessageSquare,
  Code2,
  PhoneCall,
  Video,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NotificationCenter } from '../notifications/NotificationCenter';

export const TopBar: React.FC = () => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);
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
  } = useWorkspace();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (appsRef.current && !appsRef.current.contains(event.target as Node)) {
        setIsAppsOpen(false);
        setSelectedApp(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentConv = conversations.find((conversation) => conversation.id === activeConversationId);
  const currentChan = channels.find((channel) => channel.id === activeChannelId);
  const appDestinations = [
    {
      id: 'communications',
      name: 'Communications',
      description: 'Messages, channels, meetings, and calendar',
      icon: MessageSquare,
      accent: 'from-blue-500 to-cyan-600',
    },
    {
      id: 'drive',
      name: 'Flown Drive',
      description: 'Files, folders, and shared resources',
      icon: HardDrive,
      accent: 'from-sky-500 to-blue-600',
    },
    {
      id: 'customers',
      name: 'Customer management',
      description: 'Relationships, contacts, and support',
      icon: UsersRound,
      accent: 'from-violet-500 to-indigo-600',
    },
    {
      id: 'operations',
      name: 'System management',
      description: 'HR, planning, and internal operations',
      icon: Settings2,
      accent: 'from-emerald-500 to-teal-600',
    },
    {
      id: 'finance',
      name: 'Finance & grants',
      description: 'Budgets, grants, and financial planning',
      icon: Landmark,
      accent: 'from-amber-500 to-orange-600',
    },
    {
      id: 'engineering',
      name: 'Engineering',
      description: 'Projects, systems, and technical operations',
      icon: Code2,
      accent: 'from-slate-600 to-slate-900',
    },
  ];
  const query = searchQuery.trim().toLowerCase();
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
      ].slice(0, 8)
    : [];

  return (
    <header className="h-16 px-6 bg-white/70 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between z-20 flex-shrink-0 shadow-xs">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center text-sm font-semibold text-slate-800 tracking-tight">
          <span className="text-brand-600 font-bold">Flown</span>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-600 font-medium">{activeTab === 'home' ? 'Home' : activeTab === 'admin' ? 'People & access' : activeTab === 'inbox' ? 'Email inbox' : activeTab === 'drive' ? 'Flown Drive' : 'Communications'}</span>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-900 bg-brand-50 px-2 py-0.5 rounded-md text-xs font-semibold text-brand-700 border border-brand-100/80">
            {activeTab === 'home' ? 'Overview' : activeTab === 'messages' ? currentConv?.name : activeTab === 'channels' ? `#${currentChan?.name}` : activeTab === 'calendar' ? 'Schedule' : activeTab === 'inbox' ? 'Connected mailboxes' : activeTab === 'drive' ? 'My Drive' : 'Staff directory'}
          </span>
        </div>
      </div>

      {/* Global Quick Search (matching Screenshot 1 Sage) */}
      <div className="relative w-96 max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
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
          placeholder="Search everything... ⌘+S Quick search"
          className="w-full pl-9 pr-14 py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 rounded-xl border border-transparent focus:border-brand-500/50 focus:ring-4 focus:ring-brand-500/10 transition-all outline-none"
        />
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
          <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
            ⌘S
          </kbd>
        </div>
        {query && (
          <div className="absolute top-full left-0 right-0 mt-2 p-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-50 max-h-80 overflow-y-auto">
            {searchResults.length > 0 ? searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => {
                  result.onSelect();
                  setSearchQuery('');
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                  {result.type}
                </span>
                <span className="block text-xs font-semibold text-slate-800 truncate">{result.title}</span>
                <span className="block text-[11px] text-slate-500 truncate">{result.detail}</span>
              </button>
            )) : (
              <p className="px-3 py-4 text-xs text-center text-slate-500">No matching results</p>
            )}
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        <div className="relative" ref={appsRef}>
          <button
            type="button"
            onClick={() => {
              setIsAppsOpen((open) => !open);
              setIsNotificationsOpen(false);
              setSelectedApp(null);
            }}
            aria-label="More Flown apps"
            aria-haspopup="dialog"
            aria-expanded={isAppsOpen}
            title="More Flown apps"
            className={`rounded-xl border p-2 transition-all ${
              isAppsOpen
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white/70 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <span className="grid h-4 w-4 grid-cols-3 grid-rows-3 gap-[3px]" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <span key={index} className="h-1 w-1 rounded-full bg-current" />
              ))}
            </span>
          </button>
          {isAppsOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-2 text-slate-800 shadow-2xl backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <p className="text-sm font-bold text-slate-900">Flown apps</p>
                  <p className="text-[11px] text-slate-500">Your operations suite</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {appDestinations.map((app) => {
                  const Icon = app.icon;
                  const isSelected = selectedApp === app.id;
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => {
                        if (app.id === 'communications') {
                          setActiveTab('messages');
                          setIsAppsOpen(false);
                          setSelectedApp(null);
                        } else if (app.id === 'drive') {
                          setActiveTab('drive');
                          setIsAppsOpen(false);
                          setSelectedApp(null);
                        } else {
                          setSelectedApp(isSelected ? null : app.id);
                        }
                      }}
                      className={`rounded-lg border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-brand-300 bg-brand-50 shadow-sm'
                          : 'border-slate-200/80 bg-white hover:border-brand-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${app.accent} text-white shadow-sm`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="block text-[11px] font-bold leading-4 text-slate-900">{app.name}</span>
                      <span className="mt-0.5 block text-[9px] leading-3 text-slate-500">{app.description}</span>
                    </button>
                  );
                })}
              </div>
              {selectedApp && (
                <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/70 px-3 py-2.5">
                  <p className="text-xs font-semibold text-brand-900">
                    {appDestinations.find((app) => app.id === selectedApp)?.name} is coming soon.
                  </p>
                  <p className="mt-0.5 text-[11px] text-brand-700/80">
                    This app will use the same Flown navigation and workspace layout.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen((open) => !open)}
            aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
            aria-haspopup="dialog"
            aria-expanded={isNotificationsOpen}
            title="Notifications"
            className={`relative rounded-xl border p-2 transition-all ${
              isNotificationsOpen
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white/70 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Bell className="h-4 w-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
              </span>
            )}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 top-full z-50 mt-2">
              <NotificationCenter onClose={() => setIsNotificationsOpen(false)} />
            </div>
          )}
        </div>

        {/* Call quick status if active */}
        {callSession.active && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Call in progress ({Math.floor(callSession.durationSeconds / 60)}:{(callSession.durationSeconds % 60).toString().padStart(2, '0')})</span>
          </div>
        )}

      </div>
    </header>
  );
};
