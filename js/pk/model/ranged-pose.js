import { ease, mix, samplePose } from './pose-curves.js';

const KEYS = ['armR', 'foreR', 'armL', 'foreL', 'lean', 'roty', 'bodyX', 'bladeAngle'];
const THROW_IDLE = [.28, 1, .18, .35, .015, 0, 0, -1.25];
// 肩向上转、肘在头侧展开，矛先举到头顶再向前送出。
const THROW_LOAD = [2.7, .30, .45, .3, -.065, -.24, -.035, -.82];
const THROW_RELEASE = [1.12, .12, .22, .4, .18, .20, .10, -Math.PI / 2];
const BASH = [[0, .3, .9, .65, .25, 0, 0, 0, -.8],
  [.35, .75, .65, .8, .28, -.06, -.2, -.025, -.3],
  [.34 / .58, 1.10, .2, 1.12, .18, .18, .2, .085, -2.0],
  [1, ...THROW_IDLE]];

export function rangedPose(p, st, k, data) {
  const kind = data.kind;
  if (kind === 'mage') {
    p.armR = .16; p.foreR = 1.08; p.armL = .18; p.foreL = .7; p.bladeAngle = -.08;
  } else if (kind === 'archer') {
    p.armL = .70; p.foreL = .32; p.armR = .24; p.foreR = .75;
  }
  if (st === 'bash') {
    samplePose(p, KEYS, BASH, k);
    p.legR = .28; p.legL = -.26; p.kneeR = -.25; p.kneeL = -.12;
    p.bowAngle = -.58 * Math.sin(k * Math.PI);
  } else if (st === 'shot' || st === 'thrust') {
    const hit = st === 'thrust' ? .35 / .9 : .38 / .8;
    if (kind === 'archer') {
      const draw = k < hit ? ease(k / hit) : 1 - ease((k - hit) / .14);
      const settle = k < .76 ? 1 : 1 - ease((k - .76) / .24);
      p.armL = mix(.7, 1.27, settle); p.foreL = mix(.32, .12, settle);
      p.armR = mix(.24, .62, draw); p.foreR = mix(.75, 1.2, draw);
      p.armDepth = -.36 * draw; p.roty = -.15 * draw; p.hipTurn = .045 * draw;
      p.lean = -.035 * draw;
      p.bowDraw = k < hit ? draw : 1 - ease((k - hit) / .045);
    } else if (kind === 'mage') {
      const ready = k < hit ? ease(k / hit) : 1 - ease((k - hit) / (1 - hit));
      p.armR = mix(.16, .95, ready); p.foreR = mix(1.08, .55, ready);
      p.armL = mix(.18, .82, ready); p.foreL = mix(.7, .55, ready);
      p.bladeAngle = mix(-.08, -.8, ready);
      p.roty = .14 * ready; p.lean = .08 * ready; p.bodyX = .045 * ready;
    } else {
      samplePose(p, KEYS, [
        [0, ...THROW_IDLE], [hit * .63, ...THROW_LOAD], [hit * .78, ...THROW_LOAD],
        [hit, ...THROW_RELEASE], [.66, .64, .22, .18, .4, .10, .16, .05, -1.7],
        [.83, -.28, .42, .15, .35, 0, -.08, 0, -.8], [1, ...THROW_IDLE],
      ], k);
    }
    p.legR = .22; p.legL = -.26; p.kneeR = -.13; p.kneeL = -.09;
  }
}

export function poseRangedEquipment(g, p, st, k) {
  const data = g.userData;
  const weapon = data.roleWeapon || (data.roleWeapon = g.getObjectByName('roleWeapon'));
  if (!weapon) return;
  if (data.kind === 'archer') {
    weapon.rotation.z = (p.bowAngle || 0) - p.armL - p.foreL + p.lean + p.bodyTilt;
    const arrow = data.nockedArrow || (data.nockedArrow = g.getObjectByName('nockedArrow'));
    if (arrow) {
      arrow.visible = st !== 'bash' && (st !== 'shot' || k < .475 || k >= .975);
      arrow.position.x = .12 - .18 * (p.bowDraw || 0);
    }
    if (!data.bowStrings) data.bowStrings = [g.getObjectByName('bowStringUpper'), g.getObjectByName('bowStringLower')];
    const d = .18 * (p.bowDraw || 0), length = Math.hypot(.39, d);
    data.bowStrings.forEach((m, i) => {
      if (!m) return;
      m.position.set(-d / 2, .12 + (i ? -.195 : .195), 0);
      m.rotation.z = (i ? 1 : -1) * Math.atan2(d, .39); m.scale.y = length;
    });
  } else {
    weapon.rotation.z = p.bladeAngle - p.armR - p.foreR + p.lean + p.bodyTilt;
    const throwing = data.kind !== 'mage' && (st === 'shot' || st === 'thrust');
    const release = st === 'shot' ? .475 : .35 / .90;
    const rearm = st === 'shot' ? .975 : .75 / .90;
    weapon.visible = !throwing || k < release || k >= rearm;
  }
}
