/* 武道擂台模型的兼容入口；具体实现按职责保存在 model/。 */
export { mat } from './model/shared.js';
export { groundTexture, brickTexture, roofTexture, woodTexture } from './model/textures.js';
export { buildSoldier } from './model/soldiers.js';
export { poseSoldier } from './model/soldier-pose.js';
export { buildCastle, CASTLE_X } from './model/castle.js';
export { buildTree, buildBush, buildRock } from './model/scenery.js';
