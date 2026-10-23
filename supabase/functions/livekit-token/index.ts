import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request) => {
  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'The call function is missing Supabase configuration.' }, 503);
  }
  if (!authorization) return jsonResponse({ error: 'Authentication required.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'Authentication required.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'A call session ID is required.' }, 400);
  }
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
  if (!sessionId) return jsonResponse({ error: 'A call session ID is required.' }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: call, error: callError } = await adminClient
    .from('call_sessions')
    .select('room_name, participant_ids, declined_by, status')
    .eq('id', sessionId)
    .single();
  if (callError || !call) return jsonResponse({ error: 'Call session was not found.' }, 404);
  if (!call.participant_ids.includes(user.id)) {
    return jsonResponse({ error: 'You are not invited to this call.' }, 403);
  }
  if (call.participant_ids.length < 2 || call.participant_ids.length > 8) {
    return jsonResponse({ error: 'This call has an invalid participant list.' }, 400);
  }

  if (payload.action === 'decline-call') {
    if (call.status !== 'ringing') return jsonResponse({ error: 'This call is no longer ringing.' }, 409);
    const declinedBy = [...new Set([...call.declined_by, user.id])];
    const { error } = await adminClient
      .from('call_sessions')
      .update({ declined_by: declinedBy })
      .eq('id', sessionId);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ success: true });
  }

  if (call.declined_by.includes(user.id)) return jsonResponse({ error: 'You declined this call.' }, 403);
  if (call.status === 'ended') return jsonResponse({ error: 'This call has ended.' }, 410);

  const liveKitUrl = Deno.env.get('LIVEKIT_URL');
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return jsonResponse({ error: 'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET on this Supabase Edge Function.' }, 503);
  }

  const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: user.id,
    name: String(user.user_metadata?.name || user.user_metadata?.full_name || user.email || 'Staff member'),
    ttl: '10m',
  });
  token.addGrant({
    roomJoin: true,
    room: call.room_name,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return jsonResponse({ serverUrl: liveKitUrl, token: await token.toJwt() });
});
