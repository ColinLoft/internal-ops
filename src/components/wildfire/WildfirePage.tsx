import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Flame } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';
import { supabase } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';
import { TableSkeleton } from '../common/Feedback';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { Catalog } from './Catalog';
import { Prospects, type ProspectValues } from './Prospects';
import { Planner } from './Planner';
import { Quotes } from './Quotes';
import { Deployments } from './Deployments';
import { displayStage, secondary, surface, type Opportunity, type Property, type Placement, type SitePlan, type Organization, type Product } from './model';

const pages: Record<string, { title: string; description: string }> = {
  opportunities: { title: 'Opportunities', description: 'Find potential customers, research fit, and prepare outreach before adding them to the CRM.' },
  'site-planner': { title: 'Site planner', description: 'Locate a site, plan equipment on a terrain map, and turn your design into a quote.' },
  quotes: { title: 'Quotes and proposals', description: 'Price planned equipment, describe the scope, and send a customer acceptance link.' },
  deployments: { title: 'Deployments', description: 'Track delivery from accepted quote to customer handoff.' },
  catalog: { title: 'Product catalog', description: 'Manage Wildfire products, services, specifications, and pricing.' },
  alerts: { title: 'System alerts', description: 'Equipment health and telemetry faults, separate from customer support.' },
};
export function wildfireRoute(path: string) {
  const segment = path.split('/')[2];
  if (segment === 'proposals') return 'quotes';
  return segment in pages ? segment : 'opportunities';
}
const navigate = (path: string) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
export function WildfirePage() {
  const { currentUser } = useWorkspace();
  const { level, loaded, error: accessError, retry: retryAccess } = useAppAccess('wildfire');
  const [route, setRoute] = useState(() => wildfireRoute(window.location.pathname));
  const [products, setProducts] = useState<Product[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [plans, setPlans] = useState<SitePlan[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [alerts, setAlerts] = useState<{ id: string; severity: string; status: string; summary: string; last_detected_at: string }[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  useEffect(() => {
    const sync = () => setRoute(wildfireRoute(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const refresh = useCallback(async () => {
    if (!loaded || level < 1) return;
    const version = ++loadVersion.current;
    try {
      const skip = () => Promise.resolve({ data: [], error: null });
      const results = await Promise.all([
        ['catalog', 'quotes', 'site-planner'].includes(route) ? supabase.from('wildfire_products').select('*').order('name') : skip(),
        ['opportunities', 'quotes', 'site-planner'].includes(route) ? supabase.from('wildfire_opportunities').select('*').order('updated_at', { ascending: false }) : skip(),
        ['opportunities', 'deployments'].includes(route) ? supabase.from('crm_organizations').select('id,name,category').order('name') : skip(),
        ['site-planner', 'deployments'].includes(route) ? supabase.from('wildfire_properties').select('*').order('label') : skip(),
        route === 'site-planner' ? supabase.from('wildfire_site_plans').select('*').order('version', { ascending: false }) : skip(),
        route === 'site-planner' ? supabase.from('wildfire_site_placements').select('*').order('created_at') : skip(),
        route === 'alerts' ? supabase.from('wildfire_system_alerts').select('id,severity,status,summary,last_detected_at').not('status', 'in', '(resolved,closed)').order('last_detected_at', { ascending: false }).limit(100) : skip(),
      ]);
      const failed = results.find(result => result.error)?.error;
      if (failed) throw new Error(`Wildfire data could not be loaded: ${failed.message}`);
      if (version !== loadVersion.current) return;
      setProducts(results[0].data as Product[]);
      setOpportunities(results[1].data as Opportunity[]);
      setOrganizations(results[2].data as Organization[]);
      setProperties(results[3].data as Property[]);
      setPlans(results[4].data as SitePlan[]);
      setPlacements(results[5].data as Placement[]);
      setAlerts(results[6].data ?? []);
      setError('');
    } catch (cause) { if (version === loadVersion.current) setError(userFacingError(cause, 'Wildfire could not be loaded. Refresh to retry.')); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [loaded, level, route]);
  useEffect(() => { loadVersion.current++; setLoading(true); }, [route, loaded, level]);
  useLiveRefresh(refresh, ['wildfire_products', 'wildfire_opportunities', 'wildfire_properties', 'wildfire_site_plans', 'wildfire_site_placements', 'support_tickets', 'wildfire_system_alerts']);
  const saveProspect = async (values: ProspectValues, id?: string) => {
    const result = id ? await supabase.from('wildfire_opportunities').update(values).eq('id', id) : await supabase.from('wildfire_opportunities').insert({ ...values, created_by: currentUser.id, owner_id: currentUser.id });
    if (result.error) throw new Error(result.error.message);
    await refresh();
  };
  const openQuote = (id: string) => { setSelectedQuoteId(id); navigate('/wildfire/quotes'); };
  if (accessError) return <main className="min-w-0 flex-1 p-6"><p role="alert">{accessError}</p><button type="button" className={secondary} onClick={retryAccess}>Retry access check</button></main>;
  if (!loaded) return <main className="min-w-0 flex-1 bg-black p-6"><TableSkeleton /></main>;
  if (level < 1) return <main className="min-w-0 flex-1 p-6"><h1 className="text-xl font-semibold text-slate-900">Wildfire</h1><p className="mt-2 text-sm text-slate-500">Ask an administrator for Wildfire access in Settings.</p></main>;
  const page = pages[route];
  return <main className="min-w-0 flex-1 overflow-y-auto bg-black">
    <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-5 sm:px-6">
      <div><div className="flex items-center gap-2"><Flame className="h-5 w-5 text-brand-600" /><h1 className="text-xl font-semibold text-slate-900">{page.title}</h1></div></div>
      <button type="button" className={secondary} onClick={() => void refresh()}>Refresh</button>
    </header>
    <div className="space-y-5 px-4 pb-6 sm:px-6">
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}<button type="button" className="ml-3 underline" onClick={() => setError('')}>Dismiss</button></p>}
      {loading && !['deployments', 'quotes'].includes(route) ? <TableSkeleton /> : <>
        {route === 'opportunities' && <Prospects opportunities={opportunities} organizations={organizations} canEdit={level >= 2} onSave={saveProspect} onStage={async (id, stage) => { const { error: stageError } = await supabase.from('wildfire_opportunities').update({ stage }).eq('id', id); if (stageError) throw new Error(stageError.message); await refresh(); }} onPlan={id => { setSelectedOpportunityId(id); navigate('/wildfire/site-planner'); }} />}
        {route === 'site-planner' && <Planner opportunities={opportunities} properties={properties} plans={plans} placements={placements} products={products} canEdit={level >= 2} selectedOpportunityId={selectedOpportunityId} onRefresh={refresh} onQuote={openQuote} />}
        {route === 'quotes' && <Quotes opportunities={opportunities} products={products} selectedId={selectedQuoteId} canEdit={level >= 2} supportingDataLoading={loading} />}
        {route === 'deployments' && <Deployments properties={properties} organizations={organizations} canEdit={level >= 2} onQuote={openQuote} supportingDataLoading={loading} />}
        {route === 'catalog' && <Catalog products={products} accessLevel={level} onRefresh={refresh} />}
        {route === 'alerts' && <section className={surface}><h2 className="text-lg font-semibold text-slate-900">Open system alerts</h2><p className="mt-2 text-sm text-slate-500">Device health faults are not fire detection. No telemetry source is fabricated.</p><ul className="mt-4 space-y-3">{alerts.map(item => <li key={item.id} className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-900">{item.summary}</p><p className="text-xs text-slate-500">{item.severity} · {displayStage(item.status)} · {new Date(item.last_detected_at).toLocaleString('en-US')}</p></li>)}</ul>{!alerts.length && <p className="mt-4 text-sm text-slate-500">No open equipment alerts.</p>}</section>}
      </>}
    </div>
  </main>;
}
