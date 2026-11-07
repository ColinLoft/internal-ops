import { describe, expect, it } from 'vitest';
import { isKnownWorkspacePath } from './workspaceRoutes';

describe('workspace detail routes', () => {
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
