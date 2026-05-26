# BOSC Asset Capture

A phone-first PWA for UCSF Facilities trades to capture asset tag and nameplate photos in the field. Photos queue offline in IndexedDB, sync to Supabase when online, and feed a nightly AI extraction pass that pulls manufacturer, serial number, model, and install date for reconciliation against Maximo.

## How it works

1. Tech opens the app on their phone (installed as a PWA from a Vercel URL).
2. Taps their name from a list — stored in IndexedDB for the session.
3. Taps **New Asset** → camera opens → snaps the UCSF asset tag.
4. Camera opens again for each nameplate / sticker. Add as many as needed.
5. Taps **Save & next** — packet lands in the local queue, app resets for the next asset.
6. When the device is online, the background sync pushes packets to Supabase Storage + Postgres. Failed uploads stay queued and retry.
7. A nightly worker (next milestone) reads new packets, sends each photo bundle to Anthropic's vision API, and writes extracted fields back to `capture_packet`.
8. A reviewer dashboard (next milestone) confirms each extraction against Maximo and exports an Excel for asset-data updates.

## Architecture

```
Phone (PWA)                      Supabase                       Anthropic
─────────────                    ────────                       ─────────
IndexedDB queue                  Storage bucket: asset-captures
  packets, photos       ─upload─►   {packet_id}/{photo_id}.jpg
                                 capture_packet table     ◄─cron─► extraction worker
                                 capture_photo table              (next milestone)
                                                                  vision API
                                       │
                                       ▼
                                 Review dashboard (next milestone)
                                       │
                                       ▼
                                 Excel export ─► Maximo update
```

## Tech stack

- **Next.js 15** (App Router, TypeScript) — same pattern as your SIFI dashboard.
- **Supabase Pro** — Postgres + Storage. RLS allows anon insert; the service role does extraction and review updates.
- **IndexedDB** via `idb` — offline queue for packets and photo Blobs.
- **PWA** — manifest + hand-rolled service worker. No `next-pwa` (compat issues with App Router).
- **Vercel** — same team account as your other projects.

## Setup

```bash
# 1. Install
npm install

# 2. Schema
# Run supabase/migrations/001_asset_capture.sql in the Supabase SQL editor,
# or with the CLI: supabase db push

# 3. Env
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
# Service role key and Anthropic key are only needed when you build the
# extraction worker in the next milestone.

# 4. Dev
npm run dev
# Open http://localhost:3000 on your phone (same Wi-Fi) via your laptop's
# LAN IP, or use ngrok for HTTPS (camera capture works without HTTPS on
# localhost but requires HTTPS on a phone).

# 5. Deploy
# Push to GitHub (rghosh1208), import into the BOSC Vercel team, set the
# two NEXT_PUBLIC_* env vars in Vercel project settings.
```

## PWA install

Once deployed:

- **iPhone**: Open in Safari → Share → "Add to Home Screen"
- **Android**: Open in Chrome → menu → "Install app"

The app then runs full-screen with no browser chrome and survives offline. You'll want to drop real icon PNGs at `public/icon-192.png` and `public/icon-512.png` before rollout (Figma export or any 512×512 PNG works).

## Project tree

```
asset-capture/
├── app/
│   ├── globals.css       — dark utilitarian theme
│   ├── layout.tsx        — root layout, SW registration
│   └── page.tsx          — capture UI (single screen, 3 views)
├── lib/
│   ├── supabase.ts       — browser client singleton
│   ├── queue.ts          — IndexedDB wrapper (packets, photos, settings)
│   ├── sync.ts           — upload pending packets to Supabase
│   ├── photo.ts          — client-side resize/recompress
│   └── techs.ts          — default tech list
├── public/
│   ├── manifest.webmanifest
│   └── sw.js             — service worker (app shell cache)
├── supabase/
│   └── migrations/
│       └── 001_asset_capture.sql
├── package.json
├── tsconfig.json
├── next.config.js
└── .env.example
```

## Database schema (summary)

`capture_packet` — one row per asset captured. Holds the capture metadata (when/who/where), the AI extraction outputs, and the reviewer's Maximo mapping.

`capture_photo` — N rows per packet. First photo is `photo_type='tag'`, subsequent are `nameplate`. `storage_path` points at the bucket object.

`capture_packet_review` — view that joins photo count + tag thumbnail path; the review dashboard will query this.

## Sync model

- Photos are compressed client-side to ~1600px JPEG (q=0.85). A raw 4MB iPhone photo becomes ~300KB. With 10 photos × 200 assets/day, that's ~600MB/day — comfortable on Supabase Pro's storage.
- The IndexedDB queue is the source of truth on-device. Saving a packet writes locally first; sync is a separate step.
- Sync triggers: page load, `online` event, window focus, every 60 seconds when online, and manual button.
- Failed packets get `status='failed'` with the error text, and are retried on the next trigger.
- Synced packets stay on-device for the session (so techs can review what they've captured today) but can be deleted from the packet detail view.

## Next milestones

**M2 — Nightly extraction worker** (a few hours of work)
- Vercel cron at 02:00 UTC hits `/api/extract`.
- For each `extraction_status='pending'` packet, build signed URLs for the photos and send them to Anthropic's `claude-sonnet-4` with a strict JSON schema (asset_num, manufacturer, serial, model, install_date, confidence).
- Write the result back to `capture_packet`, flip status to `extracted` or `failed`.

**M3 — Review dashboard** (probably the bigger lift)
- `/review` page (server-rendered, uses service role key).
- Lists `capture_packet_review` rows, filterable by extraction_status and maximo_match_status.
- Each row: thumbnail of tag photo, extracted fields editable, dropdown to search Maximo asset numbers (proxy through your existing Maximo SQL Server pipeline).
- Bulk Excel export of confirmed matches for upload via MXLoader.

**M4 — Maximo integration polish**
- Direct match by `extracted_asset_num` against `WORKORDER`/`ASSET`. Auto-set `maximo_match_status='matched'` when the extracted value matches an existing asset.
- Flag `conflict` when extracted manufacturer/serial disagrees with what's already in Maximo.

## Field-rollout notes

- iPhone Safari occasionally evicts IndexedDB after 7 days of disuse. The auto-sync on every app open is your defense — encourage techs to open the app each morning, even just to glance, so anything queued from yesterday flushes.
- Camera permission has to be granted once per origin. Test on a real iPhone before rollout — Safari is fussier than Chrome.
- Geolocation is best-effort with a 3-second timeout. If GPS isn't ready, the packet still saves without lat/lng.
- If you need to add or change tech names, set `NEXT_PUBLIC_TECHS` in Vercel (comma-separated). Edit `lib/techs.ts` for the dev default.

## Known limitations of v1

- No authentication (the anon key is exposed). Fine for an internal tool inside the UCSF network. If you ever want this on the public internet, swap to Supabase Auth with SSO and tighten RLS.
- No conflict resolution if two techs capture the same asset — the second packet just becomes another row. The reviewer dashboard handles dedup.
- No re-take flow inside a synced packet (delete and re-capture instead).
- Service worker scope covers `/` only. Fine until we add more pages.
