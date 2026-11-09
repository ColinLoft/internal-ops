// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Opportunity, Placement, Product, Property, SitePlan } from './model';
const mock = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: 'saved-id', error: null })),
  insert: vi.fn(),
  invoke: vi.fn(),
  refresh: vi.fn(async () => {}),
  quote: vi.fn(),
  point: undefined as undefined | ((point: { lat: number; lng: number }) => void),
}));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'staff' }, users: [] }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mock.rpc,
    functions: { invoke: mock.invoke },
    from: () => {
      const result = { data: { id: 'property' }, error: null };
      const chain = {
        insert: (values: unknown) => { mock.insert(values); return chain; },
        select: () => chain, single: async () => result,
        then: (resolve: (result: unknown) => void) => Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  },
}));
vi.mock('./SiteMap', () => ({
  SiteMap: ({ onPoint }: { onPoint: (point: { lat: number; lng: number }) => void }) => { mock.point = onPoint; return <div>Satellite map</div>; },
}));
vi.mock('./googleMaps', () => ({ googleMapsConfigured: true, geocodeAddress: async () => ({ position: { lat: 37, lng: -122 }, address: 'Resolved address' }) }));
import { Planner } from './Planner';
import { Prospects } from './Prospects';
import { wildfireRoute } from './WildfirePage';
let root: Root;
let container: HTMLDivElement;
const opportunity: Opportunity = { id: 'prospect', organization_id: null, contact_id: null, property_id: null, name: 'Potential customer', prospect_name: 'Potential customer', prospect_website: '', prospect_email: '', prospect_phone: '', prospect_location: '', research_notes: '', source_urls: [], stage: 'new_inquiry', estimated_value: null, currency: 'USD', assigned_to: null, expected_decision_date: null, notes: '' };
const property = { id: 'property', opportunity_id: 'prospect', organization_id: null, label: 'Site', latitude: 37, longitude: -122, address: '' } as Property;
const plan = { id: 'plan', property_id: 'property', opportunity_id: 'prospect', name: 'Design', version: 1, status: 'draft', boundary_geojson: null } as SitePlan;
const product = { id: 'camera', name: 'Camera', status: 'active', list_price: 200 } as Product;
const click = async (text: string) => {
  const target = [...container.querySelectorAll('button')].find(item => item.textContent === text);
  expect(target).toBeDefined();
  await act(async () => target!.click());
};
const setValue = async (selector: string, value: string) => {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  expect(element).not.toBeNull();
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
describe('Wildfire acquisition workflow', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const renderPlanner = async (properties: Property[] = [], plans: SitePlan[] = [], placements: Placement[] = []) => {
    await act(async () => root.render(<Planner opportunities={[opportunity]} properties={properties} plans={plans} placements={placements} products={[product]} canEdit selectedOpportunityId="prospect" onRefresh={mock.refresh} onQuote={mock.quote} />));
  };
  it('routes Overview to prospects and combines proposals with quotes', () => {
    expect(wildfireRoute('/wildfire')).toBe('opportunities');
    expect(wildfireRoute('/wildfire/overview')).toBe('opportunities');
    expect(wildfireRoute('/wildfire/proposals')).toBe('quotes');
  });
  it('saves coordinates and creates a site design without a CRM company', async () => {
    await renderPlanner();
    await setValue('[aria-label="Site name"]', 'Prospect site');
    await setValue('[aria-label="Location format"]', 'coordinates');
    await setValue('[aria-label="Latitude, longitude"]', '37.7749, -122.4194');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: null, opportunity_id: 'prospect', latitude: 37.7749, longitude: -122.4194 }));
    expect(mock.rpc).toHaveBeenCalledWith('wildfire_create_site_plan', expect.objectContaining({ p_property_id: 'property', p_opportunity_id: 'prospect' }));
  });
  it('rejects swapped coordinates without saving', async () => {
    await renderPlanner();
    await setValue('[aria-label="Site name"]', 'Prospect site');
    await setValue('[aria-label="Location format"]', 'coordinates');
    await setValue('[aria-label="Latitude, longitude"]', '-122, 37');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.insert).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Latitude (the first number)');
  });
  it('uses geocoding for address sites and does not send an address as coordinates', async () => {
    await renderPlanner();
    await setValue('[aria-label="Site name"]', 'Prospect site');
    await setValue('[aria-label="Site address"]', '123 Example Street');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ address: 'Resolved address', latitude: 37, longitude: -122 }));
  });
  it('creates a quote from the chosen design and redirects to Quotes', async () => {
    await renderPlanner([property], [plan]);
    await click('Create quote from this plan');
    expect(mock.rpc).toHaveBeenCalledWith('wildfire_create_quote_from_plan', { p_site_plan_id: 'plan' });
    expect(mock.quote).toHaveBeenCalledWith('saved-id');
  });
  it('links standalone sites using a dedicated selector without changing the site filter', async () => {
    await act(async () => root.render(<Planner opportunities={[opportunity]} properties={[{ ...property, opportunity_id: null }]} plans={[{ ...plan, opportunity_id: null }]} placements={[]} products={[product]} canEdit selectedOpportunityId="" onRefresh={mock.refresh} onQuote={mock.quote} />));
    await setValue('[aria-label="Prospect for this site"]', 'prospect');
    await click('Link to prospect');
    expect(mock.rpc).toHaveBeenCalledWith('wildfire_link_site_plan', { p_site_plan_id: 'plan', p_opportunity_id: 'prospect' });
    expect(mock.refresh).toHaveBeenCalled();
  });
  it('requires review before saving AI search results and does not auto-create CRM records', async () => {
    mock.invoke.mockResolvedValue({ data: { results: [{ name: 'Potential customer', website: 'https://example.com', email: '', phone: '', location: 'California', summary: 'Public customer information', fit_reason: 'Potential fit', source_urls: ['https://example.com'] }] }, error: null });
    const onSave = vi.fn(async () => {});
    await act(async () => root.render(<Prospects opportunities={[]} organizations={[]} canEdit onSave={onSave} onStage={vi.fn()} onPlan={vi.fn()} />));
    await setValue('[aria-label="Public customer search"]', 'Vineyards in California');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.invoke).toHaveBeenCalledWith('wildfire-prospect-ai', { body: { query: 'Vineyards in California' } });
    expect(onSave).not.toHaveBeenCalled();
    await click('Review and save prospect');
    const dialog = container.querySelector('[role=dialog]')!;
    await act(async () => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ organization_id: null, prospect_name: 'Potential customer', source_urls: ['https://example.com'] }), undefined);
  });
});
