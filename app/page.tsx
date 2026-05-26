'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTechs } from '@/lib/techs';
import { processPhoto } from '@/lib/photo';
import {
  addPhoto,
  deletePacketWithPhotos,
  deletePhoto,
  getAllPackets,
  getDeviceId,
  getPhotosForPacket,
  getSetting,
  newPacketId,
  newPhotoId,
  savePacket,
  setSetting,
  type LocalPacket,
  type LocalPhoto,
  type PhotoType,
} from '@/lib/queue';
import { startAutoSync, syncAllPending } from '@/lib/sync';

type View = 'home' | 'capture' | 'detail';

interface DraftPhoto {
  id: string;
  type: PhotoType;
  blob: Blob;
  url: string;       // object URL for <img>
  width: number;
  height: number;
  name: string;
}

interface Draft {
  id: string;
  capturedAt: number;
  photos: DraftPhoto[];
  notes: string;
}

export default function CapturePage() {
  const [view, setView] = useState<View>('home');
  const [tech, setTech] = useState<string | null>(null);
  const [techModal, setTechModal] = useState(false);
  const [packets, setPackets] = useState<Array<LocalPacket & { tagThumbUrl?: string; photoCount: number }>>([]);
  const [stats, setStats] = useState({ packets: 0, photos: 0, pending: 0 });
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>('—');
  const [toast, setToast] = useState<string | null>(null);

  // Capture state
  const [draft, setDraft] = useState<Draft | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const plateInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Detail view
  const [detail, setDetail] = useState<{ packet: LocalPacket; photos: Array<LocalPhoto & { url: string }> } | null>(null);

  const techs = useMemo(() => getTechs(), []);

  // ---- Init: load tech, online state, auto-sync, packets ----
  useEffect(() => {
    (async () => {
      const t = await getSetting<string>('tech');
      if (t) setTech(t);
      setOnline(navigator.onLine);
      await refreshPackets();
      startAutoSync((r) => {
        if (r.attempted > 0) {
          showToast(r.failed === 0
            ? `Synced ${r.succeeded}`
            : `Synced ${r.succeeded}, ${r.failed} failed`);
          refreshPackets();
        }
      });
    })();

    const up = () => { setOnline(true); setSyncStatus('Online'); };
    const down = () => { setOnline(false); setSyncStatus('Offline — will sync when reconnected'); };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // ---- Refresh home list ----
  const refreshPackets = useCallback(async () => {
    const all = await getAllPackets();
    const enriched: Array<LocalPacket & { tagThumbUrl?: string; photoCount: number }> = [];
    let photoTotal = 0;
    for (const p of all) {
      const ph = await getPhotosForPacket(p.id);
      photoTotal += ph.length;
      const tag = ph.find((x) => x.type === 'tag');
      enriched.push({
        ...p,
        photoCount: ph.length,
        tagThumbUrl: tag ? URL.createObjectURL(tag.blob) : undefined,
      });
    }
    setPackets(enriched);
    setStats({
      packets: all.length,
      photos: photoTotal,
      pending: all.filter((p) => p.status === 'pending' || p.status === 'failed').length,
    });
  }, []);

  // ---- Tech selection ----
  async function selectTech(name: string) {
    setTech(name);
    await setSetting('tech', name);
    setTechModal(false);
  }

  // ---- Start a new packet ----
  async function startNewPacket() {
    if (!tech) {
      setTechModal(true);
      return;
    }
    const id = newPacketId();
    setDraft({ id, capturedAt: Date.now(), photos: [], notes: '' });
    setView('capture');
  }

  function cancelCapture() {
    if (draft && draft.photos.length > 0) {
      if (!confirm('Discard this asset and its photos?')) return;
      draft.photos.forEach((p) => URL.revokeObjectURL(p.url));
    }
    setDraft(null);
    setView('home');
  }

  // ---- Photo capture ----
  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>, type: PhotoType) {
    if (!draft) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const processed = await processPhoto(file);
      const url = URL.createObjectURL(processed.blob);
      const newPhoto: DraftPhoto = {
        id: newPhotoId(),
        type,
        blob: processed.blob,
        url,
        width: processed.width,
        height: processed.height,
        name: type === 'tag' ? 'asset_tag.jpg' : `nameplate_${draft.photos.length}.jpg`,
      };
      setDraft({ ...draft, photos: [...draft.photos, newPhoto] });
    } catch (err) {
      showToast('Photo failed: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  }

  function removePhoto(idx: number) {
    if (!draft) return;
    URL.revokeObjectURL(draft.photos[idx].url);
    const next = draft.photos.filter((_, i) => i !== idx);
    setDraft({ ...draft, photos: next });
  }

  // ---- Save packet ----
  async function savePacketLocal(thenStartNext: boolean) {
    if (!draft || !tech) return;
    const hasTag = draft.photos.some((p) => p.type === 'tag');
    if (!hasTag) return;

    const deviceId = await getDeviceId();
    const lat = await tryGetLocation();

    const packet: LocalPacket = {
      id: draft.id,
      capturedAt: draft.capturedAt,
      techName: tech,
      deviceId,
      lat: lat?.lat,
      lng: lat?.lng,
      notes: notesRef.current?.value || '',
      status: 'pending',
    };
    await savePacket(packet);

    // Persist photos.
    let order = 0;
    for (const p of draft.photos) {
      const ph: LocalPhoto = {
        id: p.id,
        packetId: packet.id,
        type: p.type,
        blob: p.blob,
        width: p.width,
        height: p.height,
        orderIdx: order++,
        createdAt: Date.now(),
      };
      await addPhoto(ph);
    }

    // Kick a sync attempt now if we're online.
    if (navigator.onLine) {
      syncAllPending().then(() => refreshPackets());
    }

    showToast(thenStartNext ? 'Saved — start the next' : 'Saved');

    // Reset draft for next packet.
    draft.photos.forEach((p) => URL.revokeObjectURL(p.url));
    if (thenStartNext) {
      setDraft({ id: newPacketId(), capturedAt: Date.now(), photos: [], notes: '' });
      if (notesRef.current) notesRef.current.value = '';
    } else {
      setDraft(null);
      setView('home');
    }
    refreshPackets();
  }

  async function tryGetLocation(): Promise<{ lat: number; lng: number } | null> {
    if (!('geolocation' in navigator)) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 },
      );
    });
  }

  // ---- Detail view ----
  async function openDetail(p: LocalPacket) {
    const photos = await getPhotosForPacket(p.id);
    const withUrls = photos.map((ph) => ({ ...ph, url: URL.createObjectURL(ph.blob) }));
    setDetail({ packet: p, photos: withUrls });
    setView('detail');
  }

  function closeDetail() {
    if (detail) detail.photos.forEach((p) => URL.revokeObjectURL(p.url));
    setDetail(null);
    setView('home');
  }

  async function deletePacketFromDetail() {
    if (!detail) return;
    if (!confirm('Delete this packet from your device? If it has already synced, the server copy is kept.')) return;
    await deletePacketWithPhotos(detail.packet.id);
    closeDetail();
    refreshPackets();
  }

  // ---- Manual sync ----
  async function syncNow() {
    if (!online) {
      showToast('Offline — sync will run automatically');
      return;
    }
    setSyncStatus('Uploading…');
    const r = await syncAllPending();
    await refreshPackets();
    if (r.attempted === 0) {
      setSyncStatus('Nothing to sync');
      showToast('Nothing to sync');
    } else {
      setSyncStatus(`Synced ${r.succeeded}/${r.attempted} · ${timeNow()}`);
      showToast(r.failed === 0 ? 'Uploaded' : `${r.failed} failed`);
    }
  }

  // ---- Toast ----
  const toastTimer = useRef<number | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  // ---- Derived ----
  const draftHasTag = !!draft?.photos.some((p) => p.type === 'tag');
  const draftPhotoCount = draft?.photos.length ?? 0;

  return (
    <div className="app">
      {/* ====== HOME ====== */}
      {view === 'home' && (
        <>
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">A</div>
              <div className="brand-text">
                <span className="t1">Asset Capture</span>
                <span className="t2">BOSC · Campus</span>
              </div>
            </div>
            <button className="tech-chip" onClick={() => setTechModal(true)}>
              <span className={`dot ${tech ? '' : 'off'}`} />
              <span>{tech ?? 'Set tech'}</span>
            </button>
          </header>

          <div className="stats">
            <div className="stat">
              <div className="stat-num">{stats.packets}</div>
              <div className="stat-label">Today</div>
            </div>
            <div className="stat">
              <div className="stat-num">{stats.photos}</div>
              <div className="stat-label">Photos</div>
            </div>
            <div className="stat">
              <div className="stat-num">{stats.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>

          <div className="content">
            <div className="section-label">
              <span>This session</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`online-dot ${online ? 'up' : 'down'}`} />
                <span>{online ? 'Online' : 'Offline'}</span>
              </span>
            </div>

            {packets.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <h3>Ready to capture</h3>
                <p>Walk up to an asset, tap below,<br />shoot the tag, then the nameplates.</p>
              </div>
            ) : (
              packets.map((p) => (
                <div key={p.id} className="packet" onClick={() => openDetail(p)}>
                  <div className="packet-row">
                    <div className="packet-thumb">
                      {p.tagThumbUrl
                        ? <img src={p.tagThumbUrl} alt="tag" />
                        : <span className="placeholder">?</span>}
                    </div>
                    <div className="packet-info">
                      <div className="packet-id unknown">Asset tag · pending OCR</div>
                      <div className="packet-meta">
                        <span>{p.photoCount} photo{p.photoCount === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span>{fmtTime(p.capturedAt)}</span>
                        <span>·</span>
                        <span>{p.techName.split(' ')[0]}</span>
                      </div>
                    </div>
                    <span className={`status-pill ${p.status}`}>{p.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="action-bar">
            <div className="action-bar-inner">
              <button className="btn btn-ghost" onClick={syncNow}>
                <SyncIcon /> Sync
              </button>
              <button className="btn btn-primary" onClick={startNewPacket}>
                <PlusIcon /> New Asset
              </button>
            </div>
          </div>
        </>
      )}

      {/* ====== CAPTURE ====== */}
      {view === 'capture' && draft && (
        <div className="capture-screen active">
          <header className="capture-header">
            <button className="back-btn" onClick={cancelCapture} aria-label="Back">
              <ChevronIcon />
            </button>
            <div className="capture-title">
              <h2>{draftHasTag ? 'Add nameplates' : 'New Asset'}</h2>
              <div className="sub">
                {draftHasTag
                  ? `${draftPhotoCount} photo${draftPhotoCount > 1 ? 's' : ''} · keep going or save`
                  : 'Start with the asset tag'}
              </div>
            </div>
          </header>

          <div className="steps">
            <div className={`step-pill ${draftHasTag ? 'done' : 'active'}`} />
            <div className={`step-pill ${draftPhotoCount > 1 ? 'done' : draftHasTag ? 'active' : ''}`} />
          </div>

          <div className="capture-body">
            {!draftHasTag && (
              <div className="photo-target" onClick={() => tagInputRef.current?.click()}>
                <div className="photo-target-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </div>
                <h3>Photograph asset tag</h3>
                <p>The UCSF tag with the Maximo asset number.<br />Get it sharp and centered.</p>
              </div>
            )}
            <input
              ref={tagInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handlePhoto(e, 'tag')}
            />

            {draftHasTag && (
              <>
                <div className="photo-list">
                  {draft.photos.map((p, i) => (
                    <div key={p.id} className={`photo-item ${p.type === 'tag' ? 'tag' : ''}`}>
                      <img src={p.url} alt={p.type} />
                      <div className="photo-item-info">
                        <div className="photo-item-type">
                          {p.type === 'tag' ? '★ Asset Tag' : 'Nameplate'}
                        </div>
                        <div className="photo-item-name">{p.name}</div>
                      </div>
                      <button className="photo-delete" onClick={() => removePhoto(i)} aria-label="Remove">
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="photo-target compact" onClick={() => plateInputRef.current?.click()}>
                  <div className="photo-target-icon"><PlusIcon /></div>
                  <div>
                    <h3>Add nameplate / sticker</h3>
                    <p>Mfr, serial, model, install date — any sticker.</p>
                  </div>
                </div>
                <input
                  ref={plateInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhoto(e, 'nameplate')}
                />

                <div className="notes-section">
                  <label>Notes (optional)</label>
                  <textarea ref={notesRef} placeholder="e.g. tag scuffed, located on rear panel..." />
                </div>
              </>
            )}
          </div>

          <div className="action-bar">
            <div className="action-bar-inner">
              <button className="btn btn-danger" onClick={cancelCapture}>Discard</button>
              <button
                className="btn btn-primary"
                disabled={!draftHasTag}
                onClick={() => savePacketLocal(true)}
              >
                <CheckIcon /> Save & next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== DETAIL ====== */}
      {view === 'detail' && detail && (
        <div className="capture-screen active">
          <header className="capture-header">
            <button className="back-btn" onClick={closeDetail} aria-label="Back"><ChevronIcon /></button>
            <div className="capture-title">
              <h2>Packet</h2>
              <div className="sub">{detail.packet.id} · {fmtTime(detail.packet.capturedAt)}</div>
            </div>
          </header>
          <div className="capture-body">
            <div className="meta-list" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
              <MetaRow k="Status" v={detail.packet.status} />
              <MetaRow k="Tech" v={detail.packet.techName} />
              <MetaRow k="Photos" v={String(detail.photos.length)} />
              <MetaRow k="Captured" v={new Date(detail.packet.capturedAt).toLocaleString()} />
              {detail.packet.lastError && <MetaRow k="Error" v={detail.packet.lastError} />}
            </div>

            <div className="section-label"><span>Photos</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
              {detail.photos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt={p.type}
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              ))}
            </div>

            {detail.packet.notes && (
              <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {detail.packet.notes}
              </div>
            )}

            <button className="btn btn-danger" style={{ width: '100%' }} onClick={deletePacketFromDetail}>
              Delete from device
            </button>
          </div>
        </div>
      )}

      {/* ====== TECH MODAL ====== */}
      <div
        className={`modal-backdrop ${techModal ? 'active' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setTechModal(false); }}
      >
        <div className="modal">
          <h3>Who&apos;s capturing?</h3>
          <p>Tagged on every packet you save this session.</p>
          {techs.map((t) => (
            <button
              key={t}
              className={`tech-option ${tech === t ? 'selected' : ''}`}
              onClick={() => selectTech(t)}
            >
              {t}
            </button>
          ))}
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => setTechModal(false)}>
            Cancel
          </button>
        </div>
      </div>

      {/* ====== TOAST ====== */}
      <div className={`toast ${toast ? 'show' : ''}`}>
        <CheckIcon />
        <span>{toast}</span>
      </div>
    </div>
  );
}

// ---- Small components & helpers ------------------------------------

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-faint)' }}>{k}</span>
      <span style={{ fontFamily: 'IBM Plex Mono' }}>{v}</span>
    </div>
  );
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---- Icons (inline SVG) --------------------------------------------

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14H7L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function SyncIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
