import type { FlownSystem, MonitorSummary } from './types';

export function publicHttpsUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || url.hash || !host.includes('.') || host.endsWith('.') || host.includes(':')
    || /^[\d.]+$/.test(host) || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)
    || !/^[a-z0-9.-]+$/.test(host)) {
    throw new Error('Use a public HTTPS hostname on port 443, without credentials or fragments.');
  }
  return url.href;
}

export function sampledUptime(summary?: MonitorSummary): number | null {
  const count = Number(summary?.sample_count || 0);
  return count > 0 ? Number(summary?.up_count || 0) / count * 100 : null;
}

export function monitorState(system: FlownSystem, summary?: MonitorSummary, now = Date.now()): string {
  if (!system.monitoring_enabled || !system.monitor_url) return 'Not monitored';
  const latest = summary?.latest_check;
  if (!latest || latest.endpoint_url !== system.monitor_url) return 'Awaiting checks';
  if (now - Date.parse(latest.checked_at) > 15 * 60 * 1000) return 'Stale checks';
  return latest.outcome === 'up' ? 'Operational' : latest.outcome === 'down' ? 'Endpoint down' : 'Check blocked';
}

export function localDateTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
