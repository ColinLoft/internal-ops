import React, { useState } from 'react';
import {
  Check,
  LogOut,
  RotateCcw,
  Settings,
  UserRound,
  UserPlus,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { UserStatus } from '../../types';

export const ProfilePopover: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    currentUser,
    users,
    updateCurrentUser,
    setIsProfileSettingsOpen,
    setIsWorkspaceSettingsOpen,
    setIsAddTeammateOpen,
    resetWorkspace,
    logout,
  } = useWorkspace();

  const [statusMsgText, setStatusMsgText] = useState(currentUser.statusMessage || '');
  const [isStatusSaved, setIsStatusSaved] = useState(false);

  const statuses: { label: string; value: UserStatus; color: string }[] = [
    { label: 'Online', value: 'online', color: 'bg-emerald-500' },
    { label: 'Busy', value: 'busy', color: 'bg-rose-500' },
    { label: 'Away', value: 'away', color: 'bg-amber-500' },
    { label: 'Offline', value: 'offline', color: 'bg-slate-400' },
  ];
  const currentStatus = statuses.find((status) => status.value === currentUser.status) || statuses[3];

  const saveStatusMessage = () => {
    updateCurrentUser({ statusMessage: statusMsgText.trim() });
    setIsStatusSaved(true);
    window.setTimeout(() => setIsStatusSaved(false), 1500);
  };

  const openProfile = () => {
    setIsProfileSettingsOpen(true);
    onClose();
  };

  return (
    <div className="w-80 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm"
          />
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-slate-900 truncate">{currentUser.name}</h4>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${currentStatus.color}`} />
              <select
                aria-label="Availability status"
                value={currentUser.status}
                onChange={(event) => updateCurrentUser({ status: event.target.value as UserStatus })}
                className="text-xs text-slate-500 bg-transparent outline-none cursor-pointer"
              >
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="profile-status-message" className="sr-only">Update your status message</label>
          <div className="flex items-center gap-2">
            <input
              id="profile-status-message"
              type="text"
              value={statusMsgText}
              maxLength={80}
              onChange={(event) => setStatusMsgText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveStatusMessage();
                }
              }}
              placeholder="Set a status message"
              className="min-w-0 flex-1 px-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-brand-400 focus:bg-white"
            />
            <button
              type="button"
              onClick={saveStatusMessage}
              className="p-2 text-brand-600 hover:bg-brand-50 rounded-xl transition-colors"
              aria-label="Save status message"
              title={isStatusSaved ? 'Status saved' : 'Save status'}
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-2 space-y-1">
        <button
          onClick={openProfile}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
        >
          <UserRound className="w-4 h-4 text-slate-500" />
          <span>Profile</span>
        </button>
        <button
          onClick={() => {
            setIsWorkspaceSettingsOpen(true);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span>Settings</span>
        </button>

        <button
          onClick={() => {
            setIsAddTeammateOpen(true);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-xl transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Teammate / Colleague</span>
        </button>

        {users.length > 1 && (
          <div className="pt-2 border-t border-slate-200/70">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3" /> Switch Staff Account
            </div>
            <div className="flex items-center gap-1.5 px-1 py-1 overflow-x-auto">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    updateCurrentUser({
                      id: user.id,
                      name: user.name,
                      role: user.role,
                      email: user.email,
                      avatar: user.avatar,
                      phone: user.phone,
                      department: user.department,
                      systemRole: user.systemRole,
                      status: user.status,
                      statusMessage: user.statusMessage,
                      bio: user.bio,
                      location: user.location,
                      banner: user.banner,
                      preferences: user.preferences,
                    });
                    onClose();
                  }}
                  className={`p-1 rounded-lg border transition-all ${
                    currentUser.id === user.id
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  title={`Switch to ${user.name} (${user.role})`}
                >
                  <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-2 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <button
          onClick={() => {
            if (window.confirm('Reset workspace data back to fresh empty slate? All custom messages and events will be cleared.')) {
              resetWorkspace();
            }
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 rounded-lg transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Data</span>
        </button>
        <button
          onClick={() => {
            logout();
            onClose();
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
