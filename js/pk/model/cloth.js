import * as THREE from '../../../vendor/three.module.min.js';
import { G, mat, add, bakeGroup } from './shared.js';

/* 有厚度的褶皱披风：沿背部 -X 垂落，末端向后展开，给跑动留出双腿空间。 */
export function addCape(torso, T, general = false) {
  const group = new THREE.Group();
  group.name = general ? 'generalCape' : 'soldierCape';
  torso.add(group);
  const h = general ? .83 : .58, width = general ? .65 : .48;
  const geo = G('foldedCape' + general, () => {
    const g = new THREE.PlaneGeometry(width, h, 12, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const across = p.getX(i) / width, down = .5 - p.getY(i) / h;
      const z = across * width * (.7 + down * .4);
      const x = -.21 - down * down * .23 + Math.cos(across * Math.PI * 8) * (.013 + down * .022);
      const y = .32 - down * h + Math.cos(across * Math.PI * 4) * .018 * down;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
  add(group, geo, mat(T.cloth2, { side: THREE.DoubleSide }));
  for (let i = 0; i <= 12; i++) {
    const across = i / 12 - .5;
    const jewel = add(group, G('capeGoldStitch', () => new THREE.SphereGeometry(.012, 6, 4)),
      mat(T.trim), -.44 + Math.cos(across * Math.PI * 8) * .035,
      .32 - h + Math.cos(across * Math.PI * 4) * .018, across * width * 1.1);
    jewel.scale.set(1, .7, 1.9);
  }
  bakeGroup(group);
  return group;
}
