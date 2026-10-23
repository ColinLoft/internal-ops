import React, { useState } from 'react';
import { Mail, UserCheck, X } from 'lucide-react';

interface InviteReadyModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteData: {
    name: string;
    email: string;
    role: string;
    systemRole: string;
  } | null;
}

export const InviteReadyModal: React.FC<InviteReadyModalProps> = ({
  isOpen,
  onClose,
  inviteData,
}) => {
  if (!isOpen || !inviteData) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Banner */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Employee Registered!</h3>
              <p className="text-emerald-100 text-xs">Supabase invitation sent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-emerald-100 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Credentials Card */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Supabase sent a secure account invitation to <span className="font-bold text-slate-900">{inviteData.name}</span>. They can finish setup using the link in that email.
          </p>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Employee</span>
              <span className="font-bold text-slate-800">{inviteData.name} ({inviteData.role})</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Login Email</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-brand-600" />
                {inviteData.email}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Permissions</span>
              <span className="capitalize font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                {inviteData.systemRole}
              </span>
            </div>

          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onClose}
              className="ml-auto py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
