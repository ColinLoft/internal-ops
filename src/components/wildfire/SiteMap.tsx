import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, type GoogleMaps, type MapHandle } from './googleMaps';
import type { Coordinates, Placement, SitePlan } from './model';

export function SiteMap({ center, placements, boundary, boundaryPoints, onPoint, onMove, editable }: {
  center: Coordinates; placements: Placement[]; boundary: SitePlan['boundary_geojson'];
  boundaryPoints: Coordinates[]; onPoint: (point: Coordinates) => void;
  onMove: (id: string, position: Coordinates) => Promise<void>; editable: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<{ api: GoogleMaps; map: MapHandle } | null>(null);
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
    void loadGoogleMaps().then(api => {
      if (disposed || !element.current) return;
      const map = new api.Map(element.current, { center: initialCenter.current, zoom: 17, mapTypeId: 'satellite', streetViewControl: false });
      const click = map.addListener('click', event => {
        if (editableRef.current && event.latLng) pointRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      cleanups.push(() => { click.remove(); api.event.clearInstanceListeners(map); });
      setReady({ api, map });
    }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : 'Map could not be loaded.'); });
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); };
  }, []);
  useEffect(() => {
    ready?.map.setCenter(center);
  }, [ready, center.lat, center.lng]);
  useEffect(() => {
      if (!ready) return;
      const { api, map } = ready;
      const cleanups: (() => void)[] = [];
      placements.forEach((item, index) => {
        const marker = new api.Marker({ map, position: { lat: item.latitude, lng: item.longitude }, title: item.label, label: String(index + 1), draggable: editable });
        const drag = marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (position) {
            setError('');
            void moveRef.current(item.id, { lat: position.lat(), lng: position.lng() }).catch(cause => {
              setError(cause instanceof Error ? cause.message : 'Equipment position could not be saved.');
              marker.setPosition({ lat: item.latitude, lng: item.longitude });
            });
          }
        });
        cleanups.push(() => { drag.remove(); api.event.clearInstanceListeners(marker); marker.setMap(null); });
      });
      const paths = boundaryPoints.length ? boundaryPoints : (boundary?.coordinates[0] ?? []).map(([lng, lat]) => ({ lat, lng }));
      if (paths.length > 1) {
        const polygon = new api.Polygon({ map, paths, fillOpacity: 0.12, strokeColor: '#2569f5', strokeWeight: 2 });
        cleanups.push(() => { api.event.clearInstanceListeners(polygon); polygon.setMap(null); });
      }
      return () => cleanups.forEach(cleanup => cleanup());
  }, [ready, placements, boundary, boundaryPoints, editable]);
  return <div>
    {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!ready && !error && <p role="status" className="mb-3 text-sm text-slate-500">Loading satellite map…</p>}
    <div ref={element} aria-label="Interactive satellite site map" className={error && !ready ? 'hidden' : 'h-[min(60dvh,34rem)] min-h-72 w-full rounded-lg bg-slate-100'} />
  </div>;
}
