import React, { useState } from 'react';
import { X, Search, Check, Hash, Lock, MessageSquarePlus, Users } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const NewMessageModal: React.FC = () => {
  const {
    isNewMessageOpen,
    setIsNewMessageOpen,
    users,
    channels,
    currentUser,
    createConversation,
    setActiveChannelId,
    setActiveTab,
    setIsCreateChannelOpen,
  } = useWorkspace();

  const [target, setTarget] = useState<'people' | 'channels'>('people');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');

  if (!isNewMessageOpen) return null;

  const otherUsers = users.filter((u) => u.id !== currentUser.id);
  const filteredUsers = otherUsers.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );
  const visibleChannels = channels.filter((channel) =>
    !channel.isPrivate
    || channel.members.includes(currentUser.id)
    || channel.createdBy === currentUser.id
    || currentUser.systemRole === 'admin'
    || currentUser.systemRole === 'coordinator'
  ).filter((channel) =>
    channel.name.toLowerCase().includes(search.toLowerCase())
    || channel.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter((uid) => uid !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleStartChat = () => {
    if (selectedUserIds.length === 0) return;

    const isGroup = selectedUserIds.length > 1;
    createConversation(selectedUserIds, groupName.trim() || undefined, isGroup);
    setIsNewMessageOpen(false);
    setSelectedUserIds([]);
    setGroupName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 md:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-elevated border border-slate-200/80 w-full max-w-md overflow-y-auto md:overflow-hidden max-h-[calc(100dvh-1rem)] md:max-h-none animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">New message</h3>
              <p className="text-[11px] text-slate-500 font-normal">Start a direct message or open a channel</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewMessageOpen(false)}
            aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {([
              ['people', Users, 'People'],
              ['channels', Hash, 'Channels'],
            ] as const).map(([id, Icon, text]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setTarget(id); setSearch(''); }}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  target === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {text}
              </button>
            ))}
          </div>

          {/* Group Name input if more than 1 selected */}
          {target === 'people' && selectedUserIds.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Group Chat Name
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Outreach Taskforce"
                className="w-full px-3 py-2 text-base md:text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          )}

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={target === 'people' ? 'Search staff by name or role...' : 'Search channels...'}
              className="w-full pl-8 pr-3 py-2 text-base md:text-xs bg-slate-100 focus:bg-white rounded-xl border border-transparent focus:border-brand-500/50 outline-none transition-all"
            />
          </div>

          {/* User selector list */}
          {target === 'people' && (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {filteredUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => toggleSelect(u.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-2.5 transition-all ${
                      isSelected ? 'border-brand-200/80 bg-brand-50/80' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative shrink-0">
                        <img src={u.avatar} alt={u.name} className="h-9 w-9 rounded-xl object-cover" />
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${u.status === 'online' ? 'bg-brand-500' : 'bg-slate-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <h5 className="truncate text-xs font-bold text-slate-800">{u.name}</h5>
                        <p className="truncate text-xs text-slate-400">{u.role}</p>
                      </div>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-lg border ${isSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {target === 'channels' && (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {visibleChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setActiveChannelId(channel.id);
                    setActiveTab('channels');
                    setIsNewMessageOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    {channel.isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">#{channel.name}</span>
                    <span className="block truncate text-xs text-slate-500">{channel.description}</span>
                  </span>
                </button>
              ))}
              {visibleChannels.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-500">No channels found.</p>}
              <button
                type="button"
                onClick={() => {
                  setIsNewMessageOpen(false);
                  setIsCreateChannelOpen(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-brand-700 hover:bg-brand-50"
              >
                + Create a channel
              </button>
            </div>
          )}
          {target === 'people' && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs font-medium text-slate-500">
                {selectedUserIds.length} recipient{selectedUserIds.length === 1 ? '' : 's'} selected
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsNewMessageOpen(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100">
                  Cancel
                </button>
                <button type="button" onClick={handleStartChat} disabled={selectedUserIds.length === 0} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/25 transition-all hover:bg-brand-700 disabled:opacity-40">
                  Start Conversation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
