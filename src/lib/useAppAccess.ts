import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type AppAccessMap = Record<string, number>;

let cache: Promise<AppAccessMap> | null = null;
const fetchAll = (): Promise<AppAccessMap> => {
  cache ??= Promise.resolve(supabase.rpc('my_app_access')).then(({ data }) => (data && typeof data === 'object' ? data as AppAccessMap : {}));
  return cache;
};
// Call after sign-out or when roles change so the next read is fresh.
export const resetAppAccessCache = () => { cache = null; };

// Mirrors public.app_access_level: 0 none, 1 view, 2 edit, 3 manage.
export const useAllAppAccess = () => {
  const [levels, setLevels] = useState<AppAccessMap | null>(null);
  useEffect(() => {
    let active = true;
    void fetchAll().then((map) => { if (active) setLevels(map); });
    return () => { active = false; };
  }, []);
  return levels;
};

export const useAppAccess = (app: string) => {
  const levels = useAllAppAccess();
  const level = levels?.[app] ?? 0;
  return { level, loaded: levels !== null, canView: level >= 1, canEdit: level >= 2, canManage: level >= 3 };
};
