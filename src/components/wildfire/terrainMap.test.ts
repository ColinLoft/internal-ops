// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('explicit free address lookup', () => {
  it('sends only an explicitly submitted address and caches repeated requests', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [-122, 37] }, properties: { housenumber: '123', street: 'Example Street', city: 'Example City' } }] }) }));
    vi.stubGlobal('fetch', fetch);
    const { geocodeAddress } = await import('./terrainMap');
    const result = await geocodeAddress('123 Example Street, Example City');
    expect(result).toEqual({ position: { lat: 37, lng: -122 }, address: '123 Example Street, Example City' });
    expect(fetch).toHaveBeenCalledWith('https://photon.komoot.io/api/?q=123%20Example%20Street%2C%20Example%20City&limit=1', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
    await geocodeAddress('123 Example Street, Example City');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid provider coordinates without creating a site', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [300, 100] } }] }) })));
    const { geocodeAddress } = await import('./terrainMap');
    await expect(geocodeAddress('123 Example Street')).rejects.toThrow('Use coordinates instead');
  });
  it('makes an unavailable service actionable rather than silently failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const { geocodeAddress } = await import('./terrainMap');
    await expect(geocodeAddress('123 Example Street')).rejects.toThrow('enter coordinates');
  });
});
