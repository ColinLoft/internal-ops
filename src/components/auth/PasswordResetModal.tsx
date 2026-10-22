import React, { useState } from 'react';
import { KeyRound, ShieldAlert, Check, Eye, EyeOff, Lock } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const PasswordResetModal: React.FC = () => {
  const { pendingResetUser, completePasswordReset } = useWorkspace();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (!pendingResetUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    completePasswordReset(newPassword);
  };

  // Password strength calc
  const getStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = getStrength(newPassword);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mx-auto mb-3 shadow-lg">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-lg font-bold">First-Time Sign In Setup</h3>
          <p className="text-brand-100 text-xs mt-1">
            Welcome, {pendingResetUser.name}! Please set your personal password.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              Your account was created by an organization administrator with a temporary passcode. Please choose a new permanent password to secure your account.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Personal Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                className="w-full pl-3 pr-10 py-2.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength meter */}
            {newPassword.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 px-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden flex gap-1">
                  <div
                    className={`h-full flex-1 rounded-full transition-all ${
                      strength >= 1 ? 'bg-rose-500' : 'bg-transparent'
                    }`}
                  />
                  <div
                    className={`h-full flex-1 rounded-full transition-all ${
                      strength >= 2 ? 'bg-amber-500' : 'bg-transparent'
                    }`}
                  />
                  <div
                    className={`h-full flex-1 rounded-full transition-all ${
                      strength >= 3 ? 'bg-emerald-500' : 'bg-transparent'
                    }`}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {strength <= 1 ? 'Weak' : strength === 2 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                className="w-full pl-3 pr-10 py-2.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>Save Password & Enter Workspace</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
