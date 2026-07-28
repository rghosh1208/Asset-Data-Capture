// Resize+recompress a captured photo before it goes into IndexedDB.
// Target: long edge 1600px, JPEG q=0.85. AI vision extraction works
// well at this resolution and we cut size ~10x vs raw iPhone output.

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.85;

// Sharpness below this (variance of the Laplacian, measured on a 400px
// grayscale downscale) means the tag is likely too blurry to read later. It's
// a warn threshold only — techs can always keep the shot. Tuned conservatively
// so it fires on clearly soft photos, not merely imperfect ones.
export const SHARPNESS_WARN_THRESHOLD = 55;

export interface ProcessedPhoto {
  blob: Blob;
  width: number;
  height: number;
  sharpness: number; // variance-of-Laplacian focus metric; higher = sharper
}

export async function processPhoto(input: File | Blob): Promise<ProcessedPhoto> {
  const bitmap = await createImageBitmap(input);
  const { width: srcW, height: srcH } = bitmap;
  const longest = Math.max(srcW, srcH);
  const scale = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);

  let sharpness = 0;
  try {
    sharpness = measureSharpness(bitmap);
  } catch {
    sharpness = 0; // never block capture on a metric failure
  }
  bitmap.close?.();

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) throw new Error('Photo compression failed');

  return { blob, width: w, height: h, sharpness };
}

/**
 * Focus metric = variance of the Laplacian over a grayscale downscale.
 * A sharp image has strong edges (high Laplacian variance); a blurry one is
 * smooth (low variance). Downscaling to ~400px makes this fast and resolution-
 * independent enough for a go/no-go legibility check.
 */
function measureSharpness(bitmap: ImageBitmap): number {
  const target = 400;
  const longest = Math.max(bitmap.width, bitmap.height);
  const s = longest > target ? target / longest : 1;
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Grayscale buffer.
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 4-neighbour Laplacian, skipping the border.
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - w] +
        gray[idx + w] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// Optional: try the EXIF capture time, fall back to now. Lightweight read
// of the first 16KB which is where the EXIF block lives.
export async function readExifDate(_file: File): Promise<Date | null> {
  // Most modern phones strip orientation/EXIF when going through
  // canvas re-encode anyway. We rely on the client clock for now.
  return null;
}
