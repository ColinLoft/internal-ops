import {
  CheckSquare, Headset, House, ContactRound, Building2, ListChecks, BookOpen, BarChart3, Users, ShieldCheck, CheckCircle2,
  Landmark, Target, FolderKanban, Code2,
  Layers3, FileCheck2, GitBranch, FileText,
  Calendar as CalendarIcon, Lightbulb, type LucideIcon,
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
        tab('Customers', 'Customers', Building2, '/customers/organizations'),
        tab('Pipeline', 'Pipeline', GitBranch, '/customers/pipeline'),
        tab('Interactions', 'Activity', ListChecks, '/customers/activity'),
        tab('Support', 'Support', Headset, '/customers/support', ['/help']),
      ];
    case 'company':
      return [
        tab('Ideas', 'Ideas', Lightbulb, '/company/ideas', ['/company']),
        tab('Grants', 'Grants', Landmark, '/company/grants', undefined, 'finance'),
        tab('Find Grants', 'Find', Target, '/company/prospects', undefined, 'finance'),
        tab('Grant Resources', 'Library', BookOpen, '/company/resources', undefined, 'finance'),
        tab('Content Calendar', 'Calendar', CalendarIcon, '/company/calendar', undefined, 'gtm'),
        tab('Contracts', 'Contracts', FileText, '/company/contracts', undefined, 'legal'),
        tab('Policies', 'Policies', ShieldCheck, '/company/policies', undefined, 'legal'),
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
    default:
      return null;
  }
};
