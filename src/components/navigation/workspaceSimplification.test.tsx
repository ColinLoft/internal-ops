// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { getSectionTabs } from './sectionTabs';
import { isRetiredWorkspacePath, RetiredWorkspacePage } from '../RetiredWorkspacePage';

describe('workspace simplification', () => {
  it('keeps forms and automation in Company', () => {
    const paths = getSectionTabs('company', '/company/forms')!.map((tab) => tab.path);
    expect(paths).toContain('/company/forms');
    expect(paths).toContain('/company/automation');
    expect(paths).not.toContain('/drive');
    expect(paths).not.toContain('/email');
  });
  it('retires office and personal-mail routes, not calendar or forms', () => {
    for (const path of ['/drive', '/drive/old', '/docs/old', '/sheets/old', '/slides/old', '/email', '/email/old', '/inbox']) expect(isRetiredWorkspacePath(path)).toBe(true);
    for (const path of ['/calendar', '/company/forms', '/forms/shared', '/company/automation', '/customers/contracts']) expect(isRetiredWorkspacePath(path)).toBe(false);
  });
  it('explains retired links and redirects to the PDF workflow', async () => {
    window.history.replaceState({}, '', '/docs/old');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RetiredWorkspacePage />); });
    expect(container.textContent).toContain('Existing stored records have not been deleted');
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Open contracts')!;
    await act(async () => { button.click(); });
    expect(window.location.pathname).toBe('/customers/contracts');
    await act(async () => { root.unmount(); });
    container.remove();
    window.history.replaceState({}, '', '/');
  });
});
