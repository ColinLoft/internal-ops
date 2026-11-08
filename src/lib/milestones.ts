export type Milestone = 'grant' | 'task' | 'project' | 'quote' | 'deployment';
export const MILESTONE_EVENT = 'flown-milestone';
const finalStatus: Record<Milestone, string> = {
  grant: 'awarded', task: 'completed', project: 'completed', quote: 'accepted', deployment: 'completed',
};

export function motionReduced() {
  return document.documentElement.dataset.motion === 'reduced'
    || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Call only from the actor's mutation handler, with the status returned by persistence. */
export function celebrateMilestone(kind: Milestone, id: string, before: string | undefined, saved: string | undefined) {
  if (!id || !before || saved !== finalStatus[kind] || before === saved || motionReduced()) return;
  window.dispatchEvent(new CustomEvent(MILESTONE_EVENT, { detail: { kind, id } }));
}

export function createMilestoneGate() {
  const seen = new Set<string>();
  let last = -Infinity;
  return (kind: Milestone, id: string, now: number) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 100) seen.delete(seen.values().next().value!);
    if (now - last < 8000) return false;
    last = now;
    return true;
  };
}
