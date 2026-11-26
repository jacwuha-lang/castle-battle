#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
server.py — 做题攻城 PK（castle-battle）独立服务
=====================================================================
一个文件、零第三方依赖，只干两件事：

  1. 托管本目录的静态文件（index.html / js / css / vendor）
  2. 跑 /api/pk/* 这套房间与战斗逻辑（长轮询同步，局域网 RTT 10~40ms）

战场由服务器以 20Hz 推进：两台设备各答各的题，士兵、血量、胜负
只有服务器说了算，客户端只负责「上报答对/答错」和「照着画」。

用法：
  python server.py                # 默认 8788 端口，自动打开浏览器
  python server.py --port 9000
  python server.py --no-open
=====================================================================
"""

import argparse
import json
import math
import os
import random
import re
import socket
import threading
import time
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from pk_combat_geometry import BASE_REACH, contact_distance, melee_reach, slot_offset

ROOT = os.path.dirname(os.path.abspath(__file__))
PROFILE_DIR = os.path.join(ROOT, "profiles")
_NAME_BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def safe_profile_name(n):
    """只留字母数字汉字和常见符号，去掉路径分隔符，防止 ../ 穿越。"""
    n = _NAME_BAD.sub("", (n or "").strip())
    n = n.strip(". ")
    return n[:24]


def profile_path(n):
    n = safe_profile_name(n)
    if not n:
        return None
    return os.path.join(PROFILE_DIR, n + ".json")


def log(msg):
    try:
        print(msg, flush=True)
    except Exception:
        print(str(msg).encode("ascii", "replace").decode("ascii"), flush=True)


# -------------------------------------------------------------------
# 为什么放在服务器上算：
#   两台设备各打各的，士兵、血量、胜负不能各算各的，否则一定对不上。
#   所以战场由服务器以 20Hz 推进，客户端只负责「上报答对/答错」和「照着画」。
#
# 为什么用长轮询而不是 WebSocket：
#   这台服务器是 http.server + 线程池，加 WebSocket 要自己实现握手和帧解析，
#   家里两台设备用长轮询已经够（局域网 RTT 几毫秒），出错也好排查。
#   客户端在两帧之间自己做插值和外推，看起来是连续的。
#
# 星星记账：
#   报名扣 50、赢加 75 全部在服务器上改档案文件。客户端 PK 页不加载学习主体，
#   不参与 /api/profile 的回写，避免「客户端内存里的旧星数覆盖掉服务器刚扣的」。
# ===================================================================

PK_ENTRY = 50           # 报名费
PK_WIN_BONUS = 75       # 赢家奖励（净赚 25）
PK_CASTLE_HP = 5000     # 城堡 1 级血量（基础值）
PK_CASTLE_MAXLV = 5     # 城堡最高 5 级
PK_CASTLE_LVUP = 0.10   # 每升一级，血量上限加 10% 基础值（= 500）
PK_CASTLE_HEAL = 250    # 每 5 连击回的血（基础 5000 的 5%）
PK_MAX_TIME = 360.0     # 单局上限 6 分钟，超时按剩余血量判
PK_TICK = 0.05          # 服务器推进步长
PK_DISCONNECT = 8.0     # 这么久没轮询就算掉线，判负
PK_GATE_RANGE = 1.3     # 走到离对方城门这么近就开始砍门
PK_REACH = BASE_REACH   # 普通兵基础距离；实际近战范围按双方体型计算
PK_MEET_RANGE = PK_REACH  # 老名字，留着免得别处引用炸掉
PK_SEP = 1.12           # 普通兵最小身体间距；将军按模型比例扩大
PK_QUEUE_GAP = 0.85     # 同列前后自己人留的间距：拉开成梯队，不是挤成一堆
PK_SLOT_GAP = 0.50      # 走向围攻位时的跟车间距（比行军时紧，不然站不到那一圈上）
PK_FILES = (-1.65, -1.10, -0.55, 0.0, 0.55, 1.10, 1.65)
# 一条路，但是条宽路：七列并排，路宽 3.3 米。
# 早先收成三列 + 严格排队，兵一多就排到天边（实测能攒到 140 个、
# 队伍 25 米长、全部 360 秒打不完）。宽正面让更多人同时接战，
# 产兵和消耗才拉得平。
PK_LEFT = -28.0         # 左城堡城门 x（场地 56 米长）
PK_RIGHT = 28.0         # 右城堡城门 x
PK_HINT_COST = 25       # 买一次提示扣多少城堡血
PK_HINT_MAX = 2         # 一道题最多买几次提示

# 伤害系数。表里的攻防落差只有 1~2 点，直接相减一刀只掉 1 点血，
# 20 血的兵要砍二十刀，一局根本打不完。乘一个系数，让「同级对砍 7~9 刀倒一个」。
PK_DMG_SCALE = 4.5
PK_GATE_MUL = 14.0       # 砸城门：砍石头没有防御，按攻击力的倍数掉血

PK_ARROW_EVERY = 15     # 每连对 15 题放一次箭雨
PK_ARROW_COUNT = 10     # 一次射几支
PK_ARROW_DMG = (3, 8)   # 每支箭打人多少（随机）
PK_ARROW_GATE = (60, 110)  # 场上没敌人时，每支箭打城多少（随机；城堡 5000 血，按比例放大）
PK_ARROW_FLY = 0.55     # 箭从出膛到落地的飞行时间，客户端按这个排动画

# 围攻：一个敌人身上有七个「可以站人」的位子，一把刀一个位子，谁都不许两个人
# 站同一个点。坐标是**相对目标**的偏移：(朝我方这一侧的 x 偏移, 横向偏移)。
#
# 为什么不再用「四个位子全放正面」那一版：那四个位子总共只隔 0.45 米，
# 比一个人还窄，四个人挤在同一条缝里，谁都没真正到位 —— 画面上就是
# 一群人挤来挤去不出手。现在正面三个、两个侧翼、两个背后，
# 最多还是四把刀，但会散在一米二宽的圈上，各砍各的。
#
# 侧翼那两个位子（x 偏移≈0）站上去人是**和敌人并排**的，
# 屏幕上看起来就是「背对镜头」或「面向镜头」—— 那是对的，不是 bug。
PK_SLOTS = (
    (0.86, 0.00),    # 正对
    (0.70, 0.60),    # 正前偏左
    (0.70, -0.60),   # 正前偏右
    (0.10, 0.88),    # 左侧翼
    (0.10, -0.88),   # 右侧翼
    (-0.82, 0.24),   # 背后偏左（绕后）
    (-0.82, -0.24),  # 背后偏右
)
# 以上只定义环绕方向；_slot_xy 按双方模型体型缩放半径。
# 普通兵、将军有各自的身体间距与可达距离，邻近站位也必须能容纳真实体积。
PK_MAX_ATK = 4             # 一个敌人最多四把刀同时砍
PK_CLASH_R = 1.05          # 这么近的敌人优先打 —— 「靠近就开始准备战斗」
PK_WAIT_R = 1.9            # 位子全满的人在外圈这么远等着
PK_SLOT_RANGE = 6.0        # 离敌人这么近才开始「占位子」
# 为什么要有这条：位子是「先占先得」的，如果远处还在行军的人也能占，
# 前排刚走到的人会发现附近的位子全被二十米外的人预订光了，只能站着看 ——
# 那就又变回「一排人干等着」了。所以先把人放过去，走近了才分位子。
PK_REAR_COST = 0.45         # 绕到背后要多花点代价，不然整队都想去绕后
PK_STRAFE = 0.85           # 横移速度 = 前进速度 × 这个（人横着挪本来就慢）
PK_RUN = 1.8               # 离敌人还远的时候跑起来
# 为什么要有这个：场地 56 米，走路速度 1.55 米/秒，一个兵从城门走到对面要
# 三十多秒。按 3 秒一个兵算，队伍会在路上拉成十几个人的长龙 ——
# 正面永远只有两三个人在打，看着就是「大家都在赶路，没人交手」。
# 远处跑、近处走：路上时间砍掉快一半，人到得齐，正面才像一场仗。
PK_STILL_MAX = 0.75        # 原地不动超过这么久 = 被判「挤住了」，开始让路
PK_MAX_ALIVE = 21          # 场上最多站多少个（7 列 × 3 排），多的进后备队
PK_LANE_MAX = 2.40         # 路的半宽上限（最外一列 1.65 + 一点让位）

PK_BOSS_AOE_CD = 5.0    # 武将群攻：每 5 秒一次
PK_BOSS_AOE_N = 3       # 同时打几个
PK_BOSS_AOE_MUL = 0.7   # 每个人只吃 70%
PK_BOSS_AOE_RX = 3.2    # 够得着的范围（一条路上只看 x 就够）

# AI 对手（练功房）
# ---------------------------------------------------------------
# 机器人不联网、也不需要真题目 —— 它只是按节奏往「答题」那条路上喂
# 一个答对/答错，剩下的出兵、连击、回血、升级、箭雨全走和真人一模一样的
# 代码。这样 AI 局永远是「同一个游戏」，不会出现 AI 偷偷改数值。
#
# 每一题花多久，不再是一个固定间隔（以前是一个 gap 定时器，宗师 1.5~2.3 秒
# 一题 = 一秒出半个兵，人根本追不上）。现在拆成真人在做的那几件事：
#   read     读题：看题干要多久（长句比单词慢，每题再抖一下）
#   act      作答：拼写要一个键一个键敲，选择题只是点一下
#   stall    卡壳：偶尔这一题就是想不起来，多愣一会儿
#   acc      基础答对率
#   fatigue  每高一点连击就手忙脚乱一点（连击越高越容易错、出手越慢）
# 一题的实际耗时 = read + act (+ stall)，所以节奏天然有快有慢，不会像
# 节拍器那样「哒哒哒」地一秒一个兵。
PK_AI = {
    "easy":   {"name": "AI·学徒", "read": (2.3, 3.8), "act": (1.0, 2.0), "acc": 0.58,
               "stall": 0.20, "stall_add": (1.2, 3.2), "fatigue": 0.004},
    "normal": {"name": "AI·小侠", "read": (1.9, 3.05), "act": (0.8, 1.55), "acc": 0.78,
               "stall": 0.14, "stall_add": (1.0, 2.8), "fatigue": 0.005},
    "hard":   {"name": "AI·剑客", "read": (1.5, 2.45), "act": (0.6, 1.2), "acc": 0.87,
               "stall": 0.10, "stall_add": (0.9, 2.2), "fatigue": 0.005},
    "boss":   {"name": "AI·宗师", "read": (1.3, 2.15), "act": (0.5, 1.08), "acc": 0.93,
               "stall": 0.07, "stall_add": (0.8, 2.0), "fatigue": 0.004},
}
PK_AI_NAMES = tuple(PK_AI.keys())
PK_AI_FATIGUE_ACC = 0.10    # 疲劳最多扣掉 10 个百分点答对率（不会掉成瞎答）
PK_AI_FATIGUE_SPD = 0.004   # 疲劳还会拖慢出手：每 1 点连击 +0.4%
PK_AI_FATIGUE_SPD_MAX = 0.20  # 最多慢 20%，再慢就成木头人了

# 同等级各自轮换：冲锋、投掷、弓箭、长矛。武将保持专属兵种。
PK_KINDS = ("charge", "thrower", "archer", "spearman")
PK_KIND_RANGE = {"charge": PK_REACH, "thrower": 4.0, "archer": 6.5, "spearman": 2.0,
                 "general": PK_REACH,
                 # 方士：射程 = 弓箭手（6.5）翻倍。它站在很后面搓法术，
                 # 所以接敌时间比弓箭手更晚，但一旦站定就能一直放着打。
                 "mage": 13.0}
PK_PROJECTILE_FLY = 0.40

# ---------------- 方士（远程魔法兵） ----------------
# 用户定的规则：
#   · 每 10 连击必出一个，和当次该出的兵**同时**出场（不占那一次的出兵名额）
#   · 属性 = 三级远程兵（三级兵基础值打五折，和弓箭手/投掷兵同一档）
#   · 射程翻倍（6.5 → 13.0）
#   · 一次最多同时打 3 个：打 1 个吃满，打 2 个各 60%，打 3 个各 40%
#     （所以总输出是 100% / 120% / 120%，散开打反而略赚 —— 它就是群攻位）
PK_FANGSHI_EVERY = 10        # 10 的倍数必出（和城堡升级同一条线）
PK_FANGSHI_TIER = 2          # PK_TIERS 下标 2 = 三级兵
PK_FANGSHI_N = 3             # 同时打几个
PK_FANGSHI_SPLIT = {1: 1.0, 2: 0.6, 3: 0.4}   # 命中人数 → 每人吃到的比例


# 兵种属性表（用户定的）
#   hit 命中 / dodge 闪避 / block 格挡 / crit 暴击（只有跳劈会翻倍）
PK_TIERS = [
    {"name": "一级兵", "hp": 20, "atk": 2, "df": 2, "hit": 0.60,
     "dodge": 0.10, "block": 0.10, "crit": 0.10, "spd": 1.55},
    {"name": "二级兵", "hp": 40, "atk": 4, "df": 4, "hit": 0.70,
     "dodge": 0.20, "block": 0.20, "crit": 0.15, "spd": 1.65},
    {"name": "三级兵", "hp": 60, "atk": 6, "df": 6, "hit": 0.80,
     "dodge": 0.30, "block": 0.30, "crit": 0.20, "spd": 1.75},
    {"name": "武将", "hp": 80, "atk": 10, "df": 10, "hit": 0.90,
     "dodge": 0.30, "block": 0.30, "crit": 0.25, "spd": 1.95},
]


def tier_for_combo(combo):
    """连击决定这一次出什么兵（每次答对都出一个）：
      3 的倍数 → 二级兵，8 的倍数 → 三级兵，20 的倍数 → 武将。
    同时踩中好几个就取最高的那个：24 = 3×8 → 三级兵；40 = 8×20 → 武将；
    60 = 3×20 → 武将。都没踩中就出一级兵。"""
    t = 0
    if combo % 3 == 0:
        t = max(t, 1)
    if combo % 8 == 0:
        t = max(t, 2)
    if combo % 20 == 0:
        t = max(t, 3)
    return t


# 动作表：dur 这个动作演多久，hit 第几秒结算（客户端按同一组数字对姿势，
# 不然剑还没落下去人已经掉血了）。mul 是这一下的伤害倍率。
PK_ACT = {
    "wind":    {"dur": 0.46, "hit": 0.46, "mul": 1.00},   # 平A
    "leap":    {"dur": 0.76, "hit": 0.42, "mul": 1.55},   # 跳劈，破防
    "smash":   {"dur": 0.94, "hit": 0.62, "mul": 1.00, "gate": True},  # 砸城门
    "shot":    {"dur": 0.80, "hit": 0.38, "mul": 1.00},
    "thrust":  {"dur": 0.90, "hit": 0.35, "mul": 1.00},
    "bash":    {"dur": 0.58, "hit": 0.34, "mul": 1.0 / 3.0},
    "aoe":     {"dur": 0.90, "hit": 0.50, "mul": 1.00, "aoe": True},   # 武将横扫
    "block":   {"dur": 0.55},                              # 举盾格挡
    "dodge":   {"dur": 0.32},                              # 侧闪
    "hurt":    {"dur": 0.26},                              # 挨打后仰
    "recover": {"dur": 0.26},                              # 收刀
}
PK_ACTING = tuple(PK_ACT.keys())

# 客户端要按 id 认动作，别改顺序（scene.js 里有同一张表）
PK_ST_CODE = {"walk": 0, "wind": 1, "leap": 2, "smash": 3,
              "block": 4, "dodge": 5, "hurt": 6, "recover": 7, "aoe": 8,
              "shot": 9, "thrust": 10, "bash": 11}


PK_LOCK = threading.RLock()
PK_ROOMS = {}
PK_TICK_ON = [False]


def _pk_load(name):
    """读档案（调用方必须已经持有 PK_LOCK）。"""
    p = profile_path(name)
    if not p or not os.path.isfile(p):
        return None, None
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        return (d if isinstance(d, dict) else None), p
    except Exception:
        return None, p


def _pk_save(p, data):
    tmp = p + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def pk_balance(name):
    with PK_LOCK:
        d, _ = _pk_load(name)
        if d is None:
            return None
        return int(d.get("sm_stars") or 0)


def pk_add_stars(name, delta):
    """原子加星。返回新余额；档案不存在返回 None。"""
    with PK_LOCK:
        d, p = _pk_load(name)
        if d is None:
            return None
        cur = int(d.get("sm_stars") or 0)
        new = max(0, cur + int(delta))
        d["sm_stars"] = new
        try:
            os.makedirs(PROFILE_DIR, exist_ok=True)
            _pk_save(p, d)
        except Exception as e:
            log("[pk] 星星写不进档案: %s" % e)
            return None
        return new


class PKRoom(object):
    def __init__(self, code, host):
        self.code = code
        self.state = "waiting"      # waiting / playing / over
        self.created = time.time()
        self.t = 0.0
        self.v = 1
        self.cond = threading.Condition(PK_LOCK)
        self.lv = [1, 1]                        # 城堡等级
        self.hp = [PK_CASTLE_HP, PK_CASTLE_HP]
        self.soldiers = []
        self.players = []
        self.factions = ["female", "male"]  # 外观阵营独立于左右战场位置。
        self.over = None
        self.ended = 0.0
        self.next_sid = 1
        self.file_n = [0, 0]     # 每边轮到第几列
        self.kind_n = [[0, 0, 0], [0, 0, 0]]  # 双方每个等级独立轮换
        self.ev = []            # 战斗事件环形缓冲，客户端按 id 增量取来放音效
        self.evn = 0
        self.pending = []       # 箭雨这种「先飞一会儿再落地」的东西
        self.kills = [0, 0]     # 各自砍倒对面几个兵（超时平血时用来分胜负）
        self._occ = {}          # 每帧重算：敌人 id -> {位子号: 兵 id}
        self.unstuck = 0        # 防卡让路触发了几次（自测 / 调参用，不影响判定）
        self.reserve = [[], []]  # 每方排在城门口等着上场的兵（存等级）。见 spawn()
        # 沙盒房：pk.html?free=1 进来的。不扣报名费、赢了也不加星，
        # 专门用来调动作/调平衡 —— 否则每调一次就要烧掉 50 颗星。
        self.free = False
        # AI 练功房：self.bot 是那个机器人的运行状态，真人房是 None
        self.bot = None

    # ---------------- 玩家 ----------------
    def find(self, who):
        for p in self.players:
            if p["who"] == who:
                return p
        return None

    def other(self, side):
        for p in self.players:
            if p["side"] != side:
                return p
        return None

    def add(self, who, side, stars):
        p = {"who": who, "side": side, "stars": stars,
             "seen": time.time(), "seq": 0, "combo": 0,
             "right": 0, "wrong": 0, "last_at": 0.0,
             "hints": 0, "hint_seq": -1, "last_hint": 0.0}
        self.players.append(p)
        return p

    def add_bot(self, level):
        """塞一个 AI 玩家进来，使用真人所选阵营的另一边。
        它和真人在数据结构上完全一样，区别只有两条：
          · 没有轮询，所以 pk_tick 里不会因为它掉线判负
          · 出题这一环由 bot_step 按节奏自己喂，不用等网络"""
        key = level if level in PK_AI else "normal"
        spec = PK_AI[key]
        side = 1 - self.players[0]["side"] if self.players else 1
        p = self.add(spec["name"], side, 0)
        p["bot"] = True
        self.bot = {"key": key, "p": p,
                    "acc": spec["acc"],
                    "read": spec["read"], "act": spec["act"],
                    "stall": spec["stall"], "stall_add": spec["stall_add"],
                    "fatigue": spec["fatigue"],
                    # gap 是老字段，留着给文档 / 界面做「大概几秒一题」的展示
                    "gap": (spec["read"][0] + spec["act"][0],
                            spec["read"][1] + spec["act"][1]),
                    "t": 1.4}      # 开场先愣一下，让真人看清对面是谁
        log("[pk] %s 加入 AI 对手：%s" % (self.code, spec["name"]))
        return p

    def bump(self):
        self.v += 1
        try:
            self.cond.notify_all()
        except Exception:
            pass

    # ---------------- 出兵 ----------------
    def castle_max(self, side):
        """城堡血量上限：1 级 500，每升一级 +10% 基础值（+50），5 级 700。"""
        return int(round(PK_CASTLE_HP * (1 + PK_CASTLE_LVUP * (self.lv[side] - 1))))

    def spawn(self, side, tier_idx, force=False, kind=None):
        """出一个兵。
        场上已经站满 PK_MAX_ALIVE 个的话，这个兵先进「后备队」排队，
        等前面倒下一个再顶上去 —— 不然连击打得久的人会在一条路上码出一百多个，
        手机根本扛不住，画面也是一坨。后备队人数会推给客户端显示。"""
        kind = "general" if tier_idx >= 3 else (kind or "charge")
        if not force and self._alive_n(side) >= PK_MAX_ALIVE:
            self.reserve[side].append((tier_idx, kind))
            return None
        base = PK_TIERS[max(0, min(len(PK_TIERS) - 1, tier_idx))]
        t = {k: (v * 0.5 if kind in ("thrower", "archer", "spearman", "mage") and isinstance(v, (int, float)) else v) for k, v in base.items()}
        # 出生列七列循环。这一列只是「出发站位」，接敌之后会自己横移到位子上。
        lane = PK_FILES[self.file_n[side] % len(PK_FILES)]
        self.file_n[side] += 1
        s = {
            "id": self.next_sid, "side": side, "tier": tier_idx + 1, "kind": kind, "stats": t,
            "x": PK_LEFT if side == 0 else PK_RIGHT,
            "lane": lane, "home": lane, "hp": t["hp"], "max": t["hp"],
            "atk": t["atk"], "spd": t["spd"],
            "cd": random.random() * 0.4, "gate": 0.0, "gate_warm": False,
            "st": "walk", "st_t": 0.0, "hit_done": False, "foe": None,
            "slot": -1, "istun": 0.0,
            "aoe_cd": PK_BOSS_AOE_CD, "healed": False,
            # 防卡：挤住多久了、正在往哪边让路、连续被卡几次、暂时躲开哪个目标
            "still": 0.0, "detour": 0.0, "detour_sign": 1,
            "hits": 0, "avoid": None, "avoid_t": 0.0,
            "avoid_lane": None, "avoid_lane_t": 0.0,
        }
        self.next_sid += 1
        self.soldiers.append(s)
        if kind == "general":
            self._emit("general_spawn", s)
        elif kind == "mage":
            self._emit("fangshi_spawn", s)
        return s

    # ---------------- 事件（给客户端放音效 / 特效） ----------------
    def _emit(self, k, s=None, x=None, lane=None, **kw):
        self.evn += 1
        e = {"i": self.evn, "k": k}
        if s is not None:
            e["x"] = round(s["x"], 2)
            e["l"] = round(s["lane"], 2)
            e["s"] = s["side"]
            e["t"] = s["tier"]
            e["id"] = s["id"]
        else:
            e["x"] = round(x or 0.0, 2)
            e["l"] = round(lane or 0.0, 2)
        if kw:
            e.update(kw)
        self.ev.append(e)
        if len(self.ev) > 160:
            del self.ev[:60]
        return e

    def _alive_n(self, side):
        """场上这一方还有几个活人"""
        n = 0
        for s in self.soldiers:
            if s["hp"] > 0 and s["side"] == side:
                n += 1
        return n

    def _alive(self, sid):
        for s in self.soldiers:
            if s["id"] == sid and s["hp"] > 0:
                return s
        return None

    def _room_ahead(self, s, ahead, tx=None, gap=None):
        """朝 ahead 方向还能往前挪多少米 —— 同列的人不许互相超车。

        tx 是**我的目标点**：站在我目标之外的人不该挡我。早先只看
        「前面有人就停」，结果整排人都被离得很远的同伴钉在原地，一步都
        迈不出去 —— 那才是「一排人干站着不打」的真正原因。"""
        if gap is None:
            gap = PK_QUEUE_GAP
        room = 99.0
        for o in self.soldiers:
            if o is s or o["hp"] <= 0 or o["side"] != s["side"]:
                continue
            if abs(o["lane"] - s["lane"]) > 0.14:   # 只管自己这一列
                                                    # （围攻位之间只差 0.2，阈值不能比它大，
                                                    #   不然四个围攻位会被当成同一列、互相挡死）
                continue
            dx = (o["x"] - s["x"]) * ahead
            if abs(dx) <= 0.02:
                # 两个人正好站在同一个 x 上（同一个门里一起出兵）：按 id 定先后。
                # 不定的话两个人互相觉得「前面有人」，谁都迈不出第一步，越贴越死。
                if o["id"] < s["id"]:
                    continue
                dx = 0.0
            if dx <= 0:
                continue                                  # 不在我前面
            if tx is not None and (tx - o["x"]) * ahead < -0.05:
                continue                                  # 他已经在我目标之外了
            room = min(room, dx - max(gap, contact_distance(s, o)))
        return max(0.0, room)


    def _slot_xy(self, foe, idx, attacker=None):
        """第 idx 个围攻位的世界坐标。
        to_me 是「从敌人指向我方城堡」的方向：正面那几个位子都落在敌人朝我这边，
        侧翼两个和敌人并排（x 几乎相同），背后两个在敌人另一侧。
        横向要夹在路宽以内 —— 敌人在路边时，侧翼位子会掉到路外面去，
        夹过之后人才能真的「到位」，不然他会永远差着那 0.7 米往墙里挤。"""
        ox, oz = slot_offset(attacker, foe, *PK_SLOTS[idx])
        to_me = -1.0 if foe["side"] == 1 else 1.0
        lane = max(-PK_LANE_MAX, min(PK_LANE_MAX, foe["lane"] + oz))
        return foe["x"] + ox * to_me, lane

    def _advance(self, s, tx, tz, dt, gap=PK_SLOT_GAP, rate=1.0):
        """朝 (tx, tz) 走一步，返回「到没到位」。

        **先横后纵** —— 这是整个防卡机制的关键：先横着挪进自己那条道，
        `_room_ahead` 就只挡 0.14 米以内的同列，横移出去之后前面那个人
        就不再挡路了。于是「正前方挤住」变成「从旁边那条道绕过去」，
        而不是一排人贴着前一个人的后脑勺站着。"""
        x0, l0 = s["x"], s["lane"]
        spd = s["spd"] * rate
        dz = tz - s["lane"]
        if abs(dz) > 0.10:
            step = min(abs(dz), spd * PK_STRAFE * dt)
            s["lane"] = max(-PK_LANE_MAX,
                            min(PK_LANE_MAX, s["lane"] + math.copysign(step, dz)))
            if abs(tz - s["lane"]) > 0.10:
                # 横移这一段也要计「挤住了没有」，不然一直横不进去的人
                # 永远触发不了让路（这条 return 以前直接跳过了计时）
                if abs(s["lane"] - l0) < 0.004:
                    s["still"] += dt
                else:
                    s["still"] = 0.0
                return False          # 还没进道，先别往前，免得斜着插到人堆里
        dx = tx - s["x"]
        if abs(dx) > 0.05:
            ahead = 1 if dx > 0 else -1
            mv = min(abs(dx), spd * dt,
                     self._room_ahead(s, ahead, tx, gap))
            if mv > 0:
                s["x"] += ahead * mv
        # 这一帧挪了多少 —— 「挤住了」的判定就看它
        if abs(s["x"] - x0) + abs(s["lane"] - l0) < 0.004:
            s["still"] += dt
        else:
            s["still"] = 0.0
        return abs(tx - s["x"]) <= 0.07 and abs(tz - s["lane"]) <= 0.10

    def _crowd(self, s, sign):
        """往 sign 那一侧，身边挤了多少人（决定让路往哪边让）"""
        n = 0
        for o in self.soldiers:
            if o is s or o["hp"] <= 0:
                continue
            if 0.0 < (o["lane"] - s["lane"]) * sign < 1.1 and abs(o["x"] - s["x"]) < 1.6:
                n += 1
        return n

    def _unstick(self, s):
        """挤住了：先横着让开一条道；连着被卡两次就换个目标，别死磕一个位子。
        这就是「一旦卡了可以走到其他路上找机会」。"""
        s["still"] = 0.0
        s["hits"] += 1
        self.unstuck += 1
        lc = self._crowd(s, 1)
        rc = self._crowd(s, -1)
        if lc < rc:
            sign = 1
        elif rc < lc:
            sign = -1
        else:
            # 两边一样挤：按 id 奇偶分左右。全往同一边让 = 整队平移，还是堵
            sign = 1 if (s["id"] & 1) else -1
        s["detour"] = 0.45 + random.random() * 0.35
        s["detour_sign"] = sign
        s["slot"] = -1
        # 顺便记住「这条道是堵的」：接下来 1.6 秒别再挑同一条道上的位子，
        # 不然让开之后又会挑回原来那一格，绕一圈继续顶牛。
        s["avoid_lane"], s["avoid_lane_t"] = s["lane"], 1.6
        if s["hits"] >= 2 and s["foe"] is not None:
            s["avoid"], s["avoid_t"], s["hits"] = s["foe"], 2.0, 0

    def _build_occ(self):
        """每帧搭一次「每个敌人身上挂了哪几把刀」的账：{敌人 id: {位子号: 兵 id}}。
        一个位子只许站一个人 —— 早先是「每个敌人最多四把刀」但只有一条窄缝，
        四个人抢同一个点，谁都没真正到位，画面就是一群人挤来挤去不出手。
        正在走路的兵也算（他占的位子要留着，否则两个人会同时往一格上走）。"""
        occ = {}
        for a in self.soldiers:
            if a["hp"] <= 0 or a["foe"] is None or a["slot"] < 0:
                continue
            occ.setdefault(a["foe"], {})[a["slot"]] = a["id"]
        self._occ = occ

    def _settle_occ(self):
        """收尾：按「谁真的认领了这一格」重建账本，一格只留一个人。

        极少数情况下两个人会认领同一格 —— 比如刚让完路、slot 还没落地，
        画面就是两个人插在同一个点上谁也不动，正是「顶在一起」最难看的样子。
        这里把离这一格远的那个的 slot 收走，他下一帧会自己重新挑一格，
        不会僵在原地。顺带保证 PK_MAX_ATK 不会被偷偷突破。"""
        occ = {}
        for a in self.soldiers:
            if a["hp"] <= 0 or a["foe"] is None or a["slot"] < 0:
                continue
            held = occ.setdefault(a["foe"], {})
            prev = held.get(a["slot"])
            if prev is None:
                held[a["slot"]] = a
                continue
            foe = self._alive(a["foe"])
            if foe is None:
                held[a["slot"]] = a
                continue
            sx, sz = self._slot_xy(foe, a["slot"], a)
            d_new = math.hypot(sx - a["x"], sz - a["lane"])
            d_old = math.hypot(sx - prev["x"], sz - prev["lane"])
            loser = a if d_new > d_old else prev
            held[a["slot"]] = prev if loser is a else a
            loser["slot"] = -1          # 下一帧重新挑，别站在别人身上
        self._occ = {k: {i: v["id"] for i, v in d.items()} for k, d in occ.items()}

    def _separate_soldiers(self):
        """轻推重叠的身体，给围攻和侧向绕行留出空间。"""
        live = [s for s in self.soldiers if s["hp"] > 0]
        for _ in range(8):
            for i, a in enumerate(live):
                for b in live[i + 1:]:
                    dx, dz = b["x"] - a["x"], b["lane"] - a["lane"]
                    dist = math.hypot(dx, dz)
                    separation = contact_distance(a, b)
                    if dist >= separation:
                        continue
                    if dist < 0.001:
                        dx, dz, dist = (1.0 if a["id"] < b["id"] else -1.0), 0.0, 1.0
                        overlap = separation
                    else:
                        overlap = separation - dist
                    push = min(overlap * 0.5, 0.22)
                    nx, nz = dx / dist, dz / dist
                    a["x"] = max(PK_LEFT, min(PK_RIGHT, a["x"] - nx * push))
                    b["x"] = max(PK_LEFT, min(PK_RIGHT, b["x"] + nx * push))
                    a["lane"] = max(-PK_LANE_MAX, min(PK_LANE_MAX, a["lane"] - nz * push))
                    b["lane"] = max(-PK_LANE_MAX, min(PK_LANE_MAX, b["lane"] + nz * push))

    def _past(self, foe, s, to_me):
        """我是不是已经绕到侧面 / 后面了。
        正面绕后要额外计入路径成本；已经在侧后方则无需额外绕路。"""
        if (s["x"] - foe["x"]) * to_me < -0.25:
            return True                       # 已经过了敌人的 x
        return abs(s["lane"] - foe["lane"]) > 0.72   # 已经在外侧，贴着能绕过去

    def _pick_target(self, s):
        """挑一个「有空位子」的敌人，返回 (敌人, 距离, 位子号)。
        一个敌人都挑不到就返回 slot=-1 去外圈等。

        **认准了就锁住**：目标还活着、位子还在自己手上，就一直朝那一格走，
        不每帧重新算。早先每帧重挑的版本会这样：敌人挪了半米，
        所有位子的分数一起变，兵就在两个位子之间来回改主意 ——
        脚下一会儿往左一会儿往右，看着像「挤来挤去不出手」，其实是没走到过。"""
        occ = self._occ
        prev_foe, prev_slot = s["foe"], s["slot"]
        # 先把上一帧占的位子还回去，不然自己会把自己算成第五个人。
        # 只还「确实是自己占的那一格」—— 按位子号直接 pop 会把别人的名额删掉。
        if prev_slot >= 0 and prev_foe is not None:
            got = occ.get(prev_foe)
            if got is not None and got.get(prev_slot) == s["id"]:
                got.pop(prev_slot, None)
        # 路上遇到贴身敌人时先应战，不能锁着远处目标一路从他身上穿过去。
        close, close_dist = self._nearest_foe(s)
        old = self._alive(prev_foe) if prev_foe is not None else None
        if (old is not None and close is not None and close is not old
                and close_dist < melee_reach(s, close)
                and math.hypot(old["x"] - s["x"], old["lane"] - s["lane"]) > melee_reach(s, old)
                and len(occ.get(close["id"], {})) < PK_MAX_ATK):
            prev_slot = -1
        # ★ 锁：目标还在、位子还在我手上 → 接着走，不重挑
        if prev_slot >= 0 and prev_foe is not None:
            o = self._alive(prev_foe)
            if o is not None and not (s["avoid_t"] > 0 and o["id"] == s["avoid"]):
                held = occ.get(o["id"])
                if held is None or held.get(prev_slot, s["id"]) == s["id"]:
                    occ.setdefault(o["id"], {})[prev_slot] = s["id"]
                    s["slot"] = prev_slot
                    return (o, math.hypot(o["x"] - s["x"], o["lane"] - s["lane"]),
                            prev_slot)
        s["slot"] = -1
        best = None
        bcost = 1e9
        near, nd = None, 1e9
        av_t = s["avoid_t"]
        al_t = s["avoid_lane_t"]
        for o in self.soldiers:
            if o["side"] == s["side"] or o["hp"] <= 0:
                continue
            d = math.hypot(o["x"] - s["x"], o["lane"] - s["lane"])
            if d < nd:
                nd, near = d, o
            if av_t > 0 and o["id"] == s["avoid"]:
                continue                      # 刚从那儿挤开，先别回去
            if d > PK_SLOT_RANGE:
                continue                      # 还远，先走过去，走近了再占位子
            held = occ.get(o["id"])
            if held is not None and len(held) >= PK_MAX_ATK:
                continue
            if held is None:
                held = {}
            to_me = -1.0 if o["side"] == 1 else 1.0
            rear_ok = self._past(o, s, to_me)
            for i in range(len(PK_SLOTS)):
                if i in held:
                    continue
                sx, sz = self._slot_xy(o, i, s)
                crowded = False
                for occupied, owner_id in held.items():
                    owner = self._alive(owner_id)
                    if owner is None:
                        continue
                    hx, hz = self._slot_xy(o, occupied, owner)
                    if math.hypot(sx - hx, sz - hz) < contact_distance(s, owner) * .96:
                        crowded = True
                        break
                if crowded:
                    continue
                c = math.hypot(sx - s["x"], sz - s["lane"]) + d * 0.15
                # 已经有人围着的人，再往上一刀要加价：不加的话所有人都扑向
                # 「最近的那一个」，十几个人堆成一个小山包，旁边的人站着看。
                # 加价之后自然摊成「沿战线几个小包围圈」，正面才打得开。
                c += 0.58 * len(held)
                if i in (1, 2):
                    c += 2.0  # 优先利用正面、两翼和背后，避免所有人挤在正面
                # 已经贴到身边的敌人优先打：两个人肩顶肩站着、各自去追远处的
                # 目标，画面上就是「顶在一起谁也不出手」。谁贴着你，就先打谁。
                if d <= PK_CLASH_R:
                    c -= 1.4
                if PK_SLOTS[i][0] < 0 and not rear_ok:
                    c += PK_REAR_COST          # 从正面直接穿过去绕后，多付点代价
                if al_t > 0 and abs(sz - s["avoid_lane"]) < 0.28:
                    c += 1.2                   # 刚在这条道上被堵过，换条道走
                if c < bcost:
                    bcost, best = c, (o, i)
        if best is not None:
            o, i = best
            occ.setdefault(o["id"], {})[i] = s["id"]   # 当场占住，同帧后面的人抢不到
            s["slot"] = i
            return o, math.hypot(o["x"] - s["x"], o["lane"] - s["lane"]), i
        # 一个位子都没有：去最近的敌人外围等着，前面倒一个就补位
        if near is not None:
            return near, nd, -1
        return None, 1e9, -1

    def _nearest_foe(self, s):
        """老接口，留着给别处用：只要最近的活敌人，不管位子。"""
        foe, best = None, 1e9
        for o in self.soldiers:
            if o["side"] == s["side"] or o["hp"] <= 0:
                continue
            d = math.hypot(o["x"] - s["x"], o["lane"] - s["lane"])
            if d < best:
                best, foe = d, o
        return foe, best

    # ---------------- 一刀下去：算伤害 ----------------
    @staticmethod
    def _dmg(atk_tier, def_tier, mul):
        """伤害 = (攻击 × 招式倍率 − 防御 ÷ 2) × 系数，最少 1 点。
        防御只有攻击的一半还不到，所以低级兵砍高级兵依然砍得动，只是很慢 ——
        这正是「一级兵换三级兵要拿命填」的意思。"""
        a = PK_TIERS[max(0, min(len(PK_TIERS) - 1, atk_tier - 1))]
        d = PK_TIERS[max(0, min(len(PK_TIERS) - 1, def_tier - 1))]
        return max(1.0, (a["atk"] * mul - d["df"] * 0.5) * PK_DMG_SCALE)

    def _resolve_hit(self, s, foe, kind, mul=None):
        """一刀砍下去，按「命中 → 闪避 → 格挡 → 暴击」的顺序判。
        以前是写死的 30%/20% 概率，不看兵种；现在全按属性表走。
        mul 不传就用招式表里的倍率；方士散开打的时候会把 60%/40% 传进来。"""
        a = s["stats"]
        d = foe["stats"]
        if mul is None:
            mul = PK_ACT[kind]["mul"]

        # 1) 命中：低级兵命中率低，一刀劈空很常见
        if random.random() >= a["hit"]:
            self._emit("miss", foe, attacker=s["id"], attack=kind)
            return "miss"

        # 2) 闪避：守方闪开了，一点血都不掉
        if random.random() < d["dodge"]:
            if foe["st"] != "dodge":
                foe["st"], foe["st_t"], foe["hit_done"] = "dodge", 0.0, False
            if foe["foe"] != s["id"]:
                foe["foe"], foe["slot"] = s["id"], -1   # 真换了目标，旧位子才作废
            self._emit("dodge", foe, attacker=s["id"], attack=kind)
            return "dodge"

        dmg = max(1.0, (a["atk"] * mul - d["df"] * 0.5) * PK_DMG_SCALE)

        # 3) 格挡：举盾挡下大半，还是会被震掉一点血
        if random.random() < d["block"]:
            dmg *= 0.35
            if foe["st"] != "block":
                foe["st"], foe["st_t"], foe["hit_done"] = "block", 0.0, False
            if foe["foe"] != s["id"]:
                foe["foe"], foe["slot"] = s["id"], -1   # 真换了目标，旧位子才作废
            foe["hp"] -= dmg
            self._emit("block", foe, attacker=s["id"], attack=kind, dmg=round(dmg, 1))
            return "block"

        # 4) 暴击：只有跳劈会翻倍
        crit = kind in ("leap", "shot", "thrust", "bash") and random.random() < a["crit"]
        if crit:
            dmg *= 2
        foe["hp"] -= dmg
        # 硬直免疫窗：连着挨打不会一直被按住
        if foe.get("istun", 0.0) <= 0.0:
            foe["st"], foe["st_t"], foe["hit_done"] = "hurt", 0.0, False
            foe["istun"] = 0.55
        if foe["foe"] != s["id"]:                    # 被谁打了就回头打谁（同一个目标就别动位子，
            foe["foe"], foe["slot"] = s["id"], -1   #  不然每挨一刀都要重新走一遍）
        self._emit("hit", foe, attacker=s["id"], attack=kind, dmg=round(dmg, 1), crit=1 if crit else 0)
        return "hit"

    def _boss_aoe(self, s):
        """武将群攻：横扫身前一条线，最多同时打 3 个，每人吃 70%。
        一条路上目标本来就是排着的，这一下能扫到对面一整队 ——
        武将值钱就值钱在这儿。"""
        n = 0
        for o in self.soldiers:
            if n >= PK_BOSS_AOE_N:
                break
            if o["side"] == s["side"] or o["hp"] <= 0:
                continue
            if abs(o["x"] - s["x"]) > PK_BOSS_AOE_RX:
                continue
            dmg = max(1.0, (s["stats"]["atk"] * PK_BOSS_AOE_MUL - o["stats"]["df"] * 0.5) * PK_DMG_SCALE)
            o["hp"] -= dmg
            if o["foe"] != s["id"]:
                o["foe"], o["slot"] = s["id"], -1
            n += 1
            self._emit("aoehit", o, attacker=s["id"], dmg=round(dmg, 1))
        self._emit("aoe", s, n=n)

    def _fangshi_cast(self, s):
        """方士放术：射程内最多挑 3 个敌人，一发法术同时落在他们身上。
        分摊规则（用户定的）：打 1 个吃满 100%，打 2 个各 60%，打 3 个各 40%。
        每个人各自过「命中 → 闪避 → 格挡」，所以分散打不一定三下都成立 ——
        但它一次能覆盖一整排，是清后排和小兵海的主力。

        法术也走 pending：飞行 0.4 秒后才结算，画面和掉血同一帧。"""
        reach = PK_KIND_RANGE["mage"]
        cand = []
        for o in self.soldiers:
            if o["side"] == s["side"] or o["hp"] <= 0:
                continue
            d = math.hypot(o["x"] - s["x"], o["lane"] - s["lane"])
            if d <= reach:
                cand.append((d, o))
        if not cand:
            return 0
        cand.sort(key=lambda it: it[0])
        picks = [it[1] for it in cand[:PK_FANGSHI_N]]
        mul = PK_FANGSHI_SPLIT[len(picks)]
        for o in picks:
            self.pending.append({"due": self.t + PK_PROJECTILE_FLY, "type": "projectile",
                                 "attacker": s, "target": o["id"], "attack": "shot",
                                 "mul": mul})
            # 每个目标各发一颗法球：客户端就能看出「这一下打了几个人」
            self._emit("projectile", s, target=o["id"], tx=round(o["x"], 2),
                       tl=round(o["lane"], 2), kind="mage", fly=PK_PROJECTILE_FLY,
                       at=round(self.t, 3), mul=mul)
        if s["id"] and s["foe"] != picks[0]["id"]:
            s["foe"] = picks[0]["id"]
        self._emit("mage_cast", s, n=len(picks))
        return len(picks)

    def _tick_soldier(self, s, dt):
        st = s["st"]
        if s["avoid_t"] > 0:
            s["avoid_t"] -= dt          # 「躲开这个目标」的计时
        if s["avoid_lane_t"] > 0:
            s["avoid_lane_t"] -= dt     # 「躲开这条道」的计时
        if st in PK_ACTING:
            s["st_t"] += dt
            spec = PK_ACT[st]
            if not s["hit_done"] and "hit" in spec and s["st_t"] >= spec["hit"]:
                s["hit_done"] = True
                if s.get("gate_attack") and st in ("shot", "thrust"):
                    gate = 1 - s["side"]
                    self.pending.append({"due": self.t + PK_PROJECTILE_FLY,
                                         "type": "castle_projectile", "attacker": s,
                                         "gate": gate, "damage": s["atk"] * PK_GATE_MUL})
                    self._emit("projectile", s, target=0, gate=gate,
                               tx=PK_RIGHT if gate == 1 else PK_LEFT, tl=round(s["lane"], 2),
                               ty=2.2, kind=s["kind"], fly=PK_PROJECTILE_FLY, at=round(self.t, 3))
                elif spec.get("gate"):
                    # 砸门：砍的是石头，没有防御，按攻击力的倍数掉血
                    self.hp[1 - s["side"]] -= s["atk"] * PK_GATE_MUL
                    self._emit("smash", s)
                elif spec.get("aoe"):
                    self._boss_aoe(s)
                elif s["kind"] == "mage" and st == "shot":
                    # 方士不点对点打：一发法术挑射程内最近的 1~3 个
                    self._fangshi_cast(s)
                else:
                    foe = self._alive(s["foe"])
                    reach = (melee_reach(s, foe) if foe is not None and st not in ("shot", "thrust")
                             else PK_KIND_RANGE[s["kind"]])
                    if foe is not None and math.hypot(foe["x"] - s["x"], foe["lane"] - s["lane"]) <= reach + 0.20:
                        if st in ("shot", "thrust"):
                            self.pending.append({"due": self.t + PK_PROJECTILE_FLY, "type": "projectile", "attacker": s, "target": foe["id"], "attack": st})
                            self._emit("projectile", s, target=foe["id"], tx=round(foe["x"], 2),
                                       tl=round(foe["lane"], 2), kind=s["kind"], fly=PK_PROJECTILE_FLY, at=round(self.t, 3))
                            return
                        if st == "leap":
                            # 只使用身体安全间距之外的余量做轻微踏进，不能把将军推入对手。
                            d = math.hypot(foe["x"] - s["x"], foe["lane"] - s["lane"]) - contact_distance(s, foe)
                            if d > 0:
                                dx, dz = foe["x"] - s["x"], foe["lane"] - s["lane"]
                                length = max(0.001, math.hypot(dx, dz))
                                s["x"] += dx / length * min(0.08, d * 0.3)
                                s["lane"] += dz / length * min(0.08, d * 0.3)
                        self._resolve_hit(s, foe, st)
            if s["st_t"] >= spec["dur"]:
                s["st"], s["st_t"], s["hit_done"] = "walk", 0.0, False
                if st in ("wind", "leap", "smash", "aoe", "shot", "thrust", "bash"):
                    s["cd"] = 0.12 + random.random() * 0.24
                elif st == "block":
                    s["cd"] = max(s["cd"], 0.12 + random.random() * 0.22)
            return

        # ---- 走路 / 找人打 ----
        # 让路：刚被判「挤住了」，先横着挪开半秒，别在原地跟人顶牛。
        # 这一步是整个防卡的地基 —— 原地互相推是走不出去的，只有横着错开一条道才行。
        if s["detour"] > 0:
            s["detour"] -= dt
            s["lane"] = max(-PK_LANE_MAX,
                            min(PK_LANE_MAX,
                                s["lane"] + s["detour_sign"] * s["spd"] * PK_STRAFE * dt))
            s["still"] = 0.0
            return

        # 远程兵不占近战围攻位，站在各自射程内攻击。
        # 方士也走这一条：它射程 13 米，会停在离敌阵更远的地方放法术。
        if s["kind"] in ("thrower", "archer", "spearman", "mage"):
            foe, dist = self._nearest_foe(s)
            if foe is not None:
                s["gate_attack"] = False
                s["foe"], s["slot"] = foe["id"], -1
                reach = PK_KIND_RANGE[s["kind"]]
                if dist <= reach:
                    s["still"] = 0.0
                    if s["cd"] <= 0:
                        if s["kind"] == "mage":
                            # 方士永远放术，不会贴脸拿杖子敲人
                            s["st"] = "shot"
                        else:
                            s["st"] = ("bash" if dist <= melee_reach(s, foe) else
                                       ("thrust" if s["kind"] == "spearman" else "shot"))
                        s["st_t"], s["hit_done"] = 0.0, False
                        self._emit(s["st"], s)
                    return
                dx, dz = s["x"] - foe["x"], s["lane"] - foe["lane"]
                inv = 1.0 / max(dist, 0.001)
                # 站多远：普通远程贴着射程边缘（0.85），方士只站 0.55 ——
                # 它射程 13 米，站在边缘的话离自己人太远，镜头都追不到它，
                # 而且身边没有同伴挡着，会被冲上来的近战一刀一个。
                stop = 0.55 if s["kind"] == "mage" else 0.85
                tx = foe["x"] + dx * inv * reach * stop
                tz = foe["lane"] + dz * inv * reach * stop
                self._advance(s, tx, tz, dt, PK_SLOT_GAP, PK_RUN if dist > 6 else 1.0)
                if s["still"] >= PK_STILL_MAX:
                    self._unstick(s)
                return
        foe, dist, slot = self._pick_target(s)
        # 离得远就跑（路上省一半时间），快接敌了就收成走路 ——
        # 走位那一段要稳，跑起来会像滑冰。
        rate = PK_RUN if dist > 6.0 else 1.0
        if foe is not None:
            s["gate_attack"] = False
            s["foe"] = foe["id"]
            if slot < 0:
                # 七个位子全被占了：去外圈等着，别硬往里挤（挤进去只会把里面
                # 正在砍的人推离位子，四个人一起卡死）。等的人回到自己出生那一列，
                # 前面倒一个立刻补位。
                s["slot"] = -1
                dxx = foe["x"] - s["x"]
                if abs(dxx) > PK_WAIT_R:
                    ahead = 1 if dxx > 0 else -1
                    mv = min(abs(dxx) - PK_WAIT_R, s["spd"] * rate * dt)
                    mv = min(mv, self._room_ahead(s, ahead))
                    if mv > 0:
                        s["x"] += ahead * mv
                dz = s["home"] - s["lane"]
                if abs(dz) > 0.02:
                    s["lane"] += math.copysign(
                        min(abs(dz), s["spd"] * PK_STRAFE * dt), dz)
                return
            s["slot"] = slot
            tx, tz = self._slot_xy(foe, slot, s)
            reach = melee_reach(s, foe)
            gap = math.hypot(foe["x"] - s["x"], foe["lane"] - s["lane"])
            # 绕后要先沿目标侧面通过，再向内收；不能径直穿过目标。
            to_me = -1.0 if foe["side"] == 1 else 1.0
            if PK_SLOTS[slot][0] < 0 and (s["x"] - foe["x"]) * to_me > -0.55:
                sign = 1 if PK_SLOTS[slot][1] > 0 else -1
                detour_radius = reach - .10 + contact_distance(s, foe) + .12
                side_lane = max(-PK_LANE_MAX, min(PK_LANE_MAX, foe["lane"] + sign * detour_radius))
                if abs(side_lane - foe["lane"]) < 0.75:
                    side_lane = max(-PK_LANE_MAX, min(PK_LANE_MAX, foe["lane"] - sign * detour_radius))
                if abs(s["lane"] - side_lane) > 0.15:
                    self._advance(s, s["x"], side_lane, dt, PK_SLOT_GAP, rate)
                else:
                    self._advance(s, tx, side_lane, dt, PK_SLOT_GAP, rate)
                if s["still"] >= PK_STILL_MAX:
                    self._unstick(s)
                return
            # 已在正面攻击距离时立刻停下开打，避免先朝站位点挤进对手身体。
            arrived = gap <= reach and slot < 3
            if not arrived:
                arrived = self._advance(s, tx, tz, dt, PK_SLOT_GAP, rate)
            gap = math.hypot(foe["x"] - s["x"], foe["lane"] - s["lane"])
            if not arrived:
                # **够得着就开打**，不再要求「正好站到那一格」。
                # 以前差 7 厘米都不算到位，两个人一顶上谁也不出手，
                # 就那么肩顶肩僵在那儿 —— 用户说的「两个人顶在一起」就是这个。
                # 侧翼/背后那两个位子要等横移到位（不然绕后的人会在正面就开打，
                # 永远绕不过去）。
                ok_side = (slot < 3) or (abs(s["lane"] - tz) <= 0.35)
                if slot in (3, 4):
                    ok_side = ok_side and abs(s["x"] - tx) <= .22
                if not (gap <= reach and ok_side):
                    # 挪不动超过 0.75 秒 = 被人堵死了，换个走法
                    if s["still"] >= PK_STILL_MAX:
                        self._unstick(s)
                    return
            # 到位（或者本来就够得着）→ 站定开打
            s["still"] = 0.0
            if gap > reach:
                return
            if s["tier"] == 4 and s["aoe_cd"] <= 0:
                s["st"], s["st_t"], s["hit_done"] = "aoe", 0.0, False
                s["aoe_cd"] = PK_BOSS_AOE_CD
                self._emit("aoe_wind", s)
                return
            if s["cd"] <= 0:
                kind = "leap" if (s["tier"] >= 2 and random.random() < 0.28) else "wind"
                s["st"], s["st_t"], s["hit_done"] = kind, 0.0, False
                self._emit(kind, s)
                return
            # 还没轮到自己砍：举盾等着
            if random.random() < dt * 1.2:
                s["st"], s["st_t"], s["hit_done"] = "block", 0.0, False
            return

        # ---- 场上一个敌人都没了，才去攻城 ----
        ranged = s["kind"] in ("thrower", "archer", "spearman", "mage")
        gate_distance = PK_KIND_RANGE[s["kind"]] * .85 if ranged else PK_GATE_RANGE
        gate_x = (PK_RIGHT - gate_distance) if s["side"] == 0 else (PK_LEFT + gate_distance)
        # 走过头了（门就在身后 / 被顶过去了）：直接贴到门口，别又往回挪半米
        if (s["x"] - gate_x) * (1 if s["side"] == 0 else -1) > 0:
            s["x"] = gate_x
        if self._advance(s, gate_x, s["home"], dt, PK_QUEUE_GAP, PK_RUN):
            s["x"] = gate_x
            # 一排人同时到门口会一起抬手，错开一下
            if not s["gate_warm"]:
                s["gate_warm"] = True
                s["cd"] = max(s["cd"], random.random() * 1.1)
            if s["cd"] <= 0:
                action = ("thrust" if s["kind"] == "spearman" else "shot") if ranged else "smash"
                s["st"], s["st_t"], s["hit_done"] = action, 0.0, False
                s["gate_attack"] = True
                s["foe"] = None
                self._emit(action if ranged else "smash_wind", s)
        elif s["still"] >= PK_STILL_MAX:
            self._unstick(s)

    # ---------------- 连击喂城堡 ----------------
    def combo_buff(self, side, combo):
        """连击的第二个用处：回血 + 升级。
        每 5 连击回 PK_CASTLE_HEAL（250）血；每 10 连击升一级，
        上限按基础值的 10% 涨（5000 → 5500 → … → 7000），涨多少就补多少血。
        满 5 级就不再加了，但回血照旧 —— 连击打得久的人，城就是更硬。"""
        out = []
        if combo % 10 == 0 and self.lv[side] < PK_CASTLE_MAXLV:
            old = self.castle_max(side)
            self.lv[side] += 1
            new = self.castle_max(side)
            self.hp[side] = min(new, self.hp[side] + (new - old))
            out.append("levelup")
            self._emit("levelup", x=PK_LEFT if side == 0 else PK_RIGHT, lane=0.0,
                       sd=side, lv=self.lv[side], mx=new, hp=int(self.hp[side]))
        if combo % 5 == 0:
            mx = self.castle_max(side)
            add = min(PK_CASTLE_HEAL, mx - self.hp[side])
            if add > 0:
                self.hp[side] += add
                out.append("heal")
                self._emit("heal", x=PK_LEFT if side == 0 else PK_RIGHT, lane=0.0,
                           sd=side, n=int(add), hp=int(self.hp[side]))
        return out

    # ---------------- 阵营技能：城堡箭雨 ----------------
    def volley(self, side):
        """连对 15 题，自家城堡射 10 支箭。场上有敌人就打人，没有就打城。
        伤害在箭落地那一刻才结算（0.55 秒后），这样画面和掉血是同一个瞬间，
        不会出现「箭还在天上飞，人已经倒了」。"""
        foe = 1 - side
        alive = [o for o in self.soldiers if o["side"] == foe and o["hp"] > 0]
        arrows = []
        for _ in range(PK_ARROW_COUNT):
            if alive:
                t = alive[random.randrange(len(alive))]
                arrows.append({"id": t["id"], "x": round(t["x"], 2), "l": round(t["lane"], 2),
                               "d": random.randint(*PK_ARROW_DMG)})
            else:
                arrows.append({"id": 0,
                               "x": round(PK_RIGHT if side == 0 else PK_LEFT, 2),
                               "l": 0.0, "d": random.randint(*PK_ARROW_GATE)})
        self.pending.append({"t": PK_ARROW_FLY, "side": side, "arrows": arrows})
        self._emit("volley", x=PK_LEFT if side == 0 else PK_RIGHT, lane=0.0,
                   sd=side, a=arrows, fly=PK_ARROW_FLY, at=round(self.t, 3))

    def _land_volley(self, p):
        foe = 1 - p["side"]
        for a in p["arrows"]:
            if a["id"] == 0:
                self.hp[foe] -= a["d"]
            else:
                s = self._alive(a["id"])
                if s is not None:
                    s["hp"] -= a["d"]
        self._emit("volleydone", x=PK_LEFT if p["side"] == 0 else PK_RIGHT, lane=0.0,
                   sd=p["side"])

    # ---------------- 答对 / 答错 ----------------
    def do_answer(self, p, ok):
        """一次答题结算。真人和 AI 共用这一条路 ——
        机器人局里唯一的不同只是「谁在触发它」，出兵/连击/回血/升级/箭雨
        一行代码都不用另写，所以 AI 不可能偷偷比真人强。"""
        if ok:
            p["combo"] += 1
            p["right"] += 1
            combo = p["combo"]
            side = p["side"]
            # 连击决定这一次出什么兵（3→二级 / 8→三级 / 20→武将，公倍数取最高）
            tier = tier_for_combo(combo)
            kind = "general" if tier == 3 else PK_KINDS[self.kind_n[side][tier] % len(PK_KINDS)]
            if tier < 3:
                self.kind_n[side][tier] += 1
            s = self.spawn(side, tier, kind=kind)
            # 连击还喂城堡：5 的倍数回血，10 的倍数升级
            buffs = self.combo_buff(side, combo)
            if s is None:
                buffs.append("reserve")     # 场上站满了，这个兵进后备队
            # 每 10 连击必出一个方士：和上面那个兵**同时**出场（不占名额）
            mage = None
            if combo % PK_FANGSHI_EVERY == 0:
                mage = self.spawn(side, PK_FANGSHI_TIER, kind="mage")
                buffs.append("fangshi" if mage is not None else "fangshi_reserve")
            # 连对 15 题：自家城堡放一次箭雨
            if combo % PK_ARROW_EVERY == 0:
                self.volley(side)
                buffs.append("volley")
            self.bump()
            return {"ok": True, "combo": combo, "tier": tier + 1,
                    "soldier": ([s["id"], s["side"], s["tier"],
                                 round(s["x"], 2), round(s["lane"], 2), s["kind"]]
                                if s is not None else None),
                    "mage": ([mage["id"], mage["side"], mage["tier"],
                              round(mage["x"], 2), round(mage["lane"], 2), mage["kind"]]
                             if mage is not None else None),
                    "buffs": buffs, "lv": self.lv[side],
                    "rsv": len(self.reserve[side]),
                    "hpmax": self.castle_max(side), "hp": int(self.hp[side])}
        p["combo"] = 0
        p["wrong"] += 1
        self.bump()
        return {"ok": True, "combo": 0}

    def bot_step(self, dt):
        """AI 的心跳：这一题做完就接着做下一题。

        以前是一个固定定时器（宗师的 gap 是 1.5~2.3 秒），等于「每两秒不到就
        出一个兵」，比成年人的手速还快，所以高手/宗师那边永远是黑压压一片
        —— 兵不是打出来的，是刷出来的。现在每题单独算一遍耗时：
        读题（按这题好不好读）+ 作答（拼写比点选项慢）+ 偶尔卡壳，
        再叠上「连击越高越手忙脚乱」的疲劳，节奏就有快有慢、越打越喘。

        答对率同理：基础答对率再减掉疲劳。连得越长越容易断，
        所以它不可能靠一口气连到 60 出武将 —— 那是人打出来的成绩。"""
        if self.bot is None or self.state != "playing":
            return
        b = self.bot
        b["t"] -= dt
        if b["t"] > 0:
            return
        combo = b["p"]["combo"]
        b["t"] = self.bot_delay(b, combo)
        self.do_answer(b["p"], random.random() < self.bot_acc(b, combo))

    def bot_delay(self, b, combo=0):
        """这一题要花多久。读题、作答、卡壳三段加起来，再乘疲劳。"""
        # 六成单词题（和客户端出题比例一致）：拼写要一个字母一个字母敲，
        # 比点选项慢；语法题题干长，读的时间更久。
        word = random.random() < 0.6
        # 0.35~1.0 的「这题好不好读」：短词一眼看完，长句得来回读两遍
        hard = 0.35 + 0.65 * random.random()
        read = b["read"][0] + (b["read"][1] - b["read"][0]) * hard
        act_lo, act_hi = b["act"]
        if word:
            act = act_lo + (act_hi - act_lo) * (0.35 + 0.65 * random.random())
        else:
            act = act_lo + (act_hi - act_lo) * (0.20 + 0.45 * random.random())
        d = read + act
        if random.random() < b["stall"]:          # 卡壳：想不起来，愣一下
            lo, hi = b["stall_add"]
            d += lo + (hi - lo) * random.random()
        d *= 1.0 + min(PK_AI_FATIGUE_SPD_MAX, max(0, combo) * b["fatigue"] * 0.6)
        return d

    def bot_acc(self, b, combo=None):
        """这一题答对的概率。连击越高越容易错（手忙脚乱），但不会低于 8 折。"""
        if combo is None:
            combo = b["p"]["combo"]
        if b["acc"] >= 0.999:      # 调试用：把 acc 写成 1.0 就是「不会错的机器」
            return 1.0
        pen = min(PK_AI_FATIGUE_ACC, max(0, combo) * b["fatigue"])
        return max(0.35, b["acc"] - pen)

    # ---------------- 每帧推进 ----------------
    def step(self, dt):
        if self.state != "playing":
            return
        self.t += dt
        self.bot_step(dt)
        self._build_occ()
        hp0 = (self.hp[0], self.hp[1])
        for s in self.soldiers:
            if s["hp"] <= 0:
                continue
            s["cd"] -= dt
            if s.get("istun", 0.0) > 0.0:
                s["istun"] -= dt
            if s["tier"] == 4:
                s["aoe_cd"] -= dt
                # 武将被打到 1/3 血会自己吼一声回满，一局只有一次
                if not s["healed"] and 0 < s["hp"] <= s["max"] / 3.0:
                    s["healed"] = True
                    s["hp"] = s["max"]
                    self._emit("bossheal", s)
            self._tick_soldier(s, dt)
            # 兜底：路只有 3.3 米宽，谁也别飘到草地里去
            if s["lane"] > PK_LANE_MAX:
                s["lane"] = PK_LANE_MAX
            elif s["lane"] < -PK_LANE_MAX:
                s["lane"] = -PK_LANE_MAX
        self._settle_occ()
        self._separate_soldiers()

        # 箭雨落地
        if self.pending:
            for p in list(self.pending):
                if p.get("type") in ("projectile", "castle_projectile"):
                    landed = self.t + 1e-9 >= p["due"]
                else:
                    p["t"] -= dt
                    landed = p["t"] <= 0
                if landed:
                    self.pending.remove(p)
                    if p.get("type") == "castle_projectile":
                        self.hp[p["gate"]] -= p["damage"]
                        self._emit("smash", p["attacker"], gate=p["gate"], ranged=1)
                    elif p.get("type") == "projectile":
                        target = self._alive(p["target"])
                        if target is not None:
                            self._resolve_hit(p["attacker"], target, p["attack"],
                                              p.get("mul"))
                    else:
                        self._land_volley(p)

        dead = [s for s in self.soldiers if s["hp"] <= 0]
        if dead:
            for s in dead:
                self.kills[1 - s["side"]] += 1
                self._emit("die", s)
            self.soldiers = [s for s in self.soldiers if s["hp"] > 0]
            # 有人倒下，后备队顶上
            for i in (0, 1):
                while self.reserve[i] and self._alive_n(i) < PK_MAX_ALIVE:
                    tier_idx, kind = self.reserve[i].pop(0)
                    self.spawn(i, tier_idx, force=True, kind=kind)
        # 城门掉血要立刻推给客户端，不然血条要慢半拍
        if (self.hp[0], self.hp[1]) != hp0:
            self.bump()

        if self.hp[0] <= 0 or self.hp[1] <= 0:
            # hp[0] 是左边（0 号位）的城堡，hp[1] 是右边（1 号位）的。
            # 谁的城堡先没，谁就输 —— 这里别写反。
            if self.hp[0] <= 0 and self.hp[1] <= 0:
                win = 0 if self.hp[0] >= self.hp[1] else 1
            elif self.hp[1] <= 0:
                win = 0
            else:
                win = 1
            self.finish(win, "castle")
        elif self.t >= PK_MAX_TIME:
            # 超时：先比血量百分比（等级不同上限不同，绝对值比不公平），
            # 一样多再比谁砍倒的兵多 —— 光靠耗时间赢不算赢
            r = [self.hp[0] / float(self.castle_max(0)),
                 self.hp[1] / float(self.castle_max(1))]
            if abs(r[0] - r[1]) > 0.01:
                win = 0 if r[0] > r[1] else 1
            elif self.kills[0] != self.kills[1]:
                win = 0 if self.kills[0] > self.kills[1] else 1
            else:
                win = 0
            self.finish(win, "time")

    def offline_side(self, now):
        """谁掉线了 —— 返回该判负的一边，没人掉线返回 None。
        机器人没有轮询，它的 seen 永远是开场那一刻，所以必须跳过，
        否则 AI 局开局 8 秒就会被判「对手掉线」莫名其妙结束。"""
        for p in self.players:
            if p.get("bot"):
                continue
            if now - p["seen"] > PK_DISCONNECT:
                return 1 - p["side"]
        return None

    # ---------------- 结束 ----------------
    def finish(self, win_side, reason):
        if self.state == "over":
            return
        self.state = "over"
        self.ended = time.time()
        self.over = {"win": win_side, "reason": reason, "dur": round(self.t, 1),
                     "kills": [self.kills[0], self.kills[1]]}
        p = None
        for q in self.players:
            if q["side"] == win_side:
                p = q
                break
        if p is not None and not self.free:
            new = pk_add_stars(p["who"], PK_WIN_BONUS)
            if new is not None:
                p["stars"] = new
        self.bump()

    # ---------------- 快照 ----------------
    def snapshot(self, who, since_ev=0):
        p = self.find(who)
        me = None
        if p is not None:
            me = {"side": p["side"], "faction": self.factions[p["side"]], "combo": p["combo"],
                  "right": p["right"], "wrong": p["wrong"], "stars": p["stars"]}
        op = None
        for q in self.players:
            if q is not p:
                op = {"who": q["who"], "right": q["right"], "combo": q["combo"]}
        # 兵：id / 边 / 级 / x / 路 / 动作码 / 动作进度 / 血比 / 目标 id
        troops = []
        for s in self.soldiers:
            spec = PK_ACT.get(s["st"])
            dur = spec["dur"] if spec else 0.001
            prog = 0.0 if s["st"] == "walk" else min(1.0, s["st_t"] / dur)
            troops.append([s["id"], s["side"], s["tier"], round(s["x"], 2),
                           round(s["lane"], 2), PK_ST_CODE.get(s["st"], 0),
                           round(prog, 3), round(max(0.0, s["hp"]) / float(s["max"]), 2),
                           s["foe"], s["kind"]])
        return {
            "ok": True,
            "v": self.v,
            "state": self.state,
            "t": round(self.t, 2),
            "hp": [max(0, int(self.hp[0])), max(0, int(self.hp[1]))],
            "soldiers": troops,
            "ev": [e for e in self.ev if e["i"] > since_ev],
            "evn": self.evn,
            "me": me,
            "op": op,
            "over": self.over,
            "max": PK_CASTLE_HP,
            "hpmax": [self.castle_max(0), self.castle_max(1)],
            "lv": [self.lv[0], self.lv[1]],
            "kills": [self.kills[0], self.kills[1]],
            "rsv": [len(self.reserve[0]), len(self.reserve[1])],
            "cap": PK_MAX_ALIVE,
            "limit": int(PK_MAX_TIME),
            "free": self.free,
            "ai": (self.bot["key"] if self.bot else ""),
            "players": [{"who": q["who"], "side": q["side"]} for q in self.players],
            "factions": list(self.factions),
        }


def pk_new_code():
    for _ in range(200):
        code = "%04d" % random.randint(1000, 9999)
        if code not in PK_ROOMS:
            return code
    return "%06d" % random.randint(100000, 999999)


def pk_create(who, free=False, ai=None, faction="female", deployment=None):
    who = safe_profile_name(who)
    if not who:
        return {"ok": False, "error": "先在设置里填个学习档案的名字"}
    ai = (ai or "").strip().lower()
    if ai not in PK_AI:
        ai = ""
    faction = "male" if faction == "male" else "female"
    side = {"left": 0, "right": 1}.get(deployment, 1 if faction == "male" else 0)
    # AI 练功房一律不扣星、赢了也不加星 —— 一个人练手不该烧报名费，
    # 但也绝不能靠刷 AI 攒星星，否则星星就不值钱了。
    if ai:
        free = True
    with PK_LOCK:
        d, _ = _pk_load(who)
        if d is None:
            return {"ok": False, "error": "这台设备还没建过档案，先去首页做几道题"}
        bal = int(d.get("sm_stars") or 0)
        if free:
            new = bal                       # 沙盒：一分不扣，余额照报
        else:
            if bal < PK_ENTRY:
                return {"ok": False, "error": "星星不够 %d 颗，先去闯关或做题攒一攒" % PK_ENTRY}
            new = pk_add_stars(who, -PK_ENTRY)
            if new is None:
                return {"ok": False, "error": "星星扣不动，检查一下档案文件"}
        code = pk_new_code()
        room = PKRoom(code, who)
        room.factions[side] = faction
        room.factions[1 - side] = "female" if faction == "male" else "male"
        room.free = bool(free)
        room.add(who, side, new)
        if ai:
            # 直接开打：AI 不用等，也没有「等人」那一屏
            room.add_bot(ai)
            room.state = "playing"
            room.t = 0.0
            room.created = time.time()
        PK_ROOMS[code] = room
        if room.bot is not None:
            log("[pk] AI 练功房 %s（%s vs %s），不扣星"
                % (code, who, room.bot["p"]["who"]))
        elif room.free:
            log("[pk] 沙盒房间 %s（%s 建房），不扣星" % (code, who))
        return {"ok": True, "code": code, "side": side, "stars": new,
                "faction": room.factions[side], "factions": list(room.factions),
                "entry": 0 if room.free else PK_ENTRY, "win": PK_WIN_BONUS,
                "free": room.free, "ai": ai,
                "state": room.state}


def pk_join(who, code, free=False):
    who = safe_profile_name(who)
    code = (code or "").strip()
    if not who:
        return {"ok": False, "error": "先在设置里填个学习档案的名字"}
    with PK_LOCK:
        room = PK_ROOMS.get(code)
        if room is None:
            return {"ok": False, "error": "没有这个房间，房间号再看看"}
        if room.state != "waiting":
            return {"ok": False, "error": "这局已经开始了，等下一局"}
        if room.find(who) is not None:
            return {"ok": False, "error": "同一个档案不能自己跟自己打"}
        if len(room.players) >= 2:
            return {"ok": False, "error": "房间满了"}
        d, _ = _pk_load(who)
        if d is None:
            return {"ok": False, "error": "这台设备还没建过档案，先去首页做几道题"}
        bal = int(d.get("sm_stars") or 0)
        # 只要有一边是沙盒，整局就都按沙盒算：不然一边白玩、一边真扣星，
        # 看着像 bug。房主要是已经付过报名费，这一下就退给他。
        sandbox = bool(free) or bool(room.free)
        if sandbox:
            new = bal
            if not room.free:
                room.free = True
                host = room.players[0] if room.players else None
                if host is not None:
                    back = pk_add_stars(host["who"], PK_ENTRY)
                    if back is not None:
                        host["stars"] = back
                log("[pk] 房间 %s 转成沙盒，房主报名费已退" % code)
        else:
            if bal < PK_ENTRY:
                return {"ok": False, "error": "星星不够 %d 颗，先去闯关或做题攒一攒" % PK_ENTRY}
            new = pk_add_stars(who, -PK_ENTRY)
            if new is None:
                return {"ok": False, "error": "星星扣不动，检查一下档案文件"}
        side = 1 - room.players[0]["side"]
        room.add(who, side, new)
        room.state = "playing"
        room.t = 0.0
        room.created = time.time()
        room.bump()
        return {"ok": True, "code": code, "side": side, "stars": new,
                "faction": room.factions[side], "factions": list(room.factions),
                "entry": 0 if room.free else PK_ENTRY, "win": PK_WIN_BONUS,
                "free": room.free}


def pk_cancel(who, code):
    who = safe_profile_name(who)
    with PK_LOCK:
        room = PK_ROOMS.get(code)
        if room is None:
            return {"ok": True, "refunded": 0}
        if room.state != "waiting":
            return {"ok": False, "error": "已经开打了，报名费退不了"}
        p = room.find(who)
        if p is None:
            return {"ok": False, "error": "不在这间房里"}
        if room.free:                   # 沙盒房本来就没扣，别退
            PK_ROOMS.pop(code, None)
            room.bump()
            return {"ok": True, "refunded": 0, "stars": p["stars"], "free": True}
        new = pk_add_stars(who, PK_ENTRY)
        PK_ROOMS.pop(code, None)
        room.bump()
        return {"ok": True, "refunded": PK_ENTRY, "stars": new if new is not None else p["stars"]}


def pk_answer(who, code, seq, ok):
    who = safe_profile_name(who)
    with PK_LOCK:
        room = PK_ROOMS.get(code)
        if room is None or room.state != "playing":
            return {"ok": True, "ignored": 1}
        p = room.find(who)
        if p is None:
            return {"ok": False, "error": "不在这间房里"}
        now = time.time()
        p["seen"] = now
        if seq <= p["seq"]:
            return {"ok": True, "dup": 1, "combo": p["combo"]}
        p["seq"] = seq
        if now - p["last_at"] < 0.25:
            return {"ok": True, "slow": 1, "combo": p["combo"]}
        p["last_at"] = now
        return room.do_answer(p, ok)


def pk_sync(who, code, v, since_ev=0):
    who = safe_profile_name(who)
    deadline = time.time() + 0.22
    with PK_LOCK:
        room = PK_ROOMS.get(code)
        if room is None:
            return {"ok": False, "gone": True, "error": "房间已经关了"}
        p = room.find(who)
        if p is None:
            return {"ok": False, "gone": True, "error": "你被移出房间了"}
        p["seen"] = time.time()
        while room.v <= v:
            left = deadline - time.time()
            if left <= 0:
                break
            room.cond.wait(left)
        return room.snapshot(who, since_ev)


def pk_hint(who, code):
    """扣城堡血换一条提示。血是服务器唯一管着的东西，
    所以「买提示」必须走这里，客户端不能自己改。"""
    who = safe_profile_name(who)
    with PK_LOCK:
        room = PK_ROOMS.get(code)
        if room is None or room.state != "playing":
            return {"ok": False, "error": "这局已经结束了"}
        p = room.find(who)
        if p is None:
            return {"ok": False, "error": "不在这间房里"}
        now = time.time()
        p["seen"] = now
        if now - p.get("last_hint", 0.0) < 0.5:
            return {"ok": False, "error": "手别那么快"}
        side = p["side"]
        # 换题就重新给两次额度
        if p.get("hint_seq") != p["seq"]:
            p["hint_seq"] = p["seq"]
            p["hints"] = 0
        if p["hints"] >= PK_HINT_MAX:
            return {"ok": False, "error": "这道题最多买 %d 次提示" % PK_HINT_MAX}
        if int(room.hp[side]) <= 1:
            return {"ok": False, "error": "城堡就剩一口气了，不能再扣血"}
        cost = min(PK_HINT_COST, int(room.hp[side]) - 1)
        room.hp[side] -= cost
        p["hints"] += 1
        p["last_hint"] = now
        # 看一眼提示，连击就从 0 重新数 —— 不然「先看提示再答」变成了
        # 稳赚不赔的连击机器
        p["combo"] = 0
        room.bump()
        return {"ok": True, "cost": cost, "hints": p["hints"], "max": PK_HINT_MAX,
                "combo": 0,
                "hp": [max(0, int(room.hp[0])), max(0, int(room.hp[1]))]}


def pk_leave(who, code):
    who = safe_profile_name(who)
    with PK_LOCK:
        room = PK_ROOMS.get(code)
        if room is None:
            return {"ok": True}
        p = room.find(who)
        if p is None:
            return {"ok": True}
        if room.state == "waiting":
            new = p["stars"] if room.free else pk_add_stars(who, PK_ENTRY)
            PK_ROOMS.pop(code, None)
            room.bump()
            return {"ok": True, "refunded": 0 if room.free else PK_ENTRY,
                    "stars": new}
        if room.state == "playing":
            room.finish(1 - p["side"], "foe-left")
        return {"ok": True}


def pk_tick():
    """服务器主循环：推进所有对局 + 收尸 + 掉线判负。"""
    while True:
        time.sleep(PK_TICK)
        now = time.time()
        with PK_LOCK:
            for code, room in list(PK_ROOMS.items()):
                try:
                    if room.state == "playing":
                        lose = room.offline_side(now)
                        if lose is not None:
                            room.finish(lose, "offline")
                        room.step(PK_TICK)
                    elif room.state == "waiting":
                        if now - room.created > 600:
                            if not room.free:
                                for p in room.players:
                                    pk_add_stars(p["who"], PK_ENTRY)
                            PK_ROOMS.pop(code, None)
                    elif room.state == "over":
                        if now - room.ended > 180:
                            PK_ROOMS.pop(code, None)
                except Exception as e:
                    log("[pk] 推进 %s 出错: %s" % (code, e))


def start_pk_tick():
    if PK_TICK_ON[0]:
        return
    PK_TICK_ON[0] = True
    threading.Thread(target=pk_tick, daemon=True).start()



# ===================================================================
# 独立版的口径：不接学习软件的星星账本
# -------------------------------------------------------------------
# 原版报名扣 50 星、赢加 75 星，星星存在学习档案里。这里没有上层
# 的闯关系统，扣星只会让人「没星就不能玩」，所以报名费/奖金都归零：
# 打开就能打。档案仍然会自动建一份（名字 -> profiles/<名字>.json），
# 以后想接回星星账本，把下面两个数字改回去即可。
# ===================================================================
PK_ENTRY = 0
PK_WIN_BONUS = 0

_pk_load_raw = _pk_load


def _pk_load(name):
    """档案不存在就顺手建一份，免得第一次进来被「没有档案」挡在门外。"""
    d, p = _pk_load_raw(name)
    if d is None:
        p = profile_path(name)
        if p and not os.path.isfile(p):
            d = {"name": safe_profile_name(name), "sm_stars": 0, "created": time.time()}
            try:
                os.makedirs(PROFILE_DIR, exist_ok=True)
                _pk_save(p, d)
            except Exception as e:
                log("[pk] 建档案失败: %s" % e)
    return d, p


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    # 源码类文件一律不缓存：改了代码刷新就生效，不会新旧文件拼在一起
    NOCACHE = (".html", ".htm", ".js", ".css", ".json", ".webmanifest")
    server_version = "CastleBattle/1.0"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _is_src(self):
        return self.path.split("?")[0].lower().endswith(self.NOCACHE)

    def send_head(self):
        if self._is_src() and "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        return super().send_head()

    def end_headers(self):
        if self._is_src():
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            return
        return super().log_message(fmt, *args)

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, loc):
        self.send_response(302)
        self.send_header("Location", loc)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)

        if u.path.rstrip("/").lower() in ("/pk", "/castle-battle"):
            return self._redirect("/index.html")

        # 长轮询：手里的版本号是旧的就把请求压住最多 220ms，一有新状态立刻回
        if u.path == "/api/pk/sync":
            who = (qs.get("who") or [""])[0]
            code = (qs.get("code") or [""])[0]
            try:
                v = int((qs.get("v") or ["0"])[0])
            except ValueError:
                v = 0
            try:
                e = int((qs.get("e") or ["0"])[0])
            except ValueError:
                e = 0
            return self._json(pk_sync(who, code, v, e))

        if u.path == "/api/profile":
            name = safe_profile_name((qs.get("name") or [""])[0])
            p = profile_path(name)
            if not p:
                return self._json({"ok": False, "error": "名字不合法"}, 200)
            data = None
            if os.path.isfile(p):
                try:
                    with open(p, encoding="utf-8") as f:
                        data = json.load(f)
                except Exception as e:
                    return self._json({"ok": False, "error": "存档读不出来：%s" % e}, 200)
            return self._json({"ok": True, "name": name,
                               "exists": data is not None, "data": data})

        if u.path == "/api/health":
            with PK_LOCK:
                rooms = [{"code": c, "state": r.state, "players": [p["who"] for p in r.players]}
                         for c, r in PK_ROOMS.items()]
            return self._json({"ok": True, "rooms": rooms, "ai": list(PK_AI.keys())})

        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            body = {}

        if u.path == "/api/pk/create":
            return self._json(pk_create(body.get("who"), bool(body.get("free")),
                                        body.get("ai"), body.get("faction"), body.get("deployment")))
        if u.path == "/api/pk/join":
            return self._json(pk_join(body.get("who"), body.get("code"),
                                      bool(body.get("free"))))
        if u.path == "/api/pk/cancel":
            return self._json(pk_cancel(body.get("who"), body.get("code")))
        if u.path == "/api/pk/answer":
            return self._json(pk_answer(body.get("who"), body.get("code"),
                                        int(body.get("seq") or 0), bool(body.get("ok"))))
        if u.path == "/api/pk/hint":
            return self._json(pk_hint(body.get("who"), body.get("code")))
        if u.path == "/api/pk/leave":
            return self._json(pk_leave(body.get("who"), body.get("code")))

        return self._json({"ok": False, "error": "not found"}, 404)


def lan_ips():
    """本机局域网 IPv4，按「像家庭 Wi-Fi」的程度排序。"""
    raw = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.4)
        s.connect(("8.8.8.8", 80))
        raw.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip:
                raw.add(ip)
    except Exception:
        pass

    def rank(ip):
        p = ip.split(".")
        if len(p) != 4:
            return -1
        try:
            a, b = int(p[0]), int(p[1])
        except ValueError:
            return -1
        if a in (127, 0):
            return -1
        if a == 169 and b == 254:
            return -1
        if a == 198 and b in (18, 19):
            return -1
        if a == 100 and 64 <= b <= 127:
            return -1
        if a == 192 and b == 168:
            return 0
        if a == 10:
            return 1
        if a == 172 and 16 <= b <= 31:
            return 2
        return 3

    good = sorted((rank(ip), ip) for ip in raw)
    return [ip for r, ip in good if r >= 0]


def main():
    ap = argparse.ArgumentParser(description="Castle Battle - standalone quiz PK server")
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    os.makedirs(PROFILE_DIR, exist_ok=True)
    start_pk_tick()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True

    url = "http://127.0.0.1:%d/index.html" % args.port
    log("=" * 60)
    log(" Castle Battle is running")
    log(" Local:   %s" % url)
    for ip in lan_ips():
        log(" LAN:     http://%s:%d/index.html   <- open this on the other device" % (ip, args.port))
    log(" Stop:    Ctrl + C")
    log("=" * 60)

    if not args.no_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log("\nBye.")


if __name__ == "__main__":
    main()
