import * as THREE from '../../../vendor/three.module.min.js';
import { mat } from './shared.js';
import { addArcherEquipment } from './archer.js';
import { addSpearEquipment } from './spearman.js';

export function addRangedEquipment({ kind, sword, foreR, foreL, torso }) {
  if (kind === 'thrower' || kind === 'archer' || kind === 'spearman') {
    sword.visible = false;
    const weapon = new THREE.Group();
    weapon.name = 'roleWeapon';
    weapon.position.set(0, -0.28, 0);
    (kind === 'archer' ? foreL : foreR).add(weapon);
    const wood = mat(0x795037), metal = mat(0xdce9ef);
    if (kind === 'archer') {
      addArcherEquipment({ weapon, torso, wood, metal });
    } else {
      addSpearEquipment({ kind, weapon, torso, wood, metal });
    }
  }

}
