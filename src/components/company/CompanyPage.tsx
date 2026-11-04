import React, { useEffect, useState } from 'react';
import { AccessGate } from '../common/AccessGate';
import { FinancePage } from '../finance/FinancePage';
import { ContentCalendar } from './ContentCalendar';
import { ContractsPoliciesPage } from './ContractsPoliciesPage';
import { IdeasPage } from './IdeasPage';

const segmentOf = (pathname: string) => pathname.split('/')[2] || 'ideas';

export const CompanyPage: React.FC = () => {
  const [segment, setSegment] = useState(() => segmentOf(window.location.pathname));
  useEffect(() => {
    const sync = () => setSegment(segmentOf(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  switch (segment) {
    case 'contracts': return <AccessGate app="legal" name="Legal"><ContractsPoliciesPage kind="contracts" /></AccessGate>;
    case 'policies': return <AccessGate app="legal" name="Legal"><ContractsPoliciesPage kind="policies" /></AccessGate>;
    case 'calendar': return (
      <AccessGate app="gtm" name="Marketing">
        <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
          <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><h1 className="text-xl font-bold text-slate-900">Content Calendar</h1><p className="mt-1 text-xs text-slate-500">Plan, review and schedule posts across every channel.</p></header>
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
