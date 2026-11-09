import type { Coordinates } from './model';

type Listener = { remove: () => void };
type MapEvent = { latLng?: { lat: () => number; lng: () => number } };
export type MapHandle = {
  setCenter: (position: Coordinates) => void;
  addListener: (event: string, callback: (event: MapEvent) => void) => Listener;
};
type MarkerHandle = {
  setMap: (map: MapHandle | null) => void;
  setPosition: (position: Coordinates) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
  addListener: (event: string, callback: () => void) => Listener;
};
type PolygonHandle = { setMap: (map: MapHandle | null) => void };
export type GoogleMaps = {
  Map: new (element: HTMLElement, options: { center: Coordinates; zoom: number; mapTypeId: string; streetViewControl: boolean }) => MapHandle;
  Marker: new (options: { map: MapHandle; position: Coordinates; title: string; label?: string; draggable: boolean }) => MarkerHandle;
  Polygon: new (options: { map: MapHandle; paths: Coordinates[]; fillOpacity: number; strokeColor: string; strokeWeight: number }) => PolygonHandle;
  Geocoder: new () => { geocode: (request: { address: string }) => Promise<{ results: { formatted_address: string; geometry: { location: { lat: () => number; lng: () => number } } }[] }> };
  event: { clearInstanceListeners: (instance: MapHandle | MarkerHandle | PolygonHandle) => void };
};
declare global { interface Window { google?: { maps: GoogleMaps } } }
let loaded: Promise<GoogleMaps> | null = null;
export const googleMapsConfigured = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
export function loadGoogleMaps(): Promise<GoogleMaps> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loaded) return loaded;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Map and address lookup are unavailable. Ask an administrator to configure Google Maps; coordinates can still be saved.'));
  loaded = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => { loaded = null; script.remove(); reject(new Error('Google Maps loading timed out. Check your network and API configuration.')); }, 20000);
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=quarterly`;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.google?.maps) resolve(window.google.maps);
      else { loaded = null; script.remove(); reject(new Error('Google Maps did not load. Check the API key, enabled APIs, billing, and allowed website referrers.')); }
    };
    script.onerror = () => { window.clearTimeout(timer); loaded = null; script.remove(); reject(new Error('Google Maps could not be reached. Check your network and Google Maps configuration.')); };
    document.head.append(script);
  });
  return loaded;
}
export async function geocodeAddress(address: string): Promise<{ position: Coordinates; address: string }> {
  const api = await loadGoogleMaps();
  const { results } = await new api.Geocoder().geocode({ address });
  if (!results.length) throw new Error('No location matched this address. Try a complete street address, city, and region.');
  const location = results[0].geometry.location;
  return { position: { lat: location.lat(), lng: location.lng() }, address: results[0].formatted_address };
}
