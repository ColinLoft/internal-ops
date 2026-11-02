import React from 'react';
import { Lock } from 'lucide-react';
import { useAppAccess } from '../../lib/useAppAccess';

export const AccessGate: React.FC<{ app: string; name: string; children: React.ReactNode }> = ({ app, name, children }) => {
  const { loaded, canView } = useAppAccess(app);
  if (!loaded) return <main className="flex-1" />;
  if (canView) return <>{children}</>;
  return (
    <main className="flex flex-1 items-center justify-center bg-[#f7f9fc] p-8">
      <div className="max-w-sm text-center">
        <Lock className="mx-auto h-8 w-8 text-slate-300" />
        <h1 className="mt-3 text-base font-bold text-slate-900">{name} access required</h1>
        <p className="mt-1 text-xs text-slate-500">Ask a workspace admin to assign you a role with {name} access.</p>
      </div>
    </main>
  );
};
