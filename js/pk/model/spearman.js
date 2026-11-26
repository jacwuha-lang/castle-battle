import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';

/* 长矛和投掷兵短矛，使用各自的长度与备用武器。 */
export function addSpearEquipment({ kind, weapon, torso, wood, metal }) {
      // 和剑使用相同的持握角：矛尖沿人物前方，而不是朝向身后。
      weapon.rotation.z = -2.18;
      const length = kind === 'spearman' ? 1.5 : 0.78;
      add(weapon, G('rolePole' + length, () => new THREE.CylinderGeometry(0.022, 0.025, length, 7)), wood, 0, 0.26, 0);
      const point = add(weapon, G('rolePoint', () => new THREE.ConeGeometry(0.075, 0.22, 4)), metal, 0, 0.26 + length / 2 + 0.08, 0);
      point.scale.z = 0.45;
      if (kind === 'thrower') {
        const bundle = add(torso, G('roleBundle', () => new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6)), wood, -0.16, 0.05, -0.15);
        bundle.rotation.z = -0.3;
      }
}
