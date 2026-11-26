import * as THREE from '../../../vendor/three.module.min.js';

const RAIN_COUNT = 300, SNOW_COUNT = 140, MOTE_COUNT = 70, SPLASH_COUNT = 28;
const dummy = new THREE.Object3D();
function random(i, salt) { const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); }

function snowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, '#fff'); g.addColorStop(.45, '#fffffff0'); g.addColorStop(1, '#ffffff00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
}
function geometry(count) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  return g;
}

// 所有粒子局限在跟随镜头的装饰区域，不访问单位/伤害/寻路数据。
export class Weather {
  constructor(scene) {
    this.rain = new THREE.LineSegments(geometry(RAIN_COUNT * 2), new THREE.LineBasicMaterial({ color: 0xc4e4ff, transparent: true, opacity: 0, depthWrite: false }));
    this.snow = new THREE.Points(geometry(SNOW_COUNT), new THREE.PointsMaterial({ color: 0xf4f9ff, map: snowTexture(), size: .11, transparent: true, opacity: 0, depthWrite: false }));
    this.motes = new THREE.Points(geometry(MOTE_COUNT), new THREE.PointsMaterial({ color: 0xeed5a5, map: this.snow.material.map, size: .06, transparent: true, opacity: 0, depthWrite: false }));
    this.splashes = new THREE.InstancedMesh(new THREE.RingGeometry(.12, .14, 10), new THREE.MeshBasicMaterial({ color: 0xc5e3ef, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), SPLASH_COUNT);
    this.splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    [this.rain, this.snow, this.motes, this.splashes].forEach(m => { m.frustumCulled = false; scene.add(m); });
    this.rain.name = 'decorativeRain'; this.snow.name = 'decorativeSnow'; this.motes.name = 'windMotes';
    this.weights = { clear: 1, wind: 0, rain: 0, snow: 0, fog: 0 };
  }

  frame(dt, t, focus, kind) {
    for (const key in this.weights) this.weights[key] += ((key === kind ? 1 : 0) - this.weights[key]) * (1 - Math.exp(-dt * 1.1));
    const { rain, snow, wind, fog } = this.weights;
    this.rain.visible = rain > .004; this.snow.visible = snow > .004;
    this.motes.visible = wind > .004 || fog > .004; this.splashes.visible = this.rain.visible;
    this.rain.material.opacity = rain * .48;
    this.snow.material.opacity = snow * .85;
    this.motes.material.opacity = wind * .55 + fog * .13;
    this.splashes.material.opacity = rain * .2;
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const y = ((random(i, 1) * 17 - t * (12 + random(i, 2) * 6)) % 17 + 17) % 17;
        const x = focus + random(i, 3) * 44 - 22 - y * .12, z = random(i, 4) * 25 - 15;
        a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x + .07, y - .52, z);
      }
      a.needsUpdate = true;
      for (let i = 0; i < SPLASH_COUNT; i++) {
        const age = (t * 1.3 + random(i, 5)) % 1;
        dummy.position.set(focus + random(i, 6) * 32 - 16, .045, random(i, 7) * 12 - 6);
        dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.setScalar(.3 + Math.sin(age * Math.PI) * 1.3);
        dummy.updateMatrix(); this.splashes.setMatrixAt(i, dummy.matrix);
      }
      this.splashes.instanceMatrix.needsUpdate = true;
    }
    if (this.snow.visible) {
      const a = this.snow.geometry.attributes.position;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const y = ((random(i, 8) * 15 - t * (.65 + random(i, 9) * .5)) % 15 + 15) % 15;
        a.setXYZ(i, focus + random(i, 10) * 42 - 21 + Math.sin(t * .55 + i) * .6, y, random(i, 11) * 24 - 14);
      }
      a.needsUpdate = true;
    }
    if (this.motes.visible) {
      const a = this.motes.geometry.attributes.position;
      for (let i = 0; i < MOTE_COUNT; i++) {
        a.setXYZ(i, focus + ((random(i, 12) * 42 + t * 2.6) % 42) - 21,
          .3 + random(i, 13) * 5 + Math.sin(t + i) * .16, random(i, 14) * 23 - 13);
      }
      a.needsUpdate = true;
    }
    return { overcast: rain * .85 + snow * .45 + fog * .65 + wind * .16, fog };
  }
}
