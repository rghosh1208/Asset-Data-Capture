// Resize+recompress a captured photo before it goes into IndexedDB.
// Target: long edge 1600px, JPEG q=0.85. AI vision extraction works
// well at this resolution and we cut size ~10x vs raw iPhone output.

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export interface ProcessedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const bitmap = await createImageBitmap(file);
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
  bitmap.close?.();

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) throw new Error('Photo compression failed');

  return { blob, width: w, height: h };
}

// Optional: try the EXIF capture time, fall back to now. Lightweight read
// of the first 16KB which is where the EXIF block lives.
export async function readExifDate(_file: File): Promise<Date | null> {
  // Most modern phones strip orientation/EXIF when going through
  // canvas re-encode anyway. We rely on the client clock for now.
  return null;
}
