import React, { useEffect, useRef, useState } from 'react';
import { Bell, Plus, MessageSquarePlus, MailPlus, CalendarPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { WorkspaceAssistant } from '../assistant/WorkspaceAssistant';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

export const appLabels: Record<string, string> = {
  home: 'Home', messages: 'Messages', channels: 'Channels', calendar: 'Calendar', inbox: 'Email', drive: 'Drive',
  engineering: 'Products', company: 'Company', customers: 'Customers',
  programs: 'Projects & Tasks', admin: 'Settings', settings: 'Settings', help: 'Support', helpcenter: 'Help Center', insights: 'Insights'
};

export const TopBar: React.FC = () => {
  const { activeTab, setActiveTab, unreadNotificationCount, setIsNewMessageOpen, setIsAddEventOpen, requestEmailCompose, workspaceSettings, currentUser } = useWorkspace();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
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

  const quickItems = [
    { label: 'New chat', hint: 'Direct or group message', icon: MessageSquarePlus, run: () => { setActiveTab('messages'); setIsNewMessageOpen(true); } },
    { label: 'New email', hint: 'Open the composer', icon: MailPlus, run: () => requestEmailCompose() },
    { label: 'New event', hint: 'Add to the calendar', icon: CalendarPlus, run: () => { setActiveTab('calendar'); setIsAddEventOpen(true); } },
  ];

  const iconBtn = 'relative flex h-8 w-8 items-center justify-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors';

  const currentLabel = labelFor(activeTab, path);

  return (
    <header className="flex-shrink-0 bg-gradient-to-r from-[#2569F5] via-[#377bf7] to-[#5695FA] text-white border-b border-white/15">
      <div className="flex h-11 items-center justify-between gap-3 px-3 md:px-5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-white tracking-wide truncate">
            {currentLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={quickRef}>
            <button
              type="button"
              onClick={() => { setIsQuickOpen((open) => !open); setIsNotificationsOpen(false); }}
              aria-label="Quick add"
              aria-haspopup="menu"
              aria-expanded={isQuickOpen}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-3 text-xs font-semibold text-white ring-1 ring-white/30 transition-colors"
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
                      <Icon className="h-4 w-4 text-[#2569F5]" />
                      <span><span className="block text-xs font-semibold text-slate-800">{item.label}</span><span className="block text-xs text-slate-500">{item.hint}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {workspaceSettings.aiAssistantEnabled && <WorkspaceAssistant triggerClassName="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[#1746b8] text-white ring-1 ring-white/20 hover:bg-[#1c52d0] transition-colors" />}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => { setIsNotificationsOpen((open) => !open); setIsQuickOpen(false); }}
              aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              title="Notifications"
              className={`${iconBtn} bg-[#1746b8] ring-1 ring-white/20 ${isNotificationsOpen ? 'bg-[#1c52d0]' : ''}`}
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-[#2569F5]">
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
        </div>
      </div>
    </header>
  );
};
