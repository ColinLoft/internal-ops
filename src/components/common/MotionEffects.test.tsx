// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionEffects } from './MotionEffects';
import { celebrateMilestone, createMilestoneGate, MILESTONE_EVENT, type Milestone } from '../../lib/milestones';

describe('actor-local milestone motion', () => {
  let root: Root;
  let container: HTMLDivElement;
  let systemReduced: boolean;
  let mediaChange: () => void;
  const emit = (kind: Milestone = 'task', id = 'task-1', before = 'in_progress', saved = 'completed') => celebrateMilestone(kind, id, before, saved);
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    systemReduced = false;
    mediaChange = () => {};
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return systemReduced; },
      addEventListener: (_: string, callback: () => void) => { mediaChange = callback; },
      removeEventListener: vi.fn(),
    }));
    delete document.documentElement.dataset.motion;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete document.documentElement.dataset.motion;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const render = async () => { await act(async () => root.render(<MotionEffects><button>Keep working</button></MotionEffects>)); };

  it.each([['grant', 'awarded'], ['task', 'completed'], ['project', 'completed'], ['quote', 'accepted'], ['deployment', 'completed']] as const)('celebrates the confirmed %s transition briefly and silently', async (kind, saved) => {
    await render();
    expect(container.querySelector('.flown-milestone')).toBeNull();
    await act(async () => emit(kind, 'record', 'pending', saved));
    expect(container.querySelector('.flown-milestone')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('.flown-confetti i')).toHaveLength(kind === 'task' ? 32 : 40);
    expect(container.querySelectorAll('.flown-confetti-left')).toHaveLength(kind === 'task' ? 16 : 20);
    expect(container.querySelectorAll('.flown-confetti-right')).toHaveLength(kind === 'task' ? 16 : 20);
    expect(container.querySelector('.flown-confetti')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('button')?.disabled).toBe(false);
    await act(async () => vi.advanceTimersByTime(1800));
    expect(container.querySelector('.flown-milestone')).toBeNull();
    expect(container.querySelector('.flown-confetti')).toBeNull();
  });

  it('does not emit for loading, failed/unconfirmed writes or unchanged complete states', () => {
    const event = vi.fn();
    window.addEventListener(MILESTONE_EVENT, event);
    celebrateMilestone('task', 'task', undefined, 'completed');
    celebrateMilestone('task', 'task', 'in_progress', undefined);
    emit('task', 'task', 'in_progress', 'blocked');
    emit('task', 'task', 'completed', 'completed');
    expect(event).not.toHaveBeenCalled();
    window.removeEventListener(MILESTONE_EVENT, event);
  });

  it('deduplicates records and drops cooldown events without queueing them', async () => {
    await render();
    await act(async () => emit());
    await act(async () => vi.advanceTimersByTime(1800));
    await act(async () => emit('project', 'project', 'active'));
    expect(container.querySelector('.flown-milestone')).toBeNull();
    await act(async () => vi.advanceTimersByTime(6200));
    await act(async () => { emit(); emit('project', 'project', 'active'); });
    expect(container.querySelector('.flown-milestone')).toBeNull();
    await act(async () => emit('grant', 'new-grant', 'applied', 'awarded'));
    expect(container.textContent).toContain('Grant awarded');
  });

  it('limits deduplication memory to 100 records', () => {
    const gate = createMilestoneGate();
    for (let i = 0; i < 101; i++) expect(gate('task', `${i}`, i * 8000)).toBe(true);
    expect(gate('task', '100', 102 * 8000)).toBe(false);
    expect(gate('task', '0', 102 * 8000)).toBe(true);
  });

  it('cancels active motion on live system changes and never overrides the device preference', async () => {
    await render();
    await act(async () => emit());
    await act(async () => { systemReduced = true; mediaChange(); });
    expect(container.querySelector('.flown-milestone')).toBeNull();
    expect(container.querySelector('.flown-confetti')).toBeNull();
    document.documentElement.dataset.motion = 'full';
    await act(async () => emit('task', 'new'));
    expect(container.querySelector('.flown-milestone')).toBeNull();
    await act(async () => { systemReduced = false; mediaChange(); vi.advanceTimersByTime(8000); emit('task', 'new'); });
    expect(container.querySelector('.flown-milestone')).not.toBeNull();
  });

  it('cancels immediately when the saved workspace Reduce motion setting changes', async () => {
    await render();
    await act(async () => emit());
    await act(async () => { document.documentElement.dataset.motion = 'reduced'; });
    expect(container.querySelector('.flown-milestone')).toBeNull();
    expect(container.querySelector('.flown-confetti')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(8000); emit('task', 'another'); });
    expect(container.querySelector('.flown-milestone')).toBeNull();
    await act(async () => { document.documentElement.dataset.motion = 'full'; });
    await act(async () => emit('task', 'another'));
    expect(container.querySelector('.flown-milestone')).not.toBeNull();
  });

  it('removes confetti and its expiration timer when the app unmounts', async () => {
    await render();
    await act(async () => emit('grant', 'grant', 'applied', 'awarded'));
    expect(container.querySelectorAll('.flown-confetti i')).toHaveLength(40);
    await act(async () => root.render(null));
    expect(container.querySelector('.flown-confetti')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
