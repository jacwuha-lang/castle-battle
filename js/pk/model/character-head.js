import * as THREE from '../../../vendor/three.module.min.js';
import { mat, G, add, bakeGroup } from './shared.js';

const SKIN = 0xffd4ad, HAIR = 0x3f2928;
const sphere = () => G('headDetailSphere', () => new THREE.SphereGeometry(1, 14, 10));
function oval(parent, color, x, y, z, sx, sy, sz) {
  const m = add(parent, sphere(), mat(color), x, y, z); m.scale.set(sx, sy, sz); return m;
}

/* 正面朝 +X。脸部、盔壳、护颊分层，眼睛从盔檐下露出来。 */
export function buildCharacterHead(torso, { T, tier, kind, side }) {
  const head = new THREE.Group(); head.name = 'head';
  head.position.y = .44; torso.add(head);
  const general = tier >= 4, heroine = general && side === 0;
  head.scale.setScalar(1.12);
  oval(head, SKIN, .018, .208, 0, .224, .228, .216);
  oval(head, SKIN, .207, .16, 0, .052, .045, .042);
  [-1, 1].forEach(s => {
    oval(head, 0xffbc9b, .052, .16, s * .215, .047, .063, .027);
    oval(head, 0xfff7e9, .207, .224, s * .092, .026, .061, .049);
    oval(head, 0x37232b, .228, .225, s * .091, .018, .049, .034);
    oval(head, 0x9b613a, .239, .216, s * .091, .007, .027, .025);
    oval(head, 0x221e28, .245, .225, s * .09, .005, .032, .016);
    oval(head, 0xffffff, .25, .245, s * .082, .004, .012, .011);
    oval(head, 0xeb9a83, .198, .147, s * .143, .013, .022, .035);
    const brow = add(head, G('chibiBrow', () => new THREE.BoxGeometry(.014, .024, .086)),
      mat(HAIR), .22, .291, s * .09);
    brow.rotation.x = s * .16;
    if (heroine) oval(head, HAIR, .223, .269, s * .109, .012, .012, .048);
  });
  oval(head, 0x923f3c, .232, .105, 0, .009, .022, .033);
  oval(head, 0xfff3da, .24, .114, 0, .003, .007, .023);

  if (heroine) {
    oval(head, HAIR, -.04, .31, 0, .255, .21, .24);
    // 刘海分成弯曲发束，侧脸和眼睛保持可见。
    [-1, 0, 1].forEach(s => {
      const bang = oval(head, s ? 0x543331 : 0x654136, .146, .338 + s * .008,
        s * .115, .095, .116, .093);
      bang.rotation.x = s * .28; bang.rotation.z = -.26;
    });
    oval(head, 0xa4744f, .095, .428, .14, .11, .012, .019);
    oval(head, T.trim, -.22, .384, .06, .045, .048, .05);
    add(head, G('heroinePonytail', () => {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.22, .40, .02), new THREE.Vector3(-.36, .40, .025),
        new THREE.Vector3(-.46, .28, .04), new THREE.Vector3(-.53, .12, .06),
        new THREE.Vector3(-.65, .08, .1), new THREE.Vector3(-.72, .15, .12),
      ]);
      const geo = new THREE.TubeGeometry(path, 24, .115, 12, false), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = Math.floor(i / 13) / 24, c = path.getPointAt(t);
        const taper = 1.08 - t * .85;
        p.setXYZ(i, c.x + (p.getX(i) - c.x) * taper,
          c.y + (p.getY(i) - c.y) * taper, c.z + (p.getZ(i) - c.z) * taper);
      }
      geo.computeVertexNormals(); return geo;
    }), mat(0x4a2e29));
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? .035 : .076;
      if (!i) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    add(head, G('heroineStar', () => new THREE.ExtrudeGeometry(star,
      { depth: .017, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 1 })),
    mat(T.trim), .085, .385, .228);
    return head;
  }

  if (kind === 'mage') {
    oval(head, HAIR, -.01, .28, 0, .234, .22, .225);
    add(head, G('chibiMageHat', () => new THREE.ConeGeometry(.25, .29, 16)),
      mat(T.cloth2), -.02, .485, 0).rotation.z = .10;
    add(head, G('chibiMageBand', () => new THREE.CylinderGeometry(.279, .285, .055, 18)),
      mat(T.trim), .008, .35, 0);
    oval(head, 0xc7f6ff, -.038, .661, 0, .027, .027, .027);
    return head;
  }

  const t2 = tier >= 2, t3 = tier >= 3;
  const helm = add(head, G('enamelHelmet', () => new THREE.SphereGeometry(.252, 22, 14, 0, Math.PI * 2, 0, 1.43)),
    mat(tier === 1 ? T.cloth2 : T.cloth), -.008, .223, 0);
  helm.scale.set(1.04, 1, 1);
  add(head, G('helmetRim', () => new THREE.CylinderGeometry(.259, .267, .045, 24)),
    mat(t3 ? T.trim : T.metal), -.008, .267, 0);
  // 盔顶银脊沿 X 延伸，不用横向胶囊冒充盔缨。
  const ridge = add(head, G('helmetRidge', () => new THREE.SphereGeometry(1, 14, 10)),
    mat(T.metal), -.008, .39, 0);
  ridge.scale.set(.227, .085, .031);
  [-1, 1].forEach(s => {
    oval(head, t3 ? T.trim : T.metal, -.043, .181, s * .219, .128, .117, .044);
    oval(head, T.cloth2, -.025, .2, s * .25, .084, .066, .014);
    oval(head, T.trim, .03, .19, s * .266, .018, .019, .01);
    oval(head, T.trim, .137, .28, s * .188, .017, .017, .016);
  });
  if (t2) {
    const nose = add(head, G('helmetNasal', () => new THREE.BoxGeometry(.033, .102, .04)),
      mat(T.metal), .248, .26, 0);
    nose.rotation.z = -.08;
  }
  // 分级轮廓：一级短羽毛，二级马尾，三级/将军弧形长缨。
  const plume = new THREE.Group(); head.add(plume);
  const pc = side === 0 ? 0xe5f1ff : 0xe34339;
  const count = general ? 7 : t3 ? 5 : t2 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const f = i / count;
    const m = oval(plume, i % 2 ? pc : (side ? 0xb52531 : 0xb8d5f5),
      -.02 - f * .23, .48 + Math.sin(f * Math.PI) * .13 - f * .05, 0,
      .06 + f * .018, .088, .055 * (1 - f * .5));
    m.rotation.z = -f * .9;
  }
  bakeGroup(plume);
  if (general) {
    oval(head, HAIR, .172, .065, 0, .091, .086, .127);
    [-1, 1].forEach(s => oval(head, 0x51372e, .228, .117, s * .048, .026, .035, .058));
    oval(head, 0xffd4ad, .245, .071, 0, .01, .025, .027);
    const badge = add(head, G('commanderHelmBadge', () => new THREE.OctahedronGeometry(.06)),
      mat(T.trim), .217, .35, 0); badge.scale.x = .3;
  }
  return head;
}
