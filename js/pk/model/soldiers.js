import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from './shared.js';
import { TEAM } from './teams.js';
import { addMageEquipment } from './mage-equipment.js';
import { addRangedEquipment } from './ranged-equipment.js';
import { addShield } from './shield.js';
import { addGeneralArmor } from './general-armor.js';
import { buildCharacterHead } from './character-head.js';
import { addCharacterArmor } from './character-armor.js';
import { bannerMaterial } from './heraldry.js';
import { soldierScale } from './visual-scale.js';

/* ---------------- 士兵 ---------------- */

const SKIN = 0xffd7b0;

const SOLDIER_NAMES = [
  'body', 'hips', 'torso', 'head', 'armR', 'foreR', 'armL', 'foreL',
  'legR', 'kneeR', 'ankleR', 'legL', 'kneeL', 'ankleL',
  'sword', 'shield', 'banner',
];
const SOLDIER_TPL = new Map();

function makeSoldier(side, tier, kind) {
  const T = TEAM[side === 1 ? 1 : 0];
  const t4 = tier >= 4;                 /* 武将：比三级兵再高一档的金盔 */
  const t3 = tier >= 3, t2 = tier >= 2;
  /* 方士：远程法兵。不披甲、不背旗、拿杖不拿剑，长袍盖住腿 ——
     一眼就能从人堆里认出「那个会放法术的」。*/
  const mage = kind === 'mage';
  const g = new THREE.Group();

  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);

  /* 短腿、大头的比例；髋高与 soldier-pose 的贴地补偿保持一致。 */
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = 0.73;
  body.add(hips);

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.02;
  hips.add(torso);
  addCharacterArmor(hips, torso, { T, tier, kind, side });
  const head = buildCharacterHead(torso, { T, tier, kind, side });

  /* ---- 手臂 ----
     +z 边是拿剑的手（靠镜头），-z 边拿盾。
     肩点在 z ±0.26，胳膊在躯干外侧。 */
  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.set(0, 0.35, 0.26);
  torso.add(armR);
  add(armR, G('upperArm', () => new THREE.CapsuleGeometry(0.075, 0.17, 4, 8)),
    mat(T.cloth2), 0, -0.15, 0);
  add(armR, G('shoulderR', () => new THREE.SphereGeometry(0.085, 12, 8)),
    mat(T.cloth2), 0, 0.01, 0);

  const foreR = new THREE.Group();
  foreR.name = 'foreR';
  foreR.position.y = -0.31;
  armR.add(foreR);
  add(foreR, G('forearm', () => new THREE.CapsuleGeometry(0.065, 0.14, 4, 8)),
    mat(t2 ? T.metal2 : 0x9a7350), 0, -0.13, 0);
  add(foreR, G('hand', () => new THREE.SphereGeometry(0.074, 12, 8)),
    mat(t2 ? 0x6f5546 : SKIN), 0, -0.28, 0);
  if (t2) {
    /* 护肘 + 护腕：铁手套加两段护具，挥剑的时候才有金属感 */
    add(foreR, G('elbow', () => new THREE.SphereGeometry(0.074, 12, 8)),
      mat(T.metal), 0, -0.015, 0);
    add(foreR, G('vambrace', () => new THREE.CylinderGeometry(0.072, 0.063, 0.14, 10, 1, true)),
      mat(T.metal), 0.004, -0.12, 0);
  }

  const armL = new THREE.Group();
  armL.name = 'armL';
  armL.position.set(0, 0.35, -0.26);
  torso.add(armL);
  add(armL, G('upperArmL', () => new THREE.CapsuleGeometry(0.075, 0.17, 4, 8)),
    mat(T.cloth2), 0, -0.15, 0);
  add(armL, G('shoulderL', () => new THREE.SphereGeometry(0.085, 12, 8)),
    mat(T.cloth2), 0, 0.01, 0);

  const foreL = new THREE.Group();
  foreL.name = 'foreL';
  foreL.position.y = -0.31;
  armL.add(foreL);
  add(foreL, G('forearmL', () => new THREE.CapsuleGeometry(0.065, 0.14, 4, 8)),
    mat(t2 ? T.metal2 : 0x9a7350), 0, -0.13, 0);
  add(foreL, G('handL', () => new THREE.SphereGeometry(0.074, 12, 8)),
    mat(t2 ? 0x6f5546 : SKIN), 0, -0.28, 0);
  if (t2) {
    add(foreL, G('elbowL', () => new THREE.SphereGeometry(0.074, 12, 8)),
      mat(T.metal), 0, -0.015, 0);
    add(foreL, G('vambraceL', () => new THREE.CylinderGeometry(0.072, 0.063, 0.14, 10, 1, true)),
      mat(T.metal), 0.004, -0.12, 0);
  }

  /* ---- 剑：剑柄握在手心，剑身朝前上方 ---- */
  const sword = new THREE.Group();
  sword.name = 'sword';
  sword.position.set(0, -0.28, 0);
  sword.rotation.z = -2.18;
  foreR.add(sword);

  const bladeLen = t3 ? 0.58 : (t2 ? 0.52 : 0.46);
  add(sword, G('grip', () => new THREE.CylinderGeometry(0.028, 0.032, 0.16, 8)),
    mat(0x5a3f2e), 0, -0.055, 0);
  add(sword, G('pommel', () => new THREE.SphereGeometry(0.04, 8, 8)),
    mat(T.trim), 0, -0.145, 0);
  add(sword, G('guard', () => new THREE.BoxGeometry(t3 ? 0.3 : 0.25, 0.05, 0.07)),
    mat(t3 ? T.trim : 0x9fb2c6), 0, 0.035, 0);
  add(sword, G('blade' + bladeLen, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.041, 0);
    shape.lineTo(0.041, 0);
    shape.lineTo(0.041, bladeLen);
    shape.lineTo(0, bladeLen + 0.14);
    shape.lineTo(-0.041, bladeLen);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: false })
      .translate(0, 0, -0.012);
  }), mat(t3 ? 0xeef6ff : 0xdde7f3), 0, 0.06, 0);
  if (t3) {
    add(sword, G('bladeInlay', () => new THREE.BoxGeometry(0.02, 0.4, 0.03)),
      mat(T.trim), 0, 0.28, 0);
  }

  addMageEquipment({ kind, sword, foreR, hips, T });
  addRangedEquipment({ kind, sword, foreR, foreL, torso });
  addShield({ kind, t2, t3, foreL, T, side });

  /* ---- 腿：粗一点，才不像筷子 ---- */
  const legR = new THREE.Group();
  legR.name = 'legR';
  legR.position.set(0.015, -0.02, 0.12);
  hips.add(legR);
  add(legR, G('thigh', () => new THREE.CapsuleGeometry(0.096, 0.17, 4, 8)),
    mat(t2 ? T.cloth2 : T.cloth), 0, -0.17, 0);

  const kneeR = new THREE.Group();
  kneeR.name = 'kneeR';
  kneeR.position.y = -0.34;
  legR.add(kneeR);
  add(kneeR, G('shin', () => new THREE.CapsuleGeometry(0.079, 0.15, 4, 8)),
    mat(t2 ? T.leather : SKIN), 0, -0.13, 0);

  /* 脚踝单独一个组。以前鞋是直接挂在膝盖上的，小腿一转，鞋跟着转：
     走路时脚尖会戳进土里、或者整个人像踮着脚飘。有了这个组，
     每帧把大腿+小腿转过的角度抵消掉，鞋底才一直贴着地。 */
  const ankleR = new THREE.Group();
  ankleR.name = 'ankleR';
  ankleR.position.y = -0.26;
  kneeR.add(ankleR);
  add(ankleR, G('foot', () => new THREE.BoxGeometry(0.23, 0.12, 0.17)),
    mat(t2 ? 0x6b4b36 : 0x7a5540), 0.03, 0, 0);
  add(ankleR, G('toe', () => new THREE.SphereGeometry(0.085, 12, 8)),
    mat(t2 ? 0x6b4b36 : 0x7a5540), 0.125, -0.015, 0).scale.set(1, 0.62, 0.9);
  /* 护膝 + 护胫（tier2 起）；一级布衣只有两条绑腿，一眼看出穷富。
     方士不长甲 —— 而且铁护膝在长袍里走路会顶穿袍子，露出一块白铁皮。 */
  if (t2 && !mage) {
    add(kneeR, G('kneeCap', () => new THREE.SphereGeometry(0.09, 12, 8)),
      mat(T.metal), 0.052, -0.045, 0).scale.set(1, 1.05, 0.95);
    add(kneeR, G('greave', () => new THREE.CylinderGeometry(0.088, 0.076, 0.15, 10, 1, true)),
      mat(T.metal2), 0.012, -0.13, 0);
    add(kneeR, G('greaveTrim', () => new THREE.CylinderGeometry(0.09, 0.09, 0.022, 10)),
      mat(T.trim), 0.012, -0.075, 0);
  } else {
    [-0.1, -0.19].forEach((yy) => {
      add(kneeR, G('wrap', () => new THREE.CylinderGeometry(0.076, 0.076, 0.026, 10)),
        mat(0xd8c092), 0.004, yy, 0);
    });
  }

  const legL = legR.clone(true);
  legL.name = 'legL';
  legL.position.z = -0.12;
  legL.position.x = -0.015;
  hips.add(legL);
  const kneeL = legL.getObjectByName('kneeR');
  if (kneeL) kneeL.name = 'kneeL';
  const ankleL = legL.getObjectByName('ankleR');
  if (ankleL) ankleL.name = 'ankleL';

  /* ---- 背旗（tier3，方士不背旗 —— 他背后是兜帽） ---- */
  let banner = null;
  if (t3 && !t4 && !mage) {
    banner = new THREE.Group();
    banner.name = 'banner';
    banner.position.set(-0.14, 0.3, -0.12);
    torso.add(banner);
    add(banner, G('bannerPole', () => new THREE.CylinderGeometry(0.016, 0.016, 1.1, 6)),
      mat(0x8a6247), 0, 0.44, 0);
    const flag = add(banner, G('bannerFlag', () => new THREE.PlaneGeometry(0.36, 0.26)),
      bannerMaterial(side), -0.19, 0.88, 0);
    flag.name = 'flag';
  }

  const scale = soldierScale(tier, kind);
  g.scale.setScalar(scale);
  g.userData.scaleBase = scale;
  g.userData.barHeight = mage ? 2.03 : t4 && side === 0 ? 1.84 : 2.02;

  /* 脚下的假影子：一个贴地的暗圆。没有影子的话小人像浮在草地上，
     加这一片比开实时阴影便宜得多，也更「玩具」。 */
  const shadow = add(g, G('soldShadow', () => new THREE.CircleGeometry(0.42, 18)),
    mat(0x244a2c, { transparent: true, opacity: 0.2, depthWrite: false }),
    0, 0.02, 0);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.x = 1.15;
  shadow.name = 'shadow';

  if (t4) addGeneralArmor({ torso, head, hips, T, side });

  /* 能烘的都烘掉：一个兵从三十几个网格压到十来个。
     注意 bakeGroup 只吃「直接挂在节点下的网格」，子组会原样留下 ——
     ankleR 是组，所以脚和小腿不会被烘成一坨，还能各自转。 */
  ['ankleR', 'ankleL', 'hips', 'torso', 'head', 'armR', 'foreR', 'armL', 'foreL',
    'sword', 'shield', 'shieldDetails', 'legR', 'kneeR', 'legL', 'kneeL'].forEach((n) => {
    const node = g.getObjectByName(n);
    if (node) bakeGroup(node);
  });
  g.traverse(o => { if (o.isMesh && o.name !== 'shadow') o.castShadow = true; });

  /* 缓存模板只存标量。Object3D.clone 会 JSON 复制 userData，
     把关节/武器对象存进模板会反复序列化整套几何，造成出兵卡顿。
     活动关节引用在下面 buildSoldier 的实例中绑定一次。 */
  g.userData.tier = tier;
  g.userData.side = side;
  return g;
}

export function buildSoldier(side, tier, kind = 'charge') {
  if (tier >= 4) kind = 'general';
  const key = side + ':' + tier + ':' + kind;
  let tpl = SOLDIER_TPL.get(key);
  if (!tpl) {
    tpl = makeSoldier(side, tier, kind);
    SOLDIER_TPL.set(key, tpl);
  }
  const g = tpl.clone(true);
  const rig = {};
  SOLDIER_NAMES.forEach((n) => {
    const o = g.getObjectByName(n);
    if (o) rig[n] = o;
  });
  g.userData.rig = rig;
  g.userData.phase = Math.random() * 6.283;
  g.userData.tier = tier;
  g.userData.side = side;
  g.userData.kind = kind;
  g.userData.scaleBase = soldierScale(tier, kind);
  const banner = g.getObjectByName('banner');
  if (banner) {
    const flag = banner.getObjectByName('flag');
    if (flag) g.userData.flag = flag;
  }
  g.userData.sword = g.getObjectByName('sword');
  return g;
}

