import React, { useEffect, useState } from 'react';
import {
  House, Lightbulb, MessageSquare, Hash, Calendar as CalendarIcon, Mail, FolderKanban, Code2, HardDrive, Network,
  UsersRound, Headset, Megaphone, Landmark, Scale, Settings, ChevronsLeft, ChevronsRight, ChevronDown, CircleHelp,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAllAppAccess } from '../../lib/useAppAccess';
import { supabase } from '../../lib/supabase';
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
  const { activeTab, setActiveTab, conversations, currentUser, setIsWorkspaceSettingsOpen } = useWorkspace();
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
    localStorage.setItem('flown-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from('support_conversations').select('unread_staff').gt('unread_staff', 0).limit(200);
      if (active && !error) setSupportUnread((data ?? []).reduce((sum, row) => sum + (row.unread_staff as number), 0));
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
  }, []);

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

  return (
    <aside
      aria-label="Primary navigation"
      className={`fixed bottom-0 left-0 top-12 z-50 flex shrink-0 select-none flex-col border-r border-white/10 bg-gradient-to-b from-[#1b3d80] to-[#10264f] text-blue-100 transition-all duration-200 md:static md:z-30 md:translate-x-0 ${collapsed ? 'md:w-[68px]' : 'md:w-60'} w-64 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {groups.map((group) => {
          const items = group.items.filter((item) => hasAccess(item.id));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              {!collapsed && <p className="px-2.5 pb-1 text-[11px] font-medium text-blue-300/70">{group.title}</p>}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.id);
                  const badge = unread(item.id);
                  const children = active && !collapsed && sectionTabs && sectionTabs.length > 0 ? sectionTabs : null;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={item.label}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setActiveTab(item.id)}
                        className={`group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-white/15 text-white' : 'text-blue-100/85 hover:bg-white/10 hover:text-white'}`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!collapsed && children && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
                        {badge > 0 && (
                          <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-none text-white ${collapsed ? 'absolute right-1 top-0.5' : ''}`}>
                            <span className="sr-only">{badge} unread, </span>{badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </button>
                      {children && (
                        <ul className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-white/15 pl-2">
                          {children.map((child) => {
                            const ChildIcon = child.icon;
                            const selected = isSectionSelected(child, routePath);
                            return (
                              <li key={child.path}>
                                <button
                                  type="button"
                                  onClick={() => goTo(child.path)}
                                  aria-current={selected ? 'page' : undefined}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${selected ? 'bg-white/15 font-semibold text-white' : 'text-blue-100/75 hover:bg-white/10 hover:text-white'}`}
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
            </div>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-white/10 px-2.5 py-2">
        <button
          type="button"
          title="Settings"
          onClick={() => setIsWorkspaceSettingsOpen(true)}
          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-blue-100/85 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Settings'}
        </button>
        <button
          type="button"
          title="Help & support"
          onClick={() => setActiveTab('help')}
          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-blue-100/85 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}
        >
          <CircleHelp className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Help & support'}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-blue-200/70 hover:bg-white/10 hover:text-white md:flex md:justify-start"
        >
          {collapsed ? <ChevronsRight className="mx-auto h-[18px] w-[18px]" /> : <><ChevronsLeft className="h-[18px] w-[18px] shrink-0" />Collapse</>}
        </button>
      </div>
    </aside>
  );
};
