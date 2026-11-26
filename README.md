# 做题攻城 · 城堡 PK（独立版）

拼单词 / 答语法 → 答对出兵 → 攻破对面城堡。原本是「Elaine 学英语」里的
一个模块，这里已经完整拆出来：**本目录自带题库、自带服务器、不读上层任何文件**，
复制走整个 `castle-battle` 文件夹就能单独玩。

仓库地址：<https://github.com/jacwuha-lang/castle-battle>

```bash
git clone https://github.com/jacwuha-lang/castle-battle.git
cd castle-battle
```

## 怎么打开

Windows：双击 `start.bat`（启动脚本与命令行输出都是纯英文，避免编码问题）
macOS / Linux：`./start.sh`

脚本会起一个本地服务并自动打开 <http://127.0.0.1:8788/index.html>。

> 不能直接双击 `index.html`：页面用的是 ES Module + 服务器同步，
> `file://` 打不开，必须走 `start.bat`（一条命令 `python server.py` 也一样）。

需要 Python 3（3.7+，只用标准库，不用装任何包）。

## 两个人联机

1. 两台设备连同一个 Wi-Fi（同一个路由器）。
2. A 设备运行 `start.bat`，命令行里会打印一行 `LAN: http://192.168.x.x:8788/index.html`。
3. B 设备浏览器打开这个局域网地址。
4. A 点「创建房间」拿到 4 位房间号，B 输房间号点「加入」，开局。

不需要外网，也不需要账号。房间在内存里，服务器关掉就清空。

## 一个人也能玩

大厅下方四档 AI：入门 / 普通 / 高手 / 宗师。
AI 走的是和真人完全相同的出兵、连击、城堡升级逻辑，只是它自己按节奏答题。

## 题库

`data/bank.js`，纯数据、可直接改：

- `WORDS`：582 个小学段核心词（`w` 英文 / `m` 中文 / `p` 词性 / `tier` 难度 1–4）
- `GRAMMAR`：105 道语法选择题（`q` 题干 / `o` 四个选项 / `a` 正确项下标 / `tip` 讲解）

加词就照格式往数组里加一行；加语法题同理，`a` 从 0 开始数。
出题逻辑在 `js/pk/questions.js`（约 6 成拼写、4 成语法，不连着出同一题型）。

## 目录

```
castle-battle/
├─ index.html            页面（大厅 / 战场 / 结算）
├─ start.bat / start.sh  一键启动
├─ server.py             独立服务：静态文件 + 房间 + 20Hz 战斗推进
├─ pk_combat_geometry.py 近战距离与站位计算（server.py 用）
├─ data/bank.js          题库
├─ css/                  样式（pk / battle / atmosphere）
├─ js/pk/                客户端：main 流程、net 长轮询、scene 3D、model 建模、sfx 音效
├─ vendor/three.module.min.js
└─ profiles/             按玩家名字自动生成的小档案（可随时删）
```

## 常见问题

**端口被占用**：`python server.py --port 9000`，局域网地址的端口也跟着换。

**另一台设备打不开**：先确认两台在同一个 Wi-Fi；Windows 首次运行会弹防火墙提示，
要允许「专用网络」。公司/酒店 Wi-Fi 常开了「客户端隔离」，设备之间互相访问不了，
这种情况用手机热点最省事。

**想改回扣星模式**：`server.py` 末尾把 `PK_ENTRY` / `PK_WIN_BONUS` 从 0 改回
50 / 75，并让客户端显示余额即可。独立版默认不记账，打开就能一直打。
