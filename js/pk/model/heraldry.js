import * as THREE from '../../../vendor/three.module.min.js';
import { G, mat, add } from './shared.js';

/* 共用同一套轮廓：盾、战袍、军旗和城堡上的阵营纹章不会各画各的。 */
export function crestShape(side = 0) {
  const s = new THREE.Shape();
  if (side === 0) {
    s.moveTo(0, .51);
    s.bezierCurveTo(-.25, .25, -.17, .11, -.07, -.02);
    s.bezierCurveTo(-.47, .35, -.61, -.05, -.35, -.16);
    s.bezierCurveTo(-.36, .02, -.18, .05, -.12, -.09);
    s.lineTo(-.3, -.09); s.lineTo(-.3, -.18); s.lineTo(-.09, -.18);
    s.quadraticCurveTo(-.1, -.35, -.23, -.36);
    s.lineTo(-.13, -.43); s.lineTo(0, -.33); s.lineTo(.13, -.43); s.lineTo(.23, -.36);
    s.quadraticCurveTo(.1, -.35, .09, -.18);
    s.lineTo(.3, -.18); s.lineTo(.3, -.09); s.lineTo(.12, -.09);
    s.bezierCurveTo(.18, .05, .36, .02, .35, -.16);
    s.bezierCurveTo(.61, -.05, .47, .35, .07, -.02);
    s.bezierCurveTo(.17, .11, .25, .25, 0, .51);
  } else {
    s.moveTo(0, .32); s.lineTo(-.08, .19); s.lineTo(-.18, .25);
    s.lineTo(-.5, .45); s.lineTo(-.44, .17); s.lineTo(-.28, -.02);
    s.lineTo(-.48, .02); s.lineTo(-.32, -.17); s.lineTo(-.16, -.19);
    s.lineTo(-.29, -.33); s.lineTo(-.13, -.29); s.lineTo(-.16, -.46);
    s.lineTo(0, -.32); s.lineTo(.16, -.46); s.lineTo(.13, -.29);
    s.lineTo(.29, -.33); s.lineTo(.16, -.19); s.lineTo(.32, -.17);
    s.lineTo(.48, .02); s.lineTo(.28, -.02); s.lineTo(.44, .17);
    s.lineTo(.5, .45); s.lineTo(.18, .25); s.lineTo(.08, .19);
  }
  s.closePath();
  return s;
}

export function addCrest(parent, side, size, x = 0, y = 0, z = 0, color = 0xfff4d8) {
  const m = add(parent, G('heraldry' + side, () => new THREE.ShapeGeometry(crestShape(side), 8)),
    mat(color), x, y, z);
  m.scale.setScalar(size);
  return m;
}

const bannerMats = new Map();
export function bannerMaterial(side) {
  if (bannerMats.has(side)) return bannerMats.get(side);
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = side ? '#af2536' : '#2358af'; ctx.fillRect(0, 0, 256, 384);
  const shade = ctx.createLinearGradient(0, 0, 256, 0);
  shade.addColorStop(0, '#ffffff35'); shade.addColorStop(.35, '#ffffff00');
  shade.addColorStop(.7, '#00000025'); shade.addColorStop(1, '#ffffff20');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 384);
  ctx.strokeStyle = '#f6cb70'; ctx.lineWidth = 8; ctx.strokeRect(12, 12, 232, 360);
  const points = crestShape(side).getPoints(32);
  ctx.fillStyle = '#fff3d9'; ctx.beginPath();
  points.forEach((p, i) => {
    const x = 128 + p.x * 170, y = 170 - p.y * 170;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const material = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  bannerMats.set(side, material);
  return material;
}
