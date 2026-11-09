import React, { useEffect, useState } from 'react';
import { AccessGate } from '../common/AccessGate';
import { FinancePage } from '../finance/FinancePage';
import { ContentCalendar } from './ContentCalendar';
import { WebsitePage } from './WebsitePage';
import { FormsPage } from '../forms/FormsPage';

const segmentOf = (pathname: string) => pathname.split('/')[2] || 'forms';

export const CompanyPage: React.FC = () => {
  const [segment, setSegment] = useState(() => segmentOf(window.location.pathname));
  useEffect(() => {
    const sync = () => setSegment(segmentOf(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    const renamed: Record<string, string> = { ideas: '/company/forms', prospects: '/company/find-grants', calendar: '/company/marketing' };
    if (!renamed[segment]) return;
    window.history.replaceState({}, '', renamed[segment]);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [segment]);
  useEffect(() => {
    if (segment !== 'contracts') return;
    window.history.replaceState({}, '', '/customers/contracts');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [segment]);

  switch (segment) {
    case 'forms': return <FormsPage />;
    case 'website':
    case 'policies': return <AccessGate app="legal" name="Website"><WebsitePage /></AccessGate>;
    case 'marketing':
    case 'calendar': return (
      <AccessGate app="gtm" name="Marketing">
        <main className="min-w-0 flex-1 overflow-y-auto bg-black">
          <header className="workspace-page-header border-b border-slate-200 bg-white"><h1 className="text-xl font-bold text-slate-900">Marketing</h1></header>
          <div className="mx-auto max-w-7xl p-5 sm:p-8"><ContentCalendar /></div>
        </main>
      </AccessGate>
    );
    case 'grants':
    case 'find-grants':
    case 'prospects':
    case 'resources': return <AccessGate app="finance" name="Grants"><FinancePage /></AccessGate>;
    default: return <FormsPage />;
  }
};
