// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  load: vi.fn(), mapsCreated: vi.fn(), center: vi.fn(), remove: vi.fn(),
  clicks: undefined as undefined | ((event: { latlng: { lat: number; lng: number } }) => void),
  markerDrag: undefined as undefined | (() => void),
  rollback: vi.fn(), tileLayer: vi.fn(), tooltip: vi.fn(),
}));
vi.mock('./terrainMap', () => ({ loadTerrainMap: mock.load }));
import { SiteMap } from './SiteMap';
let root: Root;
let container: HTMLDivElement;
const noPoints: { lat: number; lng: number }[] = [];
describe('terrain site map', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} disconnect() {} } });
    vi.clearAllMocks();
    const map = { setView: vi.fn().mockReturnThis(), panTo: mock.center, remove: mock.remove, invalidateSize: vi.fn(), on: (event: string, callback: typeof mock.clicks) => { if (event === 'click') mock.clicks = callback; } };
    const layer = () => ({ on: vi.fn(), addTo: vi.fn().mockReturnThis() });
    mock.tileLayer.mockImplementation(layer);
    mock.load.mockResolvedValue({
      map: () => { mock.mapsCreated(); return map; },
      tileLayer: mock.tileLayer, control: { layers: layer }, divIcon: vi.fn(),
      marker: () => ({
        addTo: vi.fn().mockReturnThis(), bindTooltip: mock.tooltip,
        setLatLng: mock.rollback, getLatLng: () => ({ lat: 38, lng: -121 }),
        on: (_: string, callback: () => void) => { mock.markerDrag = callback; },
        off: vi.fn(), remove: vi.fn(),
      }),
      polygon: () => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() }),
    });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it('uses free attributed terrain tiles, preserves the map instance, and supports boundary clicks', async () => {
    const onPoint = vi.fn();
    const render = async (points = noPoints) => {
      await act(async () => root.render(<SiteMap center={{ lat: 37, lng: -122 }} placements={[]} boundary={null} boundaryPoints={points} onPoint={onPoint} onMove={vi.fn()} editable />));
    };
    await render();
    expect(mock.tileLayer.mock.calls[0][0]).toContain('opentopomap.org');
    expect(mock.tileLayer.mock.calls[0][1].attribution).toContain('CC-BY-SA');
    await act(async () => mock.clicks?.({ latlng: { lat: 37.1, lng: -122.1 } }));
    expect(onPoint).toHaveBeenCalledWith({ lat: 37.1, lng: -122.1 });
    await render([{ lat: 37, lng: -122 }]);
    expect(mock.mapsCreated).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-label="Interactive terrain site map"]')).not.toBeNull();
  });
  it('surfaces map failures with a coordinate fallback', async () => {
    mock.load.mockRejectedValue(new Error('Import failed.'));
    await act(async () => root.render(<SiteMap center={{ lat: 0, lng: 0 }} placements={[]} boundary={null} boundaryPoints={noPoints} onPoint={vi.fn()} onMove={vi.fn()} editable />));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('continue using coordinates');
  });
  it('restores saved positions after a failed drag, and treats labels as plain text', async () => {
    const placement = { id: 'camera', site_plan_id: 'plan', product_id: null, placement_type: 'camera', label: '<img src=x onerror=alert(1)>', latitude: 37, longitude: -122, heading_degrees: null, horizontal_fov_degrees: null, notes: '' };
    const onMove = vi.fn().mockRejectedValue(new Error('row violates row-level security policy'));
    await act(async () => root.render(<SiteMap center={{ lat: 37, lng: -122 }} placements={[placement]} boundary={null} boundaryPoints={noPoints} onPoint={vi.fn()} onMove={onMove} editable />));
    expect(mock.tooltip.mock.calls[0][0].querySelector('img')).toBeNull();
    await act(async () => mock.markerDrag?.());
    expect(onMove).toHaveBeenCalledWith('camera', { lat: 38, lng: -121 });
    expect(mock.rollback).toHaveBeenCalledWith({ lat: 37, lng: -122 });
    expect(container.querySelector('[role=alert]')?.textContent).toContain('permission');
    expect(container.textContent).not.toContain('row-level security');
  });
  it('does not place equipment for a read-only viewer', async () => {
    const onPoint = vi.fn();
    await act(async () => root.render(<SiteMap center={{ lat: 0, lng: 0 }} placements={[]} boundary={null} boundaryPoints={noPoints} onPoint={onPoint} onMove={vi.fn()} editable={false} />));
    mock.clicks?.({ latlng: { lat: 0, lng: 0 } });
    expect(onPoint).not.toHaveBeenCalled();
  });
});
