import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCropRect, moveCropFocus } from '../src/lib/photo-utils.js';

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

test('focus is clamped so the crop never exposes an empty edge', () => {
  const crop = computeCropRect(1200, 800, { zoom: 2, focusX: -1, focusY: 3 });
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 400);
  assert.equal(crop.focusX, 200 / 1200);
  assert.equal(crop.focusY, 600 / 800);
});

test('dragging the image right moves the crop towards the left of the source', () => {
  const crop = moveCropFocus(1200, 800, { zoom: 2, focusX: 0.5, focusY: 0.5 }, 100, 0, 400);
  assert.equal(crop.x, 300);
  assert.equal(crop.y, 200);
});

test('zoom and drag inputs are bounded safely', () => {
  assert.equal(computeCropRect(1000, 1000, { zoom: 99 }).zoom, 4);
  assert.equal(computeCropRect(1000, 1000, { zoom: -5 }).zoom, 1);
  assert.deepEqual(moveCropFocus(1000, 1000, { zoom: 1 }, 200, 200, 0), computeCropRect(1000, 1000));
});
