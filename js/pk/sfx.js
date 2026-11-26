/* ============================================================
   sfx.js — 擂台打架的声音
   ------------------------------------------------------------
   全部用 WebAudio 现场合成，不加载任何音频文件：
     · 断网、局域网、iPad 离线都能响
     · 不用管版权，也不用等 300KB 的 mp3 下完
   声音都是「噪声 + 几个振荡器」叠出来的，够用就行。

   浏览器要求先有一次用户手势才能出声，所以 init() 挂在
   点「创建房间 / 加入」的时候调用。
   ============================================================ */

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
    this.ready = false;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.noise = this._noiseBuffer();
      this.ready = true;
    } catch (e) {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : 0.5;
    }
    try { localStorage.setItem('sm_pk_mute', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  loadMuted() {
    try { this.muted = localStorage.getItem('sm_pk_mute') === '1'; } catch (e) { this.muted = false; }
    return this.muted;
  }

  _noiseBuffer() {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* 一段噪声，带通/低通扫一下就是「呼——」的风声和撞击的「噗」 */
  _noiseHit(vol, f0, f1, dur, type, q, delay) {
    const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const flt = ctx.createBiquadFilter();
    flt.type = type || 'bandpass';
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    flt.Q.value = q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* 一个音，可以带滑音 —— 金属声、闷响、提示音都靠它 */
  _tone(vol, f0, f1, dur, type, delay) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* k: 事件类型，vol: 0~1（按离镜头的远近算），seed: 让同一招别每次都一模一样 */
  play(k, vol) {
    if (!this.ready || this.muted) return;
    this.resume();
    const v = Math.max(0.12, Math.min(1, vol === undefined ? 1 : vol));
    const r = Math.random();

    if (k === 'swing') {
      this._noiseHit(0.16 * v, 900 + r * 400, 220, 0.15, 'bandpass', 1.6);
    } else if (k === 'leap') {
      /* 跳劈：起跳的风声 + 落地的闷响 */
      this._noiseHit(0.15 * v, 500, 1600, 0.2, 'bandpass', 0.9);
      this._tone(0.16 * v, 150, 80, 0.18, 'sine', 0.12);
    } else if (k === 'hit') {
      /* 铁器相撞：一下脆响 + 一点低频闷声 + 金属余音 */
      this._noiseHit(0.3 * v, 3200, 900, 0.09, 'highpass', 0.8);
      this._tone(0.2 * v, 1180 + r * 160, 520, 0.2, 'square');
      this._tone(0.13 * v, 1760 + r * 220, 900, 0.26, 'triangle');
      this._tone(0.22 * v, 130, 70, 0.16, 'sine');
    } else if (k === 'block') {
      /* 打在盾上：木头闷一点，加一点金属边 */
      this._noiseHit(0.26 * v, 1500, 420, 0.11, 'bandpass', 2.2);
      this._tone(0.16 * v, 760 + r * 90, 480, 0.13, 'triangle');
      this._tone(0.1 * v, 2400, 1700, 0.1, 'sine');
    } else if (k === 'dodge') {
      this._noiseHit(0.15 * v, 2200, 700, 0.17, 'bandpass', 0.9);
      this._tone(0.06 * v, 640, 420, 0.1, 'sine');
    } else if (k === 'smash') {
      /* 砸城门：低频撞 + 木头开裂 */
      this._tone(0.34 * v, 105, 46, 0.28, 'sine');
      this._noiseHit(0.26 * v, 900, 180, 0.2, 'lowpass', 0.7);
      this._noiseHit(0.1 * v, 3000, 1200, 0.06, 'highpass', 0.8);
    } else if (k === 'crumble') {
      /* 城堡塌：一个很低的闷响打底，上面盖一层长噪声，
         再散七八声碎石落地 —— 只用一声「轰」会很假 */
      this._tone(0.4 * v, 86, 32, 0.95, 'sine');
      this._noiseHit(0.34 * v, 720, 90, 0.9, 'lowpass', 0.6);
      this._noiseHit(0.22 * v, 2800, 700, 0.55, 'bandpass', 0.9);
      for (let i = 0; i < 8; i++) {
        this._noiseHit(
          0.1 * v,
          1500 + Math.random() * 1500,
          320 + Math.random() * 200,
          0.1,
          'bandpass',
          1.7,
          0.08 + Math.random() * 1.1,
        );
      }
    } else if (k === 'die') {
      this._tone(0.18 * v, 300 + r * 60, 90, 0.34, 'sawtooth');
      this._noiseHit(0.12 * v, 700, 160, 0.22, 'lowpass', 0.8);
    } else if (k === 'land') {
      /* 被打飞的人摔在地上：一记闷响，没有金属 */
      this._tone(0.14 * v, 120, 60, 0.12, 'sine');
      this._noiseHit(0.1 * v, 900, 260, 0.12, 'lowpass', 0.8);
    } else if (k === 'arrow') {
      /* 箭离弦：一串短促的破空声 */
      for (let i = 0; i < 4; i++) {
        this._noiseHit(0.09 * v, 2600 + Math.random() * 900, 900, 0.12,
          'bandpass', 1.4, i * 0.035);
      }
    } else if (k === 'arrowhit') {
      this._noiseHit(0.16 * v, 1800, 400, 0.08, 'bandpass', 1.6);
      this._tone(0.09 * v, 420, 260, 0.08, 'triangle');
    } else if (k === 'magic') {
      /* 方士放术：一串往上飘的铃音 + 一点空气嘶声，不要鼓点，法术不该有打击感 */
      [1046, 1318, 1568].forEach((f, i) => {
        this._tone(0.07 * v, f, f * 1.12, 0.26, 'sine', i * 0.055);
      });
      this._noiseHit(0.07 * v, 4200, 2600, 0.3, 'bandpass', 2.2);
    } else if (k === 'levelup') {
      /* 城堡升级：往上爬的三连音 */
      [523, 659, 784, 1046].forEach((f, i) => {
        this._tone(0.12 * v, f, f, 0.2, 'triangle', i * 0.075);
      });
    } else if (k === 'heal') {
      [784, 1046].forEach((f, i) => this._tone(0.08 * v, f, f, 0.18, 'sine', i * 0.06));
    } else if (k === 'boss') {
      /* 武将吼一声：低音锯齿 + 一层噪声 */
      this._tone(0.2 * v, 160, 96, 0.5, 'sawtooth');
      this._noiseHit(0.14 * v, 1000, 300, 0.4, 'lowpass', 0.8);
    } else if (k === 'aoe') {
      this._noiseHit(0.26 * v, 2200, 400, 0.28, 'bandpass', 0.8);
      this._tone(0.18 * v, 300, 120, 0.3, 'square');
    } else if (k === 'step') {
      this._noiseHit(0.05 * v, 700, 300, 0.07, 'lowpass', 0.7);
    } else if (k === 'correct') {
      this._tone(0.16, 880, 880, 0.1, 'sine');
      this._tone(0.14, 1320, 1320, 0.16, 'sine', 0.075);
    } else if (k === 'wrong') {
      this._tone(0.16, 300, 190, 0.22, 'square');
    } else if (k === 'hint') {
      this._tone(0.12, 1200, 1200, 0.09, 'sine');
      this._tone(0.1, 1700, 1700, 0.1, 'sine', 0.06);
      this._tone(0.08, 2100, 2100, 0.12, 'sine', 0.12);
    } else if (k === 'win') {
      [523, 659, 784, 1046].forEach((f, i) => this._tone(0.15, f, f, 0.22, 'sine', i * 0.1));
    } else if (k === 'lose') {
      [392, 330, 262].forEach((f, i) => this._tone(0.15, f, f, 0.28, 'triangle', i * 0.13));
    } else if (k === 'ui') {
      this._tone(0.08, 660, 880, 0.06, 'sine');
    }
  }
}

export const sfx = new Sfx();
