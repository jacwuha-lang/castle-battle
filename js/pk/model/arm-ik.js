import * as THREE from '../../../vendor/three.module.min.js';
import { clamp } from './pose-curves.js';

const inverse = new THREE.Matrix4(), desired = new THREE.Vector3(), direction = new THREE.Vector3();
const elbow = new THREE.Vector3(), pole = new THREE.Vector3(), lower = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0), q = new THREE.Quaternion(), parent = new THREE.Quaternion();
const rotation = new THREE.Matrix4();

// 两段手臂的几何解：武器握把仍在手中，不能直接把刀或盾移离手掌。
export function aimHand(g, suffix, worldPoint, weight = 1) {
  const rig = g.userData.rig, arm = rig['arm' + suffix], fore = rig['fore' + suffix];
  g.updateMatrixWorld(true);
  inverse.copy(arm.parent.matrixWorld).invert();
  desired.copy(worldPoint).applyMatrix4(inverse).sub(arm.position);
  const distance = clamp(desired.length(), .075, .585), upperLength = .31, lowerLength = .28;
  direction.copy(desired).normalize();
  // 优先保留动画的肘部所在平面，避免手到目标时肘关节突然翻面。
  elbow.set(0, -.31, 0).applyQuaternion(arm.quaternion);
  pole.copy(elbow).addScaledVector(direction, -elbow.dot(direction));
  if (pole.lengthSq() < .00001) pole.set(0, 0, suffix === 'R' ? 1 : -1).addScaledVector(direction, -direction.z * (suffix === 'R' ? 1 : -1));
  pole.normalize();
  const cos = clamp((upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance), -1, 1);
  elbow.copy(direction).multiplyScalar(cos * upperLength).addScaledVector(pole, Math.sqrt(1 - cos * cos) * upperLength);
  q.setFromUnitVectors(down, elbow.clone().normalize()); arm.quaternion.slerp(q, weight);
  lower.copy(direction).multiplyScalar(distance).sub(elbow);
  lower.applyQuaternion(arm.quaternion.clone().invert()).normalize();
  q.setFromUnitVectors(down, lower); fore.quaternion.slerp(q, weight);
  g.updateMatrixWorld(true);
}

export function orientInWorld(node, worldQuaternion, weight = 1) {
  node.parent.updateWorldMatrix(true, false);
  parent.setFromRotationMatrix(rotation.extractRotation(node.parent.matrixWorld));
  q.copy(parent).invert().multiply(worldQuaternion);
  node.quaternion.slerp(q, weight);
  node.updateWorldMatrix(false, true);
}
