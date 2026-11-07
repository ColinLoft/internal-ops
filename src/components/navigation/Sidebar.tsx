import React, { useEffect, useRef, useState } from 'react';
import {
  House, Lightbulb, MessageSquare, Calendar as CalendarIcon, Mail, FolderKanban, Code2, HardDrive, UsersRound, Building2, Settings, ChevronsUpDown, Bug, LogOut, PanelLeftClose,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAllAppAccess } from '../../lib/useAppAccess';
import { supabase } from '../../lib/supabase';
import { GlobalSearch } from './GlobalSearch';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

type Tab = ReturnType<typeof useWorkspace>['activeTab'];
type NavItem = { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> };

// Leaf pages live under Overview; apps with their own pages are dropdowns of their own.
const overviewItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'programs', label: 'Tasks', icon: FolderKanban },
  { id: 'inbox', label: 'Email', icon: Mail },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'drive', label: 'Drive', icon: HardDrive },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
];
const appDropdowns: NavItem[] = [
  { id: 'engineering', label: 'Products', icon: Code2 },
  { id: 'customers', label: 'Customers', icon: UsersRound },
  { id: 'company', label: 'Company', icon: Building2 },
];

const accessKey: Partial<Record<Tab, string>> = { customers: 'customers', admin: 'systems' };

interface SidebarProps {
  isMobileOpen?: boolean;
  onOpenBugReport: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false, onOpenBugReport }) => {
  const { activeTab, setActiveTab, conversations, currentUser, logout } = useWorkspace();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('flown-sidebar-groups') || '{}'); } catch { return {}; } });
  const access = useAllAppAccess();
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('flown-sidebar-collapsed') === '1');
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
    setCollapsed(true);
  }, [routePath, activeTab]);

  useEffect(() => {
    const toggle = () => setCollapsed((value) => !value);
    window.addEventListener('flown-toggle-sidebar', toggle);
    return () => window.removeEventListener('flown-toggle-sidebar', toggle);
  }, []);

  useEffect(() => {
    const expandForTour = () => setCollapsed(false);
    const finishTour = () => setCollapsed(true);
    window.addEventListener('flown-onboarding-target-bug-report', expandForTour);
    window.addEventListener('flown-onboarding-tour-finished', finishTour);
    return () => {
      window.removeEventListener('flown-onboarding-target-bug-report', expandForTour);
      window.removeEventListener('flown-onboarding-tour-finished', finishTour);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('flown-sidebar-collapsed', collapsed ? '1' : '0');
    window.dispatchEvent(new CustomEvent('flown-sidebar-state', { detail: collapsed }));
  }, [collapsed]);

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
  const row = (active: boolean) => `group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-all duration-150 ${collapsed ? 'justify-center px-0' : ''} ${active ? 'bg-white/20 text-white shadow-xs font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;

  return (
    <aside
      aria-label="Primary navigation"
      className={`fixed inset-y-0 left-0 z-50 flex shrink-0 select-none flex-col bg-gradient-to-b from-[#2569F5] via-[#2f75f7] to-[#488af9] text-white border-r border-white/15 transition-all duration-200 md:static md:z-30 md:translate-x-0 ${collapsed ? 'md:w-0 md:overflow-hidden md:border-r-0 md:invisible' : 'md:w-64'} w-72 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex items-center gap-2 p-3 pb-2.5">
        <button
          type="button"
          onClick={() => { setActiveTab('home'); goTo('/home'); }}
          title="Flown home"
          className={`h-10 min-w-0 flex-1 items-center justify-start px-2 rounded-lg hover:bg-white/10 transition-colors ${collapsed ? 'flex md:hidden' : 'flex'}`}
        >
          <img src="/flown-logo.png" alt="Flown" className="h-8 w-auto max-w-none shrink-0 brightness-0 invert opacity-95" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white md:flex transition-colors"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && <div className="px-3 pb-2"><GlobalSearch /></div>}

      <nav className="flex-1 overflow-y-auto px-2.5 py-1 [scrollbar-width:none]">
        {(() => {
          const rowClass = (active: boolean) => `group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-all duration-150 ${active ? 'bg-white/20 font-semibold text-white shadow-xs' : 'font-medium text-white/85 hover:bg-white/10 hover:text-white'}`;
          const bar = <span className="rail-active-bar absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-white" />;
          const section = (id: string, title: string, forceOpen: boolean, children: React.ReactNode) => {
            const open = forceOpen || openGroups[id] === true || (openGroups[id] === undefined && id === 'overview');
            return (
              <div key={id} className="pb-1">
                <button type="button" aria-expanded={open} onClick={() => setOpenGroups((current) => ({ ...current, [id]: !open }))} className="flex w-full items-center justify-between px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/70 hover:text-white transition-colors">
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
        <button type="button" data-onboarding-target="bug-report-button" title="Bug report" onClick={onOpenBugReport} className={row(false)}>
          <Bug className="h-[17px] w-[17px] shrink-0 text-white/80" />
          Bug report
        </button>
        <button type="button" title="Settings" onClick={() => setActiveTab('settings')} className={row(activeTab === 'settings')}>
          <Settings className="h-[17px] w-[17px] shrink-0 text-white/80" />
          Settings
        </button>
        <div className="pt-1">
          <div data-onboarding-target="profile-summary" className={`flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 p-2 transition-colors ${collapsed ? 'justify-center' : ''}`}>
            <span title={`${currentUser.name} (${currentUser.role})`} className="relative block shrink-0 rounded-full">
              <img src={currentUser.avatar} alt={currentUser.name} className="h-8 w-8 rounded-full border border-white/40 object-cover" />
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#2569F5] ${statusColor}`} />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{currentUser.name}</span><span className="block truncate text-[11px] text-white/75">{currentUser.role}</span></span>
                <button type="button" onClick={() => void logout()} aria-label="Sign out" title="Sign out" className="rounded-lg p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors"><LogOut className="h-4 w-4" /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
