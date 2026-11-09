export const isKnownWorkspacePath = (pathname: string) =>
  !/^\/company\/automation(?:\/|$)/.test(pathname)
  && /^\/?(|home|customers(?:\/[^/]+)*|company(?:\/[^/]+)*|finance(?:\/[^/]+)*|operations(?:\/[^/]+)?|legal(?:\/[^/]+)?|engineering(?:\/[^/]+){0,2}|wildfire(?:\/[^/]+)*|help|settings|contact|insights(?:\/[^/]+)?|organization(?:\/[^/]+)?|programs(?:\/[^/]+)*|gtm(?:\/[^/]+)?|messages|channels|calendar|email|inbox|admin(?:\/[^/]+)?|systems|notifications|drive|docs(?:\/[^/]+)?|slides(?:\/[^/]+)?|sheets(?:\/[^/]+)?|forms(?:\/[^/]+)?)\/?$/.test(pathname);

// Old or moved URLs that should land on their current page instead of a 404.
export const legacyWorkspaceRedirect = (pathname: string, search = ''): string | null => {
  const path = pathname.replace(/\/+$/, '') || '/';
  const legacyForm = path.match(/^\/forms(?:\/([^/]+))?$/);
  if (legacyForm) return `/company/forms${legacyForm[1] ? `?form=${encodeURIComponent(legacyForm[1])}` : ''}`;
  if (path === '/tasks' || path === '/programs') return `/programs/tasks${search}`;
  const legacyTask = path.match(/^\/tasks\/([^/]+)$/);
  if (legacyTask) return `/programs/task/${legacyTask[1]}`;
  if (path === '/programs/calendar') return `/calendar${search}`;
  if (path === '/products') return '/engineering/software';
  const legacyProduct = path.match(/^\/products\/(.+)$/);
  if (legacyProduct) return `/engineering/${legacyProduct[1]}${search}`;
  if (path === '/wildfire' || path === '/wildfire/overview') return '/wildfire/opportunities';
  return null;
};
export type WorkspaceTab = 'home' | 'messages' | 'channels' | 'calendar' | 'admin' | 'customers' | 'company' | 'engineering' | 'settings' | 'insights' | 'programs' | 'wildfire' | 'systems';

export function workspaceTabFromPath(pathname: string): WorkspaceTab | null {
  const canonical = legacyWorkspaceRedirect(pathname)?.split('?')[0] ?? pathname;
  const segment = canonical.replace(/^\/+|\/+$/g, '').split('/')[0];
  if (!segment || ['home', 'operations', 'organization', 'email', 'inbox', 'notifications', 'drive', 'docs', 'slides', 'sheets'].includes(segment)) return 'home';
  if (segment === 'help') return 'customers';
  if (['company', 'finance', 'legal', 'gtm', 'forms'].includes(segment)) return 'company';
  if (segment === 'admin') return 'settings';
  if (['customers', 'engineering', 'wildfire', 'insights', 'programs', 'messages', 'channels', 'calendar', 'systems', 'settings'].includes(segment)) return segment as WorkspaceTab;
  return null;
}
