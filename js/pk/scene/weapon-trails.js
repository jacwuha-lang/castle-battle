import * as THREE from '../../../vendor/three.module.min.js';

const SEGMENTS = 11, CAP = 32, LIFE = .16;
const base = new THREE.Vector3(), tip = new THREE.Vector3();
const vertexShader = 'attribute float fade; varying float alpha; void main(){alpha=fade; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const fragmentShader = `uniform vec3 tint; varying float alpha; void main(){gl_FragColor=vec4(tint,alpha*.6);
  #include <colorspace_fragment>
  }`;

function isSwing(u) {
  const k = u.k;
  return (u.stc === 1 && k > .70) || (u.stc === 2 && k > .39 && k < .68)
    || (u.stc === 3 && k > .5 && k < .75) || (u.stc === 8 && k > .29 && k < .77)
    || (u.stc === 11 && k > .35 && k < .72);
}

// 记录实际剑身两点的世界坐标，而不是在动作开始时放一个预制圆圈。
export class WeaponTrails {
  constructor(scene) { this.scene = scene; this.trails = new Map(); }
  create(id, unit) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGMENTS * 18), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('fade', new THREE.BufferAttribute(new Float32Array(SEGMENTS * 6), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(unit.group.userData.side === 0 ? 0x8cdaff : 0xffbd88) } },
      vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'weaponMotionTrail';
    this.scene.add(mesh);
    const trail = { mesh, samples: [], last: 0 }; this.trails.set(id, trail); return trail;
  }
  frame(t, units) {
    units.forEach((u, id) => {
      if (!isSwing(u) || u.kind === 'mage') return;
      let trail = this.trails.get(id);
      if (!trail && this.trails.size >= CAP) return;
      if (!trail) trail = this.create(id, u);
      const data = u.group.userData;
      const weapon = data.rig.sword.visible ? data.rig.sword : (data.roleWeapon || u.group.getObjectByName('roleWeapon'));
      if (!weapon || !weapon.visible) return;
      weapon.updateWorldMatrix(true, false);
      const bladeTip = u.kind === 'spearman' ? 1.1 : u.kind === 'thrower' ? .82 : u.kind === 'archer' ? .5 : u.tier >= 3 ? .78 : .72;
      base.set(0, .16, 0).applyMatrix4(weapon.matrixWorld);
      tip.set(0, bladeTip, 0).applyMatrix4(weapon.matrixWorld);
      const previous = trail.samples[0];
      if (previous && Math.hypot(previous[3] - tip.x, previous[4] - tip.y, previous[5] - tip.z) > 2) trail.samples.length = 0;
      trail.samples.unshift([base.x, base.y, base.z, tip.x, tip.y, tip.z, t]);
      if (trail.samples.length > SEGMENTS + 1) trail.samples.length = SEGMENTS + 1;
      trail.last = t;
    });
    this.trails.forEach((trail, id) => {
      const samples = trail.samples;
      while (samples.length && t - samples[samples.length - 1][6] > LIFE) samples.pop();
      const pos = trail.mesh.geometry.attributes.position, fade = trail.mesh.geometry.attributes.fade;
      let n = 0;
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i], b = samples[i + 1];
        for (const [sample, offset] of [[a, 0], [a, 3], [b, 0], [b, 0], [a, 3], [b, 3]]) {
          pos.setXYZ(n, sample[offset], sample[offset + 1], sample[offset + 2]);
          fade.setX(n, Math.pow(Math.max(0, 1 - (t - sample[6]) / LIFE), 1.5) * (offset === 0 ? .12 : 1)); n++;
        }
      }
      trail.mesh.geometry.setDrawRange(0, n); trail.mesh.visible = n > 0;
      pos.needsUpdate = fade.needsUpdate = true;
      if (t - trail.last > LIFE && !units.has(id)) this.remove(id, trail);
    });
  }
  remove(id, trail) {
    this.scene.remove(trail.mesh); trail.mesh.geometry.dispose(); trail.mesh.material.dispose(); this.trails.delete(id);
  }
  clear() { this.trails.forEach((trail, id) => this.remove(id, trail)); }
}
