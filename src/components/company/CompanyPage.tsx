import React, { useEffect, useState } from 'react';
import { AccessGate } from '../common/AccessGate';
import { FinancePage } from '../finance/FinancePage';
import { ContentCalendar } from './ContentCalendar';
import { WebsitePage } from './WebsitePage';
import { IdeasPage } from './IdeasPage';
import { FormsPage } from '../forms/FormsPage';

const segmentOf = (pathname: string) => pathname.split('/')[2] || 'ideas';

export const CompanyPage: React.FC = () => {
  const [segment, setSegment] = useState(() => segmentOf(window.location.pathname));
  useEffect(() => {
    const sync = () => setSegment(segmentOf(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (segment !== 'contracts') return;
    window.history.replaceState({}, '', '/customers/contracts');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [segment]);

  switch (segment) {
    case 'forms': return <FormsPage />;
    case 'website':
    case 'policies': return <AccessGate app="legal" name="Website"><WebsitePage /></AccessGate>;
    case 'calendar': return (
      <AccessGate app="gtm" name="Marketing">
        <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
          <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><h1 className="text-xl font-bold text-slate-900">Marketing</h1><p className="mt-1 text-xs text-slate-500">Plan campaigns, create and review social content, schedule posts, and track published results.</p></header>
          <div className="mx-auto max-w-7xl p-5 sm:p-8"><ContentCalendar /></div>
        </main>
      </AccessGate>
    );
    case 'grants':
    case 'prospects':
    case 'resources': return <AccessGate app="finance" name="Grants"><FinancePage /></AccessGate>;
    default: return <IdeasPage />;
  }
};
