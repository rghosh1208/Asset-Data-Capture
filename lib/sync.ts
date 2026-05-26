import { supabase } from './supabase';
import {
  getPendingPackets,
  getPhotosForPacket,
  updatePacketStatus,
  type LocalPacket,
  type LocalPhoto,
} from './queue';

export type SyncResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

let _syncing = false;

/** Sync everything pending. Safe to call concurrently — second call is a no-op. */
export async function syncAllPending(): Promise<SyncResult> {
  if (_syncing) return { attempted: 0, succeeded: 0, failed: 0 };
  _syncing = true;
  try {
    const pending = await getPendingPackets();
    let succeeded = 0;
    let failed = 0;
    for (const p of pending) {
      try {
        await updatePacketStatus(p.id, 'syncing');
        await syncPacket(p);
        await updatePacketStatus(p.id, 'synced', { syncedAt: Date.now() });
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updatePacketStatus(p.id, 'failed', { lastError: msg });
        failed++;
      }
    }
    return { attempted: pending.length, succeeded, failed };
  } finally {
    _syncing = false;
  }
}

async function syncPacket(p: LocalPacket): Promise<void> {
  const sb = supabase();
  const photos = await getPhotosForPacket(p.id);
  if (photos.length === 0) throw new Error('No photos in packet');

  // 1) Upload photos to storage.
  for (const ph of photos) {
    await uploadPhoto(p.id, ph);
  }

  // 2) Insert packet row.
  const { error: pErr } = await sb.from('capture_packet').insert({
    id: p.id,
    captured_at: new Date(p.capturedAt).toISOString(),
    tech_name: p.techName,
    device_id: p.deviceId,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    notes: p.notes || null,
  });
  if (pErr) throw new Error(`packet insert: ${pErr.message}`);

  // 3) Insert photo rows.
  const photoRows = photos.map(ph => ({
    id: ph.id,
    packet_id: p.id,
    photo_type: ph.type,
    storage_path: storagePath(p.id, ph),
    order_idx: ph.orderIdx,
    width: ph.width,
    height: ph.height,
  }));
  const { error: phErr } = await sb.from('capture_photo').insert(photoRows);
  if (phErr) throw new Error(`photo insert: ${phErr.message}`);
}

function storagePath(packetId: string, ph: LocalPhoto) {
  return `${packetId}/${ph.id}.jpg`;
}

async function uploadPhoto(packetId: string, ph: LocalPhoto) {
  const sb = supabase();
  const path = storagePath(packetId, ph);
  const { error } = await sb.storage
    .from('asset-captures')
    .upload(path, ph.blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

// ---- Auto-sync triggers --------------------------------------------

let _autoStarted = false;
let _intervalId: number | null = null;

/** Start background sync: on online event, on focus, and every 60s when online. */
export function startAutoSync(onResult?: (r: SyncResult) => void) {
  if (_autoStarted || typeof window === 'undefined') return;
  _autoStarted = true;

  const tick = async () => {
    if (!navigator.onLine) return;
    try {
      const r = await syncAllPending();
      if (onResult && r.attempted > 0) onResult(r);
    } catch {
      /* swallow — surfaces via packet status */
    }
  };

  window.addEventListener('online', tick);
  window.addEventListener('focus', tick);
  _intervalId = window.setInterval(tick, 60_000);

  // Initial attempt on load.
  tick();
}

export function stopAutoSync() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _autoStarted = false;
}
