const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
const ATTACKS = new Set([1, 2, 3, 8, 9, 10, 11]);

function opponent(world, unit) {
  const chosen = world.units.get(unit.foe);
  if (chosen && chosen.side !== unit.side) return chosen;
  let target = world.units.get(unit.lookTarget);
  if (target && world.time < (unit.lookUntil || 0)) return target;
  let nearest = 7;
  target = null;
  world.units.forEach(other => {
    if (other.side === unit.side) return;
    const d = Math.hypot(other.x - unit.x, other.z - unit.z);
    if (d < nearest) { nearest = d; target = other; }
  });
  unit.lookTarget = target?.id; unit.lookUntil = world.time + .24;
  return target;
}

export function advanceHeading(world, unit, dt) {
  const base = unit.side ? Math.PI : 0, current = base + unit.yaw;
  const data = unit.group.userData, speed = unit.motionSpeed || 0, fighting = unit.stc !== 0;
  if (speed > .18) unit.travelHeading = Math.atan2(-(unit.vz || 0), unit.vx || 0);
  const moving = speed > .18, target = opponent(world, unit);
  const distance = target ? Math.hypot(target.x - unit.x, target.z - unit.z) : Infinity;
  const targetYaw = target ? Math.atan2(-(target.z - unit.z), target.x - unit.x) : base;
  let desired = moving ? (unit.travelHeading ?? current) : current;
  if (target && (fighting || distance < 2.5)) {
    const aim = fighting || !moving ? 1 : clamp((2.5 - distance) / 1.15, 0, 1);
    desired += angle(targetYaw - desired) * aim;
  } else if (fighting) desired = base;

  // 一次出招保持同一个主要朝向；侧后方新目标留给收招后的转身。
  if (ATTACKS.has(unit.stc)) {
    if (unit.headingSerial !== data.attackCount) {
      unit.headingSerial = data.attackCount; unit.attackHeading = desired;
    }
    if (unit.k > .2 && unit.k < .94) desired = unit.attackHeading ?? desired;
  }
  let heading = current, velocity = unit.turnVelocity || 0;
  const maxSpeed = moving ? 3.8 : 5.6, maxAcceleration = moving ? 26 : 36;
  const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    let error = angle(desired - heading);
    if (Math.abs(error) > Math.PI - .04) error = Math.abs(error) * (unit.turnSign || (unit.id % 2 ? 1 : -1));
    const acceleration = clamp(error * 48 - velocity * 14, -maxAcceleration, maxAcceleration);
    velocity = clamp(velocity + acceleration * h, -maxSpeed, maxSpeed);
    heading += velocity * h;
    if (Math.abs(velocity) > .08) unit.turnSign = Math.sign(velocity);
  }
  unit.turnVelocity = velocity; unit.yaw = heading - base;
  data.turnRate = velocity;
  data.aimYaw = clamp(angle(target ? targetYaw - heading : desired - heading), -.6, .6);
  const travel = angle((unit.travelHeading ?? heading) - heading);
  data.gaitDirection = moving ? Math.cos(travel) : 1;
  data.gaitStrafe = moving ? -Math.sin(travel) : 0;
  data.turnStep = clamp(Math.abs(velocity) / 2.6, 0, 1) * (1 - clamp(speed / .65, 0, 1));
  data.combatReady = target && distance < (data.kind === 'mage' ? 14 : 4) ? 1 : 0;
  return heading;
}
