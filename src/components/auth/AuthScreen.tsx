import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Key,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const AuthScreen: React.FC = () => {
  const { login } = useWorkspace();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setError(result.message || 'Invalid email or password.');
      }
    } catch {
      setError('An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-sky-50/70 to-blue-50/90 p-4 select-none relative overflow-hidden">
      {/* Decorative ambient glowing orbs in brand blue */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassy Card */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Brand Banner */}
        <div className="bg-gradient-to-r from-brand-600 via-brand-700 to-brand-800 p-6 text-white text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-black/10">
            <img src="/brand-icon.png" alt="Season Report" className="w-8 h-8 object-contain" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Season Report</h2>
          <p className="text-brand-100 text-xs mt-1">Season Report's Operation Platform</p>

        </div>

        {/* Form Body */}
        <div className="p-6">
          <div className="mb-5 text-center">
            <h3 className="text-base font-bold text-slate-900">Staff Portal Sign In</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Sign in with your email and password for operation account.
            </p>
          </div>

          {error && (
            <div className="p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="firstname@seasonreport.org"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
              </div>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password or invite code"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
                />
              </div>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2 group active:scale-95 disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
