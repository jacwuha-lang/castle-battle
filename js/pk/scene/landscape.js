import { buildValleySky } from './backdrop.js';
import { buildTerrain } from './terrain.js';
import { buildRoadside } from './roadside.js';

/* 场景入口保留给 World；各部分的生成与细节在自己的模块里维护。 */
export const landscapeMethods = {
  buildSky() { buildValleySky(this); },
  buildGround() { buildTerrain(this); },
  buildScenery() { buildRoadside(this); },
};
