import { userFacingError } from '../../lib/userFacingError';
import React, { useState } from 'react';
import {
  Mail,
  Key,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const AuthScreen: React.FC = () => {
  const { login, backendIssue } = useWorkspace();

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
    <div className="min-h-dvh w-full flex flex-col items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 text-white">
          <img src="/flown-logo.png" alt="Flown" className="h-12 w-auto object-contain brightness-0 invert mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">Flown Operations</h1>
          <p className="text-sm text-slate-500 mt-2">Our people, products, and systems.</p>

        </div>

        {/* Form Body */}
        <div className="p-6">
          <div className="mb-5 text-center">
            <h3 className="text-base font-bold text-slate-900">Staff Portal Sign In</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Sign in with your Flown staff account.
            </p>
          </div>

          {(error || backendIssue) && (
            <div className="p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{userFacingError(error || backendIssue)}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="flown-email" className="block text-sm font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  id="flown-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your Flown email"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-base bg-slate-50 focus:bg-white rounded-lg border border-slate-200 focus:border-brand-500 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="flown-password" className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
              </div>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  id="flown-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password or invite code"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-base bg-slate-50 focus:bg-white rounded-lg border border-slate-200 focus:border-brand-500 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : 'Sign in to Flown Ops'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
