/* Maple Match - bot player and the Daily Sap Run generator. Shared by tools/bot.js (node) and the game (browser).
 * Browser: window.MMAI (needs MMRules + MMLevels loaded first). Node: require('./ai.js'). */
(function (root) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./rules.js') : root.MMRules;
  const LV = typeof module !== 'undefined' && module.exports ? require('./levels.js') : root.MMLevels;
  const K = R.K;

  function bucketDepth(s) { let d = 0; for (let i = 0; i < s.p.length; i++) { const q = s.p[i]; if (q && q.k === K.BUCKET) d += (i / s.w) | 0; } return d; }
  function specials(s) { let n = 0; for (const q of s.p) if (q && q.k >= K.ROW && q.k <= K.CONE) n += q.k === K.CONE ? 3 : q.k === K.BURST ? 1.5 : 1; return n; }
  function value(s0, c, ice0) {
    if (c.won) return 1e6 + c.movesLeft;
    let v = 0;
    c.goals.forEach((g, k) => {
      const g0 = s0.goals[k];
      if (g.type === 'score') v += (Math.min(c.score, g.n) - Math.min(s0.score, g.n)) / g.n * 1000;
      else if (g.type === 'frost') v += (R.iceLayers(s0) - R.iceLayers(c)) / Math.max(1, ice0) * 1000;
      else if (g.type === 'bucket') v += (g.got - g0.got) / g.n * 1000 + (bucketDepth(c) - bucketDepth(s0)) * 25;
      else v += (Math.min(g.got, g.n) - Math.min(g0.got, g.n)) / g.n * 1000;
    });
    v += (c.score - s0.score) / 80;
    v += (specials(c) - specials(s0)) * 30;
    return v;
  }
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** Play one game. style 'smart' or 'casual'. rnd: optional seeded random function. */
  function playGame(lv, seed, style, rnd) {
    rnd = rnd || Math.random;
    const s = R.newGame(lv, seed);
    const ice0 = R.iceLayers(s) || 1;
    let rollSeed = seed * 977 + 13;
    while (!s.won && !s.lost) {
      const moves = R.listMoves(s);
      if (!moves.length) break;
      const scored = moves.map(m => {
        const c = R.clone(s); c.rs = (rollSeed = (rollSeed * 1103515245 + 12345) | 0);
        R.trySwap(c, m[0], m[1]);
        return { m, v: value(s, c, ice0) + rnd() * 0.5 };
      }).sort((a, b) => b.v - a.v);
      let pick = scored[0];
      if (style === 'casual') {
        const r = rnd();
        if (r > 0.75) pick = scored[(rnd() * scored.length) | 0];
        else if (r > 0.5) pick = scored[(rnd() * Math.min(3, scored.length)) | 0];
      }
      const res = R.trySwap(s, pick.m[0], pick.m[1]);
      if (!res.ok) throw new Error('bot move rejected');
    }
    let score = s.score;
    if (s.won) { R.sugarRush(s); score = s.score; }
    return { won: s.won, score, used: s.movesUsed, progress: R.goalProgress(s) };
  }

  // ---------------------------------------------------------------- Daily Sap Run
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seasonFor(month) { return [0, 1, 2, 11].includes(month) ? 'march' : [3, 4].includes(month) ? 'mud' : [5, 6, 7].includes(month) ? 'summer' : 'october'; }
  const DAILY_NAMES = ['Back Forty', 'Sugar Road', 'Covered Lane', 'Kettle Pond', 'Cider Hill', 'Spile Row', 'Birch Hollow', 'Notch Road', 'Creemee Corner', 'Ridge Run', 'Mill Brook', 'Sap House'];

  /** The day's level (deterministic from the date key "YYYY-MM-DD"), before its move count is tuned. */
  function dailyCandidate(key) {
    const rnd = mulberry(hash('maple-match:' + key));
    const pick = a => a[(rnd() * a.length) | 0];
    const month = +key.slice(5, 7) - 1;
    // board shape from one of the hand-made levels (11-40), cleaned of frost and buckets
    const base = LV.LEVELS[10 + ((rnd() * 30) | 0)];
    let layout = base.layout.map(r => r.replace(/[12B]/g, '.'));
    const types = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, rnd() < 0.2 ? 6 : 5).sort();
    const kind = pick(['collect', 'collect', 'frost', 'bucket', 'mix']);
    const level = { id: 'daily', daily: key, name: DAILY_NAMES[hash(key) % DAILY_NAMES.length], season: seasonFor(month), types, moves: 18, goals: [] };
    const cellsAt = f => { const out = []; layout.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.' && f(x, y)) out.push([x, y]); })); return out; };
    const setCh = (x, y, ch) => { layout[y] = layout[y].slice(0, x) + ch + layout[y].slice(x + 1); };
    if (kind === 'collect' || kind === 'mix') {
      const a = pick(types), b = pick(types.filter(t => t !== a));
      level.goals.push({ type: 'collect', t: a, n: 26 + ((rnd() * 10) | 0) });
      if (kind === 'collect') level.goals.push({ type: 'collect', t: b, n: 26 + ((rnd() * 10) | 0) });
    }
    if (kind === 'frost' || kind === 'mix') {
      const h = layout.length, n = kind === 'frost' ? 14 + ((rnd() * 8) | 0) : 8;
      const cand = cellsAt((x, y) => y >= Math.floor(h / 3)).sort(() => rnd() - 0.5).slice(0, n);
      cand.forEach(([x, y], k) => setCh(x, y, k % 3 === 0 ? '2' : '1'));
      level.goals.push({ type: 'frost' });
    }
    if (kind === 'bucket') {
      const top = cellsAt((x, y) => y === 0).sort(() => rnd() - 0.5).slice(0, 2);
      top.forEach(([x, y]) => setCh(x, y, 'B'));
      level.buckets = { total: 3, max: 2, gap: 2 };
      level.goals.push({ type: 'bucket' });
    }
    level.layout = layout;
    level.moves = dailyMoves(level);
    return level;
  }
  /** Move budget from the goal size (calibrated offline with tools/daily-check.js, no bot needed on the phone). */
  function dailyMoves(level) {
    let m = 0;
    for (const g of level.goals) {
      if (g.type === 'collect') m += g.n * DAILY_K.collect;
      if (g.type === 'frost') { let layers = 0; level.layout.forEach(r => { for (const ch of r) if (ch === '1') layers += 1; else if (ch === '2') layers += 2; }); m += DAILY_K.frostBase + layers * DAILY_K.frost; }
      if (g.type === 'bucket') m += DAILY_K.bucket;
    }
    if (level.types.length === 6) m *= DAILY_K.six;
    return Math.max(16, Math.round(m));
  }
  const DAILY_K = { collect: 0.35, frostBase: 9, frost: 0.5, bucket: 20, six: 1.45 };
  function pct(a, p) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; }
  /** Tune the move count so the smart bot wins at least ~70% of the time, then set star scores. */
  function tuneDaily(level, games) {
    games = games || 10;
    const rnd = mulberry(hash(String(level.daily)) ^ 99);
    let scores = [];
    for (let tries = 0; tries < 8; tries++) {
      let wins = 0; scores = [];
      for (let g = 0; g < games; g++) { const r = playGame(level, 7000 + g * 31, 'smart', rnd); if (r.won) { wins++; scores.push(r.score); } }
      if (wins / games >= 0.7 || level.moves >= 34) break;
      level.moves += 2;
    }
    const rnd100 = v => Math.round(v / 100) * 100;
    const s2 = rnd100(pct(scores, 0.25)) || 5000, s3 = Math.max(rnd100(pct(scores, 0.65)), s2 + 1000);
    level.stars = [0, s2, s3];
    return level;
  }
  function makeDaily(key, games) { return tuneDaily(dailyCandidate(key), games); }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  const api = { playGame, value, makeDaily, dailyCandidate, tuneDaily, dateKey, mulberry, hash, DAILY_K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMAI = api;
})(typeof self !== 'undefined' ? self : this);
