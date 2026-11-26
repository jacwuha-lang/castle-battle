import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from '../model/shared.js';
import { buildSiegeTower } from './siege-tower.js';

/* 所有攻城设施均为静态装饰；烟与火只更新视觉，不改变战斗。 */
function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(64, 64, 2, 64, 64, 60);
  grad.addColorStop(0, 'rgba(66,60,56,.82)');
  grad.addColorStop(.4, 'rgba(86,77,70,.48)');
  grad.addColorStop(1, 'rgba(100,88,80,0)');
  x.fillStyle = grad; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function beam(parent, x, y, z, sx, sy, sz, angle = 0) {
  const m = add(parent, G('warBeam', () => new THREE.BoxGeometry(1, 1, 1)), mat(0x785336), x, y, z);
  m.scale.set(sx, sy, sz); m.rotation.z = angle; return m;
}
function catapult(side) {
  const g = new THREE.Group(); g.name = 'decorCatapult';
  const rim = mat(0x5d402b), hub = mat(0xe1bf79);
  [-.48, .48].forEach((z) => {
    beam(g, 0, .36, z, 2.1, .16, .14);
    beam(g, -.25, 1.0, z, .16, 1.42, .16, -.42);
    beam(g, .35, 1.0, z, .16, 1.42, .16, .42);
    [-.72, .72].forEach((x) => {
      const wheel = add(g, G('warWheel', () => new THREE.TorusGeometry(.31, .065, 7, 16)), rim, x, .34, z);
      add(g, G('warHub', () => new THREE.CylinderGeometry(.09, .09, .13, 8)), hub, x, .34, z).rotation.x = Math.PI / 2;
      for (let k = 0; k < 4; k++) {
        const spoke = beam(g, x, .34, z, .055, .54, .06, Math.PI * k / 4);
        spoke.material = rim;
      }
    });
  });
  beam(g, 0, 1.45, 0, .15, .15, 1.12);
  const arm = beam(g, -.12, 1.64, 0, .18, 2.25, .19, -.86);
  arm.material = mat(0x9a6d40);
  const scoop = add(g, G('warBucket', () => new THREE.SphereGeometry(.26, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0x5e402e), .73, 2.37, 0);
  scoop.rotation.z = Math.PI;
  g.rotation.y = side ? Math.PI : 0;
  return g;
}
function tent(side) {
  const g = new THREE.Group(); g.name = 'decorTent';
  const canvas = mat(side ? 0xbe5850 : 0x5a82bb);
  add(g, G('warTentWall', () => new THREE.BoxGeometry(1.75, .95, 1.2)), mat(0xdfcba8), 0, .48, 0);
  const roof = add(g, G('warTentRoof', () => new THREE.ConeGeometry(1.28, 1.0, 4)), canvas, 0, 1.43, 0);
  roof.name = 'campTentRoof';
  roof.rotation.y = Math.PI / 4; roof.scale.z = .72;
  beam(g, 0, 1.45, 0, .06, 1.6, .06);
  const flag = add(g, G('warTentFlag', () => new THREE.PlaneGeometry(.44, .29)), mat(side ? 0xd96156 : 0x5b96e5, { side: THREE.DoubleSide }), .22, 2.05, 0);
  flag.name = 'campFlag';
  return g;
}
export const warDecorMethods = {
  buildWarDecor() {
    this.warSmoke = []; this.warFlames = [];
    const positions = [[-22, -7.5, 0], [-9, -7.7, 0], [9, -7.7, 1], [22, -7.5, 1]];
    const smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: .36, fog: true });
    positions.forEach(([x, z, side], i) => {
      const obj = i % 2 ? tent(side) : catapult(side);
      obj.position.set(x, 0, z); this.scene.add(obj);
      if (obj.name === 'decorTent') this.campDecor.push({ side, paint: faction => {
        obj.getObjectByName('campTentRoof').material = mat(faction ? 0xbe5850 : 0x5a82bb);
        obj.getObjectByName('campFlag').material = mat(faction ? 0xd96156 : 0x5b96e5, { side: THREE.DoubleSide });
      } });
      /* 烽火靠近后侧路缘，能从跟随士兵的镜头看到，不挡道路。 */
      const fx = x + (side ? -2.3 : 2.3), fz = -5.15;
      const embers = add(this.scene, G('warFireBase', () => new THREE.CylinderGeometry(.36, .43, .12, 9)), mat(0x604838), fx, .07, fz);
      embers.name = 'decorFire';
      const fire = new THREE.Group(); fire.position.set(fx, .1, fz); this.scene.add(fire);
      const outer = add(fire, G('warFire', () => new THREE.ConeGeometry(.25, .82, 8)), new THREE.MeshBasicMaterial({ color: 0xff793c }), 0, .38, 0);
      add(fire, G('warFireCore', () => new THREE.ConeGeometry(.14, .5, 8)), new THREE.MeshBasicMaterial({ color: 0xffdf75 }), 0, .25, .06);
      this.warFlames.push({ fire, outer, phase: i * 1.7 });
      for (let k = 0; k < 5; k++) {
        const puff = new THREE.Sprite(smokeMat); puff.position.set(fx, 1.0 + k * .9, fz);
        puff.scale.set(1.1 + k * .3, 1.3 + k * .3, 1); this.scene.add(puff);
        this.warSmoke.push({ puff, x: fx, z: fz, phase: i * 1.7 + k * 1.15, offset: k / 5 });
      }
    });
    [-16, 16].forEach((x, side) => {
      const tower = buildSiegeTower(side); tower.position.set(x, 0, -8.4);
      tower.rotation.y = side ? -.18 : .18; this.scene.add(tower);
      this.registerCampBanners(tower, side);
    });
    /* 近侧只留低矮木桩和碎石，不遮挡正在交战的角色。 */
    [-25, -13, 1, 14, 26].forEach((x, i) => {
      const debris = new THREE.Group(); debris.name = 'roadsideDebris';
      beam(debris, 0, .17, 0, 1.3, .16, .14, i % 2 ? .14 : -.1);
      beam(debris, .3, .18, .18, .8, .12, .12, -.3);
      const rock = add(debris, G('warRock', () => new THREE.DodecahedronGeometry(.3, 0)), mat(0xa79b7a, { flatShading: true }), -.5, .16, .1);
      rock.scale.set(1, .55, .8);
      debris.position.set(x, 0, 5.6); this.scene.add(debris);
    });
  },
  frameWarDecor(dt) {
    const t = this.time;
    this.warSmoke.forEach(({ puff, x, z, phase, offset }) => {
      const progress = (t * .10 + offset) % 1;
      puff.position.set(x + Math.sin(t * .55 + phase) * .28 + progress * .65, 1.0 + progress * 5.0, z);
      const size = 1.3 + progress * 2.2;
      puff.scale.set(size, size * 1.15, 1);
    });
    this.warFlames.forEach(({ fire, phase }) => {
      fire.scale.y = .85 + Math.sin(t * 8 + phase) * .12;
      fire.rotation.y = Math.sin(t * 2 + phase) * .1;
    });
  }
};
