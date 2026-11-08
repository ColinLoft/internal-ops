export type Product = {
  id: string; sku: string; name: string; category: 'detection' | 'infrastructure' | 'power' | 'service';
  description: string; list_price: number; status: 'active' | 'discontinued';
  warranty: string; installation_requirements: string; specifications: Record<string, unknown>;
};
export type Organization = { id: string; name: string; category: string };
export type Opportunity = {
  id: string; organization_id: string | null; contact_id: string | null; property_id: string | null;
  name: string; prospect_name: string; prospect_website: string; prospect_email: string;
  prospect_phone: string; prospect_location: string; research_notes: string;
  source_urls: string[]; stage: string; estimated_value: number | null; currency: string;
  assigned_to: string | null; expected_decision_date: string | null; notes: string;
};
export type Property = {
  id: string; organization_id: string | null; opportunity_id: string | null;
  label: string; address: string; city: string; region: string; latitude: number | null; longitude: number | null;
};
export type Coordinates = { lat: number; lng: number };
export type SitePlan = {
  id: string; property_id: string; opportunity_id: string | null; name: string;
  version: number; status: string; coverage_assumptions: string; notes: string;
  boundary_geojson: { type: 'Polygon'; coordinates: number[][][] } | null;
};
export type Placement = {
  id: string; site_plan_id: string; product_id: string | null; placement_type: string; label: string;
  latitude: number; longitude: number; heading_degrees: number | null; horizontal_fov_degrees: number | null; notes: string;
};
export const control = 'min-h-10 w-full rounded-lg border border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500';
export const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50';
export const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-50';
export const surface = 'rounded-xl bg-white p-4 sm:p-5';
export const displayStage = (stage: string) => stage.replace(/_/g, ' ');
export const money = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export function parseCoordinates(value: string): Coordinates {
  const normalized = value.trim().replace(/[()]/g, '');
  const parts = normalized.split(/[,;\s]+/).filter(Boolean);
  if (parts.length !== 2 || parts.some(part => !/^[+-]?\d+(?:\.\d+)?$/.test(part))) {
    throw new Error('Enter latitude, longitude in decimal degrees, for example 37.7749, -122.4194.');
  }
  const [lat, lng] = parts.map(Number);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Latitude (the first number) must be between -90 and 90. Longitude goes second.');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Longitude (the second number) must be between -180 and 180.');
  return { lat, lng };
}

export async function functionError(error: Error): Promise<string> {
  if ('context' in error && error.context instanceof Response) {
    const raw: unknown = await error.context.clone().json();
    if (raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string') return raw.error;
  }
  return error.message;
}
