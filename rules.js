/* Maple Match - pure rules engine (no DOM). Browser: window.MMRules. Node: require('./rules.js').
 *
 * Board: w x h cells, some are holes. Each cell holds a piece or null.
 * piece = { id, t, k, ice }
 *   t   colour/type 0..5 (creemee, cider donut, maple leaf, syrup jug, apple, pinecone); -1 cone, -2 sap bucket
 *   k   kind: 0 normal, 1 row clearer, 2 column clearer, 3 sap burst, 4 twist cone, 5 sap bucket
 *   ice frost layers (0, 1 or 2). Frozen pieces can't be swapped; a hit cracks one layer and the piece survives.
 * Gravity works per column and skips over holes. Sap buckets fall like pieces and leave at the column bottom.
 *
 * Every player move returns a list of steps that the game animates in order:
 *   { c: cascade#, matches, removed, blasts, ice, created, falls, spawns, collected, score, combo }
 */
(function (root) {
  'use strict';
  const K = { N: 0, ROW: 1, COL: 2, BURST: 3, CONE: 4, BUCKET: 5 };
  const NAMES = ['creemee', 'cider donut', 'maple leaf', 'syrup jug', 'apple', 'pinecone'];
  const CREATE_BONUS = [0, 120, 120, 200, 400];

  // ---------------------------------------------------------------- rng (state lives in s.rs so clones copy it)
  function rand(s) {
    let a = (s.rs = (s.rs + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (s, n) => Math.floor(rand(s) * n);

  // ---------------------------------------------------------------- helpers
  const isSpecial = k => k >= K.ROW && k <= K.CONE;
  const isLine = k => k === K.ROW || k === K.COL;
  const matchable = q => q && q.k <= K.BURST;
  function newPiece(s, t, k, ice) { return { id: s.nextId++, t, k: k || 0, ice: ice || 0 }; }
  function copyP(q) { return { id: q.id, t: q.t, k: q.k, ice: q.ice }; }
  function nbrs(s, i) {
    const x = i % s.w, y = (i / s.w) | 0, r = [];
    if (x > 0 && !s.hole[i - 1]) r.push(i - 1);
    if (x < s.w - 1 && !s.hole[i + 1]) r.push(i + 1);
    if (y > 0 && !s.hole[i - s.w]) r.push(i - s.w);
    if (y < s.h - 1 && !s.hole[i + s.w]) r.push(i + s.w);
    return r;
  }
  function adjacent(s, a, b) {
    if (a < 0 || b < 0 || a >= s.w * s.h || b >= s.w * s.h || s.hole[a] || s.hole[b]) return false;
    const ax = a % s.w, ay = (a / s.w) | 0, bx = b % s.w, by = (b / s.w) | 0;
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }

  // ---------------------------------------------------------------- setup
  /**
   * level.layout: array of strings, one per row. '.' cell, ' ' hole, '1'/'2' frozen piece, 'B' sap bucket.
   * level.types: piece types used. level.moves. level.goals: [{type:'score',n}|{type:'collect',t,n}|{type:'frost'}|{type:'bucket',n}]
   * level.buckets: { total, max, gap } for bucket levels.
   */
  function newGame(level, seed) {
    const rows = level.layout, h = rows.length, w = Math.max(...rows.map(r => r.length));
    const s = {
      w, h, hole: new Array(w * h).fill(1), p: new Array(w * h).fill(null), nextId: 1, rs: (seed | 0) || 1,
      types: (level.types || [0, 1, 2, 3, 4]).slice(), moves: level.moves, movesLeft: level.moves, movesUsed: 0,
      score: 0, bestCascade: 0, won: false, lost: false, cols: [], bottom: [], bucket: null,
      goals: level.goals.map(g => ({ type: g.type, t: g.t === undefined ? -1 : g.t, n: g.n || 0, got: 0 })),
    };
    const iceAt = {}, bucketAt = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x] || ' ', i = y * w + x;
      if (ch === ' ' || ch === '#') continue;
      s.hole[i] = 0;
      if (ch === '1' || ch === '2') iceAt[i] = +ch;
      if (ch === 'B') bucketAt.push(i);
    }
    for (let x = 0; x < w; x++) {
      const col = [];
      for (let y = 0; y < h; y++) if (!s.hole[y * w + x]) col.push(y * w + x);
      s.cols.push(col); s.bottom.push(col.length ? col[col.length - 1] : -1);
    }
    if (level.buckets) s.bucket = { total: level.buckets.total, max: level.buckets.max || 1, gap: level.buckets.gap || 2, spawned: 0, collected: 0, since: 0 };
    const frost = s.goals.find(g => g.type === 'frost');
    if (frost && !frost.n) frost.n = Object.keys(iceAt).length;
    const bk = s.goals.find(g => g.type === 'bucket');
    if (bk && s.bucket && !bk.n) bk.n = s.bucket.total;
    for (let tries = 0; tries < 200; tries++) {
      s.p.fill(null);
      for (const i of bucketAt) { s.p[i] = newPiece(s, -2, K.BUCKET); }
      if (s.bucket) s.bucket.spawned = bucketAt.length;
      for (let i = 0; i < w * h; i++) {
        if (s.hole[i] || s.p[i]) continue;
        s.p[i] = newPiece(s, pickSafeType(s, i), 0, iceAt[i] || 0);
      }
      if (!findGroups(s).length && listMoves(s).length) break;
    }
    return s;
  }
  function typeAt(s, i) { const q = s.p[i]; return matchable(q) ? q.t : -9; }
  /** A type that does not complete a run of 3 with the two cells to the left or above. */
  function pickSafeType(s, i) {
    const x = i % s.w, y = (i / s.w) | 0, bad = new Set();
    if (x >= 2 && typeAt(s, i - 1) === typeAt(s, i - 2) && typeAt(s, i - 1) >= 0) bad.add(typeAt(s, i - 1));
    if (y >= 2 && typeAt(s, i - s.w) === typeAt(s, i - 2 * s.w) && typeAt(s, i - s.w) >= 0) bad.add(typeAt(s, i - s.w));
    const ok = s.types.filter(t => !bad.has(t));
    const list = ok.length ? ok : s.types;
    return list[ri(s, list.length)];
  }

  // ---------------------------------------------------------------- matching
  function findGroups(s) {
    const { w, h } = s, runs = [];
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const t = typeAt(s, y * w + x);
        if (t < 0) { x++; continue; }
        let e = x;
        while (e + 1 < w && typeAt(s, y * w + e + 1) === t) e++;
        if (e - x >= 2) { const cells = []; for (let k = x; k <= e; k++) cells.push(y * w + k); runs.push({ d: 'h', t, cells }); }
        x = e + 1;
      }
    }
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        const t = typeAt(s, y * w + x);
        if (t < 0) { y++; continue; }
        let e = y;
        while (e + 1 < h && typeAt(s, (e + 1) * w + x) === t) e++;
        if (e - y >= 2) { const cells = []; for (let k = y; k <= e; k++) cells.push(k * w + x); runs.push({ d: 'v', t, cells }); }
        y = e + 1;
      }
    }
    if (!runs.length) return [];
    // union runs that share a cell into shape groups
    const groups = [], owner = new Map();
    for (const r of runs) {
      const hit = new Set();
      for (const c of r.cells) if (owner.has(c)) hit.add(owner.get(c));
      let g;
      if (!hit.size) { g = { t: r.t, runs: [], set: new Set() }; groups.push(g); }
      else {
        const list = [...hit]; g = list[0];
        for (let j = 1; j < list.length; j++) { const o = list[j]; for (const rr of o.runs) g.runs.push(rr); for (const c of o.set) { g.set.add(c); owner.set(c, g); } groups.splice(groups.indexOf(o), 1); }
      }
      g.runs.push(r);
      for (const c of r.cells) { g.set.add(c); owner.set(c, g); }
    }
    for (const g of groups) {
      g.cells = [...g.set];
      g.maxLen = Math.max(...g.runs.map(r => r.cells.length));
      g.hasH = g.runs.some(r => r.d === 'h'); g.hasV = g.runs.some(r => r.d === 'v');
      g.kind = g.maxLen >= 5 ? K.CONE : (g.hasH && g.hasV) ? K.BURST : g.maxLen === 4 ? K.ROW : 0;
    }
    return groups;
  }
  /** Does the piece at i sit in a run of 3+? */
  function matchAt(s, i) {
    const t = typeAt(s, i); if (t < 0) return false;
    const x = i % s.w, y = (i / s.w) | 0;
    let n = 1;
    for (let k = x - 1; k >= 0 && typeAt(s, y * s.w + k) === t; k--) n++;
    for (let k = x + 1; k < s.w && typeAt(s, y * s.w + k) === t; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let k = y - 1; k >= 0 && typeAt(s, k * s.w + x) === t; k--) n++;
    for (let k = y + 1; k < s.h && typeAt(s, k * s.w + x) === t; k++) n++;
    return n >= 3;
  }
  function canSwap(s, a, b) {
    if (!adjacent(s, a, b)) return false;
    const pa = s.p[a], pb = s.p[b];
    if (!pa || !pb || pa.ice || pb.ice) return false;
    if (pa.k === K.CONE || pb.k === K.CONE) return pa.k !== K.BUCKET && pb.k !== K.BUCKET;
    if (isSpecial(pa.k) && isSpecial(pb.k)) return true;
    if (isSink(s, a, b)) return true;
    s.p[a] = pb; s.p[b] = pa;
    const ok = matchAt(s, a) || matchAt(s, b);
    s.p[a] = pa; s.p[b] = pb;
    return ok;
  }
  /** A sap bucket can always be swapped one cell down, even without a match. */
  function isSink(s, a, b) {
    const pa = s.p[a], pb = s.p[b];
    return (pa.k === K.BUCKET && b === a + s.w && pb.k !== K.BUCKET) || (pb.k === K.BUCKET && a === b + s.w && pa.k !== K.BUCKET);
  }
  function listMoves(s) {
    const res = [];
    for (let i = 0; i < s.w * s.h; i++) {
      if (s.hole[i]) continue;
      const x = i % s.w;
      if (x < s.w - 1 && canSwap(s, i, i + 1)) res.push([i, i + 1]);
      if (i + s.w < s.w * s.h && canSwap(s, i, i + s.w)) res.push([i, i + s.w]);
    }
    return res;
  }

  // ---------------------------------------------------------------- goals
  function onRemoved(s, q) {
    for (const g of s.goals) if (g.type === 'collect' && q.t === g.t) g.got++;
  }
  function onIceFreed(s) { for (const g of s.goals) if (g.type === 'frost') g.got++; }
  function goalsMet(s) { return s.goals.every(g => (g.type === 'score' ? s.score >= g.n : g.got >= g.n)); }
  function goalProgress(s) { // 0..1 average, used by the bot and the HUD
    let sum = 0;
    for (const g of s.goals) sum += Math.min(1, (g.type === 'score' ? s.score : g.got) / Math.max(1, g.n));
    return sum / s.goals.length;
  }

  // ---------------------------------------------------------------- blasts
  function cellsWhere(s, f) { const r = []; for (let i = 0; i < s.w * s.h; i++) if (!s.hole[i] && f(i)) r.push(i); return r; }
  function rowCells(s, y) { return cellsWhere(s, i => ((i / s.w) | 0) === y); }
  function colCells(s, x) { return cellsWhere(s, i => i % s.w === x); }
  function areaCells(s, i, big) {
    const cx = i % s.w, cy = (i / s.w) | 0;
    return cellsWhere(s, j => {
      const dx = Math.abs(j % s.w - cx), dy = Math.abs(((j / s.w) | 0) - cy);
      if (j === i) return false;
      return big ? (dx <= 3 && dy <= 3 && dx + dy <= 4) : dx + dy <= 2;
    });
  }
  function commonType(s) {
    const n = {};
    for (const q of s.p) if (q && q.k === K.N) n[q.t] = (n[q.t] || 0) + 1;
    let best = s.types[0], bn = -1;
    for (const t of s.types) if ((n[t] || 0) > bn) { bn = n[t] || 0; best = t; }
    return best;
  }
  function blastCells(s, q, i) {
    const x = i % s.w, y = (i / s.w) | 0;
    if (q.k === K.ROW) return rowCells(s, y).filter(j => j !== i);
    if (q.k === K.COL) return colCells(s, x).filter(j => j !== i);
    if (q.k === K.BURST) return areaCells(s, i, false);
    if (q.k === K.CONE) { const t = commonType(s); return cellsWhere(s, j => s.p[j] && s.p[j].t === t && matchable(s.p[j])); }
    return [];
  }

  // ---------------------------------------------------------------- resolve: matches, blasts, gravity, cascades
  function newStep(c) { return { c, matches: [], removed: [], blasts: [], ice: [], created: [], falls: [], spawns: [], collected: [], score: 0, combo: null }; }

  function pickCell(s, g, pref) {
    const ok = i => { const q = s.p[i]; return q && q.k === K.N && !q.ice; };
    if (pref) for (const i of pref) if (g.set.has(i) && ok(i)) return i;
    if (g.kind === K.BURST) {
      const h = new Set(); for (const r of g.runs) if (r.d === 'h') r.cells.forEach(c => h.add(c));
      for (const r of g.runs) if (r.d === 'v') for (const c of r.cells) if (h.has(c) && ok(c)) return c;
    }
    const run = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const mid = run.cells[(run.cells.length - 1) >> 1];
    if (ok(mid)) return mid;
    for (const c of run.cells) if (ok(c)) return c;
    for (const c of g.cells) if (ok(c)) return c;
    return -1;
  }

  /**
   * opts.pref: cells to prefer for new specials (the swapped cells), opts.axis 'h'|'v' (swipe direction)
   * opts.seed: { queue:[{i,by,o}], consumed:[i], blasts:[...], combo } fires a special combo as the first step
   */
  function resolve(s, opts) {
    opts = opts || {};
    const steps = [];
    let cascade = opts.cascade0 || 0, seed = opts.seed || null, pref = opts.pref || null;
    for (let guard = 0; guard < 120; guard++) {
      const groups = seed ? [] : findGroups(s);
      if (!groups.length && !seed) break;
      cascade++;
      const st = newStep(cascade);
      const mult = Math.min(cascade, 8);
      const queue = [], done = new Set(), iceHit = new Set(), protect = new Set(), creations = [];
      const hitIce = (q, i) => {
        if (iceHit.has(q.id)) return;
        iceHit.add(q.id); q.ice--; st.ice.push({ id: q.id, i, ice: q.ice }); st.score += 40;
        if (!q.ice) onIceFreed(s);
      };
      if (seed) {
        st.combo = seed.combo || null; st.center = seed.center;
        for (const i of seed.consumed || []) {
          const q = s.p[i]; if (!q) continue;
          st.removed.push({ id: q.id, i, t: q.t, k: q.k, by: 'combo', o: 0 });
          onRemoved(s, q); s.p[i] = null; done.add(i); st.score += 20 * mult;
        }
        for (const b of seed.blasts || []) st.blasts.push(b);
        for (const it of seed.queue) queue.push(it);
      }
      for (const g of groups) {
        let ci = -1, kind = g.kind;
        if (kind) {
          ci = pickCell(s, g, pref);
          if (kind === K.ROW) kind = (pref && g.set.has(pref[0]) || pref && g.set.has(pref[1])) ? (opts.axis === 'v' ? K.COL : K.ROW) : (g.runs.some(r => r.d === 'v' && r.cells.length >= 4) ? K.COL : K.ROW);
        }
        st.matches.push({ t: g.t, cells: g.cells, k: ci >= 0 ? kind : 0, at: ci, size: g.cells.length });
        st.score += g.cells.length >= 5 ? 150 : g.cells.length === 4 ? 60 : 0;
        if (ci >= 0) {
          protect.add(ci); creations.push({ i: ci, k: kind, t: g.t });
          const q = s.p[ci];
          st.removed.push({ id: q.id, i: ci, t: q.t, k: q.k, by: 'merge', o: 0 });
          onRemoved(s, q); s.p[ci] = null; done.add(ci); st.score += 20 * mult;
        }
        for (const i of g.cells) if (i !== ci) queue.push({ i, by: 'match', o: 0 });
        for (const i of g.cells) for (const j of nbrs(s, i)) {
          if (g.set.has(j)) continue;
          const q = s.p[j]; if (q && q.ice) hitIce(q, j);
        }
      }
      for (let qi = 0; qi < queue.length; qi++) {
        const { i, by, o } = queue[qi];
        if (done.has(i) || protect.has(i)) continue;
        const q = s.p[i];
        if (!q || q.k === K.BUCKET) continue;
        if (q.ice) { hitIce(q, i); continue; }
        done.add(i);
        st.removed.push({ id: q.id, i, t: q.t, k: q.k, by, o });
        onRemoved(s, q); st.score += (by === 'match' ? 20 : seed ? 45 : 30) * mult;
        s.p[i] = null;
        if (isSpecial(q.k)) {
          const cells = blastCells(s, q, i);
          st.blasts.push({ k: q.k, i, t: q.k === K.CONE && cells.length ? s.p[cells[0]].t : q.t, cells, o: o + 1 });
          for (const j of cells) queue.push({ i: j, by: 'blast', o: o + 1 });
        }
      }
      for (const c of creations) {
        const np = newPiece(s, c.k === K.CONE ? -1 : c.t, c.k);
        s.p[c.i] = np; st.created.push({ i: c.i, piece: copyP(np) });
        st.score += CREATE_BONUS[c.k];
      }
      gravity(s, st);
      if (s.mult > 1) st.score = Math.round(st.score * s.mult);
      s.score += st.score;
      if (cascade > s.bestCascade) s.bestCascade = cascade;
      steps.push(st);
      seed = null; pref = null;
    }
    return steps;
  }

  function bucketsOnBoard(s) { let n = 0; for (const q of s.p) if (q && q.k === K.BUCKET) n++; return n; }
  function wantBucket(s) {
    const b = s.bucket;
    return b && b.spawned < b.total && b.since >= b.gap && bucketsOnBoard(s) < b.max;
  }
  function gravity(s, st) {
    const fallMap = {}, spawnMap = {};
    for (const f of st.falls) fallMap[f.id] = f;
    for (let pass = 0; pass < 12; pass++) {
      const empty = [];
      for (let x = 0; x < s.w; x++) {
        const col = s.cols[x];
        let wr = col.length - 1;
        for (let r = col.length - 1; r >= 0; r--) {
          const i = col[r], q = s.p[i];
          if (!q) continue;
          if (r !== wr) {
            const to = col[wr];
            s.p[to] = q; s.p[i] = null;
            if (spawnMap[q.id]) spawnMap[q.id].to = to;
            else if (fallMap[q.id]) fallMap[q.id].to = to;
            else { const f = { id: q.id, from: i, to }; fallMap[q.id] = f; st.falls.push(f); }
          }
          wr--;
        }
        empty.push(wr + 1);
      }
      // refill from above; maybe one sap bucket per pass
      let bucketCol = -1;
      if (wantBucket(s)) {
        const cand = []; for (let x = 0; x < s.w; x++) if (empty[x] > 0 && s.cols[x].length > 1) cand.push(x);
        if (cand.length) bucketCol = cand[ri(s, cand.length)];
      }
      for (let x = 0; x < s.w; x++) {
        const n = empty[x];
        for (let r = n - 1; r >= 0; r--) {
          const i = s.cols[x][r];
          let q;
          if (x === bucketCol && r === 0) { q = newPiece(s, -2, K.BUCKET); s.bucket.spawned++; s.bucket.since = 0; }
          else q = newPiece(s, s.types[ri(s, s.types.length)], 0);
          s.p[i] = q;
          const sp = { id: q.id, piece: copyP(q), to: i, off: n - r };
          spawnMap[q.id] = sp; st.spawns.push(sp);
        }
      }
      // buckets that reached the bottom leave the board
      let any = false;
      for (let x = 0; x < s.w; x++) {
        const bi = s.bottom[x];
        if (bi < 0) continue;
        const q = s.p[bi];
        if (q && q.k === K.BUCKET) {
          s.p[bi] = null; s.bucket.collected++; any = true;
          for (const g of s.goals) if (g.type === 'bucket') g.got++;
          st.collected.push({ id: q.id, i: bi }); st.score += 500;
        }
      }
      if (!any) break;
    }
  }

  // ---------------------------------------------------------------- player move
  const COMBO_NAMES = {
    lineline: 'Crossroads!', lineburst: 'Big Dig!', burstburst: 'Frost Heave!',
    conecone: 'Double Twist!', coneline: 'Sap Lines!', coneburst: 'Leaf Storm!', cone: 'Twist!',
  };
  function specialCombo(s, a, b) {
    const pa = s.p[a], pb = s.p[b];
    const x = b % s.w, y = (b / s.w) | 0;
    const kinds = [pa.k, pb.k].map(k => (isLine(k) ? 'line' : 'burst')).sort().join('');
    const blasts = []; let cells = [];
    const addB = (k, c) => { blasts.push({ k, i: b, cells: c, o: 0, t: pb.t }); cells = cells.concat(c); };
    if (kinds === 'lineline') { addB(K.ROW, rowCells(s, y)); addB(K.COL, colCells(s, x)); }
    else if (kinds === 'burstline') {
      for (let d = -1; d <= 1; d++) {
        if (y + d >= 0 && y + d < s.h) addB(K.ROW, rowCells(s, y + d));
        if (x + d >= 0 && x + d < s.w) addB(K.COL, colCells(s, x + d));
      }
    } else { addB(K.BURST, areaCells(s, b, true)); blasts[0].big = true; }
    const name = kinds === 'burstline' ? 'lineburst' : kinds;
    return resolve(s, { seed: { consumed: [a, b], blasts, queue: cells.map(i => ({ i, by: 'blast', o: 1 })), combo: COMBO_NAMES[name], center: b } });
  }
  function coneCombo(s, a, b) {
    const c = s.p[a].k === K.CONE ? a : b, o = c === a ? b : a;
    const other = s.p[o];
    if (other.k === K.CONE) {
      const cells = cellsWhere(s, i => i !== a && i !== b);
      return resolve(s, { seed: { consumed: [a, b], blasts: [{ k: K.CONE, i: b, cells, o: 0, t: -1, all: true }], queue: cells.map(i => ({ i, by: 'cone', o: 1 })), combo: COMBO_NAMES.conecone, center: b } });
    }
    const t = other.t;
    if (other.k === K.N) {
      const cells = cellsWhere(s, i => matchable(s.p[i]) && s.p[i].t === t);
      return resolve(s, { seed: { consumed: [c], blasts: [{ k: K.CONE, i: c, cells, o: 0, t }], queue: cells.map(i => ({ i, by: 'cone', o: 1 })), combo: cells.length >= 10 ? COMBO_NAMES.cone : null, center: c } });
    }
    // cone + line / burst: every piece of that type becomes that special, then they all go off
    const st0 = newStep(0); st0.transform = true;
    const targets = cellsWhere(s, i => i !== o && matchable(s.p[i]) && s.p[i].t === t);
    for (const i of targets) {
      const q = s.p[i];
      if (q.k === K.N && !q.ice) { q.k = other.k === K.BURST ? K.BURST : (rand(s) < 0.5 ? K.ROW : K.COL); st0.created.push({ i, piece: copyP(q), morph: true }); }
    }
    st0.combo = other.k === K.BURST ? COMBO_NAMES.coneburst : COMBO_NAMES.coneline; st0.center = c;
    st0.blasts.push({ k: K.CONE, i: c, cells: targets, o: 0, t, beam: true });
    const rest = resolve(s, { seed: { consumed: [c], blasts: [], queue: [o].concat(targets).map(i => ({ i, by: 'cone', o: 1 })), combo: null, center: c } });
    return [st0].concat(rest);
  }

  /** Try a player swap of cells a and b. Returns { ok, steps, shuffle } and mutates s when ok. */
  function trySwap(s, a, b, opts) {
    if (s.won || s.lost) return { ok: false, why: 'over' };
    if (!adjacent(s, a, b)) return { ok: false, why: 'far' };
    const pa = s.p[a], pb = s.p[b];
    if (!pa || !pb) return { ok: false, why: 'empty' };
    if (pa.ice || pb.ice) return { ok: false, why: 'frozen' };
    if ((pa.k === K.CONE || pb.k === K.CONE) && (pa.k === K.BUCKET || pb.k === K.BUCKET)) return { ok: false, why: 'nomatch' };
    const axis = Math.abs(a - b) === 1 ? 'h' : 'v';
    s.p[a] = pb; s.p[b] = pa; // pa (the dragged piece) now sits at b
    let steps;
    if (pa.k === K.CONE || pb.k === K.CONE) steps = coneCombo(s, a, b);
    else if (isSpecial(pa.k) && isSpecial(pb.k)) steps = specialCombo(s, a, b);
    else {
      const matched = matchAt(s, a) || matchAt(s, b);
      s.p[a] = pa; s.p[b] = pb;
      const sink = !matched && isSink(s, a, b);
      if (!matched && !sink) return { ok: false, why: 'nomatch' };
      s.p[a] = pb; s.p[b] = pa;
      if (s.bucket) s.bucket.since++;
      s.movesLeft--; s.movesUsed++;
      if (sink) {
        const st = newStep(1); st.sink = true;
        gravity(s, st); s.score += st.score;
        steps = (st.collected.length ? [st] : []).concat(resolve(s, { cascade0: 1 }));
      } else steps = resolve(s, { pref: [b, a], axis });
      return finishMove(s, steps, opts);
    }
    if (s.bucket) s.bucket.since++;
    s.movesLeft--; s.movesUsed++;
    return finishMove(s, steps, opts);
  }
  function finishMove(s, steps, opts) {
    if (goalsMet(s)) s.won = true;
    else if (s.movesLeft <= 0) s.lost = true;
    let shuffle = null;
    if (!(opts && opts.quick) && !s.won && !s.lost && !listMoves(s).length) shuffle = reshuffle(s);
    return { ok: true, steps, shuffle, won: s.won, lost: s.lost };
  }

  /** Shuffle the loose pieces until the board has no matches and at least one move. Returns [{id, to}]. */
  function reshuffle(s) {
    const cells = cellsWhere(s, i => s.p[i] && !s.p[i].ice && s.p[i].k !== K.BUCKET);
    const pieces = cells.map(i => s.p[i]);
    const place = () => { cells.forEach((c, k) => { s.p[c] = pieces[k]; }); };
    let ok = false;
    for (let tries = 0; tries < 80 && !ok; tries++) {
      for (let k = pieces.length - 1; k > 0; k--) { const j = ri(s, k + 1); [pieces[k], pieces[j]] = [pieces[j], pieces[k]]; }
      if (tries > 40) for (const q of pieces) if (q.k === K.N) q.t = s.types[ri(s, s.types.length)];
      place();
      ok = !findGroups(s).length && listMoves(s).length > 0;
    }
    for (let tries = 0; tries < 300 && !ok; tries++) { // last resort: re-roll loose normal pieces until a move exists
      for (const c of cells) if (s.p[c].k === K.N) s.p[c].t = -9;
      for (const c of cells) if (s.p[c].k === K.N) s.p[c].t = pickSafeType(s, c);
      ok = !findGroups(s).length && listMoves(s).length > 0;
    }
    if (!ok) forceMove(s, cells);
    return cells.map(c => ({ id: s.p[c].id, to: c, t: s.p[c].t }));
  }

  /** Guarantee one legal move: make a, b, (c) the same type where a swap of c completes a row of three. */
  function forceMove(s, cells) {
    const loose = new Set(cells.filter(c => s.p[c].k === K.N));
    for (const a of loose) {
      const x = a % s.w;
      if (x + 3 >= s.w) continue;
      const b = a + 1, c = a + 3, d = a + 2;
      if (!loose.has(b) || !loose.has(c) || !s.p[d] || s.p[d].ice) continue;
      const t = s.p[a].t;
      s.p[b].t = t; s.p[c].t = t;
      if (s.p[d].t === t) s.p[d].t = s.types.find(u => u !== t);
      if (!findGroups(s).length && listMoves(s).length) return;
    }
  }

  /** After a win: each move left becomes a line clearer, then every special on the board goes off. */
  function sugarRush(s) {
    const steps = [];
    const st0 = newStep(0); st0.transform = true; st0.rush = true;
    const n = s.movesLeft;
    for (let k = 0; k < n; k++) {
      const cand = cellsWhere(s, i => s.p[i] && s.p[i].k === K.N && !s.p[i].ice);
      if (!cand.length) break;
      const i = cand[ri(s, cand.length)], q = s.p[i];
      q.k = rand(s) < 0.5 ? K.ROW : K.COL;
      st0.created.push({ i, piece: copyP(q), morph: true, order: k });
      st0.score += 100;
    }
    s.score += st0.score; s.movesLeft = 0;
    if (st0.created.length) steps.push(st0);
    for (let round = 0; round < 6; round++) {
      const sp = cellsWhere(s, i => s.p[i] && isSpecial(s.p[i].k));
      if (!sp.length) break;
      // fire them one after another (staggered by order) in a single step
      const rest = resolve(s, { seed: { consumed: [], blasts: [], queue: sp.map((i, k) => ({ i, by: 'rush', o: k })), combo: null, center: -1 } });
      for (const r of rest) { r.rush = true; steps.push(r); }
    }
    return steps;
  }

  function bucketDepth(s) { let d = 0; for (let i = 0; i < s.p.length; i++) { const q = s.p[i]; if (q && q.k === K.BUCKET) d += (i / s.w) | 0; } return d; }
  /** A helpful move for the hint glow: tries every legal swap and picks the one that helps the goals most. */
  function hintMove(s) {
    const moves = listMoves(s);
    if (!moves.length) return null;
    const ice0 = iceLayers(s), d0 = bucketDepth(s);
    let best = moves[0], bv = -Infinity;
    for (const m of moves) {
      const c = clone(s); c.rs = 12345;
      const r = trySwap(c, m[0], m[1], { quick: true });
      if (!r.ok) continue;
      let v = (c.score - s.score) / 100;
      c.goals.forEach((g, k) => {
        const g0 = s.goals[k];
        if (g.type === 'score') v += (c.score - s.score) / Math.max(1, g.n) * 300;
        else if (g.type === 'frost') v += (ice0 - iceLayers(c)) * 30;
        else if (g.type === 'bucket') v += (g.got - g0.got) * 300 + (bucketDepth(c) - d0) * 30;
        else v += (Math.min(g.got, g.n) - Math.min(g0.got, g.n)) * 25;
      });
      if (c.won) v += 1e5;
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }

  function clone(s) {
    const c = Object.assign({}, s);
    c.p = s.p.map(q => (q ? { id: q.id, t: q.t, k: q.k, ice: q.ice } : null));
    c.goals = s.goals.map(g => Object.assign({}, g));
    c.bucket = s.bucket ? Object.assign({}, s.bucket) : null;
    c.types = s.types.slice();
    return c;
  }
  function iceLayers(s) { let n = 0; for (const q of s.p) if (q && q.ice) n += q.ice; return n; }

  const api = { K, NAMES, newGame, findGroups, matchAt, canSwap, listMoves, trySwap, resolve, reshuffle, sugarRush, hintMove, clone, goalsMet, goalProgress, iceLayers, bucketsOnBoard, rand, blastCells, adjacent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMRules = api;
})(typeof self !== 'undefined' ? self : this);
