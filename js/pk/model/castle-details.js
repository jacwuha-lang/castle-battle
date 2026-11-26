import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';
import { addWindow } from './architecture.js';

/* 所有部件直接挂在城堡上，结算时仍可逐块坍塌。 */
export function addCastleDetails(g, { T, wallTop, towerH, lvl }) {
  const stone = mat(0xe4d3b4), shadow = mat(0x8b7459), gold = mat(0xf3ce78);
  const light = new THREE.MeshBasicMaterial({ color: 0xffcf73 });
  const accent = mat(T.roof);
  /* 镜头正对的墙面：石框、箭窗、门侧壁垛。 */
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.68;
    add(g, G('detailMasonryPier', () => new THREE.BoxGeometry(0.08, 2.6, 0.08)), stone, x, 1.65, 1.845);
    if (i !== 0) {
      add(g, G('detailArrowSlit', () => new THREE.BoxGeometry(0.11, 0.42, 0.025)), shadow, x + 0.28, 2.06, 1.855);
      add(g, G('detailWindowLight', () => new THREE.BoxGeometry(0.045, 0.24, 0.03)), light, x + 0.28, 2.06, 1.875);
    }
  }
  add(g, G('detailWallCornice', () => new THREE.BoxGeometry(3.7, 0.12, 0.13)), stone, 0, wallTop - 0.38, 1.85);
  add(g, G('detailWallTrim', () => new THREE.BoxGeometry(3.72, 0.045, 0.15)), gold, 0, wallTop - 0.48, 1.86);
  [-1, 1].forEach((sign) => {
    const x = sign * 1.62;
    add(g, G('detailTowerRing', () => new THREE.TorusGeometry(0.59, 0.035, 6, 16)), stone, x, towerH * 0.46, sign * 1.62).rotation.x = Math.PI / 2;
    add(g, G('detailTowerRing2', () => new THREE.TorusGeometry(0.59, 0.025, 6, 16)), gold, x, towerH - 0.23, sign * 1.62).rotation.x = Math.PI / 2;
    const peak = add(g, G('detailDormer', () => new THREE.ConeGeometry(0.18, 0.3, 4)), accent, x, towerH + 0.43, sign * 2.16);
    peak.rotation.y = Math.PI / 4;
  });
  // 有深度的拱形塔窗、窗棂与上下石檐。
  [-1, 1].forEach(s => {
    [-1, 1].forEach(q => {
      addWindow(g, s * 1.62, towerH - 1.28, q * 1.62 + .59, .22, .58);
      add(g, G('keepTowerCornice', () => new THREE.CylinderGeometry(.61, .64, .12, 18)),
        stone, s * 1.62, towerH - .08, q * 1.62);
    });
  });
  if (lvl >= 2) {
    [-1, 1].forEach((sign) => {
      add(g, G('detailTorchBase', () => new THREE.BoxGeometry(0.12, 0.24, 0.1)), shadow, sign * 1.45, 1.0, 1.91);
      const flame = add(g, G('detailTorchFlame', () => new THREE.ConeGeometry(0.08, 0.25, 7)), light, sign * 1.45, 1.23, 1.92);
      flame.rotation.z = sign * 0.08;
    });
  }
}
