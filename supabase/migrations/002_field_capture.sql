-- =====================================================================
-- BOSC Asset Capture — field-capture additions
-- Adds fields produced at capture time: the scanned asset number, the
-- structured location code, and the tag-photo sharpness metric.
-- Run in the Supabase SQL editor, or: supabase db push
-- =====================================================================

alter table capture_packet
  add column if not exists scanned_asset_num text,   -- decoded from tag barcode/QR in the field
  add column if not exists building          text,   -- building code, e.g. 2252
  add column if not exists location_code     text,   -- assembled UCSF code, e.g. 2252-01-1C3
  add column if not exists tag_sharpness     real;   -- focus metric of the tag photo (higher = sharper)

create index if not exists capture_packet_scanned_idx  on capture_packet(scanned_asset_num);
create index if not exists capture_packet_location_idx on capture_packet(location_code);

-- Surface the new fields in the reviewer convenience view.
create or replace view capture_packet_review as
select
  p.id,
  p.captured_at,
  p.tech_name,
  p.scanned_asset_num,
  p.location_code,
  p.building,
  p.extracted_asset_num,
  p.extracted_manufacturer,
  p.extracted_serial,
  p.extracted_model,
  p.extracted_install_date,
  p.extraction_status,
  p.maximo_asset_num,
  p.maximo_match_status,
  p.tag_sharpness,
  p.notes,
  (select count(*) from capture_photo cp where cp.packet_id = p.id) as photo_count,
  (select storage_path from capture_photo cp where cp.packet_id = p.id and cp.photo_type = 'tag' limit 1) as tag_path
from capture_packet p
order by p.captured_at desc;
