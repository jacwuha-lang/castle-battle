import * as THREE from '../../../vendor/three.module.min.js';
import { SHIELD_FACING_YAW } from './shield.js';
import { clamp, mix } from './pose-curves.js';
import { meleePose } from './melee-pose.js';
import { rangedPose, poseRangedEquipment } from './ranged-pose.js';
import { walkPose } from './walk-pose.js';
import { mixPose } from './pose-mixer.js';
import { placeFeet } from './foot-placement.js';

const KEYS = ['legR', 'legL', 'kneeR', 'kneeL', 'ankleR', 'ankleL', 'armR', 'foreR', 'armL', 'foreL',
  'lean', 'roty', 'bodyY', 'bodyTilt', 'hipsY', 'bodyX', 'bodyZ', 'roll', 'hipTurn', 'headNod',
  'bladeAngle', 'armDepth', 'bowDraw', 'bowAngle', 'lookYaw', 'legSideR', 'legSideL'];
const parentQ = new THREE.Quaternion(), desiredQ = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

// 控制器只负责步态、过渡和骨架；各兵种动作在 melee/ranged-pose 中维护。
export function poseSoldier(g, walk, st, k, t) {
  const data = g.userData, rig = data.rig;
  if (!rig) return;
  const body = data.body || (data.body = g.getObjectByName('body'));
  if (data.cape === undefined) data.cape = g.getObjectByName('generalCape') || g.getObjectByName('soldierCape') || null;
  const phase = data.phase || 0;
  const dt = clamp(data.lastT == null ? .016 : t - data.lastT, .001, .1);
  data.lastT = t;
  if (data.poseAction !== st) {
    if (st === 'recover') data.recoverFrom = data.ps ? { ...data.ps } : null;
    data.poseAction = st;
  }
  const hasShield = data.hasShield ?? (data.hasShield = !!rig.shield);
  const gait = walkPose(data, walk, dt, t), p = gait.pose, amp = gait.amp, ph = gait.phase;
  const legs = {};
  const legKeys = ['legR', 'legL', 'kneeR', 'kneeL', 'ankleR', 'ankleL', 'legSideR', 'legSideL', 'hipsY'];
  legKeys.forEach(key => { legs[key] = p[key]; });
  data.guardWeight = mix(data.guardWeight || 0, data.combatReady || 0, 1 - Math.exp(-dt * 8));
  p.armR = mix(p.armR, .44, data.guardWeight * .55);
  p.armL = mix(p.armL, hasShield ? .6 : .3, data.guardWeight * .55);
  const ranged = !['charge', 'general'].includes(data.kind);
  if (ranged) rangedPose(p, st, k, data);
  // 防御和受击同样适用于远程兵，出手时保持本兵种的武器动作。
  if (!ranged || ['recover', 'hurt', 'block', 'dodge'].includes(st)) meleePose(p, st, k, data);
  if (data.kind === 'mage' && st !== 'walk') {
    p.legR *= .26; p.legL *= .26; p.kneeR *= .3; p.kneeL *= .3;
  }

  // 支撑脚的前向运动学决定髋高，避免屈膝时整个人悬空。
  const footY = (leg, knee) => -.02 - .34 * Math.cos(leg) - .26 * Math.cos(leg + knee) - .065;
  if (st !== 'walk') {
    p.hipsY = -.73 - Math.min(footY(p.legR, p.kneeR), footY(p.legL, p.kneeL)) + .008;
    p.ankleR = clamp(-(p.legR + p.kneeR), -.65, .7);
    p.ankleL = clamp(-(p.legL + p.kneeL), -.65, .7);
    if (st !== 'leap' && st !== 'dodge') legKeys.forEach(key => { p[key] = mix(p[key], legs[key], clamp(amp * 1.15)); });
  }
  data.lookYaw = mix(data.lookYaw || 0, data.aimYaw || 0, 1 - Math.exp(-dt * 14));
  p.roty += data.lookYaw * .5; p.hipTurn += data.lookYaw * .14; p.lookYaw = data.lookYaw * .38;
  // 命中只由服务器决定；这里的冲击弹性只作用于关节和衣物。
  const impactAge = data.impactAt == null ? 10 : Math.max(0, t - data.impactAt);
  const recoil = Math.sin(impactAge * 36) * Math.exp(-impactAge * 15) * (data.impactPower || 0);
  p.headNod += recoil * .08; p.roll += recoil * .025;
  p.bodyZ += Math.sin(t * 2.2 + phase) * .003;
  const ps = mixPose(data, p, KEYS, st, t, dt);
  ['legR', 'legL', 'kneeR', 'kneeL', 'ankleR', 'ankleL', 'armR', 'foreR', 'armL', 'foreL'].forEach(n => {
    if (rig[n]) rig[n].rotation.z = ps[n];
  });
  rig.armR.rotation.set(ps.armDepth, 0, ps.armR); rig.foreR.rotation.set(0, 0, ps.foreR);
  rig.armL.rotation.set(.045 + amp * Math.sin(ph) * .025, 0, ps.armL); rig.foreL.rotation.set(0, 0, ps.foreL);
  rig.ankleR.rotation.set(0, 0, ps.ankleR); rig.ankleL.rotation.set(0, 0, ps.ankleL);
  rig.legR.rotation.x = ps.legSideR; rig.legL.rotation.x = ps.legSideL;
  rig.hips.position.y = .73 + ps.hipsY;
  rig.hips.rotation.y = ps.hipTurn;
  rig.torso.rotation.set(ps.roll, ps.roty, -ps.lean);
  rig.head.rotation.set(-ps.roll * .3, -ps.roty * .3 - ps.hipTurn * .2 + ps.lookYaw, ps.headNod + ps.lean * .25);
  body.position.set(ps.bodyX, ps.bodyY, ps.bodyZ);
  body.rotation.z = -ps.bodyTilt;
  if (rig.sword && rig.sword.visible) rig.sword.rotation.set(0, 0, ps.bladeAngle - ps.armR - ps.foreR + ps.lean + ps.bodyTilt);
  if (ranged) poseRangedEquipment(g, ps, st, k);
  if (data.cape) {
    data.cape.rotation.y = -ps.roty * .2 + Math.sin(t * 3.4 + phase) * (.025 + amp * .05);
    data.cape.rotation.z = -amp * .08 - recoil * .035;
  }
  if (data.kind === 'mage') {
    if (!data.mageBits) data.mageBits = { orb: g.getObjectByName('mageOrb'), ring: g.getObjectByName('mageRing') };
    const cast = st === 'shot' ? Math.sin(clamp(k) * Math.PI) : 0;
    if (data.mageBits.orb) data.mageBits.orb.scale.setScalar(1 + Math.sin(t * 5 + phase) * .07 + cast * .28);
    if (data.mageBits.ring) data.mageBits.ring.rotation.set(Math.PI / 2, t * .65, .1 * Math.sin(t * 2));
  }
  if (rig.shield) {
    rig.shield.position.set(-.05, -.3, .02);
    // 抵消完整父级姿态，增加肩胯三维扭动后盾牌仍竖直挡在身前。
    parentQ.copy(body.quaternion).multiply(rig.hips.quaternion).multiply(rig.torso.quaternion)
      .multiply(rig.armL.quaternion).multiply(rig.foreL.quaternion);
    desiredQ.setFromAxisAngle(up, (data.facingSide ?? data.side) === 1 ? Math.PI - SHIELD_FACING_YAW : SHIELD_FACING_YAW);
    rig.shield.quaternion.copy(parentQ.invert().multiply(desiredQ));
  }
  placeFeet(g, st, dt);
}
