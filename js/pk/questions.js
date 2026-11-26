/* ============================================================
   questions.js — 独立版题库（单词拼写 + 语法选择）
   ------------------------------------------------------------
   题源就在 ../../data/bank.js（本项目自带，不依赖上层任何文件）：
     · 拼写：582 个小学段核心词，给中文，让孩子拼英文
     · 语法：105 道选择题，覆盖 be 动词 / 三单 / 时态 / 名词复数 /
             冠词 / 介词 / 代词 / 疑问词 / there be / 比较级 …
   出题节奏：约 6 成拼写、4 成语法，同一个东西不连着出两次。
   ============================================================ */

import { WORDS, GRAMMAR } from '../../data/bank.js';

/* 低年级词多给一点，孩子答得动，连击才攒得起来 */
const EASY_SHARE = 0.68;
const MAX_RECENT = 36;

function clean(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

export class QuestionBank {
  constructor() {
    this.words = [];
    this.easy = [];
    this.gramPool = [];
    this.recent = [];
    this.lastKind = '';

    for (let i = 0; i < WORDS.length; i++) {
      const w = WORDS[i];
      if (!w || !w.w || !w.m) continue;
      const en = clean(w.w).toLowerCase();
      /* 键盘上没有撇号和连字符，只出纯字母；太短没意思、太长按不过来 */
      if (!/^[a-z]{3,11}$/.test(en)) continue;
      const item = { en: en, cn: clean(w.m), pos: clean(w.p || ''), tier: w.tier || 1 };
      this.words.push(item);
      if (item.tier <= 2) this.easy.push(item);
    }

    for (let i = 0; i < GRAMMAR.length; i++) {
      const g = GRAMMAR[i];
      if (!g || !g.q || !g.o || g.o.length < 2) continue;
      if (!(g.a >= 0) || g.a >= g.o.length) continue;
      this.gramPool.push({
        fp: 'g:' + i,
        q: clean(g.q),
        o: g.o.map(clean),
        a: g.a,
        tip: clean(g.tip || ''),
        mid: clean(g.mid || 'mix'),
      });
    }
  }

  get wordCount() { return this.words.length; }
  get grammarCount() { return this.gramPool.length; }

  pickWord() {
    if (!this.words.length) return null;
    const pool = (this.easy.length && Math.random() < EASY_SHARE) ? this.easy : this.words;
    for (let tries = 0; tries < 40; tries++) {
      const w = pool[Math.floor(Math.random() * pool.length)];
      if (this.recent.indexOf('w:' + w.en) >= 0) continue;
      return w;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  pickGrammar() {
    if (!this.gramPool.length) return null;
    const fresh = this.gramPool.filter((x) => this.recent.indexOf(x.fp) < 0);
    const pool = fresh.length ? fresh : this.gramPool;
    const q = pool[Math.floor(Math.random() * pool.length)];
    this.recent.push(q.fp);
    return { fp: q.fp, q: q.q, o: q.o.slice(), a: q.a, tip: q.tip, mid: q.mid };
  }

  next() {
    /* 不连着出同一种题型，孩子不至于一直敲键盘 */
    const wantWord = this.lastKind === 'gram' ? true
      : this.lastKind === 'word' ? false
        : Math.random() < 0.6;

    if (wantWord) {
      const w = this.pickWord();
      if (w) {
        this.lastKind = 'word';
        this.recent.push('w:' + w.en);
        this.trim();
        return { kind: 'word', cn: w.cn, pos: w.pos, answer: w.en };
      }
    }

    const g = this.pickGrammar();
    if (g) {
      this.lastKind = 'gram';
      this.trim();
      return { kind: 'gram', prompt: g.q, options: g.o, answer: g.a, tip: g.tip, mid: g.mid };
    }

    /* 题库文件缺失时也留一道兜底题，别让页面哑火 */
    this.lastKind = 'gram';
    return {
      kind: 'gram',
      prompt: 'He ___ football every day.',
      options: ['play', 'plays', 'playing', 'played'],
      answer: 1,
      tip: '主语 he 是三单，动词加 s。',
      mid: 'mix',
    };
  }

  trim() {
    while (this.recent.length > MAX_RECENT) this.recent.shift();
  }
}
