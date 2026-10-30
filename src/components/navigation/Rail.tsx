import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Hash,
  Calendar as CalendarIcon,
  Mail,
  UserRound,
  CirclePlus,
  MessageSquarePlus,
  MailPlus,
  CalendarPlus,
  HardDrive,
  FileText,
  Presentation,
  Table2,
  ClipboardList,
  House,
  ContactRound,
  Building2,
  LifeBuoy,
  ListChecks,
  BookOpen,
  BarChart3,
  Users,
  ShieldCheck,
  CheckCircle2,
  Settings,
  Landmark,
  Target,
  WalletCards,
  Receipt,
  CreditCard,
  BriefcaseBusiness,
  Scale,
  Megaphone,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ProfilePopover } from '../profile/ProfilePopover';

export const Rail: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    conversations,
    channels,
    currentUser,
    setIsNewMessageOpen,
    setIsCreateChannelOpen,
    setIsAddEventOpen,
    requestEmailCompose,
  } = useWorkspace();

  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Calculate unread totals
  const totalUnreadMessages = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const totalUnreadChannels = channels.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const isDrive = activeTab === 'drive';
  const isCustomers = activeTab === 'customers';
  const isSystems = activeTab === 'admin';
  const isFinance = activeTab === 'finance';
  const isOperations = activeTab === 'operations';
  const isLegal = activeTab === 'legal';

  const openDriveView = (view: 'all' | 'documents' | 'presentations' | 'spreadsheets' | 'forms') => {
    const pathForView = {
      all: '/drive',
      documents: '/docs',
      presentations: '/slides',
      spreadsheets: '/sheets',
      forms: '/forms',
    }[view];
    setActiveTab('drive');
    if (window.location.pathname !== pathForView) {
      window.history.pushState({}, '', pathForView);
    }
    window.dispatchEvent(new CustomEvent('flown-drive-view', { detail: view }));
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setIsQuickActionsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfilePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside className="h-screen w-[72px] shrink-0 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800/80 flex flex-col items-center py-4 justify-between z-30 select-none shadow-2xl">
      {/* Top Brand Logo */}
      <div className="flex flex-col items-center gap-6">
        <div 
          onClick={() => isDrive ? openDriveView('all') : setActiveTab('messages')}
          className="group relative cursor-pointer w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 transition-transform hover:scale-105 active:scale-95"
          title="Flown Workspace"
        >
          <img src="/brand-icon.png" alt="Flown Workspace" className="w-6 h-6 object-contain group-hover:rotate-12 transition-transform duration-300" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand-400 border-2 border-slate-900 rounded-full" />
        </div>

        {/* Navigation Item Tabs */}
        <nav className="flex flex-col items-center gap-2">
          {isCustomers ? (
            <>{[
              { label: 'Overview', icon: House, path: '/customers' },
              { label: 'Contacts', icon: ContactRound, path: '/customers/contacts' },
              { label: 'Organizations', icon: Building2, path: '/customers/organizations' },
              { label: 'Support', icon: LifeBuoy, path: '/customers/support' },
              { label: 'Activity', icon: ListChecks, path: '/customers/activity' },
              { label: 'Knowledge', icon: BookOpen, path: '/customers/knowledge' },
              { label: 'Reports', icon: BarChart3, path: '/customers/reports' },
            ].map((item) => { const Icon = item.icon; return <button key={item.label} type="button" onClick={() => { window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} className="group relative rounded-2xl p-3 text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100" title={item.label}><Icon className="h-5 w-5" /><span className="absolute left-[78px] z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">{item.label}</span></button>; })}</>
          ) : isSystems ? (
            <>{[
              { label: 'Overview', icon: House, path: '/admin' },
              { label: 'People & teams', icon: Users, path: '/admin/people' },
              { label: 'Roles & permissions', icon: ShieldCheck, path: '/admin/roles' },
              { label: 'Onboarding', icon: ClipboardList, path: '/admin/onboarding' },
              { label: 'Approvals', icon: CheckCircle2, path: '/admin/approvals' },
              { label: 'Policies', icon: BookOpen, path: '/admin/policies' },
              { label: 'Settings & audit', icon: Settings, path: '/admin/settings' },
            ].map((item) => { const Icon = item.icon; return <button key={item.label} type="button" onClick={() => { window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} className="group relative rounded-2xl p-3 text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100" title={item.label}><Icon className="h-5 w-5" /><span className="absolute left-[78px] z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">{item.label}</span></button>; })}</>
          ) : isFinance ? (
            <>{[
              { label: 'Overview', icon: House, path: '/finance' },
              { label: 'Accounts & cards', icon: CreditCard, path: '/finance/banking' },
              { label: 'Funding opportunities', icon: Target, path: '/finance/opportunities' },
              { label: 'Applications & awards', icon: Landmark, path: '/finance/applications' },
              { label: 'Budgets & restrictions', icon: WalletCards, path: '/finance/budgets' },
              { label: 'Expenses & requests', icon: Receipt, path: '/finance/expenses' },
              { label: 'Supporters', icon: Users, path: '/finance/supporters' },
              { label: 'Reports & exports', icon: BarChart3, path: '/finance/reports' },
            ].map((item) => { const Icon = item.icon; return <button key={item.label} type="button" onClick={() => { window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} className="group relative rounded-2xl p-3 text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100" title={item.label}><Icon className="h-5 w-5" /><span className="absolute left-[78px] z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">{item.label}</span></button>; })}</>
          ) : isOperations ? (
            <><button type="button" className="group relative rounded-2xl bg-brand-600 p-3 text-white" title="Operations"><BriefcaseBusiness className="h-5 w-5" /></button></>
          ) : isLegal ? (
            <><button type="button" className="group relative rounded-2xl bg-brand-600 p-3 text-white" title="Legal"><Scale className="h-5 w-5" /></button></>
          ) : (
          <>
          <button type="button" onClick={() => setActiveTab('home')} className={`group relative p-3 rounded-2xl transition-all duration-200 ${activeTab === 'home' ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'}`} title="Home"><House className="w-5 h-5" /><span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Home</span></button>
          <button type="button" onClick={() => setActiveTab('drive')} className={`group relative p-3 rounded-2xl transition-all duration-200 ${isDrive ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'}`} title="Drive"><HardDrive className="w-5 h-5" /><span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Drive</span></button>
          {/* Direct messages */}
          <button
            data-onboarding-target="nav-messages"
            onClick={() => setActiveTab('messages')}
            className={`group relative p-3 rounded-2xl transition-all duration-200 ${
              activeTab === 'messages'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Direct messages"
          >
            <MessageSquare className="w-5 h-5" />
            {totalUnreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                {totalUnreadMessages}
              </span>
            )}
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              Direct messages
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

          <button
            onClick={() => setActiveTab('inbox')}
            className={`group relative p-3 rounded-2xl transition-all duration-200 ${
              activeTab === 'inbox'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-400/40'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Email inbox"
            aria-label="Email inbox"
          >
            <Mail className="w-5 h-5" />
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              Email inbox
            </span>
          </button>

          </>
          )}
        </nav>
      </div>

      {/* Bottom Actions: Quick Create & Current User Avatar */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative" ref={quickActionsRef}>
          <button
            type="button"
            onClick={() => setIsQuickActionsOpen((prev) => !prev)}
            className={`group relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 transition-all hover:border-brand-400 hover:bg-slate-800 ${
              isQuickActionsOpen ? 'bg-slate-800 text-white ring-2 ring-brand-400/40' : 'text-slate-300'
            }`}
            title="Create something"
            aria-label="Create something"
            aria-expanded={isQuickActionsOpen}
            aria-haspopup="menu"
          >
            <CirclePlus className="h-6 w-6" />
            <span className="absolute left-[78px] z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 pointer-events-none">
              Create
            </span>
          </button>

          {isQuickActionsOpen && (
            <div className="absolute bottom-0 left-[54px] z-50 w-64 rounded-2xl border border-slate-200/90 bg-white/95 p-2 text-slate-800 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150" aria-label="Quick create">
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick create</p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('messages');
                  setIsNewMessageOpen(true);
                  setIsQuickActionsOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50"
              >
                <MessageSquarePlus className="h-4 w-4 text-brand-600" />
                <span>
                  <span className="block text-xs font-semibold">New chat</span>
                  <span className="block text-[10px] text-slate-500">Start a direct or group message</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  requestEmailCompose();
                  setIsQuickActionsOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50"
              >
                <MailPlus className="h-4 w-4 text-brand-600" />
                <span>
                  <span className="block text-xs font-semibold">New email</span>
                  <span className="block text-[10px] text-slate-500">Open the email composer</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('channels');
                  setIsCreateChannelOpen(true);
                  setIsQuickActionsOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50"
              >
                <Hash className="h-4 w-4 text-brand-600" />
                <span>
                  <span className="block text-xs font-semibold">New channel</span>
                  <span className="block text-[10px] text-slate-500">Create a workspace channel</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('calendar');
                  setIsAddEventOpen(true);
                  setIsQuickActionsOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50"
              >
                <CalendarPlus className="h-4 w-4 text-brand-600" />
                <span>
                  <span className="block text-xs font-semibold">New event</span>
                  <span className="block text-[10px] text-slate-500">Add an item to the calendar</span>
                </span>
              </button>
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
                  ? 'bg-brand-500'
                  : currentUser.status === 'busy'
                  ? 'bg-rose-500'
                  : currentUser.status === 'away'
                  ? 'bg-brand-500'
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
