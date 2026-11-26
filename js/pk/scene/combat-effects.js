import * as THREE from '../../../vendor/three.module.min.js';
import { WeaponTrails } from './weapon-trails.js';
import { SkillEffects } from './skill-effects.js';
import { armorContact } from '../model/combat-contact.js';

const SPARK_CAP = 54;
const FLASH_CAP = 10;
const SPARK_GEO = new THREE.OctahedronGeometry(0.12, 0);
const FLASH_GEO = new THREE.RingGeometry(.18, .25, 24);
const IDENTITY = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

export const combatEffectMethods = {
  initCombatEffects() {
    this.weaponTrails = new WeaponTrails(this.scene);
    this.skillEffects = new SkillEffects(this);
    this.sparkPool = [];
    this.sparkCursor = 0;
    this.sparkMesh = new THREE.InstancedMesh(SPARK_GEO,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }),
      SPARK_CAP);
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < SPARK_CAP; i++) {
      _matrix.compose(_pos.set(0, -500, 0), IDENTITY, _scale.setScalar(0));
      this.sparkMesh.setMatrixAt(i, _matrix);
      this.sparkPool.push(null);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.sparkMesh);
    this.hitFlashes = [];
    this.contactImpacts = [];
  },

  clearCombatEffects() {
    this.weaponTrails.clear();
    this.skillEffects.clear();
    this.sparkPool.fill(null);
    this.sparkCursor = 0;
    this.hitFlashes.forEach((fx) => {
      this.scene.remove(fx.mesh);
      fx.mesh.material.dispose();
    });
    this.hitFlashes.length = 0;
    this.contactImpacts.length = 0;
    for (let i = 0; i < SPARK_CAP; i++) {
      _matrix.compose(_pos.set(0, -500, 0), IDENTITY, _scale.setScalar(0));
      this.sparkMesh.setMatrixAt(i, _matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  },

  combatEvent(e) {
    this.skillEffects.event(e);
    if (e.k === 'wind' || e.k === 'leap' || e.k === 'bash' || e.k === 'aoe_wind') {
      return;
    }
    if (e.k !== 'hit' && e.k !== 'aoehit' && e.k !== 'block') return;

    const target = this.units.get(e.id);
    const attacker = this.units.get(e.attacker);
    if (target) {
      target.group.userData.impactAt = this.time;
      target.group.userData.impactPower = e.crit ? 1.4 : 1;
      if (e.k === 'block') {
        target.group.userData.contactBlockAt = this.time;
        target.group.userData.contactBlockAttacker = e.attacker;
      }
    }
    if (attacker && e.k !== 'aoehit' && !['shot', 'thrust'].includes(e.attack) && (e.attack || ['charge', 'general'].includes(attacker.kind))) {
      const d = attacker.group.userData;
      d.contactStrikeAt = this.time; d.contactStrikeTarget = e.id; d.contactStrikeBlocked = e.k === 'block';
    }
    if (this.contactImpacts.length < 64) this.contactImpacts.push(e);
  },

  contactImpact(e) {
    const target = this.units.get(e.id), attacker = this.units.get(e.attacker);
    const point = target && attacker ? armorContact(target, attacker, e.k === 'block') : null;
    const x = point ? point.x : target ? target.group.position.x : (e.x || 0);
    const z = point ? point.z : target ? target.group.position.z : (e.l || 0);
    const y = point ? point.y : 1;
    const color = e.k === 'block' ? 0x8feaff : (e.crit || e.k === 'aoehit' ? 0xffb743 : 0xffe28a);
    this.spawnImpact(x, z, color, e.crit ? 1.35 : 1, y);
    if (e.k === 'block') this.spawnFlash(x, z, 0x92e8ff, 0.8, y);
  },

  spawnFlash(x, z, color, size = 1, y = 1) {
    if (this.hitFlashes.length >= FLASH_CAP) {
      const old = this.hitFlashes.shift();
      this.scene.remove(old.mesh);
      old.mesh.material.dispose();
    }
    const mesh = new THREE.Mesh(FLASH_GEO, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.92, depthWrite: false,
    }));
    mesh.position.set(x, y, z);
    mesh.quaternion.copy(this.camera.quaternion);
    mesh.scale.setScalar(size);
    this.scene.add(mesh);
    this.hitFlashes.push({ mesh, t: 0, life: 0.20, slash: false });
  },

  spawnImpact(x, z, color, power, y = 1.1) {
    const count = power > 1 ? 8 : 6;
    for (let i = 0; i < count; i++) {
      const index = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_CAP;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = (1.2 + Math.random() * 1.6) * power;
      this.sparkPool[index] = {
        x: x + (Math.random() - 0.5) * 0.2,
        y: y + (Math.random() - .5) * .18,
        z: z + (Math.random() - 0.5) * 0.24,
        vx: Math.cos(angle) * speed,
        vy: 0.7 + Math.random() * 1.6,
        vz: Math.sin(angle) * speed * 0.62,
        age: 0,
        life: 0.2 + Math.random() * 0.16,
        size: 0.55 + Math.random() * 0.62,
        color,
      };
    }
    this.spawnFlash(x, z, color, power, y);
  },

  frameCombatEffects(dt) {
    this.contactImpacts.forEach(e => this.contactImpact(e)); this.contactImpacts.length = 0;
    this.weaponTrails.frame(this.time, this.units);
    this.skillEffects.frame(dt);
    for (let i = 0; i < SPARK_CAP; i++) {
      const p = this.sparkPool[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        this.sparkPool[i] = null;
        _matrix.compose(_pos.set(0, -500, 0), IDENTITY, _scale.setScalar(0));
        this.sparkMesh.setMatrixAt(i, _matrix);
        continue;
      }
      p.vy -= 5.4 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.08, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const fade = 1 - p.age / p.life;
      _pos.set(p.x, p.y, p.z);
      _scale.setScalar(p.size * fade);
      _matrix.compose(_pos, IDENTITY, _scale);
      this.sparkMesh.setMatrixAt(i, _matrix);
      this.sparkMesh.setColorAt(i, _color.setHex(p.color));
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;

    for (let i = this.hitFlashes.length - 1; i >= 0; i--) {
      const fx = this.hitFlashes[i];
      fx.t += dt;
      const k = Math.min(1, fx.t / fx.life);
      fx.mesh.material.opacity = (fx.slash ? 0.86 : 0.92) * Math.pow(1 - k, 1.6);
      if (fx.slash) {
        fx.mesh.scale.set(0.72 + k * 0.8, 0.72 + k * 0.8, 0.72 + k * 0.8);
        fx.mesh.rotation.z += dt * 1.6;
      } else {
        fx.mesh.scale.setScalar(.45 + k * 1.4);
      }
      if (k >= 1) {
        this.scene.remove(fx.mesh);
        fx.mesh.material.dispose();
        this.hitFlashes.splice(i, 1);
      }
    }
  },
};
