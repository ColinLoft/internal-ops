import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { probeEndpoint } from '../../../supabase/functions/systems-monitor/probe';

describe('bounded pinned monitoring transport', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('pins DNS and keeps the TLS hostname, with no redirect following', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const destroy = vi.fn();
    mocks.request.mockImplementation((_url, options, callback) => {
      expect(options.servername).toBe('status.flown.org');
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.autoSelectFamily).toBe(false);
      const pinned = vi.fn();
      options.lookup('status.flown.org', {}, pinned);
      expect(pinned).toHaveBeenCalledWith(null, '8.8.8.8', 4);
      return { on: vi.fn(), end: () => callback({ statusCode: 302, destroy }) };
    });
    const check = await probeEndpoint('https://status.flown.org/health');
    expect(check.outcome).toBe('down');
    expect(check.error).toMatch(/Redirects/);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
  });
  it('never opens a socket for unsafe DNS', async () => {
    mocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    expect((await probeEndpoint('https://status.flown.org/health')).outcome).toBe('blocked');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('accepts healthy HTTP responses without consuming their bodies', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mocks.request.mockImplementation((_url, _options, callback) => ({ on: vi.fn(), end: () => callback({ statusCode: 204, destroy: vi.fn() }) }));
    expect((await probeEndpoint('https://status.flown.org/health')).outcome).toBe('up');
  });
  it('bounds DNS resolution and does not connect after its deadline', async () => {
    vi.useFakeTimers();
    try {
      let resolveDns: (value: unknown) => void;
      mocks.lookup.mockReturnValue(new Promise(resolve => { resolveDns = resolve; }));
      const pending = probeEndpoint('https://status.flown.org/health');
      await vi.advanceTimersByTimeAsync(8001);
      expect((await pending).outcome).toBe('down');
      resolveDns!([{ address: '8.8.8.8', family: 4 }]);
      await Promise.resolve();
      expect(mocks.request).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
