// src/render/renderer.js — WebGL2 batch renderer.
//
// Every glyph cell and every packet dot in a frame goes into ONE instance buffer and is drawn with
// two instanced draw calls (alpha-blended cells, additive sprites). No per-object draw calls, no
// DOM text, no canvas2d in the frame loop.

import { buildAtlas, atlasToAlpha, glyphIndex, GLYPH_W, GLYPH_H, ATLAS_COLS, ATLAS_ROWS } from './atlas.js';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;              // unit quad 0..1
layout(location=1) in vec4 aRect;                // x, y, w, h in pixels
layout(location=2) in vec4 aUV;                  // u0, v0, u1, v1
layout(location=3) in vec4 aFg;                  // rgb + mode (0 = glyph, 1 = sprite)
layout(location=4) in vec4 aBg;                  // rgb + intensity
uniform vec2 uRes;
out vec2 vUV; out vec4 vFg; out vec4 vBg;
void main() {
  vec2 p = aRect.xy + aCorner * aRect.zw;
  vec2 clip = vec2(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, aCorner);
  vFg = aFg; vBg = aBg;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vFg; in vec4 vBg;
uniform sampler2D uAtlas;
out vec4 outColor;
void main() {
  float a = texture(uAtlas, vUV).r;
  if (vFg.w < 0.5) {                              // glyph cell
    outColor = vec4(mix(vBg.rgb, vFg.rgb, a), 1.0);
  } else {                                        // packet sprite: soft round dot
    vec2 d = vUV - 0.5;
    float r = length(d) * 2.0;
    float alpha = clamp(1.0 - r, 0.0, 1.0);
    alpha *= alpha;
    outColor = vec4(vFg.rgb * alpha * vFg.w * vBg.w, 1.0);
  }
}`;

const POST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime; uniform float uCrt;
void main() {
  vec2 uv = vUV;
  // slight barrel-ish warp + vertical scanlines + a slow flicker
  vec3 c = texture(uTex, uv).rgb;
  if (uCrt > 0.5) {
    float scan = 0.88 + 0.12 * sin((uv.y * uRes.y) * 3.14159);
    float vign = 1.0 - 0.42 * pow(distance(uv, vec2(0.5)) * 1.35, 2.4);
    float flick = 0.985 + 0.015 * sin(uTime * 11.0);
    c *= scan * clamp(vign, 0.0, 1.0) * flick;
    c += 0.035 * sin(uv.y * uRes.y * 130.0) * vec3(0.0, 1.0, 0.4);
  }
  outColor = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

export const COLS = 160, ROWS = 50;               // terminal grid
export const LOGICAL_W = COLS * GLYPH_W;          // 1280
export const LOGICAL_H = ROWS * GLYPH_H;          // 800

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = LOGICAL_W; canvas.height = LOGICAL_H;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.crt = 1;
    this.time = 0;

    // ---- glyph atlas texture
    const atlas = buildAtlas();
    this.atlasSize = [atlas.width, atlas.height];
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, atlas.width, atlas.height, 0, gl.RED, gl.UNSIGNED_BYTE, atlasToAlpha(atlas));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ---- main program
    this.prog = program(gl, VS, FS);
    this.uRes = gl.getUniformLocation(this.prog, 'uRes');
    this.uAtlas = gl.getUniformLocation(this.prog, 'uAtlas');

    // ---- instance buffer: 12 floats per instance
    this.floatsPer = 16;   // x,y,w,h | u0,v0,u1,v1 | fg.rgb,mode | bg.rgb,intensity
    this.cap = 24000;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.cap * this.floatsPer * 4, gl.DYNAMIC_DRAW);
    this.cpu = new Float32Array(this.cap * this.floatsPer);
    this.count = 0;
    this.spriteStart = -1;

    // ---- unit quad
    const quad = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const vao = this.vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const stride = this.floatsPer * 4;
    const attrs = [[1, 4, 0], [2, 4, 16], [3, 4, 32], [4, 4, 48]];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    // ---- post-process target (optional; falls back to direct rendering)
    this.usePost = true;
    try {
      this.fboTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LOGICAL_W, LOGICAL_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.postProg = program(gl, POST_VS, POST_FS);
      this.postVao = gl.createVertexArray();
      const tri = gl.createBuffer();
      gl.bindVertexArray(this.postVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    } catch (e) {
      this.usePost = false;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.instances = 0;
  }

  begin() { this.count = 0; this.spriteStart = -1; }

  push(x, y, w, h, gu, gv, gu2, gv2, fr, fg, fb, mode, br, bg, bb, bi) {
    if (this.count >= this.cap) return;
    const a = this.cpu, o = this.count * this.floatsPer;
    a[o] = x; a[o + 1] = y; a[o + 2] = w; a[o + 3] = h;
    a[o + 4] = gu; a[o + 5] = gv; a[o + 6] = gu2; a[o + 7] = gv2;
    a[o + 8] = fr; a[o + 9] = fg; a[o + 10] = fb; a[o + 11] = mode;
    a[o + 12] = br; a[o + 13] = bg; a[o + 14] = bb; a[o + 15] = bi;
    this.count++;
  }

  /** Queue one terminal cell. fg/bg are [r,g,b] in 0..1. */
  cell(col, row, glyph, fg, bg, bgI = 1) {
    const gi = glyphIndex(glyph);
    const u = (gi % ATLAS_COLS) / ATLAS_COLS, v = Math.floor(gi / ATLAS_COLS) / ATLAS_ROWS;
    this.push(col * GLYPH_W, row * GLYPH_H, GLYPH_W, GLYPH_H, u, v, u + 1 / ATLAS_COLS, v + 1 / ATLAS_ROWS,
      fg[0], fg[1], fg[2], 0, bg[0], bg[1], bg[2], bgI);
  }

  /** Queue a packet sprite at pixel coordinates. */
  sprite(x, y, radius, color, intensity = 1) {
    if (this.spriteStart < 0) this.spriteStart = this.count;
    this.push(x - radius, y - radius, radius * 2, radius * 2, 0, 0, 1, 1, color[0], color[1], color[2], 1, 1, 1, 1, intensity);
  }

  /** Upload and draw. Sprites are drawn additively over the cells. */
  flush(time) {
    const gl = this.gl;
    this.time = time;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.cpu, 0, this.count * this.floatsPer);

    const target = (this.usePost && this.crt >= 0) ? this.fbo : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, LOGICAL_W, LOGICAL_H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, LOGICAL_W, LOGICAL_H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uAtlas, 0);
    gl.bindVertexArray(this.vao);

    const glyphEnd = this.spriteStart < 0 ? this.count : this.spriteStart;
    if (glyphEnd > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ZERO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, glyphEnd);
    }
    if (this.spriteStart >= 0 && this.count > this.spriteStart) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);            // additive glow for packets
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count - this.spriteStart);
    }
    gl.bindVertexArray(null);

    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, LOGICAL_W, LOGICAL_H);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.postProg);
      gl.bindVertexArray(this.postVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.uniform1i(gl.getUniformLocation(this.postProg, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(this.postProg, 'uRes'), LOGICAL_W, LOGICAL_H);
      gl.uniform1f(gl.getUniformLocation(this.postProg, 'uTime'), this.time);
      gl.uniform1f(gl.getUniformLocation(this.postProg, 'uCrt'), this.crt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }
    this.instances = this.count;
  }

  /** Fit the canvas to the viewport, preserving the 16:10 aspect. */
  fit() {
    const w = Math.max(320, window.innerWidth || 0), h = Math.max(200, window.innerHeight || 0);
    const s = Math.min(w / LOGICAL_W, h / LOGICAL_H);
    const cw = Math.floor(LOGICAL_W * s), ch = Math.floor(LOGICAL_H * s);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.scaleX = LOGICAL_W / cw; this.scaleY = LOGICAL_H / ch;
  }
}
