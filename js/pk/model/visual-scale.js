// 只定义外观体量；兵种的属性、射程与碰撞仍由服务器决定。
const TIER_SCALE = [1, 1.07, 1.15, 1.5];

export function soldierScale(tier, kind = 'charge') {
  return kind === 'mage' ? TIER_SCALE[1] : TIER_SCALE[Math.max(0, Math.min(3, tier - 1))];
}
