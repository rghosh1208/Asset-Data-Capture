// =====================================================================
// BOSC Asset Capture — packet extraction (Claude vision → review sheet)
//
// Walks the capture_packet table, downloads EVERY photo for each packet from
// the Supabase "asset-captures" bucket, sends them all (plus the field tech's
// notes) to the Claude vision API, and writes an exhaustive extraction into a
// review workbook (.xlsx). The goal is to pull *all* asset information present
// in the pictures — identify what the asset is, read every nameplate/sticker,
// and capture each sub-component (motor, valve, board, VFD, sensor, …) as its
// own record with its own make/model/serial/specs.
//
// Two sheets:
//   "Assets"     — one row per packet (the parent asset). Core identity +
//                  location + main nameplate + a dynamic column for every extra
//                  spec the model read (voltage, phase, amps, capacity, …).
//   "Components" — one row per sub-component, linked back to its parent packet.
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
//   node scripts/extract_packets.mjs --limit 20  # cap how many packets are processed
//   node scripts/extract_packets.mjs --out ~/Desktop/review.xlsx
//
// The service-role key is used only to read rows and download objects. Keep it
// out of the app and off shared machines. Cost: a few cents per packet on the
// vision call (more when a packet has many photos — every photo is sent).
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';

const BUCKET = 'asset-captures';
const MODEL = process.env.EXTRACT_MODEL || 'claude-sonnet-5';
// No cap: every photo in a packet is sent. A generous safety ceiling only
// guards against a runaway packet; raise it if you ever hit it.
const HARD_IMAGE_CEILING = 40;

// ---- args ----
const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
// After a packet is successfully extracted we mark it 'extracted' in Supabase
// so the next plain run skips it. Pass --no-mark to leave statuses untouched
// (e.g. a dry run you don't want to affect future "new only" runs).
const NO_MARK = argv.includes('--no-mark');
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
// Nameplate/sticker photos carry manufacturer, model, serial, install date,
// electrical/capacity specs, etc. Component photos are specific sub-assemblies.
// Some packets have NO tag at all (untagged assets) — for those, the asset must
// be identified by looking at the equipment itself.

const SYSTEM = `You are an expert facilities-asset data extractor for UCSF. You read photographs of equipment — asset tags, nameplates, stickers, and close-ups of sub-components — and return exhaustive, structured data.

Rules:
- Extract EVERYTHING legible. Do not summarize away detail. Every readable spec belongs in the output.
- Never invent or guess a value. If something is not legible or not present, use null. Do not fill a field from general knowledge.
- Identify what the asset physically IS by looking at it (e.g. "Rooftop Air Handling Unit", "Fire Alarm Pull Station", "Centrifugal Pump"), even when there is no tag.
- Distinguish the PARENT asset (the main unit) from SUB-COMPONENTS (a motor, VFD, valve, board, sensor, compressor, etc. that has its own nameplate). Each sub-component with its own plate becomes an entry in "components" with its own manufacturer/model/serial/specs.
- Put any spec that does not have a dedicated field into the "attributes" object as label→value pairs (e.g. "Voltage": "480V", "Phase": "3", "FLA": "12.4", "Capacity": "5 tons", "Refrigerant": "R-410A", "RPM": "1750"). Use clear, consistent labels.
- Use the field technician's notes as an additional source: they may contain the room/location or a description that is not on any plate. Reconcile but never overwrite something you can clearly read in a photo.
Return ONLY a single JSON object — no prose, no markdown fences.`;

function userPromptText(notes) {
  const noteBlock = notes && notes.trim()
    ? `\n\nFIELD TECHNICIAN NOTES for this asset (may contain the room/location or a description not printed on any plate — use them):\n"""\n${notes.trim()}\n"""\n`
    : '\n\n(No field technician notes were recorded for this asset.)\n';

  return `Extract ALL asset information from the attached photos of ONE asset.

If a UCSF ASSET TAG is present it typically shows, on separate lines:
- an asset number (short, e.g. "C4496"; a QR code on the tag may encode it as "=c4496")
- a PMItem ID (e.g. "MSB-ESP-PA11B2")
- a description (e.g. "Electrical Sub Panel")
- a location code (e.g. "2252-11-1122")

If there is NO tag, identify the asset from the equipment itself and read every visible nameplate and sticker.

Read manufacturer, model, serial, dates, and every electrical/capacity/rating spec you can see across ALL images. Treat each distinct nameplate as potentially a different physical component.
${noteBlock}
Return exactly this JSON shape. Use null for anything you cannot read. "attributes" and "components" may be empty ({} and []) but must be present:
{
  "asset_type": string|null,          // what the asset physically is, identified visually
  "asset_num": string|null,
  "pmitem_id": string|null,
  "description": string|null,         // best short description (from tag, plate, or your visual ID)
  "tag_location": string|null,        // location code read off the tag, if any
  "manufacturer": string|null,        // the PARENT / main unit
  "model": string|null,
  "serial": string|null,
  "install_date": string|null,
  "manufacture_date": string|null,
  "attributes": { "<label>": "<value>" },   // every other spec on the MAIN asset
  "components": [                             // one entry per sub-component with its own plate
    {
      "name": string,                        // e.g. "Supply fan motor", "VFD", "Compressor 1"
      "manufacturer": string|null,
      "model": string|null,
      "serial": string|null,
      "install_date": string|null,
      "attributes": { "<label>": "<value>" },
      "notes": string|null
    }
  ],
  "notes_extracted": string|null,      // useful info you took from the field technician notes (e.g. a room not on any plate)
  "readability": string|null,          // brief note on anything blurry/cut off/unreadable
  "confidence": "high"|"medium"|"low"  // overall read confidence
}`;
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

  const assetRows = [];       // one per packet
  const componentRows = [];   // one per sub-component
  const tagThumbs = [];       // { rowIndex, buffer } for embedding

  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    process.stdout.write(`[${i + 1}/${packets.length}] ${p.id} … `);

    try {
      const photos = await getPhotos(p.id);
      if (photos.length === 0) {
        console.log('no photos, skipped');
        assetRows.push(baseRow(p, { error: 'no photos' }));
        continue;
      }

      // Order: tag first, then nameplates, then sub-components/parts, then
      // others. NO cap — send every photo (guarded only by a high ceiling).
      const tag = photos.find((x) => x.photo_type === 'tag');
      const plates = photos.filter((x) => x.photo_type === 'nameplate');
      const components = photos.filter((x) => x.photo_type === 'component');
      const others = photos.filter((x) => x.photo_type === 'other');
      const ordered = [tag, ...plates, ...components, ...others]
        .filter(Boolean)
        .slice(0, HARD_IMAGE_CEILING);

      const images = [];
      for (const ph of ordered) {
        const bytes = await download(ph.storage_path);
        if (bytes) {
          images.push({
            b64: bytes.toString('base64'),
            media_type: mimeForPath(ph.storage_path),
            path: ph.storage_path,
          });
        }
      }
      if (images.length === 0) {
        console.log('download failed, skipped');
        assetRows.push(baseRow(p, { error: 'photo download failed' }));
        continue;
      }

      const extracted = await extract(images, p.notes);
      assetRows.push(baseRow(p, extracted));

      // Fan out sub-components into their own rows.
      const comps = Array.isArray(extracted.components) ? extracted.components : [];
      for (const c of comps) {
        componentRows.push(componentRow(p, extracted, c));
      }

      // Mark this packet done so the next plain run skips it. Only on a clean
      // extraction — failures stay unmarked and get retried next time.
      if (!extracted.error) await markExtracted(p.id);

      // Keep a thumbnail for the sheet — tag if present, else the first photo.
      const thumbSrc = tag || ordered[0];
      if (thumbSrc) {
        const tb = await download(thumbSrc.storage_path);
        if (tb) tagThumbs.push({ rowIndex: assetRows.length - 1, buffer: tb });
      }

      console.log(
        `ok (type=${extracted.asset_type ?? '—'}, asset=${extracted.asset_num ?? '—'}, comps=${comps.length}, imgs=${images.length}, conf=${extracted.confidence ?? '—'})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
      assetRows.push(baseRow(p, { error: msg }));
    }
  }

  await writeSheet(assetRows, componentRows, tagThumbs, OUT);
  console.log(
    `\nWrote ${assetRows.length} asset rows + ${componentRows.length} component rows → ${OUT}`,
  );
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

// Flag a packet as extracted so subsequent plain runs (without --all) skip it.
async function markExtracted(id) {
  if (NO_MARK) return;
  const { error } = await sb
    .from('capture_packet')
    .update({ extraction_status: 'extracted' })
    .eq('id', id);
  if (error) process.stdout.write(`(mark failed: ${error.message}) `);
}

function mimeForPath(path) {
  const ext = (path || '').toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function extract(images, notes) {
  const content = [{ type: 'text', text: userPromptText(notes) }];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.b64 },
    });
  }

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
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
    return { error: `unparseable model output: ${text.slice(0, 160)}` };
  }
}

// Normalize a location string for comparison (drop spaces/punct, uppercase).
function normLoc(s) {
  return (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Flatten an attributes object into a readable "k: v; k: v" string.
function specsString(attrs) {
  if (!attrs || typeof attrs !== 'object') return '';
  return Object.entries(attrs)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function baseRow(p, ex) {
  const formLoc = p.location_code || '';
  const tagLoc = ex.tag_location || '';
  const match =
    !formLoc || !tagLoc ? '' : normLoc(formLoc) === normLoc(tagLoc) ? 'match' : 'MISMATCH';
  const comps = Array.isArray(ex.components) ? ex.components : [];
  return {
    packet_id: p.id,
    captured_at: p.captured_at ? new Date(p.captured_at).toLocaleString() : '',
    tech: p.tech_name || '',
    asset_type: ex.asset_type ?? '',
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
    manufacture_date: ex.manufacture_date ?? '',
    component_count: comps.length || '',
    notes_field: p.notes || '',
    notes_extracted: ex.notes_extracted ?? '',
    readability: ex.readability ?? '',
    confidence: ex.confidence ?? '',
    error: ex.error || '',
    // dynamic attribute columns are merged in later, keyed 'attr::<label>'
    _attributes: ex.attributes && typeof ex.attributes === 'object' ? ex.attributes : {},
  };
}

function componentRow(p, ex, c) {
  return {
    packet_id: p.id,
    parent_asset_num: ex.asset_num ?? '',
    parent_asset_type: ex.asset_type ?? '',
    parent_description: ex.description ?? '',
    component_name: c.name ?? '',
    manufacturer: c.manufacturer ?? '',
    model: c.model ?? '',
    serial: c.serial ?? '',
    install_date: c.install_date ?? '',
    specs: specsString(c.attributes),
    notes: c.notes ?? '',
  };
}

// ---- spreadsheet ----------------------------------------------------

const ASSET_COLUMNS = [
  { header: 'Packet ID', key: 'packet_id', width: 24 },
  { header: 'Captured', key: 'captured_at', width: 20 },
  { header: 'Tech', key: 'tech', width: 16 },
  { header: 'Asset type', key: 'asset_type', width: 24 },
  { header: 'Form location', key: 'form_location', width: 16 },
  { header: 'Tag location', key: 'tag_location', width: 16 },
  { header: 'Location match', key: 'location_match', width: 14 },
  { header: 'Asset #', key: 'asset_num', width: 12 },
  { header: 'Scanned asset #', key: 'scanned_asset_num', width: 14 },
  { header: 'PMItem ID', key: 'pmitem_id', width: 18 },
  { header: 'Description', key: 'description', width: 26 },
  { header: 'Manufacturer', key: 'manufacturer', width: 18 },
  { header: 'Model', key: 'model', width: 16 },
  { header: 'Serial', key: 'serial', width: 18 },
  { header: 'Install date', key: 'install_date', width: 14 },
  { header: 'Mfr date', key: 'manufacture_date', width: 14 },
  { header: '# Sub-components', key: 'component_count', width: 15 },
  { header: 'Notes (field)', key: 'notes_field', width: 26 },
  { header: 'Notes (from AI)', key: 'notes_extracted', width: 26 },
  { header: 'Readability', key: 'readability', width: 22 },
  { header: 'Confidence', key: 'confidence', width: 12 },
  { header: 'Extraction error', key: 'error', width: 22 },
  { header: 'Tag/first photo', key: 'tag_photo', width: 22 },
];

const COMPONENT_COLUMNS = [
  { header: 'Packet ID', key: 'packet_id', width: 24 },
  { header: 'Parent asset #', key: 'parent_asset_num', width: 14 },
  { header: 'Parent type', key: 'parent_asset_type', width: 22 },
  { header: 'Parent description', key: 'parent_description', width: 24 },
  { header: 'Component', key: 'component_name', width: 22 },
  { header: 'Manufacturer', key: 'manufacturer', width: 18 },
  { header: 'Model', key: 'model', width: 16 },
  { header: 'Serial', key: 'serial', width: 18 },
  { header: 'Install date', key: 'install_date', width: 14 },
  { header: 'Specs', key: 'specs', width: 44 },
  { header: 'Notes', key: 'notes', width: 24 },
];

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

async function writeSheet(assetRows, componentRows, tagThumbs, outPath) {
  const wb = new ExcelJS.Workbook();

  // ---- Assets sheet, with dynamic attribute columns -----------------
  const ws = wb.addWorksheet('Assets');

  // Union of every attribute label seen, so each spec gets its own column.
  const attrLabels = [];
  const seen = new Set();
  for (const r of assetRows) {
    for (const label of Object.keys(r._attributes || {})) {
      if (!seen.has(label)) {
        seen.add(label);
        attrLabels.push(label);
      }
    }
  }
  attrLabels.sort((a, b) => a.localeCompare(b));

  const dynamicCols = attrLabels.map((label) => ({
    header: label,
    key: `attr::${label}`,
    width: 16,
  }));

  // Tag photo must stay the last column; insert dynamic cols before it.
  const fixed = ASSET_COLUMNS.slice(0, -1);
  const photoCol = ASSET_COLUMNS[ASSET_COLUMNS.length - 1];
  ws.columns = [...fixed, ...dynamicCols, photoCol];

  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  assetRows.forEach((r) => {
    const flat = { ...r };
    for (const [label, val] of Object.entries(r._attributes || {})) {
      flat[`attr::${label}`] = val == null ? '' : String(val);
    }
    delete flat._attributes;
    const row = ws.addRow(flat);
    row.alignment = { vertical: 'top', wrapText: true };
    if (r.location_match === 'MISMATCH') {
      const cell = row.getCell('location_match');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6C6C6' } };
      cell.font = { bold: true, color: { argb: 'FF9B1C1C' } };
    } else if (r.location_match === 'match') {
      row.getCell('location_match').font = { color: { argb: 'FF15803D' } };
    }
    if (r.error) row.getCell('error').font = { color: { argb: 'FF9B1C1C' } };
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  // Embed thumbnails in the last (photo) column.
  const tagCol = ws.columnCount - 1; // 0-based index of last column
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

  // ---- Components sheet ---------------------------------------------
  const cs = wb.addWorksheet('Components');
  cs.columns = COMPONENT_COLUMNS;
  styleHeader(cs.getRow(1));
  cs.views = [{ state: 'frozen', ySplit: 1 }];
  componentRows.forEach((r) => {
    const row = cs.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
  });
  cs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cs.columnCount } };

  const buf = await wb.xlsx.writeBuffer();
  writeFileSync(outPath, Buffer.from(buf));
}

function styleHeader(row) {
  row.font = HEADER_FONT;
  row.alignment = { vertical: 'middle' };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
