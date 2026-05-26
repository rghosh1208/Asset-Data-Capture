-- =====================================================================
-- BOSC Asset Capture — initial schema
-- Run in Supabase SQL editor, or via supabase CLI: supabase db push
-- =====================================================================

-- ---- Tables ---------------------------------------------------------

create table if not exists capture_packet (
  id                       text primary key,                       -- client-generated: pkt_<ts>_<rand>
  captured_at              timestamptz not null,
  tech_name                text not null,
  device_id                text,
  lat                      double precision,
  lng                      double precision,
  notes                    text,

  -- Outputs of nightly extraction
  extracted_asset_num      text,
  extracted_manufacturer   text,
  extracted_serial         text,
  extracted_model          text,
  extracted_install_date   date,
  extracted_other          jsonb,
  extraction_status        text not null default 'pending'         -- pending | extracted | failed | reviewed
                            check (extraction_status in ('pending','extracted','failed','reviewed')),
  extraction_attempted_at  timestamptz,
  extraction_error         text,

  -- Reviewer mapping back to Maximo
  maximo_asset_num         text,
  maximo_match_status      text not null default 'unmatched'
                            check (maximo_match_status in ('unmatched','matched','conflict','skipped')),
  reviewed_by              text,
  reviewed_at              timestamptz,

  created_at               timestamptz not null default now()
);

create index if not exists capture_packet_status_idx     on capture_packet(extraction_status);
create index if not exists capture_packet_captured_idx   on capture_packet(captured_at desc);
create index if not exists capture_packet_match_idx      on capture_packet(maximo_match_status);

create table if not exists capture_photo (
  id            text primary key,
  packet_id     text not null references capture_packet(id) on delete cascade,
  photo_type    text not null check (photo_type in ('tag','nameplate','other')),
  storage_path  text not null,
  order_idx     integer not null default 0,
  width         integer,
  height        integer,
  created_at    timestamptz not null default now()
);

create index if not exists capture_photo_packet_idx on capture_photo(packet_id, order_idx);

-- ---- RLS ------------------------------------------------------------
-- Field techs use the anon key. They can INSERT new packets/photos
-- and READ their own session, but they cannot mutate extraction
-- or review fields. The service role (nightly worker + review
-- dashboard with elevated key) handles those updates.

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

-- ---- Storage bucket -------------------------------------------------
-- One bucket holds every photo. Path convention:
--   asset-captures/{packet_id}/{photo_id}.jpg

insert into storage.buckets (id, name, public)
values ('asset-captures', 'asset-captures', false)
on conflict (id) do nothing;

drop policy if exists "asset-captures anon upload"  on storage.objects;
create policy "asset-captures anon upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'asset-captures');

drop policy if exists "asset-captures anon read"  on storage.objects;
create policy "asset-captures anon read"
  on storage.objects for select to anon
  using (bucket_id = 'asset-captures');

-- ---- Review view (convenience) --------------------------------------

create or replace view capture_packet_review as
select
  p.id,
  p.captured_at,
  p.tech_name,
  p.extracted_asset_num,
  p.extracted_manufacturer,
  p.extracted_serial,
  p.extracted_model,
  p.extracted_install_date,
  p.extraction_status,
  p.maximo_asset_num,
  p.maximo_match_status,
  p.notes,
  (select count(*) from capture_photo cp where cp.packet_id = p.id) as photo_count,
  (select storage_path from capture_photo cp where cp.packet_id = p.id and cp.photo_type = 'tag' limit 1) as tag_path
from capture_packet p
order by p.captured_at desc;
