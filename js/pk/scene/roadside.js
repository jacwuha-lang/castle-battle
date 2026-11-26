import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from '../model/shared.js';
import { buildTree, buildBush } from '../model/scenery.js';
import { bannerMaterial } from '../model/heraldry.js';
import { seededRandom, instances } from './instancing.js';

function grassGeometry() {
  const positions = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 2.399, x = Math.cos(a) * .1, z = Math.sin(a) * .1, h = .18 + i % 3 * .065;
    positions.push(x - .036, 0, z, x + .036, 0, z, x + Math.cos(a) * .1, h, z + Math.sin(a) * .08);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals(); return g;
}
function flowerGeometry() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const petal = add(g, G('daisyPetal', () => new THREE.SphereGeometry(1, 6, 4)), mat(0xffffff),
      Math.cos(a) * .047, .006, Math.sin(a) * .047);
    petal.scale.set(.047, .014, .028); petal.rotation.y = -a;
  }
  bakeGroup(g);
  return g.children[0].geometry;
}

export function buildRoadside(world) {
  const scene = world.scene, rnd = seededRandom(174);
  // 两层树群，中间让出主堡的门楼和尖顶。
  for (let i = 0; i < 56; i++) {
    const x = -71 + i * 2.55 + rnd() * .9;
    const z = -9 - rnd() * 9;
    if (Math.abs(x) < 5 && z < -13) continue;
    const tree = buildTree(rnd()); tree.position.set(x, 0, z);
    tree.scale.multiplyScalar(1.1 + rnd() * .7);
    tree.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(tree);
  }
  for (let i = 0; i < 50; i++) {
    const bush = buildBush(rnd()); bush.position.set(-70 + rnd() * 140, .01, -4.9 - rnd() * 3.2);
    bush.scale.setScalar(.8 + rnd() * .7); scene.add(bush);
  }
  const grass = [], flowers = [], centers = [], rocks = [], posts = [], rails = [], nails = [];
  const greens = [0x6c923b, 0x87a946, 0xa3bd5e, 0xb6ca6d];
  for (let i = 0; i < 1900; i++) {
    const s = i % 2 ? 1 : -1, size = .6 + rnd() * .8;
    grass.push({ x: -72 + rnd() * 144, y: .012, z: s * (4.16 + rnd() * 3.4),
      sx: size, sy: size * (s > 0 ? .7 : 1), sz: size, ry: rnd() * 6.28, c: greens[i % 4] });
  }
  for (let i = 0; i < 220; i++) {
    const x = -70 + rnd() * 140, z = (i % 2 ? 1 : -1) * (4.5 + rnd() * 2.1);
    const size = .75 + rnd() * .8;
    flowers.push({ x, y: .1, z, sx: size, sy: 1, sz: size, c: i % 5 ? 0xfff5dc : 0xd9b2e0 });
    centers.push({ x, y: .125, z, sx: size, sz: size, c: 0xe8ba50 });
  }
  for (let i = 0; i < 110; i++) {
    const size = .12 + rnd() * .5;
    rocks.push({ x: -70 + rnd() * 140, y: size * .29, z: (i % 3 ? -1 : 1) * (4.5 + rnd() * 2.3),
      sx: size, sy: size * .6, sz: size * .8, ry: rnd() * 6, c: [0x8b927d, 0xa8a890, 0xbab6a1][i % 3] });
  }
  for (let x = -66; x < 67; x += 1.4) {
    if (Math.abs(x % 19) < 4) continue;
    const z = -5.4;
    posts.push({ x, y: .36, z, ry: rnd() * .1, sx: 1, sy: .9 + rnd() * .2, sz: 1 });
    [.26, .54].forEach(y => {
      rails.push({ x: x + .7, y, z, sx: 1.42, rz: (rnd() - .5) * .06 });
      nails.push({ x, y, z: z + .078 });
    });
  }
  scene.add(instances(grassGeometry(), mat(0xffffff, { side: THREE.DoubleSide }), grass));
  scene.add(instances(flowerGeometry(), mat(0xffffff), flowers));
  scene.add(instances(new THREE.SphereGeometry(.021, 7, 5), mat(0xffffff), centers));
  scene.add(instances(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff, { flatShading: true }), rocks));
  scene.add(instances(new THREE.BoxGeometry(.14, .73, .14), mat(0x7d5a3b), posts));
  scene.add(instances(new THREE.BoxGeometry(1, .105, .08), mat(0xa08050), rails));
  scene.add(instances(new THREE.SphereGeometry(.017, 6, 4), mat(0x514d45), nails));
  // 高杆纹章旗沿战线分布，始终在可行走区域外。
  for (let i = 0; i < 10; i++) {
    const x = -59 + i * 13.1;
    const pole = new THREE.Group(); pole.position.set(x, 0, -6.1);
    add(pole, G('roadFlagPole', () => new THREE.CylinderGeometry(.033, .047, 3.2, 8)), mat(0x775332), 0, 1.6, 0);
    add(pole, G('roadFlagFinial', () => new THREE.OctahedronGeometry(.09)), mat(0xe8bd63), 0, 3.28, 0);
    add(pole, G('roadFlagCrossbar', () => new THREE.BoxGeometry(.95, .05, .05)), mat(0xc6a66b), .38, 2.91, 0);
    add(pole, G('roadHeraldicFlag', () => new THREE.PlaneGeometry(.76, 1.08, 4, 8)),
      bannerMaterial(x < 0 ? 0 : 1), .38, 2.34, .016);
    bakeGroup(pole); scene.add(pole);
    world.registerCampBanners(pole, x < 0 ? 0 : 1);
  }
}
