import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from './shared.js';
import { addCape } from './cloth.js';

/* 将军的宽肩、金色层甲和长披风；专属面貌由 character-head 管理。 */
export function addGeneralArmor({ torso, hips, T, side }) {
  const armor = new THREE.Group(); armor.name = 'generalArmor'; torso.add(armor);
  [-1, 1].forEach(s => {
    for (let layer = 0; layer < 2; layer++) {
      const shoulder = add(armor, G('commanderShoulder', () => new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, 1.8)),
        mat(layer ? T.cloth : T.trim), -.014, .33 + layer * .026, s * .25);
      shoulder.scale.set(layer ? .158 : .18, layer ? .11 : .10, layer ? .151 : .17);
    }
    add(armor, G('generalClasp', () => new THREE.SphereGeometry(.034, 10, 8)), mat(T.trim), .17, .33, s * .16);
    for (let n = 0; n < 3; n++) {
      const scale = add(hips, G('commanderTasset', () => new THREE.BoxGeometry(.06, .09, .17)),
        mat(n % 2 ? T.trim : T.metal), .055 + n * .018, -.07 - n * .069, s * .196);
      scale.rotation.x = -s * .15;
    }
  });
  const sash = add(armor, G('commanderSash', () => new THREE.BoxGeometry(.035, .37, .07)),
    mat(side ? 0xe8ac56 : 0xe44f46), .273, .18, .032);
  sash.rotation.x = -.5;
  const brooch = add(armor, G('commanderGem', () => new THREE.OctahedronGeometry(.04)),
    mat(side ? 0xffd487 : 0x97e4f2), .3, .29, -.035); brooch.scale.x = .4;
  add(hips, G('commanderBelt', () => new THREE.CylinderGeometry(.229, .229, .035, 20)), mat(T.trim), 0, .02, 0);
  addCape(torso, T, true);
  bakeGroup(armor);
}
