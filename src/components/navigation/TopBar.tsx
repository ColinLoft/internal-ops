import React, { useEffect, useRef, useState } from 'react';
import { House, MessageSquare, CalendarDays, Mail, HardDrive, Code2, Megaphone, Scale, Landmark, UsersRound, FolderKanban, Settings, CircleHelp, Lightbulb, Network, FileText, Bell, Phone, Inbox, Plus, MessageSquarePlus, MailPlus, Hash, CalendarPlus, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

type OpenTab = { path: string; app: string; label: string };

export const appLabels: Record<string, string> = {
  home: 'Home', messages: 'Messages', channels: 'Channels', calendar: 'Calendar', inbox: 'Email', drive: 'Drive',
  engineering: 'Engineering', gtm: 'Marketing', legal: 'Legal', finance: 'Grants', customers: 'Customers',
  programs: 'Projects', admin: 'Settings', settings: 'Settings', help: 'Support', helpcenter: 'Help Center', insights: 'Insights', organization: 'Organization',
};
const tabIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  home: House, messages: MessageSquare, channels: Hash, calendar: CalendarDays, inbox: Mail, drive: HardDrive,
  engineering: Code2, gtm: Megaphone, legal: Scale, finance: Landmark, customers: UsersRound, programs: FolderKanban,
  admin: Settings, settings: Settings, helpcenter: CircleHelp, insights: Lightbulb, organization: Network,
};
const storageKey = 'flown-open-tabs';
const maxTabs = 10;

const loadTabs = (): OpenTab[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]') as OpenTab[];
    return Array.isArray(parsed) ? parsed.filter((tab) => typeof tab.path === 'string' && tab.app in appLabels).slice(0, maxTabs) : [];
  } catch {
    return [];
  }
};

export const TopBar: React.FC = () => {
  const { activeTab, setActiveTab, unreadNotificationCount, callSession, conversations, setIsNewMessageOpen, setIsCreateChannelOpen, setIsAddEventOpen, requestEmailCompose } = useWorkspace();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [tabs, setTabs] = useState<OpenTab[]>(loadTabs);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setIsNotificationsOpen(false);
      if (quickRef.current && !quickRef.current.contains(event.target as Node)) setIsQuickOpen(false);
    };
    const onRoute = () => setRoutePath(window.location.pathname);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('popstate', onRoute);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('popstate', onRoute);
    };
  }, []);

  const path = routePath.length > 1 ? routePath.replace(/\/$/, '') : routePath;
  const labelFor = (app: string, currentPath: string) => {
    const section = getSectionTabs(app, currentPath)?.find((item) => isSectionSelected(item, currentPath));
    return section && section.label !== appLabels[app] ? `${appLabels[app]} · ${section.label}` : appLabels[app];
  };

  // Every page you visit stays open as a tab until closed.
  useEffect(() => {
    setTabs((current) => {
      const label = labelFor(activeTab, path);
      const existing = current.find((tab) => tab.path === path);
      if (existing) return existing.label === label && existing.app === activeTab ? current : current.map((tab) => tab.path === path ? { ...tab, app: activeTab, label } : tab);
      const next = [...current, { path, app: activeTab, label }];
      return next.length > maxTabs ? next.slice(next.length - maxTabs) : next;
    });
  }, [activeTab, path]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(tabs));
  }, [tabs]);

  const openTab = (tab: OpenTab) => {
    setActiveTab(tab.app as Parameters<typeof setActiveTab>[0]);
    if (window.location.pathname !== tab.path) window.history.pushState({}, '', tab.path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const closeTab = (tab: OpenTab) => {
    const index = tabs.findIndex((item) => item.path === tab.path);
    const remaining = tabs.filter((item) => item.path !== tab.path);
    setTabs(remaining);
    if (tab.path === path) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      if (next) openTab(next);
      else {
        setActiveTab('home');
        window.history.pushState({}, '', '/home');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  const quickItems = [
    { label: 'New chat', hint: 'Direct or group message', icon: MessageSquarePlus, run: () => { setActiveTab('messages'); setIsNewMessageOpen(true); } },
    { label: 'New email', hint: 'Open the composer', icon: MailPlus, run: () => requestEmailCompose() },
    { label: 'New channel', hint: 'Workspace channel', icon: Hash, run: () => { setActiveTab('channels'); setIsCreateChannelOpen(true); } },
    { label: 'New event', hint: 'Add to the calendar', icon: CalendarPlus, run: () => { setActiveTab('calendar'); setIsAddEventOpen(true); } },
  ];

  const unreadMessages = conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
  const pill = 'flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] hover:bg-white/10 px-2.5 text-xs font-medium text-slate-200 transition-colors shadow-2xs';
  const iconBtn = 'relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors';

  return (
    <header className="flex-shrink-0 bg-[#0e121b] text-slate-200 border-b border-slate-800/60">
      <div className="flex h-11 items-center justify-between gap-3 px-3 md:px-5">
        <span />
        <div className="flex items-center gap-2">
          <div className="relative" ref={quickRef}>
            <button
              type="button"
              onClick={() => { setIsQuickOpen((open) => !open); setIsNotificationsOpen(false); }}
              aria-label="Quick add"
              aria-haspopup="menu"
              aria-expanded={isQuickOpen}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 px-3 text-xs font-medium text-white shadow-xs transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Quick Add</span>
            </button>
            {isQuickOpen && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl text-slate-800">
                {quickItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" role="menuitem" onClick={() => { item.run(); setIsQuickOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition-colors">
                      <Icon className="h-4 w-4 text-brand-600" />
                      <span><span className="block text-xs font-semibold text-slate-800">{item.label}</span><span className="block text-xs text-slate-500">{item.hint}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setActiveTab('messages')} title={callSession.active ? `In a call · ${Math.floor(callSession.durationSeconds / 60)}:${(callSession.durationSeconds % 60).toString().padStart(2, '0')}` : 'Calls'} aria-label="Calls" className={iconBtn}>
            <Phone className="h-4 w-4" />
            <span className={`absolute bottom-1 right-1 h-2 w-2 rounded-full ring-2 ring-[#0e121b] ${callSession.active ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
          </button>
          <button type="button" onClick={() => setActiveTab('messages')} className={`${pill} hidden sm:flex`}>
            <Inbox className="h-4 w-4 text-brand-300" />
            Inbox
            <span className="rounded-full bg-brand-600 px-1.5 py-0.2 text-[11px] font-bold leading-none text-white">{unreadMessages}</span>
          </button>
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => { setIsNotificationsOpen((open) => !open); setIsQuickOpen(false); }}
              aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              title="Notifications"
              className={`${iconBtn} ${isNotificationsOpen ? 'bg-white/10 text-white' : ''}`}
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-[#0e121b]">
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
        </div>
      </div>

      <div role="tablist" aria-label="Open pages" className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-800/40 bg-[#121824] px-3 py-1.5 [scrollbar-width:none]">
        {tabs.map((tab) => {
          const active = tab.path === path;
          const Icon = tabIcons[tab.app] || FileText;
          return (
            <div key={tab.path} className={`group flex shrink-0 items-center rounded-lg pr-1 transition-all ${active ? 'bg-white/10 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => openTab(tab)}
                className={`flex max-w-[12rem] items-center gap-2 truncate px-2.5 py-1 text-xs ${active ? 'font-medium text-white' : 'font-normal text-slate-400 group-hover:text-slate-200'}`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-brand-300' : 'text-slate-400'}`} />
                <span className="truncate">{tab.label}</span>
              </button>
              {tabs.length > 1 && (
                <button type="button" aria-label={`Close ${tab.label}`} onClick={() => closeTab(tab)} className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-white/15 hover:text-white group-hover:opacity-100 transition-opacity">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
};
