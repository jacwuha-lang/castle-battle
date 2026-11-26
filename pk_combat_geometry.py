"""身体安全间距与近战站位；与前端 combat-spacing.js 的视觉尺寸保持一致。"""

BASE_REACH = 1.30


def visual_scale(unit):
    if unit.get("kind") == "mage":
        return 1.07
    return (1.0, 1.07, 1.15, 1.5)[max(0, min(3, unit.get("tier", 1) - 1))]


def contact_distance(a, b):
    # 包含头盔、胸甲与前倾余量；不把刀剑、盾牌当成身体碰撞体。
    return .48 * (visual_scale(a) + visual_scale(b)) + .16


def melee_reach(a, b):
    return BASE_REACH + .55 * (visual_scale(a) + visual_scale(b) - 2)


def slot_offset(a, b, x, z):
    radius = melee_reach(a or {"tier": 1}, b) - .10
    length = (x * x + z * z) ** .5
    return x * radius / length, z * radius / length
