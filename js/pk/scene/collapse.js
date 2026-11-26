import * as THREE from '../../../vendor/three.module.min.js';
import { sfx } from '../sfx.js';

/* 所有碎块共用一个 1×1×1 的盒子，靠 scale 撑成各自大小 —— 不然塌一座城
   就要新建几百个几何体，手机上会卡一下 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/* 把一件大长方体切成小方块（三条边各切最多 3 份）。
   不切的返回 null。按体积判断：门板、横梁这种小件切了只会更碎，
   主楼、地基、塔顶这些大板才是「看着像推倒而不像碎掉」的元凶。
   只切 BoxGeometry —— 锥形屋顶和圆塔身切出来会变成方疙瘩。 */
function splitBox(castle, mesh, inv) {
  const geo = mesh.geometry;
  if (!geo || geo.type !== 'BoxGeometry' || !geo.parameters) return null;
  const pm = geo.parameters;
  if (pm.width * pm.height * pm.depth < 0.9) return null;

  const box = new THREE.Box3().setFromObject(mesh).applyMatrix4(inv);
  const size = box.getSize(new THREE.Vector3());
  const nx = Math.max(1, Math.min(3, Math.round(size.x / 1.15)));
  const ny = Math.max(1, Math.min(3, Math.round(size.y / 1.15)));
  const nz = Math.max(1, Math.min(3, Math.round(size.z / 1.15)));
  if (nx * ny * nz <= 1) return null;

  const sx = size.x / nx, sy = size.y / ny, sz = size.z / nz;
  const out = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const m = new THREE.Mesh(UNIT_BOX, mesh.material);
        m.position.set(
          box.min.x + sx * (i + 0.5),
          box.min.y + sy * (j + 0.5),
          box.min.z + sz * (k + 0.5),
        );
        m.scale.set(sx * 0.97, sy * 0.97, sz * 0.97);
        castle.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

export const collapseMethods = {
  /* ============================================================
     结算：输的那座城堡被砸碎
     ------------------------------------------------------------
     以前是把整座城 scale.y 压扁、再冒十几个球 —— 看着像泄气的气球，
     不像「崩」。现在把每个网格当成一块砖：各自带初速度往外炸、
     受重力、落地弹一下趴住；另外补一层碎砖、粉尘、地面冲击波、
     镜头抖动。看起来才是一次塌方，而不是模型缩小。
     ============================================================ */
  collapse(loserSide) {
    const c = this.castles[loserSide];
    if (!c || c.userData.collapsing != null) return;
    c.userData.collapsing = 0;
    c.updateMatrixWorld(true);

    /* 先把大块切成小块。不切的话，主楼就是一块 3.6 米见方的大板砖飞出去，
       看着像「整座城被推开」而不是「碎掉」。只切本来就是盒子的大件：
       锥形屋顶、圆塔身保持原样，切了反而会变成方疙瘩。 */
    const inv = new THREE.Matrix4().copy(c.matrixWorld).invert();
    const chunks = [];
    c.children.slice().forEach((o) => {
      if (!o.isMesh) return;
      const subs = splitBox(c, o, inv);
      if (subs) {
        c.remove(o);
        subs.forEach((m) => chunks.push(m));
      } else {
        chunks.push(o);
      }
    });

    /* 小碎砖：只有大块会显得空，粉碎感靠这些小块撑 */
    const RUB = [0xe8d8be, 0xd9cbb6, 0xc9b79c, 0xbfae94];
    for (let i = 0; i < 40; i++) {
      const s = 0.09 + Math.random() * 0.2;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s * (0.5 + Math.random() * 0.9), s * (0.6 + Math.random())),
        new THREE.MeshLambertMaterial({ color: RUB[i % RUB.length] }),
      );
      m.position.set(
        (Math.random() - 0.5) * 3.8,
        0.3 + Math.random() * 3.2,
        (Math.random() - 0.5) * 3.8,
      );
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      c.add(m);
      chunks.push(m);
    }

    /* 所有碎块转成刚体。位置用城堡本地坐标，
       物理也在本地算 —— 右边那座城整体转了 180°，在本地算就不用管。 */
    const parts = [];
    chunks.forEach((o) => {
      const home = o.position;
      const up = Math.max(0, home.y) * 0.55;         /* 塔楼比地基飞得高 */
      /* 落地高度按「这一块自己的半高」算。统一用 0.12 的话，
         大块的底会埋进地里，小砖又会浮着。 */
      const bb = new THREE.Box3().setFromObject(o).applyMatrix4(inv);
      parts.push({
        o: o,
        halfY: Math.max(0.05, (bb.max.y - bb.min.y) / 2),
        v: new THREE.Vector3(
          home.x * 1.1 + (Math.random() - 0.5) * 1.7,
          1.6 + Math.random() * 4.4 + up,
          home.z * 1.1 + (Math.random() - 0.5) * 1.7,
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
        ),
        delay: Math.random() * 0.3,
        bounces: 0,
        rest: false,
      });
    });
    c.userData.parts = parts;

    /* 粉尘：一团团往外涨、往上飘、慢慢透明。用球叠出来最省事 */
    const dust = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 + Math.random() * 0.42, 7, 6),
        new THREE.MeshLambertMaterial({
          color: i % 3 ? 0xe3d7c2 : 0xd2c4ac,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
        }),
      );
      p.position.set((Math.random() - 0.5) * 3.2, 0.4 + Math.random() * 2.6, (Math.random() - 0.5) * 3.2);
      p.userData.dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        0.5 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.2,
      );
      p.userData.life = 0;
      p.scale.setScalar(0.35 + Math.random() * 0.4);
      dust.add(p);
    }
    c.add(dust);
    c.userData.dust = dust;

    /* 地面冲击波：一圈往外推的白环，0.6 秒就没了 */
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1.0, 40),
      new THREE.MeshBasicMaterial({
        color: 0xf6ead6, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = 0.08;
    wave.scale.setScalar(0.4);
    c.add(wave);
    c.userData.wave = wave;

    this.shake = 0.34;
    /* 把镜头叫过来看：结算时赢家的主力还在半路，城在几十米外，
       不转镜头的话这整套碎裂根本没人看得见。 */
    this.watch = c.position.x;
    sfx.play('crumble', 0.75);
  },

  frameCollapse(dt) {
    this.castles.forEach((c) => {
      if (c.userData.collapsing == null) return;
      c.userData.collapsing += dt;
      const t = c.userData.collapsing;

      /* --- 碎块 --- */
      const parts = c.userData.parts;
      if (parts) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.rest) continue;
          if (p.delay > 0) { p.delay -= dt; continue; }
          const o = p.o;
          p.v.y -= 16 * dt;
          o.position.x += p.v.x * dt;
          o.position.y += p.v.y * dt;
          o.position.z += p.v.z * dt;
          o.rotation.x += p.spin.x * dt;
          o.rotation.y += p.spin.y * dt;
          o.rotation.z += p.spin.z * dt;
          /* 落地：弹两下，然后就趴在那儿当瓦砾 */
          const floorY = p.halfY;
          if (o.position.y < floorY) {
            o.position.y = floorY;
            if (p.v.y < -1.4 && p.bounces < 2) {
              p.v.y *= -0.34;
              p.v.x *= 0.55;
              p.v.z *= 0.55;
              p.spin.multiplyScalar(0.45);
              p.bounces++;
            } else {
              p.v.set(0, 0, 0);
              p.spin.set(0, 0, 0);
              p.rest = true;
            }
          }
        }
      }

      /* --- 粉尘：0.12 秒后才开始冒，先看见石头崩再起灰 --- */
      if (c.userData.dust) {
        const ds = c.userData.dust.children;
        for (let i = 0; i < ds.length; i++) {
          const p = ds[i];
          if (t < 0.12) continue;
          p.userData.life += dt;
          const lf = p.userData.life;
          p.position.addScaledVector(p.userData.dir, dt * 1.5);
          p.userData.dir.multiplyScalar(1 - dt * 0.9);
          /* 先浓后淡 */
          const op = Math.min(1, lf / 0.25) * Math.max(0, 1 - (lf - 0.9) / 1.9);
          p.material.opacity = 0.42 * op;
          p.scale.setScalar(0.4 + lf * 0.7);
        }
      }

      /* --- 冲击波 --- */
      if (c.userData.wave) {
        const w = c.userData.wave;
        const k = Math.min(1, t / 0.62);
        w.scale.setScalar(0.4 + k * 7.5);
        w.material.opacity = 0.85 * (1 - k) * (1 - k);
        if (k >= 1) w.visible = false;
      }
    });
  }
};
