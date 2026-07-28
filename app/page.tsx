'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { processPhoto, SHARPNESS_WARN_THRESHOLD } from '@/lib/photo';
import {
  captureFrame,
  normalizeAssetNumber,
  startTagScan,
  type ScanHandle,
} from '@/lib/barcode';
import {
  buildLocationCode,
  buildingLabel,
  searchBuildings,
  getStructuredRooms,
  getFloors,
  getRooms,
} from '@/lib/locations';
import { speechSupported, startDictation, type DictationHandle } from '@/lib/speech';
import {
  addPhoto,
  deletePacketWithPhotos,
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
  url: string;
  width: number;
  height: number;
  sharpness: number;
  name: string;
}

interface DraftLocation {
  building: string; // building code
  floor: string;
  room: string;
}

interface Draft {
  id: string;
  capturedAt: number;
  photos: DraftPhoto[];
  assetNum: string;      // scanned from the tag; '' until scanned
  location: DraftLocation;
  notes: string;
}

export default function CapturePage() {
  const [view, setView] = useState<View>('home');
  const [tech, setTech] = useState<string | null>(null);
  const [techModal, setTechModal] = useState(false);
  const [packets, setPackets] = useState<Array<LocalPacket & { tagThumbUrl?: string; photoCount: number }>>([]);
  const [stats, setStats] = useState({ packets: 0, photos: 0, pending: 0 });
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const plateInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [blurWarn, setBlurWarn] = useState(false);

  // Barcode scanner
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanHandleRef = useRef<ScanHandle | null>(null);
  const scanBusyRef = useRef(false);

  // Voice notes
  const [dictating, setDictating] = useState(false);
  const dictationRef = useRef<DictationHandle | null>(null);
  const notesBaseRef = useRef('');

  const [detail, setDetail] = useState<{ packet: LocalPacket; photos: Array<LocalPhoto & { url: string }> } | null>(null);

  const canDictate = useMemo(() => speechSupported(), []);


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

    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      scanHandleRef.current?.stop();
      dictationRef.current?.stop();
    };
  }, []);

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

  async function selectTech(name: string) {
    setTech(name);
    await setSetting('tech', name);
    setTechModal(false);
  }

  // Location carries over from the last packet — consecutive assets are
  // usually in the same room, so re-typing it every time is wasted taps.
  async function freshLocation(): Promise<DraftLocation> {
    const last = await getSetting<DraftLocation>('lastLocation');
    return last ?? { building: '', floor: '', room: '' };
  }

  async function startNewPacket() {
    if (!tech) {
      setTechModal(true);
      return;
    }
    const id = newPacketId();
    setBlurWarn(false);
    setDraft({
      id,
      capturedAt: Date.now(),
      photos: [],
      assetNum: '',
      location: await freshLocation(),
      notes: '',
    });
    setView('capture');
  }

  function cancelCapture() {
    if (draft && draft.photos.length > 0) {
      if (!confirm('Discard this asset and its photos?')) return;
      draft.photos.forEach((p) => URL.revokeObjectURL(p.url));
    }
    stopScan();
    stopDictation();
    setDraft(null);
    setView('home');
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>, type: PhotoType) {
    if (!draft) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const processed = await processPhoto(file);
      addProcessedPhoto(processed, type);
    } catch (err) {
      showToast('Photo failed: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  }

  // Shared path for photos arriving from either the file camera or a scanned
  // frame. Runs the blur guard on the tag shot — the one photo that absolutely
  // must stay readable for later reconciliation.
  function addProcessedPhoto(
    processed: { blob: Blob; width: number; height: number; sharpness: number },
    type: PhotoType,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const url = URL.createObjectURL(processed.blob);
      const newPhoto: DraftPhoto = {
        id: newPhotoId(),
        type,
        blob: processed.blob,
        url,
        width: processed.width,
        height: processed.height,
        sharpness: processed.sharpness,
        name:
          type === 'tag'
            ? 'asset_tag.jpg'
            : type === 'other'
              ? `asset_${prev.photos.length}.jpg`
              : `nameplate_${prev.photos.length}.jpg`,
      };
      return { ...prev, photos: [...prev.photos, newPhoto] };
    });
    if (type === 'tag') {
      setBlurWarn(
        processed.sharpness > 0 && processed.sharpness < SHARPNESS_WARN_THRESHOLD,
      );
    }
  }

  function removePhoto(idx: number) {
    if (!draft) return;
    const removed = draft.photos[idx];
    URL.revokeObjectURL(removed.url);
    const next = draft.photos.filter((_, i) => i !== idx);
    if (removed.type === 'tag') setBlurWarn(false);
    setDraft({ ...draft, photos: next });
  }

  function retakeTag() {
    if (!draft) return;
    const tag = draft.photos.find((p) => p.type === 'tag');
    if (tag) {
      URL.revokeObjectURL(tag.url);
      setDraft({ ...draft, photos: draft.photos.filter((p) => p.type !== 'tag') });
    }
    setBlurWarn(false);
  }

  // ---- Barcode / QR scan ----
  async function openScan() {
    setScanError(null);
    setScanning(true);
    // Give React a tick to mount the <video> before we bind the stream.
    await new Promise((r) => setTimeout(r, 0));
    const video = videoRef.current;
    if (!video) {
      setScanning(false);
      return;
    }
    try {
      scanHandleRef.current = await startTagScan(
        video,
        (text) => onScanDecoded(text),
        (err) => setScanError(err instanceof Error ? err.message : 'Scanner error'),
      );
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Camera unavailable — use Photograph instead',
      );
    }
  }

  async function onScanDecoded(text: string) {
    if (scanBusyRef.current) return; // ignore repeat reads while we finish up
    scanBusyRef.current = true;
    const video = videoRef.current;
    const assetNum = normalizeAssetNumber(text);
    try {
      if (navigator.vibrate) navigator.vibrate(60);
      // Grab the current frame as the tag photo, so the packet keeps proof.
      if (video) {
        const frame = await captureFrame(video);
        const processed = await processPhoto(frame);
        addProcessedPhoto(processed, 'tag');
      }
      setDraft((prev) => (prev ? { ...prev, assetNum } : prev));
      showToast(`Scanned ${assetNum}`);
    } catch (err) {
      showToast('Scan capture failed — try Photograph');
    } finally {
      stopScan();
      scanBusyRef.current = false;
    }
  }

  function stopScan() {
    try {
      scanHandleRef.current?.stop();
    } catch {
      /* noop */
    }
    scanHandleRef.current = null;
    setScanning(false);
  }

  // ---- Voice notes ----
  function toggleDictation() {
    if (dictating) {
      stopDictation();
      return;
    }
    notesBaseRef.current = notesRef.current?.value?.trim() ?? '';
    const handle = startDictation(
      (text) => {
        if (!notesRef.current) return;
        const base = notesBaseRef.current;
        notesRef.current.value = base ? `${base} ${text}` : text;
      },
      () => setDictating(false),
    );
    if (!handle) {
      showToast('Voice input unavailable on this device');
      return;
    }
    dictationRef.current = handle;
    setDictating(true);
  }

  function stopDictation() {
    try {
      dictationRef.current?.stop();
    } catch {
      /* noop */
    }
    dictationRef.current = null;
    setDictating(false);
  }

  // ---- Location ----
  function setLoc(patch: Partial<DraftLocation>) {
    setDraft((prev) => (prev ? { ...prev, location: { ...prev.location, ...patch } } : prev));
  }

  const [saving, setSaving] = useState(false);

  async function savePacketLocal(thenStartNext: boolean) {
    if (!draft || !tech) return;
    if (saving) return; // guard against double-taps on a slow phone
    const hasTag = draft.photos.some((p) => p.type === 'tag');
    if (!hasTag) {
      showToast('Scan or photograph the asset tag first');
      return;
    }

    setSaving(true);
    try {
      const deviceId = await getDeviceId();
      const loc = await tryGetLocation();
      const tagPhoto = draft.photos.find((p) => p.type === 'tag');
      const locationCode = buildLocationCode(
        draft.location.building,
        draft.location.floor,
        draft.location.room,
      );

      // Remember this location so the next asset in the same room prefills.
      await setSetting('lastLocation', draft.location);

      const packet: LocalPacket = {
        id: draft.id,
        capturedAt: draft.capturedAt,
        techName: tech,
        deviceId,
        lat: loc?.lat,
        lng: loc?.lng,
        scannedAssetNum: draft.assetNum || undefined,
        building: draft.location.building || undefined,
        locationCode: locationCode || undefined,
        tagSharpness: tagPhoto?.sharpness,
        notes: notesRef.current?.value || '',
        status: 'pending',
      };
      await savePacket(packet);

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

      if (navigator.onLine) {
        syncAllPending().then(() => refreshPackets()).catch(() => {});
      }

      showToast(thenStartNext ? 'Saved — start the next' : 'Saved');

      // Reset draft for next packet — keep the location so a room-by-room sweep
      // doesn't re-enter it each time.
      draft.photos.forEach((p) => URL.revokeObjectURL(p.url));
      setBlurWarn(false);
      if (thenStartNext) {
        setDraft({
          id: newPacketId(),
          capturedAt: Date.now(),
          photos: [],
          assetNum: '',
          location: draft.location,
          notes: '',
        });
        if (notesRef.current) notesRef.current.value = '';
      } else {
        setDraft(null);
        setView('home');
      }
      refreshPackets();
    } catch (err) {
      // Never fail silently — the draft is kept so the tech can retry.
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Save failed: ${msg}`);
      // eslint-disable-next-line no-console
      console.error('savePacketLocal failed', err);
    } finally {
      setSaving(false);
    }
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

  async function syncNow() {
    if (!online) {
      showToast('Offline — sync will run automatically');
      return;
    }
    const r = await syncAllPending();
    await refreshPackets();
    if (r.attempted === 0) {
      showToast('Nothing to sync');
    } else {
      showToast(r.failed === 0 ? `Uploaded ${r.succeeded}` : `${r.failed} failed`);
    }
  }

  const toastTimer = useRef<number | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }

  const draftHasTag = !!draft?.photos.some((p) => p.type === 'tag');
  const draftPhotoCount = draft?.photos.length ?? 0;

  return (
    <div className="app">
      {/* ====== HOME ====== */}
      {view === 'home' && (
        <>
          <header className="topbar" role="banner">
            <div className="brand">
  <span className="brand-wordmark" aria-label="UCSF">UCSF</span>
  <div className="brand-divider" aria-hidden="true" />
  <div className="brand-text">
    <span className="t1">Maximo Asset Data Capture</span>
    <span className="t2">BOSC · Facilities</span>
  </div>
</div>
            <button
              className="tech-chip"
              onClick={() => setTechModal(true)}
              aria-label={tech ? `Current technician: ${tech}. Tap to change.` : 'Set technician name'}
            >
              <span className={`dot ${tech ? '' : 'off'}`} aria-hidden="true" />
              <span>{tech ?? 'Set tech'}</span>
            </button>
          </header>

          <div className="stats" role="group" aria-label="Capture statistics">
            <div className="stat">
              <div className="stat-num" aria-label={`${stats.packets} captured today`}>{stats.packets}</div>
              <div className="stat-label">Captured</div>
            </div>
            <div className="stat">
              <div className="stat-num" aria-label={`${stats.photos} photos total`}>{stats.photos}</div>
              <div className="stat-label">Photos</div>
            </div>
            <div className="stat">
              <div className="stat-num" aria-label={`${stats.pending} pending upload`}>{stats.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>

          <main className="content" role="main">
            <div className="section-label">
              <span>Captured packets</span>
              <span className="online-indicator" aria-live="polite">
                <span className={`online-dot ${online ? 'up' : 'down'}`} aria-hidden="true" />
                <span>{online ? 'Online' : 'Offline'}</span>
              </span>
            </div>

            {packets.length === 0 ? (
              <button
  type="button"
  className="empty empty-clickable"
  onClick={startNewPacket}
  aria-label="Start capturing a new asset"
>
  <div className="empty-icon" aria-hidden="true">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  </div>
  <h3>Tap to start a capture</h3>
  <p>Set the location, then scan or shoot the tag.<br />Add nameplates and save.</p>
</button>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Captured packets">
                {packets.map((p) => (
                  <li key={p.id}>
                    <button
                      className="packet"
                      onClick={() => openDetail(p)}
                      aria-label={`Packet ${p.scannedAssetNum ?? 'pending OCR'} captured at ${fmtTime(p.capturedAt)} by ${p.techName}, ${p.photoCount} photos, status ${p.status}`}
                      style={{ width: '100%', textAlign: 'left', font: 'inherit' }}
                    >
                      <div className="packet-row">
                        <div className="packet-thumb">
                          {p.tagThumbUrl
                            ? <img src={p.tagThumbUrl} alt="" />
                            : <span className="placeholder" aria-hidden="true">?</span>}
                        </div>
                        <div className="packet-info">
                          <div className={`packet-id ${p.scannedAssetNum ? '' : 'unknown'}`}>
                            {p.scannedAssetNum ? p.scannedAssetNum : 'Asset tag · pending OCR'}
                          </div>
                          <div className="packet-meta">
                            {p.locationCode && <><span className="mono">{p.locationCode}</span><span aria-hidden="true">·</span></>}
                            <span>{p.photoCount} photo{p.photoCount === 1 ? '' : 's'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{fmtTime(p.capturedAt)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{p.techName.split(' ')[0]}</span>
                          </div>
                        </div>
                        <span className={`status-pill ${p.status}`}>{p.status}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </main>

          <div className="action-bar" role="region" aria-label="Actions">
            <div className="action-bar-inner">
              <button className="btn btn-ghost" onClick={syncNow} aria-label="Sync pending packets to server">
                <SyncIcon /> Sync
              </button>
              <button className="btn btn-primary" onClick={startNewPacket} aria-label="Start capturing a new asset">
                <PlusIcon /> New Asset
              </button>
            </div>
          </div>
        </>
      )}

      {/* ====== CAPTURE ====== */}
      {view === 'capture' && draft && (
        <div className="capture-screen active">
          <header className="capture-header" role="banner">
            <button className="back-btn" onClick={cancelCapture} aria-label="Cancel and return to home">
              <ChevronIcon />
            </button>
            <div className="capture-title">
              <h2>{draftHasTag ? 'Add nameplates' : 'New asset'}</h2>
              <div className="sub">
                {draftHasTag
                  ? `${draftPhotoCount} photo${draftPhotoCount > 1 ? 's' : ''} · keep going or save`
                  : 'Start with the asset tag'}
              </div>
            </div>
          </header>

          <div className="steps" role="progressbar" aria-label="Capture progress" aria-valuenow={draftHasTag ? (draftPhotoCount > 1 ? 2 : 1) : 0} aria-valuemin={0} aria-valuemax={2}>
            <div className={`step-pill ${draftHasTag ? 'done' : 'active'}`} />
            <div className={`step-pill ${draftPhotoCount > 1 ? 'done' : draftHasTag ? 'active' : ''}`} />
          </div>

          <main className="capture-body" role="main">
            <LocationPicker value={draft.location} onChange={setLoc} />

            {!draftHasTag && (
              <>
                <button
                  type="button"
                  className="photo-target"
                  onClick={openScan}
                  aria-label="Scan the asset tag barcode or QR code"
                  style={{ width: '100%', font: 'inherit' }}
                >
                  <div className="photo-target-icon" aria-hidden="true">
                    <ScanIcon />
                  </div>
                  <h3>Scan asset tag</h3>
                  <p>Point at the barcode or QR on the UCSF tag.<br />We&apos;ll read the asset number and keep the photo.</p>
                </button>
                <button type="button" className="link-btn" onClick={() => tagInputRef.current?.click()}>
                  No barcode? Photograph the tag instead
                </button>
              </>
            )}
            <input
              ref={tagInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handlePhoto(e, 'tag')}
              aria-label="Capture asset tag photo"
            />

            {draftHasTag && (
              <>
                {draft.assetNum ? (
                  <div className="asset-chip">
                    <span className="asset-chip-label">Asset</span>
                    <span className="asset-chip-num mono">{draft.assetNum}</span>
                    <button className="asset-chip-edit" onClick={openScan} aria-label="Rescan asset tag">
                      <ScanIcon small />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="asset-chip ghost" onClick={openScan}>
                    <ScanIcon small />
                    <span>Scan tag barcode for exact asset #</span>
                  </button>
                )}

                {blurWarn && (
                  <div className="blur-warn" role="alert">
                    <div className="blur-warn-text">
                      <strong>Tag photo looks blurry.</strong>
                      <span>It may be unreadable later. Retake for a sharp shot.</span>
                    </div>
                    <div className="blur-warn-actions">
                      <button className="btn btn-ghost sm" onClick={() => setBlurWarn(false)}>Keep</button>
                      <button className="btn btn-primary sm" onClick={retakeTag}>Retake</button>
                    </div>
                  </div>
                )}

                <ul className="photo-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }} aria-label="Captured photos">
                  {draft.photos.map((p, i) => (
                    <li key={p.id} className={`photo-item ${p.type === 'tag' ? 'tag' : ''}`}>
                      <img src={p.url} alt={`${photoLabel(p.type)} preview`} />
                      <div className="photo-item-info">
                        <div className="photo-item-type">
                          {p.type === 'tag' ? '★ Asset tag' : photoLabel(p.type)}
                        </div>
                        <div className="photo-item-name">{p.name}</div>
                      </div>
                      <button className="photo-delete" onClick={() => removePhoto(i)} aria-label={`Remove ${photoLabel(p.type).toLowerCase()} photo`}>
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="photo-target compact"
                  onClick={() => assetInputRef.current?.click()}
                  aria-label="Add a photo of the asset itself"
                  style={{ width: '100%', font: 'inherit', textAlign: 'left' }}
                >
                  <div className="photo-target-icon" aria-hidden="true"><CameraIcon /></div>
                  <div>
                    <h3>Add asset photo</h3>
                    <p>The equipment itself — a wide shot of the whole unit.</p>
                  </div>
                </button>
                <input
                  ref={assetInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhoto(e, 'other')}
                  aria-label="Capture asset photo"
                />

                <button
                  type="button"
                  className="photo-target compact"
                  onClick={() => plateInputRef.current?.click()}
                  aria-label="Add another nameplate or sticker photo"
                  style={{ width: '100%', font: 'inherit', textAlign: 'left' }}
                >
                  <div className="photo-target-icon" aria-hidden="true"><PlusIcon /></div>
                  <div>
                    <h3>Add nameplate / sticker</h3>
                    <p>Manufacturer, serial, model, install date — any sticker.</p>
                  </div>
                </button>
                <input
                  ref={plateInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhoto(e, 'nameplate')}
                  aria-label="Capture nameplate photo"
                />

                <div className="notes-section">
                  <div className="notes-head">
                    <label htmlFor="capture-notes">Notes (optional)</label>
                    {canDictate && (
                      <button
                        type="button"
                        className={`mic-btn ${dictating ? 'live' : ''}`}
                        onClick={toggleDictation}
                        aria-label={dictating ? 'Stop dictation' : 'Dictate notes'}
                      >
                        <MicIcon /> {dictating ? 'Listening…' : 'Dictate'}
                      </button>
                    )}
                  </div>
                  <textarea
                    id="capture-notes"
                    ref={notesRef}
                    placeholder="e.g. tag scuffed, located on rear panel..."
                  />
                </div>
              </>
            )}
          </main>

          <div className="action-bar" role="region" aria-label="Actions">
            <div className="action-bar-inner">
              <button className="btn btn-danger" onClick={cancelCapture}>Discard</button>
              <button
                className="btn btn-primary"
                disabled={!draftHasTag || saving}
                onClick={() => savePacketLocal(true)}
                aria-label={draftHasTag ? 'Save this asset and start a new one' : 'Capture asset tag first to enable save'}
              >
                <CheckIcon /> {saving ? 'Saving…' : 'Save & next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== DETAIL ====== */}
      {view === 'detail' && detail && (
        <div className="capture-screen active">
          <header className="capture-header" role="banner">
            <button className="back-btn" onClick={closeDetail} aria-label="Back to home">
              <ChevronIcon />
            </button>
            <div className="capture-title">
              <h2>Packet detail</h2>
              <div className="sub">{detail.packet.id.replace(/^pkt_/, '').slice(0, 16)}… · {fmtTime(detail.packet.capturedAt)}</div>
            </div>
          </header>
          <main className="capture-body" role="main">
            <dl className="meta-list" style={{ margin: '0 0 16px' }}>
              <MetaRow k="Status" v={detail.packet.status} />
              {detail.packet.scannedAssetNum && <MetaRow k="Asset #" v={detail.packet.scannedAssetNum} />}
              {detail.packet.locationCode && <MetaRow k="Location" v={detail.packet.locationCode} />}
              <MetaRow k="Tech" v={detail.packet.techName} />
              <MetaRow k="Photos" v={String(detail.photos.length)} />
              <MetaRow k="Captured" v={new Date(detail.packet.capturedAt).toLocaleString()} />
              {detail.packet.lastError && <MetaRow k="Error" v={detail.packet.lastError} />}
            </dl>

            <div className="section-label"><span>Photos</span></div>
            <div className="photo-grid" role="list" aria-label="Captured photos">
              {detail.photos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt={photoLabel(p.type)}
                  role="listitem"
                />
              ))}
            </div>

            {detail.packet.notes && (
              <div
                className="meta-list"
                style={{ padding: '14px 16px', fontSize: 'var(--fs-sm)', whiteSpace: 'pre-wrap', color: 'var(--text-dim)' }}
                aria-label="Capture notes"
              >
                {detail.packet.notes}
              </div>
            )}

            <button className="btn btn-danger" style={{ width: '100%', marginTop: 8 }} onClick={deletePacketFromDetail}>
              Delete from device
            </button>
          </main>
        </div>
      )}

      {/* ====== TECH MODAL ====== */}
      <div
  className={`modal-backdrop ${techModal ? 'active' : ''}`}
  onClick={(e) => { if (e.target === e.currentTarget) setTechModal(false); }}
  role="dialog"
  aria-modal="true"
  aria-labelledby="tech-modal-title"
  aria-hidden={!techModal}
>
  <div className="modal">
    <h3 id="tech-modal-title">Who&apos;s capturing?</h3>
    <p>We&apos;ll remember this on your device so you don&apos;t have to type it again.</p>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const input = (e.currentTarget.elements.namedItem('techName') as HTMLInputElement);
        const value = input.value.trim();
        if (value.length > 0) selectTech(value);
      }}
    >
      <label htmlFor="tech-name-input" className="sr-only">Your name</label>
      <input
        id="tech-name-input"
        name="techName"
        type="text"
        className="tech-input"
        defaultValue={tech ?? ''}
        placeholder="First Last (e.g. Anthony Lopez)"
        autoComplete="name"
        autoFocus
        required
        maxLength={60}
      />
      <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }}>
        Save name
      </button>
    </form>
    <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setTechModal(false)}>
      Cancel
    </button>
  </div>
</div>

      {/* ====== SCANNER OVERLAY ====== */}
      {scanning && (
        <div className="scanner">
          <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
          <div className="scanner-frame" aria-hidden="true" />
          <div className="scanner-top">
            <button className="scanner-close" onClick={stopScan} aria-label="Close scanner">
              <CloseIcon />
            </button>
          </div>
          <div className="scanner-hint" role="status" aria-live="polite">
            {scanError ? scanError : 'Center the barcode or QR in the box'}
          </div>
        </div>
      )}

      {/* ====== TOAST ====== */}
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        <CheckIcon />
        <span>{toast}</span>
      </div>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="meta-row">
      <dt className="k">{k}</dt>
      <dd className="v" style={{ margin: 0 }}>{v}</dd>
    </div>
  );
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function photoLabel(type: PhotoType): string {
  if (type === 'tag') return 'Asset tag';
  if (type === 'other') return 'Asset photo';
  return 'Nameplate';
}

// Location picker: searchable building combobox + floor/room. Buildings with a
// verified room list (95 Kirkham, code 2264) get dropdowns; everything else is
// free text so a tech is never blocked by missing data.
function LocationPicker({
  value,
  onChange,
}: {
  value: DraftLocation;
  onChange: (patch: Partial<DraftLocation>) => void;
}) {
  const structured = getStructuredRooms(value.building);
  const floors = structured ? getFloors(value.building) : [];
  const rooms = structured ? getRooms(value.building, value.floor) : [];
  const code = buildLocationCode(value.building, value.floor, value.room);

  return (
    <div className="loc-section">
      <div className="loc-head">
        <span className="loc-label">Location</span>
        <span className="loc-code mono" aria-live="polite">{code || '—'}</span>
      </div>

      <BuildingCombo
        value={value.building}
        onSelect={(building) => onChange({ building, floor: '', room: '' })}
      />

      <div className="loc-grid">
        {structured ? (
          <>
            <select
              className="loc-input"
              value={value.floor}
              onChange={(e) => onChange({ floor: e.target.value, room: '' })}
              aria-label="Floor"
            >
              <option value="">Floor…</option>
              {floors.map((f) => (
                <option key={f} value={f}>Fl {f}</option>
              ))}
            </select>
            <select
              className="loc-input"
              value={value.room}
              onChange={(e) => onChange({ room: e.target.value })}
              aria-label="Room"
              disabled={!value.floor}
            >
              <option value="">Room…</option>
              {rooms.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <input
              className="loc-input"
              inputMode="text"
              placeholder="Floor"
              value={value.floor}
              onChange={(e) => onChange({ floor: e.target.value })}
              aria-label="Floor"
            />
            <input
              className="loc-input"
              placeholder="Room"
              value={value.room}
              onChange={(e) => onChange({ room: e.target.value })}
              aria-label="Room"
            />
          </>
        )}
      </div>
    </div>
  );
}

// Type-to-search over all 253 buildings. Collapsed it shows the current pick;
// tapping opens a filter box + result list. Filters by code or name.
function BuildingCombo({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchBuildings(query), [query]);

  if (!open) {
    return (
      <button
        type="button"
        className="building-trigger"
        onClick={() => { setQuery(''); setOpen(true); }}
        aria-label="Choose building"
      >
        <span className={value ? 'bt-val' : 'bt-ph'}>
          {value ? buildingLabel(value) : 'Search building…'}
        </span>
        <ChevronDownIcon />
      </button>
    );
  }

  return (
    <div className="building-combo">
      <input
        autoFocus
        className="loc-input"
        placeholder="Type building code or name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search building"
      />
      <ul className="building-list" role="listbox" aria-label="Building results">
        {results.map((b) => (
          <li key={b.code}>
            <button
              type="button"
              className={`building-opt ${b.code === value ? 'sel' : ''}`}
              onClick={() => { onSelect(b.code); setOpen(false); }}
            >
              <span className="bc mono">{b.code}</span>
              <span className="bn">{b.name}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="building-empty">No match</li>}
      </ul>
      <button
        type="button"
        className="link-btn"
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </div>
  );
}

// ---- Icons -----------------------------------------------------------

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14H7L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function SyncIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function ScanIcon({ small }: { small?: boolean }) {
  const s = small ? 16 : 26;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
