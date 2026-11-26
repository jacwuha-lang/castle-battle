import * as THREE from '../../../vendor/three.module.min.js';

export function seededRandom(initial = 193) {
  let state = initial;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/* 分散的草叶、花和路石按几何批量绘制。 */
export function instances(geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const obj = new THREE.Object3D(), color = new THREE.Color();
  items.forEach((it, i) => {
    obj.position.set(it.x || 0, it.y || 0, it.z || 0);
    obj.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    obj.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1); obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);
    if (it.c != null) mesh.setColorAt(i, color.setHex(it.c));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
