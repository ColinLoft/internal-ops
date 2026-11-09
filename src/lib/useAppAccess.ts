import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type AppAccessMap = Record<string, number>;

let cache: Promise<AppAccessMap> | null = null;
let resolved: AppAccessMap | null = null;
let generation = 0;
const fetchAll = (): Promise<AppAccessMap> => {
  const currentGeneration = generation;
  cache ??= Promise.resolve(supabase.rpc('my_app_access')).then(({ data, error }) => {
    if (generation !== currentGeneration) return fetchAll();
    if (error) {
      console.error('Workspace access could not be loaded:', error);
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Workspace access returned an invalid response.');
    if (!Object.values(data).every(value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3)) throw new Error('Workspace access returned invalid permission levels.');
    const map = data as AppAccessMap;
    if (generation === currentGeneration) resolved = map;
    return map;
  }).catch(error => {
    if (generation === currentGeneration) cache = null;
    throw error;
  });
  return cache;
};
// Call after sign-out or when roles change so the next read is fresh.
export const resetAppAccessCache = () => { generation++; cache = null; resolved = null; };
export const preloadAppAccess = () => fetchAll();

// Mirrors public.app_access_level: 0 none, 1 view, 2 edit, 3 manage.
const useAccessState = () => {
  const [levels, setLevels] = useState<AppAccessMap | null>(() => resolved);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void fetchAll().then((map) => { if (active) setLevels(map); }).catch((cause) => {
      console.error('Workspace permissions are unavailable:', cause);
      if (active) {
        setLevels(null);
        setError('Workspace permissions could not be loaded. Retry or reload the page.');
      }
    });
    return () => { active = false; };
  }, [attempt]);
  return { levels, error, retry: () => { resetAppAccessCache(); setAttempt(value => value + 1); } };
};

export const useAllAppAccess = () => useAccessState().levels;

export const useAppAccess = (app: string) => {
  const { levels, error, retry } = useAccessState();
  const level = levels?.[app] ?? 0;
  return { level, loaded: levels !== null, canView: level >= 1, canEdit: level >= 2, canManage: level >= 3, error, retry };
};
