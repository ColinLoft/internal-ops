import { describe, expect, it } from 'vitest';
import { monitorState, publicHttpsUrl, sampledUptime } from './helpers';
import type { FlownSystem, MonitorSummary } from './types';

describe('systems URL validation', () => {
  it('accepts public HTTPS names', () => expect(publicHttpsUrl('https://status.flown.org/health')).toBe('https://status.flown.org/health'));
  it.each(['http://flown.org', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://localhost', 'https://x.internal',
    'https://x.local', 'https://flown.org:8443', 'https://a:b@flown.org', 'https://flown.org/#secret', 'https://flown.org.'])('rejects %s', value => {
    expect(() => publicHttpsUrl(value)).toThrow();
  });
});
describe('honest sample metrics', () => {
  const system = { monitoring_enabled: true, monitor_url: 'https://status.flown.org/health' } as FlownSystem;
  it('never invents uptime', () => {
    expect(sampledUptime()).toBeNull();
    expect(sampledUptime({ sample_count: 0 } as MonitorSummary)).toBeNull();
    expect(sampledUptime({ sample_count: 4, up_count: 3 } as MonitorSummary)).toBe(75);
    expect(sampledUptime({ sample_count: 4, up_count: 0 } as MonitorSummary)).toBe(0);
  });
  it('distinguishes disabled, missing, stale and failed checks', () => {
    const now = Date.now();
    const summary = { latest_check: { endpoint_url: system.monitor_url, checked_at: new Date(now).toISOString(), outcome: 'down' } } as MonitorSummary;
    expect(monitorState(system)).toBe('Awaiting checks');
    expect(monitorState({ ...system, monitoring_enabled: false })).toBe('Not monitored');
    expect(monitorState(system, summary, now)).toBe('Endpoint down');
    expect(monitorState(system, summary, now + 16 * 60000)).toBe('Stale checks');
    expect(monitorState({ ...system, monitor_url: 'https://new.flown.org/' }, summary, now)).toBe('Awaiting checks');
  });
});
