import React, { useState, useRef, useEffect } from 'react';
import {
  CalendarRange, CheckSquare,
  MessageSquare,
  Hash,
  Calendar as CalendarIcon,
  Mail,
  CirclePlus,
  MessageSquarePlus,
  MailPlus,
  CalendarPlus,
  HardDrive,
  FileText,
  ClipboardList,
  House,
  ContactRound,
  Building2,
  ListChecks,
  BookOpen,
  BarChart3,
  Users,
  ShieldCheck,
  CheckCircle2,
  Landmark,
  Target,
  WalletCards,
  Receipt,
  CreditCard,
  BriefcaseBusiness,
  FolderKanban,
  Network,
  Code2,
  Megaphone,
  Gauge,
  AlertTriangle,
  Layers3,
  FileCheck2,
  GitBranch,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ProfilePopover } from '../profile/ProfilePopover';

interface RailButtonProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  selected?: boolean;
  onClick: () => void;
  badge?: number;
  onboardingTarget?: string;
}

const RailButton: React.FC<RailButtonProps> = ({ label, icon: Icon, selected = false, onClick, badge = 0, onboardingTarget }) => (
  <button
    type="button"
    onClick={onClick}
    data-onboarding-target={onboardingTarget}
    aria-current={selected ? 'page' : undefined}
    className={`group relative flex items-center justify-center rounded-2xl p-3 transition-colors ${selected ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'}`}
  >
    <Icon className="h-5 w-5 shrink-0" />
    {badge > 0 && (
      <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-slate-900 bg-rose-500 px-1 text-xs font-bold leading-none text-white">
        <span className="sr-only">{badge} unread, </span>{badge}
      </span>
    )}
    <span className="sr-only">{label}</span>
    <span aria-hidden="true" className="pointer-events-none absolute left-[62px] z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{label}</span>
  </button>
);

interface RailProps {
  isMobileOpen?: boolean;
}

export const Rail: React.FC<RailProps> = ({ isMobileOpen = false }) => {
  const {
    activeTab,
    setActiveTab,
    conversations,
    currentUser,
    setIsNewMessageOpen,
    setIsCreateChannelOpen,
    setIsAddEventOpen,
    requestEmailCompose,
  } = useWorkspace();

  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Calculate unread totals
  const totalUnreadMessages = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const isDrive = activeTab === 'drive';
  const isCustomers = activeTab === 'customers';
  const isFinance = activeTab === 'finance';
  const isOperations = activeTab === 'operations';
  const isLegal = activeTab === 'legal';
  const isEngineering = activeTab === 'engineering';
  const isInsights = activeTab === 'insights';
  const isOrganization = activeTab === 'organization';
  const isPrograms = activeTab === 'programs';
  const isGtm = activeTab === 'gtm';

  const openInsightsSection = (section: string) => {
    const path = section === 'executive' ? '/insights' : `/insights/${section}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

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
  useEffect(() => {
    const handleRoute = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  return (
    <aside
      aria-label="Primary navigation"
      className={`fixed inset-y-0 left-0 z-50 h-dvh w-[72px] shrink-0 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800/80 flex flex-col items-center py-4 justify-between select-none shadow-2xl transition-transform duration-200 md:static md:z-30 md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Top Brand Logo */}
      <div className="flex flex-col items-center gap-6">
        <div 
          onClick={() => {
            if (isDrive) {
              openDriveView('all');
              return;
            }
            setActiveTab('home');
            if (window.location.pathname !== '/home') window.history.pushState({}, '', '/home');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="group relative cursor-pointer w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 transition-transform hover:scale-105 active:scale-95"
          title="Flown Workspace"
        >
          <img src="/brand-icon.png" alt="Flown Workspace" className="w-6 h-6 object-contain group-hover:rotate-12 transition-transform duration-300" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand-400 border-2 border-slate-900 rounded-full" />
        </div>

        {/* Navigation Item Tabs */}
        <nav className="flex flex-col items-center gap-2">
          {isPrograms ? (
            <>
              {[
              { label: 'Projects', icon: FolderKanban, section: 'projects' },
              { label: 'Tasks', icon: CheckSquare, section: 'tasks' },
              ].map((item) => { const Icon = item.icon; const path = item.section === 'projects' ? '/programs' : '/programs/tasks'; const selected = item.section === 'tasks' ? routePath.startsWith('/programs/tasks') : !routePath.startsWith('/programs/tasks'); return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => { if (routePath !== path) window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}
            </>
          ) : isOrganization ? (
            <>{[
              { label: 'Directory', icon: Users, section: 'people' },
              { label: 'Organizational Chart', icon: Network, section: 'overview' },
              { label: 'Departments', icon: Building2, section: 'departments' },
              { label: 'Positions & Roles', icon: BriefcaseBusiness, section: 'positions' },
              { label: 'Onboarding', icon: ClipboardList, section: 'onboarding' },
              { label: 'Personnel Records', icon: FileText, section: 'records' },
            ].map((item) => { const Icon = item.icon; const path = `/organization/${item.section}`; const selected = routePath === path || (item.section === 'people' && routePath === '/organization'); return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => { if (window.location.pathname !== path) window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : isInsights ? (
            <>{[
              { label: 'Executive Overview', icon: House, section: 'executive' },
              { label: 'Projects & Tasks', icon: FolderKanban, section: 'programs' },
              { label: 'Financial Reports', icon: Landmark, section: 'financial' },
              { label: 'Departments', icon: Users, section: 'projects' },
              { label: 'Activity & Usage', icon: BarChart3, section: 'custom' },
            ].map((item) => { const Icon = item.icon; const selected = (window.location.pathname.split('/')[2] || 'executive') === item.section; return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => openInsightsSection(item.section)} />; })}</>
          ) : isCustomers ? (
            <>{[
              { label: 'Overview', icon: House, path: '/customers' },
              { label: 'Contacts', icon: ContactRound, path: '/customers/contacts' },
              { label: 'Organizations', icon: Building2, path: '/customers/organizations' },
              { label: 'Interactions', icon: ListChecks, path: '/customers/activity' },
            ].map((item) => { const Icon = item.icon; return <RailButton key={item.label} label={item.label} icon={Icon} selected={routePath === item.path} onClick={() => { window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : isFinance ? (
            <>{[
              { label: 'Overview', icon: House, path: '/finance' },
              { label: 'Budgets', icon: WalletCards, path: '/finance/budgets' },
              { label: 'Grants', icon: Landmark, path: '/finance/grants' },
              { label: 'Funding Requests', icon: Target, path: '/finance/funding-requests' },
              { label: 'Expenses', icon: Receipt, path: '/finance/expenses' },
              { label: 'Procurement', icon: CreditCard, path: '/finance/procurement' },
              { label: 'Accounting & Reports', icon: BarChart3, path: '/finance/accounting-reports' },
            ].map((item) => { const Icon = item.icon; return <RailButton key={item.label} label={item.label} icon={Icon} selected={routePath === item.path} onClick={() => { window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : isGtm ? (
            <>{[
              { label: 'Overview', path: '/gtm', icon: House },
              { label: 'Marketing', path: '/gtm/marketing', icon: Target },
              { label: 'Content Calendar', path: '/gtm/calendar', icon: CalendarIcon },
              { label: 'Communications', path: '/gtm/communications', icon: Megaphone },
              { label: 'Brand Management', path: '/gtm/brand', icon: Network },
              { label: 'Media & Content', path: '/gtm/content', icon: FileText },
              { label: 'Partnerships', path: '/gtm/partnerships', icon: Users },
              { label: 'Business Development', path: '/gtm/business-development', icon: BriefcaseBusiness },
            ].map((item) => { const Icon = item.icon; const selected = routePath === item.path; return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => { if (routePath !== item.path) window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : isOperations ? (
            <>{[
              { label: 'Overview', path: '/operations', icon: House },
              { label: 'Administration', path: '/operations/administration', icon: ListChecks },
              { label: 'People Operations', path: '/operations/people', icon: Users },
              { label: 'Policies & Procedures', path: '/operations/policies', icon: BookOpen },
              { label: 'Resource Coordination', path: '/operations/resources', icon: BriefcaseBusiness },
              { label: 'Internal Workflows', path: '/operations/workflows', icon: CheckCircle2 },
            ].map((item) => { const Icon = item.icon; const selected = routePath === item.path; return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => { if (routePath !== item.path) window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : isEngineering ? (
            <>{[
              { label: 'Overview', path: '/engineering', icon: House },
              { label: 'Products & Systems', path: '/engineering/products', icon: Layers3 },
              { label: 'Requirements', path: '/engineering/requirements', icon: FileCheck2 },
              { label: 'Design Documentation', path: '/engineering/design', icon: BookOpen },
              { label: 'CAD & PCB Records', path: '/engineering/cad-pcb', icon: Code2 },
              { label: 'Testing & Validation', path: '/engineering/testing', icon: CheckCircle2 },
              { label: 'Engineering Changes', path: '/engineering/changes', icon: GitBranch },
              { label: 'Technical Reviews', path: '/engineering/reviews', icon: ShieldCheck },
            ].map((item) => { const Icon = item.icon; const selected = routePath === item.path; return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => { if (routePath !== item.path) window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : isLegal ? (
            <>{[
              { label: 'Overview', path: '/legal', icon: House },
              { label: 'Contracts & Agreements', path: '/legal/contracts', icon: FileText },
              { label: 'Compliance', path: '/legal/compliance', icon: ShieldCheck },
              { label: 'Risk Management', path: '/legal/risk', icon: AlertTriangle },
              { label: 'Policies', path: '/legal/policies', icon: BookOpen },
              { label: 'Legal Records', path: '/legal/records', icon: ClipboardList },
            ].map((item) => { const Icon = item.icon; const selected = routePath === item.path; return <RailButton key={item.label} label={item.label} icon={Icon} selected={selected} onClick={() => { if (routePath !== item.path) window.history.pushState({}, '', item.path); window.dispatchEvent(new PopStateEvent('popstate')); }} />; })}</>
          ) : (
          <>
          <RailButton label="Home" icon={House} selected={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <RailButton label="Drive" icon={HardDrive} selected={isDrive} onClick={() => setActiveTab('drive')} />
          <RailButton
            label="Messages"
            icon={MessageSquare}
            selected={activeTab === 'messages' || activeTab === 'channels'}
            badge={totalUnreadMessages}
            onboardingTarget="nav-messages"
            onClick={() => setActiveTab('messages')}
          />
          <RailButton label="Calendar" icon={CalendarIcon} selected={activeTab === 'calendar'} onboardingTarget="nav-calendar" onClick={() => setActiveTab('calendar')} />
          <RailButton label="Email" icon={Mail} selected={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} />
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
            <span className="absolute left-[78px] z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none">
              Create
            </span>
          </button>

          {isQuickActionsOpen && (
            <div className="absolute bottom-0 left-[64px] z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2 text-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-150" aria-label="Quick create">
              <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">Quick create</p>
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
                  <span className="block text-xs text-slate-500">Start a direct or group message</span>
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
                  <span className="block text-xs text-slate-500">Open the email composer</span>
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
                  <span className="block text-xs text-slate-500">Create a workspace channel</span>
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
                  <span className="block text-xs text-slate-500">Add an item to the calendar</span>
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
            <span className="absolute left-[78px] bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity whitespace-nowrap z-50">
              {currentUser.name} Status &amp; Profile
            </span>
          </button>

          {isProfilePopoverOpen && (
            <div className="absolute left-[78px] bottom-0 z-50">
              <ProfilePopover onClose={() => setIsProfilePopoverOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
