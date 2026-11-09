// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigate } from './navigate';

afterEach(() => { vi.restoreAllMocks(); history.replaceState({}, '', '/'); });
describe('workspace navigation', () => {
  it('clears stale selection parameters when navigating back to a list', () => {
    history.replaceState({}, '', '/customers/organizations?contact=selected');
    const changed = vi.fn();
    window.addEventListener('popstate', changed);
    try {
      navigate('/customers/organizations');
      expect(location.pathname).toBe('/customers/organizations');
      expect(location.search).toBe('');
      expect(changed).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('popstate', changed); }
  });
  it('does not duplicate history when selecting the same complete location', () => {
    history.replaceState({}, '', '/customers/organizations?company=selected#contacts');
    const push = vi.spyOn(history, 'pushState');
    navigate('/customers/organizations?company=selected#contacts');
    expect(push).not.toHaveBeenCalled();
  });
  it('updates query-only and hash-only selections', () => {
    history.replaceState({}, '', '/customers/organizations?company=one');
    navigate('/customers/organizations?company=two#contacts');
    expect(location.search).toBe('?company=two');
    expect(location.hash).toBe('#contacts');
    navigate('/customers/organizations?company=two#activity');
    expect(location.hash).toBe('#activity');
  });
});
