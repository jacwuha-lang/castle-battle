import * as THREE from '../../../vendor/three.module.min.js';

/* ---------------- 材质 / 几何缓存 ----------------
   同一个颜色只建一个材质，同一段骨头只建一份几何；
   士兵之间 clone 时材质和几何都是共享的，显存不会被几十个兵拖爆。 */
const _mats = new Map();
export function mat(color, opts) {
  const key = color + '|' + (opts ? JSON.stringify(opts) : '');
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
    _mats.set(key, m);
  }
  return m;
}

const _geos = new Map();
export function G(key, make) {
  let g = _geos.get(key);
  if (!g) { g = make(); _geos.set(key, g); }
  return g;
}

export function add(parent, geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x || 0, y || 0, z || 0);
  parent.add(m);
  return m;
}

/* ---------------- 静态部件合并 ----------------
   一个小兵拆开看是三十几个网格：头盔、眼睛、腮红、腰带、扣子……
   这些零件互相之间不会动，一个个画就是三十次 draw call，十几个兵就上千了。
   这里把「同一个关节下面的静态零件」烘成一整块几何，
   颜色写进顶点色，材质全场共用一份 —— 视觉一模一样，draw call 少一半。 */
const VCOL_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 32, specular: 0x25313b });

function mergeMeshes(parts) {
  let total = 0;
  const baked = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.applyMatrix4(p.matrix);
    baked.push({ g: g, c: p.color });
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const c = new THREE.Color();
  let o = 0;
  for (let k = 0; k < baked.length; k++) {
    const g = baked[k].g;
    const P = g.attributes.position, N = g.attributes.normal;
    c.setHex(baked[k].c);
    for (let i = 0; i < P.count; i++) {
      pos[o * 3] = P.getX(i); pos[o * 3 + 1] = P.getY(i); pos[o * 3 + 2] = P.getZ(i);
      nor[o * 3] = N.getX(i); nor[o * 3 + 1] = N.getY(i); nor[o * 3 + 2] = N.getZ(i);
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      o++;
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* 只合并「直接挂在某个关节下的静态网格」，子关节（手臂、腿）原样保留 */
export function bakeGroup(node) {
  const parts = [];
  for (let i = 0; i < node.children.length; i++) {
    const o = node.children[i];
    if (!o.isMesh || !o.material || !o.material.color) continue;
    if (o.material.map || o.material.transparent || o.material.side !== THREE.FrontSide) continue;
    o.updateMatrix();
    parts.push({ geo: o.geometry, color: o.material.color.getHex(), matrix: o.matrix.clone() });
  }
  if (parts.length < 2) return;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const o = node.children[i];
    if (o.isMesh && o.material && o.material.color && !o.material.map
      && !o.material.transparent && o.material.side === THREE.FrontSide) node.remove(o);
  }
  node.add(new THREE.Mesh(mergeMeshes(parts), VCOL_MAT));
}


