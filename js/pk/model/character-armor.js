import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';
import { addCape } from './cloth.js';
import { addCrest } from './heraldry.js';

/* 公共衣甲在骨架的活动关节内组合，模型轮廓与战斗属性分别维护。 */
export function addCharacterArmor(hips, torso, { T, tier, kind, side }) {
  const mage = kind === 'mage', armored = tier >= 2 && !mage;
  const ranged = ['archer', 'spearman', 'thrower'].includes(kind);
  add(hips, G('knightPelvis', () => new THREE.CylinderGeometry(.19, .2, .18, 14)),
    mat(T.cloth2), 0, -.03, 0);
  if (mage) {
    add(hips, G('knightRobe', () => new THREE.CylinderGeometry(.2, .27, .70, 16)), mat(T.cloth), 0, -.32, 0);
    add(hips, G('knightRobeHem', () => new THREE.CylinderGeometry(.272, .272, .04, 16)), mat(T.trim), 0, -.65, 0);
  } else {
    add(hips, G('knightSkirt', () => new THREE.CylinderGeometry(.205, .248, .24, 16)), mat(T.cloth2), 0, -.09, 0);
    add(hips, G('knightSkirtHem', () => new THREE.CylinderGeometry(.248, .25, .027, 16)), mat(T.trim), 0, -.205, 0);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const plate = add(hips, G('knightTasset', () => new THREE.BoxGeometry(.04, .17, .125)),
        mat(armored && !ranged ? T.metal : T.cloth), Math.cos(a) * .218, -.12, Math.sin(a) * .218);
      plate.rotation.y = -a;
    }
  }
  add(torso, G('knightCuirass', () => new THREE.CylinderGeometry(.237, .19, .39, 18)),
    mat(T.cloth2), 0, .17, 0);
  const chest = add(torso, G('knightBreast', () => new THREE.SphereGeometry(1, 18, 12)),
    mat(armored && !ranged ? T.metal : T.cloth), .11, .205, 0);
  chest.scale.set(.16, .18, .23);
  const tabard = add(torso, G('knightTabard', () => new THREE.BoxGeometry(.028, .31, .21)),
    mat(T.cloth), .247, .14, 0);
  tabard.rotation.z = .07;
  [-1, 1].forEach(s => {
    add(torso, G('tabardBraid', () => new THREE.BoxGeometry(.032, .30, .014)),
      mat(T.trim), .26, .14, s * .104);
    add(torso, G('armorRivet', () => new THREE.SphereGeometry(.018, 7, 6)),
      mat(T.trim), .26, .3, s * .15);
  });
  const emblem = addCrest(torso, side, .15, .27, .19, 0);
  emblem.rotation.y = Math.PI / 2;
  add(torso, G('knightBelt', () => new THREE.CylinderGeometry(.224, .224, .062, 18)),
    mat(T.leather), 0, -.008, 0);
  add(torso, G('knightBuckle', () => new THREE.BoxGeometry(.04, .065, .075)),
    mat(T.trim), .226, -.008, 0);
  add(torso, G('knightCollar', () => new THREE.CylinderGeometry(.117, .157, .065, 18)),
    mat(armored ? T.metal : T.cloth), 0, .362, 0);
  add(torso, G('knightNeck', () => new THREE.CylinderGeometry(.08, .085, .10, 12)),
    mat(0xffd4ad), .006, .415, 0);
  if (!mage) [-1, 1].forEach(s => {
    const rim = add(torso, G('knightShoulderRim', () => new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, 1.7)),
      mat(tier >= 3 ? T.trim : T.metal), 0, .333, s * .24);
    rim.scale.set(.149, .09, .14);
    const pauldron = add(torso, G('knightShoulderTop', () => new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, 1.55)),
      mat(T.cloth), 0, .35, s * .24);
    pauldron.scale.set(.13, .088, .125);
  });
  if (tier >= 2 && tier < 4 && !mage) addCape(torso, T);
  if (side === 0 || tier >= 3) {
    const scarf = add(torso, G('knightScarf', () => new THREE.TorusGeometry(.125, .038, 6, 18)),
      mat(side === 0 ? 0xd94c43 : 0xf0c06d), .018, .386, 0);
    scarf.rotation.x = Math.PI / 2; scarf.scale.z = .7;
  }
}
