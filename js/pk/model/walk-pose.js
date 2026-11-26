import { clamp, ease, mix } from './pose-curves.js';

const TAU = Math.PI * 2, THIGH = .34, SHIN = .26;
const wrap = n => ((n % 1) + 1) % 1;

// 支撑期脚掌相对身体向后走，摆腿期才抬脚；不再把整条腿当钟摆。
function foot(cycle, reach, weight, direction) {
  const contact = .56, p = wrap(cycle);
  let x, lift, pitch;
  if (p < contact) {
    const k = p / contact;
    x = reach * (1 - 2 * k); lift = 0;
    pitch = .16 * (1 - ease(k / .20)) - .24 * ease((k - .72) / .28);
  } else {
    const k = (p - contact) / (1 - contact);
    x = mix(-reach, reach, ease(k));
    lift = .13 * Math.pow(Math.sin(k * Math.PI), 2);
    pitch = mix(-.24, .16, ease(k));
  }
  pitch *= weight * direction;
  return { x: x * weight * direction, y: .065 + lift * weight + Math.abs(pitch) * .085, pitch };
}

function solveLeg(p, suffix, target, hipHeight, offset) {
  const x = target.x - offset, y = target.y - (hipHeight - .02);
  const z = target.z || 0, down = Math.hypot(y, z);
  const distance = clamp(Math.hypot(x, down), .18, THIGH + SHIN - .001);
  const knee = -Math.acos(clamp((distance * distance - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const hip = Math.atan2(x, down) - Math.atan2(SHIN * Math.sin(knee), THIGH + SHIN * Math.cos(knee));
  p['leg' + suffix] = hip; p['knee' + suffix] = knee;
  p['legSide' + suffix] = Math.atan2(-z, -y);
  p['ankle' + suffix] = target.pitch - hip - knee;
}

export function walkPose(data, walk, dt, time) {
  const phase = data.phase || 0, hasShield = data.hasShield;
  const speed = Math.max(0, data.motionSpeed ?? walk * 1.4);
  const desired = clamp(walk * 1.10);
  data.gaitWeight = mix(data.gaitWeight ?? 0, desired, 1 - Math.exp(-dt * (desired > (data.gaitWeight || 0) ? 8 : 11)));
  const weight = data.gaitWeight;
  data.pivotWeight = mix(data.pivotWeight || 0, data.turnStep || 0, 1 - Math.exp(-dt * 10));
  const pivot = data.pivotWeight * (1 - weight), active = Math.max(weight, pivot * .58);
  // 完整周期走过的距离固定，步频跟距离走；不同个体只错开相位。
  const cycleDistance = .92;
  data.gait = (data.gait ?? phase / TAU) + dt * (speed / ((data.scaleBase || 1) * cycleDistance) + pivot * 1.65);
  data.gaitFacing = mix(data.gaitFacing ?? 1, data.gaitDirection ?? 1, 1 - Math.exp(-dt * 9));
  data.gaitLateral = mix(data.gaitLateral || 0, data.gaitStrafe || 0, 1 - Math.exp(-dt * 9));
  const cycle = wrap(data.gait), ph = cycle * TAU, direction = data.gaitFacing;
  const hipHeight = mix(.677, .650 - .018 * Math.cos(ph * 2), active);
  const right = foot(cycle, cycleDistance * .56 / 2, weight, direction);
  const left = foot(cycle + .5, cycleDistance * .56 / 2, weight, direction);
  right.z = foot(cycle, cycleDistance * .56 / 2, weight, data.gaitLateral).x;
  left.z = foot(cycle + .5, cycleDistance * .56 / 2, weight, data.gaitLateral).x;
  const pivotR = Math.pow(Math.max(0, Math.sin(ph)), 2), pivotL = Math.pow(Math.max(0, -Math.sin(ph)), 2);
  right.y += pivot * .075 * pivotR; left.y += pivot * .075 * pivotL;
  data.footContacts = active < .12 ? [true, true] : pivot > weight
    ? [pivotR < .06, pivotL < .06] : [cycle < .56, wrap(cycle + .5) < .56];
  data.footPitch = [right.pitch, left.pitch];
  right.x += .035 * (1 - weight); left.x -= .035 * (1 - weight);
  const breath = Math.sin(time * 2.2 + phase);
  const p = {
    armR: .28 - .22 * weight * Math.cos(ph - .3), foreR: 1 + .08 * weight * Math.sin(ph - .55),
    armL: hasShield ? .42 + .035 * weight * Math.cos(ph - .25) : .12 + .25 * weight * Math.cos(ph - .3),
    foreL: hasShield ? 1.55 : .35 + .07 * weight * Math.sin(ph - .55),
    lean: .015 + .055 * weight * direction, roty: -.045 * weight * Math.cos(ph - .22),
    hipsY: hipHeight - .73, hipTurn: .055 * weight * Math.cos(ph),
    roll: .014 * weight * Math.sin(ph) - clamp(data.turnRate || 0, -2, 2) * .018 * weight,
    bodyY: breath * .003 * (1 - weight), bodyX: .009 * weight * Math.sin(ph * 2),
    bodyZ: .013 * weight * Math.sin(ph), bodyTilt: 0,
    headNod: breath * .007 - .007 * weight * Math.sin(ph * 2 - .35),
    bladeAngle: -1.25, armDepth: -.08, bowDraw: 0, bowAngle: 0, lookYaw: 0,
  };
  solveLeg(p, 'R', right, hipHeight, .015); solveLeg(p, 'L', left, hipHeight, -.015);
  p.legSideR += pivot * .10 * Math.sin(ph); p.legSideL -= pivot * .10 * Math.sin(ph);
  return { pose: p, amp: weight, phase: ph };
}
