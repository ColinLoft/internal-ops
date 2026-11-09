import {
  CheckSquare, Headset, House, Building2, BookOpen, BarChart3, ShieldCheck,
  Landmark, Target, FolderKanban, Code2, Cog, Cable, Network,
  FileText, MapPin, Package, ClipboardList, Truck, Siren,
  Calendar as CalendarIcon, type LucideIcon,
} from 'lucide-react';

export interface SectionTab {
  label: string;
  short: string;
  icon: LucideIcon;
  path: string;
  matches?: string[];
  access?: string;
}

const tab = (label: string, short: string, icon: LucideIcon, path: string, matches?: string[], access?: string): SectionTab => ({ label, short, icon, path, matches, access });

const trim = (path: string) => (path.length > 1 ? path.replace(/\/$/, '') : path);

export const isSectionSelected = (item: SectionTab, routePath: string) => {
  const current = trim(routePath);
  return current === item.path || !!item.matches?.includes(current) || (item.path.startsWith('/engineering/') && current.startsWith(`${item.path}/`)) || (item.path === '/programs/tasks' && current.startsWith('/programs/task/'));
};

// Section navigation for each app, mirrored by the desktop Rail. Returns null for the workspace tabs.
export const getSectionTabs = (activeTab: string, _routePath: string): SectionTab[] | null => {
  switch (activeTab) {
    case 'programs':
      return [
        tab('Tasks', 'Tasks', CheckSquare, '/programs/tasks', ['/programs']),
      ];
    case 'insights':
      return [
        tab('Executive Overview', 'Overview', House, '/insights'),
        tab('Projects & Tasks', 'Work', FolderKanban, '/insights/programs'),
        tab('Financial Reports', 'Financial', Landmark, '/insights/financial'),
        tab('Activity & Usage', 'Activity', BarChart3, '/insights/custom'),
      ];
    case 'customers':
      return [
        tab('Companies', 'Companies', Building2, '/customers/organizations', ['/customers/companies', '/customers/contacts', '/customers']),
        tab('Contracts', 'Contracts', FileText, '/customers/contracts'),
        tab('Support', 'Support', Headset, '/customers/support', ['/help']),
      ];
    case 'company':
      return [
        tab('Forms', 'Forms', ClipboardList, '/company/forms', ['/company', '/company/ideas']),
        tab('Grants', 'Grants', Landmark, '/company/grants', undefined, 'finance'),
        tab('Find Grants', 'Find', Target, '/company/find-grants', ['/company/prospects'], 'finance'),
        tab('Grant Resources', 'Library', BookOpen, '/company/resources', undefined, 'finance'),
        tab('Marketing', 'Marketing', CalendarIcon, '/company/marketing', ['/company/calendar'], 'gtm'),
        tab('Website', 'Website', ShieldCheck, '/company/website', ['/company/policies'], 'legal'),
      ];
    case 'engineering':
      return [
        tab('Software', 'Software', Code2, '/engineering/software'),
        tab('Mechanical', 'Mechanical', Cog, '/engineering/mechanical'),
        tab('Electrical', 'Electrical', Cable, '/engineering/electrical'),
        tab('Systems engineering', 'Sys eng', Network, '/engineering/systems'),
        tab('Review', 'Review', ShieldCheck, '/engineering/review'),
      ];
    case 'wildfire':
      return [
        tab('Opportunities', 'Opportunities', Target, '/wildfire/opportunities', ['/wildfire', '/wildfire/overview']),
        tab('Site planner', 'Planner', MapPin, '/wildfire/site-planner'),
        tab('Quotes & proposals', 'Quotes', FileText, '/wildfire/quotes', ['/wildfire/proposals']),
        tab('Deployments', 'Deployments', Truck, '/wildfire/deployments'),
        tab('Product catalog', 'Catalog', Package, '/wildfire/catalog'),
        tab('Customer requests', 'Requests', Headset, '/wildfire/requests'),
        tab('System alerts', 'Alerts', Siren, '/wildfire/alerts'),
      ];
    default:
      return null;
  }
};
