import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  handler: null as ((request: Request) => Promise<Response>) | null,
  row: {} as Record<string, unknown>,
  tables: [] as string[],
  signedUrl: vi.fn(),
}));
vi.mock('../_shared/cors.ts', () => ({
  serveWithCors: (handler: (request: Request) => Promise<Response>) => { mock.handler = handler; },
}));
vi.mock('../_shared/pdf-signing.ts', () => ({
  sha256Hex: async () => 'fixture-hash', appendSignaturePage: vi.fn(), decodePngSignature: vi.fn(),
}));
vi.mock('../_shared/contract-signing.ts', () => ({
  applyPlacedContractSignature: vi.fn(), getContractPdfPageCount: vi.fn(), validatePlacedContractFields: vi.fn(),
}));
vi.mock('../_shared/contract-email.ts', () => ({ deliverContractEmail: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: (table: string) => {
      mock.tables.push(table);
      const file = { id: 'source', storage_path: 'fixture.pdf', file_name: 'fixture.pdf' };
      const data = table === 'customer_contract_signature_requests' ? mock.row
        : table === 'customer_contracts' ? { name: 'Fixture agreement', status: 'pending_signature' } : file;
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data, error: null }),
        then: (resolve: (result: unknown) => void) => resolve({ data: [file], error: null }),
      };
      return query;
    },
    storage: { from: () => ({ createSignedUrl: mock.signedUrl }) },
  }),
}));

const now = Date.parse('2026-11-09T12:00:00Z');
const invoke = (action = 'details') => mock.handler!(new Request('https://fixture.invalid', {
  method: 'POST', body: JSON.stringify({ action, token: 't'.repeat(43) }),
}));

describe('public contract bearer-link lifetime', () => {
  beforeAll(async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'https://fixture.invalid' } });
    await import('./index');
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubGlobal('Deno', { env: { get: () => 'https://fixture.invalid' } });
    mock.tables.length = 0;
    mock.row = {
      id: 'request', contract_id: 'contract', source_file_id: 'source', signed_file_id: 'signed',
      status: 'pending', flow_version: 2, expires_at: new Date(now + 30_000).toISOString(),
    };
    mock.signedUrl.mockReset().mockResolvedValue({ data: { signedUrl: 'https://fixture.invalid/pdf' }, error: null });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(['pending', 'recipient_signed', 'completed', 'revoked', 'draft'])(
    'rejects expired %s links before reading contract data or minting URLs', async (status) => {
      mock.row.status = status;
      mock.row.expires_at = new Date(now - 1).toISOString();
      for (const action of ['details', 'sign']) {
        const response = await invoke(action);
        expect(response.status).toBe(410);
        expect(await response.json()).not.toHaveProperty('contractName');
      }
      expect(mock.tables).toEqual(['customer_contract_signature_requests', 'customer_contract_signature_requests']);
      expect(mock.signedUrl).not.toHaveBeenCalled();
    },
  );
  it.each(['invalid', null, new Date(now).toISOString()])('fails closed for invalid/elapsed expiry %s', async (expiry) => {
    mock.row.status = 'completed'; mock.row.expires_at = expiry;
    expect((await invoke()).status).toBe(410);
    expect(mock.signedUrl).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'draft'])('rejects unexpired %s links', async (status) => {
    mock.row.status = status;
    expect((await invoke()).status).toBe(410);
    expect(mock.signedUrl).not.toHaveBeenCalled();
  });
  it.each(['pending', 'recipient_signed', 'completed'])('preserves unexpired %s details with bounded PDF lifetime', async (status) => {
    mock.row.status = status;
    const response = await invoke();
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe(status);
    expect(mock.signedUrl).toHaveBeenCalledWith('fixture.pdf', 30);
    mock.row.expires_at = new Date(now + 14 * 24 * 60 * 60_000).toISOString();
    expect((await invoke()).status).toBe(200);
    expect(mock.signedUrl).toHaveBeenLastCalledWith('fixture.pdf', 3600);
  });
});
