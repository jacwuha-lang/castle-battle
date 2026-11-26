import * as THREE from '../../../vendor/three.module.min.js';
import { sfx } from '../sfx.js';
import { LEFT_GATE, RIGHT_GATE } from './constants.js';
import { ORBIT_GEO } from './skill-geometry.js';
import { armorContact } from '../model/combat-contact.js';

/* 箭雨用的箭头：一根细杆 + 一个锥头，全场景共用几何体 */
const ARROW_SHAFT = new THREE.CylinderGeometry(0.045, 0.045, 0.8, 5);
const ARROW_HEAD = new THREE.ConeGeometry(0.1, 0.24, 6);
const SPEAR_SHAFT = new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6);
/* 箭尾的拖影：一根很淡的长条。没有它，一支箭在二十米外只有两三个像素，
   飞过去根本看不见 —— 有了拖影才知道「天上在下箭」 */
const ARROW_TRAIL = new THREE.CylinderGeometry(0.02, 0.05, 1.5, 4);
/* 方士的法球：内芯 + 外层光晕，两个球就够，几何全场共用 */
const BOLT_CORE = new THREE.IcosahedronGeometry(.16, 1);
const BOLT_HALO = new THREE.SphereGeometry(.32, 10, 8);
const BOLT_ORBIT_MAT = new THREE.MeshBasicMaterial({ color: 0xc1b8ff, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending });
const UP_Y = new THREE.Vector3(0, 1, 0);
const _tmpQ = new THREE.Quaternion();
const _tmpA = new THREE.Vector3();

export const projectileMethods = {
  /* ---------------- 小尘团 ----------------
     落地、箭钉进地里都靠它，比每次新建一堆粒子便宜 */
  spawnPuff(x, y, z, size) {
    const s = size || 0.3;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(s, 7, 6),
      new THREE.MeshLambertMaterial({
        color: 0xe7dcc9, transparent: true, opacity: 0.55, depthWrite: false,
      }),
    );
    m.position.set(x, y, z);
    this.scene.add(m);
    this.puffs.push({ m: m, t: 0, life: 0.42, s: s });
  },

  framePuffs(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.scene.remove(p.m);
        this.puffs.splice(i, 1);
        continue;
      }
      p.m.scale.setScalar(1 + k * 2.0);
      p.m.material.opacity = 0.55 * (1 - k);
      p.m.position.y += dt * 0.6;
    }
  },

  /* ---------------- 阵营技能：城堡箭雨 ----------------
     服务器在 0.55 秒后才结算伤害（PK_ARROW_FLY），这边就按同样的时间飞，
     箭头落地的那一刻人也在掉血，不会「箭还在天上人已经倒了」。 */
  volley(side, list, fly, age = 0) {
    if (!list || !list.length) return;
    const duration = Number.isFinite(fly) && fly > 0 ? fly : 0.55;
    if (age >= duration) return;
    const fromX = side === 0 ? LEFT_GATE : RIGHT_GATE;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const toCastle = !a.id;
      /* 弧高随射程增加，同时限制最高点，兼顾近处和远处的箭雨。 */
      const p0 = new THREE.Vector3(fromX, 4.6, 0);
      const to = new THREE.Vector3(
        a.x + (Math.random() - 0.5) * 0.3,
        toCastle ? 3.2 : 1.05,
        (a.l || 0) + (Math.random() - 0.5) * 0.35,
      );
      const mid = p0.clone().add(to).multiplyScalar(0.5);
      const range = Math.hypot(to.x - p0.x, to.z - p0.z);
      const rise = Math.min(8, Math.max(2.4, range * 0.16));
      // 二次贝塞尔在中点只取到控制点偏移的一半。
      mid.y += rise * 2;

      const g = new THREE.Group();
      const shaft = new THREE.Mesh(ARROW_SHAFT, this.arrowMat);
      const head = new THREE.Mesh(ARROW_HEAD, this.arrowTipMat);
      head.position.y = 0.46;
      const trail = new THREE.Mesh(ARROW_TRAIL, this.arrowTrailMat);
      trail.position.y = -0.75;
      g.add(shaft);
      g.add(head);
      g.add(trail);
      g.position.copy(p0);
      this.scene.add(g);
      this.arrows.push({ g: g, p0: p0, mid: mid, to: to, t: Math.max(0, age), dur: duration });
    }
    sfx.play('arrow', 0.85);
  },

  soldierProjectile(e, age = 0) {
    const duration = Number.isFinite(e.fly) && e.fly > 0 ? e.fly : 0.4;
    if (age >= duration) return;
    const magic = e.kind === 'mage';
    const p0 = new THREE.Vector3(e.x, 1.3, e.l || 0);
    const source = this.units.get(e.id);
    if (source) {
      const held = source.group.getObjectByName(
        magic ? 'mageOrb' : (e.kind === 'archer' ? 'nockedArrow' : 'roleWeapon'));
      if (held) {
        source.group.updateMatrixWorld(true);
        held.getWorldPosition(p0);
      }
    }
    const to = new THREE.Vector3(e.tx, e.ty ?? 1.1, e.tl || 0);
    const target = this.units.get(e.target);
    if (target && source) armorContact(target, source, target.stc === 4, to);
    const mid = p0.clone().add(to).multiplyScalar(0.5);
    mid.y += magic ? 1.9 : (e.kind === 'archer' ? 1.3 : 0.7);
    const g = new THREE.Group();
    if (magic) {
      /* 法球：一颗发亮的小球 + 外层淡淡的光晕，拉长成一颗「飞出去的光」。
         用 MeshBasicMaterial（不吃光照），远处也看得见。 */
      const core = new THREE.Mesh(BOLT_CORE, this.boltMat);
      const halo = new THREE.Mesh(BOLT_HALO, this.boltHaloMat);
      g.add(core, halo);
      for (let j = 0; j < 2; j++) {
        const orbit = new THREE.Mesh(ORBIT_GEO, BOLT_ORBIT_MAT);
        orbit.rotation.set(j ? .6 : -.6, 0, j * Math.PI / 2); orbit.name = 'spellOrbit'; g.add(orbit);
      }
      g.scale.set(1, 1.4, 1);
    } else {
      const shaft = new THREE.Mesh(e.kind === 'spearman' ? SPEAR_SHAFT : ARROW_SHAFT, this.arrowMat);
      const head = new THREE.Mesh(ARROW_HEAD, this.arrowTipMat);
      head.position.y = e.kind === 'spearman' ? 0.81 : 0.46;
      g.add(shaft, head);
      if (e.kind === 'thrower') g.scale.setScalar(1.25);
    }
    g.position.copy(p0);
    _tmpA.copy(to).sub(p0).normalize();
    _tmpQ.setFromUnitVectors(UP_Y, _tmpA);
    g.quaternion.copy(_tmpQ);
    this.scene.add(g);
    this.arrows.push({ g, p0, mid, to, t: Math.max(0, age), dur: duration,
                       target: e.target, source: e.id, gate: e.gate, soldierShot: true, magic });
    sfx.play(magic ? 'magic' : 'arrow', magic ? 0.45 : 0.5);
  },

  frameArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t += dt;
      if (a.t < 0) continue;
      if (a.soldierShot) {
        const target = this.units.get(a.target);
        const source = this.units.get(a.source);
        if (target && source) armorContact(target, source, target.stc === 4, a.to);
        a.mid.x = (a.p0.x + a.to.x) / 2;
        a.mid.z = (a.p0.z + a.to.z) / 2;
      }
      let u = a.t / a.dur;
      if (u > 1) u = 1;
      /* 二次贝塞尔：两点之间拱起来，看着才像射出去的箭 */
      const w = 1 - u;
      const x = w * w * a.p0.x + 2 * w * u * a.mid.x + u * u * a.to.x;
      const y = w * w * a.p0.y + 2 * w * u * a.mid.y + u * u * a.to.y;
      const z = w * w * a.p0.z + 2 * w * u * a.mid.z + u * u * a.to.z;
      a.g.position.set(x, y, z);
      if (a.magic) {
        this.skillEffects.magicTrail(x, y, z, dt, a);
        a.g.children.forEach((m, j) => { if (m.name === 'spellOrbit') m.rotation.y = a.t * (j % 2 ? 11 : -9); });
      }
      /* 朝向：对曲线求导，得到这一点的速度方向 */
      _tmpA.set(
        2 * w * (a.mid.x - a.p0.x) + 2 * u * (a.to.x - a.mid.x),
        2 * w * (a.mid.y - a.p0.y) + 2 * u * (a.to.y - a.mid.y),
        2 * w * (a.mid.z - a.p0.z) + 2 * u * (a.to.z - a.mid.z),
      );
      if (_tmpA.lengthSq() > 1e-6) {
        _tmpA.normalize();
        _tmpQ.setFromUnitVectors(UP_Y, _tmpA);
        a.g.quaternion.copy(_tmpQ);
      }
      if (u >= 1) {
        if (a.magic) this.skillEffects.magicImpact(x, y, z);
        else this.spawnPuff(x, y - 0.1, z, 0.26);
        if (i % 3 === 0) sfx.play('arrowhit', 0.5);
        this.scene.remove(a.g);
        this.arrows.splice(i, 1);
      }
    }
  }

};
