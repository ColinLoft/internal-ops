import React from 'react';
import {
  Search,
  Volume2,
  VolumeX,
  PhoneCall,
  Video,
  Plus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const TopBar: React.FC = () => {
  const {
    activeTab,
    activeConversationId,
    activeChannelId,
    conversations,
    channels,
    searchQuery,
    setSearchQuery,
    soundEnabled,
    toggleSound,
    callSession,
    startCall,
    setIsNewMessageOpen,
    setIsCreateChannelOpen,
    setIsAddEventOpen,
  } = useWorkspace();

  const currentConv = conversations.find((c) => c.id === activeConversationId);
  const currentChan = channels.find((c) => c.id === activeChannelId);

  const getBreadcrumbTitle = () => {
    if (activeTab === 'messages') {
      return `Messages • ${currentConv?.name || 'All Direct Messages'}`;
    }
    if (activeTab === 'channels') {
      return `Channels • #${currentChan?.name || 'General'}`;
    }
    return 'Calendar • Non-Profit Schedule';
  };

  return (
    <header className="h-16 px-6 bg-white/70 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between z-20 flex-shrink-0 shadow-xs">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center text-sm font-semibold text-slate-800 tracking-tight">
          <span className="text-brand-600 font-bold">Beacon Works</span>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-600 font-medium capitalize">{activeTab}</span>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-900 bg-brand-50 px-2 py-0.5 rounded-md text-xs font-semibold text-brand-700 border border-brand-100/80">
            {activeTab === 'messages' ? currentConv?.name : activeTab === 'channels' ? `#${currentChan?.name}` : 'Schedule'}
          </span>
        </div>
      </div>

      {/* Global Quick Search (matching Screenshot 1 Sage) */}
      <div className="relative w-96 max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search anything... ⌘+S Quick search"
          className="w-full pl-9 pr-14 py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 rounded-xl border border-transparent focus:border-brand-500/50 focus:ring-4 focus:ring-brand-500/10 transition-all outline-none"
        />
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
          <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
            ⌘S
          </kbd>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Sound toggle button */}
        <button
          onClick={toggleSound}
          className={`p-2 rounded-xl border transition-all ${
            soundEnabled
              ? 'text-brand-600 bg-brand-50/70 border-brand-200/60 hover:bg-brand-100/70'
              : 'text-slate-400 bg-slate-100 border-slate-200 hover:bg-slate-200/70'
          }`}
          title={soundEnabled ? 'Notification Chimes Active (Click to mute)' : 'Sounds Muted'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Call quick status if active */}
        {callSession.active && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Call in progress ({Math.floor(callSession.durationSeconds / 60)}:{(callSession.durationSeconds % 60).toString().padStart(2, '0')})</span>
          </div>
        )}

        {/* Quick Add button contextually */}
        {activeTab === 'messages' && (
          <button
            onClick={() => setIsNewMessageOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-brand-500/30 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        )}

        {activeTab === 'channels' && (
          <button
            onClick={() => setIsCreateChannelOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-brand-500/30 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Channel</span>
          </button>
        )}

        {activeTab === 'calendar' && (
          <button
            onClick={() => setIsAddEventOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-brand-500/30 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        )}
      </div>
    </header>
  );
};
