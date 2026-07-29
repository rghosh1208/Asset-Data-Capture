-- =====================================================================
-- BOSC Asset Capture — add 'component' photo type
-- Field techs can now capture Sub-component / part photos alongside the
-- asset tag and nameplates. Widen the capture_photo.photo_type CHECK to
-- allow the new value.
-- Run in the Supabase SQL editor, or: supabase db push
-- =====================================================================

alter table capture_photo drop constraint if exists capture_photo_photo_type_check;

alter table capture_photo
  add constraint capture_photo_photo_type_check
  check (photo_type in ('tag','nameplate','component','other'));
