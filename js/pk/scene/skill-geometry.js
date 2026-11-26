import * as THREE from '../../../vendor/three.module.min.js';

export const WAVE_GEO = new THREE.RingGeometry(.82, 1, 56, 1, -Math.PI * .47, Math.PI * .94);
export const SHOCK_GEO = new THREE.RingGeometry(.94, 1, 64);
export const RUNE_GEO = new THREE.PlaneGeometry(2, 2);
export const GLOW_GEO = new THREE.PlaneGeometry(.32, .98);
export const ORBIT_GEO = new THREE.TorusGeometry(.23, .012, 5, 20);
let runeMap, glowMap;

export function runeTexture() {
  if (runeMap) return runeMap;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d'); ctx.translate(256, 256); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
  [168, 204, 224].forEach(r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });
  for (let i = 0; i < 24; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 12);
    ctx.beginPath(); ctx.moveTo(0, -208); ctx.lineTo(0, -220); ctx.stroke();
    if (i % 3 === 0) {
      ctx.beginPath(); ctx.moveTo(-9, -182); ctx.lineTo(0, -197); ctx.lineTo(9, -182); ctx.lineTo(0, -187); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }
  for (let j = 0; j < 2; j++) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 - Math.PI / 2 + j * Math.PI;
      const x = Math.cos(a) * 133, y = Math.sin(a) * 133;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  }
  runeMap = new THREE.CanvasTexture(c); return runeMap;
}
export function glowTexture() {
  if (glowMap) return glowMap;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.2, '#ffffffee'); g.addColorStop(.5, '#ffffff80'); g.addColorStop(1, '#ffffff00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); glowMap = new THREE.CanvasTexture(c); return glowMap;
}
export function fxMaterial(color, opacity = .8, map = null) {
  return new THREE.MeshBasicMaterial({ color, map, opacity, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
}
