import {
  CheckSquare, Headset, House, ContactRound, Building2, ListChecks, BookOpen, BarChart3, Users, ShieldCheck, CheckCircle2,
  Landmark, Target, WalletCards, Receipt, CreditCard, BriefcaseBusiness, FolderKanban, Network, Code2,
  Megaphone, Gauge, AlertTriangle, Layers3, FileCheck2, GitBranch, ClipboardList, FileText,
  CalendarRange, Calendar as CalendarIcon, type LucideIcon,
} from 'lucide-react';

export interface SectionTab {
  label: string;
  short: string;
  icon: LucideIcon;
  path: string;
  matches?: string[];
}

const tab = (label: string, short: string, icon: LucideIcon, path: string, matches?: string[]): SectionTab => ({ label, short, icon, path, matches });

const trim = (path: string) => (path.length > 1 ? path.replace(/\/$/, '') : path);

export const isSectionSelected = (item: SectionTab, routePath: string) => {
  const current = trim(routePath);
  return current === item.path || !!item.matches?.includes(current);
};

// Section navigation for each app, mirrored by the desktop Rail. Returns null for the workspace tabs.
export const getSectionTabs = (activeTab: string, routePath: string): SectionTab[] | null => {
  switch (activeTab) {
    case 'programs':
      return [
        tab('Projects', 'Projects', FolderKanban, '/programs', ['/programs/projects']),
        tab('Tasks', 'Tasks', CheckSquare, '/programs/tasks'),
      ];
    case 'organization':
      return [
        tab('Directory', 'Directory', Users, '/organization/people', ['/organization']),
        tab('Organizational Chart', 'Chart', Network, '/organization/overview'),
        tab('Departments', 'Depts', Building2, '/organization/departments'),
        tab('Positions & Roles', 'Roles', BriefcaseBusiness, '/organization/positions'),
        tab('Leave', 'Leave', ClipboardList, '/organization/onboarding'),
        tab('Personnel Records', 'Records', FileText, '/organization/records'),
        tab('Policies & Procedures', 'Policies', BookOpen, '/organization/policies'),
        tab('Workflows & Approvals', 'Approvals', CheckCircle2, '/organization/approvals'),
      ];
    case 'insights':
      return [
        tab('Executive Overview', 'Overview', House, '/insights'),
        tab('Projects & Tasks', 'Work', FolderKanban, '/insights/programs'),
        tab('Financial Reports', 'Financial', Landmark, '/insights/financial'),
        tab('Departments', 'Depts', Users, '/insights/projects'),
        tab('Activity & Usage', 'Activity', BarChart3, '/insights/custom'),
      ];
    case 'customers':
      return [
        tab('Overview', 'Overview', House, '/customers'),
        tab('Contacts', 'Contacts', ContactRound, '/customers/contacts'),
        tab('Organizations', 'Orgs', Building2, '/customers/organizations'),
        tab('Interactions', 'Activity', ListChecks, '/customers/activity'),
        tab('Support', 'Support', Headset, '/customers/support', ['/help']),
      ];
    case 'finance':
      return [
        tab('Grants', 'Grants', Landmark, '/finance/grants'),
        tab('Find Grants', 'Find', Target, '/finance/prospects'),
        tab('Resources', 'Library', BookOpen, '/finance/resources'),
      ];
    case 'gtm':
      return [
        tab('Overview', 'Overview', House, '/gtm'),
        tab('Marketing', 'Marketing', Target, '/gtm/marketing'),
        tab('Content Calendar', 'Calendar', CalendarIcon, '/gtm/calendar'),
        tab('Communications', 'Comms', Megaphone, '/gtm/communications'),
        tab('Brand Management', 'Brand', Network, '/gtm/brand'),
        tab('Media & Content', 'Media', FileText, '/gtm/content'),
        tab('Partnerships', 'Partners', Users, '/gtm/partnerships'),
        tab('Business Development', 'Biz Dev', BriefcaseBusiness, '/gtm/business-development'),
      ];
    case 'engineering':
      return [
        tab('Overview', 'Overview', House, '/engineering'),
        tab('Products & Systems', 'Products', Layers3, '/engineering/products'),
        tab('Requirements', 'Reqs', FileCheck2, '/engineering/requirements'),
        tab('Design Documentation', 'Design', BookOpen, '/engineering/design'),
        tab('CAD & PCB Records', 'CAD/PCB', Code2, '/engineering/cad-pcb'),
        tab('Testing & Validation', 'Testing', CheckCircle2, '/engineering/testing'),
        tab('Engineering Changes', 'Changes', GitBranch, '/engineering/changes'),
        tab('Technical Reviews', 'Reviews', ShieldCheck, '/engineering/reviews'),
      ];
    case 'legal':
      return [
        tab('Overview', 'Overview', House, '/legal'),
        tab('Contracts & Agreements', 'Contracts', FileText, '/legal/contracts'),
        tab('Compliance', 'Compliance', ShieldCheck, '/legal/compliance'),
        tab('Risk Management', 'Risk', AlertTriangle, '/legal/risk'),
        tab('Policies', 'Policies', BookOpen, '/legal/policies'),
        tab('Legal Records', 'Records', ClipboardList, '/legal/records'),
      ];
    default:
      return null;
  }
};
