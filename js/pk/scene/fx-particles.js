import * as THREE from '../../../vendor/three.module.min.js';

const CAP = 448;
const colors = new Map();
function rgb(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex));
  return colors.get(hex);
}

// 法术、技能共用一个有上限的粒子池和一次绘制，避免人数增加时堆积网格。
export class FxParticles {
  constructor(scene, pixelRatio) {
    const geo = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['color', 3], ['size', 1], ['alpha', 1]]) {
      geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(CAP * size), size).setUsage(THREE.DynamicDrawUsage));
    }
    this.mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: pixelRatio } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float pixelRatio;
        varying vec3 tint; varying float opacity;
        void main(){tint=color; opacity=alpha; vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=clamp(size*pixelRatio*300.0/max(0.1,-p.z),1.0,48.0); gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 tint; varying float opacity;
        void main(){vec2 uv=gl_PointCoord*2.0-1.0; float r=dot(uv,uv); if(r>1.0||opacity<0.005)discard;
          float core=pow(max(0.0,1.0-r),8.0); gl_FragColor=vec4(mix(tint,vec3(1.0),core*.8),opacity*exp(-r*3.0));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.name = 'skillParticlePool'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.pool = Array.from({ length: CAP }, () => ({ active: false })); this.cursor = 0;
  }
  emit(x, y, z, vx, vy, vz, hex, size = .12, life = .45, gravity = 0, drag = 1.6) {
    const i = this.cursor; this.cursor = (i + 1) % CAP;
    Object.assign(this.pool[i], { active: true, x, y, z, vx, vy, vz, size, life, gravity, drag, age: 0 });
    const c = rgb(hex); this.mesh.geometry.attributes.color.setXYZ(i, c.r, c.g, c.b);
  }
  burst(x, y, z, count, color, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996, speed = (.6 + Math.random() * 1.5) * power;
      this.emit(x + Math.cos(a) * .12, y, z + Math.sin(a) * .12, Math.cos(a) * speed, (Math.random() - .15) * speed,
        Math.sin(a) * speed, i % 4 ? color : 0xffffff, .16 + Math.random() * .18, .35 + Math.random() * .3, .4);
    }
  }
  frame(dt) {
    const a = this.mesh.geometry.attributes;
    let active = 0;
    this.pool.forEach((p, i) => {
      if (!p.active) return;
      p.age += dt;
      if (p.age >= p.life) { p.active = false; a.alpha.setX(i, 0); return; }
      active++;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const fade = 1 - p.age / p.life;
      a.position.setXYZ(i, p.x, p.y, p.z); a.size.setX(i, p.size * (.6 + fade * .4));
      a.alpha.setX(i, fade * Math.min(1, p.age * 25));
    });
    for (const key in a) a[key].needsUpdate = true;
    this.mesh.visible = active > 0;
    this.active = active;
  }
  clear() {
    this.pool.forEach((p, i) => { p.active = false; this.mesh.geometry.attributes.alpha.setX(i, 0); });
    this.mesh.geometry.attributes.alpha.needsUpdate = true; this.mesh.visible = false; this.active = 0;
  }
}
