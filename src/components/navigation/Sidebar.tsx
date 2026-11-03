import React, { useEffect, useRef, useState } from 'react';
import {
  House, Lightbulb, MessageSquare, Hash, Calendar as CalendarIcon, Mail, FolderKanban, Code2, HardDrive, Network,
  UsersRound, Headset, Megaphone, Landmark, Scale, Settings, ChevronsLeft, ChevronsRight, ChevronDown, CircleHelp, LogOut, PanelLeftClose,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAllAppAccess } from '../../lib/useAppAccess';
import { supabase } from '../../lib/supabase';
import { GlobalSearch } from './GlobalSearch';
import { ProfilePopover } from '../profile/ProfilePopover';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

type Tab = ReturnType<typeof useWorkspace>['activeTab'];
type NavItem = { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> };

const groups: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [
    { id: 'home', label: 'Home', icon: House },
    { id: 'insights', label: 'Insights', icon: Lightbulb },
  ] },
  { title: 'Communicate', items: [
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'channels', label: 'Channels', icon: Hash },
    { id: 'inbox', label: 'Email', icon: Mail },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  ] },
  { title: 'Work', items: [
    { id: 'programs', label: 'Projects', icon: FolderKanban },
    { id: 'engineering', label: 'Engineering', icon: Code2 },
    { id: 'drive', label: 'Drive', icon: HardDrive },
  ] },
  { title: 'People & customers', items: [
    { id: 'organization', label: 'Organization', icon: Network },
    { id: 'customers', label: 'Relationships', icon: UsersRound },
    { id: 'help', label: 'Support', icon: Headset },
    { id: 'gtm', label: 'Marketing', icon: Megaphone },
  ] },
  { title: 'Business', items: [
    { id: 'finance', label: 'Grants', icon: Landmark },
    { id: 'legal', label: 'Legal', icon: Scale },
    { id: 'admin', label: 'Systems', icon: Settings },
  ] },
];

const accessKey: Partial<Record<Tab, string>> = { customers: 'customers', finance: 'finance', legal: 'legal', admin: 'systems' };

interface SidebarProps {
  isMobileOpen?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false }) => {
  const { activeTab, setActiveTab, conversations, currentUser, setIsWorkspaceSettingsOpen, logout } = useWorkspace();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('flown-sidebar-groups') || '{}'); } catch { return {}; } });
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    localStorage.setItem('flown-sidebar-collapsed', collapsed ? '1' : '0');
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

  const hasAccess = (id: Tab) => {
    const key = accessKey[id];
    return !key || !access || (access[key] ?? 0) >= 1 || (id === 'admin' && currentUser.systemRole === 'admin');
  };
  const unread = (id: Tab) => id === 'messages' ? conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0) : id === 'help' ? supportUnread : 0;
  const goTo = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const sectionTabs = getSectionTabs(activeTab, routePath);
  const isActive = (id: Tab) => activeTab === id;

  const statusColor = currentUser.status === 'busy' ? 'bg-rose-400' : currentUser.status === 'offline' ? 'bg-slate-300' : 'bg-emerald-400';
  const row = (active: boolean) => `group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors ${collapsed ? 'justify-center px-0' : ''} ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-white/90 hover:bg-white/15'}`;

  return (
    <aside
      aria-label="Primary navigation"
      className={`fixed inset-y-0 left-0 z-50 flex shrink-0 select-none flex-col bg-brand-600 text-white transition-all duration-200 md:static md:z-30 md:translate-x-0 ${collapsed ? 'md:w-[72px]' : 'md:w-64'} w-72 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className={`flex items-center gap-2.5 p-3 ${collapsed ? 'flex-col' : ''}`}>
        <button
          type="button"
          onClick={() => { setActiveTab('home'); goTo('/home'); }}
          title="Flown home"
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/15 p-2 text-left hover:bg-white/20 ${collapsed ? 'flex-none justify-center' : ''}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white"><img src="/brand-icon.png" alt="" className="h-5 w-5 object-contain" /></span>
          {!collapsed && <span className="min-w-0"><span className="block truncate text-sm font-semibold">Flown</span><span className="block truncate text-xs text-white/70">Operations workspace</span></span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 hover:bg-white/20 md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && <div className="px-3 pb-2"><GlobalSearch /></div>}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
        {groups.map((group) => {
          const items = group.items.filter((item) => hasAccess(item.id));
          if (items.length === 0) return null;
          const hasActive = items.some((item) => isActive(item.id));
          const open = collapsed || hasActive || openGroups[group.title] !== false;
          return (
            <div key={group.title} className="pb-1">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.title]: !open }))}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/60 hover:text-white/90"
                >
                  {group.title}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
              )}
              {collapsed && <div className="mx-3 mb-1 mt-2 border-t border-white/15" />}
              {open && (
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.id);
                    const badge = unread(item.id);
                    const children = active && !collapsed && sectionTabs && sectionTabs.length > 0 ? sectionTabs : null;
                    return (
                      <li key={item.id}>
                        <button type="button" title={item.label} aria-current={active ? 'page' : undefined} onClick={() => setActiveTab(item.id)} className={row(active && !children)}>
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                          {badge > 0 && (
                            <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-none text-white ${collapsed ? 'absolute right-2 top-0.5' : ''}`}>
                              <span className="sr-only">{badge} unread, </span>{badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </button>
                        {children && (
                          <ul className="mb-1 mt-0.5 space-y-0.5 pl-4">
                            {children.map((child) => {
                              const ChildIcon = child.icon;
                              const selected = isSectionSelected(child, routePath);
                              return (
                                <li key={child.path}>
                                  <button
                                    type="button"
                                    onClick={() => goTo(child.path)}
                                    aria-current={selected ? 'page' : undefined}
                                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${selected ? 'bg-white text-brand-700 shadow-sm' : 'text-white/80 hover:bg-white/15 hover:text-white'}`}
                                  >
                                    <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{child.label}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/15 p-3">
        <button type="button" title="Help Center" onClick={() => setActiveTab('helpcenter')} className={row(activeTab === 'helpcenter')}>
          <CircleHelp className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Help Center'}
        </button>
        <div className="relative" ref={profileRef}>
          <div className={`flex items-center gap-2.5 rounded-2xl bg-white/10 p-2 ${collapsed ? 'justify-center' : ''}`}>
            <button type="button" data-onboarding-target="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-label="Profile and status" title={`${currentUser.name} (${currentUser.role})`} className="relative shrink-0 rounded-full">
              <img src={currentUser.avatar} alt={currentUser.name} className="h-9 w-9 rounded-full border border-white/40 object-cover" />
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-brand-600 ${statusColor}`} />
            </button>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{currentUser.name}</span><span className="block truncate text-[11px] text-white/65">{currentUser.role}</span></span>
                <button type="button" onClick={() => setIsWorkspaceSettingsOpen(true)} aria-label="Settings" title="Settings" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"><Settings className="h-4 w-4" /></button>
                <button type="button" onClick={() => void logout()} aria-label="Sign out" title="Sign out" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"><LogOut className="h-4 w-4" /></button>
              </>
            )}
          </div>
          {profileOpen && (
            <div className="absolute bottom-full left-0 z-[70] mb-2 text-slate-800">
              <ProfilePopover onClose={() => setProfileOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
