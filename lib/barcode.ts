// Live-camera barcode / QR scanner for the asset tag.
//
// UCSF asset-tag stickers carry a 1-D barcode and/or QR encoding the Maximo
// asset number. Scanning it in the field gives us the exact number instead of
// relying on the nightly OCR pass to read a photo — this removes the single
// biggest source of transcription error feeding Maximo.
//
// We use ZXing (bundled, works offline and on iOS Safari) rather than the
// experimental BarcodeDetector API, which iOS does not support.

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import {
  DecodeHintType,
  BarcodeFormat,
  type Result,
} from '@zxing/library';

export interface ScanHandle {
  stop: () => void;
}

// Formats commonly used on facility asset tags. Restricting the set makes
// decoding faster and less prone to false reads.
const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
];

function makeReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

/**
 * Start continuous scanning into a <video> element. Calls onResult with the
 * decoded text the first time a code is read; the caller decides whether to
 * stop (via the returned handle) or keep scanning.
 *
 * The video stream stays live so the caller can also grab a still frame of the
 * tag (see captureFrame) — one action yields both the number and the photo.
 */
export async function startTagScan(
  video: HTMLVideoElement,
  onResult: (text: string, raw: Result) => void,
  onError?: (err: unknown) => void,
): Promise<ScanHandle> {
  const reader = makeReader();
  let controls: IScannerControls | null = null;

  try {
    controls = await reader.decodeFromVideoDevice(
      undefined, // let the browser pick — prefers the rear camera below
      video,
      (result, err) => {
        if (result) onResult(result.getText(), result);
        // err on every non-decoded frame is normal; ignore NotFound noise.
        if (err && err.name && err.name !== 'NotFoundException' && onError) {
          onError(err);
        }
      },
    );
  } catch (err) {
    if (onError) onError(err);
    throw err;
  }

  return {
    stop: () => {
      try {
        controls?.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

/**
 * Grab the current video frame as a JPEG blob. Used to save the tag photo at
 * the moment the barcode decodes, so the packet always keeps visual proof of
 * the tag alongside the scanned number.
 */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Camera not ready');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob) throw new Error('Frame capture failed');
  return blob;
}

/**
 * Normalise a scanned string into a candidate UCSF asset number. UCSF QR tags
 * sometimes encode a URL or key=value payload rather than the bare number, so
 * we pull the most asset-number-looking token out. We never guess — if nothing
 * matches, we return the raw trimmed text and let the reviewer decide.
 */
export function normalizeAssetNumber(raw: string): string {
  const text = raw.trim();
  // Common UCSF/Maximo shapes: C4375, 28432, MSBFE012345, MSB-ESP-0C01.
  const patterns = [
    /\bMSBFE\d{4,}\b/i,
    /\b[A-Z]{2,4}-[A-Z0-9]{2,4}-[A-Z0-9]{2,6}\b/i,
    /\b[A-Z]\d{3,6}\b/i,
    /\b\d{4,7}\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].toUpperCase();
  }
  return text;
}
