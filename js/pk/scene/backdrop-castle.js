import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from '../model/shared.js';
import { addSpire, addWindow, archGeometry } from '../model/architecture.js';
import { bannerMaterial } from '../model/heraldry.js';

const STONE = [0xe7dcc4, 0xf1e7d1, 0xd7cbb4, 0xe0d3bc];
function box(g, sx, sy, sz, color, x, y, z) {
  const m = add(g, G('backdropCube', () => new THREE.BoxGeometry(1, 1, 1)), mat(color), x, y, z);
  m.scale.set(sx, sy, sz); return m;
}
function banner(g, x, y, z, w, h) {
  const flag = add(g, G('castlePennant', () => {
    const s = new THREE.Shape(); s.moveTo(-.5, .5); s.lineTo(.5, .5);
    s.lineTo(.5, -.35); s.lineTo(0, -.5); s.lineTo(-.5, -.35); s.closePath();
    const geo = new THREE.ShapeGeometry(s);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + .5, p.getY(i) + .5);
    return geo;
  }), bannerMaterial(0), x, y, z);
  flag.scale.set(w, h, 1);
  box(g, w * 1.15, .09, .1, 0xb79150, x, y + h * .52, z + .02);
}

function tower(parent, x, z, radius, height, roofHeight, withBanner = false) {
  const t = new THREE.Group(); t.position.set(x, 0, z); parent.add(t);
  add(t, G(`citadelTower:${radius}:${height}`, () => new THREE.CylinderGeometry(radius, radius * 1.11, height, 20)),
    mat(STONE[0]), 0, height / 2, 0);
  [height * .12, height * .58, height - .17].forEach((y, i) => {
    add(t, G(`citadelRing:${radius}:${i}`, () => new THREE.CylinderGeometry(radius * 1.1, radius * 1.13, .16, 20)),
      mat(i === 1 ? 0xcfc0a5 : 0xf1e4c8), 0, y, 0);
  });
  for (let row = 0; row < Math.floor(height / .62); row++) {
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI * 2 / 7 + (row % 2) * .4;
      const brick = box(t, .28, .15, .035, STONE[(row + k) % 4],
        Math.sin(a) * (radius + .012), row * .62 + .4, Math.cos(a) * (radius + .012));
      brick.rotation.y = a;
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = k * Math.PI * 2 / 10;
    const merlon = box(t, .27, .34, .23, STONE[1], Math.sin(a) * radius, height + .10, Math.cos(a) * radius);
    merlon.rotation.y = a;
  }
  addWindow(t, 0, height - 1.6, radius + .03, .35, .77);
  if (height > 6) addWindow(t, 0, height - 3.2, radius + .03, .28, .6);
  addSpire(t, 0, height + .15, 0, radius * 1.35, roofHeight);
  if (withBanner) banner(t, 0, height * .46, radius + .1, radius * .95, radius * 1.7);
  // 金顶上方的小燕尾旗。
  box(t, .035, 1.05, .035, 0xd5a54e, 0, height + roofHeight + .7, 0);
  add(t, G('citadelTopFlag', () => new THREE.PlaneGeometry(.65, .38)), bannerMaterial(0), .33, height + roofHeight + 1, 0);
  bakeGroup(t);
}

export function buildCitadel() {
  const g = new THREE.Group(); g.name = 'valleyCitadel';
  // 内堡先起高，前方城墙和塔楼叠出层次。
  box(g, 9.6, 8.8, 3.4, STONE[0], 0, 4.4, -3.8);
  box(g, 10, .3, 3.7, STONE[1], 0, 8.7, -3.8);
  for (let row = 0; row < 2; row++) for (let i = -3; i <= 3; i++) {
    addWindow(g, i * 1.25, 4.5 + row * 1.9, -2.06, .43, 1.0);
  }
  const roof = add(g, G('citadelKeepRoof', () => new THREE.ConeGeometry(6.7, 2.2, 4)), mat(0x2e64a0), 0, 9.7, -3.8);
  roof.rotation.y = Math.PI / 4; roof.scale.z = .55;
  tower(g, 0, -4, 1.2, 12.3, 3.9);
  tower(g, -4.7, -3.9, .82, 9.7, 2.9);
  tower(g, 4.7, -3.9, .82, 10.5, 3.1);
  [-1, 1].forEach(s => {
    box(g, 12.9, 3.45, 1.7, STONE[0], s * 9.3, 1.72, 0);
    box(g, 13.2, .22, 1.95, STONE[1], s * 9.3, 3.4, 0);
    box(g, 13.2, .3, 1.95, 0xb8b49d, s * 9.3, .16, 0);
    for (let i = 0; i < 15; i++) {
      box(g, .48, .47, 1.95, STONE[1], s * (3.4 + i * .84), 3.75, 0);
    }
    for (let i = 0; i < 5; i++) {
      const x = s * (4.5 + i * 2.4);
      box(g, .33, 3.5, .3, STONE[2], x, 1.75, 1);
      box(g, .54, .2, .48, STONE[1], x, 3.3, 1);
      if (i % 2 === 0) banner(g, x + s * .7, 2.25, .92, .64, 1.32);
    }
    tower(g, s * 15.5, .4, 1.06, 5.8, 2.8, true);
    tower(g, s * 8.2, -1.7, .85, 7.6, 2.5);
    tower(g, s * 3, 0, 1.02, 6.6, 3.3, true);
  });
  // 真正的圆拱轮廓、石砌门楣、栅栏与中央纹章。
  box(g, 5.7, 5.1, 2.4, STONE[0], 0, 2.55, .03);
  add(g, archGeometry(3.15, 3.7, .04), mat(0x33404b), 0, .04, 1.26);
  add(g, G('citadelGateArch', () => new THREE.TorusGeometry(1.73, .2, 5, 24, Math.PI)),
    mat(0xc6b38f), 0, 2.18, 1.37);
  [-1, 1].forEach(s => box(g, .36, 2.2, .25, 0xc6b38f, s * 1.73, 1.1, 1.38));
  for (let i = -3; i <= 3; i++) box(g, .045, 2.9, .05, 0xa68748, i * .39, 1.5, 1.36);
  [.7, 1.5, 2.6].forEach(y => box(g, 3.04, .055, .06, 0xc2a56b, 0, y, 1.39));
  box(g, 6, .22, 2.7, STONE[1], 0, 5.18, 0);
  for (let i = -3; i <= 3; i++) box(g, .48, .5, .5, STONE[1], i * .85, 5.45, 1.1);
  banner(g, 0, 4.55, 1.4, .82, 1.45);
  for (let row = 0; row < 5; row++) for (let i = -16; i <= 16; i++) {
    if (Math.abs(i) < 3) continue;
    box(g, .6, .035, .028, 0xc7bda7, i * .95 + (row % 2) * .45, .65 + row * .53, .87);
  }
  bakeGroup(g);
  g.position.set(0, -.15, -32);
  g.scale.set(1.05, .65, .85);
  return g;
}
