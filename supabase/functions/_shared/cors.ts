const DEFAULT_ORIGINS = ['https://ops.flown.org', 'https://flown.org', 'https://www.flown.org'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const originOf = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
};

export const allowedOrigins = () => {
  const configured = [
    originOf(Deno.env.get('SITE_URL')),
    ...(Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((entry) => originOf(entry)),
  ].filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set([...configured, ...DEFAULT_ORIGINS]));
};

export const corsOriginFor = (request: Request) => {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins();
  if (origin && (allowed.includes(origin) || LOCAL_ORIGIN.test(origin))) return origin;
  return allowed[0];
};

export const corsHeadersFor = (request: Request): Record<string, string> => ({
  'Access-Control-Allow-Origin': corsOriginFor(request),
  'Access-Control-Allow-Headers':
    request.headers.get('Access-Control-Request-Headers')
    || 'authorization, x-client-info, apikey, content-type, x-systems-monitor-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

// Answers preflights before any auth work and stamps the caller's allowed origin on every response,
// including thrown errors, so the browser never sees an opaque "Failed to fetch".
export const serveWithCors = (handler: (request: Request) => Response | Promise<Response>) =>
  Deno.serve(async (request: Request) => {
    const cors = corsHeadersFor(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      console.error(error);
      response = new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected function error.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
