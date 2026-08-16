const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 1.5 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 1200;

export const MAX_CROP_ZOOM = 4;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This photo could not be converted.')), type, quality);
  });
}

export function validatePhotoFile(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose a photo smaller than 25 MB.');
}

export async function loadPhoto(file) {
  validatePhotoFile(file);
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      // Some browser-supported image types (notably SVG and a few phone formats)
      // are decoded by Image but not createImageBitmap, so continue to the fallback.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This photo could not be opened.'));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function computeCropRect(width, height, crop = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The photo dimensions are invalid.');
  }

  const requestedZoom = Number(crop.zoom);
  const zoom = clamp(Number.isFinite(requestedZoom) ? requestedZoom : 1, 1, MAX_CROP_ZOOM);
  const size = Math.min(width, height) / zoom;
  const half = size / 2;
  const requestedFocusX = Number(crop.focusX);
  const requestedFocusY = Number(crop.focusY);
  const centreX = clamp((Number.isFinite(requestedFocusX) ? requestedFocusX : 0.5) * width, half, width - half);
  const centreY = clamp((Number.isFinite(requestedFocusY) ? requestedFocusY : 0.5) * height, half, height - half);

  return {
    x: centreX - half,
    y: centreY - half,
    size,
    zoom,
    focusX: centreX / width,
    focusY: centreY / height
  };
}

export function moveCropFocus(width, height, crop, dragX, dragY, viewportSize) {
  const current = computeCropRect(width, height, crop);
  if (!Number.isFinite(viewportSize) || viewportSize <= 0) return current;
  const centreX = current.x + current.size / 2 - (Number(dragX) || 0) * current.size / viewportSize;
  const centreY = current.y + current.size / 2 - (Number(dragY) || 0) * current.size / viewportSize;
  return computeCropRect(width, height, {
    zoom: current.zoom,
    focusX: centreX / width,
    focusY: centreY / height
  });
}

export function drawCropPreview(canvas, photo, crop) {
  const rect = computeCropRect(photo.width, photo.height, crop);
  const cssSize = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const canvasSize = Math.max(1, Math.round(cssSize * pixelRatio));
  if (canvas.width !== canvasSize || canvas.height !== canvasSize) {
    canvas.width = canvasSize;
    canvas.height = canvasSize;
  }
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.drawImage(photo.source, rect.x, rect.y, rect.size, rect.size, 0, 0, canvasSize, canvasSize);
  return rect;
}

export async function createCroppedPhoto(file, photo, crop = {}) {
  validatePhotoFile(file);
  const rect = computeCropRect(photo.width, photo.height, crop);
  let dimension = Math.max(1, Math.min(MAX_OUTPUT_DIMENSION, Math.round(rect.size)));
  let quality = 0.88;
  let blob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = dimension;
    canvas.height = dimension;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, dimension, dimension);
    context.drawImage(photo.source, rect.x, rect.y, rect.size, rect.size, 0, 0, dimension, dimension);
    blob = await canvasBlob(canvas, 'image/webp', quality);
    if (blob.size <= TARGET_BYTES) break;
    dimension = Math.max(480, Math.round(dimension * 0.84));
    quality = Math.max(0.52, quality - 0.06);
  }

  if (!blob || blob.size > TARGET_BYTES) throw new Error('This photo could not be compressed below the 1.5 MB upload limit.');

  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'portrait';
  return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
}

export async function optimisePhoto(file, crop = {}) {
  const photo = await loadPhoto(file);
  try {
    return await createCroppedPhoto(file, photo, crop);
  } finally {
    photo.cleanup();
  }
}
