/* ============================================================
   main.js — 擂台的界面与流程
   ------------------------------------------------------------
    大厅 → 建房/进房（扣 50⭐）→ 开打（上战场 + 下题目）
         → 推倒城堡 → 结算（+75⭐ / 报名费没了）→ 回大厅

   题目判对错在本地做（题是本地生成的），但「出兵」必须服务器点头：
   本地只是先画出来，等服务端快照回来再对齐，避免两边各自算、
   打到最后血量对不上。
   ============================================================ */

import { World } from './scene.js';
import { QuestionBank } from './questions.js';
import { Net, SANDBOX } from './net.js';
import { sfx } from './sfx.js';
import { initFactionChoice } from './ui/faction-choice.js';
import { initEnvironmentControls } from './ui/environment-controls.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const REASON = {
  castle: ['推倒了对面城堡', '城堡被推倒了'],
  time: ['时间到，血多的一方赢', '时间到，就差一点点'],
  'foe-left': ['对手离开了擂台', '你中途离开了'],
  offline: ['对手掉线了', '你掉线了'],
};

const S = {
  who: '',
  phase: 'lobby',
  side: 0,
  code: '',
  stars: 0,
  q: null,
  typed: '',
  seq: 0,
  lock: true,
  combo: 0,
  maxCombo: 0,
  right: 0,
  wrong: 0,
  me: null,
  op: null,
  over: null,
  sideKnown: false,
  hints: 0,        /* 这道题已经买了几次提示 */
  hpMax: 500,
  hpMaxArr: [500, 500],   /* 两边城堡各自的上限（等级不同上限不同） */
  buffs: [],
  ai: '',          /* 打 AI 时是哪一档，'', easy/normal/hard/boss */
  upper: true,     /* 键盘显示大写还是小写 */
  wrongList: [],   /* 本局错的题：结算要一条条摆出来，不是只报个数字 */
};

/* 连击的奖励表：3 的倍数出二级兵、8 的倍数出三级兵、10 的倍数额外送一个方士、
   20 的倍数出武将。同时踩中好几个取最高的那个 —— 和 server.py 的
   tier_for_combo 是同一套规则（方士是「额外出」，不占出兵名额）。 */
const MILESTONE = [
  { step: 3, name: '二级兵' },
  { step: 8, name: '三级兵' },
  { step: 10, name: '方士' },
  { step: 20, name: '武将' },
];
const TIER_NAME = { 1: '一级兵', 2: '二级兵', 3: '三级兵', 4: '武将' };

function nextMilestone(combo) {
  let best = null;
  for (let i = 0; i < MILESTONE.length; i++) {
    const m = MILESTONE[i];
    const at = (Math.floor(combo / m.step) + 1) * m.step;
    if (!best || at < best.at || (at === best.at && m.step > best.step)) {
      best = { at: at, name: m.name, step: m.step };
    }
  }
  return best;
}

let world = null;
let bank = null;
let net = null;
let factionChoice = null;

/* ---------------- 小工具 ---------------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mmss(sec) {
  const t = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function show(id) {
  document.querySelectorAll('.veil').forEach((v) => v.classList.add('hide'));
  if (id) $(id).classList.remove('hide');
}

function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(banner._t);
  banner._t = setTimeout(() => el.classList.remove('on'), 1400);
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), 1800);
}

/* 声音开关：状态记在 localStorage，下次进来还是静音 */
function initMute() {
  const b = $('btnMute');
  if (!b) return;
  const muted = sfx.loadMuted();
  b.textContent = muted ? '🔇' : '🔊';
  b.classList.toggle('off', muted);
  b.onclick = (e) => {
    e.stopPropagation();
    sfx.init();
    const m = !sfx.muted;
    sfx.setMuted(m);
    b.textContent = m ? '🔇' : '🔊';
    b.classList.toggle('off', m);
    if (!m) sfx.play('ui');
  };
}

/* 沙盒模式（pk.html?free=1）：把「要花星」的地方改成「不花星」的说法。
   真正的扣星/加星都在服务器那边跳过，这里只是别让界面骗人。 */
function initSandbox() {
  if (!SANDBOX) return;
  const tag = $('sandboxTag');
  if (tag) tag.classList.remove('hide');
  const fee = $('feeTag');
  if (fee) fee.textContent = '沙盒模式 · 随便打，不记账';
  const wf = $('waitFee');
  if (wf) wf.textContent = '沙盒模式：随便打，不记账';
  /* 「取消并退星」在沙盒下是假话：本来就没扣，改个不带退星的写法 */
  const bc = $('btnCancel');
  if (bc) bc.textContent = '取消房间';
}

function hint(text, bad) {
  const el = $('lobbyHint');
  el.textContent = text || '';
  el.classList.toggle('bad', !!bad);
}

/* ---------------- 启动 ---------------- */
function boot() {
  /* 独立版没有上层档案：名字就在大厅里填，记在本机，
     服务器按这个名字开一间房（顺便在 profiles/ 里建一份小档案）。 */
  let saved = '';
  try { saved = localStorage.getItem('cb_name') || ''; } catch (e) { saved = ''; }
  S.who = (params.get('who') || saved || '').trim();

  world = new World($('stageCanvas'));
  world.setSide(null);          // 大厅：全景
  initEnvironmentControls(world);

  bank = new QuestionBank();
  net = new Net(S.who);
  factionChoice = initFactionChoice(net);
  net.onState = onState;
  net.onGone = onGone;

  const whoInput = $('whoInput');
  if (whoInput) {
    whoInput.value = S.who;
    whoInput.addEventListener('input', (e) => {
      S.who = e.target.value.trim();
      net.who = S.who;
      try { localStorage.setItem('cb_name', S.who); } catch (err) { /* 隐私模式 */ }
    });
  }

  $('btnCreate').onclick = createRoom;
  $('btnJoin').onclick = joinRoom;
  document.querySelectorAll('.chip[data-ai]').forEach((b) => {
    b.onclick = () => startAI(b.dataset.ai, b);
  });
  $('codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });
  /* 全局物理键盘：答题（1-4 / 字母 / 退格）都走这一条 */
  window.addEventListener('keydown', onPhysKey);
  $('codeInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });
  $('btnHint').onclick = buyHint;
  initMute();
  initSandbox();
  $('btnCancel').onclick = cancelRoom;
  $('btnHome').onclick = goHome;
  $('btnAgain').onclick = () => { net.beaconLeave(); net.stop(); location.reload(); };

  /* 关页面 / 切后台：至少告诉服务器一声，对手不用干等 8 秒。
     错题也顺手存一下 —— 打到一半关掉，错过的题不该白错。 */
  window.addEventListener('pagehide', () => {
    if (S.phase === 'play' || S.phase === 'wait') net.beaconLeave();
    saveWrongList();
  });

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    world.frame(dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  show('lobby');
}

/* 开打前把大厅输入框里的名字收进来：没有名字服务器不知道房间归谁 */
function takeName() {
  const el = $('whoInput');
  if (el) S.who = el.value.trim();
  if (S.who) {
    net.who = S.who;
    try { localStorage.setItem('cb_name', S.who); } catch (e) { /* 隐私模式 */ }
    return true;
  }
  hint('先在上面给自己起个名字，就能开打了', true);
  if (el) el.focus();
  return false;
}

/* ---------------- 大厅 ---------------- */
async function createRoom() {
  if (!takeName()) return;
  sfx.init();                 /* 浏览器要一次用户手势才肯出声，就挂在这儿 */
  sfx.play('ui');
  const btn = $('btnCreate');
  btn.disabled = true;
  hint('正在开房…');
  try {
    const r = await net.create();
    if (!r.ok) { hint(r.error || '开房失败', true); return; }
    S.code = r.code;
    S.side = r.side;
    world.setFactions(r.factions);
    factionChoice.paint(S.side, r.factions);
    S.stars = r.stars || 0;
    S.sideKnown = true;
    $('roomCode').textContent = r.code;
    hint('');
    show('wait');
    S.phase = 'wait';
    net.start(r.code);
  } catch (e) {
    hint('连不上服务器，看一眼命令行窗口还开着没', true);
  } finally {
    btn.disabled = false;
  }
}

async function joinRoom() {
  const code = $('codeInput').value.trim();
  if (code.length !== 4) { hint('房间号是 4 位数字', true); return; }
  if (!takeName()) return;
  sfx.init();
  sfx.play('ui');
  const btn = $('btnJoin');
  btn.disabled = true;
  hint('正在进房…');
  try {
    const r = await net.join(code);
    if (!r.ok) { hint(r.error || '进不去', true); return; }
    S.code = r.code;
    S.side = r.side;
    S.stars = r.stars;
    S.sideKnown = true;
    S.phase = 'play';
    show(null);
    $('hud').classList.remove('hide');
    $('panel').classList.remove('hide');
    world.reset();
    world.setFactions(r.factions);
    world.setSide(S.side);
    factionChoice.paint(S.side, r.factions);
    net.start(r.code);
    banner('开打！');
    ask();
  } catch (e) {
    hint('连不上服务器，看一眼命令行窗口还开着没', true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- AI 练功房 ----------------
   点一下难度就直接开打：服务器建房的同时把机器人摆进 1 号位，
   房间状态直接是 playing，所以没有「等人」那一屏，也不用输房间号。
   机器人不答题、只在服务器里按节奏喂「答对/答错」，
   出兵、连击、城堡升级、箭雨全和真人同一套逻辑。 */
async function startAI(level, chip) {
  if (!takeName()) return;
  sfx.init();
  sfx.play('ui');
  const chips = Array.prototype.slice.call(document.querySelectorAll('.chip[data-ai]'));
  chips.forEach((b) => { b.disabled = true; });
  if (chip) chip.classList.add('busy');
  hint('正在叫 AI 上场…');
  try {
    const r = await net.create(level);
    if (!r.ok) { hint(r.error || '开打失败', true); return; }
    S.code = r.code;
    S.side = r.side;
    S.stars = r.stars;
    S.sideKnown = true;
    S.ai = r.ai || level;
    S.phase = 'play';
    hint('');
    world.reset();
    world.setFactions(r.factions);
    world.setSide(S.side);
    factionChoice.paint(S.side, r.factions);
    show(null);
    $('hud').classList.remove('hide');
    $('panel').classList.remove('hide');
    net.start(r.code);
    banner('开打！');
    ask();
  } catch (e) {
    hint('连不上服务器，看一眼命令行窗口还开着没', true);
  } finally {
    chips.forEach((b) => { b.disabled = false; });
    if (chip) chip.classList.remove('busy');
  }
}

async function cancelRoom() {
  const btn = $('btnCancel');
  btn.disabled = true;
  try {
    await net.cancel();
    net.stop();
    S.code = '';
    S.phase = 'lobby';
    world.setSide(null);
    show('lobby');
    hint('');
  } catch (e) {
    hint('取消失败，网络抖了一下', true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- 对局 ---------------- */
function startBattle(snap) {
  S.phase = 'play';
  if (snap.me) S.side = snap.me.side;
  world.reset();          /* 上一局砸碎的城、躺着的兵都清掉 */
  world.setFactions(snap.factions);
  world.setSide(S.side);
  factionChoice.paint(S.side, snap.factions);
  show(null);
  $('hud').classList.remove('hide');
  $('panel').classList.remove('hide');
  banner('开打！');
  ask();
}

function onState(snap) {
  if (snap.state === 'waiting') return;

  if (snap.state === 'playing') {
    if (S.phase !== 'play') startBattle(snap);
    applySnap(snap);
    return;
  }

  if (snap.state === 'over') {
    applySnap(snap);
    if (S.phase !== 'over') endBattle(snap);
  }
}

function paintCastleHealth(id, value, maximum) {
  const max = Number(maximum) || 1;
  const hp = Math.max(0, Number(value) || 0);
  const percent = Math.max(0, Math.min(100, hp / max * 100));
  const fill = $('hp' + id);
  fill.style.width = percent + '%';
  fill.parentElement.setAttribute('aria-valuenow', String(Math.round(percent)));
  $('hpText' + id).textContent = Math.ceil(hp) + ' / ' + Math.ceil(max);
}

function applySnap(snap) {
  if (snap.me) {
    S.me = snap.me;
    S.side = snap.me.side;
    S.right = snap.me.right;
    S.wrong = snap.me.wrong;
    if (snap.me.combo > S.maxCombo) S.maxCombo = snap.me.combo;
  }
  S.op = snap.op;
  world.setFactions(snap.factions);
  factionChoice.paint(S.side, snap.factions);

  const mine = S.side;
  const foes = 1 - mine;
  const mx = snap.hpmax || [snap.max || 500, snap.max || 500];
  S.hpMaxArr = mx;
  S.hpMax = mx[mine];

  paintCastleHealth('Me', snap.hp[mine], mx[mine]);
  paintCastleHealth('Op', snap.hp[foes], mx[foes]);
  $('nmMe').textContent = S.who;
  $('nmOp').textContent = (snap.op && snap.op.who) || '对手';

  /* 城堡等级：升级那一下弹一下，让「连击真的变强了」看得见。
     城堡本身也按等级换外形（腰檐 / 箭孔 / 附塔 / 金冠），见 scene.setCastleLevel */
  const lv = snap.lv || [1, 1];
  paintLv($('lvMe'), lv[mine]);
  paintLv($('lvOp'), lv[foes]);
  world.setCastleLevel(mine, lv[mine]);
  world.setCastleLevel(foes, lv[foes]);

  let tm = 0, to = 0;
  for (let i = 0; i < snap.soldiers.length; i++) {
    if (snap.soldiers[i][1] === mine) tm++; else to++;
  }
  $('troopMe').textContent = tm + ' 兵';
  $('troopOp').textContent = to + ' 兵';

  $('clock').textContent = mmss(snap.t);
  const combo = (snap.me && snap.me.combo) || 0;
  $('comboTag').textContent = combo >= 2 ? '连击 x' + combo : '';
  const nm = nextMilestone(combo);
  $('comboNext').textContent = nm ? '再 ' + (nm.at - combo) + ' 题：' + nm.name : '';
  $('score').textContent = '答对 ' + S.right + ' · 答错 ' + S.wrong;

  world.sync(snap.soldiers, world.time, snap.t);
  handleEvents(snap.ev, snap.t);
}

function paintLv(el, n) {
  if (!el) return;
  const was = Number(el.dataset.lv || 1);
  el.textContent = 'Lv' + n;
  el.dataset.lv = n;
  if (n > was) {
    el.classList.remove('up');
    void el.offsetWidth;
    el.classList.add('up');
  }
}

/* 服务器把「谁在第几秒挥了刀、谁挨了一下」写成事件流推过来，
   这边负责两件事：放特效（箭雨、升级）和按离镜头的远近配音量。
   远处的兵打架声音小一点，不然十个人一起砍就是一团噪音。 */
const EV_SFX = {
  wind: 'swing', shot: 'arrow', thrust: 'swing', bash: 'swing', leap: 'leap', hit: 'hit', block: 'block',
  dodge: 'dodge', smash_wind: 'swing', smash: 'smash', die: 'die',
  miss: 'swing', aoe_wind: 'boss', aoe: 'aoe', aoehit: 'hit',
  bossheal: 'boss',
  mage_cast: 'magic',
};

function handleEvents(list, serverTime) {
  if (!world || !list || !list.length) return;
  const focus = world.focus || 0;
  const picks = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.k === 'projectile') {
      const age = Number.isFinite(e.at) && Number.isFinite(serverTime) ? Math.max(0, serverTime - e.at) : 0;
      world.soldierProjectile(e, age);
      continue;
    }
    if (e.k === 'general_spawn') {
      banner(e.s === S.side ? '⚔️ 我方武将出战！' : '⚔️ 敌方武将出战！');
      sfx.play('boss', 0.85);
      continue;
    }
    if (e.k === 'volley') {
      const age = Number.isFinite(e.at) && Number.isFinite(serverTime)
        ? Math.max(0, serverTime - e.at) : 0;
      world.volley(e.sd, e.a || [], e.fly, age);
      banner(e.sd === S.side ? '🏹 箭雨！' : '对面放箭了');
      continue;
    }
    if (e.k === 'levelup') {
      const mine = e.sd === S.side;
      banner((mine ? '你的城堡' : '对手城堡') + ' 升级 Lv' + e.lv);
      sfx.play('levelup', mine ? 0.9 : 0.45);
      /* 不等下一次快照，立刻换外形：升级那一瞬间城就该「长高一层」 */
      world.setCastleLevel(e.sd, e.lv);
      continue;
    }
    if (e.k === 'fangshi_spawn') {
      banner(e.s === S.side ? '我方方士登场' : '对面来了个方士');
      sfx.play('magic', 0.55);
      continue;
    }
    if (e.k === 'heal') {
      if (e.sd === S.side) flash('🏰', '城堡回血 +' + e.n, 'hint');
      sfx.play('heal', 0.5);
      continue;
    }
    if (e.k === 'bossheal') {
      banner('武将回血！');
      sfx.play('boss', 0.8);
      continue;
    }
    if (e.k === 'volleydone') continue;
    const name = EV_SFX[e.k];
    if (!name) continue;
    world.combatEvent(e);
    picks.push({ name: name, d: Math.abs((e.x || 0) - focus) });
  }
  if (!picks.length) return;
  picks.sort((a, b) => a.d - b.d);
  const used = {};
  let played = 0;
  for (let i = 0; i < picks.length && played < 5; i++) {
    const p = picks[i];
    const c = used[p.name] || 0;
    if (c >= 2) continue;
    used[p.name] = c + 1;
    played++;
    const near = Math.max(0.12, 1 - p.d / 13);
    sfx.play(p.name, near * (c === 0 ? 1 : 0.7));
  }
}

function endBattle(snap) {
  S.phase = 'over';
  S.over = snap.over;
  S.lock = true;
  net.stop();
  const win = snap.over && snap.over.win === S.side;
  if (snap.over) world.collapse(1 - snap.over.win);
  banner(win ? '胜利！' : '城门破了…');
  sfx.play(win ? 'win' : 'lose');
  setTimeout(() => showResult(snap), 1150);
}

function showResult(snap) {
  const o = snap.over || { win: -1, reason: 'time', dur: 0 };
  const win = o.win === S.side;
  const rw = REASON[o.reason] || ['打完了', '打完了'];

  const title = $('rTitle');
  title.textContent = win ? '胜利' : '惜败';
  title.classList.toggle('lose', !win);
  const ai = snap.ai || S.ai;
  const sandbox = !!(snap.free || SANDBOX);
  $('rSub').textContent = ai
    ? (win ? '打赢了 AI，随时再来一局' : 'AI 练功房 · 练手不心疼')
    : (win ? '推倒了对面城堡，漂亮！' : '差一点，再来一局赢回来');
  $('rTime').textContent = mmss(o.dur);
  $('rRight').textContent = S.right;
  $('rWrong').textContent = S.wrong;
  $('rStars').textContent = S.maxCombo;
  const opRight = (snap.op && snap.op.right) || 0;
  $('rWhy').textContent = (win ? rw[0] : rw[1]) + ' · 最高连击 ' + S.maxCombo
    + (ai ? ' · AI 答对 ' + opRight : '');

  renderWrongList();
  saveWrongList();
  const homeBtn = $('btnHome');
  if (homeBtn) {
    homeBtn.textContent = S.wrongList.length
      ? '回大厅 · 这局错了 ' + S.wrongList.length + ' 道'
      : '回大厅';
  }

  S.phase = 'result';
  show('result');
}

/* 结算页的错题明细：只报「答错 3」等于什么也没说 */
function renderWrongList() {
  const box = $('rWrongList');
  if (!box) return;
  if (!S.wrongList.length) {
    box.innerHTML = '<div class="rw-none">这一局一道都没错，稳！</div>';
    return;
  }
  box.innerHTML = '<div class="rw-t">这一局错的 ' + S.wrongList.length + ' 道</div>'
    + S.wrongList.map((x) => {
      if (x.kind === 'word') {
        return '<div class="rw-item">'
          + '<div class="rw-q">' + esc(x.cn || x.w) + '</div>'
          + '<div class="rw-l bad"><i>你拼的</i><span>' + esc(x.mine || '（没拼完）') + '</span></div>'
          + '<div class="rw-l ok"><i>正确</i><span>' + esc(x.w) + '</span></div>'
          + '</div>';
      }
      return '<div class="rw-item">'
        + '<div class="rw-q">' + esc(x.q) + '</div>'
        + '<div class="rw-l bad"><i>你选的</i><span>' + esc(x.mine || '（没选）') + '</span></div>'
        + '<div class="rw-l ok"><i>正确</i><span>' + esc(x.o[x.a]) + '</span></div>'
        + (x.tip ? '<div class="rw-tip">' + esc(x.tip) + '</div>' : '')
        + '</div>';
    }).join('');
}

async function goHome() {
  /* 独立版没有「首页」可回，直接回大厅：错题已经在结算页摆过一遍了 */
  net.stop();
  try {
    await net.leave();
  } catch (e) { /* 网络不好就直接走 */ }
  S.phase = 'lobby';
  S.code = '';
  S.right = 0;
  S.wrong = 0;
  S.combo = 0;
  S.maxCombo = 0;
  S.seq = 0;
  S.wrongList = [];
  S.ai = '';
  if (world) world.setSide(null);
  $('hud').classList.add('hide');
  $('panel').classList.add('hide');
  show('lobby');
  hint('');
}

function onGone(msg) {
  if (S.phase === 'over' || S.phase === 'result') return;
  net.stop();
  if (S.phase === 'wait') {
    S.phase = 'lobby';
    show('lobby');
    hint(msg || '房间没了', true);
  } else {
    toast(msg || '连接断了');
    setTimeout(() => {
      S.phase = 'lobby';
      world.setSide(null);
      $('hud').classList.add('hide');
      $('panel').classList.add('hide');
      show('lobby');
      hint(msg || '连接断了，重来一次', true);
    }, 1200);
  }
}

/* ---------------- 出题 ---------------- */
function ask() {
  if (S.phase !== 'play') return;
  S.q = bank.next();
  S.typed = '';
  S.lock = false;
  S.hints = 0;
  $('qtag').textContent = S.q.kind === 'word' ? '拼单词' : '语法';
  renderQ();
  syncHintBtn();
}

function renderQ() {
  const body = $('qbody');
  const q = S.q;

  if (q.kind === 'word') {
    let slots = '';
    for (let i = 0; i < q.answer.length; i++) slots += '<span class="slot"></span>';
    body.innerHTML =
      '<div class="qwrap word">'
      + '<button class="casebtn' + (S.upper ? '' : ' low') + '" id="btnCase" type="button">'
      +   (S.upper ? 'Aa 大写' : 'aa 小写')
      + '</button>'
      + '<div class="cn">' + esc(q.cn)
      + (q.pos ? '<span class="pos">' + esc(q.pos) + '</span>' : '') + '</div>'
      + '<div class="slots" id="slots">' + slots + '</div>'
      + '</div>'
      + '<div class="kb" id="kb">' + keyboardHTML() + '</div>';
    $('kb').addEventListener('click', onKey);
    $('btnCase').addEventListener('click', toggleCase);
    return;
  }

  const BADGE = ['A', 'B', 'C', 'D'];
  let opts = '';
  for (let i = 0; i < q.options.length; i++) {
    opts += '<button class="opt" data-i="' + i + '"><i>' + (BADGE[i] || i + 1)
      + '</i><span>' + esc(q.options[i]) + '</span>'
      + '<span class="kn" aria-hidden="true">' + (i + 1) + '</span></button>';
  }
  body.innerHTML = '<div class="qwrap gram"><div class="prompt">' + esc(q.prompt)
    + '</div><div class="opts" id="opts">' + opts + '</div></div>';
  $('opts').addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (!b) return;
    chooseOption(Number(b.dataset.i));
  });
}

/* 大小写：只影响「怎么显示」，比对永远用小写 ——
   不然大写下敲同一个词会被判错，小孩会以为是自己拼错了 */
function letter(ch) {
  return S.upper ? ch.toUpperCase() : ch.toLowerCase();
}

function toggleCase() {
  S.upper = !S.upper;
  const b = $('btnCase');
  if (b) {
    b.textContent = S.upper ? 'Aa 大写' : 'aa 小写';
    b.classList.toggle('low', !S.upper);
  }
  const kb = $('kb');
  if (kb) kb.innerHTML = keyboardHTML();
  paintSlots();
  sfx.play('ui');
}

function keyboardHTML() {
  const rows = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];
  let out = '';
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < rows[r].length; i++) {
      const raw = rows[r][i];
      out += '<button class="key" data-k="' + raw + '">' + letter(raw) + '</button>';
    }
    if (r === rows.length - 1) out += '<button class="key wide" data-k="__del">⌫ 退格</button>';
  }
  return out;
}

function onKey(e) {
  const b = e.target.closest('.key');
  if (!b || S.lock || !S.q) return;
  const k = b.dataset.k;
  if (k === '__del') { backspace(); return; }
  typeLetter(k);
}

/* ---------------- 物理键盘 ----------------
   桌面端不用伸手去够屏幕上的虚拟键：
   选择题按 1/2/3/4，拼写题直接敲字母、退格删一个。

   两个坑：
   1. 中文输入法拼字时送进来的 keyCode 是 229（key 是 `Process`），
      这种事件一律不理 —— 否则打拼音会把字母灌进答案里。
   2. 大厅那个「房间号」输入框里敲数字，不能顺手把题给选了。
      所以先把 INPUT/TEXTAREA/contentEditable 里的按键让出去。 */
function imeBusy(e) {
  return e.keyCode === 229 || e.key === 'Process' || e.isComposing === true;
}

function onPhysKey(e) {
  if (S.phase !== 'play' || S.lock || !S.q) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (imeBusy(e)) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (S.q.kind === 'gram') {
    if (e.key.length !== 1 || e.key < '1' || e.key > '9') return;
    const n = Number(e.key) - 1;
    if (n >= S.q.options.length) return;
    e.preventDefault();
    chooseOption(n);
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    backspace();
    return;
  }
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    e.preventDefault();
    typeLetter(e.key);
  }
}

/* 敲字母：虚拟键盘和物理键盘走同一条路，
   顺手把屏幕上那个键闪一下，看得见「刚按的是这个」 */
function typeLetter(k) {
  if (S.lock || !S.q || S.q.kind !== 'word') return;
  if (S.typed.length >= S.q.answer.length) return;
  S.typed += k.toLowerCase();
  paintSlots();
  const b = document.querySelector('.key[data-k="' + k.toUpperCase() + '"]');
  if (b) {
    b.classList.add('hit');
    clearTimeout(b._h);
    b._h = setTimeout(() => b.classList.remove('hit'), 130);
  }
  if (S.typed.length === S.q.answer.length) judgeWord();
}

function backspace() {
  if (S.lock || !S.typed) return;
  S.typed = S.typed.slice(0, -1);
  paintSlots();
  sfx.play('ui');
}

function paintSlots(reveal) {
  const slots = document.querySelectorAll('#slots .slot');
  const ans = S.q ? S.q.answer : '';
  for (let i = 0; i < slots.length; i++) {
    const ch = reveal ? (ans[i] || '') : (S.typed[i] || '');
    slots[i].textContent = ch ? letter(ch) : '';
  }
}

function judgeWord() {
  if (S.lock) return;
  const ok = S.typed === S.q.answer;
  const slots = document.querySelectorAll('#slots .slot');
  if (!ok) {
    paintSlots(true);
    slots.forEach((s) => s.classList.add('bad'));
  } else {
    slots.forEach((s) => s.classList.add('good'));
  }
  submit(ok, S.q.answer, S.typed);
}

function chooseOption(i) {
  if (S.lock || !S.q || !S.q.options) return;
  const btns = document.querySelectorAll('.opt');
  if (!(i >= 0) || i >= btns.length) return;
  /* 买提示划掉的那一项按数字也不能选 */
  if (btns[i].disabled || btns[i].classList.contains('cut')) return;
  const ok = i === S.q.answer;
  btns.forEach((b, k) => {
    b.disabled = true;
    if (k === S.q.answer) b.classList.add('right');
    else if (k === i) b.classList.add('wrong');
  });
  submit(ok, S.q.options[S.q.answer] + (ok ? '' : (S.q.tip ? '｜' + S.q.tip : '')), S.q.options[i]);
}

/* ---------------- 扣血买提示 ----------------
   血是服务器管着的，所以「能不能买、扣多少」都问服务器；
   客户端只负责把答案漏一点出来：单词给下一个字母，语法划掉一个错的。 */
const HINT_COST = 25;
const HINT_MAX = 2;

function syncHintBtn() {
  const b = $('btnHint');
  if (!b) return;
  const left = HINT_MAX - S.hints;
  const off = S.phase !== 'play' || S.lock || !S.q || left <= 0;
  b.disabled = off;
  b.classList.toggle('done', left <= 0);
  b.querySelector('.cost').textContent = left > 0 ? '-' + HINT_COST + ' 血' : '用完了';
}

async function buyHint() {
  if (S.phase !== 'play' || !S.q || S.lock) return;
  if (S.hints >= HINT_MAX) return;
  const btn = $('btnHint');
  btn.disabled = true;
  let r = null;
  try {
    r = await net.hint();
  } catch (e) {
    toast('网络抖了一下，再点一次');
    syncHintBtn();
    return;
  }
  if (!r || !r.ok) {
    toast((r && r.error) || '提示买不了');
    syncHintBtn();
    return;
  }

  S.hints = r.hints || (S.hints + 1);
  if (r.hp) {
    const mine = S.side, foe = 1 - mine;
    const mx = S.hpMaxArr;
    paintCastleHealth('Me', r.hp[mine], mx[mine]);
    paintCastleHealth('Op', r.hp[foe], mx[foe]);
  }
  /* 看提示 = 连击清零（服务器那边已经清零了，这边跟着归零） */
  if (typeof r.combo === 'number') {
    S.combo = r.combo;
    $('comboTag').textContent = '';
    const nm = nextMilestone(0);
    if (nm) $('comboNext').textContent = '再 ' + nm.at + ' 题：' + nm.name;
  }
  revealHint(r.cost || HINT_COST);
  syncHintBtn();
}

function revealHint(cost) {
  flash('💡', '城堡 -' + cost + ' 血，换一条提示', 'hint');
  sfx.play('hint');

  if (S.q.kind === 'word') {
    const ans = S.q.answer;
    let n = Math.min(S.typed.length, ans.length);
    /* 前面敲错的话，买提示顺手把错的也摆正 —— 血都花了，别还卡在那儿 */
    S.typed = ans.slice(0, n);
    if (n < ans.length) S.typed += ans[n];
    paintSlots();
    const slots = document.querySelectorAll('#slots .slot');
    for (let i = 0; i < S.typed.length; i++) {
      if (slots[i]) { slots[i].classList.remove('bad'); slots[i].classList.add('given'); }
    }
    if (S.typed.length >= ans.length) {
      setTimeout(judgeWord, 420);
    }
    return;
  }

  /* 语法题：划掉一个错误选项 */
  const btns = Array.prototype.slice.call(document.querySelectorAll('.opt'));
  const bad = btns.filter((b, k) => k !== S.q.answer && !b.classList.contains('cut'));
  if (bad.length > 1) {
    const pick = bad[Math.floor(Math.random() * bad.length)];
    pick.classList.add('cut');
    pick.disabled = true;
  }
}

/* ---------------- 记错题 ----------------
   擂台只报「答错 3」没用，孩子回到首页就忘了错在哪。
   这里把每道错题的「你写的 / 正确的 / 为什么」留下来，
   结算页一条条摆出来；回首页时主应用会收进错题本。 */
function noteWrong(mine) {
  const q = S.q;
  if (!q) return;
  if (q.kind === 'word') {
    const key = 'w:' + q.answer;
    if (S.wrongList.some((x) => x.key === key)) return;
    S.wrongList.push({
      key: key, kind: 'word', w: q.answer, cn: q.cn || '', mine: mine || ''
    });
    return;
  }
  const key = 'g:' + (q.fp || q.prompt);
  if (S.wrongList.some((x) => x.key === key)) return;
  S.wrongList.push({
    key: key, kind: 'gram', q: q.prompt, o: q.options.slice(),
    a: q.answer, tip: q.tip || '', mid: q.mid || 'mix', mine: mine || ''
  });
}

/* 存进 localStorage：pk.html 不参与 /api/profile 的回写，
   写档案会把主应用的数据整个盖掉，所以只留一张「待收」小纸条 */
function saveWrongList() {
  try {
    if (S.wrongList.length) {
      localStorage.setItem('sm_pk_wrong', JSON.stringify(S.wrongList.slice(0, 30)));
    }
  } catch (e) { /* 隐私模式就算了 */ }
}

/* 上报 + 反馈 + 下一题 */
function submit(ok, answerText, mineText) {
  if (S.lock) return;
  S.lock = true;
  S.seq += 1;

  const seq = S.seq;
  net.answer(seq, ok).then((r) => {
    if (r && r.ok && r.soldier) {
      world.addLocal(r.soldier[0], r.soldier[1], r.soldier[2], r.soldier[3], r.soldier[4], r.soldier[5]);
    }
    if (r && r.ok && r.mage) {
      world.addLocal(r.mage[0], r.mage[1], r.mage[2], r.mage[3], r.mage[4], r.mage[5]);
    }
    if (r && r.ok && typeof r.combo === 'number') {
      S.combo = r.combo;
      if (r.combo > S.maxCombo) S.maxCombo = r.combo;
    }
    /* 连击出的好兵要喊一声：三级兵、武将、方士都值得一个横幅 */
    if (r && r.ok && r.tier === 3 && r.soldier) {
      banner(TIER_NAME[r.tier] + ' 出战！');
    } else if (r && r.ok && r.tier >= 4 && !r.soldier) {
      banner('武将进入后备队');
    }
    if (r && r.ok && (r.buffs || []).indexOf('fangshi') >= 0) {
      banner('方士到场，法阵展开！');
    } else if (r && r.ok && (r.buffs || []).indexOf('fangshi_reserve') >= 0) {
      banner('方士进入后备队');
    }
  }).catch(() => { /* 少这一次不影响大局，快照会补齐 */ });

  if (ok) {
    S.right++;
    S.combo++;
    if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    flash('✔', '', 'ok');
    sfx.play('correct');
  } else {
    S.wrong++;
    S.combo = 0;
    noteWrong(mineText);
    flash('✘', '正确答案：' + answerText, 'no');
    sfx.play('wrong');
  }
  $('score').textContent = '答对 ' + S.right + ' · 答错 ' + S.wrong;
  syncHintBtn();

  setTimeout(ask, ok ? 240 : 1150);
}

function flash(big, small, cls) {
  const old = document.querySelector('.fb');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'fb ' + cls;
  el.innerHTML = '<b>' + esc(big) + '</b>' + (small ? '<i>' + esc(small) + '</i>' : '');
  $('panel').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/* ---------------- 调试钩子 ----------------
   自测脚本用它代替「真的去点 26 个字母」 */
window.__PK = {
  S: S,
  /* 自测用：bank 在 boot() 里才 new 出来，这里必须用 getter，
     直接写 bank: bank 会把当时的 null 拷进去，永远是 null */
  get bank() { return bank; },
  state: () => ({ phase: S.phase, side: S.side, code: S.code, stars: S.stars, right: S.right, wrong: S.wrong }),
  answer(ok) {
    if (S.phase !== 'play' || S.lock) return Promise.resolve(false);
    S.lock = true;
    S.seq += 1;
    return net.answer(S.seq, !!ok).then((r) => {
      if (r && r.ok && r.soldier) {
        world.addLocal(r.soldier[0], r.soldier[1], r.soldier[2], r.soldier[3], r.soldier[4], r.soldier[5]);
      }
      if (r && r.ok && r.mage) {
        world.addLocal(r.mage[0], r.mage[1], r.mage[2], r.mage[3], r.mage[4], r.mage[5]);
      }
      if (ok) { S.right++; S.combo++; } else { S.wrong++; S.combo = 0; }
      S.lock = false;          /* 自测脚本不走 ask()，这里自己解锁 */
      return r;
    }).catch(() => { S.lock = false; return false; });
  },
  world: () => world,
  /* 错题本相关：自测脚本用来核对「错题有没有记下来、结算页有没有摆出来」 */
  get wrongList() { return S.wrongList; },
  showResult: (snap) => showResult(snap),
};

boot();
