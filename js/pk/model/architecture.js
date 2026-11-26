import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';

export function archGeometry(width, height, depth = 0) {
  return G(`arch:${width}:${height}:${depth}`, () => {
    const r = width / 2, s = new THREE.Shape();
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, height - r);
    s.absarc(0, height - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
    return depth ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 })
      : new THREE.ShapeGeometry(s, 12);
  });
}

export function addWindow(parent, x, y, z, width = .36, height = .78) {
  add(parent, archGeometry(width + .13, height + .09, .025), mat(0xd5bf93), x, y - .04, z);
  add(parent, archGeometry(width, height), mat(0x394e62), x, y, z + .028);
  add(parent, G('windowMullion', () => new THREE.BoxGeometry(.035, 1, .035)),
    mat(0xecd7ab), x, y + height * .46, z + .044).scale.y = height * .85;
}

/* 轻微内收的蓝瓦尖顶比直锥更接近参考图中的童话城堡。 */
export function addSpire(parent, x, y, z, radius, height, color = 0x2f6eb2) {
  const roof = add(parent, G(`spire:${radius}:${height}`, () => new THREE.LatheGeometry([
    new THREE.Vector2(radius, 0), new THREE.Vector2(radius * 1.02, .10),
    new THREE.Vector2(radius * .84, height * .16), new THREE.Vector2(radius * .46, height * .52),
    new THREE.Vector2(radius * .15, height * .84), new THREE.Vector2(0, height),
  ], 20)), mat(color), x, y, z);
  add(parent, G('spireEave' + radius, () => new THREE.CylinderGeometry(radius, radius * 1.04, .12, 20)),
    mat(0x75a0c5), x, y, z);
  for (let k = 1; k <= 3; k++) {
    const f = k / 4, r = radius * (1 - f) * .9;
    add(parent, G(`spireSeam:${r}`, () => new THREE.TorusGeometry(r, .018, 4, 20)),
      mat(0x477eac), x, y + height * f * .82, z).rotation.x = Math.PI / 2;
  }
  add(parent, G('spireFinial', () => new THREE.SphereGeometry(.085, 10, 8)), mat(0xe7b85d), x, y + height, z);
  add(parent, G('spireNeedle', () => new THREE.ConeGeometry(.04, .48, 6)), mat(0xe7b85d), x, y + height + .2, z);
  return roof;
}
