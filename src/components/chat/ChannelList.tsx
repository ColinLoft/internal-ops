import React, { useState } from 'react';
import {
  Hash,
  Lock,
  Plus,
  Search,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const ChannelList: React.FC = () => {
  const {
    channels,
    activeChannelId,
    setActiveChannelId,
    setIsCreateChannelOpen,
  } = useWorkspace();

  const [search, setSearch] = useState('');

  const filteredChannels = channels.filter((c) => {
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

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
            ch.isPrivate ? 'bg-slate-100 text-slate-600' : 'bg-brand-100/70 text-brand-700'
          }`}
        >
          {ch.isPrivate ? (
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
            </div>
            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">
              {ch.lastPost?.timestamp || '9:00 AM'}
            </span>
          </div>

          <p className="text-xs text-slate-500 truncate mb-1">
            {ch.lastPost ? `${ch.lastPost.senderName}: ${ch.lastPost.text}` : ch.description}
          </p>

          {/* Members */}
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
            <span>{ch.members.length} members</span>
          </div>
        </div>

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
            <p className="text-[11px] text-slate-500 font-medium">All channels</p>
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

      </div>

      {/* Channel Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-1">{filteredChannels.map(renderChannelItem)}</div>
      </div>
    </div>
  );
};
