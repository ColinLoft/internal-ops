import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/20261110160000_forms_access_and_retire_internal_tools.sql', import.meta.url), 'utf8');

describe('Forms access and internal-tools retirement migration contract', () => {
  it('authorizes active owners directly for INSERT RETURNING without changing editor or collaborator privileges', () => {
    expect(sql).toContain("where id = auth.uid()::text and account_status = 'active'");
    expect(sql).toContain('owner_id = auth.uid() or public.can_view_company_form(id)');
    expect(sql).toContain('with check (owner_id = auth.uid() and public.is_active_company_forms_staff())');
    expect(sql).not.toMatch(/drop policy.*Form editors|disable row level security|grant.*to anon/i);
    expect(sql).toContain('security definer\nset search_path = public, pg_temp');
  });

  it('requires all actual internal bug-report flags and captures only unshared screenshot paths', () => {
    expect(sql).toContain("where internal_only is true and developer_flag is true and category = 'bug';");
    expect(sql).toContain('retained.screenshot_path = ticket.screenshot_path');
    expect(sql).toContain("object.bucket_id = 'bug-report-screenshots'");
    expect(sql).not.toMatch(/delete from storage\.objects/i);
    expect(sql).toContain('on conflict do nothing');
    expect(sql).toContain('from public, anon, authenticated');
  });

  it('deletes only shared-mailbox rules and their explicit rule audit events, never unrelated workflows', () => {
    expect(sql).toContain("activity.target_type = 'email_mailbox'");
    expect(sql).toContain("'email_rule_created', 'email_rule_enabled', 'email_rule_disabled', 'email_rule_deleted'");
    expect(sql).toContain("rules.mailbox_id = mailbox.id and mailbox.mailbox_type = 'shared'");
    expect(sql.match(/delete from public\.\w+/g)).toEqual([
      'delete from public.system_activity_logs',
      'delete from public.email_rules',
      'delete from public.support_tickets',
    ]);
  });
});
