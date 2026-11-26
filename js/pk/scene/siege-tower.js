import * as THREE from '../../../vendor/three.module.min.js';
import { G, mat, add, bakeGroup } from '../model/shared.js';
import { bannerMaterial } from '../model/heraldry.js';

/* 远侧的攻城塔仅作布景，横梁、木板、轮轴与绳索单独塑形后批量合并。 */
export function buildSiegeTower(side) {
  const g = new THREE.Group(); g.name = 'decorSiegeTower';
  const wood = mat(0x96703f), dark = mat(0x60442d), iron = mat(0x5a6264);
  const cube = G('siegeCube', () => new THREE.BoxGeometry(1, 1, 1));
  const beam = (x, y, z, sx, sy, sz, material = wood, rz = 0) => {
    const m = add(g, cube, material, x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz; return m;
  };
  [-1, 1].forEach(s => {
    [-1, 1].forEach(q => {
      beam(s * .74, 1.7, q * .58, .19, 3.4, .19, dark, -s * .07);
      const wheel = add(g, G('siegeWheel', () => new THREE.CylinderGeometry(.38, .38, .16, 16)),
        dark, s * .85, .39, q * .83); wheel.rotation.x = Math.PI / 2;
      add(g, G('siegeIronRim', () => new THREE.TorusGeometry(.335, .025, 5, 16)),
        iron, s * .85, .39, q * .92);
      add(g, G('siegeWheelHub', () => new THREE.SphereGeometry(.085, 8, 6)),
        mat(0xc6a360), s * .85, .39, q * .93);
    });
    beam(0, 1.64, s * .60, .13, 2.9, .13, wood, s * .49);
    beam(s * .72, 2.9, 0, .14, .55, 1.56, dark);
  });
  [.72, 1.8, 2.72].forEach(y => {
    for (let i = 0; i < 7; i++) beam(-.84 + i * .28, y, 0, .25, .12, 1.65, i % 2 ? dark : wood);
  });
  for (let i = 0; i < 7; i++) beam(-.84 + i * .28, 3.02, .78, .24, .52, .12);
  [-1, 1].forEach(s => {
    beam(s * 1.0, 3.24, .78, .16, .22, .18, dark);
    for (let i = 0; i < 3; i++) beam(s * .98, 3.02, -.55 + i * .46, .13, .52, .4);
  });
  // 竖梯和小铆钉落在面向镜头的一侧。
  [-.22, .22].forEach(x => beam(x, 1.64, .85, .07, 2.4, .07, dark));
  for (let i = 0; i < 8; i++) beam(0, .55 + i * .28, .88, .5, .05, .08);
  [-.76, .76].forEach(x => [.8, 1.8, 2.7, 3.2].forEach(y => {
    add(g, G('siegeBolt', () => new THREE.SphereGeometry(.034, 6, 4)), iron, x, y, .78);
  }));
  add(g, G('siegeBanner', () => new THREE.PlaneGeometry(.71, 1.18)), bannerMaterial(side), .6, 2.28, .82);
  bakeGroup(g); return g;
}
