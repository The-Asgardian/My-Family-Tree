const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 1600;

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This photo could not be converted.')), type, quality);
  });
}

async function loadPhoto(file) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('This photo could not be opened.'));
    image.src = url;
  });
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

export async function optimisePhoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose a photo smaller than 25 MB.');

  const photo = await loadPhoto(file);
  try {
    let maxDimension = MAX_DIMENSION;
    let quality = 0.84;
    let blob = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(photo.width, photo.height));
      const width = Math.max(1, Math.round(photo.width * scale));
      const height = Math.max(1, Math.round(photo.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(photo.source, 0, 0, width, height);
      blob = await canvasBlob(canvas, 'image/webp', quality);
      if (blob.size <= TARGET_BYTES || maxDimension <= 900) break;
      maxDimension = Math.round(maxDimension * 0.84);
      quality = Math.max(0.66, quality - 0.05);
    }
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'portrait';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } finally {
    photo.cleanup();
  }
}
