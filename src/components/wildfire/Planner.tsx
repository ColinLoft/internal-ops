import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { geocodeAddress } from './googleMaps';
import { SiteMap } from './SiteMap';
import { control, parseCoordinates, primary, secondary, surface, type Coordinates, type Opportunity, type Placement, type Product, type Property, type SitePlan } from './model';

const emptyPoints: Coordinates[] = [];
export function Planner({ opportunities, properties, plans, placements, products, canEdit, selectedOpportunityId, onRefresh, onQuote }: {
  opportunities: Opportunity[]; properties: Property[]; plans: SitePlan[]; placements: Placement[];
  products: Product[]; canEdit: boolean; selectedOpportunityId: string;
  onRefresh: () => Promise<void>; onQuote: (id: string) => void;
}) {
  const { currentUser } = useWorkspace();
  const [opportunityId, setOpportunityId] = useState(selectedOpportunityId);
  const [propertyId, setPropertyId] = useState('');
  const [planId, setPlanId] = useState('');
  const [mode, setMode] = useState<'address' | 'coordinates'>('address');
  const [location, setLocation] = useState('');
  const [siteName, setSiteName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [placementType, setPlacementType] = useState('camera');
  const [point, setPoint] = useState<Coordinates | null>(null);
  const [placementLabel, setPlacementLabel] = useState('');
  const [heading, setHeading] = useState('');
  const [fov, setFov] = useState('');
  const [notes, setNotes] = useState('');
  const [drawingBoundary, setDrawingBoundary] = useState(false);
  const [boundaryPoints, setBoundaryPoints] = useState<Coordinates[]>([]);
  const relevantProperties = properties.filter(property => !opportunityId || property.opportunity_id === opportunityId || opportunities.find(item => item.id === opportunityId)?.property_id === property.id);
  const property = properties.find(item => item.id === propertyId) ?? relevantProperties[0] ?? null;
  const relevantPlans = plans.filter(plan => plan.property_id === property?.id);
  const plan = plans.find(item => item.id === planId && item.property_id === property?.id) ?? relevantPlans[0] ?? null;
  const visiblePlacements = useMemo(() => placements.filter(item => item.site_plan_id === plan?.id), [placements, plan?.id]);
  const editable = canEdit && plan?.status === 'draft';
  const linkedOpportunity = opportunities.find(item => item.id === (plan?.opportunity_id ?? property?.opportunity_id));
  const mutate = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Site planner update failed.'); }
    finally { setBusy(false); }
  };
  const createSite = async (event: React.FormEvent) => {
    event.preventDefault();
    await mutate(async () => {
      const resolved = mode === 'coordinates' ? { position: parseCoordinates(location), address: '' } : await geocodeAddress(location);
      const opportunity = opportunities.find(item => item.id === opportunityId);
      const { data, error: createError } = await supabase.from('wildfire_properties').insert({
        opportunity_id: opportunityId || null, organization_id: opportunity?.organization_id ?? null,
        label: siteName.trim(), address: resolved.address, latitude: resolved.position.lat, longitude: resolved.position.lng,
        created_by: currentUser.id, owner_id: currentUser.id,
      }).select('id').single();
      if (createError || !data) throw new Error(createError?.message || 'The site was not saved.');
      setPropertyId(data.id);
      const { data: newPlanId, error: planError } = await supabase.rpc('wildfire_create_site_plan', { p_property_id: data.id, p_opportunity_id: opportunityId || null, p_name: 'Site design' });
      if (planError) {
        await onRefresh();
        throw new Error(`Site saved, but the design could not be created: ${planError.message}. Use New design to retry.`);
      }
      setPlanId(newPlanId);
      setSiteName(''); setLocation('');
      await onRefresh();
    });
  };
  const newVersion = () => void mutate(async () => {
    if (!property) throw new Error('Choose or add a site first.');
    const { data, error: createError } = await supabase.rpc('wildfire_create_site_plan', { p_property_id: property.id, p_opportunity_id: property.opportunity_id ?? (opportunityId || null), p_name: plan?.name || 'Site design' });
    if (createError) throw new Error(createError.message);
    setPlanId(data); setBoundaryPoints([]); setPoint(null); await onRefresh();
  });
  const savePlacement = async (event: React.FormEvent) => {
    event.preventDefault();
    await mutate(async () => {
      if (!plan || !point || !editable) throw new Error('Choose a draft design and click the map to select a position.');
      const product = products.find(item => item.id === selectedProductId);
      const { error: saveError } = await supabase.from('wildfire_site_placements').insert({
        site_plan_id: plan.id, product_id: product?.id ?? null, placement_type: placementType,
        label: placementLabel.trim() || product?.name || placementType, latitude: point.lat, longitude: point.lng,
        heading_degrees: heading === '' ? null : Number(heading), horizontal_fov_degrees: fov === '' ? null : Number(fov),
        notes, created_by: currentUser.id,
      });
      if (saveError) throw new Error(saveError.message);
      setPoint(null); setPlacementLabel(''); setNotes(''); await onRefresh();
    });
  };
  const saveBoundary = () => void mutate(async () => {
    if (!plan || boundaryPoints.length < 3) throw new Error('Click at least three map points to define the site boundary.');
    const ring = [...boundaryPoints, boundaryPoints[0]].map(item => [item.lng, item.lat]);
    const { error: saveError } = await supabase.from('wildfire_site_plans').update({ boundary_geojson: { type: 'Polygon', coordinates: [ring] } }).eq('id', plan.id);
    if (saveError) throw new Error(saveError.message);
    setBoundaryPoints([]); setDrawingBoundary(false); await onRefresh();
  });
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className={surface}>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-700">Opportunity (optional)<select className={control} value={opportunityId} onChange={event => { setOpportunityId(event.target.value); setPropertyId(''); setPlanId(''); setPoint(null); setBoundaryPoints([]); }}><option value="">All sites</option>{opportunities.map(item => <option key={item.id} value={item.id}>{item.prospect_name || item.name}</option>)}</select></label>
        <label className="text-sm text-slate-700">Site<select className={control} value={property?.id ?? ''} onChange={event => { setPropertyId(event.target.value); setPlanId(''); setPoint(null); setBoundaryPoints([]); }}>{!relevantProperties.length && <option value="">No sites yet</option>}{relevantProperties.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-sm text-slate-700">Design<select className={control} value={plan?.id ?? ''} onChange={event => { setPlanId(event.target.value); setPoint(null); setBoundaryPoints([]); }}>{!relevantPlans.length && <option value="">No designs yet</option>}{relevantPlans.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
      </div>
      {canEdit && <details className="mt-4" open={!property}><summary className="cursor-pointer text-sm font-semibold text-brand-600">Add a site by address or coordinates</summary><form onSubmit={event => void createSite(event)} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input aria-label="Site name" required maxLength={200} value={siteName} onChange={event => setSiteName(event.target.value)} placeholder="Site name" className={control} />
        <select aria-label="Location format" value={mode} onChange={event => { setMode(event.target.value === 'address' ? 'address' : 'coordinates'); setLocation(''); }} className={control}><option value="address">Street address</option><option value="coordinates">Latitude, longitude</option></select>
        <input aria-label={mode === 'address' ? 'Site address' : 'Latitude, longitude'} required value={location} onChange={event => setLocation(event.target.value)} placeholder={mode === 'address' ? 'Street address, city, region' : '37.7749, -122.4194'} className={control} />
        <button disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save site and design'}</button>
        <p className="text-xs text-slate-500 sm:col-span-2">{mode === 'coordinates' ? 'Latitude first (-90 to 90), longitude second (-180 to 180). Western longitudes are negative. Google satellite maps still require a configured key.' : 'Address lookup uses Google Geocoding. Coordinate entry works without geocoding.'}</p>
      </form></details>}
    </section>
    {property && <section className={surface}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-slate-900">{property.label}</h2><p className="text-sm text-slate-500">{property.address || `${property.latitude}, ${property.longitude}`}</p>{plan && <p className="mt-1 text-xs text-slate-500">{linkedOpportunity ? `For ${linkedOpportunity.prospect_name || linkedOpportunity.name}` : 'Not linked to a prospect yet'}</p>}</div>
        <div className="flex flex-wrap gap-2">{canEdit && <button type="button" disabled={busy} className={secondary} onClick={newVersion}>New design version</button>}{plan && canEdit && <button type="button" disabled={busy} className={primary} onClick={() => void mutate(async () => {
          if (!plan.opportunity_id) {
            if (!opportunityId) throw new Error('Choose the prospect this quote is for in the Opportunity menu above, then create the quote.');
            const { error: linkError } = await supabase.rpc('wildfire_link_site_plan', { p_site_plan_id: plan.id, p_opportunity_id: opportunityId });
            if (linkError) throw new Error(linkError.message);
          }
          const { data, error: quoteError } = await supabase.rpc('wildfire_create_quote_from_plan', { p_site_plan_id: plan.id });
          if (quoteError) throw new Error(quoteError.message);
          onQuote(data);
        })}>Create quote from this plan</button>}{plan && canEdit && !plan.opportunity_id && opportunityId && <button type="button" disabled={busy} className={secondary} onClick={() => void mutate(async () => {
          const { error: linkError } = await supabase.rpc('wildfire_link_site_plan', { p_site_plan_id: plan.id, p_opportunity_id: opportunityId });
          if (linkError) throw new Error(linkError.message);
          await onRefresh();
        })}>Link to selected prospect</button>}</div>
      </div>
      {property.latitude !== null && property.longitude !== null && plan ? <>
        {editable && <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className={drawingBoundary ? primary : secondary} onClick={() => { setDrawingBoundary(value => !value); setPoint(null); }}>Draw site boundary</button>
          {drawingBoundary && <><button type="button" disabled={busy || boundaryPoints.length < 3} onClick={saveBoundary} className={secondary}>Save boundary ({boundaryPoints.length} points)</button><button type="button" className={secondary} onClick={() => setBoundaryPoints([])}>Reset drawing</button></>}
          <span className="text-sm text-slate-500">{drawingBoundary ? 'Click boundary corners on the map.' : 'Click the map to place equipment. Drag markers to adjust positions.'}</span>
        </div>}
        <SiteMap center={{ lat: property.latitude, lng: property.longitude }} placements={visiblePlacements} boundary={plan.boundary_geojson} boundaryPoints={boundaryPoints.length ? boundaryPoints : emptyPoints} editable={Boolean(editable)} onPoint={position => { if (drawingBoundary) setBoundaryPoints(points => [...points, position]); else setPoint(position); }} onMove={async (id, position) => {
          const { error: moveError } = await supabase.from('wildfire_site_placements').update({ latitude: position.lat, longitude: position.lng }).eq('id', id);
          if (moveError) throw new Error(`Position could not be saved: ${moveError.message}`);
          await onRefresh();
        }} />
        <p className="mt-3 text-xs text-slate-500">Satellite imagery, boundaries, camera headings and field of view are planning aids, not validated terrain visibility or guaranteed fire-detection coverage.</p>
      </> : <p className="text-sm text-slate-500">{plan ? 'This legacy site has no coordinates. Add a geocoded site to use the interactive map.' : 'Create a design version to plan equipment.'}</p>}
      {point && editable && <form onSubmit={event => void savePlacement(event)} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
        <h3 className="font-semibold text-slate-900 sm:col-span-2">Place equipment at {point.lat.toFixed(6)}, {point.lng.toFixed(6)}</h3>
        <select aria-label="Catalog equipment" value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)} className={control}><option value="">Unpriced planning marker</option>{products.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="Equipment type" value={placementType} onChange={event => setPlacementType(event.target.value)} className={control}>{['camera', 'gateway', 'power', 'infrastructure', 'coverage_zone'].map(type => <option key={type}>{type}</option>)}</select>
        <input aria-label="Placement label" value={placementLabel} onChange={event => setPlacementLabel(event.target.value)} placeholder="Placement label" className={control} />
        <input aria-label="Installation notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Installation notes" className={control} />
        <label className="text-sm text-slate-700">Heading (degrees)<input type="number" min={0} max={360} step="any" value={heading} onChange={event => setHeading(event.target.value)} className={control} /></label>
        <label className="text-sm text-slate-700">Horizontal field of view (degrees)<input type="number" min={0} max={360} step="any" value={fov} onChange={event => setFov(event.target.value)} className={control} /></label>
        <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className={primary}>Save placement</button><button type="button" className={secondary} onClick={() => setPoint(null)}>Cancel</button></div>
      </form>}
      <ul className="mt-4 space-y-2">{visiblePlacements.map((item, index) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <span>{index + 1}. {item.label} · {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}{item.heading_degrees !== null ? ` · heading ${item.heading_degrees}°` : ''}{item.notes ? ` · ${item.notes}` : ''}</span>
        {editable && <button type="button" disabled={busy} className="text-rose-600" onClick={() => void mutate(async () => { const { error: deleteError } = await supabase.from('wildfire_site_placements').delete().eq('id', item.id); if (deleteError) throw new Error(deleteError.message); await onRefresh(); })}>Remove</button>}
      </li>)}</ul>
    </section>}
  </div>;
}
