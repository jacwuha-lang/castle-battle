import * as THREE from '../../../vendor/three.module.min.js';
import { G, mat, add } from './shared.js';
import { archGeometry } from './architecture.js';

/* 门洞和木门都用同一拱形轮廓；部件留在城堡根节点以参与坍塌。 */
export function addCastleGate(g, { woodMat, stoneDark, T }) {
  const opening = add(g, archGeometry(1.44, 2.2, .04), mat(0x354049), 1.82, .12, 0);
  opening.rotation.y = Math.PI / 2;
  const door = add(g, archGeometry(1.21, 2.04, .04), woodMat, 1.87, .13, 0);
  door.rotation.y = Math.PI / 2; door.name = 'door';
  const arch = add(g, G('carvedGateArch', () => new THREE.TorusGeometry(.79, .12, 5, 22, Math.PI)),
    stoneDark, 1.98, 1.54, 0);
  arch.rotation.y = Math.PI / 2;
  for (let i = 0; i <= 8; i++) {
    const a = i / 8 * Math.PI;
    const block = add(g, G('gateVoussoir', () => new THREE.BoxGeometry(.27, .18, .12)),
      mat(i % 2 ? 0xe8d6b2 : 0xd8c29b), 2.0, 1.54 + Math.sin(a) * .79, Math.cos(a) * .79);
    block.rotation.x = a;
  }
  [-1, 1].forEach(s => {
    for (let k = 0; k < 4; k++) add(g,
      G('gateJamb', () => new THREE.BoxGeometry(.29, .34, .22)), stoneDark,
      1.97, .32 + k * .35, s * .78);
    [.58, 1.28].forEach(y => {
      add(g, G('gateHinge', () => new THREE.BoxGeometry(.04, .065, .48)), mat(0x525155), 1.94, y, s * .28);
    });
    add(g, G('gateDoorRing', () => new THREE.TorusGeometry(.055, .014, 5, 12)), mat(T.trim),
      1.96, .91, s * .13).rotation.y = Math.PI / 2;
  });
  for (let k = -2; k <= 2; k++) {
    const h = 1.55 + Math.sqrt(Math.max(0, .6 ** 2 - (k * .22) ** 2));
    add(g, G('gateGrille' + h, () => new THREE.BoxGeometry(.035, h, .032)),
      mat(0x665c48), 1.933, h / 2 + .12, k * .22);
  }
}
