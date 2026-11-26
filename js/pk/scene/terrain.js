import * as THREE from '../../../vendor/three.module.min.js';
import { mat } from '../model/shared.js';
import { groundTexture } from '../model/ground-texture.js';
import { CASTLE_X } from '../model/castle.js';
import { seededRandom, instances } from './instancing.js';

export function buildTerrain(world) {
  const far = new THREE.Mesh(new THREE.PlaneGeometry(300, 230), mat(0x8ca55a));
  far.rotation.x = -Math.PI / 2; far.position.y = -.05; far.receiveShadow = true; world.scene.add(far);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(148, 30),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.scene.add(ground);
  [-1, 1].forEach(s => {
    const yard = new THREE.Mesh(new THREE.CircleGeometry(6.3, 40), mat(0xc6b083));
    yard.rotation.x = -Math.PI / 2; yard.position.set(s * CASTLE_X, .006, 0); yard.receiveShadow = true;
    world.scene.add(yard);
  });
  // 真正略高于路面的薄石片与路纹一起呈现，避免整条路像平面壁纸。
  const rnd = seededRandom(62), stones = [];
  for (let i = 0; i < 700; i++) {
    const x = -70 + rnd() * 140, z = (rnd() - .5) * 8.1;
    const size = .07 + rnd() * .18;
    stones.push({ x, y: .008, z, sx: size * (1.2 + rnd()), sy: .018 + rnd() * .018,
      sz: size, ry: rnd() * Math.PI, c: [0xc7ae83, 0xdac297, 0xc1b194, 0xe1cbab][i % 4] });
  }
  world.scene.add(instances(new THREE.CylinderGeometry(1, 1, 1, 6), mat(0xffffff), stones));
}
