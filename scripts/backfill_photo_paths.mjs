// Backfill: relocate photos that were uploaded to the old flat path
// ({packet}/{photoId}.jpg) into the per-type subfolders the app now uses
// ({packet}/Asset Tag|Asset Image|Other Nameplate & Stickers/{photoId}.jpg).
//
// Source of truth is capture_photo.photo_type — we never guess. For every
// photo row we recompute the intended path; if the stored path differs we
// move the object in the bucket and update storage_path to match.
//
// Safe to run repeatedly (idempotent) and dry-run by default.
//
// Usage:
//   export SUPABASE_URL="https://<project>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # NOT the anon key
//   node scripts/backfill_photo_paths.mjs           # dry run — prints planned moves
//   node scripts/backfill_photo_paths.mjs --apply   # actually move + update DB
//
// The service-role key is required because moving storage objects and updating
// capture_photo are blocked for the anon key by RLS. Keep it out of the app;
// this is an operator script run from a trusted machine.

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'asset-captures';
const APPLY = process.argv.includes('--apply');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, not anon).',
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Must match lib/sync.ts photoKind() exactly.
function photoKind(type) {
  if (type === 'tag') return 'Asset Tag';
  if (type === 'other') return 'Asset Image';
  return 'Other Nameplate & Stickers'; // nameplate
}

function correctPath(packetId, photoId, type) {
  return `${packetId}/${photoKind(type)}/${photoId}.jpg`;
}

async function main() {
  console.log(APPLY ? '== APPLY mode ==' : '== DRY RUN (pass --apply to move) ==');

  // Page through capture_photo so we don't rely on a single unbounded fetch.
  const pageSize = 1000;
  let from = 0;
  let scanned = 0;
  let moved = 0;
  let alreadyOk = 0;
  let missing = 0;
  let failed = 0;

  for (;;) {
    const { data: rows, error } = await sb
      .from('capture_photo')
      .select('id, packet_id, photo_type, storage_path')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`select capture_photo: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      scanned++;
      const target = correctPath(r.packet_id, r.id, r.photo_type);
      const current = r.storage_path;

      if (current === target) {
        alreadyOk++;
        continue;
      }

      console.log(`MOVE  ${current}\n   -> ${target}  (${r.photo_type})`);

      if (!APPLY) {
        moved++; // counts as "would move"
        continue;
      }

      // Move the object, then update the DB pointer. If the source object is
      // already gone (e.g. a prior partial run moved it) but the DB still points
      // at the old path, fall back to just fixing the DB pointer.
      const { error: mvErr } = await sb.storage.from(BUCKET).move(current, target);
      if (mvErr) {
        // Does the target already exist? Then the object moved before and only
        // the DB is stale — repair the pointer.
        const { data: check } = await sb.storage
          .from(BUCKET)
          .list(target.slice(0, target.lastIndexOf('/')), {
            search: target.slice(target.lastIndexOf('/') + 1),
          });
        const existsAtTarget = check?.some(
          (o) => o.name === target.slice(target.lastIndexOf('/') + 1),
        );
        if (!existsAtTarget) {
          console.warn(`  ! move failed and target absent: ${mvErr.message}`);
          missing++;
          continue;
        }
      }

      const { error: upErr } = await sb
        .from('capture_photo')
        .update({ storage_path: target })
        .eq('id', r.id);
      if (upErr) {
        console.error(`  ! db update failed for ${r.id}: ${upErr.message}`);
        failed++;
        continue;
      }
      moved++;
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log('\n--- summary ---');
  console.log(`scanned:      ${scanned}`);
  console.log(`${APPLY ? 'moved' : 'would move'}: ${moved}`);
  console.log(`already ok:   ${alreadyOk}`);
  if (missing) console.log(`source missing: ${missing}`);
  if (failed) console.log(`db update failed: ${failed}`);
  if (!APPLY) console.log('\nRe-run with --apply to perform the moves.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
