import { serveWithCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { probeEndpoint } from './probe.ts';

const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ? new URL(Deno.env.get('SITE_URL')!).origin : '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-systems-monitor-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const secretEquals = async (a: string, b: string) => {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  const bytes = new Uint8Array(right);
  new Uint8Array(left).forEach((byte, i) => { difference |= byte ^ bytes[i]; });
  return difference === 0;
};

serveWithCors(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'Monitoring service is not configured.' }, 503);
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = (request.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const secret = Deno.env.get('SYSTEMS_MONITOR_SECRET') || '';
    const suppliedSecret = request.headers.get('x-systems-monitor-secret') || '';
    const scheduled = (bearer && await secretEquals(bearer, key))
      || (secret.length >= 32 && suppliedSecret && await secretEquals(suppliedSecret, secret));
    if (!scheduled) {
      const { data: { user }, error } = await client.auth.getUser(bearer);
      if (error || !user) return json({ error: 'Sign in to run a check.' }, 401);
      const { data: profile, error: profileError } = await client.from('profiles').select('account_status').eq('id', user.id).maybeSingle();
      if (profileError || profile?.account_status !== 'active') return json({ error: 'Active staff access required.' }, 403);
    }
    if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Request too large.' }, 413);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4096) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
        chunks.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const bodyText = new TextDecoder().decode(bytes);
    let payload: { systemId?: unknown };
    try { payload = JSON.parse(bodyText || '{}'); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!payload || typeof payload !== 'object') return json({ error: 'Invalid request.' }, 400);
    if (!scheduled && (typeof payload.systemId !== 'string' || !/^[a-f0-9-]{36}$/i.test(payload.systemId))) {
      return json({ error: 'Choose one system to check.' }, 400);
    }
    const { data: systems, error } = scheduled
      ? await client.rpc('flown_system_due_checks')
      : await client.from('flown_systems').select('id, monitor_url').eq('id', payload.systemId).eq('monitoring_enabled', true);
    if (error) throw error;
    if (!scheduled && !systems?.length) return json({ error: 'System not found or monitoring is disabled.' }, 404);
    const queue = (systems || []) as { id: string; monitor_url: string }[];
    const results: { systemId: string; outcome: string }[] = [];
    let skipped = 0;
    const worker = async () => {
      while (queue.length) {
        const system = queue.shift()!;
        const { data: claimed, error: claimError } = await client.rpc('flown_system_claim_check', { target_id: system.id });
        if (claimError) throw claimError;
        if (!claimed) { skipped++; continue; }
        const check = await probeEndpoint(system.monitor_url);
        const { error: saveError } = await client.from('flown_system_checks').insert({
          ...check, system_id: system.id, endpoint_url: system.monitor_url,
          trigger_source: scheduled ? 'scheduled' : 'manual',
        });
        if (saveError) throw saveError;
        results.push({ systemId: system.id, outcome: check.outcome });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    return json({ checked: results.length, skipped, results });
  } catch {
    return json({ error: 'Monitoring could not complete. Check function logs and deployment.' }, 500);
  }
});
