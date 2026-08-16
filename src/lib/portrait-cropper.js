import {
  computeCropRect,
  createCroppedPhoto,
  drawCropPreview,
  loadPhoto,
  moveCropFocus
} from './photo-utils.js?v=20260816-photo-positioning-3';

export class PortraitCropper {
  constructor(dialog) {
    if (!dialog) throw new Error('The portrait crop dialog is missing.');
    this.dialog = dialog;
    this.form = dialog.querySelector('#photoCropForm');
    this.viewport = dialog.querySelector('#photoCropViewport');
    this.canvas = dialog.querySelector('#photoCropCanvas');
    this.zoomInput = dialog.querySelector('#photoCropZoom');
    this.zoomOutput = dialog.querySelector('#photoCropZoomValue');
    this.resetButton = dialog.querySelector('#photoCropReset');
    this.confirmButton = dialog.querySelector('#photoCropConfirm');
    this.status = dialog.querySelector('#photoCropStatus');
    this.cancelButtons = [...dialog.querySelectorAll('[data-crop-cancel]')];
    this.file = null;
    this.photo = null;
    this.crop = { zoom: 1, focusX: 0.5, focusY: 0.5 };
    this.drag = null;
    this.resolve = null;
    this.result = null;
    this.opening = false;
    this.processing = false;
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.viewport);
  }

  bindEvents() {
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      this.confirm();
    });
    this.cancelButtons.forEach(button => button.addEventListener('click', () => this.cancel()));
    this.resetButton.addEventListener('click', () => this.reset());
    this.zoomInput.addEventListener('input', () => this.setZoom(Number(this.zoomInput.value)));
    this.viewport.addEventListener('wheel', event => {
      if (!this.photo) return;
      event.preventDefault();
      this.setZoom(this.crop.zoom * (event.deltaY < 0 ? 1.08 : 0.92));
    }, { passive: false });
    this.viewport.addEventListener('pointerdown', event => this.startDrag(event));
    this.viewport.addEventListener('pointermove', event => this.continueDrag(event));
    this.viewport.addEventListener('pointerup', event => this.endDrag(event));
    this.viewport.addEventListener('pointercancel', event => this.endDrag(event));
    this.viewport.addEventListener('keydown', event => this.handleKeyboard(event));
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.cancel();
    });
    this.dialog.addEventListener('close', () => this.finish());
  }

  async open(file) {
    if (this.opening || this.resolve) throw new Error('Finish positioning the current photo first.');
    this.opening = true;
    let photo;
    try {
      photo = await loadPhoto(file);
    } catch (error) {
      this.opening = false;
      throw error;
    }
    this.file = file;
    this.photo = photo;
    this.result = null;
    this.crop = { zoom: 1, focusX: 0.5, focusY: 0.5 };
    this.zoomInput.value = '1';
    this.confirmButton.disabled = false;
    this.status.textContent = `${photo.width} × ${photo.height}px · saved as a square WebP.`;
    const resultPromise = new Promise(resolve => { this.resolve = resolve; });
    try {
      this.dialog.showModal();
    } catch (error) {
      this.resolve = null;
      this.photo.cleanup();
      this.photo = null;
      this.file = null;
      this.opening = false;
      throw error;
    }
    this.opening = false;
    requestAnimationFrame(() => {
      this.render();
      this.viewport.focus({ preventScroll: true });
    });
    return resultPromise;
  }

  render() {
    if (!this.photo || !this.dialog.open) return;
    const rect = drawCropPreview(this.canvas, this.photo, this.crop);
    this.crop = { zoom: rect.zoom, focusX: rect.focusX, focusY: rect.focusY };
    this.zoomInput.value = String(rect.zoom);
    this.zoomOutput.value = `${rect.zoom.toFixed(1)}×`;
    this.zoomOutput.textContent = this.zoomOutput.value;
  }

  setZoom(zoom) {
    if (!this.photo) return;
    const rect = computeCropRect(this.photo.width, this.photo.height, { ...this.crop, zoom });
    this.crop = { zoom: rect.zoom, focusX: rect.focusX, focusY: rect.focusY };
    this.render();
  }

  reset() {
    if (!this.photo) return;
    this.crop = { zoom: 1, focusX: 0.5, focusY: 0.5 };
    this.status.textContent = `${this.photo.width} × ${this.photo.height}px · centred and reset.`;
    this.render();
  }

  startDrag(event) {
    if (!this.photo || event.button !== 0) return;
    event.preventDefault();
    this.viewport.setPointerCapture(event.pointerId);
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop: { ...this.crop }
    };
    this.viewport.classList.add('dragging');
  }

  continueDrag(event) {
    if (!this.photo || !this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = moveCropFocus(
      this.photo.width,
      this.photo.height,
      this.drag.crop,
      event.clientX - this.drag.x,
      event.clientY - this.drag.y,
      this.viewport.clientWidth
    );
    this.crop = { zoom: rect.zoom, focusX: rect.focusX, focusY: rect.focusY };
    this.render();
  }

  endDrag(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    this.drag = null;
    this.viewport.classList.remove('dragging');
  }

  handleKeyboard(event) {
    if (!this.photo || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '+' || event.key === '=') return this.setZoom(this.crop.zoom + 0.1);
    if (event.key === '-') return this.setZoom(this.crop.zoom - 0.1);
    const step = this.viewport.clientWidth * (event.shiftKey ? 0.08 : 0.025);
    const dragX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dragY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const rect = moveCropFocus(this.photo.width, this.photo.height, this.crop, dragX, dragY, this.viewport.clientWidth);
    this.crop = { zoom: rect.zoom, focusX: rect.focusX, focusY: rect.focusY };
    this.render();
  }

  async confirm() {
    if (!this.photo || this.confirmButton.disabled) return;
    this.confirmButton.disabled = true;
    this.resetButton.disabled = true;
    this.cancelButtons.forEach(button => { button.disabled = true; });
    this.processing = true;
    this.status.textContent = 'Preparing your portrait…';
    try {
      this.result = await createCroppedPhoto(this.file, this.photo, this.crop);
      this.dialog.close('confirmed');
    } catch (error) {
      this.status.textContent = error?.message || 'This photo could not be prepared.';
      this.confirmButton.disabled = false;
      this.resetButton.disabled = false;
      this.cancelButtons.forEach(button => { button.disabled = false; });
      this.processing = false;
    }
  }

  cancel() {
    if (this.processing) return;
    if (this.dialog.open) this.dialog.close('cancelled');
  }

  finish() {
    const resolve = this.resolve;
    const result = this.result;
    this.resolve = null;
    this.result = null;
    this.drag = null;
    this.processing = false;
    this.viewport.classList.remove('dragging');
    this.confirmButton.disabled = false;
    this.resetButton.disabled = false;
    this.cancelButtons.forEach(button => { button.disabled = false; });
    this.photo?.cleanup();
    this.photo = null;
    this.file = null;
    if (resolve) resolve(result);
  }
}
