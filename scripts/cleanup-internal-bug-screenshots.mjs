import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY privately in your shell.');
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const manifest = 'retired_internal_bug_screenshot_cleanup';
let offset = 0;
let count = 0;
while (true) {
  const { data, error } = await client.from(manifest)
    .select('bucket_id,object_name').order('object_name').range(offset, offset + 99);
  if (error) throw new Error(error.message);
  if (!data.length) break;
  for (const row of data) {
    if (row.bucket_id !== 'bug-report-screenshots') throw new Error('Unexpected cleanup bucket; stopping.');
    // Recheck references immediately before removal. Retained customer tickets
    // (including any added after migration) must never lose an attachment.
    const references = await client.from('support_tickets').select('id')
      .eq('screenshot_path', row.object_name).limit(1);
    if (references.error) throw new Error(references.error.message);
    if (references.data.length) throw new Error('A queued screenshot is referenced by a retained ticket; stopping.');
    if (apply) {
      const removed = await client.storage.from(row.bucket_id).remove([row.object_name]);
      if (removed.error) throw new Error(removed.error.message);
      // Storage API removes both bytes and metadata; only then clear the manifest.
      const cleared = await client.from(manifest).delete()
        .eq('bucket_id', row.bucket_id).eq('object_name', row.object_name);
      if (cleared.error) throw new Error(cleared.error.message);
    }
    count += 1;
  }
  if (!apply) offset += data.length;
}
console.log(`${apply ? 'Removed' : 'Would remove'} ${count} explicitly internal bug-report screenshots.`);
