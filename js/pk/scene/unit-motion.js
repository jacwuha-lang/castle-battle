import { soldierScale } from '../model/visual-scale.js';
import { poseSoldier } from '../model/soldier-pose.js';
import { advancePosition } from './motion-track.js';
import { advanceHeading } from './unit-heading.js';
import { separateDisplayUnits } from './combat-spacing.js';
import { poseCombatContacts } from '../model/combat-contact.js';

const STATES = ['walk', 'wind', 'leap', 'smash', 'block', 'dodge', 'hurt', 'recover', 'aoe', 'shot', 'thrust', 'bash'];
// 与服务端 PK_ACT 保持一致；动作时钟不改变命中判定。
const DURATIONS = [0, .46, .76, .94, .55, .32, .26, .26, .90, .80, .90, .58];
const SPEEDS = [1.55, 1.65, 1.75, 1.95];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function observeAction(unit, code, progress, now) {
  const repeated = code !== 0 && progress + .18 < (unit.sampleProgress ?? progress);
  if (unit.actionCode !== code || repeated) {
    unit.k = progress;
    unit.actionCode = code;
    const data = unit.group.userData;
    data.attackCount = (data.attackCount || 0) + 1;
    data.attackVariant = (unit.group.id + data.attackCount) % 3;
  }
  unit.stc = code; unit.prog = progress; unit.sampleProgress = progress; unit.at = now;
}

export const unitMotionMethods = {
  frameUnits(dt) {
    const now = this.time;
    this.units.forEach(u => {
      const state = STATES[u.stc] || 'walk', fighting = state !== 'walk';
      if (u.actionCode !== u.stc) observeAction(u, u.stc, u.prog, u.at);
      const px = u.x, pz = u.z;
      advancePosition(u, now, dt);
      if (fighting) {
        const step = dt / (DURATIONS[u.stc] || .3);
        const predicted = Math.min(1, u.prog + Math.max(0, now - u.at) / DURATIONS[u.stc]);
        // 对快照的年龄做补偿，再逐帧校时；旧快照不会让手臂反复倒放。
        u.k = clamp(u.k + step + clamp(predicted - u.k - step, -step * .45, step * .65), 0, 1);
      } else u.k = 0;

      const moved = Math.hypot(u.x - px, u.z - pz) / Math.max(dt, .001);
      u.motionSpeed = (u.motionSpeed || 0) + (moved - (u.motionSpeed || 0)) * (1 - Math.exp(-dt * 10));
      const speed = SPEEDS[Math.min(3, u.tier - 1)] * (u.kind === 'charge' || u.kind === 'general' ? 1 : .5);
      const wantWalk = Math.min(1, u.motionSpeed / speed);
      u.walk += (wantWalk - u.walk) * (1 - Math.exp(-dt * 8));
    });
    separateDisplayUnits(this.units);
    this.units.forEach(u => {
      const state = STATES[u.stc] || 'walk', fighting = state !== 'walk';
      const heading = advanceHeading(this, u, dt);

      const g = u.group, enter = clamp((now - u.born) / .24, 0, 1);
      g.position.set(u.displayX, -.035 * (1 - enter), u.displayZ);
      g.scale.setScalar(soldierScale(u.tier, u.kind) * (.97 + enter * .03));
      g.rotation.y = heading;
      g.userData.motionSpeed = u.motionSpeed;
      poseSoldier(g, u.walk, state, u.k, now);
      if (u.bar) {
        u.bar.group.position.set(g.position.x, (g.userData.barHeight || 1.98) * g.scale.x + .08, g.position.z);
        u.bar.group.quaternion.copy(this.camera.quaternion);
        const hp = clamp(u.hp, 0, 1);
        u.bar.fill.scale.x = u.bar.w * hp; u.bar.fill.position.x = -u.bar.w * (1 - hp) / 2;
        u.bar.group.visible = hp > .001 || fighting;
      }
      if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(now * 4 + u.born) * .22;
    });
    poseCombatContacts(this.units, now, dt);
  },
};
