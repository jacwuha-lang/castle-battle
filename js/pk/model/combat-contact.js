import * as THREE from '../../../vendor/three.module.min.js';
import { clamp, ease } from './pose-curves.js';
import { aimHand, orientInWorld } from './arm-ik.js';
import { LEFT_GATE, RIGHT_GATE } from '../scene/constants.js';

const point = new THREE.Vector3(), center = new THREE.Vector3(), normal = new THREE.Vector3();
const shoulder = new THREE.Vector3(), direction = new THREE.Vector3(), pole = new THREE.Vector3();
const hand = new THREE.Vector3(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const rotation = new THREE.Quaternion();
const HITS = { 1: 1, 2: .42 / .76, 3: .62 / .94, 8: .5 / .9, 11: .34 / .58 };

export function armorContact(target, attacker, blocked, out = new THREE.Vector3()) {
  const g = target.group, rig = g.userData.rig;
  g.updateMatrixWorld(true);
  if (blocked && rig.shield) return out.set(0, -.01, .12).applyMatrix4(rig.shield.matrixWorld);
  center.set(0, .18, 0).applyMatrix4(rig.torso.matrixWorld);
  normal.copy(attacker.group.position).sub(center); normal.y = 0; normal.normalize();
  attacker.group.updateMatrixWorld(true);
  attacker.group.userData.rig.armR.getWorldPosition(shoulder);
  center.y = clamp(center.y, shoulder.y - .26 * attacker.group.scale.x, shoulder.y + .18 * attacker.group.scale.x);
  return out.copy(center).addScaledVector(normal, .28 * g.scale.x);
}

function guard(u, units, now, dt) {
  const g = u.group, d = g.userData, shield = d.rig.shield;
  if (!shield) return;
  const recent = now - (d.contactBlockAt ?? -10) < .24;
  const enemy = units.get(recent ? d.contactBlockAttacker : u.foe);
  if (!enemy || (!recent && !d.combatReady)) {
    if (d.shieldYaw != null) {
      const desired = g.rotation.y + Math.PI / 2;
      const delta = Math.atan2(Math.sin(desired - d.shieldYaw), Math.cos(desired - d.shieldYaw));
      d.shieldYaw += clamp(delta, -8 * dt, 8 * dt);
    }
    return;
  }
  const weight = recent || u.stc === 4 ? 1 : .5;
  center.set(0, .18, 0).applyMatrix4(d.rig.torso.matrixWorld);
  normal.copy(enemy.group.position).sub(g.position); normal.y = 0; normal.normalize();
  point.copy(center).addScaledVector(normal, .43 * g.scale.x);
  aimHand(g, 'L', point, weight);
  const desired = Math.atan2(normal.x, normal.z);
  if (d.shieldYaw == null) {
    axis.set(0, 0, 1).applyQuaternion(shield.getWorldQuaternion(rotation));
    d.shieldYaw = Math.atan2(axis.x, axis.z);
  }
  const delta = Math.atan2(Math.sin(desired - d.shieldYaw), Math.cos(desired - d.shieldYaw));
  d.shieldYaw += clamp(delta, -12 * dt, 12 * dt);
  rotation.setFromAxisAngle(up, d.shieldYaw); orientInWorld(shield, rotation);
}

function strike(u, units, now) {
  const g = u.group, d = g.userData, hit = HITS[u.stc];
  if (d.strikeSerial !== d.attackCount) { d.strikeSerial = d.attackCount; d.strikeFoe = u.foe; }
  const age = now - (d.contactStrikeAt ?? -10), recent = age < .20;
  const enemy = units.get(recent ? d.contactStrikeTarget : d.strikeFoe);
  const gate = u.stc === 3 && !enemy;
  let weight = hit == null ? 0 : ease((u.k - hit + .30) / .30) * (1 - ease((u.k - hit) / .23));
  if (recent) weight = Math.max(weight, 1 - ease((age - .035) / .165));
  d.bladeContact = null;
  if (weight < .0001 || (!enemy && !gate)) return;
  if (enemy && Math.hypot(enemy.group.position.x - g.position.x, enemy.group.position.z - g.position.z)
      > .85 * (g.scale.x + enemy.group.scale.x) + .3) return;
  const rig = d.rig, weapon = rig.sword?.visible ? rig.sword : g.getObjectByName('roleWeapon');
  if (!weapon?.visible || d.kind === 'mage') return;
  const suffix = d.kind === 'archer' ? 'L' : 'R';
  if (enemy) armorContact(enemy, u, recent ? d.contactStrikeBlocked : enemy.stc === 4, point);
  else point.set(u.side ? LEFT_GATE : RIGHT_GATE, 1.1 * g.scale.x, g.position.z);
  rig['arm' + suffix].getWorldPosition(shoulder);
  // 小兵打将军时瞄胸甲下缘，不能把整个人抬进将军脸里。
  if (enemy && !(recent && d.contactStrikeBlocked)) point.y = clamp(point.y, shoulder.y - .26 * g.scale.x, shoulder.y + .18 * g.scale.x);
  direction.copy(point).sub(shoulder); const distance = direction.length(); direction.normalize();
  const bladeLength = rig.sword?.visible ? (u.tier >= 3 ? .78 : u.tier === 2 ? .72 : .66)
    : d.kind === 'spearman' ? 1.1 : d.kind === 'thrower' ? .82 : .48;
  const length = bladeLength * g.scale.x, armReach = .57 * g.scale.x;
  const cos = clamp(Math.max(.82, (distance ** 2 + length ** 2 - armReach ** 2) / (2 * Math.max(.01, distance) * length) + .025), 0, 1);
  pole.set(0, -1, 0).addScaledVector(direction, direction.y).normalize();
  axis.copy(direction).multiplyScalar(cos).addScaledVector(pole, Math.sqrt(1 - cos * cos)).normalize();
  hand.copy(point).addScaledVector(axis, -length);
  aimHand(g, suffix, hand, weight);
  rotation.setFromUnitVectors(up, axis); orientInWorld(weapon, rotation, weight);
  weapon.updateWorldMatrix(true, false);
  hand.set(0, bladeLength, 0).applyMatrix4(weapon.matrixWorld);
  d.bladeContact = { target: enemy?.id, blocked: recent ? !!d.contactStrikeBlocked : enemy?.stc === 4,
    weight, error: hand.distanceTo(point), point: point.clone() };
}

export function poseCombatContacts(units, now, dt) {
  units.forEach(u => guard(u, units, now, dt));
  units.forEach(u => strike(u, units, now));
  units.forEach(u => {
    const g = u.group, d = g.userData, rig = d.rig;
    const previous = d.contactArms || (d.contactArms = {});
    for (const name of ['armR', 'foreR', 'armL', 'foreL']) {
      const joint = rig[name], old = previous[name];
      if (old) {
        const delta = old.angleTo(joint.quaternion);
        if (delta > 24 * dt) joint.quaternion.copy(old.slerp(joint.quaternion, 24 * dt / delta));
      }
      previous[name] = joint.quaternion.clone();
    }
    g.updateMatrixWorld(true);
    if (rig.shield && d.shieldYaw != null) {
      rotation.setFromAxisAngle(up, d.shieldYaw); orientInWorld(rig.shield, rotation);
    }
  });
  units.forEach(u => {
    const g = u.group, d = g.userData, rig = d.rig;
    const contact = d.bladeContact;
    if (contact && contact.weight > .99) {
      const target = units.get(contact.target);
      if (target && contact.blocked) armorContact(target, u, true, contact.point);
      const weapon = rig.sword?.visible ? rig.sword : g.getObjectByName('roleWeapon');
      weapon.getWorldPosition(hand); axis.copy(contact.point).sub(hand).normalize();
      rotation.setFromUnitVectors(up, axis); orientInWorld(weapon, rotation);
      const bladeLength = rig.sword?.visible ? (u.tier >= 3 ? .78 : u.tier === 2 ? .72 : .66)
        : d.kind === 'spearman' ? 1.1 : d.kind === 'thrower' ? .82 : .48;
      hand.set(0, bladeLength, 0).applyMatrix4(weapon.matrixWorld);
      contact.error = hand.distanceTo(contact.point);
    }
  });
}
