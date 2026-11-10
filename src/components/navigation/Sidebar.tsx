import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  House, Lightbulb, MessageSquare, Calendar as CalendarIcon, FolderKanban, Code2, UsersRound, Building2, Settings, ChevronsUpDown, LogOut, Flame, Network, Bell,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAllAppAccess } from '../../lib/useAppAccess';
import { supabase } from '../../lib/supabase';
import { GlobalSearch } from './GlobalSearch';
import { getSectionTabs, isSectionSelected } from './sectionTabs';
import { NotificationCenter } from '../notifications/NotificationCenter';

type Tab = ReturnType<typeof useWorkspace>['activeTab'];
type NavItem = { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> };

// Leaf pages live under Overview; apps with their own pages are dropdowns of their own.
const overviewItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'programs', label: 'Tasks', icon: FolderKanban },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'systems', label: 'Systems', icon: Network },
];
const appDropdowns: NavItem[] = [
  { id: 'engineering', label: 'Products', icon: Code2 },
  { id: 'customers', label: 'Customers', icon: UsersRound },
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'wildfire', label: 'Wildfire', icon: Flame },
];

const accessKey: Partial<Record<Tab, string>> = { customers: 'customers', admin: 'systems', wildfire: 'wildfire' };

interface SidebarProps {
  isMobileOpen?: boolean;
  onOpenMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false, onOpenMobile }) => {
  const { activeTab, setActiveTab, conversations, currentUser, logout, unreadNotificationCount } = useWorkspace();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('flown-sidebar-groups') || '{}'); } catch { return {}; } });
  const access = useAllAppAccess();
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const openForSearch = useCallback(() => {
    if (window.innerWidth < 768) onOpenMobile?.();
  }, [onOpenMobile]);
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    const handleRoute = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  useEffect(() => {
    localStorage.setItem('flown-sidebar-groups', JSON.stringify(openGroups));
  }, [openGroups]);

  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return; }
    setNotificationsOpen(false);
  }, [routePath, activeTab]);

  useEffect(() => {
    if (!isMobileOpen && window.innerWidth < 768) setNotificationsOpen(false);
  }, [isMobileOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setNotificationsOpen(false);
        notificationsRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [chats, tickets] = await Promise.all([
        supabase.from('support_conversations').select('unread_staff').gt('unread_staff', 0).limit(200),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'new').neq('requester_id', currentUser.id),
      ]);
      // Counts tickets from other people; non-agents can only read their own, so it stays 0 for them.
      if (active && !chats.error) setSupportUnread((chats.data ?? []).reduce((sum, row) => sum + (row.unread_staff as number), 0) + (tickets.count ?? 0));
    };
    void load();
    const timer = window.setInterval(load, 30000);
    const refresh = () => void load();
    window.addEventListener('flown-support-changed', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('flown-support-changed', refresh);
    };
  }, [currentUser.id]);

  const hasAppAccess = (key: string) => !access || (access[key] ?? 0) >= 1;
  const hasAccess = (id: Tab) => {
    if (id === 'company') return true;
    const key = accessKey[id];
    return !key || !access || (access[key] ?? 0) >= 1 || (id === 'admin' && currentUser.systemRole === 'admin');
  };
  const unread = (id: Tab) => id === 'messages' ? conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0) : id === 'customers' ? supportUnread : 0;
  const goTo = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const isActive = (id: Tab) => activeTab === id || (id === 'messages' && activeTab === 'channels');

  const statusColor = currentUser.status === 'online' ? 'bg-emerald-400' : 'bg-slate-400';
  const row = (active: boolean) => `group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-all duration-150 ${active ? 'bg-white/20 text-white shadow-xs font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;

  return (
    <aside
      id="workspace-navigation"
      aria-label="Primary navigation"
      className={`fixed inset-y-0 left-0 z-50 flex shrink-0 select-none flex-col bg-slate-950 text-white border-r border-slate-200 transition-transform duration-200 motion-reduce:transition-none md:static md:z-30 md:w-56 md:translate-x-0 md:visible w-72 ${isMobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'}`}
    >
      <div className="flex items-center gap-2 p-3 pb-2.5">
        <button
          type="button"
          onClick={() => { setActiveTab('home'); goTo('/home'); }}
          title="Flown home"
          className="flex h-14 min-w-0 flex-1 items-center justify-start rounded-lg hover:bg-white/10 transition-colors"
        >
          <img src="/flown-logo.png" alt="Flown" className="h-11 w-auto max-w-full object-contain object-left" />
        </button>
      </div>

      <div className="px-3 pb-2"><GlobalSearch onRequestOpen={openForSearch} /></div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-1 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]">
        {(() => {
          const rowClass = (active: boolean) => `group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-all duration-150 ${active ? 'bg-white/20 font-semibold text-white shadow-xs' : 'font-medium text-white/85 hover:bg-white/10 hover:text-white'}`;
          const bar = <span className="rail-active-bar absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-white" />;
          const section = (id: string, title: string, forceOpen: boolean, children: React.ReactNode) => {
            const open = forceOpen || openGroups[id] === true || (openGroups[id] === undefined && id === 'overview');
            return (
              <div key={id} id={`rail-group-${id}`} className="pb-1">
                <button type="button" aria-expanded={open} onClick={() => {
                  setOpenGroups((current) => ({ ...current, [id]: !open }));
                  // Bring a newly opened group's pages into view so they are not hidden below the fold.
                  if (!open) window.requestAnimationFrame(() => document.getElementById(`rail-group-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
                }} className="flex w-full items-center justify-between px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/70 hover:text-white transition-colors">
                  {title}
                  <ChevronsUpDown className="h-3 w-3 opacity-75" />
                </button>
                {open && <ul className="space-y-0.5 mt-0.5">{children}</ul>}
              </div>
            );
          };
          const leaf = (item: NavItem) => {
            const Icon = item.icon;
            const active = isActive(item.id);
            const badge = unread(item.id);
            return (
              <li key={item.id}>
                <button type="button" aria-current={active ? 'page' : undefined} onClick={() => setActiveTab(item.id)} className={rowClass(active)}>
                  {active && bar}
                  <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? 'text-white' : 'text-white/75 group-hover:text-white'} transition-colors`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-none text-white"><span className="sr-only">{badge} unread, </span>{badge > 99 ? '99+' : badge}</span>}
                </button>
              </li>
            );
          };
          return (
            <>
              {section('overview', 'Overview', false, overviewItems.filter((item) => hasAccess(item.id)).map(leaf))}
              {appDropdowns.filter((item) => hasAccess(item.id)).map((item) => {
                const active = isActive(item.id);
                const pages = (getSectionTabs(item.id, active ? routePath : '') ?? []).filter((page) => !page.access || hasAppAccess(page.access));
                if (pages.length === 0) return section(item.id, item.label, false, leaf(item));
                return section(item.id, item.label, false, pages.map((child) => {
                  const ChildIcon = child.icon;
                  const selected = active && isSectionSelected(child, routePath);
                  return (
                    <li key={child.path}>
                      <button type="button" aria-current={selected ? 'page' : undefined} onClick={() => goTo(child.path)} className={rowClass(selected)}>
                        {selected && bar}
                        <ChildIcon className={`h-[17px] w-[17px] shrink-0 ${selected ? 'text-white' : 'text-white/75 group-hover:text-white'} transition-colors`} />
                        <span className="flex-1 truncate">{child.label}</span>
                        {child.path === '/customers/support' && unread('customers') > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-none text-white">{unread('customers')}</span>}
                      </button>
                    </li>
                  );
                }));
              })}
            </>
          );
        })()}
      </nav>

      <div className="space-y-0.5 border-t border-white/15 p-2.5">
        <div className="relative" ref={notificationsRef}>
          <button type="button" data-onboarding-target="notifications-button" aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`} aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)} className={row(notificationsOpen)}>
            <Bell className="h-[17px] w-[17px] shrink-0 text-white/80" />
            <span className="flex-1">Notifications</span>
            {unreadNotificationCount > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
          </button>
          {notificationsOpen && <div className="absolute bottom-full left-0 pb-2 md:bottom-0 md:left-full md:pb-0 md:pl-2"><NotificationCenter onClose={() => setNotificationsOpen(false)} /></div>}
        </div>
        <button type="button" title="Settings" onClick={() => setActiveTab('settings')} className={row(activeTab === 'settings')}>
          <Settings className="h-[17px] w-[17px] shrink-0 text-white/80" />
          Settings
        </button>
        <div className="pt-1">
          <div data-onboarding-target="profile-summary" className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 p-2 transition-colors">
            <span title={`${currentUser.name} (${currentUser.role})`} className="relative block shrink-0 rounded-full">
              {currentUser.avatar ? <img src={currentUser.avatar} alt={currentUser.name} className="h-8 w-8 rounded-full border border-white/40 object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white" aria-label={currentUser.name}>{currentUser.name.slice(0, 2).toUpperCase()}</span>}
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#2569F5] ${statusColor}`} />
            </span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{currentUser.name}</span><span className="block truncate text-[11px] text-white/75">{currentUser.role}</span></span>
                <button type="button" onClick={() => void logout()} aria-label="Sign out" title="Sign out" className="rounded-lg p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </aside>
  );
};
