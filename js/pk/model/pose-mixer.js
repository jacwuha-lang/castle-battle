import { clamp } from './pose-curves.js';

// 状态切换时保留原姿势和关节速度，余量按临界阻尼衰减；稳定动作不逐帧追赶目标。
export function mixPose(data, target, keys, state, time, dt) {
  if (!data.ps) {
    data.ps = { ...target }; data.poseVelocity = {};
    data.poseBlend = null; data.mixerAction = state; data.mixerSerial = data.attackCount;
    return data.ps;
  }
  const ps = data.ps, changed = data.mixerAction !== state || data.mixerSerial !== data.attackCount;
  if (changed) {
    const offset = {}, velocity = {};
    keys.forEach(key => { offset[key] = ps[key] - target[key]; velocity[key] = data.poseVelocity[key] || 0; });
    data.poseBlend = { offset, velocity, at: time, rate: state === 'walk' || state === 'recover' ? 25 : state === 'hurt' ? 36 : 30 };
    data.mixerAction = state; data.mixerSerial = data.attackCount;
  }
  const blend = data.poseBlend, age = blend ? time - blend.at : 0;
  keys.forEach(key => {
    const previous = ps[key];
    let value = target[key];
    if (blend && age < .4) {
      const offset = blend.offset[key], velocity = blend.velocity[key];
      value += (offset + (velocity + blend.rate * offset) * age) * Math.exp(-blend.rate * age);
    }
    ps[key] = value;
    data.poseVelocity[key] = clamp((value - previous) / dt, -30, 30);
  });
  if (blend && age >= .4) data.poseBlend = null;
  return ps;
}
