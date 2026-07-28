-- 003_storage_rls_fix.sql
-- Fixes: "new row violates row-level security policy" on photo upload.
-- Root cause: the anon INSERT/SELECT policies on storage.objects (and the
-- capture tables) were never applied to the live project, so the anon key the
-- field app uses cannot write to the asset-captures bucket.
--
-- Safe to run repeatedly: every statement is idempotent.

-- ---- Bucket ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('asset-captures', 'asset-captures', false)
on conflict (id) do nothing;

-- ---- Storage object policies (the actual fix) ------------------------
drop policy if exists "asset-captures anon upload" on storage.objects;
create policy "asset-captures anon upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'asset-captures');

drop policy if exists "asset-captures anon read" on storage.objects;
create policy "asset-captures anon read"
  on storage.objects for select to anon
  using (bucket_id = 'asset-captures');

-- ---- Table policies (re-affirmed, in case 001 didn't fully apply) ----
alter table capture_packet enable row level security;
alter table capture_photo  enable row level security;

drop policy if exists capture_packet_insert_anon on capture_packet;
create policy capture_packet_insert_anon on capture_packet
  for insert to anon with check (true);

drop policy if exists capture_packet_select_anon on capture_packet;
create policy capture_packet_select_anon on capture_packet
  for select to anon using (true);

drop policy if exists capture_photo_insert_anon on capture_photo;
create policy capture_photo_insert_anon on capture_photo
  for insert to anon with check (true);

drop policy if exists capture_photo_select_anon on capture_photo;
create policy capture_photo_select_anon on capture_photo
  for select to anon using (true);
