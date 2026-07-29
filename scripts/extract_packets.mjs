// =====================================================================
// BOSC Asset Capture — packet extraction (Claude vision → review sheet)
//
// Walks the capture_packet table, downloads each packet's photos from the
// Supabase "asset-captures" bucket, sends the tag + nameplate photos to the
// Claude vision API, and writes the extracted fields into a review
// spreadsheet (.xlsx) — one row per packet, tag thumbnail embedded, with the
// field-entered location placed next to the location read off the tag so you
// can eyeball mismatches before anything is trusted.
//
// Nothing is written back to Supabase. This is a read-only pull + a local
// spreadsheet you review and correct by hand.
//
// ---- Setup ----------------------------------------------------------
//   cd asset-capture
//   npm install @anthropic-ai/sdk exceljs        # (@supabase/supabase-js already present)
//
// ---- Env ------------------------------------------------------------
//   export SUPABASE_URL="https://<project>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # bypasses RLS for read
//   export ANTHROPIC_API_KEY="sk-ant-..."
//   # optional:
//   export EXTRACT_MODEL="claude-sonnet-5"       # default below
//
// ---- Run ------------------------------------------------------------
// Load secrets from your file kept OUTSIDE this repo, then run, e.g.:
//   set -a && source ~/.bosc-asset-capture.env && set +a && node scripts/extract_packets.mjs
//
//   node scripts/extract_packets.mjs             # only packets not yet extracted
//   node scripts/extract_packets.mjs --all       # every packet, re-extract
//   node scripts/extract_packets.mjs --limit 20  # cap how many are processed
//   node scripts/extract_packets.mjs --out ~/Desktop/review.xlsx
//
// The service-role key is used only to read rows and download objects. Keep it
// out of the app and off shared machines. Cost: a few cents per packet on the
// vision call.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';

const BUCKET = 'asset-captures';
const MODEL = process.env.EXTRACT_MODEL || 'claude-sonnet-5';
const MAX_EXTRA = 5; // cap non-tag images per packet (nameplates + components + others) to keep the payload sane

// ---- args ----
const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const LIMIT = intArg('--limit');
const OUT =
  strArg('--out') ||
  `asset_extraction_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`;

function strArg(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
function intArg(flag) {
  const v = strArg(flag);
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ---- env ----
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!anthropicKey) {
  console.error('Missing ANTHROPIC_API_KEY.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const anthropic = new Anthropic({ apiKey: anthropicKey });

// ---- prompt ---------------------------------------------------------
// The UCSF asset tag carries four lines, e.g.:
//   C4496              -> asset number (a QR on the tag encodes the same, as "=c4496")
//   MSB-ESP-PA11B2     -> PMItem ID
//   Electrical Sub Panel -> description
//   2252-11-1122       -> location the tag CLAIMS (building-floor-room style)
// Nameplate/sticker photos carry manufacturer, model, serial, install date, etc.

const SYSTEM = `You read photographs of UCSF facilities asset tags and equipment nameplates and return structured data. You are precise and never invent values. If a field is not legible or not present, return null for it. Return ONLY a single JSON object, no prose, no markdown fences.`;

function userPromptText() {
  return `Extract the fields below from the attached photos of ONE asset.

The first image (if present) is the UCSF ASSET TAG. A UCSF tag typically shows, on separate lines:
- an asset number (short, e.g. "C4496"; a QR code on the tag may encode it as "=c4496")
- a PMItem ID (e.g. "MSB-ESP-PA11B2")
- a description (e.g. "Electrical Sub Panel")
- a location code (e.g. "2252-11-1122")

The remaining images are NAMEPLATE/STICKER photos of the equipment, or SUB-COMPONENT/PART photos (a specific part or sub-assembly such as a motor, valve, board, or sensor). Read manufacturer, model, serial number, and installation date wherever visible across all of them.

Return exactly this JSON shape (use null for anything you cannot read):
{
  "asset_num": string|null,
  "pmitem_id": string|null,
  "description": string|null,
  "tag_location": string|null,
  "manufacturer": string|null,
  "model": string|null,
  "serial": string|null,
  "install_date": string|null,
  "other": string|null,
  "confidence": "high"|"medium"|"low"
}
"other" = any additional useful text you saw (voltage, capacity, warnings) as a short string. "confidence" = your overall read confidence for the tag fields.`;
}

// ---- main -----------------------------------------------------------

async function main() {
  console.log(`Model: ${MODEL}`);
  console.log(ALL ? 'Scope: ALL packets' : "Scope: packets not yet 'extracted'/'reviewed'");

  let q = sb
    .from('capture_packet')
    .select(
      'id, captured_at, tech_name, scanned_asset_num, location_code, building, extraction_status, notes',
    )
    .order('captured_at', { ascending: false });
  if (!ALL) q = q.not('extraction_status', 'in', '("extracted","reviewed")');
  if (LIMIT) q = q.limit(LIMIT);

  const { data: packets, error } = await q;
  if (error) throw new Error(`select capture_packet: ${error.message}`);
  if (!packets || packets.length === 0) {
    console.log('No packets to process.');
    return;
  }
  console.log(`Packets to process: ${packets.length}\n`);

  const rows = [];
  let tagThumbs = []; // { rowIndex, buffer } for embedding

  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    process.stdout.write(`[${i + 1}/${packets.length}] ${p.id} … `);

    try {
      const photos = await getPhotos(p.id);
      if (photos.length === 0) {
        console.log('no photos, skipped');
        rows.push(baseRow(p, { error: 'no photos' }));
        continue;
      }

      // Order: tag first, then nameplates, then sub-components/parts, then
      // others; cap total images.
      const tag = photos.find((x) => x.photo_type === 'tag');
      const plates = photos.filter((x) => x.photo_type === 'nameplate');
      const components = photos.filter((x) => x.photo_type === 'component');
      const others = photos.filter((x) => x.photo_type === 'other');
      const ordered = [tag, ...plates, ...components, ...others]
        .filter(Boolean)
        .slice(0, 1 + MAX_EXTRA);

      const images = [];
      for (const ph of ordered) {
        const bytes = await download(ph.storage_path);
        if (bytes) images.push({ b64: bytes.toString('base64'), path: ph.storage_path });
      }
      if (images.length === 0) {
        console.log('download failed, skipped');
        rows.push(baseRow(p, { error: 'photo download failed' }));
        continue;
      }

      const extracted = await extract(images);
      rows.push(baseRow(p, extracted));

      // Keep the tag thumbnail for the sheet.
      if (tag) {
        const tb = await download(tag.storage_path);
        if (tb) tagThumbs.push({ rowIndex: rows.length - 1, buffer: tb });
      }

      console.log(
        `ok (asset=${extracted.asset_num ?? '—'}, tagLoc=${extracted.tag_location ?? '—'}, conf=${extracted.confidence ?? '—'})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
      rows.push(baseRow(p, { error: msg }));
    }
  }

  await writeSheet(rows, tagThumbs, OUT);
  console.log(`\nWrote ${rows.length} rows → ${OUT}`);
}

async function getPhotos(packetId) {
  const { data, error } = await sb
    .from('capture_photo')
    .select('id, photo_type, storage_path, order_idx')
    .eq('packet_id', packetId)
    .order('order_idx', { ascending: true });
  if (error) throw new Error(`select capture_photo: ${error.message}`);
  return data ?? [];
}

async function download(path) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

async function extract(images) {
  const content = [{ type: 'text', text: userPromptText() }];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: img.b64 },
    });
  }

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return parseJson(text);
}

function parseJson(text) {
  // Be forgiving: strip fences, grab the first {...} block.
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    return { error: `unparseable model output: ${text.slice(0, 120)}` };
  }
}

// Normalize a location string for comparison (drop spaces/punct, uppercase).
function normLoc(s) {
  return (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function baseRow(p, ex) {
  const formLoc = p.location_code || '';
  const tagLoc = ex.tag_location || '';
  const match =
    !formLoc || !tagLoc ? '' : normLoc(formLoc) === normLoc(tagLoc) ? 'match' : 'MISMATCH';
  return {
    packet_id: p.id,
    captured_at: p.captured_at ? new Date(p.captured_at).toLocaleString() : '',
    tech: p.tech_name || '',
    form_location: formLoc,
    tag_location: tagLoc,
    location_match: match,
    asset_num: ex.asset_num ?? '',
    scanned_asset_num: p.scanned_asset_num || '',
    pmitem_id: ex.pmitem_id ?? '',
    description: ex.description ?? '',
    manufacturer: ex.manufacturer ?? '',
    model: ex.model ?? '',
    serial: ex.serial ?? '',
    install_date: ex.install_date ?? '',
    other: ex.other ?? '',
    confidence: ex.confidence ?? '',
    packet_notes: p.notes || '',
    error: ex.error || '',
  };
}

// ---- spreadsheet ----------------------------------------------------

const COLUMNS = [
  { header: 'Packet ID', key: 'packet_id', width: 24 },
  { header: 'Captured', key: 'captured_at', width: 20 },
  { header: 'Tech', key: 'tech', width: 16 },
  { header: 'Form location', key: 'form_location', width: 16 },
  { header: 'Tag location', key: 'tag_location', width: 16 },
  { header: 'Location match', key: 'location_match', width: 14 },
  { header: 'Asset #', key: 'asset_num', width: 12 },
  { header: 'Scanned asset #', key: 'scanned_asset_num', width: 14 },
  { header: 'PMItem ID', key: 'pmitem_id', width: 18 },
  { header: 'Description', key: 'description', width: 24 },
  { header: 'Manufacturer', key: 'manufacturer', width: 18 },
  { header: 'Model', key: 'model', width: 16 },
  { header: 'Serial', key: 'serial', width: 18 },
  { header: 'Install date', key: 'install_date', width: 14 },
  { header: 'Other', key: 'other', width: 24 },
  { header: 'Confidence', key: 'confidence', width: 12 },
  { header: 'Notes', key: 'packet_notes', width: 24 },
  { header: 'Extraction error', key: 'error', width: 22 },
  { header: 'Tag photo', key: 'tag_photo', width: 22 },
];

async function writeSheet(rows, tagThumbs, outPath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Review');
  ws.columns = COLUMNS;

  // Header styling + freeze.
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    // Highlight location mismatches so the eye lands on them.
    if (r.location_match === 'MISMATCH') {
      row.getCell('location_match').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF6C6C6' },
      };
      row.getCell('location_match').font = { bold: true, color: { argb: 'FF9B1C1C' } };
    } else if (r.location_match === 'match') {
      row.getCell('location_match').font = { color: { argb: 'FF15803D' } };
    }
    if (r.error) {
      row.getCell('error').font = { color: { argb: 'FF9B1C1C' } };
    }
  });

  // Embed tag thumbnails in the last column.
  const tagCol = COLUMNS.findIndex((c) => c.key === 'tag_photo'); // 0-based
  for (const t of tagThumbs) {
    const imgId = wb.addImage({ buffer: t.buffer, extension: 'jpeg' });
    const excelRow = t.rowIndex + 1; // +1 header offset, 0-based tl anchor
    ws.getRow(excelRow + 1).height = 90;
    ws.addImage(imgId, {
      tl: { col: tagCol, row: excelRow },
      ext: { width: 150, height: 112 },
      editAs: 'oneCell',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  writeFileSync(outPath, Buffer.from(buf));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
