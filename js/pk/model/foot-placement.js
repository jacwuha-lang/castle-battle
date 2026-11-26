import * as THREE from '../../../vendor/three.module.min.js';
import { clamp } from './pose-curves.js';

const inverse = new THREE.Matrix4(), point = new THREE.Vector3(), local = new THREE.Vector3();
const rotation = new THREE.Matrix4();
const parent = new THREE.Quaternion(), desired = new THREE.Quaternion(), pitchQ = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);

// 支撑与摆腿共用髋部空间目标；换脚只衰减目标余量，不延迟身体本身的运动。
function transitionFoot(foot, target, contact, dt) {
  if (foot.contact !== contact) {
    foot.offset = { x: foot.x - target.x, y: foot.y - target.y, z: foot.z - target.z };
    foot.age = 0; foot.contact = contact;
  }
  foot.age += dt;
  const fade = (1 + 32 * foot.age) * Math.exp(-32 * foot.age);
  for (const key of ['x', 'y', 'z']) foot[key] = target[key] + (foot.offset?.[key] || 0) * fade;
}

function legAngle(foot, key, target, dt) {
  const previous = foot[key] ?? target;
  // 只限制突发修正；正常步态直接使用解算值，保持支撑脚贴地。
  return foot[key] = previous + clamp(target - previous, -14 * dt, 14 * dt);
}

export function placeFeet(g, state, dt) {
  const data = g.userData, rig = data.rig;
  const free = state === 'leap' || state === 'dodge';
  const plants = data.footPlants || (data.footPlants = {}), contacts = data.footContacts || [true, true];
  const feet = data.footTargets || (data.footTargets = {});
  const footYaw = data.footYaw || (data.footYaw = [g.rotation.y, g.rotation.y]);
  g.updateWorldMatrix(true, false);
  data.body.updateWorldMatrix(false, false); rig.hips.updateWorldMatrix(false, false);
  inverse.copy(rig.hips.matrixWorld).invert();
  const scale = g.scale.x, yaw = g.rotation.y;
  ['R', 'L'].forEach((suffix, index) => {
    const leg = rig['leg' + suffix], knee = rig['knee' + suffix], ankle = rig['ankle' + suffix];
    leg.updateWorldMatrix(false, false); knee.updateWorldMatrix(false, false); ankle.updateWorldMatrix(false, false);
    point.setFromMatrixPosition(ankle.matrixWorld);
    let foot = feet[suffix];
    if (!foot) foot = feet[suffix] = { ...point.clone().applyMatrix4(inverse).sub(leg.position), contact: null, age: 0 };
    const contact = contacts[index] && !free;
    if (!contact) {
      delete plants[suffix];
    } else {
      let plant = plants[suffix];
      if (!plant) {
        local.set(foot.x, foot.y, foot.z).add(leg.position).applyMatrix4(rig.hips.matrixWorld);
        plant = plants[suffix] = { x: local.x, z: local.z, yaw: footYaw[index] };
      }
      const floor = .065 * scale + Math.abs(data.footPitch?.[index] || 0) * .085 * scale;
      local.set(plant.x, floor, plant.z).applyMatrix4(inverse).sub(leg.position);
      // 超出可达范围时渐移落点；不能把旧落点瞬间换成动画脚的位置。
      const release = clamp((local.length() - .60) / .06) * (1 - Math.exp(-dt * 14));
      plant.x += (point.x - plant.x) * release; plant.z += (point.z - plant.z) * release;
      point.set(plant.x, floor, plant.z);
    }
    local.copy(point).applyMatrix4(inverse).sub(leg.position);
    transitionFoot(foot, local, contact, dt);
    local.set(foot.x, foot.y, foot.z);
    const down = Math.hypot(local.y, local.z), reach = local.length();
    // 在伸直极限前柔化距离，避免 acos 在接近满伸时放大微小位置变化。
    const distance = Math.max(.18, reach > .585 ? .585 + .014 * Math.tanh((reach - .585) / .014) : reach);
    const bend = -Math.acos(clamp((distance * distance - .34*.34 - .26*.26) / (2*.34*.26), -1, 1));
    leg.rotation.x = legAngle(foot, 'side', Math.atan2(-local.z, -local.y), dt);
    leg.rotation.z = legAngle(foot, 'hip', Math.atan2(local.x, down) - Math.atan2(.26 * Math.sin(bend), .34 + .26 * Math.cos(bend)), dt);
    knee.rotation.z = legAngle(foot, 'knee', bend, dt);
    leg.updateWorldMatrix(false, false); knee.updateWorldMatrix(false, false);
    parent.setFromRotationMatrix(rotation.extractRotation(knee.matrixWorld));
    const wantedYaw = contact ? plants[suffix].yaw : yaw;
    const delta = Math.atan2(Math.sin(wantedYaw - footYaw[index]), Math.cos(wantedYaw - footYaw[index]));
    footYaw[index] += clamp(delta, -8 * dt, 8 * dt);
    desired.setFromAxisAngle(yAxis, footYaw[index]);
    pitchQ.setFromAxisAngle(zAxis, data.footPitch?.[index] || 0); desired.multiply(pitchQ);
    ankle.quaternion.copy(parent.invert().multiply(desired));
  });
}
