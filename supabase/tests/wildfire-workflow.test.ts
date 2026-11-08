import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { publicSearchQuery, quoteToken, validateProspects, validateSignaturePng, validateSigner, webUrl } from '../functions/_shared/wildfire.ts';

const sql = readFileSync(new URL('../migrations/20261111100000_wildfire_workflow.sql', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../functions/wildfire-prospect-ai/index.ts', import.meta.url), 'utf8');
const quotes = readFileSync(new URL('../functions/wildfire-quotes/index.ts', import.meta.url), 'utf8');
const functionBody = (name: string) => sql.match(new RegExp(`function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, 'i'))?.[1] || '';
const source = { title: 'Example Council', url: 'https://example.org/', snippet: 'Example Council in Ontario. Contact help@example.org or +1 (555) 123-4567.' };
const candidate = { name: 'Example Council', website: source.url, email: 'help@example.org', phone: '+1 (555) 123-4567', location: 'Ontario', summary: 'Wildfire prevention.', fit_reason: 'Potential fit.', source_urls: [source.url] };

describe('prospect research validation', () => {
  it('uses only explicit nonempty bounded public queries', () => {
    expect(publicSearchQuery('  wildfire councils Ontario  ')).toBe('wildfire councils Ontario');
    for (const query of [undefined, '', ' '.repeat(20), 'x'.repeat(501), { query: 'x' }]) expect(() => publicSearchQuery(query)).toThrow();
  });
  it('accepts only HTTP(S) source URLs without embedded credentials', () => {
    expect(webUrl(source.url)).toBe(source.url);
    for (const url of ['javascript:alert(1)', 'data:text/plain,hello', 'https://secret@example.org', 'not a url']) expect(webUrl(url)).toBeNull();
  });
  it('retains evidenced contact data and appends source snippets', () => {
    const [result] = validateProspects({ results: [candidate] }, [source], 10);
    expect(result).toMatchObject({ ...candidate, summary: expect.stringContaining(candidate.summary) });
    expect(result.summary).toContain(`[${source.url}] ${source.snippet}`);
  });
  it('clears invented contact/location/website fields', () => {
    const [result] = validateProspects({ results: [{ ...candidate, website: 'https://invented.org', email: 'ceo@example.org', phone: '555-000-1111', location: 'Quebec' }] }, [source], 10);
    expect(result).toMatchObject({ website: '', email: '', phone: '', location: '' });
  });
  it('removes invented contacts and URLs from model narratives too', () => {
    const [result] = validateProspects({ results: [{ ...candidate,
      summary: 'Contact ceo@invented.org via https://invented.org or 555-000-1111.',
      fit_reason: 'See https://invented.org.',
    }] }, [source], 10);
    expect(result.summary).not.toContain('ceo@invented.org');
    expect(result.summary).not.toContain('https://invented.org');
    expect(result.summary).not.toContain('555-000-1111');
    expect(result.fit_reason).not.toContain('https://invented.org');
  });
  it('rejects inventions and ungrounded names/sources', () => {
    for (const row of [{ ...candidate, name: 'Invented Council' }, { ...candidate, source_urls: ['https://invented.org'] }, { ...candidate, source_urls: [] }, { ...candidate, name: '???' }]) {
      expect(validateProspects({ results: [row] }, [source], 10)).toEqual([]);
    }
  });
  it('deduplicates organizations and source URLs and caps results', () => {
    expect(validateProspects({ results: [candidate, candidate] }, [source], 10)).toHaveLength(1);
    expect(validateProspects({ results: [candidate] }, [source], 0)).toEqual([]);
    expect(validateProspects({ results: [{ ...candidate, source_urls: [source.url, source.url] }] }, [source], 1)[0].source_urls).toEqual([source.url]);
  });
  it('rejects malformed model responses without a context-free fallback', () => {
    for (const value of [null, {}, { results: {} }]) expect(() => validateProspects(value, [source], 10)).toThrow();
    expect(ai).toContain("grantAccess.data !== true");
    expect(ai).toContain("callerClient.from('grant_resources')");
    expect(ai).toContain("callerClient.from('grant_settings')");
    expect(ai).toContain("searchUrl.searchParams.set('q', query)");
    expect(ai).not.toContain("searchUrl.searchParams.set('q', context)");
  });
});

describe('public quote input validation', () => {
  it('requires a correctly sized random capability token', () => {
    expect(quoteToken('a'.repeat(43))).toHaveLength(43);
    for (const token of ['', 'a'.repeat(42), 'a'.repeat(44), '/'.repeat(43), null]) expect(() => quoteToken(token)).toThrow();
  });
  it('requires explicit acknowledgement, name, and email', () => {
    expect(validateSigner({ name: ' Jane Smith ', email: 'JANE@example.org', acknowledged: true })).toEqual({ name: 'Jane Smith', email: 'jane@example.org' });
    for (const bad of [{ acknowledged: false }, { name: 'J' }, { email: 'not-an-email' }, { name: 'a'.repeat(201) }, { email: 'x'.repeat(255) }]) {
      expect(() => validateSigner({ name: 'Jane Smith', email: 'jane@example.org', acknowledged: true, ...bad })).toThrow();
    }
  });
  it('requires complete PNG chunks, sane dimensions, and image data', () => {
    const valid = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=', 'base64'));
    expect(() => validateSignaturePng(valid)).not.toThrow();
    expect(() => validateSignaturePng(valid.slice(0, -1))).toThrow();
    expect(() => validateSignaturePng(new Uint8Array([137, 80, 78, 71]))).toThrow();
    const large = valid.slice();
    new DataView(large.buffer).setUint32(16, 10_000);
    expect(() => validateSignaturePng(large)).toThrow();
  });
  it('uses shared PNG decoding and token hashing without logging capabilities', () => {
    expect(quotes).toContain('decodePngSignature(signaturePng)');
    expect(quotes).toContain('validateSignaturePng(signature)');
    expect(quotes).toContain("p_snapshot_sha256: quote.snapshot_sha256");
    expect(quotes).toContain('validateSigner(body)');
    expect(quotes).not.toContain('console.log');
    expect(quotes).toContain('const { crm: _crm, ...publicSnapshot }');
  });
});

describe('workflow SQL structural safety contracts (not runtime DB tests)', () => {
  it('is transactional and only deletes legacy surveys at migration top level', () => {
    expect(sql).toMatch(/\bbegin;/i);
    expect(sql.trim()).toMatch(/commit;$/i);
    const topLevel = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
    expect([...topLevel.matchAll(/delete\s+from\s+public\.(\w+)/gi)].map((match) => match[1])).toEqual(['wildfire_site_surveys']);
    expect(topLevel).not.toMatch(/truncate|drop table/i);
  });
  it('preserves legacy proposals and makes prospect/property CRM optional', () => {
    expect(sql).toContain('alter column organization_id drop not null');
    expect(sql).toContain('from public.wildfire_proposals order by quote_id');
    for (const field of ['prospect_name','prospect_website','prospect_email','prospect_phone','prospect_location','research_notes','source_urls']) expect(sql).toContain(`add column if not exists ${field}`);
  });
  it('locks version allocation and saves lines atomically', () => {
    expect(functionBody('wildfire_create_site_plan')).toMatch(/wildfire_properties[\s\S]*for update/);
    expect(functionBody('wildfire_create_quote_from_plan')).toMatch(/wildfire_opportunities[\s\S]*for update/);
    expect(functionBody('wildfire_save_quote')).toMatch(/for update[\s\S]*q\.status <> 'draft'/);
    expect(functionBody('wildfire_save_quote')).toContain('jsonb_to_recordset(p_lines)');
    expect(functionBody('wildfire_clone_quote')).toContain('coalesce(max(version),0)+1');
  });
  it('protects all commercial quote content and original published snapshots', () => {
    expect(functionBody('wildfire_guard_quote')).toContain("old.snapshot is not null or old.status <> 'draft'");
    expect(functionBody('wildfire_guard_quote')).toContain("array['status','updated_at']");
    for (const table of ['wildfire_quote_lines','wildfire_quote_costs','wildfire_proposals']) expect(sql).toMatch(new RegExp(`before insert or update or delete on public\\.${table}`));
    expect(functionBody('wildfire_guard_quote_child')).toContain('for update');
  });
  it('keeps capabilities and signatures inaccessible to public/staff clients', () => {
    expect(sql).toContain('revoke all on public.wildfire_quote_links,public.wildfire_quote_acceptances from public,anon,authenticated');
    expect(sql).toMatch(/wildfire_accept_quote\(text,text,text,text,text,text,boolean,jsonb\) from public,anon,authenticated/);
    expect(functionBody('wildfire_accept_quote')).toContain("auth.role() is distinct from 'service_role'");
    expect(functionBody('wildfire_publish_quote')).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain('before update or delete on public.wildfire_quote_acceptances');
  });
  it('row-locks acceptance, checks capability expiry/revocation, and is idempotent', () => {
    const accept = functionBody('wildfire_accept_quote');
    expect(accept).toContain('where token_hash=p_token_hash for update');
    expect(accept).toContain('link.revoked_at is not null');
    expect(accept).toContain('link.expires_at<=now()');
    expect(accept.indexOf("if deployment is not null")).toBeLessThan(accept.indexOf("link.expires_at<=now()"));
    expect(accept.match(/insert into public\.wildfire_deployments/g)).toHaveLength(1);
    expect(sql).toContain('wildfire_deployment_quote_unique');
    expect(sql).toContain('quote_id uuid not null unique');
  });
  it('creates or explicitly links CRM only inside acceptance, never by name/email merges', () => {
    const accept = functionBody('wildfire_accept_quote');
    expect(accept).toContain("q.snapshot->'crm'->>'organization_id'");
    expect(accept).toContain('Prelinked CRM company and contact do not match.');
    expect(accept).toContain('insert into public.crm_organizations');
    expect(accept).toContain('insert into public.crm_contacts');
    expect(accept).not.toMatch(/where\s+(?:lower\()?name|where\s+(?:lower\()?email/i);
    expect(functionBody('wildfire_publish_quote')).not.toContain('insert into public.crm_');
    expect(functionBody('wildfire_create_site_plan')).not.toContain('insert into public.crm_');
  });
  it('binds signature/snapshot hashes and prevents arbitrary staff deployment inserts', () => {
    expect(functionBody('wildfire_accept_quote')).toContain('p_snapshot_sha256 is distinct from q.snapshot_sha256');
    expect(functionBody('wildfire_accept_quote')).toContain("sha256(decode(substring(p_signature_png from 23),'base64'))");
    expect(sql).toContain('revoke insert,delete on public.wildfire_deployments from authenticated');
    expect(functionBody('wildfire_guard_deployment')).toContain('Deployments are created only by quote acceptance.');
    expect(functionBody('wildfire_accept_quote')).toContain("'quote_accepted'");
    expect(sql).toContain('wildfire_deployment_status_history');
    expect(sql).toContain('wildfire_events_immutable');
  });
});
