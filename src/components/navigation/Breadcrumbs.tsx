import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { appLabels } from './TopBar';
import { getSectionTabs, isSectionSelected } from './sectionTabs';

/** Compact "where am I" trail shown above every module except Home. */
export const Breadcrumbs: React.FC = () => {
  const { activeTab, setActiveTab } = useWorkspace();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  if (activeTab === 'home' || !appLabels[activeTab]) return null;
  const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
  const section = getSectionTabs(activeTab, trimmed)?.find((item) => isSectionSelected(item, trimmed));
  const detail = /^\/programs\/(project|task)\//.test(trimmed) ? (trimmed.includes('/project/') ? 'Project' : 'Task') : null;
  const crumbs = [
    { label: 'Home', go: () => setActiveTab('home') },
    { label: appLabels[activeTab], go: () => { window.history.pushState({}, '', section ? (getSectionTabs(activeTab, trimmed)?.[0].path ?? trimmed) : trimmed); window.dispatchEvent(new PopStateEvent('popstate')); } },
    ...(section && section.label !== appLabels[activeTab] ? [{ label: section.label, go: () => { window.history.pushState({}, '', section.path); window.dispatchEvent(new PopStateEvent('popstate')); } }] : []),
    ...(detail ? [{ label: detail, go: undefined as (() => void) | undefined }] : []),
  ];

  return (
    <nav aria-label="Breadcrumb" className="flex h-8 shrink-0 items-center gap-1.5 border-b border-slate-200/60 bg-white/70 px-4 text-[11px] text-slate-500 backdrop-blur-xs">
      {crumbs.map((crumb, index) => (
        <React.Fragment key={`${crumb.label}-${index}`}>
          {index > 0 && <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden />}
          {index === crumbs.length - 1 || !crumb.go
            ? <span aria-current="page" className="font-medium text-slate-700">{crumb.label}</span>
            : <button type="button" onClick={crumb.go} className="text-slate-500 hover:text-slate-900 transition-colors">{crumb.label}</button>}
        </React.Fragment>
      ))}
    </nav>
  );
};
