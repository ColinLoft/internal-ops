import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { userFacingError } from '../../lib/userFacingError';
import './auth-screen.css';

export const AuthScreen: React.FC = () => {
  const { login, backendIssue } = useWorkspace();
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (step === 'email') {
      setEmail(email.trim());
      setStep('password');
      return;
    }

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

  const changeEmail = () => {
    setError('');
    setPassword('');
    setStep('email');
  };

  return (
    <main className="auth-screen">
      <div className="auth-content">
        <header className="auth-header">
          <img src="/flown-logo.png" alt="Flown" className="auth-logo" />
        </header>

        <div className="auth-form-wrap">
          <div className="auth-form">
            <h1>Sign in to Flown</h1>
            <p className="auth-intro">Sign in with your staff account.</p>

            {(error || backendIssue) && (
              <div className="auth-error" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{userFacingError(error || backendIssue)}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {step === 'email' ? (
                <div className="auth-field">
                  <label htmlFor="flown-email">Email address</label>
                  <input
                    id="flown-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@flown.org"
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <input type="hidden" name="email" autoComplete="username" value={email} />
                  <div className="auth-account">
                    <span>{email}</span>
                    <button type="button" onClick={changeEmail} disabled={loading}>Change</button>
                  </div>
                  <div className="auth-field">
                    <label htmlFor="flown-password">Password or invite code</label>
                    <input
                      id="flown-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </>
              )}
              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : step === 'email' ? 'Continue' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        <footer className="auth-help">
          Need help? <a href="mailto:team@flown.org">team@flown.org</a>
        </footer>
      </div>

      <div className="auth-landscape" aria-hidden="true" />
    </main>
  );
};
