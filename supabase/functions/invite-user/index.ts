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
  const role = typeof payload.role === 'string' && payload.role.trim() ? payload.role.trim() : 'Staff Specialist';
  const department = typeof payload.department === 'string' && payload.department.trim()
    ? payload.department.trim()
    : 'Operations';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const avatarUrl = typeof payload.avatarUrl === 'string' ? payload.avatarUrl : null;
  const systemRole = payload.systemRole;

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'A name and valid email address are required.' }, 400);
  }
  if (!['admin', 'coordinator', 'member'].includes(String(systemRole))) {
    return jsonResponse({ error: 'Invalid workspace permission level.' }, 400);
  }

  const inviteOptions: { data: { name: string }; redirectTo: string } = { data: { name }, redirectTo: '' };
  const siteUrl = Deno.env.get('SITE_URL');
  if (!siteUrl) return jsonResponse({ error: 'The invitation function requires the SITE_URL secret.' }, 500);
  inviteOptions.redirectTo = new URL('/?invite=1', siteUrl).toString();

  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);
  if (inviteError || !invitation.user) {
    return jsonResponse({ error: inviteError?.message || 'Supabase could not create the invitation.' }, 400);
  }

  const { error: upsertError } = await adminClient.from('profiles').upsert({
    id: invitation.user.id,
    email,
    name,
    role,
    department,
    phone,
    avatar_url: avatarUrl,
    system_role: systemRole,
    status: 'offline',
  }, { onConflict: 'id' });

  if (upsertError) return jsonResponse({ error: `Invitation created, but profile setup failed: ${upsertError.message}` }, 500);

  return jsonResponse({ userId: invitation.user.id });
});