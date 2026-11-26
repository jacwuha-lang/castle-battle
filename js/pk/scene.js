/* ============================================================
   scene.js — PK 擂台的 3D 战场
   ------------------------------------------------------------
   画风目标：玩具兵、奶油石头城、手绘草地，像摆在地毯上的一局棋。

   视角：
     每个玩家站在自己这一侧，镜头跟着自己最前面的兵往前推；
     自己一个兵都不剩了，镜头退回城堡正面，看得见对面压到城下。
     左右位置使用统一战场坐标，红蓝阵营可独立选择；人物不做镜像翻转。

   单位姿态全靠 models.js 里的关节组，这里只管「谁在走、谁在砍」。
   ============================================================ */

import * as THREE from '../../vendor/three.module.min.js';
import { sfx } from './sfx.js';
import { projectileMethods } from './scene/projectiles.js';
import { landscapeMethods } from './scene/landscape.js';
import { collapseMethods } from './scene/collapse.js';
import { warDecorMethods } from './scene/war-decor.js';
import { combatEffectMethods } from './scene/combat-effects.js';
import { COLOR } from './scene/constants.js';
import { unitMotionMethods, observeAction } from './scene/unit-motion.js';
import { Atmosphere } from './scene/atmosphere.js';
import { teamLayoutMethods } from './scene/team-layout.js';
import { observeMotion } from './scene/motion-track.js';
import { LEFT_GATE, RIGHT_GATE } from './scene/constants.js';
import {
  CASTLE_X,
} from './models.js';

/* 血条：一个共享的 1×1 面片，靠 scale 拉成各自的长条 */
const BAR_GEO = new THREE.PlaneGeometry(1, 1);
const BAR_W = 0.42;
const BAR_H = 0.075;
const BAR_Y = 1.98;     // 头顶上一点点

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.side = 0;
    this.factions = [0, 1];
    this.campDecor = [];
    this.focus = -13;
    this.dead = [];
    this.arrows = [];
    this.puffs = [];
    this.rings = [];
    this.units = new Map();
    this.clouds = [];
    this.time = 0;
    this.shake = 0;        /* 城堡塌的时候抖一下镜头 */
    this.watch = null;      /* 塌城时镜头转过去看的位置 */

    this.camPos = new THREE.Vector3(0, 12, 20);
    this.camLook = new THREE.Vector3(0, 1.2, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.initCombatEffects();
    this.scene.background = new THREE.Color(COLOR.sky);
    /* 雾从 42 米开始化：战场只有 56 米，打起来那一段永远清晰；
       远处的山、塔、山门才会一层层退到天里。 */
    this.scene.fog = new THREE.Fog(0xc8deea, 40, 112);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 160);

    this.hemi = new THREE.HemisphereLight(0xe4f2ff, 0xbeb580, 1.55);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffedca, 2.1);
    sun.position.set(-6, 16, 11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: .5, far: 48 });
    sun.shadow.normalBias = .035; sun.shadow.bias = -.00015;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xdcecff, .85);
    this.fill = fill;
    fill.position.set(9, 8, 12);
    this.scene.add(fill);

    /* 血条用的材质：槽底 + 双方各一种颜色。整场共用，不每帧新建 */
    this.barBgMat = new THREE.MeshBasicMaterial({
      color: 0x22303f, transparent: true, opacity: 0.62,
      depthTest: false, depthWrite: false,
    });
    this.barMat = [0x63a6ff, 0xff7b7b].map((c) => new THREE.MeshBasicMaterial({
      color: c, transparent: true, depthTest: false, depthWrite: false,
    }));
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0x8a6247 });
    this.arrowTipMat = new THREE.MeshLambertMaterial({ color: 0xf2f6ff });
    this.arrowTrailMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false,
    });
    /* 法球：不吃光照的亮青色 + 一层半透明光晕 */
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xcaf6ff });
    this.boltHaloMat = new THREE.MeshBasicMaterial({
      color: 0x7fdcff, transparent: true, opacity: 0.4, depthWrite: false,
    });

    this.buildSky();
    this.buildGround();
    this.castleLv = [1, 1];
    this.castles = [this.makeCastleModel(0, 1), this.makeCastleModel(1, 1)];
    this.castles.forEach((c) => this.scene.add(c));
    this.buildScenery();
    this.buildWarDecor();
    this.environment = new Atmosphere(this);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    /* 竖屏太窄时稍微开一点视角，两边不至于只剩一条缝 */
    /* 竖屏窄，视角开大一点；横屏宽，同样视角就能看见更多战场。
       关键是「小兵占总高的比例」在三种设备上都差不多。 */
    this.camera.fov = this.camera.aspect < 1.0 ? 47 : 44;
    this.camera.updateProjectionMatrix();
  }

  setSide(side) {
    this.side = side;
    this.focus = side === 0 ? LEFT_GATE : RIGHT_GATE;
  }

  /* 重开一局：上一局被打碎的城堡、躺在地上的尸体、锁在废墟上的镜头，
     全部还原。World 是整页只建一次的，不重置的话第二局会从一堆瓦砾里开打。 */
  reset() {
    this.sampleClockOffset = null;
    this.units.forEach((u) => {
      this.scene.remove(u.group);
      if (u.bar) this.scene.remove(u.bar.group);
    });
    this.units.clear();
    this.weaponTrails.clear();
    this.dead.forEach((d) => this.scene.remove(d.group));
    this.dead.length = 0;
    this.arrows.forEach((a) => this.scene.remove(a.g));
    this.arrows.length = 0;
    this.puffs.forEach((p) => this.scene.remove(p.m));
    this.puffs.length = 0;
    this.rings.forEach((r) => this.scene.remove(r.m));
    this.rings.length = 0;
    this.clearCombatEffects();
    this.watch = null;
    this.shake = 0;

    this.castleLv = [1, 1];
    this.castles.forEach((c, i) => {
      this.scene.remove(c);
      const fresh = this.makeCastleModel(i, 1);
      this.scene.add(fresh);
      this.castles[i] = fresh;
    });
  }

  /* ---------------- 城堡升级 ----------------
     等级不同外形不同（models.buildCastle 里按 lv 加东西：腰檐、箭孔、
     附塔、金冠…）。快照里的 lv 一变就整座重建 —— 一座城才几十个网格，
     一场最多重建四次，比每帧改模型便宜得多。
     正在塌的那座不重建：结算画面里它就是一堆瓦砾，重建会把它变回完好。 */
  setCastleLevel(side, lv) {
    const n = Math.max(1, Math.min(5, Math.round(lv || 1)));
    if (this.castleLv[side] === n) return false;
    this.castleLv[side] = n;
    const old = this.castles[side];
    if (!old || old.userData.collapsing != null) return false;
    this.scene.remove(old);
    const fresh = this.makeCastleModel(side, n);
    this.scene.add(fresh);
    this.castles[side] = fresh;
    this.groundRing(old.position.x);
    for (let i = 0; i < 6; i++) {
      this.spawnPuff(old.position.x + (Math.random() - 0.5) * 3,
        0.6 + Math.random() * 2.6, (Math.random() - 0.5) * 3, 0.35);
    }
    return true;
  }

  /* 地上扩散的一圈光：升级、满级这些「好事」用它，和塌方的白环区分开 */
  groundRing(x, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.05, 36),
      new THREE.MeshBasicMaterial({
        color: color || 0xffe6a3, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.07, 0);
    ring.scale.setScalar(1.2);
    this.scene.add(ring);
    this.rings.push({ m: ring, t: 0, life: 0.9 });
  }

  frameRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        this.scene.remove(r.m);
        this.rings.splice(i, 1);
        continue;
      }
      r.m.scale.setScalar(1.2 + k * 3.4);
      r.m.material.opacity = 0.9 * (1 - k);
    }
  }

  /* ---------------- 血条 ----------------
     兵越打越多，不标血根本看不出谁快倒了。用一块面向镜头的面片：
     底槽 + 一条按血量缩的彩条，阵营色（蓝 / 红）跟衣服一致。 */
  makeBar(u) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(BAR_GEO, this.barBgMat);
    bg.scale.set(BAR_W, BAR_H, 1);
    bg.renderOrder = 30;
    g.add(bg);
    const fill = new THREE.Mesh(BAR_GEO, this.barMat[this.factions[u.side]]);
    fill.scale.set(BAR_W - 0.03, BAR_H - 0.03, 1);
    fill.renderOrder = 31;
    g.add(fill);
    g.position.set(u.x, BAR_Y, u.z);
    this.scene.add(g);
    u.bar = { group: g, fill: fill, w: BAR_W - 0.03 };
  }

  dropBar(u) {
    if (u.bar) {
      this.scene.remove(u.bar.group);
      u.bar = null;
    }
  }

  /* ---------------- 士兵同步 ----------------
     list: [[id, side, tier, x, lane, 动作码, 动作进度, 血比, 目标id], ...]（服务器快照）
     坐标始终平滑追随服务器快照，避免走位和战斗判定错开。 */
  sync(list, now, serverTime) {
    let sampleAt = now;
    if (Number.isFinite(serverTime)) {
      const offset = now - serverTime;
      if (this.sampleClockOffset == null || Math.abs(offset - this.sampleClockOffset) > 1) this.sampleClockOffset = offset;
      else this.sampleClockOffset += Math.max(-.001, Math.min(.001, offset - this.sampleClockOffset));
      sampleAt = serverTime + this.sampleClockOffset;
    }
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const id = it[0], side = it[1], tier = it[2], x = it[3], z = it[4];
      const stc = it[5] || 0, prog = it[6] || 0, hp = it[7] === undefined ? 1 : it[7];
      const kind = it[9] || (tier >= 4 ? 'general' : 'charge');
      seen.add(id);
      let u = this.units.get(id);
      if (!u) {
        const group = this.makeUnitModel(side, tier, kind);
        group.rotation.y = side === 0 ? 0 : Math.PI;
        this.scene.add(group);
        u = {
          id: id, group: group, x: x, z: z, tx: x, tz: z, at: now, born: now,
          tier: tier, side: side, kind: kind, walk: 0, stc: stc, prog: prog, k: prog,
          hp: hp, yaw: 0, facing: side === 0 ? 0 : Math.PI,
          jx: ((id * 7) % 5 - 2) * 0.05,
          jz: ((id * 13) % 5 - 2) * 0.06,
        };
        this.units.set(id, u);
        this.makeBar(u);
      }
      u.tx = x;
      u.tz = z;
      observeMotion(u, x, z, sampleAt);
      u.at = now;
      observeAction(u, stc, prog, now);
      u.hp = hp;
      u.foe = it[8];
    }

    this.units.forEach((u, id) => {
      if (!seen.has(id)) {
        this.units.delete(id);
        this.dropBar(u);
        this.dead.push(this.makeCorpse(u));
      }
    });
  }

  clearSoldiers() {
    this.units.forEach((u) => {
      this.scene.remove(u.group);
      this.dropBar(u);
    });
    this.units.clear();
    this.weaponTrails.clear();
    this.dead.forEach((d) => this.scene.remove(d.group));
    this.dead.length = 0;
  }

  addLocal(id, side, tier, x, z, kind = 'charge') {
    if (this.units.has(id)) return;
    const group = this.makeUnitModel(side, tier, kind);
    group.rotation.y = side === 0 ? 0 : Math.PI;
    this.scene.add(group);
    const u = {
      id: id, group: group, x: x, z: z, tx: x, tz: z, at: this.time, born: this.time,
      tier: tier, side: side, kind: kind, walk: 0, stc: 0, prog: 0, k: 0, hp: 1, yaw: 0,
      facing: side === 0 ? 0 : Math.PI,
      jx: ((id * 7) % 5 - 2) * 0.05,
      jz: ((id * 13) % 5 - 2) * 0.06,
    };
    this.units.set(id, u);
    this.makeBar(u);
  }

  /* ---------------- 被打飞 ----------------
     兵是被刀劈出去的，不是自己倒下的：整个人带着旋转飞出去、砸在地上弹一下、
     趴两秒再淡掉。方向朝自己这一侧（被对面砍退）。 */
  makeCorpse(u) {
    const dir = u.side === 0 ? -1 : 1;
    const p = u.group.position;
    const sh = u.group.getObjectByName('shadow');
    if (u.group.userData.skillGlow) u.group.userData.skillGlow.visible = false;
    if (sh) sh.visible = false;     /* 躺下之后影子会跟着立起来，很难看 */
    return {
      group: u.group, side: u.side,
      t: 0, landed: false, landT: 0,
      vx: dir * (2.6 + Math.random() * 1.9),
      vy: 3.1 + Math.random() * 1.6,
      vz: (Math.random() - 0.5) * 1.5,
      /* 主翻滚绕 z 轴：人朝 ±x 站着，绕 z 翻才是「横着飞出去」；
         绕 x 翻会让身体朝镜头方向躺倒，从正面看只剩两个鞋底。 */
      spin: dir * (2.4 + Math.random() * 1.4),
      spin2: (Math.random() - 0.5) * .8,
      x0: p.x, z0: p.z,
    };
  }

  /* ---------------- 每帧 ---------------- */
  frame(dt) {
    this.time += dt;
    const now = this.time;

    this.frameUnits(dt);

    /* 阵亡：被打飞出去，落地躺 2 秒再淡掉 ——
       直接往侧面倒太斯文了，兵是被刀劈出去的。 */
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const d = this.dead[i];
      d.t += dt;
      if (!d.landed) {
        d.vy -= 18 * dt;
        d.group.position.x += d.vx * dt;
        d.group.position.y += d.vy * dt;
        d.group.position.z += d.vz * dt;
        d.group.rotation.z += d.spin * dt;
        d.group.rotation.x += d.spin2 * dt;
        if (d.group.position.y <= 0 && d.vy < 0) {
          d.group.position.y = 0;
          d.landed = true;
          /* 落地那一下要「趴住」：把翻滚角度收回到最近的直角，
             再抬一点高度，不然半个身子埋进草地里 */
          d.rotTarget = Math.round(d.group.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
          this.spawnPuff(d.group.position.x, 0.16, d.group.position.z, 0.7);
          sfx.play('land', 0.35);
        }
        continue;
      }
      d.landT += dt;
      const kk = Math.min(1, dt * 11);
      d.group.rotation.z += (d.rotTarget - d.group.rotation.z) * kk;
      d.group.rotation.x += (0 - d.group.rotation.x) * kk;
      d.group.position.y += (0.26 - d.group.position.y) * kk;
      if (d.landT > 2.0) {
        const f = Math.max(0, 1 - (d.landT - 2.0) / 0.45);
        if (!d.fading) {
          d.fading = true;
          d.mats = [];
          d.group.traverse((o) => {
            if (!o.material) return;
            o.material = o.material.clone();
            o.material.transparent = true;
            d.mats.push(o.material);
          });
        }
        d.mats.forEach((m) => { m.opacity = f; });
        if (f <= 0) {
          this.scene.remove(d.group);
          this.dead.splice(i, 1);
        }
      }
    }

    this.castles.forEach((c, i) => {
      if (c.userData.flag) c.userData.flag.rotation.y = Math.sin(now * 2.2 + i) * 0.3;
      (c.userData.banners || []).forEach((b, j) => {
        if (b) b.rotation.z = Math.sin(now * 2.6 + j * 1.4 + i) * 0.05;
      });
    });

    this.clouds.forEach((c) => {
      c.position.x += c.userData.spd * dt;
      if (c.position.x > 70) c.position.x = -70;
    });

    this.updateCamera(dt);
    this.sun.position.set(this.focus - 6, 16, 11);
    this.sun.target.position.set(this.focus, 0, 0);
    this.frameWarDecor(dt);
    this.frameArrows(dt);
    this.framePuffs(dt);
    this.frameRings(dt);
    this.frameCombatEffects(dt);
    this.frameCollapse(dt);
    this.environment.frame(dt);

    /* 镜头抖动：塌方那一下加一点随机位移，衰减掉。
       在 lookAt 之后加，所以只是画面抖，视角不会跑。 */
    if (this.shake > 0.003) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.8;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.6;
    }
    this.shake *= Math.exp(-dt * 2.6);

    this.renderer.render(this.scene, this.camera);
  }

  /* 镜头：盯自己最前面的兵；没兵了就退回来守城堡 */
  updateCamera(dt) {
    if (this.side === null) {
      const k = 1 - Math.exp(-dt * 2.0);
      this.camPos.lerp(new THREE.Vector3(0, 15.5, 22), k);
      this.camLook.lerp(new THREE.Vector3(0, 1.6, 0), k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }

    /* 取「我方最前排那几个人」的平均位置当焦点，而不是最前面那一个 ——
       宽正面之后前排是并排好几个人，只盯最靠前那个会让主力全挤在画面边上。
       两个阵营都框进来，才不会只拍到自己人往前跑、对手在画外。 */
    const mine = [];
    this.units.forEach((u) => { if (u.side === this.side) mine.push(u.x); });
    let front = null;
    if (mine.length) {
      mine.sort((a, b) => (this.side === 0 ? b - a : a - b));
      const n = Math.min(4, mine.length);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += mine[i];
      front = sum / n;
    }

    let foeX = null, foeD = 1e9;
    if (front !== null) {
      this.units.forEach((u) => {
        if (u.side === this.side) return;
        const d = Math.abs(u.x - front);
        if (d < foeD) { foeD = d; foeX = u.x; }
      });
    }

    const hasOwn = front !== null;
    let aim;
    if (this.watch != null) {
      /* 城塌了：不管自己兵在哪，镜头都先转过去看那一下 */
      aim = this.watch;
    } else if (!hasOwn) {
      aim = this.side === 0 ? -CASTLE_X : CASTLE_X;
    } else if (foeX !== null) {
      /* 敌人离得近就框住交火线，离得远就只拍自己的队伍往前压，
         免得两边都拍一半、谁也没看清 */
      const mid = (front + foeX) / 2;
      const k = Math.max(0, Math.min(1, (9 - foeD) / 7));
      aim = front + (mid - front) * k;
    } else {
      aim = front;
    }
    /* 平时慢慢跟，塌城那一刻快点甩过去 */
    const fspd = this.watch != null ? 7.5 : 3.6;
    this.focus += (aim - this.focus) * (1 - Math.exp(-dt * fspd));

    const dir = this.side === 0 ? 1 : -1;
    let pos, look;
    if (this.watch != null) {
      /* 看塌城要退远、抬高：城高 7 米多，用平时那个跟兵的距离会把画面塞满 */
      pos = [this.focus + dir * 2.6, 9.4, 17.6];
      look = [this.focus + dir * 0.2, 2.9, 0];
    } else if (hasOwn) {
      /* 机位稍退以容纳多排部队，同时在画面上方留出城堡尖顶。
         保留俯角用于观察侧翼包围；竖屏再退一步。 */
      const far = this.camera.aspect < 1.0 ? 1.35 : 1.0;
      pos = [this.focus + dir * 0.2, 4.1 * far, 10.0 * far];
      look = [this.focus + dir * 0.4, 2.1, 0];
    } else {
      /* 一个兵都没了：镜头退到城堡前面，看得见自家城门被围 */
      pos = [this.focus + dir * 4.2, 5.2, 10.8];
      look = [this.focus + dir * 0.6, 3.4, 0];
    }
    const k = 1 - Math.exp(-dt * 5.0);
    this.camPos.lerp(new THREE.Vector3(pos[0], pos[1], pos[2]), k);
    this.camLook.lerp(new THREE.Vector3(look[0], look[1], look[2]), k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }


}

Object.assign(World.prototype, landscapeMethods, projectileMethods, collapseMethods, warDecorMethods, combatEffectMethods, unitMotionMethods, teamLayoutMethods);

export { LEFT_GATE, RIGHT_GATE, CASTLE_X };
