import React, { useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Check } from 'lucide-react';
import { createMilestoneGate, MILESTONE_EVENT, motionReduced, type Milestone } from '../../lib/milestones';

const labels: Record<Milestone, string> = {
  grant: 'Grant awarded', task: 'Task completed', project: 'Project completed',
  quote: 'Quote accepted', deployment: 'Deployment completed',
};

export function MotionEffects({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(motionReduced);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const gate = useRef(createMilestoneGate());
  useEffect(() => {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const next = motionReduced();
      setReduced(next);
      if (next) { clearTimeout(timer); setMilestone(null); }
    };
    const celebrate = (event: Event) => {
      const { kind, id } = (event as CustomEvent<{ kind: Milestone; id: string }>).detail;
      if (motionReduced() || !Object.prototype.hasOwnProperty.call(labels, kind) || !gate.current(kind, id, Date.now())) return;
      setMilestone(kind);
      clearTimeout(timer);
      timer = setTimeout(() => setMilestone(null), 1800);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    media?.addEventListener('change', update);
    window.addEventListener(MILESTONE_EVENT, celebrate);
    update();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      media?.removeEventListener('change', update);
      window.removeEventListener(MILESTONE_EVENT, celebrate);
    };
  }, []);
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
    {children}
    {milestone && !reduced && <>
      <div className="flown-confetti" aria-hidden="true">
        {Array.from({ length: milestone === 'task' ? 32 : 40 }, (_, index) => {
          const direction = index % 2 === 0 ? 1 : -1;
          const reach = milestone === 'task' ? 0.65 : 1;
          return <i key={index} className={direction === 1 ? 'flown-confetti-left' : 'flown-confetti-right'} style={{
            '--confetti-x': `${direction * (12 + (index * 17 % 38)) * reach}vw`,
            '--confetti-peak': `${-(32 + (index * 13 % 30)) * reach}vh`,
            '--confetti-end': `${-(6 + (index * 7 % 16)) * reach}vh`,
            '--confetti-spin': `${direction * (280 + index * 47)}deg`,
            '--confetti-delay': `${index % 5 * 20}ms`,
          } as React.CSSProperties} />;
        })}
      </div>
      <div className="flown-milestone" aria-hidden="true">
        <Check size={20} strokeWidth={2.5} /><span>{labels[milestone]}</span>
      </div>
    </>}
  </MotionConfig>;
}
