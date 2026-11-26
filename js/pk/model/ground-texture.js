import * as THREE from '../../../vendor/three.module.min.js';

let cached;
/* 每段约 18 米重复一次，横纵像素密度相近；不把一张小图拉满整条战线。 */
export function groundTexture() {
  if (cached) return cached;
  let state = 7729;
  const rnd = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1536;
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#91ae54'; ctx.fillRect(0, 0, W, H);
  const edge = (x, sign) => H * .5 + sign * H * .147
    + Math.sin(x / W * Math.PI * 4 + sign) * 15 + Math.sin(x / W * Math.PI * 12) * 6;
  const road = new Path2D(); road.moveTo(0, edge(0, -1));
  for (let x = 0; x <= W; x += 4) road.lineTo(x, edge(x, -1));
  for (let x = W; x >= 0; x -= 4) road.lineTo(x, edge(x, 1));
  road.closePath();
  for (let i = 0; i < 14000; i++) {
    const x = rnd() * W, y = rnd() * H, size = 1 + rnd() * 5;
    ctx.fillStyle = ['#6d944b50', '#c4cf6c65', '#d6dd8b50', '#517c3d40'][i % 4];
    ctx.fillRect(x, y, size, size * .8);
  }
  // 草坡边缘的泥土薄影与浅色碎石。
  ctx.strokeStyle = '#6e803d'; ctx.lineWidth = 15; ctx.stroke(road);
  ctx.save(); ctx.clip(road);
  const dirt = ctx.createLinearGradient(0, H * .34, 0, H * .66);
  dirt.addColorStop(0, '#bf9e6b'); dirt.addColorStop(.13, '#dcc18b');
  dirt.addColorStop(.5, '#ead1a0'); dirt.addColorStop(.87, '#ddbf87'); dirt.addColorStop(1, '#bd9c68');
  ctx.fillStyle = dirt; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 85; i++) {
    const x = rnd() * W, y = H * (.36 + rnd() * .28), r = 16 + rnd() * 50;
    const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
    patch.addColorStop(0, i % 2 ? '#9f784230' : '#fff1c03b'); patch.addColorStop(1, '#dec18e00');
    ctx.fillStyle = patch; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 560; i++) {
    const x = rnd() * W, y = H * (.355 + rnd() * .29);
    const w = 7 + rnd() * 25, h = 5 + rnd() * 18;
    const pts = [[-.5, -.25], [-.27, -.52], [.31, -.42], [.52, .1], [.21, .49], [-.4, .38]];
    ctx.beginPath(); pts.forEach(([dx, dy], n) => n ? ctx.lineTo(x + dx * w, y + dy * h) : ctx.moveTo(x + dx * w, y + dy * h));
    ctx.closePath();
    ctx.fillStyle = ['#dac08e', '#c7ac7f', '#e4cda3', '#eddbb8', '#b7a084'][i % 5];
    ctx.strokeStyle = '#95794f70'; ctx.lineWidth = 1.2;
    ctx.shadowColor = '#79624150'; ctx.shadowOffsetY = 2; ctx.shadowBlur = 1.3;
    ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.stroke();
    ctx.strokeStyle = '#fff0c790'; ctx.beginPath(); ctx.moveTo(x - w * .4, y - h * .25);
    ctx.lineTo(x - w * .2, y - h * .44); ctx.lineTo(x + w * .3, y - h * .34); ctx.stroke();
  }
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = i % 2 ? '#fff4d750' : '#7b633a25';
    ctx.fillRect(rnd() * W, H * (.35 + rnd() * .3), 1 + rnd() * 2.3, 1 + rnd() * 2.3);
  }
  ctx.restore();
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * W, sign = i % 2 ? 1 : -1;
    const y = edge(x, sign) + sign * (rnd() * 65 - 7);
    ctx.strokeStyle = ['#638a39', '#a6bd5b', '#c2d477'][i % 3]; ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 8 - 4, y - 4 - rnd() * 10); ctx.stroke();
  }
  cached = new THREE.CanvasTexture(c); cached.colorSpace = THREE.SRGBColorSpace;
  cached.wrapS = cached.wrapT = THREE.RepeatWrapping;
  cached.repeat.set(8, 1); cached.anisotropy = 8;
  return cached;
}
