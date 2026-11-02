import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { GrantDetail } from './GrantDetail';
import { GrantsPage } from './GrantsPage';
import { GrantAutomation, GrantReports, GrantsOverview } from './GrantsViews';
import { ProspectsPage } from './ProspectsPage';
import { ResourcesPage } from './ResourcesPage';

const parsePath = (pathname: string) => {
  const [, , seg = '', id = ''] = pathname.split('/');
  return { view: seg, id };
};

export const FinancePage: React.FC = () => {
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  useEffect(() => {
    const sync = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => { void supabase.rpc('grant_run_automations'); }, []);
  switch (route.view) {
    case 'grants': return route.id ? <GrantDetail key={route.id} grantId={route.id} /> : <GrantsPage />;
    case 'prospects': return <ProspectsPage />;
    case 'resources': return <ResourcesPage />;
    case 'reports': return <GrantReports />;
    case 'automation': return <GrantAutomation />;
    default: return <GrantsOverview />;
  }
};
