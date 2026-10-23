import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    return jsonResponse({ error: 'The admin function is missing Supabase configuration.' }, 500);
  }
  if (!authorization) return jsonResponse({ error: 'Authentication required.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) return jsonResponse({ error: 'Authentication required.' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  if (payload.action === 'complete-password-reset') {
    const { error } = await adminClient.auth.admin.updateUserById(caller.id, {
      app_metadata: { ...caller.app_metadata, password_reset_required: false },
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ success: true });
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('system_role')
    .eq('id', caller.id)
    .single();
  if (profileError || callerProfile.system_role !== 'admin') {
    return jsonResponse({ error: 'Only workspace administrators can manage staff accounts.' }, 403);
  }

  const userId = typeof payload.userId === 'string' ? payload.userId : '';
  if (!userId) return jsonResponse({ error: 'A staff user ID is required.' }, 400);

  if (payload.action === 'set-password') {
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (password.length < 12) {
      return jsonResponse({ error: 'Temporary passwords must be at least 12 characters.' }, 400);
    }
    const { data: { user }, error: userError } = await adminClient.auth.admin.getUserById(userId);
    if (userError || !user) return jsonResponse({ error: userError?.message || 'Staff account was not found.' }, 404);
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password,
      app_metadata: { ...user.app_metadata, password_reset_required: true },
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ success: true });
  }

  if (payload.action !== 'update-profile') return jsonResponse({ error: 'Unsupported admin action.' }, 400);
  if (!payload.profile || typeof payload.profile !== 'object' || Array.isArray(payload.profile)) {
    return jsonResponse({ error: 'Staff profile details are required.' }, 400);
  }

  const input = payload.profile as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const field of ['name', 'role', 'department', 'phone', 'avatar_url', 'status_message', 'bio', 'location', 'banner'] as const) {
    if (field in input) {
      if (input[field] !== null && typeof input[field] !== 'string') {
        return jsonResponse({ error: `Invalid ${field} value.` }, 400);
      }
      updates[field] = input[field];
    }
  }
  if ('status' in input) {
    if (!['online', 'busy', 'away', 'offline'].includes(String(input.status))) {
      return jsonResponse({ error: 'Invalid staff status.' }, 400);
    }
    updates.status = input.status;
  }
  if ('system_role' in input) {
    if (!['admin', 'coordinator', 'member'].includes(String(input.system_role))) {
      return jsonResponse({ error: 'Invalid workspace role.' }, 400);
    }
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('system_role')
      .eq('id', userId)
      .single();
    if (targetError) return jsonResponse({ error: targetError.message }, 404);
    if (userId === caller.id && input.system_role !== targetProfile.system_role) {
      return jsonResponse({ error: 'You cannot change your own administrator role.' }, 400);
    }
    if (targetProfile.system_role === 'admin' && input.system_role !== 'admin') {
      const { count, error: countError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('system_role', 'admin');
      if (countError) return jsonResponse({ error: countError.message }, 500);
      if ((count || 0) <= 1) return jsonResponse({ error: 'The last workspace administrator cannot be demoted.' }, 400);
    }
    updates.system_role = input.system_role;
  }

  if (typeof updates.name === 'string' && !updates.name.trim()) {
    return jsonResponse({ error: 'Staff name cannot be blank.' }, 400);
  }
  if (typeof updates.banner === 'string' && !['ocean', 'violet', 'forest', 'sunset', 'rose'].includes(updates.banner)) {
    return jsonResponse({ error: 'Invalid profile banner.' }, 400);
  }
  if (Object.keys(updates).length === 0) return jsonResponse({ error: 'No profile changes were provided.' }, 400);

  const { data: updatedProfile, error: updateError } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (updateError) return jsonResponse({ error: updateError.message }, 400);
  if (!updatedProfile) return jsonResponse({ error: 'The staff profile was not found.' }, 404);

  return jsonResponse({ success: true });
});
