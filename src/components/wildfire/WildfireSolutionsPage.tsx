import { CustomSelect } from '../common/CustomSelect';
import { Dropdown } from '../common/Dropdown';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, ClipboardList, Flame, MapPin, Plus,
  RefreshCw, Search, Truck,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';
import { supabase } from '../../lib/supabase';

type Product = {
  id: string;
  sku: string;
  name: string;
  category: 'detection' | 'infrastructure' | 'power' | 'service';
  description: string;
  list_price: number;
  status: 'active' | 'discontinued';
  warranty: string;
  installation_requirements: string;
  specifications: Record<string, unknown>;
};
type Organization = { id: string; name: string; category: string };
type Contact = { id: string; organization_id: string | null; name: string; email: string | null };
type Property = { id: string; organization_id: string; label: string; address: string; city: string; region: string; latitude: number | null; longitude: number | null };
type Opportunity = {
  id: string; organization_id: string; contact_id: string | null; property_id: string | null;
  name: string; stage: string; estimated_value: number | null; currency: string;
  assigned_to: string | null; expected_decision_date: string | null; notes: string;
};
type SitePlan = { id: string; property_id: string; opportunity_id: string | null; name: string; version: number; status: string; coverage_assumptions: string; notes: string };
type Placement = {
  id: string; site_plan_id: string; product_id: string | null; placement_type: string;
  label: string; latitude: number; longitude: number; heading_degrees: number | null;
  horizontal_fov_degrees: number | null; notes: string;
};
type Deployment = { id: string; organization_id: string; property_id: string; status: string; scheduled_at: string | null; completed_at: string | null };
type Alert = { id: string; alert_type: string; severity: string; status: string; summary: string; first_detected_at: string; last_detected_at: string };
type RequestTicket = { id: string; ticket_number: number; subject: string; status: string; priority: string; wildfire_request_kind: string | null; created_at: string };

const stages = [
  { id: 'new_inquiry', label: 'New inquiry' },
  { id: 'initial_contact', label: 'Initial contact' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'site_assessment', label: 'Site assessment' },
  { id: 'site_planning', label: 'Site planning' },
  { id: 'quote_preparation', label: 'Quote preparation' },
  { id: 'proposal_sent', label: 'Proposal sent' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'contract_pending', label: 'Contract pending' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];
const deploymentStages = [
  { id: 'contract_executed', label: 'Contract executed' },
  { id: 'planning', label: 'Planning' },
  { id: 'procurement', label: 'Equipment procurement' },
  { id: 'preparation', label: 'Preparation' },
  { id: 'scheduled', label: 'Installation scheduled' },
  { id: 'installation', label: 'Installation in progress' },
  { id: 'commissioning', label: 'Testing & commissioning' },
  { id: 'handoff', label: 'Customer handoff' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];
const productCategories = [
  { id: 'detection', label: 'Detection equipment' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'power', label: 'Power' },
  { id: 'service', label: 'Services' },
];
const placementTypes = [
  { id: 'camera', label: 'Camera' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'power', label: 'Power equipment' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'coverage_zone', label: 'Coverage zone' },
];
const input = 'min-h-10 w-full rounded-md border border-slate-700 bg-[#0b0d11] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500';
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900 disabled:opacity-50';
const panel = 'rounded-lg border border-slate-800 bg-[#0d1016]';
const currency = (amount: number | null, code = 'USD') => amount === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
const label = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
const recordError = (error: { message: string } | null, action: string) => error ? `${action}: ${error.message}` : '';

export const WildfireSolutionsPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const { level, loaded: accessLoaded } = useAppAccess('wildfire');
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  const [products, setProducts] = useState<Product[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [sitePlans, setSitePlans] = useState<SitePlan[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('all');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [productDialog, setProductDialog] = useState<Product | null | false>(false);
  const [opportunityDialog, setOpportunityDialog] = useState(false);
  const [propertyDialog, setPropertyDialog] = useState(false);
  const [placementDialog, setPlacementDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.all([
      supabase.from('wildfire_products').select('id,sku,name,category,description,list_price,status,warranty,installation_requirements,specifications').order('name'),
      supabase.from('crm_organizations').select('id,name,category').order('name'),
      supabase.from('crm_contacts').select('id,organization_id,name,email').order('name'),
      supabase.from('wildfire_properties').select('id,organization_id,label,address,city,region,latitude,longitude').order('label'),
      supabase.from('wildfire_opportunities').select('id,organization_id,contact_id,property_id,name,stage,estimated_value,currency,assigned_to,expected_decision_date,notes').order('updated_at', { ascending: false }),
      supabase.from('wildfire_site_plans').select('id,property_id,opportunity_id,name,version,status,coverage_assumptions,notes').order('updated_at', { ascending: false }),
      supabase.from('wildfire_site_placements').select('id,site_plan_id,product_id,placement_type,label,latitude,longitude,heading_degrees,horizontal_fov_degrees,notes').order('created_at'),
      supabase.from('wildfire_deployments').select('id,organization_id,property_id,status,scheduled_at,completed_at').order('updated_at', { ascending: false }),
      supabase.from('wildfire_system_alerts').select('id,alert_type,severity,status,summary,first_detected_at,last_detected_at').not('status', 'in', '(resolved,closed)').order('last_detected_at', { ascending: false }).limit(100),
      supabase.from('support_tickets').select('id,ticket_number,subject,status,priority,wildfire_request_kind,created_at').not('wildfire_request_kind', 'is', null).order('created_at', { ascending: false }).limit(100),
    ]);
    const failed = results.map((result, index) => recordError(result.error, [
      'Product catalog could not be loaded', 'CRM companies could not be loaded',
      'CRM contacts could not be loaded', 'Properties could not be loaded',
      'Opportunities could not be loaded', 'Site plans could not be loaded',
      'Site placements could not be loaded', 'Deployments could not be loaded',
      'System alerts could not be loaded', 'Customer requests could not be loaded',
    ][index])).find(Boolean);
    if (failed) {
      setError(failed);
      setLoading(false);
      return;
    }
    setProducts((results[0].data || []) as Product[]);
    setOrganizations((results[1].data || []) as Organization[]);
    setContacts((results[2].data || []) as Contact[]);
    setProperties((results[3].data || []) as Property[]);
    setOpportunities((results[4].data || []) as Opportunity[]);
    setSitePlans((results[5].data || []) as SitePlan[]);
    setPlacements((results[6].data || []) as Placement[]);
    setDeployments((results[7].data || []) as Deployment[]);
    setAlerts((results[8].data || []) as Alert[]);
    setRequests((results[9].data || []) as RequestTicket[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const sync = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (!accessLoaded || level < 1) return;
    void load();
  }, [accessLoaded, level, load]);
  useEffect(() => {
    if (!selectedPropertyId && properties.length) setSelectedPropertyId(properties[0].id);
  }, [properties, selectedPropertyId]);
  useEffect(() => {
    const plansForProperty = sitePlans.filter((plan) => plan.property_id === selectedPropertyId);
    if (!plansForProperty.some((plan) => plan.id === selectedPlanId)) setSelectedPlanId(plansForProperty[0]?.id || '');
  }, [selectedPropertyId, selectedPlanId, sitePlans]);
  useEffect(() => {
    if (level < 3 || !products.length) return;
    void supabase.from('wildfire_product_costs').select('product_id,unit_cost').then(({ data, error: costError }) => {
      if (costError) { setError(`Internal product costs could not be loaded: ${costError.message}`); return; }
      setCosts(Object.fromEntries((data || []).map((row) => [row.product_id, Number(row.unit_cost)])));
    });
  }, [level, products]);

  const navigate = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const saveProduct = async (values: ProductFormValues, product?: Product, unitCost?: number) => {
    const result = product
      ? await supabase.from('wildfire_products').update(values).eq('id', product.id).select('id').single()
      : await supabase.from('wildfire_products').insert({ ...values, created_by: currentUser.id, owner_id: currentUser.id }).select('id').single();
    if (result.error) return result.error.message;
    let costMessage = '';
    if (level >= 3 && unitCost !== undefined) {
      const { error: costError } = await supabase.from('wildfire_product_costs').upsert({ product_id: result.data.id, unit_cost: unitCost, updated_by: currentUser.id }, { onConflict: 'product_id' });
      if (costError) costMessage = `Product saved, but its internal cost was not: ${costError.message}`;
    }
    setProductDialog(false);
    await load();
    if (costMessage) setError(costMessage);
    return '';
  };
  const saveOpportunity = async (values: OpportunityFormValues) => {
    const result = await supabase.from('wildfire_opportunities').insert({ ...values, created_by: currentUser.id, owner_id: currentUser.id });
    if (result.error) return result.error.message;
    setOpportunityDialog(false);
    await load();
    return '';
  };
  const saveProperty = async (values: PropertyFormValues) => {
    const result = await supabase.from('wildfire_properties').insert({ ...values, created_by: currentUser.id, owner_id: currentUser.id });
    if (result.error) return result.error.message;
    setPropertyDialog(false);
    await load();
    return '';
  };
  const savePlacement = async (values: PlacementFormValues) => {
    if (!selectedPlanId) return 'Create or select a site plan first.';
    const result = await supabase.from('wildfire_site_placements').insert({ ...values, site_plan_id: selectedPlanId, created_by: currentUser.id });
    if (result.error) return result.error.message;
    setPlacementDialog(false);
    await load();
    return '';
  };
  const createSitePlan = async () => {
    const property = properties.find((item) => item.id === selectedPropertyId);
    if (!property) return;
    const version = Math.max(0, ...sitePlans.filter((plan) => plan.property_id === property.id).map((plan) => plan.version)) + 1;
    const { data, error: createError } = await supabase.from('wildfire_site_plans').insert({
      property_id: property.id,
      opportunity_id: opportunities.find((opportunity) => opportunity.property_id === property.id)?.id || null,
      name: 'Site design',
      version,
      created_by: currentUser.id,
    }).select('id').single();
    if (createError || !data) { setError(createError?.message || 'The site design could not be created.'); return; }
    await load();
    setSelectedPlanId(data.id);
  };
  const changeOpportunityStage = async (id: string, stage: string) => {
    const { error: updateError } = await supabase.from('wildfire_opportunities').update({ stage }).eq('id', id);
    if (updateError) setError(`Opportunity stage could not be updated: ${updateError.message}`);
    else await load();
  };
  const changeDeploymentStage = async (id: string, status: string) => {
    const { error: updateError } = await supabase.from('wildfire_deployments').update({ status }).eq('id', id);
    if (updateError) setError(`Deployment status could not be updated: ${updateError.message}`);
    else await load();
  };

  if (!accessLoaded) return <LoadingScreen />;
  if (level < 1) return <AccessDenied />;

  const page = pageForRoute(route);
  const activePlan = sitePlans.find((plan) => plan.id === selectedPlanId) || null;
  const activePlacements = placements.filter((placement) => placement.site_plan_id === selectedPlanId);
  const shownOpportunities = opportunities.filter((opportunity) =>
    (organizationFilter === 'all' || opportunity.organization_id === organizationFilter) &&
    (!query.trim() || `${opportunity.name} ${organizations.find((org) => org.id === opportunity.organization_id)?.name || ''}`.toLowerCase().includes(query.trim().toLowerCase())));
  const shownProducts = products.filter((product) =>
    (!query.trim() || `${product.name} ${product.sku} ${product.description}`.toLowerCase().includes(query.trim().toLowerCase())));
  const openAlerts = alerts.filter((alert) => !['resolved', 'closed'].includes(alert.status));
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) || null;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#090b0f] text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 bg-[#0d1016] px-5 py-5 sm:px-8">
        <div className="flex items-start gap-3">
          <Flame className="mt-1 h-5 w-5 shrink-0 text-orange-300" />
          <div>
            <h1 className="text-xl font-semibold text-white">{page.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{page.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">Wildfire Solutions · Internal workspace</span>
          <button type="button" onClick={() => void load()} className={secondaryButton} aria-label="Refresh wildfire workspace"><RefreshCw className="h-4 w-4" />Refresh</button>
          {route === 'opportunities' && <button type="button" onClick={() => setOpportunityDialog(true)} className={button}><Plus className="h-4 w-4" />New opportunity</button>}
          {route === 'catalog' && level >= 2 && <button type="button" onClick={() => setProductDialog(null)} className={button}><Plus className="h-4 w-4" />Add product</button>}
          {route === 'site-planner' && <button type="button" onClick={() => setPropertyDialog(true)} className={secondaryButton}><Plus className="h-4 w-4" />Add property</button>}
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-6 lg:p-8">
        {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-rose-900/70 bg-rose-950/30 px-3 py-2.5 text-sm text-rose-200"><span>{error}</span><button type="button" onClick={() => setError('')} className="text-rose-100 underline">Dismiss</button></div>}
        {loading ? <LoadingRows /> : <>
          {route === 'overview' && <Overview
            opportunities={opportunities}
            properties={properties}
            products={products}
            deployments={deployments}
            alerts={openAlerts}
            organizations={organizations}
            onNavigate={navigate}
          />}
          {route === 'opportunities' && <OpportunitiesView
            items={shownOpportunities}
            allCount={opportunities.length}
            organizations={organizations}
            contacts={contacts}
            properties={properties}
            users={users}
            query={query}
            onQuery={setQuery}
            organizationFilter={organizationFilter}
            onFilter={setOrganizationFilter}
            onStage={changeOpportunityStage}
            onNew={() => setOpportunityDialog(true)}
            onSitePlan={(id) => {
              const opportunity = opportunities.find((item) => item.id === id);
              if (!opportunity?.property_id) { setError('Add a property to this company before creating a site design.'); return; }
              setSelectedPropertyId(opportunity.property_id);
              navigate('/wildfire/site-planner');
            }}
          />}
          {route === 'catalog' && <CatalogView
            products={shownProducts}
            allCount={products.length}
            costs={costs}
            canEdit={level >= 2}
            canManage={level >= 3}
            query={query}
            onQuery={setQuery}
            onEdit={(product) => setProductDialog(product)}
            onNew={() => setProductDialog(null)}
          />}
          {route === 'site-planner' && <SitePlanner
            properties={properties}
            plans={sitePlans}
            activePlan={activePlan}
            selectedPropertyId={selectedPropertyId}
            selectedProperty={selectedProperty}
            selectedPlanId={selectedPlanId}
            placements={activePlacements}
            products={products.filter((product) => product.status === 'active')}
            onProperty={setSelectedPropertyId}
            onPlan={setSelectedPlanId}
            onNewProperty={() => setPropertyDialog(true)}
            onNewPlan={() => void createSitePlan()}
            onNewPlacement={() => setPlacementDialog(true)}
            onDeletePlacement={async (id) => {
              const { error: deleteError } = await supabase.from('wildfire_site_placements').delete().eq('id', id);
              if (deleteError) setError(`Placement could not be removed: ${deleteError.message}`);
              else await load();
            }}
          />}
          {route === 'deployments' && <DeploymentsView
            items={deployments}
            properties={properties}
            organizations={organizations}
            onStage={changeDeploymentStage}
          />}
          {route === 'requests' && <RequestsView requests={requests} onOpenSupport={() => navigate('/customers/support')} />}
          {route === 'alerts' && <AlertsView alerts={alerts} />}
          {route === 'quotes' && <PlannedPhase title="Quotes & pricing" message="Quote versioning, line items and approval controls are backed by the new Wildfire data model. The quote builder is the next acquisition-phase screen to wire." onOpen={() => navigate('/wildfire/opportunities')} action="Open opportunities" />}
          {route === 'proposals' && <PlannedPhase title="Proposals" message="Proposal records link to Wildfire quotes and the existing Contracts module. Proposal authoring and customer delivery are not enabled yet." onOpen={() => navigate('/customers/contracts')} action="Open Contracts" />}
          {route === 'surveys' && <PlannedPhase title="Site surveys" message="Survey records link to CRM properties and opportunities. The survey capture workflow, photos and mobile completion view are planned for the deployment phase." onOpen={() => navigate('/wildfire/site-planner')} action="Open site planner" />}
        </>}
      </div>

      {productDialog !== false && <ProductDialog product={productDialog || undefined} canManage={level >= 3} existingCost={productDialog ? costs[productDialog.id] : undefined} onClose={() => setProductDialog(false)} onSave={saveProduct} />}
      {opportunityDialog && <OpportunityDialog organizations={organizations} contacts={contacts} properties={properties} users={users} currentUserId={currentUser.id} onClose={() => setOpportunityDialog(false)} onSave={saveOpportunity} />}
      {propertyDialog && <PropertyDialog organizations={organizations} onClose={() => setPropertyDialog(false)} onSave={saveProperty} />}
      {placementDialog && <PlacementDialog products={products.filter((product) => product.status === 'active')} onClose={() => setPlacementDialog(false)} onSave={savePlacement} />}
    </main>
  );
};

const routeFromPath = (path: string) => {
  const segment = path.split('/')[2];
  return ['overview', 'opportunities', 'site-planner', 'quotes', 'proposals', 'surveys', 'deployments', 'catalog', 'requests', 'alerts'].includes(segment) ? segment : 'overview';
};
const pageForRoute = (route: string) => ({
  overview: { title: 'Wildfire Solutions', subtitle: 'A single workspace for wildfire customer acquisition, site planning and system delivery.' },
  opportunities: { title: 'Opportunities', subtitle: 'Connect prospects to existing CRM companies, contacts and properties.' },
  'site-planner': { title: 'Site planner', subtitle: 'Keep property records, versioned site designs and proposed equipment placements together.' },
  quotes: { title: 'Quotes & pricing', subtitle: 'Build quote versions from approved products and proposed site plans.' },
  proposals: { title: 'Proposals', subtitle: 'Prepare customer proposals and move accepted work into the existing contract workflow.' },
  surveys: { title: 'Site surveys', subtitle: 'Capture field findings against a customer property and opportunity.' },
  deployments: { title: 'Deployments', subtitle: 'Track installation work against CRM companies, properties and existing contracts.' },
  catalog: { title: 'Product catalog', subtitle: 'Maintain detection equipment, infrastructure, power systems and services.' },
  requests: { title: 'Customer requests', subtitle: 'Review wildfire-related requests in the existing support ticket system.' },
  alerts: { title: 'System alerts', subtitle: 'Track equipment telemetry separately from customer-submitted support requests.' },
})[route] || { title: 'Wildfire Solutions', subtitle: 'Customer acquisition and delivery workspace.' };

const Overview: React.FC<{
  opportunities: Opportunity[]; properties: Property[]; products: Product[]; deployments: Deployment[]; alerts: Alert[];
  organizations: Organization[]; onNavigate: (path: string) => void;
}> = ({ opportunities, properties, products, deployments, alerts, organizations, onNavigate }) => {
  const activeOpportunities = opportunities.filter((item) => !['won', 'lost'].includes(item.stage));
  const activeDeployments = deployments.filter((item) => !['completed', 'cancelled'].includes(item.status));
  const nextSteps = activeOpportunities.slice(0, 5);
  return (
    <div className="space-y-6">
      <section className={`${panel} grid grid-cols-2 divide-x divide-y divide-slate-800 sm:grid-cols-4 sm:divide-y-0`}>
        <Metric label="Open opportunities" value={activeOpportunities.length} />
        <Metric label="Properties in CRM" value={properties.length} />
        <Metric label="Active catalog products" value={products.filter((item) => item.status === 'active').length} />
        <Metric label="Active deployments" value={activeDeployments.length} />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
        <section className={`${panel} min-w-0`}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-5">
            <div><h2 className="text-sm font-semibold text-white">Opportunity pipeline</h2><p className="mt-1 text-xs text-slate-400">{activeOpportunities.length} open customer pursuits</p></div>
            <button type="button" onClick={() => onNavigate('/wildfire/opportunities')} className="text-xs font-medium text-slate-300 hover:text-white">View opportunities <ArrowUpRight className="inline h-3 w-3" /></button>
          </div>
          {nextSteps.length ? <div className="divide-y divide-slate-800/80">{nextSteps.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-100">{item.name}</p><p className="mt-1 text-xs text-slate-400">{organizations.find((org) => org.id === item.organization_id)?.name || 'CRM company'} · {label(item.stage)}</p></div>
              <span className="num text-sm text-slate-300">{currency(item.estimated_value, item.currency)}</span>
            </div>
          ))}</div> : <EmptyState title="No open opportunities" detail="Start from an existing CRM company to keep customer records unified." action="Create opportunity" onClick={() => onNavigate('/wildfire/opportunities')} />}
        </section>
        <section className={`${panel} min-w-0`}>
          <div className="border-b border-slate-800 px-4 py-4 sm:px-5"><h2 className="text-sm font-semibold text-white">Operations to watch</h2><p className="mt-1 text-xs text-slate-400">Open alerts and delivery work</p></div>
          <div className="divide-y divide-slate-800/80">
            <button type="button" onClick={() => onNavigate('/wildfire/alerts')} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-white/[0.02] sm:px-5"><span className="flex items-center gap-2 text-sm text-slate-200"><AlertTriangle className="h-4 w-4 text-slate-400" />Open system alerts</span><span className="num text-sm text-slate-100">{alerts.length}</span></button>
            <button type="button" onClick={() => onNavigate('/wildfire/deployments')} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-white/[0.02] sm:px-5"><span className="flex items-center gap-2 text-sm text-slate-200"><Truck className="h-4 w-4 text-slate-400" />Deployments in progress</span><span className="num text-sm text-slate-100">{deployments.filter((item) => !['completed', 'cancelled'].includes(item.status)).length}</span></button>
            <button type="button" onClick={() => onNavigate('/wildfire/site-planner')} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-white/[0.02] sm:px-5"><span className="flex items-center gap-2 text-sm text-slate-200"><MapPin className="h-4 w-4 text-slate-400" />Properties ready to plan</span><span className="num text-sm text-slate-100">{properties.filter((item) => item.latitude !== null && item.longitude !== null).length}</span></button>
          </div>
        </section>
      </div>
      <section className={`${panel} flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5`}>
        <div><h2 className="text-sm font-semibold text-white">Customer records stay in CRM</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Wildfire opportunities, properties and delivery records point to existing companies and contacts. Contract records stay in Customers → Contracts; support requests stay in the shared support inbox.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onNavigate('/customers/organizations')} className={secondaryButton}>Open CRM companies</button><button type="button" onClick={() => onNavigate('/customers/contracts')} className={secondaryButton}>Open contracts</button></div>
      </section>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label: title, value }) => (
  <div className="px-4 py-4 sm:px-5"><p className="text-xs font-medium text-slate-400">{title}</p><p className="num mt-1.5 text-2xl font-semibold text-white">{value}</p></div>
);

const OpportunitiesView: React.FC<{
  items: Opportunity[]; allCount: number; organizations: Organization[]; contacts: Contact[]; properties: Property[];
  users: { id: string; name: string }[]; query: string; onQuery: (value: string) => void;
  organizationFilter: string; onFilter: (value: string) => void; onStage: (id: string, stage: string) => void;
  onNew: () => void; onSitePlan: (id: string) => void;
}> = ({ items, allCount, organizations, contacts, properties, users, query, onQuery, organizationFilter, onFilter, onStage, onNew, onSitePlan }) => (
  <section className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
      <p className="text-xs text-slate-400">{allCount} opportunities · {items.length} shown</p>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <div className="relative min-w-0 flex-1 sm:w-56"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search opportunities" className={`${input} pl-9`} /></div>
        <Dropdown value={organizationFilter} onChange={onFilter} ariaLabel="Filter by CRM company" className="min-w-44" options={[{ id: 'all', label: 'All companies' }, ...organizations.map((org) => ({ id: org.id, label: org.name }))]} />
      </div>
    </div>
    {items.length ? <div className="overflow-x-auto">
      <table className="w-full min-w-[790px] border-collapse text-left">
        <thead><tr className="h-10 text-xs font-medium text-slate-400"><th className="px-5">Opportunity</th><th className="px-4">Company / contact</th><th className="px-4">Stage</th><th className="px-4 text-right">Estimated value</th><th className="px-4">Owner</th><th className="px-5"></th></tr></thead>
        <tbody className="divide-y divide-slate-800/80">
          {items.map((item) => {
            const contact = contacts.find((candidate) => candidate.id === item.contact_id);
            const property = properties.find((candidate) => candidate.id === item.property_id);
            return <tr key={item.id} className="min-h-12 hover:bg-white/[0.02]">
              <td className="px-5 py-3"><p className="text-sm font-medium text-white">{item.name}</p><p className="mt-1 text-xs text-slate-400">{property?.label || item.expected_decision_date || 'No property linked'}</p></td>
              <td className="px-4 py-3"><p className="text-sm text-slate-200">{organizations.find((org) => org.id === item.organization_id)?.name || '—'}</p><p className="mt-1 text-xs text-slate-400">{contact?.name || 'No contact linked'}</p></td>
              <td className="px-4 py-3"><Dropdown value={item.stage} onChange={(value) => onStage(item.id, value)} ariaLabel={`Stage for ${item.name}`} options={stages} /></td>
              <td className="num px-4 py-3 text-right text-sm text-slate-200">{currency(item.estimated_value, item.currency)}</td>
              <td className="px-4 py-3 text-sm text-slate-300">{users.find((user) => user.id === item.assigned_to)?.name || 'Unassigned'}</td>
              <td className="px-5 py-3 text-right">{item.property_id ? <button type="button" onClick={() => onSitePlan(item.id)} className="text-xs font-medium text-slate-300 hover:text-white">Plan site</button> : <span className="text-xs text-slate-500">Add property first</span>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <EmptyState title={allCount ? 'No matching opportunities' : 'No opportunities yet'} detail={allCount ? 'Adjust the search or company filter.' : 'Create a pursuit from an existing CRM company and contact.'} action="New opportunity" onClick={onNew} />}
  </section>
);

const CatalogView: React.FC<{
  products: Product[]; allCount: number; costs: Record<string, number>; canEdit: boolean; canManage: boolean;
  query: string; onQuery: (value: string) => void; onEdit: (product: Product) => void; onNew: () => void;
}> = ({ products: items, allCount, costs, canEdit, canManage, query, onQuery, onEdit, onNew }) => (
  <section className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
      <p className="text-xs text-slate-400">{allCount} catalog products</p>
      <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by name, SKU or description" className={`${input} pl-9`} /></div>
    </div>
    {items.length ? <div className="overflow-x-auto">
      <table className="w-full min-w-[690px] border-collapse text-left">
        <thead><tr className="h-10 text-xs font-medium text-slate-400"><th className="px-5">Product</th><th className="px-4">Category</th><th className="px-4">Status</th><th className="px-4 text-right">List price</th>{canManage && <th className="px-4 text-right">Internal cost</th>}<th className="px-5"></th></tr></thead>
        <tbody className="divide-y divide-slate-800/80">
          {items.map((product) => <tr key={product.id} className="hover:bg-white/[0.02]">
            <td className="px-5 py-3"><p className="text-sm font-medium text-white">{product.name}</p><p className="mt-1 text-xs text-slate-400">{product.sku}{product.description ? ` · ${product.description}` : ''}</p></td>
            <td className="px-4 py-3 text-sm text-slate-300">{productCategories.find((category) => category.id === product.category)?.label || label(product.category)}</td>
            <td className="px-4 py-3"><span className={product.status === 'active' ? 'text-sm text-emerald-300' : 'text-sm text-slate-400'}>{label(product.status)}</span></td>
            <td className="num px-4 py-3 text-right text-sm text-slate-200">{currency(Number(product.list_price))}</td>
            {canManage && <td className="num px-4 py-3 text-right text-sm text-slate-300">{product.id in costs ? currency(costs[product.id]) : '—'}</td>}
            <td className="px-5 py-3 text-right">{canEdit && <button type="button" onClick={() => onEdit(product)} className="text-xs font-medium text-slate-300 hover:text-white">Edit</button>}</td>
          </tr>)}
        </tbody>
      </table>
    </div> : <EmptyState title={allCount ? 'No matching products' : 'Catalog is empty'} detail={allCount ? 'Try another product name or SKU.' : 'Add verified product details and customer list prices. Internal costs are restricted to Wildfire managers.'} action={canEdit ? 'Add product' : undefined} onClick={onNew} />}
  </section>
);

const SitePlanner: React.FC<{
  properties: Property[]; plans: SitePlan[]; activePlan: SitePlan | null; selectedPropertyId: string; selectedProperty: Property | null;
  selectedPlanId: string; placements: Placement[]; products: Product[]; onProperty: (id: string) => void; onPlan: (id: string) => void;
  onNewProperty: () => void; onNewPlan: () => void; onNewPlacement: () => void; onDeletePlacement: (id: string) => void;
}> = ({ properties, plans, activePlan, selectedPropertyId, selectedProperty, selectedPlanId, placements, products, onProperty, onPlan, onNewProperty, onNewPlan, onNewPlacement, onDeletePlacement }) => {
  const propertyPlans = plans.filter((plan) => plan.property_id === selectedPropertyId);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,0.8fr)]">
      <section className={`${panel} min-w-0`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 flex-wrap gap-2">
            <Dropdown value={selectedPropertyId} onChange={onProperty} ariaLabel="Select property" className="min-w-52" options={[{ id: '', label: 'Select a CRM property' }, ...properties.map((property) => ({ id: property.id, label: `${property.label} · ${property.city || 'Location pending'}` }))]} />
            <Dropdown value={selectedPlanId} onChange={onPlan} ariaLabel="Select site design version" className="min-w-40" options={[{ id: '', label: 'Select a design' }, ...propertyPlans.map((plan) => ({ id: plan.id, label: `${plan.name} · v${plan.version}` }))]} />
          </div>
          <div className="flex gap-2">{selectedProperty && <button type="button" onClick={onNewPlan} className={secondaryButton}><Plus className="h-4 w-4" />New version</button>}{selectedPlanId && <button type="button" onClick={onNewPlacement} className={button}><Plus className="h-4 w-4" />Place equipment</button>}</div>
        </div>
        {selectedProperty && activePlan ? <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white">{activePlan.name} · version {activePlan.version}</h2><p className="mt-1 text-xs text-slate-400">{selectedProperty.address || 'Address not set'}{selectedProperty.city ? `, ${selectedProperty.city}` : ''}</p></div>
            <span className="text-xs text-slate-300">{label(activePlan.status)}</span>
          </div>
          <CoordinateCanvas placements={placements} products={products} />
          <p className="mt-3 text-xs leading-5 text-slate-400">Coordinate sketch only — it is not a map, terrain model, or guaranteed detection coverage. Satellite basemaps and geocoding require a configured mapping provider.</p>
        </div> : <EmptyState title={properties.length ? 'Choose a property and design' : 'Add a property to begin'} detail={properties.length ? 'Each design is versioned independently so a proposed layout can evolve without overwriting an approved plan.' : 'Properties are attached to existing CRM companies; no duplicate customer records are created.'} action={properties.length ? 'Create site design' : 'Add property'} onClick={properties.length ? onNewPlan : onNewProperty} />}
      </section>
      <section className={`${panel} min-w-0`}>
        <div className="border-b border-slate-800 px-4 py-3.5 sm:px-5"><h2 className="text-sm font-semibold text-white">Proposed placements</h2><p className="mt-1 text-xs text-slate-400">{placements.length} items in this design</p></div>
        {placements.length ? <ul className="divide-y divide-slate-800/80">{placements.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="min-w-0"><p className="text-sm font-medium text-slate-100">{item.label}</p><p className="mt-1 text-xs text-slate-400">{label(item.placement_type)} · {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</p>{item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}</div>
          <button type="button" onClick={() => onDeletePlacement(item.id)} className="shrink-0 text-xs text-slate-400 hover:text-rose-300">Remove</button>
        </li>)}</ul> : <p className="px-4 py-6 text-sm text-slate-400 sm:px-5">No equipment placed in this version.</p>}
      </section>
    </div>
  );
};

const CoordinateCanvas: React.FC<{ placements: Placement[]; products: Product[] }> = ({ placements, products }) => {
  const points = placements.filter((placement) => placement.placement_type !== 'coverage_zone');
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = latitudes.length ? Math.min(...latitudes) : 0;
  const maxLat = latitudes.length ? Math.max(...latitudes) : 0;
  const minLng = longitudes.length ? Math.min(...longitudes) : 0;
  const maxLng = longitudes.length ? Math.max(...longitudes) : 0;
  const positionX = (point: Placement) => maxLng === minLng ? 500 : 80 + ((point.longitude - minLng) / (maxLng - minLng)) * 840;
  const positionY = (point: Placement) => maxLat === minLat ? 250 : 430 - ((point.latitude - minLat) / (maxLat - minLat)) * 360;
  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-[#090b0f]">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2"><span className="text-xs font-medium text-slate-300">Equipment layout</span><span className="text-xs text-slate-500">Latitude / longitude</span></div>
      <svg viewBox="0 0 1000 500" role="img" aria-label="Coordinate sketch showing proposed equipment placements" className="block h-auto max-h-[440px] min-h-56 w-full">
        <rect width="1000" height="500" fill="#090b0f" />
        {[1, 2, 3, 4].map((line) => <g key={line} stroke="#20252d" strokeWidth="1"><path d={`M ${line * 200} 0 V 500`} /><path d={`M 0 ${line * 100} H 1000`} /></g>)}
        {points.map((point) => {
          const x = positionX(point); const y = positionY(point);
          const color = point.placement_type === 'camera' ? '#fbbf24' : point.placement_type === 'gateway' ? '#38bdf8' : '#a3a3a3';
          return <g key={point.id}><circle cx={x} cy={y} r="8" fill={color} /><text x={x + 12} y={y + 4} fill="#e5e7eb" fontSize="13">{point.label.slice(0, 26)}</text><title>{products.find((product) => product.id === point.product_id)?.name || label(point.placement_type)} — {point.latitude}, {point.longitude}</title></g>;
        })}
        {placements.filter((placement) => placement.placement_type === 'coverage_zone').map((zone) => <ellipse key={zone.id} cx={positionX(zone)} cy={positionY(zone)} rx="90" ry="48" fill="#fbbf24" fillOpacity=".06" stroke="#fbbf24" strokeDasharray="6 5" />)}
        {!placements.length && <text x="500" y="250" textAnchor="middle" fill="#9299a3" fontSize="14">Add coordinates to place equipment</text>}
      </svg>
    </div>
  );
};

const DeploymentsView: React.FC<{ items: Deployment[]; properties: Property[]; organizations: Organization[]; onStage: (id: string, status: string) => void }> = ({ items, properties, organizations, onStage }) => (
  <section className={panel}>
    <div className="border-b border-slate-800 px-4 py-3.5 sm:px-5"><p className="text-xs text-slate-400">{items.length} deployments</p></div>
    {items.length ? <div className="divide-y divide-slate-800/80">{items.map((item) => {
      const property = properties.find((candidate) => candidate.id === item.property_id);
      return <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <div><p className="text-sm font-medium text-white">{property?.label || 'Property'}</p><p className="mt-1 text-xs text-slate-400">{organizations.find((org) => org.id === item.organization_id)?.name || 'CRM company'}{item.scheduled_at ? ` · Scheduled ${new Date(item.scheduled_at).toLocaleDateString()}` : ''}</p></div>
        <Dropdown value={item.status} onChange={(status) => onStage(item.id, status)} ariaLabel={`Deployment stage for ${property?.label || 'deployment'}`} className="min-w-48" options={deploymentStages} />
      </div>;
    })}</div> : <EmptyState title="No deployments created" detail="Deployments should follow an executed customer contract and link back to its CRM property." />}
  </section>
);

const RequestsView: React.FC<{ requests: RequestTicket[]; onOpenSupport: () => void }> = ({ requests, onOpenSupport }) => (
  <section className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5"><p className="text-xs text-slate-400">{requests.length} linked support requests</p><button type="button" onClick={onOpenSupport} className={secondaryButton}>Open support inbox <ArrowUpRight className="h-4 w-4" /></button></div>
    {requests.length ? <div className="divide-y divide-slate-800/80">{requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div><p className="text-sm font-medium text-white">FL-{request.ticket_number} · {request.subject}</p><p className="mt-1 text-xs text-slate-400">{label(request.wildfire_request_kind || 'service')} · {new Date(request.created_at).toLocaleDateString()}</p></div><span className="text-sm text-slate-300">{label(request.status)} · {label(request.priority)}</span></div>)}</div> : <EmptyState title="No wildfire requests" detail="Wildfire requests will be regular support tickets with a request type and optional linked property or deployment." action="Open support inbox" onClick={onOpenSupport} />}
  </section>
);

const AlertsView: React.FC<{ alerts: Alert[] }> = ({ alerts: items }) => (
  <section className={panel}>
    <div className="border-b border-slate-800 px-4 py-3.5 sm:px-5"><p className="text-xs text-slate-400">{items.length} open alerts · telemetry ingestion is not connected</p></div>
    {items.length ? <div className="divide-y divide-slate-800/80">{items.map((alert) => <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div><p className="text-sm font-medium text-white">{alert.summary}</p><p className="mt-1 text-xs text-slate-400">{label(alert.alert_type)} · First detected {new Date(alert.first_detected_at).toLocaleString()}</p></div><span className="text-sm text-slate-300">{label(alert.severity)} · {label(alert.status)}</span></div>)}</div> : <EmptyState title="No open system alerts" detail="Only technical equipment faults belong here. A detected fire must not be inferred from a device-health alert." />}
  </section>
);

const PlannedPhase: React.FC<{ title: string; message: string; action: string; onOpen: () => void }> = ({ title, message, action, onOpen }) => (
  <section className={`${panel} flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6`}>
    <div className="flex items-start gap-3"><ClipboardList className="mt-0.5 h-5 w-5 text-slate-300" /><div><h2 className="text-sm font-semibold text-white">{title} workspace</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{message}</p></div></div>
    <button type="button" onClick={onOpen} className={secondaryButton}>{action}<ArrowUpRight className="h-4 w-4" /></button>
  </section>
);

const EmptyState: React.FC<{ title: string; detail: string; action?: string; onClick?: () => void }> = ({ title, detail, action, onClick }) => (
  <div className="px-5 py-10 text-center"><h2 className="text-sm font-medium text-slate-200">{title}</h2><p className="mx-auto mt-1.5 max-w-lg text-sm leading-6 text-slate-400">{detail}</p>{action && onClick && <button type="button" onClick={onClick} className={`${secondaryButton} mt-4`}>{action}</button>}</div>
);

const LoadingScreen = () => <main className="min-w-0 flex-1 bg-[#090b0f] p-8 text-sm text-slate-300">Checking Wildfire Solutions access…</main>;
const AccessDenied = () => <main className="min-w-0 flex-1 bg-[#090b0f] p-8"><h1 className="text-xl font-semibold text-white">Wildfire Solutions</h1><p className="mt-2 text-sm text-slate-400">You do not have access to this workspace. Ask a Flown administrator to grant Wildfire Solutions access in Settings → Roles & access.</p></main>;
const LoadingRows = () => <div className="space-y-4" aria-label="Loading wildfire workspace">{[0, 1, 2].map((index) => <div key={index} className={`${panel} h-20 animate-pulse bg-[#0d1016]`} />)}</div>;

type ProductFormValues = Pick<Product, 'sku' | 'name' | 'category' | 'description' | 'list_price' | 'status' | 'warranty' | 'installation_requirements' | 'specifications'>;
const ProductDialog: React.FC<{ product?: Product; canManage: boolean; existingCost?: number; onClose: () => void; onSave: (values: ProductFormValues, product?: Product, unitCost?: number) => Promise<string> }> = ({ product, canManage, existingCost, onClose, onSave }) => {
  const [form, setForm] = useState<ProductFormValues>(() => product ? {
    sku: product.sku, name: product.name, category: product.category, description: product.description,
    list_price: Number(product.list_price), status: product.status, warranty: product.warranty,
    installation_requirements: product.installation_requirements, specifications: product.specifications || {},
  } : { sku: '', name: '', category: 'detection', description: '', list_price: 0, status: 'active', warranty: '', installation_requirements: '', specifications: {} });
  const [cost, setCost] = useState(existingCost ?? 0);
  const [specificationsText, setSpecificationsText] = useState(() => JSON.stringify(product?.specifications || {}, null, 2));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (key: keyof ProductFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: key === 'list_price' ? Number(event.target.value) : event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    let specifications: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(specificationsText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Specifications must be a JSON object.');
      specifications = parsed as Record<string, unknown>;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Specifications must be valid JSON.');
      setSaving(false);
      return;
    }
    const message = await onSave({ ...form, sku: form.sku.trim(), name: form.name.trim(), description: form.description.trim(), specifications }, product, canManage ? cost : undefined);
    if (message) { setError(message); setSaving(false); return; }
    setSaving(false);
  };
  return <Modal title={product ? 'Edit catalog product' : 'Add catalog product'} onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-3">
    <FormField label="Product name"><input required maxLength={200} value={form.name} onChange={field('name')} className={input} /></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="SKU / product ID"><input required maxLength={100} value={form.sku} onChange={field('sku')} className={input} /></FormField><FormField label="Category"><CustomSelect value={form.category} onChange={field('category')} className={input}>{productCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</CustomSelect></FormField></div>
    <FormField label="Description"><textarea rows={3} value={form.description} onChange={field('description')} className={input} /></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="Customer list price (USD)"><input type="number" min="0" step="0.01" value={form.list_price} onChange={field('list_price')} className={input} /></FormField><FormField label="Status"><CustomSelect value={form.status} onChange={field('status')} className={input}><option value="active">Active</option><option value="discontinued">Discontinued</option></CustomSelect></FormField></div>
    {canManage && product && <FormField label="Internal unit cost (manager-only)"><input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(Number(event.target.value))} className={input} /></FormField>}
    <FormField label="Technical specifications (JSON object)"><textarea rows={4} value={specificationsText} onChange={(event) => setSpecificationsText(event.target.value)} className={`${input} font-mono text-xs`} /></FormField>
    <FormField label="Warranty"><input value={form.warranty} onChange={field('warranty')} className={input} /></FormField>
    <FormField label="Installation requirements"><textarea rows={2} value={form.installation_requirements} onChange={field('installation_requirements')} className={input} /></FormField>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <ModalActions onClose={onClose} saving={saving} />
  </form></Modal>;
};

type OpportunityFormValues = { organization_id: string; contact_id: string | null; property_id: string | null; name: string; estimated_value: number | null; currency: string; assigned_to: string | null; expected_decision_date: string | null; notes: string };
const OpportunityDialog: React.FC<{ organizations: Organization[]; contacts: Contact[]; properties: Property[]; users: { id: string; name: string }[]; currentUserId: string; onClose: () => void; onSave: (values: OpportunityFormValues) => Promise<string> }> = ({ organizations, contacts, properties, users, currentUserId, onClose, onSave }) => {
  const [form, setForm] = useState({ organization_id: '', contact_id: '', property_id: '', name: '', estimated_value: '', assigned_to: currentUserId, expected_decision_date: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const filteredContacts = contacts.filter((contact) => contact.organization_id === form.organization_id);
  const filteredProperties = properties.filter((property) => property.organization_id === form.organization_id);
  const field = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    const message = await onSave({ organization_id: form.organization_id, contact_id: form.contact_id || null, property_id: form.property_id || null, name: form.name.trim(), estimated_value: form.estimated_value ? Number(form.estimated_value) : null, currency: 'USD', assigned_to: form.assigned_to || null, expected_decision_date: form.expected_decision_date || null, notes: form.notes.trim() });
    if (message) { setError(message); setSaving(false); }
  };
  return <Modal title="Create opportunity" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-3">
    <FormField label="Opportunity name"><input required value={form.name} onChange={field('name')} className={input} placeholder="Example: North Ridge camera network" /></FormField>
    <FormField label="CRM company"><CustomSelect required value={form.organization_id} onChange={field('organization_id')} className={input}><option value="">Select an existing company</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</CustomSelect></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="Primary contact"><CustomSelect value={form.contact_id} onChange={field('contact_id')} className={input}><option value="">No contact selected</option>{filteredContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</CustomSelect></FormField><FormField label="Property"><CustomSelect value={form.property_id} onChange={field('property_id')} className={input}><option value="">No property selected</option>{filteredProperties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</CustomSelect></FormField></div>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="Estimated project value (USD)"><input type="number" min="0" step="0.01" value={form.estimated_value} onChange={field('estimated_value')} className={input} /></FormField><FormField label="Expected decision date"><input type="date" value={form.expected_decision_date} onChange={field('expected_decision_date')} className={input} /></FormField></div>
    <FormField label="Assigned team member"><CustomSelect value={form.assigned_to} onChange={field('assigned_to')} className={input}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></FormField>
    <FormField label="Notes"><textarea rows={3} value={form.notes} onChange={field('notes')} className={input} /></FormField>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<ModalActions onClose={onClose} saving={saving} />
  </form></Modal>;
};

type PropertyFormValues = { organization_id: string; label: string; address: string; city: string; region: string; latitude: number | null; longitude: number | null };
const PropertyDialog: React.FC<{ organizations: Organization[]; onClose: () => void; onSave: (values: PropertyFormValues) => Promise<string> }> = ({ organizations, onClose, onSave }) => {
  const [form, setForm] = useState({ organization_id: '', label: '', address: '', city: '', region: '', latitude: '', longitude: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    const message = await onSave({ organization_id: form.organization_id, label: form.label.trim(), address: form.address.trim(), city: form.city.trim(), region: form.region.trim(), latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null });
    if (message) { setError(message); setSaving(false); }
  };
  return <Modal title="Add customer property" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-3">
    <FormField label="Existing CRM company"><CustomSelect required value={form.organization_id} onChange={field('organization_id')} className={input}><option value="">Select company</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</CustomSelect></FormField>
    <FormField label="Property / site name"><input required value={form.label} onChange={field('label')} className={input} /></FormField>
    <FormField label="Street address"><input value={form.address} onChange={field('address')} className={input} /></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="City"><input value={form.city} onChange={field('city')} className={input} /></FormField><FormField label="State / region"><input value={form.region} onChange={field('region')} className={input} /></FormField></div>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="Latitude"><input type="number" step="any" min="-90" max="90" value={form.latitude} onChange={field('latitude')} className={input} /></FormField><FormField label="Longitude"><input type="number" step="any" min="-180" max="180" value={form.longitude} onChange={field('longitude')} className={input} /></FormField></div>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<ModalActions onClose={onClose} saving={saving} />
  </form></Modal>;
};

type PlacementFormValues = { product_id: string | null; placement_type: string; label: string; latitude: number; longitude: number; heading_degrees: number | null; horizontal_fov_degrees: number | null; notes: string };
const PlacementDialog: React.FC<{ products: Product[]; onClose: () => void; onSave: (values: PlacementFormValues) => Promise<string> }> = ({ products, onClose, onSave }) => {
  const [form, setForm] = useState({ product_id: '', placement_type: 'camera', label: '', latitude: '', longitude: '', heading_degrees: '', horizontal_fov_degrees: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    const product = products.find((item) => item.id === form.product_id);
    const message = await onSave({ product_id: product?.id || null, placement_type: form.placement_type, label: form.label.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude), heading_degrees: form.heading_degrees ? Number(form.heading_degrees) : null, horizontal_fov_degrees: form.horizontal_fov_degrees ? Number(form.horizontal_fov_degrees) : null, notes: form.notes.trim() });
    if (message) { setError(message); setSaving(false); }
  };
  return <Modal title="Place equipment" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-3">
    <FormField label="Placement type"><CustomSelect value={form.placement_type} onChange={field('placement_type')} className={input}>{placementTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</CustomSelect></FormField>
    <FormField label="Catalog product"><CustomSelect value={form.product_id} onChange={field('product_id')} className={input}><option value="">Select a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</CustomSelect></FormField>
    <FormField label="Placement label"><input required value={form.label} onChange={field('label')} className={input} /></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="Latitude"><input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={field('latitude')} className={input} /></FormField><FormField label="Longitude"><input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={field('longitude')} className={input} /></FormField></div>
    {form.placement_type === 'camera' && <div className="grid gap-3 sm:grid-cols-2"><FormField label="Heading (degrees)"><input type="number" min="0" max="360" value={form.heading_degrees} onChange={field('heading_degrees')} className={input} /></FormField><FormField label="Horizontal field of view (degrees)"><input type="number" min="0" max="360" value={form.horizontal_fov_degrees} onChange={field('horizontal_fov_degrees')} className={input} /></FormField></div>}
    <FormField label="Installation notes"><textarea rows={2} value={form.notes} onChange={field('notes')} className={input} /></FormField>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<ModalActions onClose={onClose} saving={saving} />
  </form></Modal>;
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-[#10141a] p-5 shadow-2xl sm:p-6">
      <h2 className="mb-4 text-base font-semibold text-white">{title}</h2>{children}
    </section>
  </div>
);
const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label: title, children }) => <label className="block text-sm font-medium text-slate-300">{title}<span className="mt-1.5 block">{children}</span></label>;
const ModalActions: React.FC<{ onClose: () => void; saving: boolean }> = ({ onClose, saving }) => <div className="flex justify-end gap-2 border-t border-slate-800 pt-4"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button type="submit" disabled={saving} className={button}>{saving ? 'Saving…' : 'Save'}</button></div>;
