import React, { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { loadTerrainMap } from './terrainMap';
import { userFacingError } from '../../lib/userFacingError';
import type { Coordinates, Placement, SitePlan } from './model';

export function SiteMap({ center, placements, boundary, boundaryPoints, onPoint, onMove, editable }: {
  center: Coordinates; placements: Placement[]; boundary: SitePlan['boundary_geojson'];
  boundaryPoints: Coordinates[]; onPoint: (point: Coordinates) => void;
  onMove: (id: string, position: Coordinates) => Promise<void>; editable: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<{ api: Awaited<ReturnType<typeof loadTerrainMap>>; map: LeafletMap } | null>(null);
  const pointRef = useRef(onPoint);
  const moveRef = useRef(onMove);
  const editableRef = useRef(editable);
  const initialCenter = useRef(center);
  pointRef.current = onPoint;
  moveRef.current = onMove;
  editableRef.current = editable;
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    setError('');
    void loadTerrainMap().then(api => {
      if (disposed || !element.current) return;
      const map = api.map(element.current, { scrollWheelZoom: false }).setView(initialCenter.current, 16);
      const terrain = api.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 17, maxZoom: 20,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Map style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      });
      const streets = api.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
      const tileError = () => setError('Map tiles could not be loaded. Check your connection, switch to Streets, or continue using coordinates.');
      terrain.on('tileerror', tileError); streets.on('tileerror', tileError);
      map.on('baselayerchange', () => setError(''));
      terrain.addTo(map);
      api.control.layers({ Terrain: terrain, Streets: streets }).addTo(map);
      map.on('click', event => {
        if (editableRef.current) pointRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      });
      const resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(element.current);
      cleanups.push(() => { resize.disconnect(); map.remove(); });
      setReady({ api, map });
    }).catch(cause => { if (!disposed) setError(userFacingError(cause, 'The map could not be loaded. Reload the page, or continue using coordinates.')); });
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); };
  }, []);
  useEffect(() => {
    ready?.map.panTo(center);
  }, [ready, center.lat, center.lng]);
  useEffect(() => {
      if (!ready) return;
      const { api, map } = ready;
      const cleanups: (() => void)[] = [];
      placements.forEach((item, index) => {
        const marker = api.marker([item.latitude, item.longitude], {
          title: item.label, alt: item.label, draggable: editable,
          icon: api.divIcon({ className: 'site-equipment-marker', html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#2563eb;color:#fff;font-weight:700">${index + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        }).addTo(map);
        const label = document.createElement('span');
        label.textContent = item.label;
        marker.bindTooltip(label);
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          if (position) {
            setError('');
            void moveRef.current(item.id, { lat: position.lat, lng: position.lng }).catch(cause => {
              setError(userFacingError(cause, 'Equipment position could not be saved. It has been restored; retry the move.'));
              marker.setLatLng({ lat: item.latitude, lng: item.longitude });
            });
          }
        });
        cleanups.push(() => { marker.off(); marker.remove(); });
      });
      const paths = boundaryPoints.length ? boundaryPoints : (boundary?.coordinates[0] ?? []).map(([lng, lat]) => ({ lat, lng }));
      if (paths.length > 1) {
        const polygon = api.polygon(paths, { fillOpacity: 0.12, color: '#2569f5', weight: 2 }).addTo(map);
        cleanups.push(() => polygon.remove());
      }
      return () => cleanups.forEach(cleanup => cleanup());
  }, [ready, placements, boundary, boundaryPoints, editable]);
  return <div>
    {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!ready && !error && <p role="status" className="mb-3 text-sm text-slate-500">Loading terrain map…</p>}
    <div ref={element} aria-label="Interactive terrain site map" className={error && !ready ? 'hidden' : 'relative z-0 h-[min(60dvh,34rem)] min-h-72 w-full rounded-lg bg-black'} />
  </div>;
}
