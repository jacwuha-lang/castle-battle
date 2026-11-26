import { soldierScale } from '../model/visual-scale.js';

// 与 pk_combat_geometry.py 一致；只修正快照插值后的显示位置，不改服务端战斗坐标。
export function bodySpacing(a, b) {
  return .48 * (soldierScale(a.tier, a.kind) + soldierScale(b.tier, b.kind)) + .16;
}

export function separateDisplayUnits(units) {
  const list = [...units.values()];
  list.forEach(u => { u.displayX = u.x; u.displayZ = u.z; });
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], separation = bodySpacing(a, b);
      let dx = b.displayX - a.displayX, dz = b.displayZ - a.displayZ, distance = Math.hypot(dx, dz);
      if (distance >= separation) continue;
      const overlap = separation - distance;
      if (distance < .0001) { dx = a.id < b.id ? 1 : -1; dz = 0; distance = 1; }
      const push = overlap * .5;
      a.displayX -= dx / distance * push; a.displayZ -= dz / distance * push;
      b.displayX += dx / distance * push; b.displayZ += dz / distance * push;
    }
  }
}
