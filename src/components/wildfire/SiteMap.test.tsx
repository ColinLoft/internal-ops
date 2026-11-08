// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  load: vi.fn(),
  mapsCreated: vi.fn(),
  center: vi.fn(),
  clicks: undefined as undefined | ((event: { latLng: { lat: () => number; lng: () => number } }) => void),
  clear: vi.fn(),
  markerDrag: undefined as undefined | (() => void),
  rollback: vi.fn(),
}));
vi.mock('./googleMaps', () => ({ loadGoogleMaps: mock.load }));
import { SiteMap } from './SiteMap';
let root: Root;
let container: HTMLDivElement;
const noPoints: { lat: number; lng: number }[] = [];
describe('satellite site map', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    const api = {
      Map: class {
        constructor() { mock.mapsCreated(); }
        setCenter = mock.center;
        addListener = (_: string, callback: typeof mock.clicks) => { mock.clicks = callback; return { remove: vi.fn() }; };
      },
      Marker: class {
        setMap = vi.fn();
        setPosition = mock.rollback;
        getPosition = () => ({ lat: () => 38, lng: () => -121 });
        addListener = (_: string, callback: () => void) => { mock.markerDrag = callback; return { remove: vi.fn() }; };
      },
      Polygon: class {},
      Geocoder: class {},
      event: { clearInstanceListeners: mock.clear },
    };
    mock.load.mockResolvedValue(api);
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it('keeps map instance and viewport stable while changing callbacks or drawing a boundary', async () => {
    const onPoint = vi.fn();
    const render = async (points = noPoints) => {
      await act(async () => root.render(<SiteMap center={{ lat: 37, lng: -122 }} placements={[]} boundary={null} boundaryPoints={points} onPoint={onPoint} onMove={vi.fn()} editable />));
    };
    await render();
    await act(async () => mock.clicks?.({ latLng: { lat: () => 37.1, lng: () => -122.1 } }));
    expect(onPoint).toHaveBeenCalledWith({ lat: 37.1, lng: -122.1 });
    await render([{ lat: 37, lng: -122 }]);
    expect(mock.mapsCreated).toHaveBeenCalledTimes(1);
  });
  it('surfaces missing API configuration rather than rendering a fake map', async () => {
    mock.load.mockRejectedValue(new Error('Google Maps is not configured.'));
    await act(async () => root.render(<SiteMap center={{ lat: 0, lng: 0 }} placements={[]} boundary={null} boundaryPoints={noPoints} onPoint={vi.fn()} onMove={vi.fn()} editable />));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Google Maps is not configured');
  });
  it('restores the saved equipment position when a drag cannot be persisted', async () => {
    const placement = { id: 'camera', site_plan_id: 'plan', product_id: null, placement_type: 'camera', label: 'Camera', latitude: 37, longitude: -122, heading_degrees: null, horizontal_fov_degrees: null, notes: '' };
    const onMove = vi.fn().mockRejectedValue(new Error('Position could not be saved.'));
    await act(async () => root.render(<SiteMap center={{ lat: 37, lng: -122 }} placements={[placement]} boundary={null} boundaryPoints={noPoints} onPoint={vi.fn()} onMove={onMove} editable />));
    await act(async () => mock.markerDrag?.());
    expect(onMove).toHaveBeenCalledWith('camera', { lat: 38, lng: -121 });
    expect(mock.rollback).toHaveBeenCalledWith({ lat: 37, lng: -122 });
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Position could not be saved');
  });
});
