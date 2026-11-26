import * as THREE from '../../../vendor/three.module.min.js';

/* ---------------- 程序化贴图 ---------------- */
function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c: c, x: c.getContext('2d') };
}

function toTex(c, rx, ry) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  return t;
}

export { groundTexture } from './ground-texture.js';

let _brick = null;
export function brickTexture() {
  if (_brick) return _brick;
  const W = 256, H = 256;
  const o = canvas2d(W, H), x = o.x;
  x.fillStyle = '#e6d3b8';
  x.fillRect(0, 0, W, H);

  const bw = 62, bh = 30;
  for (let row = 0; row * bh < H + bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col * bw < W + bw; col++) {
      const bx = col * bw + off + 2;
      const by = row * bh + 2;
      const v = Math.random();
      const r = 246 - v * 16, gg = 236 - v * 20, b = 216 - v * 22;
      x.fillStyle = 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
      x.fillRect(bx, by, bw - 4, bh - 4);
      /* 砖面高光 + 底部阴影，砖才有厚度 */
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillRect(bx, by, bw - 4, 2);
      x.fillStyle = 'rgba(160,140,110,.18)';
      x.fillRect(bx, by + bh - 6, bw - 4, 2);
    }
  }
  for (let i = 0; i < 900; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(150,130,100,.10)' : 'rgba(255,255,255,.16)';
    x.beginPath();
    x.arc(Math.random() * W, Math.random() * H, Math.random() * 2.4, 0, 6.283);
    x.fill();
  }
  _brick = toTex(o.c, 2, 1.6);
  return _brick;
}

/* 屋瓦：一列列的半圆，塔顶用 */
const _roof = new Map();
export function roofTexture(color) {
  let t = _roof.get(color);
  if (t) return t;
  const W = 128, H = 128;
  const o = canvas2d(W, H), x = o.x;
  const c = new THREE.Color(color);
  x.fillStyle = '#' + c.getHexString();
  x.fillRect(0, 0, W, H);
  const lw = 16, lh = 20;
  for (let row = 0; row * lh < H + lh; row++) {
    const off = (row % 2) * (lw / 2);
    for (let col = -1; col * lw < W + lw; col++) {
      const bx = col * lw + off;
      const by = row * lh;
      x.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.07).toFixed(3) + ')';
      x.beginPath();
      x.moveTo(bx + 1, by + lh);
      x.lineTo(bx + 1, by + 6);
      x.quadraticCurveTo(bx + lw / 2, by - 5, bx + lw - 1, by + 6);
      x.lineTo(bx + lw - 1, by + lh);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,.16)';
      x.lineWidth = 1.4;
      x.stroke();
    }
  }
  t = toTex(o.c, 3, 2);
  _roof.set(color, t);
  return t;
}

/* 木头：竖纹 */
let _wood = null;
export function woodTexture() {
  if (_wood) return _wood;
  const W = 64, H = 128;
  const o = canvas2d(W, H), x = o.x;
  x.fillStyle = '#8a6247';
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.09).toFixed(3) + ')';
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    const px = Math.random() * W;
    x.moveTo(px, 0);
    x.bezierCurveTo(px + 3, H * 0.3, px - 3, H * 0.7, px + 1, H);
    x.stroke();
  }
  _wood = toTex(o.c, 1, 2);
  return _wood;
}

