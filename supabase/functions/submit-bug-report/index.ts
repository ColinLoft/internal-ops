import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ? new URL(Deno.env.get('SITE_URL')!).origin : '*',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const textField = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'The bug report service is missing Supabase configuration.' }, 500);
  if (!authorization) return jsonResponse({ error: 'Authentication required.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'Your sign-in session could not be verified. Sign in again and retry.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'The bug report payload is invalid.' }, 400);
  }

  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const includeDiagnostics = payload.includeDiagnostics === true;
  const screenshotPath = typeof payload.screenshotPath === 'string' ? payload.screenshotPath : null;
  if (!subject || !description) return jsonResponse({ error: 'A subject and description are required.' }, 400);
  if (subject.length > 200 || description.length > 10000) {
    return jsonResponse({ error: 'The subject or description exceeds the allowed length.' }, 400);
  }
  if (screenshotPath && (!screenshotPath.startsWith(`${user.id}/`) || screenshotPath.includes('..'))) {
    return jsonResponse({ error: 'The screenshot does not belong to your account.' }, 400);
  }

  const diagnosticPayload = payload.diagnostics && typeof payload.diagnostics === 'object' && !Array.isArray(payload.diagnostics)
    ? payload.diagnostics as Record<string, unknown>
    : {};
  const diagnosticData: Record<string, unknown> = {};
  if (includeDiagnostics) {
    const page = textField(diagnosticPayload.page, 500);
    const browser = textField(diagnosticPayload.browser, 1000);
    const timezone = textField(diagnosticPayload.timezone, 100);
    const languages = Array.isArray(diagnosticPayload.languages)
      ? diagnosticPayload.languages.filter((item): item is string => typeof item === 'string').slice(0, 10).map((item) => item.slice(0, 40))
      : [];
    const viewport = diagnosticPayload.viewport && typeof diagnosticPayload.viewport === 'object'
      ? diagnosticPayload.viewport as Record<string, unknown>
      : {};
    const screen = diagnosticPayload.screen && typeof diagnosticPayload.screen === 'object'
      ? diagnosticPayload.screen as Record<string, unknown>
      : {};
    const numberOrNull = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
    const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip');

    Object.assign(diagnosticData, {
      page,
      browser,
      timezone,
      languages,
      viewport: { width: numberOrNull(viewport.width), height: numberOrNull(viewport.height) },
      screen: { width: numberOrNull(screen.width), height: numberOrNull(screen.height) },
      ...(ipAddress ? { ipAddress: ipAddress.slice(0, 64) } : {}),
    });
  }

  const { data, error } = await callerClient.from('support_tickets').insert({
    subject,
    description,
    category: 'bug',
    priority: 'normal',
    requester_id: user.id,
    internal_only: true,
    developer_flag: true,
    diagnostic_data: diagnosticData,
    screenshot_path: screenshotPath,
  }).select('ticket_number').single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ ticketNumber: data.ticket_number });
});
