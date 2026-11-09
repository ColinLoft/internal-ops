import 'leaflet/dist/leaflet.css';
import type { Coordinates } from './model';

export const loadTerrainMap = () => import('leaflet');

type GeocodeResult = { position: Coordinates; address: string };
const cache = new Map<string, GeocodeResult>();
let lastLookup = 0;
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const query = address.trim();
  if (query.length < 5) throw new Error('Enter a complete street address, city, and region.');
  const cached = cache.get(query.toLowerCase());
  if (cached) return cached;
  if (Date.now() - lastLookup < 1000) throw new Error('Address lookup is busy. Wait a second, then retry.');
  lastLookup = Date.now();
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`, { signal: abort.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!response.ok) throw new Error('Address lookup is unavailable. Try again later, or enter coordinates.');
    const body: unknown = await response.json();
    const feature = (body as { features?: { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }[] }).features?.[0];
    if (!feature) throw new Error('No location matched this address. Try a complete street address, city, and region, or use coordinates.');
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Address lookup returned an invalid location. Use coordinates instead.');
    const fields = feature.properties ?? {};
    const street = [fields.housenumber, fields.street].filter(value => typeof value === 'string').join(' ');
    const formatted = [fields.name, street, fields.city, fields.state, fields.country].filter((value): value is string => typeof value === 'string' && Boolean(value));
    const result = { position: { lat, lng }, address: [...new Set(formatted)].join(', ') || query };
    if (cache.size >= 50) cache.clear();
    cache.set(query.toLowerCase(), result);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw Object.assign(new Error('Address lookup timed out. Retry, or enter coordinates.'), { cause: error });
    throw error;
  } finally { window.clearTimeout(timeout); }
}
