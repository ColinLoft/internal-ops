import React from 'react';
import { House, MessageSquare, Mail, Calendar as CalendarIcon, Menu } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface MobileTabBarProps {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ isMenuOpen, onToggleMenu }) => {
  const { activeTab, setActiveTab, conversations } = useWorkspace();
  const unread = conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);

  const tabs = [
    { label: 'Home', icon: House, isActive: activeTab === 'home', onSelect: () => setActiveTab('home') },
    {
      label: 'Messages',
      icon: MessageSquare,
      isActive: activeTab === 'messages' || activeTab === 'channels',
      badge: unread,
      onSelect: () => setActiveTab('messages'),
    },
    { label: 'Email', icon: Mail, isActive: activeTab === 'inbox', onSelect: () => setActiveTab('inbox') },
    { label: 'Calendar', icon: CalendarIcon, isActive: activeTab === 'calendar', onSelect: () => setActiveTab('calendar') },
  ];

  const itemClass = (active: boolean) =>
    `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
      active ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
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
