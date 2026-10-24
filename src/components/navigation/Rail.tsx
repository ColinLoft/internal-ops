import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Hash,
  Calendar as CalendarIcon,
  UserRound,
  Bell,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { ProfilePopover } from '../profile/ProfilePopover';

export const Rail: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    conversations,
    channels,
    unreadNotificationCount,
    currentUser,
  } = useWorkspace();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Calculate unread totals
  const totalUnreadMessages = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const totalUnreadChannels = channels.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfilePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside className="w-[72px] bg-slate-900/95 backdrop-blur-xl border-r border-slate-800/80 flex flex-col items-center py-4 justify-between z-30 select-none shadow-2xl flex-shrink-0">
      {/* Top Brand Logo */}
      <div className="flex flex-col items-center gap-6">
        <div 
          onClick={() => setActiveTab('messages')}
          className="group relative cursor-pointer w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 transition-transform hover:scale-105 active:scale-95"
          title="Beacon Workspace"
        >
          <img src="/brand-icon.png" alt="Beacon Workspace" className="w-6 h-6 object-contain group-hover:rotate-12 transition-transform duration-300" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-slate-900 rounded-full" />
        </div>

        {/* Navigation Item Tabs */}
        <nav className="flex flex-col items-center gap-2">
          {/* Messages Item */}
          <button
            data-onboarding-target="nav-messages"
            onClick={() => setActiveTab('messages')}
            className={`group relative p-3 rounded-2xl transition-all duration-200 ${
              activeTab === 'messages'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Messages & Direct Chats"
          >
            <MessageSquare className="w-5 h-5" />
            {totalUnreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                {totalUnreadMessages}
              </span>
            )}
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              Messages
            </span>
          </button>

          {/* Channels Item */}
          <button
            data-onboarding-target="nav-channels"
            onClick={() => setActiveTab('channels')}
            className={`group relative p-3 rounded-2xl transition-all duration-200 ${
              activeTab === 'channels'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Channels & Announcements"
          >
            <Hash className="w-5 h-5" />
            {totalUnreadChannels > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900">
                {totalUnreadChannels}
              </span>
            )}
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              Channels
            </span>
          </button>

          {/* Calendar Item */}
          <button
            data-onboarding-target="nav-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`group relative p-3 rounded-2xl transition-all duration-200 ${
              activeTab === 'calendar'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Team & Personal Calendar"
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              Calendar
            </span>
          </button>

          {currentUser.systemRole === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`group relative p-3 rounded-2xl transition-all duration-200 ${
                activeTab === 'admin'
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
              }`}
              title="People & access"
              aria-label="People & access"
            >
              <UserRound className="w-5 h-5" />
              <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                People &amp; access
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Bottom Actions: Notifications & Current User Avatar */}
      <div className="flex flex-col items-center gap-4">
        {/* Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className={`group relative p-3 rounded-2xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-all ${
              isNotificationsOpen ? 'bg-slate-800 text-white' : ''
            }`}
            title="Notification Center"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-slate-900 animate-ping" />
            )}
            {unreadNotificationCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-slate-900" />
            )}
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              Notifications ({unreadNotificationCount})
            </span>
          </button>

          {isNotificationsOpen && (
            <div className="absolute left-[84px] bottom-0 z-50">
              <NotificationCenter onClose={() => setIsNotificationsOpen(false)} />
            </div>
          )}
        </div>

        {/* User Avatar with Profile Popover */}
        <div className="relative" ref={profileRef}>
          <button
            data-onboarding-target="profile-button"
            onClick={() => setIsProfilePopoverOpen((prev) => !prev)}
            className="group relative p-0.5 rounded-full hover:ring-2 hover:ring-brand-500/60 transition-all"
            title={`${currentUser.name} (${currentUser.role})`}
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-slate-700 shadow-md group-hover:border-brand-500 transition-colors"
            />
            {/* Status dot */}
            <span
              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                currentUser.status === 'online'
                  ? 'bg-emerald-500'
                  : currentUser.status === 'busy'
                  ? 'bg-rose-500'
                  : currentUser.status === 'away'
                  ? 'bg-amber-500'
                  : 'bg-slate-500'
              }`}
            />
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              {currentUser.name} Status &amp; Profile
            </span>
          </button>

          {isProfilePopoverOpen && (
            <div className="absolute left-[84px] bottom-0 z-50">
              <ProfilePopover onClose={() => setIsProfilePopoverOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};