import {
  House, ContactRound, Building2, ListChecks, BookOpen, BarChart3, Users, ShieldCheck, CheckCircle2,
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
    case 'programs': {
      const segments = routePath.split('/');
      const programId = segments[2] === 'program' ? segments[3] : null;
      const to = (section: string) => (section === 'all' ? '/programs' : programId ? `/programs/program/${programId}${section === 'overview' ? '' : `/${section}`}` : `/programs/${section}`);
      return [
        tab('All Programs', 'All', Gauge, to('all')),
        tab('Program Overview', 'Overview', Network, to('overview')),
        tab('Projects & Tasks', 'Projects', FolderKanban, to('projects')),
        tab('Team & Personnel', 'Team', Users, to('team')),
        tab('Budget & Funding', 'Budget', WalletCards, to('budgets')),
        tab('Timeline', 'Timeline', CalendarRange, to('timeline')),
        tab('Milestones', 'Milestones', Target, to('milestones')),
        tab('Documentation', 'Docs', BookOpen, to('documents')),
        tab('Reports', 'Reports', BarChart3, to('reports')),
      ];
    }
    case 'organization':
      return [
        tab('Directory', 'Directory', Users, '/organization/people', ['/organization']),
        tab('Organizational Chart', 'Chart', Network, '/organization/overview'),
        tab('Departments', 'Depts', Building2, '/organization/departments'),
        tab('Positions & Roles', 'Roles', BriefcaseBusiness, '/organization/positions'),
        tab('Onboarding', 'Onboarding', ClipboardList, '/organization/onboarding'),
        tab('Personnel Records', 'Records', FileText, '/organization/records'),
      ];
    case 'insights':
      return [
        tab('Executive Overview', 'Overview', House, '/insights'),
        tab('Program Performance', 'Programs', Target, '/insights/programs'),
        tab('Financial Reports', 'Financial', Landmark, '/insights/financial'),
        tab('Project Reports', 'Projects', FolderKanban, '/insights/projects'),
        tab('Custom Reports', 'Custom', BarChart3, '/insights/custom'),
      ];
    case 'customers':
      return [
        tab('Overview', 'Overview', House, '/customers'),
        tab('Contacts', 'Contacts', ContactRound, '/customers/contacts'),
        tab('Organizations', 'Orgs', Building2, '/customers/organizations'),
        tab('Interactions', 'Activity', ListChecks, '/customers/activity'),
      ];
    case 'finance':
      return [
        tab('Overview', 'Overview', House, '/finance'),
        tab('Budgets', 'Budgets', WalletCards, '/finance/budgets'),
        tab('Grants', 'Grants', Landmark, '/finance/grants'),
        tab('Funding Requests', 'Funding', Target, '/finance/funding-requests'),
        tab('Expenses', 'Expenses', Receipt, '/finance/expenses'),
        tab('Procurement', 'Procure', CreditCard, '/finance/procurement'),
        tab('Accounting & Reports', 'Reports', BarChart3, '/finance/accounting-reports'),
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
    case 'operations':
      return [
        tab('Overview', 'Overview', House, '/operations'),
        tab('Administration', 'Admin', ListChecks, '/operations/administration'),
        tab('People Operations', 'People', Users, '/operations/people'),
        tab('Policies & Procedures', 'Policies', BookOpen, '/operations/policies'),
        tab('Resource Coordination', 'Resources', BriefcaseBusiness, '/operations/resources'),
        tab('Internal Workflows', 'Workflows', CheckCircle2, '/operations/workflows'),
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
