import React, { useEffect, useState } from 'react';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { ReviewPage } from './ReviewPage';
import { type Discipline, DISCIPLINES } from './shared';

type Route = { kind: 'list'; discipline: Discipline } | { kind: 'project'; id: string } | { kind: 'review'; id: string | null };

const parse = (path: string): Route => {
  const [, , segment, id] = path.split('/');
  if (segment === 'review') return { kind: 'review', id: id || null };
  const discipline = DISCIPLINES.find((item) => item.id === segment)?.id ?? 'software';
  return id ? { kind: 'project', id } : { kind: 'list', discipline };
};

export const EngineeringPage: React.FC = () => {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));
  useEffect(() => {
    const sync = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  if (route.kind === 'review') return <ReviewPage reviewId={route.id} />;
  if (route.kind === 'project') return <ProjectDetail key={route.id} projectId={route.id} />;
  return <ProjectList key={route.discipline} discipline={route.discipline} />;
};
