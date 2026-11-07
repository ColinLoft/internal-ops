import React, { useEffect, useState } from 'react';
import { House, MessageSquare, ClipboardList, Calendar as CalendarIcon, Menu } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

interface MobileTabBarProps {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ isMenuOpen, onToggleMenu }) => {
  const { activeTab, setActiveTab, conversations } = useWorkspace();
  const unread = conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);

  const [routePath, setRoutePath] = useState(window.location.pathname);
  useEffect(() => {
    const onRoute = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  const sectionTabs = getSectionTabs(activeTab, routePath);
  const workspaceTabs = [
    { label: 'Home', icon: House, isActive: activeTab === 'home', onSelect: () => setActiveTab('home') },
    {
      label: 'Messages',
      icon: MessageSquare,
      isActive: activeTab === 'messages' || activeTab === 'channels',
      badge: unread,
      onSelect: () => setActiveTab('messages'),
    },
    { label: 'Tasks', icon: ClipboardList, isActive: activeTab === 'programs', onSelect: () => setActiveTab('programs') },
    { label: 'Calendar', icon: CalendarIcon, isActive: activeTab === 'calendar', onSelect: () => setActiveTab('calendar') },
  ];

  const tabs = sectionTabs
    ? sectionTabs.slice(0, 4).map((item) => ({
        label: item.short,
        icon: item.icon,
        isActive: isSectionSelected(item, routePath),
        badge: 0,
        onSelect: () => {
          if (window.location.pathname !== item.path) window.history.pushState({}, '', item.path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        },
      }))
    : workspaceTabs;

  const itemClass = (active: boolean) =>
    `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
      active ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <nav
      aria-label={sectionTabs ? 'Section' : 'Main'}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {tabs.map(({ label, icon: Icon, isActive, badge, onSelect }) => (
        <button
          key={label}
          type="button"
          onClick={onSelect}
          aria-current={isActive ? 'page' : undefined}
          className={itemClass(isActive)}
        >
          <span className="relative">
            <Icon className="h-5 w-5" aria-hidden="true" />
            {!!badge && badge > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onToggleMenu}
        aria-expanded={isMenuOpen}
        aria-label="Menu"
        className={itemClass(isMenuOpen)}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        Menu
      </button>
    </nav>
  );
};
