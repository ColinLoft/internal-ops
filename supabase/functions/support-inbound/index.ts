import { serveWithCors } from '../_shared/cors.ts';

serveWithCors(() => new Response(JSON.stringify({
  error: 'Resend intake is retired. Connect the Outlook shared mailbox in Settings > Email.',
}), { status: 410, headers: { 'Content-Type': 'application/json' } }));
