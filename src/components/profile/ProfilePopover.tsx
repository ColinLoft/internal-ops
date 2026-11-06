import React from 'react';
import {
  Clock3,
  LogOut,
  Settings,
  UserRound,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const ProfilePopover: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    currentUser,
    setIsProfileSettingsOpen,
    setActiveTab,
    logout,
  } = useWorkspace();

  const openProfile = () => {
    setIsProfileSettingsOpen(true);
    onClose();
  };

  return (
    <div className="w-[min(20rem,calc(100vw-1rem))] md:w-80 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
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
              <span className={`w-2 h-2 rounded-full ${currentUser.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="text-xs text-slate-500 capitalize">{currentUser.status}</span>
              {currentUser.status === 'offline' && currentUser.lastSeen && (
                <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock3 className="h-3 w-3" />{currentUser.lastSeen}
                </span>
              )}
            </div>
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
            setActiveTab('settings');
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span>Settings</span>
        </button>

      </div>

      <div className="p-2 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end">
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
