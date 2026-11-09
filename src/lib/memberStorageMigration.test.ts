import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../supabase/migrations/20261113120000_member_storage_access.sql', import.meta.url), 'utf8');
const policy = (name: string) => {
  const match = sql.match(new RegExp(`create policy "${name}"\\s+([\\s\\S]*?);`));
  expect(match, `missing policy: ${name}`).not.toBeNull();
  return match![1];
};

describe('member storage migration contract', () => {
  it('is transactional and limits new privileges to caller-scoped helper functions', () => {
    expect(sql).toMatch(/\nbegin;/);
    expect(sql.trim()).toMatch(/commit;$/);
    expect(sql).not.toMatch(/grant\s+(all|select|insert|update|delete)|disable row level security|delete from storage\.objects/i);
    expect(sql.match(/grant execute on function .* to authenticated;/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function .* from public, anon;/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public, pg_temp/g)).toHaveLength(2);
    expect(sql).toContain("coalesce(account_status, 'active') = 'active'");
    expect(policy('Active members access workspace storage')).toContain('as restrictive for all to authenticated');
  });

  it('supports upload upsert and pre-insert signing without granting readers overwrite access', () => {
    expect(sql).toContain("channel.id = (storage.foldername(p_name))[2]");
    expect(sql).toContain('(storage.foldername(p_name))[1] = auth.uid()::text');
    expect(sql).toContain('public.is_channel_member(channel.id, auth.uid()::text)');
    expect(sql).toContain('profile.system_role = any(channel.posting_roles)');
    expect(sql).toContain('public.is_conversation_participant((storage.foldername(p_name))[2], auth.uid()::text)');
    expect(policy('Authenticated users can upload message attachments')).toContain('public.can_upload_message_attachment(name)');
    const read = policy('Authorized users can read message attachments');
    expect(read).toContain('public.can_access_conversation((storage.foldername(name))[2], auth.uid()::text)');
    expect(read).toContain('(storage.foldername(name))[1] = auth.uid()::text');
    expect(read).toContain("jsonb_build_object('storagePath', storage.objects.name)");
    const update = policy('Authors can replace message attachments');
    expect(update).toContain('for update to authenticated');
    expect(update.match(/public.can_upload_message_attachment\(name\)/g)).toHaveLength(2);
    expect(policy('Authors can delete message attachments')).toContain('public.can_access_conversation');
  });

  it('removes both historical message read policy names before replacing them', () => {
    expect(sql).toContain('drop policy if exists "Authenticated users can read message attachments"');
    expect(sql).toContain('drop policy if exists "Authorized users can read message attachments"');
    for (const name of sql.matchAll(/create policy "([^"]+)"/g)) {
      expect(sql).toContain(`drop policy if exists "${name[1]}" on storage.objects;`);
    }
  });

  it('does not resurrect legacy channel/Drive writes or retired screenshots', () => {
    expect(policy('Channel members can read channel attachments')).toContain('(storage.foldername(storage.objects.name))[1]');
    expect(sql).toContain('drop policy if exists "Channel members can upload channel attachments"');
    expect(sql).toContain('drop policy if exists "Users can upload their drive files"');
    expect(sql).toContain('drop policy if exists "Users can delete their drive files"');
    expect(sql).not.toMatch(/create policy "(Channel members can upload|Users can upload their drive|Users can delete their drive)/);
    expect(policy('Drive files are readable by collaborators')).toContain('share.shared_with_user_id = auth.uid()');
    expect(sql).not.toContain("'bug-report-screenshots'");
  });

  it('preserves shared work and engineering access while requiring active, own-prefix uploads', () => {
    expect(policy('Staff read work files')).toContain('public.can_view_entity(attachment.entity_type)');
    expect(policy('Staff upload work files')).toContain("(storage.foldername(name))[2] in ('project', 'task', 'grant')");
    expect(policy('Staff read engineering files')).toContain("public.has_app_access('engineering', 'view')");
    expect(policy('Staff upload engineering files')).toContain("public.has_app_access('engineering', 'edit')");
    for (const name of ['Staff upload work files', 'Staff upload engineering files', 'Customer editors upload contract storage', 'Staff upload own avatars']) {
      expect(policy(name)).toContain('public.is_active_storage_member()');
      expect(policy(name)).toContain('(storage.foldername(name))[1] = auth.uid()::text');
    }
  });

  it('preserves append-only PDFs and admin-only policy uploads with the actual policies/user prefix', () => {
    const upload = policy('Authenticated staff can upload organization documents');
    expect(upload).toContain('public.is_workspace_admin()');
    expect(upload).toContain("(storage.foldername(name))[1] = 'policies'");
    expect(upload).toContain('(storage.foldername(name))[2] = auth.uid()::text');
    expect(upload).toContain("metadata->>'mimetype' = 'application/pdf'");
    const read = policy('Authenticated staff can read organization documents');
    expect(read).toContain("document.status = 'published'");
    expect(read).toContain('event.user_id = auth.uid()::text');
    expect(read).toContain("(storage.foldername(name))[1] <> 'signatures'");
    expect(sql).not.toMatch(/create policy[^;]+for (update|delete)[^;]+bucket_id = '(contracts-files|organization-documents)'/);
  });

  it('retains public avatars but requires active ownership for each mutation', () => {
    expect(sql).not.toContain('drop policy if exists "Public avatar read"');
    for (const name of ['Staff upload own avatars', 'Staff update own avatars', 'Staff delete own avatars']) {
      expect(policy(name)).toContain('public.is_active_storage_member()');
      expect(policy(name)).toContain('(storage.foldername(name))[1] = auth.uid()::text');
    }
    expect(policy('Staff update own avatars').match(/public.is_active_storage_member\(\)/g)).toHaveLength(2);
  });
});
