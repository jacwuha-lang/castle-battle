import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';

/* 弓、搭在弦上的箭和背部箭筒。 */
export function addArcherEquipment({ weapon, torso, wood, metal }) {
      const bow = add(weapon, G('roleBow', () => new THREE.TorusGeometry(0.39, 0.025, 6, 20, Math.PI)), wood, 0, 0.12, 0);
      bow.rotation.z = -Math.PI / 2;
      ['bowStringUpper', 'bowStringLower'].forEach((name, i) => {
        const string = add(weapon, G('bowStringSegment', () => new THREE.CylinderGeometry(.008, .008, 1, 5)), mat(0xf2e3bb), 0, .12 + (i ? -.195 : .195), 0);
        string.scale.y = .39; string.name = name;
      });
      const arrow = new THREE.Group();
      arrow.name = 'nockedArrow';
      arrow.position.set(0.12, 0.12, 0.025);
      weapon.add(arrow);
      const shaft = add(arrow, G('nockedShaft', () => new THREE.CylinderGeometry(0.018, 0.018, 0.65, 6)), wood, 0, 0, 0);
      shaft.rotation.z = -Math.PI / 2;
      const point = add(arrow, G('nockedTip', () => new THREE.ConeGeometry(0.045, 0.12, 4)), metal, 0.38, 0, 0);
      point.rotation.z = -Math.PI / 2;
      const feather = add(arrow, G('nockedFeather', () => new THREE.BoxGeometry(0.13, 0.065, 0.016)), mat(0xf1eadb), -0.27, 0, 0);
      const quiver = add(torso, G('roleQuiver', () => new THREE.CylinderGeometry(0.085, 0.065, 0.42, 8)), wood, -0.16, 0.04, -0.17);
      quiver.rotation.z = 0.3;
}
