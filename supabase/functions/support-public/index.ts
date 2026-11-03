import { createClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const clip = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Unauthenticated entry point for customers. It only ever touches the conversation named by an unguessable token.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ error: 'Support chat is not configured.' }, 500);
    const db = createClient(url, key);
    const payload = await request.json().catch(() => ({})) as Json;
    const action = String(payload.action || '');

    if (action === 'start') {
      if (clip(payload.website, 50)) return reply({ ok: true });
      const name = clip(payload.name, 200);
      const email = clip(payload.email, 320).toLowerCase();
      const message = clip(payload.message, 4000);
      if (!name) return reply({ error: 'Please enter your name.' }, 400);
      if (!emailPattern.test(email)) return reply({ error: 'Please enter a valid email address.' }, 400);
      if (!message) return reply({ error: 'Please write a message.' }, 400);

      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await db.from('support_conversations').select('id', { count: 'exact', head: true }).gte('created_at', since);
      if ((count ?? 0) > 200) return reply({ error: 'Support is receiving a lot of requests. Please email us instead.' }, 429);

      let customerId: string;
      const { data: existing } = await db.from('support_customers').select('id').ilike('email', email).maybeSingle();
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: created, error: customerError } = await db.from('support_customers').insert({ name, email, phone: clip(payload.phone, 60) || null }).select('id').single();
        if (customerError || !created) return reply({ error: 'Could not start the chat.' }, 500);
        customerId = created.id;
      }
      const { data: conversation, error: conversationError } = await db.from('support_conversations')
        .insert({ customer_id: customerId, subject: clip(payload.subject, 200) || message.slice(0, 80), channel: 'web' }).select('id,public_token').single();
      if (conversationError || !conversation) return reply({ error: 'Could not start the chat.' }, 500);
      await db.from('support_messages').insert({ conversation_id: conversation.id, sender_type: 'customer', channel: 'web', body: message });
      return reply({ token: conversation.public_token, name });
    }

    const token = clip(payload.token, 100);
    if (!/^[a-f0-9]{32,96}$/.test(token)) return reply({ error: 'Conversation not found.' }, 404);
    const { data: conversation } = await db.from('support_conversations').select('id,status,customer_id').eq('public_token', token).maybeSingle();
    if (!conversation) return reply({ error: 'Conversation not found.' }, 404);

    if (action === 'send') {
      const body = clip(payload.body, 4000);
      if (!body) return reply({ error: 'Write a message first.' }, 400);
      const { count } = await db.from('support_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversation.id);
      if ((count ?? 0) >= 300) return reply({ error: 'This conversation is full. Please email us to continue.' }, 429);
      const { error } = await db.from('support_messages').insert({ conversation_id: conversation.id, sender_type: 'customer', channel: 'web', body });
      if (error) return reply({ error: 'Message could not be sent.' }, 500);
      return reply({ ok: true });
    }

    if (action === 'poll') {
      const { data: messages } = await db.from('support_messages').select('id,sender_type,body,created_at,sender_id')
        .eq('conversation_id', conversation.id).in('sender_type', ['customer', 'agent']).order('created_at').limit(300);
      const agentIds = Array.from(new Set((messages || []).map((row: Json) => row.sender_id).filter(Boolean)));
      const { data: agents } = agentIds.length ? await db.from('profiles').select('id,name').in('id', agentIds as string[]) : { data: [] };
      const names = new Map((agents || []).map((row: Json) => [String(row.id), String(row.name || 'Support')]));
      return reply({
        status: conversation.status,
        messages: (messages || []).map((row: Json) => ({ id: row.id, from: row.sender_type, body: row.body, at: row.created_at, agent: row.sender_id ? (names.get(String(row.sender_id)) || 'Support').split(' ')[0] : null })),
      });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500);
  }
});
