import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';

export function addMageEquipment({ kind, sword, foreR, hips, T }) {
  if (kind === 'mage') {
    /* ---- 方士的法杖 ----
       杆子竖着握在右手，顶端一颗会自己亮的法球 + 一圈转动的符环。
       法球用 MeshBasicMaterial：不吃光照，所以在阴天/雾里也是亮的，
       二十米外一眼就能看见「后排有人在放法术」。 */
    sword.visible = false;
    const staff = new THREE.Group();
    staff.name = 'roleWeapon';
    staff.position.set(0, -0.28, 0);
    /* 和剑同一个握角（-2.18）：不这么转，杆子会顺着小臂朝后倒 */
    staff.rotation.z = -2.18;
    foreR.add(staff);
    add(staff, G('magePole', () => new THREE.CylinderGeometry(0.026, 0.03, 1.02, 7)),
      mat(0x6b4a34), 0, 0.2, 0);
    /* 杆子上缠的铜箍 */
    [-0.1, 0.4].forEach((y, i) => {
      add(staff, G('mageBand' + i, () => new THREE.CylinderGeometry(0.036, 0.036, 0.04, 10)),
        mat(T.trim), 0, y, 0);
    });
    /* 杖头：托盘 + 法球 + 符环 */
    add(staff, G('mageCup', () => new THREE.CylinderGeometry(0.075, 0.045, 0.07, 10)),
      mat(T.trim), 0, 0.68, 0);
    const orb = add(staff, G('mageOrbGeo', () => new THREE.SphereGeometry(0.09, 14, 12)),
      new THREE.MeshBasicMaterial({ color: 0xa9f2ff }), 0, 0.79, 0);
    orb.name = 'mageOrb';
    const ring = add(staff, G('mageRing', () => new THREE.TorusGeometry(0.135, 0.014, 6, 18)),
      mat(T.trim), 0, 0.79, 0);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'mageRing';
    /* 挂在杖上的两条飘带 */
    [-1, 1].forEach((s) => {
      const ribbon = add(staff, G('mageRibbon', () => new THREE.PlaneGeometry(0.05, 0.3)),
        new THREE.MeshLambertMaterial({ color: T.flag, side: THREE.DoubleSide }), 0, 0.52, s * 0.05);
      ribbon.rotation.y = Math.PI / 2;
      ribbon.name = 'mageRibbon';
    });
    /* 腰后挂的符袋，凑近看有东西，远看只是个小色块 */
    add(hips, G('magePouch', () => new THREE.SphereGeometry(0.075, 10, 8)),
      mat(T.leather), -0.19, -0.1, 0.05);
  }

}
