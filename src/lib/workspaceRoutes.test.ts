import { describe, expect, it } from 'vitest';
import { isKnownWorkspacePath, legacyWorkspaceRedirect, workspaceTabFromPath } from './workspaceRoutes';

describe('workspace detail routes', () => {
  it.each(['/tasks', '/tasks/task-id', '/programs', '/programs/tasks', '/programs/task/task-id', '/programs/tasks/'])('resolves %s to Tasks before any navigation event', path => {
    expect(workspaceTabFromPath(path)).toBe('programs');
  });
  it('resolves moved calendar routes and engineering aliases on a cold load', () => {
    expect(workspaceTabFromPath('/programs/calendar')).toBe('calendar');
    expect(workspaceTabFromPath('/products/software')).toBe('engineering');
  });
  it('accepts project, review, large task, and grant detail links', () => {
    for (const path of [
      '/engineering/software/project-id', '/engineering/mechanical/project-id',
      '/engineering/electrical/project-id', '/engineering/systems/project-id',
      '/engineering/review/review-id', '/programs/task/task-id',
      '/company/grants/grant-id', '/customers/contracts/contract-id', '/systems',
    ]) expect(isKnownWorkspacePath(path), path).toBe(true);
  });

  it('does not classify unknown roots or unsupported engineering depths as workspace pages', () => {
    expect(isKnownWorkspacePath('/unknown-page')).toBe(false);
    expect(isKnownWorkspacePath('/engineering/software/project-id/unknown')).toBe(false);
  });
});

describe('legacy workspace redirects', () => {
  it('sends moved routes to their current pages', () => {
    expect(legacyWorkspaceRedirect('/tasks')).toBe('/programs/tasks');
    expect(legacyWorkspaceRedirect('/tasks/abc')).toBe('/programs/task/abc');
    expect(legacyWorkspaceRedirect('/programs/calendar/')).toBe('/calendar');
    expect(legacyWorkspaceRedirect('/products')).toBe('/engineering/software');
    expect(legacyWorkspaceRedirect('/products/hardware/p1', '?tab=notes')).toBe('/engineering/hardware/p1?tab=notes');
    expect(legacyWorkspaceRedirect('/wildfire/overview')).toBe('/wildfire/opportunities');
    expect(legacyWorkspaceRedirect('/forms/f1')).toBe('/company/forms?form=f1');
    expect(legacyWorkspaceRedirect('/company/ideas')).toBe('/company/forms');
    expect(legacyWorkspaceRedirect('/company')).toBe('/company/forms');
    expect(legacyWorkspaceRedirect('/customers/contacts', '?contact=c1')).toBe('/customers/organizations?contact=c1');
    expect(legacyWorkspaceRedirect('/customers/companies', '?company=o1')).toBe('/customers/organizations?company=o1');
  });

  it('leaves current routes alone', () => {
    expect(legacyWorkspaceRedirect('/programs/tasks')).toBeNull();
    expect(legacyWorkspaceRedirect('/calendar')).toBeNull();
    expect(legacyWorkspaceRedirect('/engineering/software')).toBeNull();
  });
});
