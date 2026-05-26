import { openDB, type IDBPDatabase } from 'idb';

// ---- Types ---------------------------------------------------------

export type PhotoType = 'tag' | 'nameplate' | 'other';

export interface LocalPhoto {
  id: string;            // photo_<ts>_<rand>
  packetId: string;
  type: PhotoType;
  blob: Blob;
  width: number;
  height: number;
  orderIdx: number;
  createdAt: number;     // ms epoch
}

export type SyncStatus = 'draft' | 'pending' | 'syncing' | 'synced' | 'failed';

export interface LocalPacket {
  id: string;            // pkt_<ts>_<rand>
  capturedAt: number;
  techName: string;
  deviceId: string;
  lat?: number;
  lng?: number;
  notes: string;
  status: SyncStatus;
  lastError?: string;
  syncedAt?: number;
}

// ---- DB ------------------------------------------------------------

const DB_NAME = 'asset-capture';
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function db() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('packets')) {
        const s = d.createObjectStore('packets', { keyPath: 'id' });
        s.createIndex('byStatus', 'status');
        s.createIndex('byCapturedAt', 'capturedAt');
      }
      if (!d.objectStoreNames.contains('photos')) {
        const s = d.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('byPacket', 'packetId');
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings');
      }
    },
  });
  return _db;
}

// ---- ID helpers ----------------------------------------------------

const rand = () => Math.random().toString(36).slice(2, 8);
export const newPacketId = () => `pkt_${Date.now()}_${rand()}`;
export const newPhotoId = () => `ph_${Date.now()}_${rand()}`;

export async function getDeviceId(): Promise<string> {
  const d = await db();
  let id = (await d.get('settings', 'deviceId')) as string | undefined;
  if (!id) {
    id = `dev_${rand()}${rand()}`;
    await d.put('settings', id, 'deviceId');
  }
  return id;
}

// ---- Settings ------------------------------------------------------

export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const d = await db();
  return (await d.get('settings', key)) as T | undefined;
}
export async function setSetting(key: string, value: unknown) {
  const d = await db();
  await d.put('settings', value, key);
}

// ---- Packets -------------------------------------------------------

export async function savePacket(p: LocalPacket) {
  const d = await db();
  await d.put('packets', p);
}

export async function getPacket(id: string): Promise<LocalPacket | undefined> {
  const d = await db();
  return (await d.get('packets', id)) as LocalPacket | undefined;
}

export async function getAllPackets(): Promise<LocalPacket[]> {
  const d = await db();
  const all = (await d.getAll('packets')) as LocalPacket[];
  return all
    .filter(p => p.status !== 'draft')
    .sort((a, b) => b.capturedAt - a.capturedAt);
}

export async function getPendingPackets(): Promise<LocalPacket[]> {
  const d = await db();
  // We want anything not 'synced' and not 'draft'.
  const all = (await d.getAll('packets')) as LocalPacket[];
  return all.filter(p => p.status === 'pending' || p.status === 'failed');
}

export async function updatePacketStatus(
  id: string,
  status: SyncStatus,
  extras?: { lastError?: string; syncedAt?: number }
) {
  const d = await db();
  const p = (await d.get('packets', id)) as LocalPacket | undefined;
  if (!p) return;
  await d.put('packets', { ...p, status, ...extras });
}

// ---- Photos --------------------------------------------------------

export async function addPhoto(ph: LocalPhoto) {
  const d = await db();
  await d.put('photos', ph);
}

export async function getPhotosForPacket(packetId: string): Promise<LocalPhoto[]> {
  const d = await db();
  const all = (await d.getAllFromIndex('photos', 'byPacket', packetId)) as LocalPhoto[];
  return all.sort((a, b) => a.orderIdx - b.orderIdx);
}

export async function deletePhoto(id: string) {
  const d = await db();
  await d.delete('photos', id);
}

export async function deletePacketWithPhotos(packetId: string) {
  const d = await db();
  const tx = d.transaction(['packets', 'photos'], 'readwrite');
  await tx.objectStore('packets').delete(packetId);
  const phStore = tx.objectStore('photos');
  const idx = phStore.index('byPacket');
  let cursor = await idx.openCursor(packetId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---- Aggregate counts ----------------------------------------------

export async function getStats() {
  const all = await getAllPackets();
  const d = await db();
  const photoCount = (await d.count('photos'));
  return {
    packets: all.length,
    photos: photoCount,
    pending: all.filter(p => p.status === 'pending' || p.status === 'failed').length,
  };
}
