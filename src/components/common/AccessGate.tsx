import { userFacingError } from '../../lib/userFacingError';
import React from 'react';
import { Lock } from 'lucide-react';
import { useAppAccess } from '../../lib/useAppAccess';
import { TableSkeleton } from './Feedback';

export const AccessGate: React.FC<{ app: string; name: string; children: React.ReactNode }> = ({ app, name, children }) => {
  const { loaded, canView, error, retry } = useAppAccess(app);
  if (error) return <main className="flex-1 bg-black p-6"><p role="alert" className="text-sm text-slate-400">{userFacingError(error)}</p><button type="button" onClick={retry} className="mt-3 text-brand-500 underline">Retry access check</button></main>;
  if (!loaded) return <main className="flex-1 bg-black p-6"><TableSkeleton /></main>;
  if (canView) return <>{children}</>;
  return (
    <main className="flex flex-1 items-center justify-center bg-black p-8">
      <div className="max-w-sm text-center">
        <Lock className="mx-auto h-8 w-8 text-slate-300" />
        <h1 className="mt-3 text-base font-bold text-slate-900">{name} access required</h1>
        <p className="mt-1 text-xs text-slate-500">Ask a Flown Ops Admin if you need access to this area.</p>
      </div>
    </main>
  );
};
