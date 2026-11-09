import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bundle = readFileSync(new URL('../flown_ops_update_all.sql', import.meta.url), 'utf8');
const sources = [
  '20261107160000_live_company_collaboration.sql',
  '20261110150000_flown_systems.sql',
  '20261114110000_multi_system_operations.sql',
  '20261115100000_company_crm.sql',
  '20261115110000_retire_company_ideas.sql',
  '20261115120000_contract_placement_and_countersigning.sql',
  '20261115130000_support_email_queue.sql',
  '20261116100000_outlook_support.sql',
];

describe('manual workspace update bundle', () => {
  it.each(sources)('includes the exact migration %s', (name) => {
    const path = `supabase/migrations/${name}`;
    const bundled = bundle.split(`-- BEGIN ${path}\n`)[1]?.split(`-- END ${path}`)[0];
    expect(bundled?.trim()).toBe(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').trim());
  });
  it('warns about destructive Ideas deletion before opening the transaction', () => {
    expect(bundle.indexOf('WARNING: permanently deletes all Ideas')).toBeLessThan(bundle.indexOf('begin;'));
    expect(bundle.trimEnd().endsWith('commit;')).toBe(true);
    expect(bundle).toContain('does not register Supabase CLI migration history');
  });
});
