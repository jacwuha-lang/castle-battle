import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from '../model/shared.js';
import { buildCitadel } from './backdrop-castle.js';

function ridge(scene, z, color, height, seed) {
  const positions = [], colors = [];
  const base = new THREE.Color(color), c = new THREE.Color();
  for (let i = 0; i < 12; i++) {
    const x = -112 + i * 19, h = height * (.7 + .3 * Math.sin(i * 2.3 + seed));
    const apex = x + 5 + Math.sin(i + seed) * 3;
    const outline = [[x - 13, -2], [apex - 11, h * .28], [apex - 8, h * .35],
      [apex - 5, h * .61], [apex - 3, h * .67], [apex, h],
      [apex + 2, h * .88], [apex + 3.5, h * .63], [apex + 6, h * .52], [x + 20, -2]];
    const center = [apex + 1.5, h * .32];
    for (let n = 0; n < outline.length; n++) {
      c.copy(base).multiplyScalar([1.04, .95, .88, 1.06, .92][n % 5]);
      [outline[n], center, outline[(n + 1) % outline.length]].forEach((p, k) => {
        positions.push(p[0], p[1], z + (k === 1 ? 2 : 0)); colors.push(c.r, c.g, c.b);
      });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(mesh); return mesh;
}

function village(scene, x, z) {
  const g = new THREE.Group(); g.name = 'valleyVillage'; g.position.set(x, 0, z);
  const cube = G('villageCube', () => new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9 - 4, h = 1.2 + (i % 2) * .5;
    add(g, cube, mat(0xf0dfbb), a, h / 2, -i % 2).scale.set(1.5, h, 1.3);
    const roof = add(g, G('villageRoof', () => {
      const s = new THREE.Shape(); s.moveTo(-.92, 0); s.lineTo(.92, 0); s.lineTo(0, .9); s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false });
    }), mat(i % 2 ? 0x965346 : 0x587390), a, h, -.8 - i % 2);
    add(g, cube, mat(0x775440), a, h * .5, .67 - i % 2).scale.set(.09, h, .05);
    add(g, cube, mat(0x374750), a + .36, h * .6, .68 - i % 2).scale.set(.25, .38, .05);
    add(g, cube, mat(0x75604a), a - .5, h + .55, -.4 - i % 2).scale.set(.22, .9, .24);
  }
  add(g, G('windmillTower', () => new THREE.CylinderGeometry(.55, .9, 3.4, 12)), mat(0xead9b6), -5, 1.7, -1.5);
  add(g, G('windmillRoof', () => new THREE.ConeGeometry(.8, 1.1, 12)), mat(0x7e5548), -5, 3.85, -1.5);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .5;
    const sail = add(g, cube, mat(0xcbb88e), -5 + Math.sin(a) * .82, 3 + Math.cos(a) * .82, -.62);
    sail.scale.set(.28, 1.7, .08); sail.rotation.z = -a;
  }
  bakeGroup(g); scene.add(g);
}

export function buildValleySky(world) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const ctx = c.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 0, 256);
  [[0, '#397ed0'], [.5, '#529fdf'], [.75, '#a6d5f1'], [1, '#e7f0dc']].forEach(([t, color]) => grad.addColorStop(t, color));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(145, 32, 20),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  dome.position.y = -12; world.scene.add(dome);
  world.skyDome = dome;
  world.skyRidges = [ridge(world.scene, -82, 0x99bbd4, 18, 1),
    ridge(world.scene, -61, 0x7e9fb9, 15, 3), ridge(world.scene, -44, 0x7093a2, 8.5, 4)];
  world.scene.add(buildCitadel());
  village(world.scene, -24, -19); village(world.scene, 25, -22);
  const geo = G('cloudPuff', () => new THREE.SphereGeometry(1, 12, 10));
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const puff = add(cloud, geo, mat(k === 0 ? 0xdceaf2 : 0xfffdf3), k * 1.05 - 2,
        Math.sin(k * 1.7 + i) * .4, 0);
      puff.scale.set(1.25, .68 + Math.sin(k + i) * .17, .65);
    }
    bakeGroup(cloud);
    cloud.children.forEach(m => { if (m.material) m.material = m.material.clone(); });
    cloud.position.set(-50 + i * 9, 13 + Math.sin(i * 4) * 3, -30 - (i % 3) * 13);
    cloud.userData.spd = .12 + (i % 3) * .04;
    world.scene.add(cloud); world.clouds.push(cloud);
  }
}
