import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const BackendStatusBanner: React.FC = () => {
  const { backendIssue, dismissBackendIssue } = useWorkspace();
  if (!backendIssue) return null;
  return (
    <div role="status" className="flex items-start gap-3 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-6">{backendIssue}</p>
      <button type="button" onClick={dismissBackendIssue} aria-label="Dismiss" className="rounded-md p-1 text-amber-200 hover:bg-amber-500/20">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
