import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from './shared.js';

const LEAF = [0x618a43, 0x7d9f48, 0x90ae58, 0xa7bd69];
const sphere = () => G('broadleafCrown', () => new THREE.SphereGeometry(1, 12, 9));

/* 圆冠阔叶树与分叉树干，日照面和背光面用不同的叶团塑形。 */
export function buildTree(seed = .5) {
  const g = new THREE.Group();
  const h = 1.15 + seed * .5;
  add(g, G('oakTrunk', () => new THREE.CylinderGeometry(.085, .16, 1, 9)),
    mat(0x785637), 0, h * .5, 0).scale.y = h;
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + seed;
    const branch = add(g, G('oakBranch', () => new THREE.CylinderGeometry(.04, .07, .7, 7)),
      mat(0x785637), Math.cos(a) * .18, h - .12, Math.sin(a) * .18);
    branch.rotation.z = Math.cos(a) * .5; branch.rotation.x = Math.sin(a) * .5;
  }
  for (let i = 0; i < 8; i++) {
    const a = i * 2.399 + seed * 3, r = i < 5 ? .51 : .28;
    const m = add(g, sphere(), mat(LEAF[i % 4]), Math.cos(a) * r,
      h + .17 + (i >= 5 ? .48 : Math.sin(a * 1.7) * .12), Math.sin(a) * r);
    m.scale.set(.6 + seed * .13, .52 + (i % 2) * .12, .55);
  }
  bakeGroup(g); g.rotation.y = seed * 6.283;
  return g;
}

export function buildBush(seed = .5) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = add(g, sphere(), mat(LEAF[(i + 1) % 4]), (i - 1.5) * .22,
      .18 + Math.sin(i + seed) * .06, Math.cos(i * 2 + seed) * .12);
    m.scale.set(.32, .24 + seed * .06, .31);
  }
  bakeGroup(g); return g;
}

export function buildRock(seed = .5) {
  const m = new THREE.Mesh(G('roadRock', () => new THREE.DodecahedronGeometry(1, 0)),
    mat(seed > .5 ? 0xbab6a1 : 0x969e8a, { flatShading: true }));
  m.scale.set(.36, .28, .32); m.rotation.set(seed * 3, seed * 5, seed * 2); m.position.y = .14;
  return m;
}
