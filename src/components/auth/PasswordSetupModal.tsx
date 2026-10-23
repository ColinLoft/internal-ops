import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const PasswordSetupModal: React.FC = () => {
  const { setPassword } = useWorkspace();
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const result = await setPassword(password);
      if (!result.success) setError(result.message || 'Unable to update your password.');
    } catch {
      setError('Unable to update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Set your password</h2>
          <p className="mt-1 text-xs text-slate-500">Choose a password for future sign-ins.</p>
        </div>

        <label className="block text-xs font-semibold text-slate-700">
          Password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
          />
        </label>

        <label className="block text-xs font-semibold text-slate-700">
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
          />
        </label>

        {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save password'}
        </button>
      </form>
    </div>
  );
};