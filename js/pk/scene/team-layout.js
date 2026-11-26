import { buildSoldier, buildCastle, CASTLE_X } from '../models.js';
import { bannerMaterial } from '../model/heraldry.js';

// side 只表示物理位置；阵营颜色、男女模型由房间 factions 决定。
export const teamLayoutMethods = {
  registerCampBanners(root, side) {
    const banners = [];
    root.traverse(o => { if (o.material === bannerMaterial(side)) banners.push(o); });
    this.campDecor.push({ side, paint: faction => banners.forEach(o => { o.material = bannerMaterial(faction); }) });
  },
  makeUnitModel(side, tier, kind) {
    const group = buildSoldier(this.factions[side], tier, kind);
    group.userData.facingSide = side;
    group.rotation.y = side ? Math.PI : 0;
    return group;
  },
  makeCastleModel(side, level) {
    const castle = buildCastle(this.factions[side], level);
    castle.rotation.y = side ? Math.PI : 0;
    castle.position.x = side ? CASTLE_X : -CASTLE_X;
    castle.userData.faction = this.factions[side];
    return castle;
  },
  setFactions(names) {
    if (!Array.isArray(names) || names.length !== 2 || !names.every(n => n === 'male' || n === 'female') || names[0] === names[1]) return;
    const next = names.map(n => n === 'male' ? 1 : 0);
    if (next.every((n, i) => n === this.factions[i])) return;
    this.factions = next;
    this.castles.forEach((old, side) => {
      this.scene.remove(old);
      const fresh = this.makeCastleModel(side, this.castleLv[side]);
      this.scene.add(fresh); this.castles[side] = fresh;
    });
    this.units.forEach(unit => {
      const old = unit.group, fresh = this.makeUnitModel(unit.side, unit.tier, unit.kind);
      fresh.position.copy(old.position); fresh.quaternion.copy(old.quaternion);
      this.scene.remove(old); this.scene.add(fresh); unit.group = fresh;
      if (unit.bar) unit.bar.fill.material = this.barMat[next[unit.side]];
    });
    this.clearCombatEffects();
    (this.campDecor || []).forEach(({ side, paint }) => paint(next[side]));
  },
};
