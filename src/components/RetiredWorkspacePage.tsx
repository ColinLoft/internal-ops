import React from 'react';

export const isRetiredWorkspacePath = (path: string) => /^\/(?:drive|docs|sheets|slides|email|inbox)(?:\/|$)/.test(path);

export const RetiredWorkspacePage: React.FC = () => {
  const email = /^\/(?:email|inbox)(?:\/|$)/.test(window.location.pathname);
  const go = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-white p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-slate-900">{email ? 'Personal email stays with your provider' : 'Documents stay with your document tools'}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {email
          ? 'The personal-email workspace has been retired. Shared operational email remains available for customer support.'
          : 'Drive, Docs, Sheets, and Slides have been retired. Upload documents directly to the work they belong to. Contracts use PDFs, and Forms is now under Company.'}
      </p>
      <p className="mt-3 text-sm text-slate-600">Existing stored records have not been deleted.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => go(email ? '/customers/support' : '/customers/contracts')} className="min-h-11 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">{email ? 'Open customer support' : 'Open contracts'}</button>
        <button type="button" onClick={() => go('/company/forms')} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700">Open Forms</button>
      </div>
    </main>
  );
};
