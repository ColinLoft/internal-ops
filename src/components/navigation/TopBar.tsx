import React, { useEffect, useRef, useState } from 'react';
import { Bell, CirclePlus, MessageSquarePlus, MailPlus, Hash, CalendarPlus, House, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

type OpenTab = { path: string; app: string; label: string };

const appLabels: Record<string, string> = {
  home: 'Home', messages: 'Messages', channels: 'Channels', calendar: 'Calendar', inbox: 'Email', drive: 'Drive',
  engineering: 'Engineering', gtm: 'Marketing', legal: 'Legal', finance: 'Grants', customers: 'Relationships',
  programs: 'Projects', admin: 'Systems', help: 'Support', helpcenter: 'Help Center', insights: 'Insights', organization: 'Organization',
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
  const { activeTab, setActiveTab, unreadNotificationCount, callSession, setIsNewMessageOpen, setIsCreateChannelOpen, setIsAddEventOpen, requestEmailCompose } = useWorkspace();
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

  return (
    <header className="flex-shrink-0 border-b border-slate-200/80 bg-white/70">
      <div className="flex h-12 items-center justify-between gap-3 px-3 md:px-5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs">
          <House className="h-4 w-4 text-slate-400" />
          <span className="text-slate-300">/</span>
          <span className="truncate font-semibold text-slate-700">{labelFor(activeTab, path)}</span>
        </nav>
        <div className="flex items-center gap-2">
          {callSession.active && (
            <div className="flex animate-pulse items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {Math.floor(callSession.durationSeconds / 60)}:{(callSession.durationSeconds % 60).toString().padStart(2, '0')}
            </div>
          )}
          <div className="relative" ref={quickRef}>
            <button
              type="button"
              onClick={() => { setIsQuickOpen((open) => !open); setIsNotificationsOpen(false); }}
              aria-label="Quick add"
              aria-haspopup="menu"
              aria-expanded={isQuickOpen}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <CirclePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Quick add</span>
            </button>
            {isQuickOpen && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                {quickItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" role="menuitem" onClick={() => { item.run(); setIsQuickOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-brand-50">
                      <Icon className="h-4 w-4 text-brand-600" />
                      <span><span className="block text-xs font-semibold text-slate-800">{item.label}</span><span className="block text-xs text-slate-500">{item.hint}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => { setIsNotificationsOpen((open) => !open); setIsQuickOpen(false); }}
              aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              title="Notifications"
              className={`relative rounded-lg border p-2 transition-colors ${isNotificationsOpen ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
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

      <div role="tablist" aria-label="Open pages" className="flex items-end gap-1 overflow-x-auto px-3 md:px-5 [scrollbar-width:none]">
        {tabs.map((tab) => {
          const active = tab.path === path;
          return (
            <div key={tab.path} className={`group flex shrink-0 items-center gap-1 border-b-2 pr-1 ${active ? 'border-brand-600' : 'border-transparent'}`}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => openTab(tab)}
                className={`max-w-[11rem] truncate px-2.5 py-2 text-xs ${active ? 'font-semibold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-800'}`}
              >
                {tab.label}
              </button>
              {tabs.length > 1 && (
                <button type="button" aria-label={`Close ${tab.label}`} onClick={() => closeTab(tab)} className="rounded p-0.5 text-slate-400 opacity-60 hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100">
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
