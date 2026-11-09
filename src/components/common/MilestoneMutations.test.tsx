// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ row: {} as Record<string, unknown>, save: vi.fn(), celebrate: vi.fn() }));
vi.mock('../../lib/milestones', () => ({ celebrateMilestone: mock.celebrate }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'staff', systemRole: 'admin' }, users: [] }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh(load: () => Promise<void>) { useEffect(() => { void load(); }, [load]); } }));
vi.mock('../finance/GrantExtras', () => ({ AiTab: () => null, FunderPicker: () => null, PeopleTab: () => null, RequirementsTab: () => null }));
vi.mock('../work/EntityPanels', () => ({
  AttachmentsPanel: () => null, CommentsPanel: () => null, LinksPanel: () => null,
  card: '', field: '', formatDateTime: () => '', logActivity: vi.fn(),
}));
vi.mock('../work/RichNotes', () => ({ RichNotes: () => null }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => {
    const result = () => ({ data: table === 'eng_projects' || table === 'grants' ? mock.row : [], error: null });
    const query = {
      select: () => query, eq: () => query, order: () => query,
      update: () => query, insert: () => query, single: mock.save,
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  } },
}));
import { ProjectDetail } from '../engineering/ProjectDetail';
import { GrantDetail } from '../finance/GrantDetail';

describe('persisted grant and project milestones', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it.each([
    ['grant', 'awarded', 'applied', true],
    ['grant', 'awarded', 'applied', false],
    ['project', 'completed', 'active', true],
    ['project', 'completed', 'active', false],
  ] as const)('celebrates %s after confirmed save, not initial load or optimistic changes (success=%s)', async (kind, final, before, success) => {
    mock.row = { id: 'record', name: 'Test record', stage: before, status: before, discipline: 'software', funder_emails: [], grant_type: 'money' };
    let finish!: (result: unknown) => void;
    mock.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(kind === 'grant' ? <GrantDetail grantId="record" /> : <ProjectDetail projectId="record" />));
    expect(mock.celebrate).not.toHaveBeenCalled();
    const control = kind === 'grant' ? container.querySelector<HTMLButtonElement>('[aria-label=Stage]')! : [...container.querySelectorAll('button[aria-haspopup=listbox]')][0] as HTMLButtonElement;
    await act(async () => control.click());
    const option = container.querySelector<HTMLButtonElement>(`[role=option][data-value="${final}"]`)
      || [...container.querySelectorAll<HTMLButtonElement>('[role=option]')].find(button => button.textContent === (kind === 'grant' ? 'Awarded' : 'Completed'))!;
    expect(option).toBeDefined();
    await act(async () => option.click());
    expect(mock.celebrate).not.toHaveBeenCalled();
    await act(async () => { finish(success ? { data: { status: final, stage: final }, error: null } : { data: null, error: { message: 'Permission denied' } }); });
    if (success) expect(mock.celebrate).toHaveBeenCalledExactlyOnceWith(kind, 'record', before, final);
    else {
      expect(mock.celebrate).not.toHaveBeenCalled();
      expect(container.querySelector('[role=alert]')?.textContent).toContain('Ask an administrator');
    }
  });
});
