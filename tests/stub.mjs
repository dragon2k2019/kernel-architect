// tests/stub.mjs — a tiny fake DOM, canvas and WebGL2 context.
//
// The point is not to emulate a browser: it is to run the real game loop in Node so that every code
// path (input -> sim -> hud -> renderer batching) is executed at least once before a human looks at it.
// Anything that throws on undefined, mis-indexes a typed array or overflows the instance buffer shows up.

class Fake2D {
  constructor() { this.fillStyle = '#fff'; this.font = ''; this.textAlign = ''; this.textBaseline = ''; }
  clearRect() {}
  fillText() {}
  fillRect() {}
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}

class FakeGl {
  constructor() {
    // constants the renderer reads
    const c = {
      TRIANGLES: 4, ARRAY_BUFFER: 0x8892, DYNAMIC_DRAW: 0x88E8, STATIC_DRAW: 0x88E4, FLOAT: 0x1406,
      R8: 0x8229, RED: 0x1903, UNSIGNED_BYTE: 0x1401, TEXTURE_2D: 0x0DE1, NEAREST: 0x2600,
      LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812F, TEXTURE0: 0x84C0, VERTEX_SHADER: 0x8B31,
      FRAGMENT_SHADER: 0x8B30, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82, RGBA: 0x1908,
      COLOR_ATTACHMENT0: 0x8CE0, FRAMEBUFFER: 0x8D40, FRAMEBUFFER_COMPLETE: 0x8CD5,
      DEPTH_TEST: 0x0B71, CULL_FACE: 0x0B44, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, BLEND: 0x0BE2, ONE: 1, ZERO: 0,
      COLOR_BUFFER_BIT: 0x4000,
    };
    Object.assign(this, c);
    this.drawCalls = 0; this.instancesDrawn = 0; this.bufferBytes = 0; this.textures = 0;
  }
  createShader() { return {}; } shaderSource() {} compileShader() {}
  getShaderParameter() { return true; } getShaderInfoLog() { return ''; }
  createProgram() { return {}; } attachShader() {} linkProgram() {}
  getProgramParameter() { return true; } getProgramInfoLog() { return ''; }
  getUniformLocation() { return {}; } uniform1i() {} uniform1f() {} uniform2f() {}
  createTexture() { this.textures++; return {}; } bindTexture() {} texImage2D() {} texParameteri() {}
  activeTexture() {}
  createBuffer() { return {}; } bindBuffer() {} bufferData(a, b) { this.bufferBytes += (b && b.byteLength) || 0; }
  bufferSubData(target, offset, src, srcOffset, length) {
    if (src && length !== undefined && (srcOffset + length) > src.length) throw new Error('bufferSubData out of range');
  }
  createVertexArray() { return {}; } bindVertexArray() {}
  enableVertexAttribArray() {} vertexAttribPointer() {} vertexAttribDivisor() {}
  createFramebuffer() { return {}; } bindFramebuffer() {} framebufferTexture2D() {}
  checkFramebufferStatus() { return this.FRAMEBUFFER_COMPLETE; }
  viewport() {} clearColor() {} clear() {} enable() {} disable() {} blendFunc() {}
  useProgram() {} drawArrays() {} drawArraysInstanced(mode, first, count, instances) { this.drawCalls++; this.instancesDrawn += instances; }
  getExtension() { return { UNMASKED_RENDERER_WEBGL: 'stub' }; }
  getParameter() { return 'stub-gl'; }
}

class FakeCanvas {
  constructor(w = 300, h = 150) {
    this.width = w; this.height = h; this.style = {};
    this.listeners = new Map();
    this.gl = new FakeGl();
  }
  getContext(kind) { return kind === 'webgl2' ? this.gl : kind === '2d' ? new Fake2D() : null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height }; }
  dispatch(type, ev) { for (const fn of this.listeners.get(type) || []) fn(ev); }
  focus() {}
}

export function installStub() {
  const els = new Map();
  const canvas = new FakeCanvas(1280, 800);
  els.set('gl', canvas);
  els.set('boot', { classList: { add() {}, remove() {} } });
  els.set('err', { classList: { add() {}, remove() {} } });
  els.set('errtxt', { textContent: '' });

  const winListeners = new Map();
  const frames = [];
  globalThis.document = {
    hidden: false,
    getElementById: (id) => els.get(id) || null,
    createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : { style: {}, classList: { add() {}, remove() {} } }),
    addEventListener(type, fn) { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); },
  };
  globalThis.window = globalThis;
  globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
  globalThis.addEventListener = (type, fn) => { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); };
  globalThis.removeEventListener = () => {};
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.canvas = new FakeCanvas(w, h); this.width = w; this.height = h; }
    getContext(kind) { return this.canvas.getContext(kind); } };
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  // no AudioContext: the audio module must degrade to silence, not throw
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;

  const api = {
    canvas, els, frames,
    dispatchWindow: (type, ev) => { for (const fn of winListeners.get(type) || []) fn(ev); },
    /** Tap a key: keydown + keyup, like a real keyboard. Use keyDown/keyUp for held movement. */
    key: (k) => { api.keyDown(k); api.keyUp(k); },
    keyDown: (k) => { const ev = { key: k, preventDefault() {}, target: canvas }; for (const fn of winListeners.get('keydown') || []) fn(ev); },
    keyUp: (k) => { const ev = { key: k, preventDefault() {}, target: canvas }; for (const fn of winListeners.get('keyup') || []) fn(ev); },
    click: (cellX, cellY, button = 0) => {
      canvas.dispatch('mousemove', { clientX: cellX * 8 + 4, clientY: cellY * 16 + 8 });
      canvas.dispatch('mousedown', { clientX: cellX * 8 + 4, clientY: cellY * 16 + 8, button });
    },
    /** Run one animation frame: drains the rAF queue exactly like a browser frame. */
    frame(dtMs = 16.67) {
      const pending = frames.splice(0, frames.length);
      for (const fn of pending) fn(this.now = (this.now || 0) + dtMs);
    },
    pump(n, dtMs = 16.67) { for (let i = 0; i < n; i++) this.frame(dtMs); },
  };
  return api;
}
