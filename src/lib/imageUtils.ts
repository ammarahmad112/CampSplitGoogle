export interface ProcessedReceipt {
  base64: string;
  mimeType: 'image/jpeg';
  dataUrl: string;
  thumb: string;
  name: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file'));
    };
    img.src = url;
  });
}

export async function processLogoImage(file: File): Promise<string> {
  const img = await loadImage(file);
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 192;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 192, 192);
  return c.toDataURL('image/png');
}

export async function processReceiptPhoto(file: File, expId: string): Promise<ProcessedReceipt> {
  const img = await loadImage(file);

  // Full receipt (resized to max 1400px on longest side for fast Drive upload & crisp legibility)
  const maxDim = 1400;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const base64 = dataUrl.split(',')[1] || '';

  // Compact thumbnail (~3-5KB) for instant list rendering & offline preview
  const thumbMax = 160;
  const tScale = Math.min(1, thumbMax / Math.max(img.width, img.height));
  const tw = Math.max(1, Math.round(img.width * tScale));
  const th = Math.max(1, Math.round(img.height * tScale));
  const tCanvas = document.createElement('canvas');
  tCanvas.width = tw;
  tCanvas.height = th;
  const tCtx = tCanvas.getContext('2d');
  if (!tCtx) throw new Error('Canvas unavailable');
  tCtx.drawImage(img, 0, 0, tw, th);
  const thumb = tCanvas.toDataURL('image/jpeg', 0.65);

  const safeBase = file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 32) || 'receipt';
  return {
    base64,
    mimeType: 'image/jpeg',
    dataUrl,
    thumb,
    name: `${safeBase}-${expId}.jpg`,
  };
}
