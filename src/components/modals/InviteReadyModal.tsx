import React, { useState } from 'react';
import { Check, Copy, Key, Mail, ShieldCheck, UserCheck, X } from 'lucide-react';

interface InviteReadyModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteData: {
    name: string;
    email: string;
    role: string;
    tempPassword: string;
    systemRole: string;
  } | null;
}

export const InviteReadyModal: React.FC<InviteReadyModalProps> = ({
  isOpen,
  onClose,
  inviteData,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !inviteData) return null;

  const inviteText = `Welcome to Beacon Nonprofit Workspace!
Your staff account has been created by an administrator:

• Name: ${inviteData.name}
• Email: ${inviteData.email}
• Role: ${inviteData.role}
• Temporary Password: ${inviteData.tempPassword}

Please log in and you will be prompted to choose your own secure password upon your first sign in.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              <p className="text-emerald-100 text-xs">Invite credentials ready for delivery</p>
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
            <span className="font-bold text-slate-900">{inviteData.name}</span> has been invited to the workspace. Share the temporary password below. When they log in, they will be required to set their own permanent password.
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

            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-600" />
                  Temporary Password
                </span>
                <span className="font-mono font-bold text-sm bg-amber-50 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200 select-all">
                  {inviteData.tempPassword}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/25 transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Invitation Details'}</span>
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
