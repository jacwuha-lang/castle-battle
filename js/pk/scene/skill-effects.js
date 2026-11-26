import * as THREE from '../../../vendor/three.module.min.js';
import { FxParticles } from './fx-particles.js';
import { WAVE_GEO, SHOCK_GEO, RUNE_GEO, GLOW_GEO, runeTexture, glowTexture, fxMaterial } from './skill-geometry.js';

const MAX_EFFECTS = 20, orbPosition = new THREE.Vector3(), swordPosition = new THREE.Vector3();
const CYAN = 0x71ddff, GOLD = 0xffd678;

export class SkillEffects {
  constructor(world) {
    this.world = world; this.particles = new FxParticles(world.scene, world.pixelRatio);
    this.effects = []; this.charging = new Map();
  }
  add(mesh, life, from, to, options = {}) {
    if (this.effects.length >= MAX_EFFECTS) this.remove(this.effects.shift());
    const materials = [];
    mesh.traverse(o => { if (o.material) materials.push({ m: o.material, opacity: o.material.opacity }); });
    mesh.renderOrder = 4; this.world.scene.add(mesh);
    this.effects.push({ mesh, life, from, to, age: 0, materials, ...options });
    return mesh;
  }
  rune(unit, magic = false) {
    const mesh = new THREE.Mesh(RUNE_GEO, fxMaterial(magic ? CYAN : GOLD, .68, runeTexture()));
    mesh.position.set(unit.x, .055, unit.z); mesh.rotation.x = -Math.PI / 2;
    return this.add(mesh, magic ? .95 : .9, magic ? .55 : .85, magic ? 1.05 : 1.6, { spin: magic ? .25 : -.15, owner: unit });
  }
  charge(unit, magic = false) {
    const last = this.charging.get(unit.group.id);
    if (last && this.world.time - last.at < .4) return;
    unit.group.userData.skillChargeSerial = unit.group.userData.attackCount;
    this.charging.set(unit.group.id, { at: this.world.time, unit, magic, emit: 0 });
    this.rune(unit, magic);
    if (!magic && !unit.group.userData.skillGlow) {
      const glow = new THREE.Mesh(GLOW_GEO, fxMaterial(GOLD, .65, glowTexture()));
      glow.position.y = .43; glow.name = 'generalSkillGlow'; glow.visible = false;
      unit.group.userData.rig.sword.add(glow); unit.group.userData.skillGlow = glow;
    }
  }
  generalBurst(unit) {
    [0, 1].forEach(i => {
      const root = new THREE.Group(); root.position.set(unit.x, i ? 1.2 : .12, unit.z); root.rotation.y = unit.group.rotation.y;
      const wave = new THREE.Mesh(WAVE_GEO, fxMaterial(i ? 0xffedbc : (unit.group.userData.side ? 0xffa36e : 0x88dcff), i ? .9 : .7));
      wave.rotation.set(i ? .25 : -Math.PI / 2, 0, i ? -.12 : 0);
      wave.scale.set(i ? .82 : 1, i ? .42 : 1, 1); root.add(wave);
      this.add(root, i ? .46 : .52, .75, 3.2);
    });
    const ring = new THREE.Mesh(SHOCK_GEO, fxMaterial(GOLD, .55));
    ring.position.set(unit.x, .065, unit.z); ring.rotation.x = -Math.PI / 2;
    this.add(ring, .6, .5, 3.3);
    const yaw = unit.group.rotation.y;
    for (let i = 0; i < 32; i++) {
      const a = (Math.random() - .5) * 2.7 - yaw, speed = 2.4 + Math.random() * 4;
      this.particles.emit(unit.x, .7 + Math.random() * .7, unit.z, Math.cos(a) * speed,
        .3 + Math.random() * 1.3, Math.sin(a) * speed, i % 3 ? GOLD : CYAN, .2 + Math.random() * .17, .4 + Math.random() * .25, 1.1);
    }
  }
  casterOrb(unit, target = orbPosition) {
    const orb = unit.group.userData.mageBits?.orb || unit.group.getObjectByName('mageOrb');
    if (orb) { orb.updateWorldMatrix(true, false); target.setFromMatrixPosition(orb.matrixWorld); }
    else target.set(unit.x, 1.4, unit.z);
    return target;
  }
  mageCast(unit) {
    const p = this.casterOrb(unit);
    this.particles.burst(p.x, p.y, p.z, 18, CYAN, 1.2);
    const halo = new THREE.Mesh(SHOCK_GEO, fxMaterial(CYAN, .8));
    halo.position.copy(p); halo.quaternion.copy(this.world.camera.quaternion);
    this.add(halo, .3, .12, .65, { billboard: true });
  }
  magicTrail(x, y, z, dt, projectile) {
    projectile.dustClock = (projectile.dustClock || 0) + dt * 70;
    while (projectile.dustClock >= 1) {
      projectile.dustClock--;
      const a = projectile.t * 29 + projectile.dustClock * 2;
      this.particles.emit(x + Math.cos(a) * .1, y + Math.sin(a) * .1, z,
        (Math.random() - .5) * .35, .08, (Math.random() - .5) * .35,
        projectile.dustClock % 2 ? 0xbb9bff : CYAN, .17 + Math.random() * .15, .3 + Math.random() * .18, -.1, 1);
    }
  }
  magicImpact(x, y, z) {
    this.particles.burst(x, y, z + .15, 30, 0x42caff, 2.1);
    const halo = new THREE.Mesh(RUNE_GEO, fxMaterial(0x42caff, .85, glowTexture()));
    halo.position.set(x, y, z + .23); halo.quaternion.copy(this.world.camera.quaternion);
    this.add(halo, .32, .24, 1.3, { billboard: true });
    const ring = new THREE.Mesh(SHOCK_GEO, fxMaterial(0xaf9fff, .7));
    ring.position.set(x, .065, z); ring.rotation.x = -Math.PI / 2;
    this.add(ring, .42, .15, 1.1);
  }
  event(e) {
    const unit = this.world.units.get(e.id);
    if (!unit) return;
    if (e.k === 'aoe_wind') this.charge(unit);
    else if (e.k === 'aoe') this.generalBurst(unit);
    else if (e.k === 'mage_cast') this.mageCast(unit);
  }
  frame(dt) {
    const w = this.world;
    w.units.forEach(unit => {
      const magic = unit.kind === 'mage';
      const charging = (magic && unit.stc === 9 && unit.k < .48) || (unit.kind === 'general' && unit.stc === 8);
      if (charging && unit.group.userData.skillChargeSerial !== unit.group.userData.attackCount && !this.charging.has(unit.group.id)) this.charge(unit, magic);
      if (unit.group.userData.skillGlow) {
        const glow = unit.group.userData.skillGlow;
        glow.visible = unit.stc === 8; glow.material.opacity = .42 + .16 * Math.sin(w.time * 15);
      }
    });
    this.charging.forEach((charge, id) => {
      const { unit, magic } = charge, age = w.time - charge.at;
      if (age > (magic ? .65 : .8) || w.units.get(unit.id) !== unit) {
        this.charging.delete(id); return;
      }
      charge.emit += dt * (magic ? 42 : 32);
      const p = magic ? this.casterOrb(unit) : swordPosition.set(unit.x, 1.65, unit.z);
      if (!magic) {
        const sword = unit.group.userData.rig.sword; sword.updateWorldMatrix(true, false);
        p.set(0, .55, 0).applyMatrix4(sword.matrixWorld);
      }
      while (charge.emit >= 1) {
        charge.emit--;
        const a = Math.random() * Math.PI * 2, r = .2 + Math.random() * .35;
        const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
        this.particles.emit(p.x + dx, p.y + (Math.random() - .5) * .4, p.z + dz,
          -dx * 2.4, .2, -dz * 2.4, magic ? CYAN : GOLD, .10 + Math.random() * .09, .28 + Math.random() * .2);
      }
    });
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]; fx.age += dt; const k = Math.min(1, fx.age / fx.life);
      const s = fx.from + (fx.to - fx.from) * (1 - Math.pow(1 - k, 2)); fx.mesh.scale.setScalar(s);
      const fade = Math.sin(Math.min(1, k * 5) * Math.PI / 2) * Math.pow(1 - k, 1.25);
      fx.materials.forEach(({ m, opacity }) => { m.opacity = opacity * fade; });
      if (fx.spin) fx.mesh.rotation.z += dt * fx.spin;
      if (fx.billboard) fx.mesh.quaternion.copy(w.camera.quaternion);
      if (fx.owner) { fx.mesh.position.x = fx.owner.x; fx.mesh.position.z = fx.owner.z; }
      if (k >= 1) { this.remove(fx); this.effects.splice(i, 1); }
    }
    this.particles.frame(dt);
  }
  remove(fx) { this.world.scene.remove(fx.mesh); fx.materials.forEach(({ m }) => m.dispose()); }
  clear() {
    this.effects.forEach(fx => this.remove(fx)); this.effects.length = 0;
    this.charging.forEach(({ unit }) => { if (unit.group.userData.skillGlow) unit.group.userData.skillGlow.visible = false; });
    this.charging.clear(); this.particles.clear();
  }
}
