import { clamp, ease, mix, samplePose } from './pose-curves.js';

const KEYS = ['armR', 'foreR', 'lean', 'roty', 'bodyX', 'bodyY', 'legR', 'legL', 'kneeR', 'kneeL', 'bladeAngle', 'armDepth'];
const IDLE = [.28, 1, .015, 0, 0, 0, .12, -.14, -.06, -.10, -1.25, -.08];
const CUT = [.95, .28, .24, .24, .13, -.035, .38, -.28, -.30, -.06, -2.12, .22];
const LOAD = [1.55, .66, -.10, -.25, -.04, -.015, .14, -.20, -.16, -.10, .38, -.18];
const CLIPS = {
  wind: [[0, ...IDLE], [.60, ...LOAD], [.73, ...LOAD], [1, ...CUT]],
  leap: [[0, ...IDLE],
    [.23, 1.42, .7, -.10, -.18, -.035, -.025, .32, -.24, -.42, -.35, .27, -.18],
    [.40, 1.58, .58, -.08, -.20, .045, .32, .3, -.12, -.65, -.40, .42, -.12],
    [.42 / .76, ...CUT],
    [.67, .90, .34, .18, .2, .1, -.045, .38, -.30, -.42, -.32, -2.25, .18], [1, ...IDLE]],
  smash: [[0, ...IDLE], [.34, ...LOAD], [.51, ...LOAD],
    [.62 / .94, 1.02, .24, .30, .28, .12, -.055, .40, -.30, -.37, -.20, -2.25, .25],
    [1, .85, .52, .12, .12, .035, 0, .25, -.22, -.17, -.10, -1.85, .08]],
  aoe: [[0, ...IDLE],
    [.30, .9, .7, -.08, -.55, -.04, -.02, .27, -.30, -.23, -.16, -.45, -.4],
    [.5 / .9, .95, .35, .2, .75, .1, -.035, .34, -.35, -.28, -.22, -1.7, .3],
    [.76, .75, .55, .12, .85, .06, 0, .30, -.32, -.23, -.18, -2.0, .24], [1, ...IDLE]],
};

export function meleePose(p, st, k, data) {
  const frames = CLIPS[st];
  if (frames) {
    samplePose(p, KEYS, frames, k);
    if (st === 'wind' && data.attackVariant === 1) {
      p.roty *= -.7; p.armDepth *= -.65; p.bladeAngle += Math.sin(k * Math.PI) * .18;
    }
    p.hipTurn = -p.roty * .25;
    p.headNod = -p.lean * .12;
    p.roll = Math.sin(k * Math.PI) * .035;
    return;
  }
  if (st === 'recover') {
    const from = data.recoverFrom;
    if (from) for (const key of KEYS) p[key] = mix(from[key] ?? p[key], p[key], ease(k));
    p.hipTurn = -p.roty * .25;
  } else if (st === 'hurt') {
    const w = k < .16 ? ease(k / .16) : Math.pow(1 - clamp((k - .16) / .84), 2);
    p.lean = -.19 * w; p.bodyTilt = -.055 * w; p.bodyX = -.07 * w;
    p.headNod = .13 * w; p.roty = -.10 * w;
    p.legR = mix(.12, -.16, w); p.legL = mix(-.14, .22, w);
    p.kneeR = -.26 * w; p.kneeL = -.12 * w;
  } else if (st === 'block') {
    const w = ease(Math.min(k / .18, (1 - k) / .25));
    p.armL = mix(p.armL, data.hasShield ? .82 : .68, w);
    p.foreL = mix(p.foreL, data.hasShield ? 1.85 : 1.15, w);
    p.armR = mix(p.armR, .5, w); p.foreR = mix(p.foreR, 1.18, w);
    p.bladeAngle = mix(p.bladeAngle, -.38, w);
    p.bodyX = -.035 * w; p.lean = .10 * w;
    p.legR = .24; p.legL = -.3; p.kneeR = -.23; p.kneeL = -.17;
  } else if (st === 'dodge') {
    const w = Math.sin(clamp(k) * Math.PI);
    p.bodyX = -.16 * w; p.bodyTilt = -.08 * w; p.lean = -.08 * w;
    p.legR = mix(.12, -.2, w); p.legL = mix(-.14, .34, w);
    p.kneeR = -.30 * w; p.kneeL = -.15 * w;
  }
}
