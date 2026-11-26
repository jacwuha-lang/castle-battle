import * as THREE from '../../../vendor/three.module.min.js';

// 足够的夜间补光保留阵营、武器和血条的辨识度。
const PALETTES = [
  [0, 0x10203e, 0x405577, 0x394b66, 0xa9c7ff, 0x486582, .87, .32, .72],
  [5, 0x514b7d, 0xe6ac9c, 0xb1a2ad, 0xffd6b1, 0x7d6c83, 1.08, 1.05, .65],
  [8, 0x4088d2, 0xd6e9e7, 0xc8deea, 0xffedca, 0xbeb580, 1.55, 2.1, .85],
  [15, 0x3983cf, 0xd6e9e7, 0xc8deea, 0xffedca, 0xbeb580, 1.55, 2.1, .85],
  [18, 0x5e679d, 0xf4b17c, 0xc5a9a0, 0xffb478, 0x9b8178, 1.25, 1.7, .7],
  [21, 0x142746, 0x465d80, 0x3d506c, 0xb7d3ff, 0x52677f, .9, .38, .72],
  [24, 0x10203e, 0x405577, 0x394b66, 0xa9c7ff, 0x486582, .87, .32, .72],
].map(([hour, zenith, horizon, fog, sun, ground, hemi, key, fill]) => ({
  hour, colors: [zenith, horizon, fog, sun, ground].map(c => new THREE.Color(c)), hemi, key, fill,
}));
const color = new THREE.Color(), cloudTint = new THREE.Color();
const hazeTint = new THREE.Color(0x8b9dad);

function discTexture(moon = false) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
  glow.addColorStop(0, moon ? '#e5efff' : '#fff0be');
  glow.addColorStop(.45, moon ? '#c5dcff60' : '#ffcc6e80'); glow.addColorStop(1, '#ffffff00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = moon ? '#e5efff' : '#fff6d4'; ctx.beginPath(); ctx.arc(64, 64, 23, 0, Math.PI * 2); ctx.fill();
  if (moon) {
    ctx.fillStyle = '#9bb7db';
    [[56, 55, 5], [69, 70, 7], [74, 56, 3]].forEach(([x, y, r]) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    });
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export class SkyCycle {
  constructor(world) {
    this.world = world;
    this.material = new THREE.ShaderMaterial({
      uniforms: { zenith: { value: PALETTES[2].colors[0].clone() }, horizon: { value: PALETTES[2].colors[1].clone() } },
      vertexShader: 'varying float height; void main(){ height=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying float height; uniform vec3 zenith; uniform vec3 horizon;
        void main(){gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-0.12,0.32,height)),1.0);
        #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
    });
    if (world.skyDome) {
      const old = world.skyDome.material;
      world.skyDome.material = this.material;
      if (old.map) old.map.dispose(); old.dispose();
    }
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(), depthWrite: false, fog: false, toneMapped: false }));
    this.moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(true), depthWrite: false, fog: false, toneMapped: false }));
    this.sunDisc.scale.set(16, 16, 1); this.moonDisc.scale.set(13, 13, 1);
    world.scene.add(this.sunDisc, this.moonDisc);
    const p = [];
    for (let i = 0; i < 180; i++) {
      const a = i * 2.399963, y = .08 + (i + .5) / 180 * .88, r = Math.sqrt(1 - y * y) * 132;
      p.push(Math.cos(a) * r, y * 132 - 8, Math.sin(a) * r);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdceaff, size: .24, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
    this.stars.name = 'nightStars'; world.scene.add(this.stars);
  }

  frame(hour, overcast, t) {
    const w = this.world;
    let i = 0;
    while (i < PALETTES.length - 2 && hour > PALETTES[i + 1].hour) i++;
    const a = PALETTES[i], b = PALETTES[i + 1], k = (hour - a.hour) / (b.hour - a.hour);
    const darkness = Math.max(0, Math.min(1, (Math.abs(hour - 12) - 6) / 3));
    hazeTint.setHex(0x8b9dad).lerp(color.setHex(0x263b5a), darkness);
    const mix = (index, target) => target.copy(a.colors[index]).lerp(b.colors[index], k);
    mix(0, this.material.uniforms.zenith.value).lerp(hazeTint, overcast * .55);
    mix(1, this.material.uniforms.horizon.value).lerp(hazeTint, overcast * .45);
    mix(2, w.scene.fog.color).lerp(hazeTint, overcast * .36);
    w.scene.background.copy(w.scene.fog.color);
    mix(3, w.sun.color);
    mix(4, w.hemi.groundColor);
    w.hemi.color.copy(this.material.uniforms.horizon.value).lerp(color.setHex(0xe4f2ff), .5);
    w.hemi.intensity = (a.hemi + (b.hemi - a.hemi) * k) * (1 - overcast * .18);
    w.sun.intensity = (a.key + (b.key - a.key) * k) * (1 - overcast * .62);
    w.fill.intensity = a.fill + (b.fill - a.fill) * k;
    w.renderer.toneMappingExposure = 1.12;
    const night = Math.max(0, Math.min(1, (1.3 - w.sun.intensity) / .95));
    cloudTint.setHex(0xffffff).lerp(color.setHex(0x5b7195), night * .7).lerp(hazeTint, overcast * .4);
    (w.skyRidges || []).forEach(m => m.material.color.copy(cloudTint));
    w.clouds.forEach(c => {
      // 烘焙材质被许多网格共用，云朵需使用自己的材质。
      c.children.forEach(m => { if (m.material) m.material.color.copy(cloudTint); });
    });
    const angle = (hour - 6) / 24 * Math.PI * 2;
    this.sunDisc.position.set(Math.cos(angle) * 60, Math.sin(angle) * 30 + 3, -100);
    this.moonDisc.position.set(-Math.cos(angle) * 42, -Math.sin(angle) * 21 + 5, -102);
    this.sunDisc.material.opacity = Math.min(1, Math.max(0, Math.sin(angle) * 4)) * (1 - overcast * .85);
    this.moonDisc.material.opacity = Math.min(1, Math.max(0, -Math.sin(angle) * 3)) * (1 - overcast * .7);
    this.sunDisc.visible = this.sunDisc.position.y > 0;
    this.moonDisc.visible = this.moonDisc.position.y > 0;
    this.stars.material.opacity = darkness * (1 - overcast) * (.75 + .08 * Math.sin(t * .6));
    this.stars.visible = this.stars.material.opacity > .01;
  }
}
