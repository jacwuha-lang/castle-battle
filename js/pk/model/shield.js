import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';
import { addCrest } from './heraldry.js';

export const SHIELD_FACING_YAW = 0.95;

export function addShield({ kind, t2, t3, foreL, T, side }) {
  /* ---- 盾（tier2 起）：挂在左前臂，姿态更新时抵消手臂转角 ---- */
  if (t2 && (kind === 'charge' || kind === 'general')) {
    const shield = new THREE.Group();
    shield.name = 'shield';
    shield.position.set(-0.05, -0.3, 0.02);
    shield.rotation.y = side === 1 ? Math.PI - SHIELD_FACING_YAW : SHIELD_FACING_YAW;
    foreL.add(shield);
    const size = t3 ? 1.12 : 1;
    const outline = () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.19, 0.22);
      shape.quadraticCurveTo(0, 0.29, 0.19, 0.22);
      shape.lineTo(0.2, -0.09);
      shape.quadraticCurveTo(0.18, -0.22, 0, -0.34);
      shape.quadraticCurveTo(-0.18, -0.22, -0.2, -0.09);
      shape.closePath();
      return shape;
    };
    add(shield, G('shieldHeater' + size, () => {
      const plate = new THREE.ExtrudeGeometry(outline(), {
        depth: 0.065, bevelEnabled: true, bevelSegments: 1,
        steps: 1, bevelSize: 0.018, bevelThickness: 0.018, curveSegments: 5,
      });
      plate.scale(size, size, 1);
      return plate;
    }), mat(T.trim), 0, 0, -0.02);
    const details = new THREE.Group();
    details.name = 'shieldDetails';
    shield.add(details);
    add(details, G('shieldFace', () => new THREE.ExtrudeGeometry(outline(), {
      depth: 0.018, bevelEnabled: false, curveSegments: 5,
    })), mat(T.flag), 0, 0, 0.075).scale.set(size * 0.82, size * 0.84, 1);
    add(details, G('shieldInnerPlate', () => new THREE.ExtrudeGeometry(outline(), {
      depth: 0.012, bevelEnabled: false, curveSegments: 5,
    })), mat(T.cloth), 0, 0, 0.096).scale.set(size * 0.69, size * 0.72, 1);
    addCrest(details, side, .265 * size, 0, -.018, .119);
    [-1, 1].forEach((sign) => {
      add(details, G('shieldStud', () => new THREE.SphereGeometry(0.022, 7, 6)),
        mat(0xffe4a0), .16 * sign * size, .18 * size, 0.10).scale.set(0.72, 1, 0.8);
    });
  }

}
