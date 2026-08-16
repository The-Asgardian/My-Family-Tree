import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCropRect, computeVisibleCrop, fitPhotoZoom, moveCropFocus } from '../src/lib/photo-utils.js';

test('centres a square crop inside a landscape photo', () => {
  assert.deepEqual(computeCropRect(1200, 800), {
    x: 200,
    y: 0,
    size: 800,
    zoom: 1,
    focusX: 0.5,
    focusY: 0.5
  });
});

test('centres a square crop inside a portrait photo', () => {
  const crop = computeCropRect(600, 1000);
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 200);
  assert.equal(crop.size, 600);
});

test('zooming reduces the selected source area', () => {
  const crop = computeCropRect(1200, 800, { zoom: 2 });
  assert.equal(crop.size, 400);
  assert.equal(crop.x, 400);
  assert.equal(crop.y, 200);
});

test('focus can reach image edges so the crop exposes black space', () => {
  const crop = computeCropRect(1200, 800, { zoom: 2, focusX: -1, focusY: 3 });
  assert.equal(crop.x, -200);
  assert.equal(crop.y, 600);
  assert.equal(crop.focusX, 0);
  assert.equal(crop.focusY, 1);
  assert.deepEqual(computeVisibleCrop(1200, 800, crop), {
    sourceX: 0,
    sourceY: 600,
    sourceWidth: 200,
    sourceHeight: 200,
    destinationX: 0.5,
    destinationY: 0,
    destinationWidth: 0.5,
    destinationHeight: 0.5
  });
});

test('dragging the image right moves the crop towards the left of the source', () => {
  const crop = moveCropFocus(1200, 800, { zoom: 2, focusX: 0.5, focusY: 0.5 }, 100, 0, 400);
  assert.equal(crop.x, 300);
  assert.equal(crop.y, 200);
});

test('zoom and drag inputs are bounded safely', () => {
  assert.equal(computeCropRect(1000, 1000, { zoom: 99 }).zoom, 4);
  assert.equal(computeCropRect(1000, 1000, { zoom: -5 }).zoom, 0.01);
  assert.deepEqual(moveCropFocus(1000, 1000, { zoom: 1 }, 200, 200, 0), computeCropRect(1000, 1000));
});

test('fit zoom includes the whole landscape or portrait photo', () => {
  assert.equal(fitPhotoZoom(1200, 800), 2 / 3);
  assert.equal(fitPhotoZoom(600, 1000), 0.6);
  const landscape = computeCropRect(1200, 800, { zoom: fitPhotoZoom(1200, 800) });
  assert.equal(landscape.x, 0);
  assert.equal(landscape.y, -200);
  assert.equal(landscape.size, 1200);
});
