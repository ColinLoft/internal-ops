import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'The invitation function is missing Supabase configuration.' }, 500);
  }
  if (!authorization) return jsonResponse({ error: 'Authentication required.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) return jsonResponse({ error: 'Authentication required.' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('system_role')
    .eq('id', caller.id)
    .single();

  if (profileError || callerProfile.system_role !== 'admin') {
    return jsonResponse({ error: 'Only workspace administrators can invite staff.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid invitation details.' }, 400);
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const role = null;
  const department = null;
  const phone = '';
  const avatarUrl = null;
  const systemRole = 'member';

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'A name and valid email address are required.' }, 400);
  }
  if (!['admin', 'coordinator', 'member'].includes(String(systemRole))) {
    return jsonResponse({ error: 'Invalid workspace permission level.' }, 400);
  }

  const siteUrl = Deno.env.get('SITE_URL');
  if (!siteUrl) return jsonResponse({ error: 'The invitation function requires the SITE_URL secret.' }, 500);

  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const temporaryPassword = `${Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}Aa1!`;
  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingProfileError) {
    return jsonResponse({ error: `Could not check for an existing staff account: ${existingProfileError.message}` }, 500);
  }

  let staffUserId: string;
  if (existingProfile) {
    const { data: existingAuth, error: existingAuthError } = await adminClient.auth.admin.getUserById(existingProfile.id);
    if (existingAuthError || !existingAuth.user) {
      return jsonResponse({ error: existingAuthError?.message || 'The existing staff account could not be loaded.' }, 500);
    }
    if (existingAuth.user.email_confirmed_at) {
      return jsonResponse({ error: 'An account already exists for this email address.' }, 409);
    }

    const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(existingAuth.user.id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { ...existingAuth.user.user_metadata, name },
      app_metadata: { ...existingAuth.user.app_metadata, password_reset_required: true },
    });
    if (updateError || !updated.user) {
      return jsonResponse({ error: updateError?.message || 'The pending staff account could not be activated.' }, 400);
    }
    staffUserId = updated.user.id;
  } else {
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { password_reset_required: true },
    });
    if (createError || !created.user) {
      return jsonResponse({ error: createError?.message || 'Supabase could not create the staff account.' }, 400);
    }
    staffUserId = created.user.id;
  }

  const { error: upsertError } = await adminClient.from('profiles').upsert({
    id: staffUserId,
    email,
    name,
    role,
    department,
    phone,
    avatar_url: avatarUrl,
    system_role: systemRole,
    status: 'offline',
  }, { onConflict: 'id' });

  if (upsertError) {
    if (!existingProfile) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(staffUserId);
      if (cleanupError) console.error('Could not remove staff auth user after profile setup failed:', cleanupError.message);
    }
    return jsonResponse({ error: `Staff account setup failed: ${upsertError.message}` }, 500);
  }

  return jsonResponse({
    userId: staffUserId,
    temporaryPassword,
    loginUrl: new URL('/', siteUrl).toString(),
  });
});