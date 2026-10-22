import React, { useState } from 'react';
import {
  Hash,
  Volume2,
  Megaphone,
  Lock,
  Plus,
  Search,
  Pin,
  ShieldAlert,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const ChannelList: React.FC = () => {
  const {
    channels,
    activeChannelId,
    setActiveChannelId,
    togglePinChannel,
    setIsCreateChannelOpen,
  } = useWorkspace();

  const [filter, setFilter] = useState<'all' | 'announcements' | 'public'>('all');
  const [search, setSearch] = useState('');

  const filteredChannels = channels.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (filter === 'announcements') {
      return matchesSearch && c.type === 'announcement';
    }
    if (filter === 'public') {
      return matchesSearch && !c.isPrivate && c.type !== 'announcement';
    }
    return matchesSearch;
  });

  const announcementChannels = filteredChannels.filter((c) => c.type === 'announcement');
  const regularChannels = filteredChannels.filter((c) => c.type !== 'announcement');

  const renderChannelItem = (ch: typeof channels[0]) => {
    const isActive = ch.id === activeChannelId;

    return (
      <div
        key={ch.id}
        onClick={() => setActiveChannelId(ch.id)}
        className={`group relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-150 ${
          isActive
            ? 'bg-brand-50/80 border border-brand-200/60 shadow-xs'
            : 'hover:bg-slate-100/70 border border-transparent'
        }`}
      >
        {/* Channel Icon Badge */}
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
            ch.type === 'announcement'
              ? 'bg-amber-100/80 text-amber-700'
              : ch.isPrivate
              ? 'bg-slate-100 text-slate-600'
              : 'bg-brand-100/70 text-brand-700'
          }`}
        >
          {ch.type === 'announcement' ? (
            <Megaphone className="w-5 h-5" />
          ) : ch.isPrivate ? (
            <Lock className="w-4 h-4" />
          ) : (
            <Hash className="w-5 h-5 font-bold" />
          )}
        </div>

        {/* Channel details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4
                className={`text-xs font-bold truncate ${
                  isActive ? 'text-brand-900' : 'text-slate-900'
                }`}
              >
                #{ch.name}
              </h4>
              {ch.type === 'announcement' && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  Broadcast
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">
              {ch.lastPost?.timestamp || '9:00 AM'}
            </span>
          </div>

          <p className="text-xs text-slate-500 truncate mb-1">
            {ch.lastPost ? `${ch.lastPost.senderName}: ${ch.lastPost.text}` : ch.description}
          </p>

          {/* Members count & posting permissions info */}
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
            <span>{ch.members.length} members</span>
            <span>•</span>
            {ch.type === 'announcement' ? (
              <span className="text-amber-600 font-semibold flex items-center gap-0.5">
                <ShieldAlert className="w-2.5 h-2.5" /> Leadership Only
              </span>
            ) : (
              <span>All Staff</span>
            )}
          </div>
        </div>

        {/* Pin button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePinChannel(ch.id);
          }}
          className={`absolute top-2 right-2 p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-white transition-opacity ${
            ch.isPinned ? 'opacity-100 text-brand-600' : 'opacity-0 group-hover:opacity-100'
          }`}
          title={ch.isPinned ? 'Unpin' : 'Pin channel'}
        >
          <Pin className={`w-3 h-3 ${ch.isPinned ? 'fill-brand-600' : ''}`} />
        </button>
      </div>
    );
  };

  return (
    <div className="w-80 h-full bg-white/80 backdrop-blur-xl border-r border-slate-200/80 flex flex-col flex-shrink-0 select-none">
      {/* Top Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Channels</h2>
            <p className="text-[11px] text-slate-500 font-medium">Workspaces & Broadcasts</p>
          </div>
          <button
            onClick={() => setIsCreateChannelOpen(true)}
            className="p-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-600 transition-colors shadow-2xs"
            title="Create New Channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-100/80 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 rounded-xl border border-transparent focus:border-brand-500/40 outline-none transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-xl">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            All ({channels.length})
          </button>
          <button
            onClick={() => setFilter('announcements')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === 'announcements'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📢 Broadcasts
          </button>
          <button
            onClick={() => setFilter('public')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === 'public'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Teams
          </button>
        </div>
      </div>

      {/* Channel Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {/* Announcement Channels Section */}
        {announcementChannels.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-2 mb-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider">
              <Megaphone className="w-3 h-3 text-amber-600" /> Organization Broadcasts
            </div>
            <div className="space-y-1">{announcementChannels.map(renderChannelItem)}</div>
          </div>
        )}

        {/* Regular Channels */}
        <div>
          <div className="px-2 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Discussion Channels
          </div>
          <div className="space-y-1">{regularChannels.map(renderChannelItem)}</div>
        </div>
      </div>
    </div>
  );
};
