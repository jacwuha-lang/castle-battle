import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add } from './shared.js';
import { TEAM } from './teams.js';
import { addCastleDetails } from './castle-details.js';
import { brickTexture, roofTexture, woodTexture } from './textures.js';
import { addSpire } from './architecture.js';
import { addCastleGate } from './castle-gate.js';
import { bannerMaterial } from './heraldry.js';

/* ---------------- 城堡 ---------------- */
const CASTLE_X = 33.2;   // 城门在 ±28，城堡模型再往外站 5.2 米

function merlonSquare(parent, half, y, per, size, color) {
  const geo = G('merlonS' + size, () => new THREE.BoxGeometry(size, size * 0.85, size * 0.55));
  const step = (half * 2) / per;
  for (let i = 0; i < per; i++) {
    const t = -half + step * (i + 0.5);
    [[t, -half, 0], [t, half, 0], [-half, t, Math.PI / 2], [half, t, Math.PI / 2]].forEach((q) => {
      const m = add(parent, geo, mat(color), q[0], y, q[1]);
      m.rotation.y = q[2];
    });
  }
}

function crenellate(parent, radius, y, count, size, color) {
  const geo = G('merlon' + size, () => new THREE.BoxGeometry(size, size * 0.9, size * 0.55));
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 / count) * i;
    const m = add(parent, geo, mat(color),
      Math.cos(a) * radius, y, Math.sin(a) * radius);
    m.rotation.y = -a;
  }
}

export function buildCastle(side, lv) {
  const T = TEAM[side === 1 ? 1 : 0];
  /* 城堡等级：1~5。连对 10 题升一级（server.py 的 combo_buff）。
     以前不管几级长得一模一样，升级只有血条变长 —— 现在每级都多一层东西：
       1 基础瓮城  2 加双檐 + 火盆 + 门楼
       3 主楼加高一层 + 箭孔 + 门匾
       4 后侧附塔 + 金顶挑檐   5 金冠 + 符文光带 + 加大旗
     全部是直接挂在 g 上的网格：结算砸城时那一套「把每个网格当砖飞出去」
     才吃得下（挂在子组里的东西会留在原地飘着）。 */
  const lvl = Math.max(1, Math.min(5, Math.round(lv || 1)));
  const g = new THREE.Group();
  const brick = brickTexture();
  const stoneMat = new THREE.MeshLambertMaterial({ map: brick });
  const stoneDark = mat(0xe4d0b4);
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTexture(T.roof) });
  const woodMat = new THREE.MeshLambertMaterial({ map: woodTexture() });
  const gold = mat(T.trim);
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });

  /* 高度参数：三级起主楼加高一层，四/五级角楼再往上长 */
  const lift = lvl >= 3 ? 0.46 : 0;
  const baseH = 3.1 + lift;
  const wallTop = 0.2 + baseH;              /* 1 级 = 3.3 */
  const towerH = 4.5 + lift + (lvl >= 4 ? 0.6 : 0) + (lvl >= 5 ? 0.45 : 0);
  const keepH = 1.6 + (lvl >= 3 ? 0.28 : 0);
  const keepTop = wallTop + keepH;
  const capY = keepTop + 0.5;
  const ballY = capY + 0.71;

  /* 地基 */
  add(g, G('cPlinth', () => new THREE.BoxGeometry(4.6, 0.42, 4.6)), stoneDark, 0, 0.21, 0);

  /* 主楼 */
  const base = add(g, G('cBase' + baseH, () => new THREE.BoxGeometry(3.6, baseH, 3.6)),
    stoneMat, 0, 0.2 + baseH / 2, 0);
  base.name = 'base';

  /* 主楼顶上一圈城垛（沿墙沿摆，不是绕一圈圆） */
  merlonSquare(g, 1.72, wallTop + 0.22, 4, 0.56, 0xf3e3c9);

  /* 五级：城墙上一条金色腰线 + 四面符文光带（夜里一眼看出这是满级城） */
  if (lvl >= 5) {
    [[1.82, 0], [-1.82, 0], [0, 1.82], [0, -1.82]].forEach((p, i) => {
      const bar = add(g, G('cRune' + i, () => new THREE.BoxGeometry(
        p[0] ? 0.04 : 2.5, 0.1, p[1] ? 0.04 : 2.5)), glow,
      p[0], wallTop - 0.62, p[1]);
      bar.material = glow;
    });
    add(g, G('cGoldLine', () => new THREE.BoxGeometry(3.72, 0.07, 3.72)), gold,
      0, wallTop - 0.16, 0);
  }

  /* 四座角楼 */
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((p) => {
    const tx = p[0] * 1.62, tz = p[1] * 1.62;
    add(g, G('cTower' + towerH, () => new THREE.CylinderGeometry(0.58, 0.68, towerH, 16, 1)),
      stoneMat, tx, towerH / 2, tz);
    /* 屋顶：底面压进塔身 0.15，中间不能留缝（留了看着就是浮空的） */
    addSpire(g, tx, towerH - .05, tz, .84, 1.75, T.roof);
    /* 塔窗：一小块深色，塔才不是一根光筒 */
    add(g, G('cWin', () => new THREE.BoxGeometry(0.14, 0.34, 0.2)),
      mat(0x6a5a4c), tx + p[0] * 0.42, towerH * 0.667, tz + p[1] * 0.42);
    /* 四级起，塔檐多一圈金边（挑檐），塔看着是「有装修」的 */
    if (lvl >= 4) {
      const eave = add(g, G('cEave', () => new THREE.CylinderGeometry(0.9, 0.94, 0.06, 16)),
        gold, tx, towerH + 0.02, tz);
      eave.scale.z = 1;
    }
    /* 三级起，朝战场那两座塔各挂一面小旗 */
    if (lvl >= 3 && p[0] > 0) {
      const flagMat = bannerMaterial(side);
      add(g, G('cTowerPole', () => new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6)),
        mat(0x8a6247), tx, towerH + 1.62, tz);
      const f = add(g, G('cTowerFlag', () => new THREE.PlaneGeometry(0.34, 0.22)), flagMat,
        tx + 0.18, towerH + 1.78, tz);
      f.name = 'towerFlag';
    }
  });

  /* 中央塔楼 */
  add(g, G('cKeep' + keepH, () => new THREE.BoxGeometry(1.15, keepH, 1.15)),
    stoneMat, 0, wallTop + keepH / 2, 0);
  const keepCap = add(g, G('cKeepCap', () => new THREE.ConeGeometry(0.86, 1.3, 4)),
    roofMat, 0, 0, 0);
  keepCap.position.set(0, capY, 0);       /* 底 4.70，压进塔身 0.15 */
  keepCap.rotation.y = Math.PI / 4;
  add(g, G('cKeepBall', () => new THREE.SphereGeometry(0.09, 10, 8)),
    mat(T.trim), 0, ballY, 0);

  /* 二级起：中央塔楼下面加一圈腰檐（双檐城楼） */
  if (lvl >= 2) {
    add(g, G('cKeepEave', () => new THREE.ConeGeometry(1.06, 0.42, 4)), roofMat,
      0, wallTop + 0.12, 0).rotation.y = Math.PI / 4;
    add(g, G('cKeepEaveRim', () => new THREE.BoxGeometry(1.44, 0.05, 1.44)), gold,
      0, wallTop - 0.06, 0).rotation.y = Math.PI / 4;
  }
  /* 五级：腰檐外一圈金冠（金环 + 八根朝上的金刺），
     位置必须比屋顶底面半径大一点，否则全被那个四棱锥吞掉看不见 */
  if (lvl >= 5) {
    add(g, G('cCrown', () => new THREE.TorusGeometry(0.94, 0.035, 6, 20)), gold,
      0, keepTop - 0.08, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i + Math.PI / 8;
      add(g, G('cCrownSpike', () => new THREE.ConeGeometry(0.05, 0.3, 6)), glow,
        Math.cos(a) * 0.94, keepTop + 0.07, Math.sin(a) * 0.94);
    }
  }
  /* 四级：城墙正面竖起两座小尖塔 —— 剪影一下子从「方块」变成「城」 */
  if (lvl >= 4) {
    [-1, 1].forEach((s) => {
      add(g, G('cPinTower', () => new THREE.CylinderGeometry(0.15, 0.19, 1.05, 10)),
        stoneMat, 1.44, wallTop + 0.72, s * 1.18);
      add(g, G('cPinCap', () => new THREE.ConeGeometry(0.24, 0.52, 10)), roofMat,
        1.44, wallTop + 1.5, s * 1.18);
      add(g, G('cPinTip', () => new THREE.SphereGeometry(0.05, 8, 8)), gold,
        1.44, wallTop + 1.8, s * 1.18);
    });
  }

  addCastleGate(g, { woodMat, stoneDark, T });

  /* 门前两级台阶 */
  add(g, G('cStep1', () => new THREE.BoxGeometry(0.4, 0.18, 1.55)), stoneDark, 2.05, 0.31, 0);
  add(g, G('cStep2', () => new THREE.BoxGeometry(0.36, 0.18, 1.75)), stoneDark, 2.3, 0.14, 0);

  /* 门口两盏火把：小光点，晚上/雾里也认得出这是门 */
  [-1, 1].forEach((s) => {
    add(g, G('cTorchPost', () => new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6)),
      mat(0x6b4a34), 2.1, 1.05, s * 0.86);
    add(g, G('cFlame', () => new THREE.SphereGeometry(0.085, 8, 8)),
      new THREE.MeshBasicMaterial({ color: 0xffc046 }), 2.1, 1.3, s * 0.86);
  });

  /* 二级起：门楼（一小截坡屋顶压在门上）+ 三级起门匾 */
  if (lvl >= 2) {
    add(g, G('cGateRoof', () => new THREE.BoxGeometry(0.62, 0.1, 2.0)), roofMat, 1.86, 2.52, 0)
      .rotation.z = -0.12;
    add(g, G('cGateRoof2', () => new THREE.BoxGeometry(0.5, 0.08, 1.86)), roofMat, 1.9, 2.66, 0)
      .rotation.z = -0.12;
  }
  if (lvl >= 3) {
    add(g, G('cPlaque', () => new THREE.BoxGeometry(0.06, 0.34, 0.78)), gold, 1.94, 2.42, 0);
  }

  /* 二级起：城头四个火盆（石座 + 亮火苗），五级换成更亮的大火盆 */
  if (lvl >= 2) {
    const fs = lvl >= 5 ? 1.3 : 1.0;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((p) => {
      const bx = p[0] * 1.62, bz = p[1] * 1.62;
      add(g, G('cBrazier' + fs, () => new THREE.CylinderGeometry(0.12 * fs, 0.16 * fs, 0.2 * fs, 8)),
        stoneDark, bx, wallTop + 0.4, bz + 0.5);
      add(g, G('cBrazierFire' + fs, () => new THREE.SphereGeometry(0.1 * fs, 8, 8)),
        glow, bx, wallTop + 0.56, bz + 0.5);
    });
  }

  /* 四级起：后侧两座附塔，把剪影从「一个方块」变成「有层次的城」 */
  if (lvl >= 4) {
    [-1, 1].forEach((s) => {
      add(g, G('cSubTower', () => new THREE.CylinderGeometry(0.42, 0.5, 3.4, 12)),
        stoneMat, -1.9, 1.7, s * 1.25);
      const cap = add(g, G('cSubCap', () => new THREE.ConeGeometry(0.58, 0.95, 12)),
        roofMat, -1.9, 3.85, s * 1.25);
      cap.name = 'subCap';
    });
  }

  /* 城墙上挂的旗：挂在镜头这一面（+z 墙），侧着挂是看不到的 */
  const flagMat = bannerMaterial(side);
  [-1, 1].forEach((s) => {
    add(g, G('cBPole', () => new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6)),
      mat(0x8a6247), s * 0.95, wallTop - 0.14, 1.86).rotation.z = Math.PI / 2;
    const f = add(g, G('cBanner', () => new THREE.PlaneGeometry(0.52, 1.28)), flagMat,
      s * 0.95, wallTop - 0.82, 1.85);
    f.name = 'banner' + s;
  });
  /* 四级起，另外两面墙也挂旗（斜着看的时候侧面不空） */
  if (lvl >= 4) {
    [-1, 1].forEach((s) => {
      const f = add(g, G('cBanner2', () => new THREE.PlaneGeometry(0.46, 1.1)), flagMat,
        1.84, wallTop - 0.78, s * 0.95);
      f.rotation.y = Math.PI / 2;
      f.name = 'banner' + (s * 2);
    });
  }

  /* 中央大旗（五级换成更大的旗，杆也加长） */
  const poleH = 1.45 + (lvl >= 5 ? 0.35 : 0);
  add(g, G('cPole' + poleH, () => new THREE.CylinderGeometry(0.035, 0.035, poleH, 6)),
    mat(0x8a6247), 0, ballY + poleH * 0.46, 0);
  const fw = 1.05 * (lvl >= 5 ? 1.22 : 1), fh = 0.62 * (lvl >= 5 ? 1.18 : 1);
  const bigFlag = add(g, G('cFlag' + fw.toFixed(2), () => new THREE.PlaneGeometry(fw, fh)),
    flagMat, fw * 0.52, ballY + 1.06, 0);
  bigFlag.name = 'flag';

  addCastleDetails(g, { T, side, wallTop, towerH, lvl });
  g.children.forEach(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  g.rotation.y = side === 0 ? 0 : Math.PI;
  g.position.x = side === 0 ? -CASTLE_X : CASTLE_X;
  /* 每升一级整体大一点点：从「一座小堡」长成「一座城」 */
  g.scale.setScalar(1 + (lvl - 1) * 0.022);
  g.userData.flag = bigFlag;
  g.userData.banners = [g.getObjectByName('banner1'), g.getObjectByName('banner-1'),
    g.getObjectByName('banner2'), g.getObjectByName('banner-2')].filter(Boolean);
  g.userData.base = base;
  g.userData.lv = lvl;
  return g;
}


export { CASTLE_X };
