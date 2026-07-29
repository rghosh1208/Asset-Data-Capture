// =====================================================================
// BOSC Asset Capture — DESTRUCTIVE full reset
//
// Empties the "asset-captures" storage bucket AND deletes every row from
// capture_photo and capture_packet. Use this to start from a clean slate.
//
// THERE IS NO UNDO. Deleted photos and rows are gone for good.
//
// Dry-run by default: it lists what it WOULD delete and stops. Pass --yes to
// actually delete.
//
// ---- Env ------------------------------------------------------------
//   export SUPABASE_URL="https://<project>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # bypasses RLS
//
// ---- Run ------------------------------------------------------------
//   node scripts/clear_all.mjs           # dry run — shows counts only
//   node scripts/clear_all.mjs --yes     # actually wipe everything
//
// (Reuses your secrets file kept OUTSIDE this repo:
//   set -a && source ~/.bosc-asset-capture.env && set +a && node scripts/clear_all.mjs --yes )
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'asset-captures';
const YES = process.argv.includes('--yes');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (service role, not anon).');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Recursively list every object path under a prefix. In Supabase storage a
// "folder" entry comes back with id === null; a real file has an id.
async function listAll(prefix = '') {
  const out = [];
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        out.push(...(await listAll(full))); // folder → recurse
      } else {
        out.push(full);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function main() {
  console.log(YES ? '== WIPE mode (--yes) ==' : '== DRY RUN (pass --yes to delete) ==');

  // --- Count DB rows ---
  const { count: packetCount, error: pcErr } = await sb
    .from('capture_packet')
    .select('id', { count: 'exact', head: true });
  if (pcErr) throw new Error(`count packets: ${pcErr.message}`);

  const { count: photoCount, error: phcErr } = await sb
    .from('capture_photo')
    .select('id', { count: 'exact', head: true });
  if (phcErr) throw new Error(`count photos: ${phcErr.message}`);

  // --- Count storage objects ---
  const objects = await listAll('');

  console.log(`storage objects: ${objects.length}`);
  console.log(`capture_photo rows: ${photoCount ?? 0}`);
  console.log(`capture_packet rows: ${packetCount ?? 0}`);

  if (!YES) {
    console.log('\nDry run only — nothing deleted. Re-run with --yes to wipe.');
    return;
  }

  // --- Delete storage objects in batches ---
  let removed = 0;
  const batchSize = 100;
  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    const { error } = await sb.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove batch @${i}: ${error.message}`);
    removed += batch.length;
    process.stdout.write(`\rdeleted ${removed}/${objects.length} objects`);
  }
  if (objects.length) process.stdout.write('\n');

  // --- Delete DB rows (photos first, then packets) ---
  const { error: dPhErr } = await sb.from('capture_photo').delete().not('id', 'is', null);
  if (dPhErr) throw new Error(`delete capture_photo: ${dPhErr.message}`);
  const { error: dPkErr } = await sb.from('capture_packet').delete().not('id', 'is', null);
  if (dPkErr) throw new Error(`delete capture_packet: ${dPkErr.message}`);

  console.log('\nDone. Storage bucket emptied and both tables cleared.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
