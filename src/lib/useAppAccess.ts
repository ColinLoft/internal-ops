import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Mirrors public.app_access_level: 0 none, 1 view, 2 edit, 3 manage.
export const useAppAccess = (app: string) => {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let active = true;
    supabase.rpc('app_access_level', { p_app: app }).then(({ data }) => {
      if (active && typeof data === 'number') setLevel(data);
    });
    return () => { active = false; };
  }, [app]);
  return { level, canView: level >= 1, canEdit: level >= 2, canManage: level >= 3 };
};
