/* Maple Match - game shell: screens, board rendering, swipe input, step animation, HUD, map, saves. */
(function () {
  'use strict';
  const R = MMRules, A = MMArt, Snd = MMAudio, K = R.K;
  const LEVELS = MMLevels.LEVELS, SEASONS = MMLevels.SEASONS;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const backOut = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const CASCADE_WORDS = ['', '', 'Sappy!', 'Wicked Good!', 'Maple-icious!', 'Sugarbush Supreme!', 'Top of the Tap!'];
  const GOAL_WORD = { 0: 'creemees', 1: 'cider donuts', 2: 'maple leaves', 3: 'syrup jugs', 4: 'apples', 5: 'pinecones' };

  // ---------------------------------------------------------------- board themes (unlocked by stars and daily streaks)
  const THEMES = [
    { key: 'slate', name: 'Slate', frame: ['#9a5a32', '#7a4222', '#5e3017'], tiles: [['#3b5670', '#30485f'], ['#33495f', '#2a3e52']], under: '#1c2a38', need: null },
    { key: 'birch', name: 'Birch Bark', frame: ['#f4ecdc', '#ddd0b6', '#b9a888'], tiles: [['#5d4d42', '#4f4138'], ['#55473d', '#463a31']], under: '#2a201a', need: { stars: 15 }, bark: true },
    { key: 'lake', name: 'Lake Blue', frame: ['#5f97c4', '#3f78a8', '#2a5a86'], tiles: [['#1f3f66', '#18345a'], ['#1b385d', '#142d4f']], under: '#0d1d33', need: { streak: 3 } },
    { key: 'barn', name: 'Red Barn', frame: ['#c94a30', '#a8371f', '#7e2515'], tiles: [['#40332d', '#352a25'], ['#3a2e29', '#2f2520']], under: '#1e1512', need: { stars: 45 } },
    { key: 'night', name: 'Sugaring Night', frame: ['#5a4a7a', '#463862', '#30264a'], tiles: [['#2a2648', '#221f3d'], ['#26223f', '#1e1b36']], under: '#120f22', need: { stars: 90 }, stars: true },
    { key: 'peak', name: 'Peak Foliage', frame: ['#f2a03a', '#d9741c', '#a84f12'], tiles: [['#4a2a3e', '#3d2233'], ['#43263a', '#371e2e']], under: '#1f0f18', need: { streak: 7 } },
  ];
  function themeUnlocked(th) {
    if (!th.need) return true;
    if (th.need.stars) return totalStars() >= th.need.stars;
    return (save.bestStreak || 0) >= th.need.streak;
  }
  function needText(th) { return th.need.stars ? `${th.need.stars} stars` : `${th.need.streak}-day streak`; }
  function curTheme() { const th = THEMES.find(t => t.key === save.theme); return th && themeUnlocked(th) ? th : THEMES[0]; }

  // ---------------------------------------------------------------- save
  const SAVE_KEY = 'mm.save.v1';
  const save = { stars: {}, best: {}, unlocked: 1, sfx: true, music: true, tips: {}, daily: {}, streak: 0, streakDay: '', bestStreak: 0, theme: 'slate' };
  function loadSave() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d) Object.assign(save, d); } catch (e) { /* private mode */ } }
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------- state
  const G = {
    screen: 'title', overlay: null, t: 0, s: null, lv: null, sprites: new Map(), parts: [], fx: [], timers: [], waits: [],
    busy: false, ending: false, shake: 0, hitstop: 0, idle: 0, hint: null, sel: -1, cursor: -1, ptr: null, ghost: null,
    dispMoves: 0, gen: 0, tipUntil: 0, noPause: false,
  };
  const L = { W: 0, H: 0, dpr: 1, land: false, cs: 44, bx: 0, by: 0, bw: 0, bh: 0, sp: null, boardImg: null, clip: null, m: 0 };
  let app, bgC, bgX, boardC, bx, titleC, tx;

  // ---------------------------------------------------------------- timers (game time, so __T.step drives them)
  function after(ms, fn) { const gen = G.gen; G.timers.push({ at: G.t + ms, fn, gen }); }
  function whenSettled(fn) { const gen = G.gen; G.waits.push({ fn, gen }); }
  function settled() {
    for (const sp of G.sprites.values()) if (sp.falling || sp.tw || sp.exit >= 0 || sp.pop >= 0) return false;
    return true;
  }

  // ---------------------------------------------------------------- layout
  function insets() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;visibility:hidden;left:0;top:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(p);
    const cs = getComputedStyle(p), r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    p.remove(); return r;
  }
  function sizeCanvas(c, w, h) { c.width = Math.round(w * L.dpr); c.height = Math.round(h * L.dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
  function layout(force) {
    const W = window.innerWidth, H = window.innerHeight, land = W > H * 1.1;
    // Safari toolbar show/hide only changes height a little: keep the layout locked
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!force && land === L.land && Math.abs(W - L.W) <= 2 && (coarse ? H >= L.H - 2 && H - L.H < 160 : H === L.H)) return; // ignore toolbar growth, but always refit when space shrinks
    L.W = W; L.H = H; L.land = land; L.dpr = Math.min(2, window.devicePixelRatio || 1);
    app.style.width = W + 'px'; app.style.height = H + 'px';
    app.classList.toggle('land', land);
    sizeCanvas(bgC, W, H); bgX.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    sizeCanvas(boardC, W, H); bx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    sizeCanvas(titleC, W, H); tx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    L.titleSp = A.makeSprites(Math.round(Math.min(W, H) * 0.14), L.dpr);
    drawBg();
    if (G.s && G.screen === 'game') fitBoard();
    if (G.screen === 'map') buildMap();
  }
  function drawBg() {
    const game = G.screen === 'game' && G.lv;
    const season = game ? G.lv.season : 'march';
    Snd.setSeason(season);
    G.amb = []; G.ambInit = false; // seasonal weather restarts with the scene
    if (game && !L.land && L.bh) { // the landscape sits in the band above the board; the board rests on the ground
      const h = clamp(L.by + L.bh * 0.3, L.H * 0.42, L.H);
      bgX.clearRect(0, 0, L.W, L.H);
      A.drawScene(bgX, season, L.W, h, { dim: 0.06, extendTo: L.H });
      document.body.style.background = A.SCENE[season].ground;
    } else { A.drawScene(bgX, season, L.W, L.H, { dim: game ? 0.12 : 0.05 }); document.body.style.background = A.SCENE[season].hill[2]; }
  }
  function fitBoard() {
    const s = G.s, hud = $('hud').getBoundingClientRect(), ins = insets();
    let ax, ay, aw, ah;
    if (!L.land) { ay = hud.bottom + 12; ah = L.H - ay - ins.b - 16; ax = 6 + ins.l; aw = L.W - 12 - ins.l - ins.r; }
    else { ax = hud.right + 14; aw = L.W - ax - 12 - ins.r; ay = 10 + ins.t; ah = L.H - ay - 10 - ins.b; }
    const cs = Math.max(20, Math.floor(Math.min(aw / (s.w + 0.45), ah / (s.h + 0.45), 76))); // leave room for the wooden frame
    L.cs = cs; L.bw = cs * s.w; L.bh = cs * s.h;
    L.bx = Math.round(ax + (aw - L.bw) / 2);
    L.by = Math.round(ay + (ah - L.bh) * (L.land ? 0.5 : 0.82));
    L.sp = A.makeSprites(cs, L.dpr);
    buildBoardImg();
    drawBg();
  }
  function buildBoardImg() {
    const s = G.s, cs = L.cs, m = Math.round(cs * 0.34);
    L.m = m;
    const c0 = document.createElement('canvas'); c0.width = Math.round((L.bw + 2 * m) * L.dpr); c0.height = Math.round((L.bh + 2 * m) * L.dpr);
    const c = c0.getContext('2d'); c.scale(L.dpr, L.dpr); c.translate(m, m);
    const cells = []; for (let i = 0; i < s.w * s.h; i++) if (!s.hole[i]) cells.push([i % s.w, (i / s.w) | 0]);
    const blob = (pad, r) => { c.beginPath(); for (const [x, y] of cells) { c.moveTo(x * cs - pad + r, y * cs - pad); c.arcTo(x * cs + cs + pad, y * cs - pad, x * cs + cs + pad, y * cs + cs + pad, r); c.arcTo(x * cs + cs + pad, y * cs + cs + pad, x * cs - pad, y * cs + cs + pad, r); c.arcTo(x * cs - pad, y * cs + cs + pad, x * cs - pad, y * cs - pad, r); c.arcTo(x * cs - pad, y * cs - pad, x * cs + cs + pad, y * cs - pad, r); c.closePath(); } };
    c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = cs * 0.4; c.shadowOffsetY = cs * 0.14; blob(cs * 0.2, cs * 0.18); c.fillStyle = '#24110a'; c.fill('nonzero'); c.restore();
    blob(cs * 0.2, cs * 0.18); c.fillStyle = A.INK; c.fill('nonzero');
    const th = curTheme();
    blob(cs * 0.15, cs * 0.16); c.fillStyle = A.lg(c, 0, 0, 0, L.bh, [[0, th.frame[0]], [0.5, th.frame[1]], [1, th.frame[2]]]); c.fill('nonzero');
    // frame grain (or birch-bark dashes)
    c.save(); blob(cs * 0.15, cs * 0.16); c.clip('nonzero');
    for (let i = 0; i < 70; i++) {
      const y = -cs * 0.25 + (i / 70) * (L.bh + cs * 0.5), x0 = A.prand(i) * L.bw;
      if (th.bark) { // birch: soft grey streaks plus dark horizontal lenticels with tapered ends, all over the frame
        c.fillStyle = 'rgba(150,140,125,.18)'; c.fillRect(-cs, y, L.bw + 2 * cs, cs * 0.05);
        for (let j = 0; j < 3; j++) {
          const lx = A.prand(i * 3 + j) * (L.bw + cs * 0.4) - cs * 0.2, len = cs * (0.12 + A.prand(i + j * 7) * 0.28), ly = y + j * cs * 0.07;
          c.fillStyle = 'rgba(45,35,28,.75)'; c.beginPath(); c.ellipse(lx, ly, len / 2, cs * 0.022, 0, 0, 7); c.fill();
        }
      }
      else { c.strokeStyle = i % 3 ? 'rgba(30,12,2,.14)' : 'rgba(255,220,170,.10)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-cs, y); c.bezierCurveTo(L.bw * 0.3, y + Math.sin(i) * 4, L.bw * 0.7, y - Math.cos(i) * 4, L.bw + cs, y); c.stroke(); }
    }
    c.restore();
    blob(cs * 0.04, cs * 0.12); c.fillStyle = th.under; c.fill('nonzero');
    for (const [x, y] of cells) {
      const odd = (x + y) % 2, X = x * cs + 1.5, Y = y * cs + 1.5, S = cs - 3, r = cs * 0.16;
      A.rr(c, X, Y, S, S, r);
      c.fillStyle = A.lg(c, 0, Y, 0, Y + S, [[0, th.tiles[odd][0]], [1, th.tiles[odd][1]]]); c.fill();
      // bevel: light top-left lip, dark bottom-right
      c.save(); A.rr(c, X, Y, S, S, r); c.clip();
      c.lineWidth = cs * 0.08; c.strokeStyle = 'rgba(0,0,0,.28)'; A.rr(c, X + cs * 0.04, Y + cs * 0.04, S, S, r); c.stroke();
      c.lineWidth = cs * 0.05; c.strokeStyle = 'rgba(255,255,255,.10)'; A.rr(c, X - cs * 0.02, Y - cs * 0.02, S, S, r); c.stroke();
      c.restore();
      if (th.stars && A.prand(x * 13 + y * 7) > 0.55) { c.fillStyle = 'rgba(255,250,220,.35)'; c.beginPath(); c.arc(X + A.prand(x + y * 3) * S, Y + A.prand(x * 5 + y) * S, 1.2, 0, 7); c.fill(); }
    }
    // soft light from the upper left and a vignette at the edges
    c.save(); blob(cs * 0.04, cs * 0.12); c.clip('nonzero');
    c.fillStyle = A.rg(c, L.bw * 0.3, L.bh * 0.2, cs, Math.max(L.bw, L.bh) * 0.85, [[0, 'rgba(255,240,210,.10)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.28)']]);
    c.fillRect(-cs, -cs, L.bw + 2 * cs, L.bh + 2 * cs);
    c.restore();
    L.boardImg = c0;
    const clip = new Path2D();
    for (const [x, y] of cells) clip.rect(L.bx + x * cs, L.by + y * cs, cs, cs);
    L.clip = clip;
  }
  const cellX = i => i % G.s.w, cellY = i => (i / G.s.w) | 0;
  const px = x => L.bx + (x + 0.5) * L.cs, py = y => L.by + (y + 0.5) * L.cs;
  function cellAt(cx, cy) {
    const s = G.s; if (!s) return -1;
    let fx = (cx - L.bx) / L.cs, fy = (cy - L.by) / L.cs;
    if (fx < -0.45 || fy < -0.45 || fx > s.w + 0.45 || fy > s.h + 0.45) return -1;
    const x = clamp(Math.floor(fx), 0, s.w - 1), y = clamp(Math.floor(fy), 0, s.h - 1);
    const i = y * s.w + x;
    return s.hole[i] ? -1 : i;
  }

  // ---------------------------------------------------------------- sprites
  function makeSprite(q, x, y) {
    const sp = { id: q.id, t: q.t, k: q.k, ice: q.ice, x, y, vy: 0, falling: false, ty: y, tx: x, delay: 0, sx: 1, sy: 1, scale: 1, alpha: 1, pop: -1, exit: -1, flash: 0, tw: null, phase: Math.random() * 6, wig: 0, popTo: null, exitOnLand: false, hop: -1 };
    G.sprites.set(q.id, sp); return sp;
  }
  function rebuildSprites(dropIn) {
    const s = G.s; G.sprites.clear();
    for (let i = 0; i < s.w * s.h; i++) {
      const q = s.p[i]; if (!q) continue;
      const x = cellX(i), y = cellY(i);
      const sp = makeSprite(q, x, dropIn ? y - s.h - 1 - Math.random() * 0.6 : y);
      if (dropIn) { sp.ty = y; sp.falling = true; sp.delay = x * 0.035 + (s.h - y) * 0.03; }
    }
  }
  function setFall(sp, to) { sp.tx = cellX(to); sp.ty = cellY(to); sp.x = sp.tx; if (sp.ty > sp.y + 0.001) { sp.falling = true; } else { sp.y = sp.ty; } }
  function tween(sp, tx, ty, dur, ease, back) { sp.tw = { fx: sp.x, fy: sp.y, tx, ty, t0: G.t, dur, ease: ease || easeInOut, back }; }

  // ---------------------------------------------------------------- particles + fx
  function burst(x, y, color, n, speed, opts) {
    opts = opts || {};
    for (let k = 0; k < n && G.parts.length < 520; k++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.8);
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.up || 0), life: 0, max: (opts.life || 0.6) * (0.6 + Math.random() * 0.6), color: Array.isArray(color) ? color[k % color.length] : color, size: (opts.size || 4) * (0.6 + Math.random() * 0.8), g: opts.g === undefined ? 900 : opts.g, kind: opts.kind || 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }
  function callout(text, big) {
    G.fx = G.fx.filter(f => f.kind !== 'callout');
    G.fx.push({ kind: 'callout', text, t0: G.t, dur: big ? 1300 : 1000, big });
  }
  function floater(text, x, y, color) { G.fx.push({ kind: 'float', text, x, y, t0: G.t, dur: 1000, color: color || '#ffe766' }); }
  function shake(a) { G.shake = Math.max(G.shake, a); }

  // ---------------------------------------------------------------- HUD
  function goalIcon(g, size) {
    const c = document.createElement('canvas'); const d = L.dpr || 1; c.width = c.height = Math.round(size * d);
    const x = c.getContext('2d'); x.scale(d, d);
    if (g.type === 'collect') A.drawPiece(x, g.t, size / 2, size / 2, size * 0.98);
    else if (g.type === 'bucket') A.drawPiece(x, 'bucket', size / 2, size / 2, size * 0.98);
    else if (g.type === 'frost') A.iceBlock(x, size / 2, size / 2, size);
    else { // score: a golden sap drop
      x.translate(size / 2, size / 2); x.scale(size / 26, size / 26); x.translate(-10, -13);
      const p = new Path2D('M10 1C14 8 18 12 18 17a8 8 0 01-16 0C2 12 6 8 10 1z');
      x.fillStyle = '#ffb21e'; x.fill(p); x.lineWidth = 2; x.strokeStyle = A.INK; x.stroke(p);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.ellipse(7, 15, 1.6, 3, 0.3, 0, 7); x.fill();
    }
    return c;
  }
  function goalLeft(g, real) {
    const k = G.s.goals.indexOf(g);
    const got = real || !G.dispGot ? g.got : G.dispGot[k];
    return Math.max(0, g.type === 'score' ? g.n - (real ? G.s.score : G.dispScore) : g.n - got);
  }
  function syncDisplay() { G.dispScore = G.s.score; G.dispGot = G.s.goals.map(g => g.got); G.dispMoves = G.s.movesLeft; }
  /** Count what one animation step contributes to the goal chips and score, as it plays. */
  function stepDisplay(st) {
    G.dispScore += st.score || 0;
    G.s.goals.forEach((g, k) => {
      if (g.type === 'collect') G.dispGot[k] += st.removed.filter(r => r.t === g.t).length;
      if (g.type === 'frost') G.dispGot[k] += st.ice.filter(e => e.ice === 0).length;
    });
  }
  function fmt(n) { return n >= 1000 ? Math.floor(n / 1000) + ',' + String(n % 1000).padStart(3, '0') : String(n); }
  function goalText(g) {
    if (g.type === 'score') return 'Score ' + fmt(g.n);
    if (g.type === 'collect') return 'Collect ' + g.n + ' ' + GOAL_WORD[g.t];
    if (g.type === 'frost') return 'Free ' + g.n + ' frozen pieces';
    return 'Bring down ' + g.n + ' sap bucket' + (g.n > 1 ? 's' : '');
  }
  function buildGoals(el, size) {
    el.innerHTML = '';
    if (G.lv && G.lv.boil && el.id === 'goals') {
      el.innerHTML = `<div class="heat"><small>HEAT</small><span class="pips">${'<i></i>'.repeat(5)}</span><b id="heatX">×1</b></div><div class="boilbest"><small>BEST TODAY</small><b id="boilBest">0</b></div>`;
      return;
    }
    G.s.goals.forEach((g, k) => {
      const d = document.createElement('div'); d.className = 'goal'; d.dataset.k = k;
      d.appendChild(goalIcon(g, size));
      const b = document.createElement('b'); d.appendChild(b); el.appendChild(d);
    });
    refreshGoals(el, false);
  }
  function refreshGoals(el, bump) {
    if (!G.s) return;
    if (G.lv.boil && el.id === 'goals') {
      const pips = el.querySelectorAll('.pips i'); pips.forEach((p, k) => p.classList.toggle('on', k < G.heat));
      const hx = $('heatX'); if (hx) { const t = '×' + HEAT_MULT[G.heat]; if (hx.textContent !== t) { hx.textContent = t; if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } } }
      const bb = $('boilBest'); if (bb) bb.textContent = fmt(boilBest().today);
      return;
    }
    [...el.children].forEach((d, k) => {
      const g = G.s.goals[k], left = goalLeft(g), b = d.querySelector('b');
      const txt = left === 0 ? '\u00a0' : g.type === 'score' ? fmt(Math.min(G.dispScore, g.n)) + ' / ' + fmt(g.n) : String(left);
      if (b.textContent !== txt) { b.textContent = txt; if (bump) { d.classList.remove('bump'); void d.offsetWidth; d.classList.add('bump'); } }
      d.classList.toggle('done', left === 0);
    });
  }
  function updateHUD(bump) {
    const s = G.s; if (!s) return;
    $('moves').textContent = G.dispMoves;
    let lab = '';
    if (G.lv.daily && !s.won) { // daily stars come from moves to spare: say so on the bar
      const a3 = Math.ceil(G.lv.moves * 0.45), a2 = Math.ceil(G.lv.moves * 0.25);
      lab = G.dispMoves >= a3 ? `Finish with ${a3}+ moves left for ★★★` : G.dispMoves >= a2 ? `Finish with ${a2}+ moves left for ★★` : 'Finish for ★';
    } else if (G.lv.boil) { const nx = nextGrade(G.dispScore), gr = gradeFor(G.dispScore); lab = nx ? `${gr ? gr.n + ' · ' : ''}next: ${nx.n} at ${fmt(nx.s)}` : `${gr.n}!`; }
    $('barLabel').textContent = lab; $('scoreBar').classList.toggle('labelled', !!lab); $('scoreBar').classList.toggle('dailybar', !!G.lv.daily);
    $('movesBox').classList.toggle('low', G.dispMoves <= 5 && !s.won);
    refreshGoals($('goals'), bump);
    const sc = G.dispScore;
    $('score').textContent = fmt(sc);
    const ng = nextGrade(sc), pg = gradeFor(sc);
    const st = G.lv.stars || [0, 1, 2], top = G.lv.boil ? (ng ? ng.s : sc || 1) : G.lv.daily ? Math.max(15000, (save.daily[G.lv.daily] || {}).best || 0) : st[2] * 1.08;
    $('scoreFill').style.width = (G.lv.daily ? 0 : G.lv.boil ? clamp((sc - (pg ? pg.s : 0)) / (top - (pg ? pg.s : 0)) * 100, 0, 100) : clamp(sc / top * 100, 0, 100)) + '%';
    for (let k = 0; k < 3; k++) {
      if (G.lv.daily || G.lv.boil) { $('mk' + k).classList.add('hidden'); continue; }
      const mk = $('mk' + k);
      mk.style.left = (st[k] / top * 100) + '%';
      mk.classList.toggle('hidden', k === 0 && !st[0]); mk.classList.remove('hidden-d');
      mk.classList.toggle('on', k === 0 ? (st[0] ? sc >= st[0] : s.won && G.ending) : sc >= st[k]);
    }
  }

  // ---------------------------------------------------------------- screens
  function showScreen(name) {
    if (name !== 'game' && G.screen === 'game') { G.gen++; G.timers = []; G.waits = []; G.busy = false; G.ptr = null; } // leaving a level cancels its pending animation steps
    G.screen = name;
    ['title', 'map', 'game'].forEach(n => $(n).classList.toggle('hidden', n !== name));
    closeOverlay();
    drawBg();
    if (name === 'title') refreshTitle();
    if (name === 'map') { buildMap(); }
  }
  function openOverlay(id) { closeOverlay(); G.overlay = id; $(id).classList.remove('hidden'); }
  function closeOverlay() { ['pause', 'win', 'lose'].forEach(n => $(n).classList.add('hidden')); G.overlay = null; }
  function nextLevelId() { return Math.min(LEVELS.length, save.unlocked); }
  function refreshTitle() {
    const id = nextLevelId(), lv = LEVELS[id - 1];
    $('playSub').textContent = `Level ${id} · ${lv.name}`;
    $('mapSub').textContent = `${LEVELS.length} levels · ${totalStars()} of ${LEVELS.length * 3} stars`;
    const today = MMAI.dateKey(), d = save.daily[today];
    const streak = liveStreak();
    $('btnDaily').classList.toggle('done', !!d);
    $('dailySub').textContent = d ? `${'★'.repeat(d.stars)} · best ${fmt(d.best)}` : streak ? `Streak ${streak} · play today` : 'New board today';
    let dots = '';
    for (let k = 6; k >= 0; k--) { const [y, m, dd] = today.split('-').map(Number), key = MMAI.dateKey(new Date(y, m - 1, dd - k)); dots += `<i class="${save.daily[key] ? 'on' : ''}${k === 0 ? ' today' : ''}"></i>`; }
    $('dailyWeek').innerHTML = dots;
    const bb = boilBest();
    $('boilSub').textContent = bb.today ? `Today ${fmt(bb.today)}${save.bestGrade ? ' · ' + save.bestGrade : ''}` : save.bestGrade ? `Best grade: ${save.bestGrade}` : bb.ever ? `Best ${fmt(bb.ever)}` : 'Score chase';
  }
  function yesterdayKey(key) { const [y, m, d] = key.split('-').map(Number); return MMAI.dateKey(new Date(y, m - 1, d - 1)); }
  /** Streak still alive only if the last daily win was today or yesterday. */
  function liveStreak() { const t = MMAI.dateKey(); return save.streakDay === t || save.streakDay === yesterdayKey(t) ? save.streak : 0; }

  // ---------------------------------------------------------------- board themes
  function drawMini(cv, th) { // 2x2 tiles in the theme's frame, with a piece on each
    const d = L.dpr || 1, S = 56; cv.width = cv.height = S * d; cv.style.width = cv.style.height = S + 'px';
    const c = cv.getContext('2d'); c.scale(d, d);
    A.rr(c, 0, 0, S, S, 10); c.fillStyle = A.lg(c, 0, 0, 0, S, [[0, th.frame[0]], [1, th.frame[2]]]); c.fill();
    const t = 24, o = 4;
    [[0, 0, 2], [1, 0, 4], [0, 1, 5], [1, 1, 1]].forEach(([x, y, k], i) => {
      A.rr(c, o + x * t, o + y * t, t - 1, t - 1, 5); c.fillStyle = th.tiles[(x + y) % 2][0]; c.fill();
      A.drawPiece(c, k, o + x * t + t / 2, o + y * t + t / 2, t * 0.95);
    });
  }
  function openThemes() {
    const list = $('themeList'); list.innerHTML = '';
    for (const th of THEMES) {
      const ok = themeUnlocked(th), b = document.createElement('button');
      b.className = 'theme' + (curTheme().key === th.key ? ' on' : '') + (ok ? '' : ' locked');
      b.innerHTML = `${ok ? '' : '<b class="lock"></b>'}<canvas class="mini"></canvas><span>${th.name}<small>${ok ? (curTheme().key === th.key ? 'In use' : 'Tap to use') : 'Unlock: ' + needText(th)}</small></span>`;
      drawMini(b.querySelector('canvas'), th);
      b.addEventListener('click', () => { if (!ok) { Snd.bonk(); return; } Snd.click(); save.theme = th.key; writeSave(); openThemes(); });
      list.appendChild(b);
    }
    $('themes').classList.remove('hidden');
  }

  // ---------------------------------------------------------------- map
  let mapBuiltFor = '';
  function buildMap() {
    const inner = $('mapInner'), scroller = $('mapScroll');
    const w = scroller.clientWidth || L.W;
    const key = w + ':' + save.unlocked + ':' + JSON.stringify(save.stars);
    $('mapStarN').textContent = totalStars() + ' / ' + LEVELS.length * 3;
    if (key === mapBuiltFor) { scrollToCurrent(); return; }
    mapBuiltFor = key;
    inner.innerHTML = '';
    const STEP = 96, TOP = 120;
    SEASONS.forEach((se, si) => {
      const n = se.to - se.from + 1, h = TOP + n * STEP + 30;
      const sec = document.createElement('div'); sec.className = 'season'; sec.style.height = h + 'px';
      const cv = document.createElement('canvas'); sec.appendChild(cv);
      cv.width = Math.round(w * L.dpr); cv.height = Math.round(h * L.dpr);
      const c = cv.getContext('2d'); c.scale(L.dpr, L.dpr);
      A.drawScene(c, se.key, w, h, { dim: 0.08 });
      if (si > 0) { // fade from the season above so there's no hard seam
        const prevGround = A.SCENE[SEASONS[si - 1].key].ground;
        const g = c.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, prevGround); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, 160);
      }
      const pts = [];
      for (let j = 0; j < n; j++) pts.push([w / 2 + Math.sin(j * 1.05 + si * 1.7) * Math.min(w * 0.3, 160), TOP + j * STEP + 20]);
      // sap-line path between nodes
      c.beginPath(); pts.forEach((p, j) => { if (j) { const q = pts[j - 1]; c.bezierCurveTo(q[0], q[1] + STEP * 0.5, p[0], p[1] - STEP * 0.5, p[0], p[1]); } else { c.moveTo(w / 2, si ? 0 : p[1] - 60); c.bezierCurveTo(w / 2, p[1] - 40, p[0], p[1] - 50, p[0], p[1]); } });
      if (si < SEASONS.length - 1) { const q = pts[n - 1]; c.bezierCurveTo(q[0], q[1] + 50, w / 2, h - 20, w / 2, h); }
      c.lineCap = 'round'; c.lineWidth = 16; c.strokeStyle = 'rgba(43,22,16,.55)'; c.stroke();
      c.setLineDash([2, 16]); c.lineWidth = 8; c.strokeStyle = '#ffd77a'; c.stroke(); c.setLineDash([]);
      const tag = document.createElement('div'); tag.className = 'season-tag'; tag.innerHTML = `${se.name}<small>${se.sub.toUpperCase()} · LEVELS ${se.from}-${se.to}</small>`; sec.appendChild(tag);
      for (let j = 0; j < n; j++) {
        const id = se.from + j, b = document.createElement('button');
        const stars = save.stars[id] || 0, locked = id > save.unlocked, cur = id === nextLevelId() && !stars;
        b.className = 'node' + (locked ? ' locked' : '') + (cur ? ' current' : '');
        b.style.left = pts[j][0] + 'px'; b.style.top = pts[j][1] + 'px';
        b.dataset.id = id; b.setAttribute('aria-label', `Level ${id}${locked ? ' (locked)' : ''}`);
        b.innerHTML = `${id}<span class="st">${[0, 1, 2].map(k => `<i class="${k < stars ? 'on' : ''}"></i>`).join('')}</span>`;
        b.addEventListener('click', () => { Snd.click(); if (locked) { b.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 200 }); Snd.bonk(); return; } startLevel(id); });
        sec.appendChild(b);
      }
      inner.appendChild(sec);
    });
    scrollToCurrent();
  }
  function scrollToCurrent() {
    const b = $('mapInner').querySelector(`.node[data-id="${nextLevelId()}"]`);
    if (b) { const sc = $('mapScroll'); sc.scrollTop = Math.max(0, b.offsetTop + b.parentElement.offsetTop - sc.clientHeight * 0.55); }
  }

  // ---------------------------------------------------------------- level flow
  const HEAT_MULT = [1, 1, 1.5, 2, 2.5, 3];
  // Boil Down grades, named after real maple syrup grades
  const GRADES = [{ n: 'Golden', s: 8000 }, { n: 'Amber', s: 16000 }, { n: 'Dark', s: 26000 }, { n: 'Very Dark', s: 40000 }, { n: 'Sugarmaker', s: 60000 }];
  function gradeFor(score) { let g = null; for (const x of GRADES) if (score >= x.s) g = x; return g; }
  function nextGrade(score) { return GRADES.find(x => score < x.s) || null; }
  function boilBest() { const key = MMAI.dateKey(), b = save.boil || {}; return { today: b.day === key ? b.today : 0, ever: b.ever || 0 }; }
  function startBoil() {
    const key = MMAI.dateKey(), rnd = MMAI.mulberry(MMAI.hash('boil:' + key));
    const types = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, 5).sort();
    const month = +key.slice(5, 7) - 1;
    const season = [0, 1, 2, 11].includes(month) ? 'march' : [3, 4].includes(month) ? 'mud' : [5, 6, 7].includes(month) ? 'summer' : 'october';
    // today's pieces and season stay fixed; the board itself is fresh each run, so it's skill, not memory
    startLevel({ id: 'boil', boil: key, name: 'Boil Down', season, types, moves: 25, goals: [{ type: 'score', n: 1e9 }], layout: Array(8).fill('........') }, (Math.random() * 1e9) | 0);
  }
  function showBoilEnd() {
    const s = G.s, key = G.lv.boil, b = save.boil && save.boil.day === key ? save.boil : { day: key, today: 0, ever: (save.boil || {}).ever || 0 };
    const newToday = s.score > b.today, newEver = s.score > b.ever;
    b.today = Math.max(b.today, s.score); b.ever = Math.max(b.ever, s.score); b.day = key; save.boil = b; writeSave();
    syncDisplay(); updateHUD(false);
    openOverlay('win');
    const grNow = gradeFor(s.score);
    $('winTitle').textContent = grNow ? grNow.n + ' grade!' : 'Boiled down!';
    $('winStars').classList.add('hidden');
    $('wNext').querySelector('.bt').textContent = 'Boil again'; $('wReplay').textContent = 'Home'; $('wMap').classList.add('hidden');
    const gr = gradeFor(s.score), nx = nextGrade(s.score);
    if (gr && (!save.bestGrade || GRADES.findIndex(x => x.n === gr.n) > GRADES.findIndex(x => x.n === save.bestGrade))) save.bestGrade = gr.n;
    writeSave();
    $('winSub').textContent = `${newEver ? 'New best ever! · ' : newToday ? 'Best today! · ' : 'Best today ' + fmt(b.today) + ' · '}${nx ? fmt(nx.s - s.score) + ' more for ' + nx.n : 'top grade'} · top heat ×${HEAT_MULT[G.heatPeak]}`;
    $('winUnlock').classList.add('hidden');
    const N = 24; for (let k = 0; k <= N; k++) after(k * 32, () => { $('winScore').textContent = fmt(Math.round(s.score * k / N)); if (k % 3 === 0) Snd.tick(k / 3); });
    Snd.win();
  }
  function startDaily() {
    const key = MMAI.dateKey();
    startLevel(MMAI.dailyCandidate(key), MMAI.hash(key) % 1000000 + 1);
  }
  function startLevel(id, seed) {
    G.gen++; G.timers = []; G.waits = []; G.fx = []; G.parts = [];
    const lv = typeof id === 'object' ? id : LEVELS[id - 1];
    G.lv = lv; G.seed = seed || ((Math.random() * 1e9) | 0);
    G.s = R.newGame(lv, G.seed);
    syncDisplay(); G.ending = false; G.fast = false; G.queued = null; G.hintLevel = 0; G.sel = -1; G.cursor = -1; G.hint = null; G.idle = 0; G.ptr = null; G.ghost = null;
    showScreen('game');
    G.heat = 1; G.heatPeak = 1;
    $('lvlSeason').textContent = lv.daily ? 'Daily Sap Run' : lv.boil ? 'Score chase' : SEASONS.find(s => s.key === lv.season).name;
    $('lvlTitle').textContent = lv.daily || lv.boil ? lv.name : `${lv.id} · ${lv.name}`;
    buildGoals($('goals'), 40);
    updateHUD(false);
    $('tip').classList.add('hidden');
    fitBoard();
    rebuildSprites(true);
    G.busy = true;
    G.fx.push({ kind: 'intro', t0: G.t, dur: 1800, title: lv.daily ? 'Daily' : lv.boil ? 'Today' : `Level ${lv.id}`, lines: lv.boil ? [lv.moves + ' moves: score all you can.', 'Make a special every move for heat.'] : G.s.goals.map(goalText) });
    whenSettled(() => {
      G.busy = false;
      if (lv.tip && !save.tips[lv.id]) { save.tips[lv.id] = 1; writeSave(); showTip(lv.tip); }
      if (lv.id === 1 && !save.stars[1]) after(900, () => { if (!G.busy && G.s.movesUsed === 0) G.ghost = { t0: G.t, m: R.hintMove(G.s) }; });
    });
  }
  function showTip(text) {
    const tip = $('tip'), hudB = $('hud').getBoundingClientRect().bottom;
    $('tipText').textContent = text; tip.classList.remove('hidden');
    if (!L.land && L.by - hudB > 90) { tip.style.top = Math.round(hudB + (L.by - hudB) / 2) + 'px'; tip.style.bottom = 'auto'; tip.classList.add('band'); }
    else { tip.style.top = ''; tip.style.bottom = ''; tip.classList.remove('band'); }
    G.tipUntil = G.t + 8000;
  }
  function hideTip() { $('tip').classList.add('hidden'); G.tipUntil = 0; }

  // ---------------------------------------------------------------- swapping
  function noteInput() { G.idle = 0; G.hint = null; G.hintLevel = 0; }
  function attemptSwap(a, b) {
    const s = G.s;
    if (!s || G.busy || G.ending || s.won || s.lost || G.overlay) return;
    noteInput(); G.sel = -1; G.ghost = null;
    const pa = s.p[a], pb = s.p[b];
    if (!pa || !pb) return;
    const spA = G.sprites.get(pa.id), spB = G.sprites.get(pb.id);
    if (pa.ice || pb.ice) { // frozen: a little shiver
      [spA, spB].forEach(sp => { if (sp && sp.ice) sp.wig = 1; }); Snd.bonk(); return;
    }
    if (G.lv.boil) s.mult = HEAT_MULT[G.heat];
    const res = R.trySwap(s, a, b);
    const ax = cellX(a), ay = cellY(a), bX = cellX(b), bY = cellY(b);
    if (!res.ok) {
      tween(spA, lerp(ax, bX, 0.42), lerp(ay, bY, 0.42), 110, easeOut, { x: ax, y: ay, dur: 190 });
      tween(spB, lerp(bX, ax, 0.42), lerp(bY, ay, 0.42), 110, easeOut, { x: bX, y: bY, dur: 190 });
      Snd.bonk(); Snd.haptic(12);
      return;
    }
    G.busy = true; Snd.swap();
    if (G.lv.boil) { // Boil Down: a move that makes or sets off a special keeps the heat rising
      const hot = res.steps.some(st => st.blasts.length || st.combo || st.created.some(c => !c.morph));
      const combo = res.steps.some(st => st.combo);
      const before = G.heat;
      G.heat = combo ? Math.min(5, G.heat + 2) : hot ? Math.min(5, G.heat + 1) : Math.max(1, G.heat - 1);
      G.heatPeak = Math.max(G.heatPeak, G.heat);
      if (G.heat > before) after(400, () => { callout('Heat ×' + HEAT_MULT[G.heat] + '!'); Snd.callout(G.heat); });
      else if (G.heat < before) after(300, () => { Snd.cool(); floater('Heat cooling…', L.bx + L.bw / 2, L.by - L.cs * 0.1, '#bfe6ff'); const h = $('goals'); h.classList.remove('cool'); void h.offsetWidth; h.classList.add('cool'); });
    }
    tween(spA, bX, bY, 150, easeOut); tween(spB, ax, ay, 150, easeOut);
    G.dispMoves = s.movesLeft; updateHUD(false);
    after(150, () => runSteps(res.steps, () => afterMove(res)));
  }
  function afterMove(res) {
    const done = () => {
      G.busy = false;
      syncCheck();
      const mv = G.dispMoves; syncDisplay(); G.dispMoves = mv;
      updateHUD(true);
      if (G.s.won) startWin();
      else if (G.s.lost && G.lv.boil) { // leftover specials all go off for a last burst of points
        G.ending = true; G.busy = true;
        const steps = R.sugarRush(G.s);
        if (steps.length) { callout('Last Boil!', true); Snd.win(); after(500, () => runSteps(steps, () => after(500, showBoilEnd))); }
        else after(600, showBoilEnd);
      }
      else if (G.s.lost) { G.ending = true; after(600, showLose); }
      else if (G.queued && G.t - G.queued.t < 3000) { const q = G.queued; G.queued = null; attemptSwap(q.a, q.b); }
      G.queued = null;
    };
    if (res.shuffle) {
      callout('Shuffle!'); Snd.shuffle();
      after(350, () => {
        for (const e of res.shuffle) { const sp = G.sprites.get(e.id); if (sp) { sp.t = e.t; tween(sp, cellX(e.to), cellY(e.to), 520, easeInOut); } }
        after(560, () => whenSettled(done));
      });
    } else done();
  }
  /** Safety net: if the sprites ever disagree with the rules state, snap them back. */
  function syncCheck() {
    const s = G.s; let bad = 0;
    for (let i = 0; i < s.w * s.h; i++) {
      const q = s.p[i]; if (!q) continue;
      const sp = G.sprites.get(q.id);
      if (!sp || Math.abs(sp.x - cellX(i)) > 0.01 || Math.abs(sp.y - cellY(i)) > 0.01 || sp.k !== q.k || sp.t !== q.t || sp.ice !== q.ice) bad++;
    }
    if (bad || G.sprites.size !== s.p.filter(Boolean).length) { G.desyncs = (G.desyncs || 0) + 1; console.warn('Maple Match: resync', bad); rebuildSprites(false); }
  }

  // ---------------------------------------------------------------- playing back rule steps
  function runSteps(steps, done) {
    let i = 0;
    const next = () => {
      if (i >= steps.length) { whenSettled(done); return; }
      const st = steps[i++];
      if (st.transform) { G.dispScore += st.score || 0; after(animateTransform(st), next); return; }
      stepDisplay(st);
      const popDur = animatePops(st);
      after(popDur, () => {
        animateCreated(st);
        animateFalls(st);
        whenSettled(() => after(30, next));
      });
    };
    next();
  }
  function cellCenter(i) { return [px(cellX(i)), py(cellY(i))]; }
  function animatePops(st) {
    let maxO = 0, sumX = 0, sumY = 0, n = 0;
    const cs = L.cs;
    const mergeTo = {};
    for (const m of st.matches) if (m.at >= 0) for (const c of m.cells) mergeTo[c] = m.at;
    if (st.matches.length) { const big = Math.max(...st.matches.map(m => m.size)); Snd.pop(st.c, big, st.matches[0].t); Snd.haptic(st.c > 1 ? 14 : 8); }
    if (st.combo) {
      callout(st.combo, true); Snd.combo(); shake(16); G.hitstop = 90; Snd.haptic(45); G.fx.push({ kind: 'flash', t0: G.t, dur: 320 });
      if (st.center >= 0) { const [cx, cy] = cellCenter(st.center); G.fx.push({ kind: 'ring', x: cx, y: cy, r0: cs * 0.5, r1: cs * 6, t0: G.t, dur: 700, color: '#fff4dc', thick: true }); burst(cx, cy, ['#ffc94a', '#ec4a1f', '#fff4dd', '#a35ad6', '#69c23a'], 40, cs * 12, { size: cs * 0.14, life: 0.9, kind: 'leaf', up: cs * 2 }); }
    }
    else if (st.c >= 2 && !st.rush) { const w = CASCADE_WORDS[Math.min(st.c, 6)]; if (w) { callout(w, st.c >= 4); Snd.callout(st.c); } if (st.c >= 4) shake(7); }
    const goalTypes = new Set(G.s.goals.filter(g => g.type === 'collect').map(g => g.t));
    let tokens = 0;
    for (const b of st.blasts) { maxO = Math.max(maxO, b.o); after(b.o * 75, () => blastFx(b)); }
    for (const r of st.removed) {
      const sp = G.sprites.get(r.id); if (!sp) continue;
      maxO = Math.max(maxO, r.o);
      sp.dying = true;
      const [cx, cy] = cellCenter(r.i); sumX += cx; sumY += cy; n++;
      const toCell = r.by === 'merge' ? r.i : mergeTo[r.i];
      const delay = r.o * 75;
      after(delay, () => {
        sp.pop = 0; sp.flash = 1;
        if (toCell !== undefined) sp.popTo = [cellX(toCell), cellY(toCell)];
        const t = r.t >= 0 ? r.t : 3;
        burst(cx, cy, [A.COLORS[t], A.LIGHT[t], '#fff'], r.by === 'merge' ? 4 : 10, cs * 6.5, { size: cs * 0.13, life: 0.6, kind: t === 2 ? 'leaf' : r.by === 'match' ? 'dot' : 'drop', up: cs * 1.5 });
        if (r.by !== 'merge') G.fx.push({ kind: 'ring', x: cx, y: cy, r0: cs * 0.15, r1: cs * 0.62, t0: G.t, dur: 260, color: A.LIGHT[t] });
        if (goalTypes.has(r.t) && tokens++ < 14) flyToGoal(r.t, cx, cy);
      });
    }
    if (st.removed.some(r => r.k === K.CONE)) Snd.cone();
    for (const e of st.ice) {
      const sp = G.sprites.get(e.id); if (!sp) continue;
      after(40, () => {
        sp.ice = e.ice; sp.flash = 0.8; sp.wig = 0.6;
        const [cx, cy] = cellCenter(e.i);
        burst(cx, cy, ['#e8f6ff', '#bfe4ff', '#fff'], 10, cs * 4, { size: cs * 0.09, life: 0.5, kind: 'shard' });
        Snd.ice();
      });
    }
    if (st.score && n) floater('+' + st.score, sumX / n, sumY / n - cs * 0.2, st.c >= 3 ? '#ffb4f0' : '#ffe48a');
    after(60, () => updateHUD(true));
    return 220 + maxO * 75;
  }
  function animateCreated(st) {
    for (const c of st.created) {
      if (c.morph) continue;
      const [x, y] = [cellX(c.i), cellY(c.i)];
      const sp = makeSprite(c.piece, x, y);
      sp.scale = 0; sp.grow = 0; sp.flash = 1;
      const [cx, cy] = cellCenter(c.i);
      burst(cx, cy, ['#fff6c0', '#ffd24a', '#fff'], 16, L.cs * 6, { size: L.cs * 0.08, life: 0.6, kind: 'spark', g: 200 });
      G.fx.push({ kind: 'ring', x: cx, y: cy, r0: L.cs * 0.2, r1: L.cs * 1.1, t0: G.t, dur: 380, color: '#fff3b0' });
      Snd.make(c.piece.k); Snd.haptic(20);
      if (c.piece.k === K.CONE) callout('Twist Cone!');
    }
  }
  function animateFalls(st) {
    const s = G.s;
    for (const f of st.falls) { const sp = G.sprites.get(f.id); if (sp) setFall(sp, f.to); }
    for (const e of st.spawns) {
      const x = cellX(e.to), top = cellY(s.cols[x][0]);
      const sp = makeSprite(e.piece, x, top - e.off - 0.15);
      setFall(sp, e.to);
    }
    for (const c of st.collected) {
      const sp = G.sprites.get(c.id); if (!sp) continue;
      if (sp.falling) sp.exitOnLand = true; else startExit(sp);
    }
  }
  function startExit(sp) {
    sp.exit = 0; sp.exitOnLand = false;
    const cx = px(sp.x), cy = py(sp.y);
    burst(cx, cy, ['#ffe08a', '#ffb21e', '#fff', '#cfd8de'], 22, L.cs * 6, { size: L.cs * 0.09, life: 0.8, up: L.cs * 3, kind: 'spark' });
    G.fx.push({ kind: 'ring', x: cx, y: cy, r0: L.cs * 0.3, r1: L.cs * 1.5, t0: G.t, dur: 450, color: '#ffe08a' });
    floater('+500', cx, cy - L.cs * 0.4, '#ffe48a');
    if (!G.ending) callout('Sap bucket in!'); Snd.bucket(); Snd.haptic(25);
    const bk = G.s.goals.findIndex(g => g.type === 'bucket'); if (bk >= 0 && G.dispGot) G.dispGot[bk] = Math.min(G.s.goals[bk].got, G.dispGot[bk] + 1);
    after(200, () => updateHUD(true));
  }
  function animateTransform(st) {
    let dur = 300;
    const center = st.center >= 0 ? cellCenter(st.center) : null;
    if (st.combo) { callout(st.combo, true); Snd.combo(); shake(10); }
    if (st.rush) { callout("Sap's Running!", true); Snd.win(); }
    st.created.forEach((c, k) => {
      const delay = st.rush ? 350 + k * 80 : 120 + k * 30;
      dur = Math.max(dur, delay + 260);
      after(delay, () => {
        const sp = G.sprites.get(c.piece.id); if (!sp) return;
        const [cx, cy] = cellCenter(c.i);
        sp.k = c.piece.k; sp.flash = 1; sp.scale = 1.35;
        if (st.rush) {
          const mb = $('movesBox').getBoundingClientRect();
          G.fx.push({ kind: 'bolt', x0: mb.left + mb.width / 2, y0: mb.top + mb.height / 2, x1: cx, y1: cy, t0: G.t, dur: 260, color: '#ffe48a' });
          G.dispMoves = Math.max(0, G.dispMoves - 1); updateHUD(false); Snd.tick(k);
        } else if (center) {
          G.fx.push({ kind: 'bolt', x0: center[0], y0: center[1], x1: cx, y1: cy, t0: G.t, dur: 260, color: '#fff4dc' });
          Snd.tick(k);
        }
        burst(cx, cy, ['#fff6c0', '#ffd24a'], 6, L.cs * 4, { size: L.cs * 0.07, life: 0.4, kind: 'spark', g: 100 });
      });
    });
    if (st.rush && st.score) after(dur, () => updateHUD(false));
    return dur + (st.rush ? 250 : 120);
  }
  function blastFx(b) {
    const cs = L.cs, [cx, cy] = cellCenter(b.i);
    if (b.k === K.ROW || b.k === K.COL) {
      G.fx.push({ kind: 'beam', axis: b.k === K.ROW ? 'h' : 'v', x: cx, y: cy, t0: G.t, dur: 380 });
      for (const j of b.cells) { const [x, y] = cellCenter(j); burst(x, y, ['#fff', '#fff3b0'], 2, cs * 3, { size: cs * 0.07, life: 0.35, kind: 'spark', g: 0 }); }
      Snd.line(); shake(4); Snd.haptic(15);
    } else if (b.k === K.BURST) {
      const big = !!b.big;
      G.fx.push({ kind: 'ring', x: cx, y: cy, r0: cs * 0.3, r1: cs * (big ? 4.4 : 2.6), t0: G.t, dur: big ? 560 : 420, color: '#ffc94a', thick: true });
      G.fx.push({ kind: 'glow', x: cx, y: cy, r: cs * (big ? 4 : 2.4), t0: G.t, dur: 380 });
      burst(cx, cy, ['#ffe08a', '#ffb21e', '#e07a0c', '#fff'], big ? 50 : 26, cs * (big ? 11 : 7), { size: cs * 0.11, life: 0.7, kind: 'drop' });
      Snd.burst(); shake(big ? 14 : 8); Snd.haptic(big ? 40 : 22);
    } else if (b.k === K.CONE) {
      if (b.all) { G.fx.push({ kind: 'flash', t0: G.t, dur: 500 }); shake(18); }
      else if (!b.beam) for (const j of b.cells) { const [x, y] = cellCenter(j); G.fx.push({ kind: 'bolt', x0: cx, y0: cy, x1: x, y1: y, t0: G.t, dur: 300, color: '#fff4dc' }); }
      Snd.cone(); shake(8);
    }
  }
  function flyToGoal(t, x, y) {
    const k = G.s.goals.findIndex(g => g.type === 'collect' && g.t === t);
    const el = $('goals').children[k]; if (!el) return;
    const r = el.querySelector('canvas').getBoundingClientRect();
    G.fx.push({ kind: 'token', t, x0: x, y0: y, x1: r.left + r.width / 2, y1: r.top + r.height / 2, t0: G.t, dur: 520 + Math.random() * 160 });
  }

  // ---------------------------------------------------------------- win / lose
  function startWin() {
    G.ending = true; G.busy = true;
    const lv = G.lv;
    G.winLeft = G.s.movesLeft;
    G.themesBefore = THEMES.filter(themeUnlocked).length;
    if (lv.daily) recordDaily(1, G.s.score);
    else { save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, lv.id + 1)); save.stars[lv.id] = Math.max(save.stars[lv.id] || 0, 1); }
    writeSave();
    callout("Sugarin' Off!", true); Snd.win(); Snd.haptic(30);
    for (let k = 0; k < 4; k++) after(k * 180, () => burst(L.bx + Math.random() * L.bw, L.by + Math.random() * L.bh * 0.6, ['#ffc94a', '#ec4a1f', '#fff4dd', '#69c23a', '#a35ad6'], 24, L.cs * 8, { size: L.cs * 0.1, life: 1, kind: 'leaf', up: L.cs * 3 }));
    after(700, () => {
      const steps = R.sugarRush(G.s);
      runSteps(steps, () => after(500, showWin));
    });
  }
  function starsFor(score) {
    if (G.lv.daily) { const f = G.winLeft / G.lv.moves; return 1 + (f >= 0.25 ? 1 : 0) + (f >= 0.45 ? 1 : 0); } // daily: stars for moves to spare
    const st = G.lv.stars || [0, 1e9, 1e9]; return 1 + (score >= st[1] ? 1 : 0) + (score >= st[2] ? 1 : 0);
  }
  /** Save a daily win and advance the day streak. */
  function recordDaily(stars, score) {
    const key = G.lv.daily, prev = save.daily[key];
    save.daily[key] = { stars: Math.max(stars, prev ? prev.stars : 0), best: Math.max(score, prev ? prev.best : 0) };
    if (save.streakDay !== key) {
      save.streak = save.streakDay === yesterdayKey(key) ? save.streak + 1 : 1;
      save.streakDay = key;
      save.bestStreak = Math.max(save.bestStreak || 0, save.streak);
    }
  }
  function showWin() {
    G.fast = false;
    const lv = G.lv, s = G.s, stars = starsFor(s.score);
    const prevBest = lv.daily ? (save.daily[lv.daily] || {}).prevBest || 0 : save.best[lv.id] || 0;
    syncDisplay();
    if (lv.daily) recordDaily(stars, s.score);
    else { save.stars[lv.id] = Math.max(save.stars[lv.id] || 0, stars); save.best[lv.id] = Math.max(prevBest, s.score); }
    writeSave();
    updateHUD(false);
    openOverlay('win');
    $('winStars').classList.remove('hidden'); $('wReplay').textContent = 'Replay';
    const last = lv.id === LEVELS.length;
    $('winTitle').textContent = lv.daily ? 'Daily done!' : last ? 'You finished the year!' : ['Level clear!', 'Nicely done!', 'Wicked good!'][stars - 1];
    $('wNext').querySelector('.bt').textContent = lv.daily ? 'Done' : last ? 'Maple Path' : 'Next level';
    $('wMap').textContent = 'Maple Path'; $('wMap').classList.toggle('hidden', !!lv.daily);
    $('winSub').textContent = lv.daily ? `Day streak ${save.streak} · today's best ${fmt(save.daily[lv.daily].best)}${stars < 3 ? ' · replay for ★★★' : ''}` : s.score > prevBest && prevBest ? 'New best!' : 'Best ' + fmt(Math.max(prevBest, s.score));
    const newThemes = THEMES.filter(themeUnlocked).length > G.themesBefore ? THEMES.filter(themeUnlocked).slice(G.themesBefore) : [];
    $('winUnlock').textContent = newThemes.length ? 'New board unlocked: ' + newThemes.map(t => t.name).join(', ') + '!' : '';
    $('winUnlock').classList.toggle('hidden', !newThemes.length);
    const els = [...$('winStars').children]; els.forEach(e => e.classList.remove('on'));
    let shown = 0;
    const N = 24;
    for (let k = 0; k <= N; k++) after(k * 32, () => { $('winScore').textContent = fmt(Math.round(s.score * k / N)); if (k % 3 === 0) Snd.tick(k / 3); });
    for (let k = 0; k < stars; k++) after(500 + k * 380, () => { els[k].classList.add('on'); Snd.star(k); Snd.haptic(15); shown++; });
  }
  function showLose() {
    const el = $('loseGoals'); buildGoals(el, 46);
    syncDisplay(); refreshGoals(el, false);
    const left = G.s.goals.reduce((a, g) => a + (goalLeft(g, true) > 0 ? 1 : 0), 0);
    const prog = R.goalProgress(G.s);
    const miss = G.s.goals.filter(g => goalLeft(g, true) > 0);
    const words = miss.map(g => { const n = goalLeft(g, true); return g.type === 'collect' ? `${n} ${GOAL_WORD[g.t]}` : g.type === 'frost' ? `${n} frozen` : g.type === 'bucket' ? `${n} bucket${n > 1 ? 's' : ''}` : `${fmt(n)} points`; });
    const tip = miss.some(g => g.type === 'bucket') ? 'Tip: drag a bucket down when nothing else helps.' : miss.some(g => g.type === 'frost') ? 'Tip: line clearers crack a whole row of frost.' : 'Tip: make 4s and 5s, then swap two specials together.';
    $('loseSub').innerHTML = `<b class="near">${prog > 0.85 ? 'So close! ' : ''}Only ${words.join(' + ')} to go.</b><br>${tip}<br><small>Score ${fmt(G.s.score)}</small>`;
    $('lMap').textContent = G.lv.daily ? 'Home' : 'Maple Path';
    openOverlay('lose'); Snd.lose();
  }

  // ---------------------------------------------------------------- input
  function onDown(e) {
    Snd.unlock();
    if (G.screen !== 'game' || G.overlay) return;
    if (G.ending) { G.fast = true; return; } // tap to skip the end-of-level bonus
    if (G.tipUntil) hideTip();
    if (G.ptr) return; // a second finger is ignored
    const cell = cellAt(e.clientX, e.clientY);
    G.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, cell, used: false };
    try { boardC.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    noteInput();
  }
  function onMove(e) {
    const p = G.ptr;
    if (!p || e.pointerId !== p.id || p.used || p.cell < 0) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y, th = Math.max(9, L.cs * 0.28);
    if (dx * dx + dy * dy < th * th) { // rubber-band the piece toward the finger
      const q = G.s.p[p.cell], sp = q && !q.ice && !G.busy && G.sprites.get(q.id);
      if (sp) { const ax = Math.abs(dx) > Math.abs(dy); sp.drag = { x: ax ? dx / L.cs : 0, y: ax ? 0 : dy / L.cs }; G.dragSp = sp; }
      return;
    }
    let dragged = null;
    if (G.dragSp) { dragged = G.dragSp; dragged.x += dragged.drag.x * 0.8; dragged.y += dragged.drag.y * 0.8; dragged.drag = null; G.dragSp = null; }
    const settleBack = () => { if (dragged && !dragged.tw && !dragged.falling) { const q = G.s.p[p.cell]; if (q && q.id === dragged.id) tween(dragged, cellX(p.cell), cellY(p.cell), 120, easeOut); } };
    p.used = true;
    const s = G.s, x = cellX(p.cell), y = cellY(p.cell);
    let nx = x, ny = y;
    if (Math.abs(dx) > Math.abs(dy)) nx += dx > 0 ? 1 : -1; else ny += dy > 0 ? 1 : -1;
    const nb = ny * s.w + nx;
    const bad = nx < 0 || ny < 0 || nx >= s.w || ny >= s.h || s.hole[nb];
    if (bad) { const q = s.p[p.cell], sp = q && G.sprites.get(q.id); if (sp && !G.busy) { sp.wig = 1; Snd.bonk(); } settleBack(); return; }
    if (G.busy && !G.ending && !G.overlay) { G.queued = { a: p.cell, b: nb, t: G.t }; settleBack(); return; } // play it when the board settles
    attemptSwap(p.cell, nb);
    settleBack();
  }
  function onUp(e) {
    const p = G.ptr;
    if (!p || e.pointerId !== p.id) return;
    G.ptr = null;
    if (G.dragSp) { G.dragSp.drag = null; G.dragSp = null; }
    if (p.used || e.type !== 'pointerup' || p.cell < 0) return;
    tapCell(p.cell);
  }
  function tapCell(i) {
    if (G.ending || !G.s) return;
    const s = G.s;
    if (G.sel >= 0 && G.sel !== i && R.adjacent(s, G.sel, i)) {
      const a = G.sel; G.sel = -1;
      if (G.busy) { G.queued = { a, b: i, t: G.t }; Snd.click(); return; } // played when the board settles
      attemptSwap(a, i); return;
    }
    G.sel = G.sel === i ? -1 : i;
    if (G.sel >= 0) { Snd.click(); const sp = s.p[i] && G.sprites.get(s.p[i].id); if (sp) { sp.scale = 1.15; if (sp.ice) sp.wig = 1; } }
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (G.screen === 'game') { if (G.overlay === 'pause') closeOverlay(); else if (!G.overlay) openPause(); } return; }
    if (G.screen !== 'game' || G.overlay || !G.s) return;
    const s = G.s, dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key]) {
      e.preventDefault(); Snd.unlock(); noteInput();
      if (G.cursor < 0) { G.cursor = s.cols[Math.floor(s.w / 2)][Math.floor(s.cols[Math.floor(s.w / 2)].length / 2)]; return; }
      const [dx, dy] = dirs[e.key], x = cellX(G.cursor) + dx, y = cellY(G.cursor) + dy;
      if (x < 0 || y < 0 || x >= s.w || y >= s.h || s.hole[y * s.w + x]) return;
      const to = y * s.w + x;
      if (G.sel >= 0) { const a = G.sel; G.sel = -1; attemptSwap(a, to); G.cursor = to; } else G.cursor = to;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (G.cursor >= 0) { G.sel = G.sel === G.cursor ? -1 : G.cursor; Snd.click(); }
    }
  }

  // ---------------------------------------------------------------- update
  function tick(dt) {
    G.t += dt;
    // timers
    if (G.timers.length) {
      const due = G.timers.filter(t => t.at <= G.t && t.gen === G.gen);
      G.timers = G.timers.filter(t => t.at > G.t && t.gen === G.gen);
      for (const t of due) t.fn();
    }
    const sec = dt / 1000;
    if (G.hitstop > 0) G.hitstop -= dt;
    else updateSprites(sec);
    if (G.waits.length && settled()) { const w = G.waits.filter(x => x.gen === G.gen); G.waits = []; for (const x of w) x.fn(); }
    // particles
    for (const p of G.parts) { p.life += sec; p.vy += p.g * sec; p.x += p.vx * sec; p.y += p.vy * sec; p.vx *= 0.985; p.rot += p.vr * sec; }
    G.parts = G.parts.filter(p => p.life < p.max);
    G.fx = G.fx.filter(f => G.t - f.t0 < f.dur);
    if (G.screen === 'game' && G.lv) updateAmbient(sec);
    // idle life: now and then one piece gives a little hop
    if (G.screen === 'game' && G.s && !G.busy && !G.overlay) {
      G.hopT = (G.hopT || 0) - dt;
      if (G.hopT <= 0) {
        G.hopT = 700 + Math.random() * 1100;
        const list = [...G.sprites.values()].filter(sp => !sp.ice && sp.k !== K.BUCKET && sp.hop < 0 && !sp.falling);
        if (list.length) list[(Math.random() * list.length) | 0].hop = 0;
      }
    }
    G.shake *= Math.exp(-sec * 11); if (G.shake < 0.2) G.shake = 0;
    if (G.tipUntil && G.t > G.tipUntil) hideTip();
    // idle hint
    if (G.screen === 'game' && G.s && !G.busy && !G.ending && !G.overlay && !G.ptr) {
      G.idle += dt;
      if (G.idle > 6000 && !G.hint) { const ms = R.listMoves(G.s); G.hint = ms.length ? ms[(Math.random() * ms.length) | 0] : []; G.hintLevel = 1; }
      else if (G.idle > 12000 && G.hintLevel === 1) { G.hint = R.hintMove(G.s) || []; G.hintLevel = 2; }
    }
  }
  function updateSprites(sec) {
    const GRAV = 68, MAXV = 24;
    for (const sp of G.sprites.values()) {
      if (sp.tw) {
        const tw = sp.tw, p = clamp((G.t - tw.t0) / tw.dur, 0, 1), e = tw.ease(p);
        sp.x = lerp(tw.fx, tw.tx, e); sp.y = lerp(tw.fy, tw.ty, e);
        if (p >= 1) { sp.tw = null; if (tw.back) tween(sp, tw.back.x, tw.back.y, tw.back.dur, backOut); }
      }
      if (sp.falling) {
        if (sp.delay > 0) sp.delay -= sec;
        else {
          sp.vy = Math.min(MAXV, sp.vy + GRAV * sec); sp.y += sp.vy * sec;
          if (sp.y >= sp.ty) {
            sp.y = sp.ty;
            if (sp.vy > 6) { sp.sy = 1 - Math.min(0.22, sp.vy * 0.012); sp.sx = 2 - sp.sy; sp.vy = -sp.vy * 0.12; if (Math.random() < 0.15) Snd.land(); }
            else { sp.vy = 0; sp.falling = false; if (sp.exitOnLand) startExit(sp); }
          }
        }
      }
      sp.sx += (1 - sp.sx) * Math.min(1, sec * 14); sp.sy += (1 - sp.sy) * Math.min(1, sec * 14);
      if (sp.grow !== undefined) { sp.grow += sec / 0.28; sp.scale = backOut(clamp(sp.grow, 0, 1)); if (sp.grow >= 1) { delete sp.grow; sp.scale = 1; } }
      else if (sp.pop < 0) sp.scale += (1 - sp.scale) * Math.min(1, sec * 10);
      if (sp.flash > 0) sp.flash = Math.max(0, sp.flash - sec * 3.5);
      if (sp.wig > 0) sp.wig = Math.max(0, sp.wig - sec * 2.5);
      if (sp.hop >= 0) { sp.hop += sec; if (sp.hop > 0.5) sp.hop = -1; }
      if (sp.pop >= 0) {
        sp.pop += sec;
        const p = sp.pop;
        sp.scale = p < 0.07 ? 1 + p / 0.07 * 0.25 : 1.25 * Math.max(0, 1 - (p - 0.07) / 0.15);
        if (sp.popTo) { const k = Math.min(1, p / 0.2); sp.x = lerp(sp.x, sp.popTo[0], k * 0.35); sp.y = lerp(sp.y, sp.popTo[1], k * 0.35); }
        if (p > 0.22) G.sprites.delete(sp.id);
      }
      if (sp.exit >= 0) {
        sp.exit += sec; sp.alpha = Math.max(0, 1 - sp.exit / 0.35); sp.y = sp.ty + sp.exit * 2.2; sp.scale = 1 + sp.exit * 0.6;
        if (sp.exit > 0.35) G.sprites.delete(sp.id);
      }
    }
  }

  // ---------------------------------------------------------------- seasonal weather (behind the board)
  function updateAmbient(sec) {
    const season = G.lv.season, W = L.W, H = L.H;
    if (!G.amb) G.amb = [];
    const want = season === 'mud' ? 34 : 26;
    while (G.amb.length < want) {
      const p = { x: Math.random() * W, y: G.amb.length < want / 2 && !G.ambInit ? Math.random() * H : -20, r: Math.random(), ph: Math.random() * 6 };
      if (season === 'march') { p.vy = 18 + p.r * 22; p.vx = 6; p.size = 1.5 + p.r * 2.5; }
      else if (season === 'mud') { p.vy = 260 + p.r * 140; p.vx = -40; p.size = 9 + p.r * 9; }
      else if (season === 'summer') { p.vy = -6 - p.r * 10; p.vx = 12; p.size = 2 + p.r * 2; p.y = G.ambInit ? H + 10 : p.y; }
      else { p.vy = 30 + p.r * 30; p.vx = 14; p.size = 5 + p.r * 5; }
      G.amb.push(p);
    }
    G.ambInit = true;
    for (const p of G.amb) {
      p.ph += sec;
      p.x += (p.vx + Math.sin(p.ph * 1.3) * (season === 'mud' ? 0 : 14)) * sec; p.y += p.vy * sec;
      if (p.y > H + 30 || p.y < -40 || p.x > W + 30 || p.x < -30) { p.dead = true; }
    }
    G.amb = G.amb.filter(p => !p.dead);
  }
  function drawAmbient(c) {
    if (!G.amb) return;
    const season = G.lv.season;
    for (const p of G.amb) {
      if (season === 'march') { c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); }
      else if (season === 'mud') { c.strokeStyle = 'rgba(200,220,235,.45)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.size * 0.15, p.y + p.size); c.stroke(); }
      else if (season === 'summer') { c.fillStyle = `rgba(255,250,210,${0.45 + 0.4 * Math.sin(p.ph * 3)})`; c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); }
      else { c.save(); c.translate(p.x, p.y); c.rotate(p.ph * 1.5); A.leafPath(c, 0, 0, p.size); c.fillStyle = ['#e8501f', '#f2a51c', '#d4321a'][(p.r * 3) | 0]; c.fill(); c.restore(); }
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (G.screen === 'title') { renderTitle(); return; }
    if (G.screen !== 'game' || !G.s) return;
    const c = bx, cs = L.cs;
    c.clearRect(0, 0, L.W, L.H);
    c.save();
    if (G.shake) c.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    drawAmbient(c);
    c.drawImage(L.boardImg, L.bx - L.m, L.by - L.m, L.bw + 2 * L.m, L.bh + 2 * L.m);
    // hint, selection, cursor highlights
    const pulse = 0.5 + 0.5 * Math.sin(G.t / 160);
    const hl = (i, col, a) => { A.rr(c, L.bx + cellX(i) * cs + 2, L.by + cellY(i) * cs + 2, cs - 4, cs - 4, cs * 0.18); c.fillStyle = col.replace('A', a); c.fill(); };
    if (G.hint && !G.busy) G.hint.forEach(i => { hl(i, 'rgba(255,214,90,A)', 0.3 + 0.35 * pulse); A.rr(c, L.bx + cellX(i) * cs + 2, L.by + cellY(i) * cs + 2, cs - 4, cs - 4, cs * 0.18); c.lineWidth = 2 + 2 * pulse; c.strokeStyle = 'rgba(255,236,150,.95)'; c.stroke(); });
    if (G.ghost && G.ghost.m) G.ghost.m.forEach(i => hl(i, 'rgba(255,244,200,A)', 0.2 + 0.25 * pulse));
    if (G.sel >= 0) {
      hl(G.sel, 'rgba(255,236,160,A)', 0.55);
      A.rr(c, L.bx + cellX(G.sel) * cs + 2, L.by + cellY(G.sel) * cs + 2, cs - 4, cs - 4, cs * 0.18);
      c.lineWidth = 3 + 1.5 * pulse; c.strokeStyle = '#ffd23a'; c.stroke();
    }
    if (G.cursor >= 0) { A.rr(c, L.bx + cellX(G.cursor) * cs + 2, L.by + cellY(G.cursor) * cs + 2, cs - 4, cs - 4, cs * 0.18); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); }
    // pieces
    c.save(); c.clip(L.clip);
    const hintIds = G.hint && G.hint.length === 2 && !G.busy ? G.hint.map(i => G.s.p[i] && G.s.p[i].id) : [];
    for (const sp of G.sprites.values()) drawSprite(c, sp, hintIds);
    c.restore();
    drawFx(c);
    c.restore();
    // particles and text over everything (not shaken twice)
    drawParts(c);
    drawTexts(c);
    if (G.ghost) drawGhost(c);
    if (G.ending && !G.overlay && G.s.won && !G.fast) { c.globalAlpha = 0.6 + 0.3 * Math.sin(G.t / 250); outlinedText(c, 'Tap to skip', L.bx + L.bw / 2, Math.min(L.H - 24, L.by + L.bh + 34), 18, '#fff4dd'); c.globalAlpha = 1; }
  }
  function drawSprite(c, sp, hintIds) {
    const cs = L.cs;
    let ox = 0, oy = 0;
    if (hintIds.length === 2 && hintIds.includes(sp.id)) { // nudge toward the partner
      const other = G.sprites.get(hintIds[0] === sp.id ? hintIds[1] : hintIds[0]);
      if (other) { const w = Math.max(0, Math.sin(G.t / 130)) * 0.1; ox = (other.x - sp.x) * w; oy = (other.y - sp.y) * w; }
    }
    if (sp.wig) ox += Math.sin(G.t / 18) * 0.06 * sp.wig;
    if (sp.drag) { ox += sp.drag.x * 0.8; oy += sp.drag.y * 0.8; }
    const selected = G.sel >= 0 && G.s.p[G.sel] && G.s.p[G.sel].id === sp.id;
    if (selected) oy -= 0.08 + 0.05 * Math.abs(Math.sin(G.t / 150));
    let hx = 1, hy = 1;
    if (sp.hop >= 0) { // anticipation squash, hop, land squash
      const h = sp.hop / 0.5;
      if (h < 0.18) { hy = 1 - 0.12 * Math.sin(h / 0.18 * Math.PI); }
      else if (h < 0.82) { oy -= 0.13 * Math.sin((h - 0.18) / 0.64 * Math.PI); hy = 1.05; }
      else hy = 1 - 0.08 * Math.sin((h - 0.82) / 0.18 * Math.PI);
      hx = 2 - hy;
    }
    const x = L.bx + (sp.x + 0.5 + ox) * cs, y = L.by + (sp.y + 0.5 + oy) * cs;
    c.save();
    c.translate(x, y + (1 - sp.sy * hy) * cs * 0.4);
    c.scale(sp.scale * sp.sx * hx, sp.scale * sp.sy * hy);
    c.globalAlpha = sp.alpha;
    const special = sp.k >= K.ROW && sp.k <= K.CONE;
    if (special) A.specialUnder(c, sp.k, 0, 0, cs, G.t / 1000 + sp.phase, sp.t);
    const img = L.sp[sp.k === K.CONE ? 'cone' : sp.k === K.BUCKET ? 'bucket' : sp.t], S = L.sp.size;
    if (sp.k === K.BUCKET) { const r = cs * (0.5 + 0.04 * Math.sin(G.t / 220)); c.fillStyle = A.rg(c, 0, 0, 0, r, [[0, 'rgba(255,220,110,.75)'], [1, 'rgba(255,200,80,0)']]); c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); }
    if (img) c.drawImage(img, -S / 2, -S / 2, S, S);
    if (special) A.specialOver(c, sp.k, 0, 0, cs, G.t / 1000 + sp.phase);
    if (sp.ice) A.drawIce(c, 0, 0, cs, sp.ice);
    if (sp.k === K.BUCKET && !sp.exitOnLand && sp.exit < 0) { // little down arrow
      const b = Math.sin(G.t / 200) * cs * 0.04;
      c.fillStyle = 'rgba(255,240,180,.9)'; c.strokeStyle = A.INK; c.lineWidth = cs * 0.03;
      c.beginPath(); c.moveTo(-cs * 0.12, cs * 0.36 + b); c.lineTo(cs * 0.12, cs * 0.36 + b); c.lineTo(0, cs * 0.5 + b); c.closePath(); c.fill(); c.stroke();
    }
    if (sp.flash > 0 && img) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = sp.flash * 0.55; c.drawImage(img, -S / 2, -S / 2, S, S); }
    c.restore();
  }
  function drawFx(c) {
    const cs = L.cs;
    for (const f of G.fx) {
      const p = clamp((G.t - f.t0) / f.dur, 0, 1);
      if (f.kind === 'beam') {
        const a = 1 - p, wid = cs * (0.55 + 0.3 * Math.sin(p * Math.PI)) * a;
        c.save(); c.globalCompositeOperation = 'lighter';
        if (f.axis === 'h') { c.fillStyle = A.lg(c, 0, f.y - wid, 0, f.y + wid, [[0, 'rgba(255,220,120,0)'], [0.5, `rgba(255,250,225,${a})`], [1, 'rgba(255,220,120,0)']]); c.fillRect(L.bx - cs * 0.3, f.y - wid, L.bw + cs * 0.6, wid * 2); }
        else { c.fillStyle = A.lg(c, f.x - wid, 0, f.x + wid, 0, [[0, 'rgba(255,220,120,0)'], [0.5, `rgba(255,250,225,${a})`], [1, 'rgba(255,220,120,0)']]); c.fillRect(f.x - wid, L.by - cs * 0.3, wid * 2, L.bh + cs * 0.6); }
        c.restore();
      } else if (f.kind === 'ring') {
        const r = lerp(f.r0, f.r1, easeOut(p));
        c.beginPath(); c.arc(f.x, f.y, r, 0, 7); c.lineWidth = (f.thick ? cs * 0.28 : cs * 0.1) * (1 - p); c.strokeStyle = f.color; c.globalAlpha = 1 - p; c.stroke(); c.globalAlpha = 1;
      } else if (f.kind === 'glow') {
        c.save(); c.globalCompositeOperation = 'lighter';
        c.fillStyle = A.rg(c, f.x, f.y, 0, f.r, [[0, `rgba(255,230,150,${0.8 * (1 - p)})`], [1, 'rgba(255,200,80,0)']]);
        c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.fill(); c.restore();
      } else if (f.kind === 'flash') {
        c.fillStyle = `rgba(255,248,225,${0.55 * (1 - p)})`; c.fillRect(-20, -20, L.W + 40, L.H + 40);
      } else if (f.kind === 'bolt') {
        const e = easeOut(Math.min(1, p * 1.6)), x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e);
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p * 0.8;
        c.beginPath(); c.moveTo(f.x0, f.y0);
        const mx = (f.x0 + x) / 2 + Math.sin(f.t0 + p * 20) * cs * 0.2, my = (f.y0 + y) / 2 + Math.cos(f.t0 + p * 20) * cs * 0.2;
        c.quadraticCurveTo(mx, my, x, y); c.lineWidth = cs * 0.12; c.strokeStyle = f.color; c.lineCap = 'round'; c.stroke();
        c.lineWidth = cs * 0.04; c.strokeStyle = '#fff'; c.stroke();
        A.sparkle(c, x, y, cs * 0.18);
        c.restore();
      }
    }
  }
  function drawParts(c) {
    for (const p of G.parts) {
      const a = 1 - p.life / p.max;
      c.globalAlpha = Math.max(0, a);
      if (p.kind === 'leaf') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); A.leafPath(c, 0, 0, p.size * 1.3); c.fillStyle = p.color; c.fill(); c.restore(); }
      else if (p.kind === 'shard') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7); c.restore(); }
      else if (p.kind === 'spark') { A.sparkle(c, p.x, p.y, p.size * 1.4 * (0.5 + a * 0.5)); }
      else if (p.kind === 'drop') { c.beginPath(); c.arc(p.x, p.y, p.size * (0.6 + a * 0.4), 0, 7); c.fillStyle = p.color; c.fill(); }
      else { c.beginPath(); c.arc(p.x, p.y, p.size * a + 0.5, 0, 7); c.fillStyle = p.color; c.fill(); }
    }
    c.globalAlpha = 1;
  }
  function outlinedText(c, text, x, y, size, fill, stroke) {
    c.font = `700 ${size}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = Math.max(3, size * 0.16); c.strokeStyle = stroke || A.INK; c.strokeText(text, x, y);
    c.fillStyle = fill; c.fillText(text, x, y);
  }
  function drawTexts(c) {
    const cs = L.cs, cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2;
    for (const f of G.fx) {
      const p = clamp((G.t - f.t0) / f.dur, 0, 1);
      if (f.kind === 'float') {
        c.globalAlpha = 1 - Math.max(0, p - 0.7) / 0.3;
        const pop = p < 0.12 ? 0.7 + p / 0.12 * 0.45 : p < 0.22 ? 1.15 - (p - 0.12) : 1.05;
        outlinedText(c, f.text, f.x, f.y - p * cs * 0.9, Math.round(cs * 0.5 * pop), f.color);
        c.globalAlpha = 1;
      } else if (f.kind === 'callout') {
        const sIn = backOut(clamp(p / 0.22, 0, 1)), fade = 1 - clamp((p - 0.75) / 0.25, 0, 1);
        const size = Math.min(L.bw / Math.max(6, f.text.length * 0.62), cs * (f.big ? 1.15 : 0.9));
        c.save(); c.translate(cx, L.by + L.bh * 0.24 - p * cs * 0.3); c.rotate(-0.06); c.scale(sIn, sIn); c.globalAlpha = fade;
        const g = c.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, '#fff6c4'); g.addColorStop(0.5, '#ffc22e'); g.addColorStop(1, '#ee7a12');
        outlinedText(c, f.text, 0, 0, size, g);
        c.restore();
      } else if (f.kind === 'token') {
        const e = easeInOut(p), x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(p * Math.PI) * cs * 1.2;
        const S = L.sp.size * (0.8 - 0.4 * p);
        c.globalAlpha = p > 0.9 ? (1 - p) * 10 : 1;
        c.drawImage(L.sp[f.t], x - S / 2, y - S / 2, S, S); c.globalAlpha = 1;
      } else if (f.kind === 'intro') {
        const inP = easeOut(clamp(p / 0.15, 0, 1)), out = clamp((p - 0.8) / 0.2, 0, 1);
        const w = Math.min(L.bw * 0.92, 340), lh = 26, h = 70 + f.lines.length * lh;
        const hudB = $('hud').getBoundingClientRect().bottom, room = L.by - hudB - 16;
        const iy = !L.land && room > h ? hudB + 8 + room / 2 : cy;
        c.save(); c.translate(cx, iy + (1 - inP) * -40 - out * 40); c.globalAlpha = inP * (1 - out);
        A.rr(c, -w / 2, -h / 2, w, h, 22); c.fillStyle = 'rgba(255,247,230,.96)'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = A.INK; c.stroke();
        outlinedText(c, f.title + ' · ' + G.lv.name, 0, -h / 2 + 32, 26, '#d8452a', 'rgba(0,0,0,0)');
        c.font = '700 18px Rubik, sans-serif'; c.fillStyle = A.INK; c.textAlign = 'center';
        f.lines.forEach((t, k) => c.fillText(t, 0, -h / 2 + 66 + k * lh));
        c.restore();
      }
    }
  }
  function drawGhost(c) {
    const m = G.ghost.m; if (!m) return;
    const t = ((G.t - G.ghost.t0) / 1400) % 1;
    const [x0, y0] = cellCenter(m[0]), [x1, y1] = cellCenter(m[1]);
    const e = easeInOut(clamp((t - 0.2) / 0.5, 0, 1));
    const x = lerp(x0, x1, e), y = lerp(y0, y1, e), a = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
    const cs = L.cs;
    // a pulsing touch ring on the piece, and a translucent hand whose fingertip sits on it from below-right
    c.save(); c.globalAlpha = a;
    c.beginPath(); c.arc(x, y, cs * (0.2 + 0.12 * (1 - e)), 0, 7); c.strokeStyle = 'rgba(255,236,150,.95)'; c.lineWidth = 4; c.stroke();
    c.translate(x + cs * 0.05, y + cs * 0.05); c.rotate(-0.45); c.globalAlpha = a * 0.82;
    const u = cs * 0.9;
    c.beginPath();
    c.moveTo(-u * 0.09, 0); c.quadraticCurveTo(-u * 0.09, -u * 0.1, 0, -u * 0.1); c.quadraticCurveTo(u * 0.09, -u * 0.1, u * 0.09, 0); // fingertip
    c.lineTo(u * 0.09, u * 0.42); c.quadraticCurveTo(u * 0.2, u * 0.36, u * 0.28, u * 0.44); c.quadraticCurveTo(u * 0.36, u * 0.4, u * 0.42, u * 0.5); // knuckles
    c.quadraticCurveTo(u * 0.5, u * 0.48, u * 0.52, u * 0.6); c.lineTo(u * 0.5, u * 0.88); c.quadraticCurveTo(u * 0.36, u * 1.08, u * 0.1, u * 1.04);
    c.quadraticCurveTo(-u * 0.12, u * 0.98, -u * 0.22, u * 0.7); c.lineTo(-u * 0.32, u * 0.48); c.quadraticCurveTo(-u * 0.3, u * 0.38, -u * 0.2, u * 0.42); c.lineTo(-u * 0.09, u * 0.56); c.closePath();
    c.fillStyle = '#fff7e6'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = A.INK; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }

  // ---------------------------------------------------------------- title art
  const floaters = [];
  function renderTitle() {
    const c = tx, W = L.W, H = L.H;
    c.clearRect(0, 0, W, H);
    if (!floaters.length) for (let k = 0; k < 10; k++) floaters.push({ x: (k % 2 ? 0.08 + Math.random() * 0.17 : 0.75 + Math.random() * 0.17) * W, y: Math.random() * H, v: 20 + Math.random() * 30, k: k % 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, s: 0.55 + Math.random() * 0.5 });
    for (const f of floaters) {
      const fs = Math.min(0.05, (G.frameDt || 16) / 1000); f.y -= f.v * fs; f.r += f.vr * fs;
      if (f.y < -80) { f.y = H + 60; f.x = (Math.random() < 0.5 ? 0.08 + Math.random() * 0.17 : 0.75 + Math.random() * 0.17) * W; }
      const S = L.titleSp.size * f.s;
      c.save(); c.globalAlpha = 0.7; c.translate(f.x, f.y); c.rotate(Math.sin(f.r) * 0.4); c.drawImage(L.titleSp[f.k], -S / 2, -S / 2, S, S); c.restore();
    }
  }

  // ---------------------------------------------------------------- misc UI
  function updateToggles() {
    const sfx = save.sfx ? 'on' : 'off', mus = save.music ? 'on' : 'off';
    ['btnSound', 'pSound'].forEach(id => { $(id).textContent = 'Sound: ' + sfx; });
    ['btnMusic', 'pMusic'].forEach(id => { $(id).textContent = 'Music: ' + mus; });
    $('btnSnd').classList.toggle('off', !save.sfx && !save.music);
  }
  function toggleSfx() { save.sfx = !save.sfx; Snd.setSfx(save.sfx); writeSave(); updateToggles(); Snd.click(); }
  function toggleMusic() { save.music = !save.music; Snd.setMusic(save.music); writeSave(); updateToggles(); Snd.click(); }
  function toggleAll() { const on = !(save.sfx || save.music); save.sfx = on; save.music = on; Snd.setSfx(on); Snd.setMusic(on); writeSave(); updateToggles(); Snd.click(); }
  function openPause() {
    if (!G.s || G.ending || G.overlay || G.screen !== 'game') return;
    buildGoals($('pauseGoals'), 42);
    openOverlay('pause');
  }

  // ---------------------------------------------------------------- loop + boot
  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (!G.frozen && G.overlay !== 'pause') { // pause really pauses; a tap during the bonus fast-forwards it
      if (G.fast && G.ending && !G.overlay) for (let k = 0; k < 8; k++) tick(dt); else tick(dt);
    }
    G.frameDt = dt;
    render();
    requestAnimationFrame(frame);
  }
  function boot() {
    app = $('app'); bgC = $('bg'); bgX = bgC.getContext('2d'); boardC = $('board'); bx = boardC.getContext('2d'); titleC = $('titleArt'); tx = titleC.getContext('2d');
    loadSave();
    Snd.setSfx(save.sfx); Snd.setMusic(save.music);
    if (/[?&]art=1/.test(location.search)) { // painted art (see IMAGE-PROMPTS.md)
      ['piece0', 'piece1', 'piece2', 'piece3', 'piece4', 'piece5', 'cone', 'bucket', 'bg_march', 'bg_mud', 'bg_summer', 'bg_october'].forEach(k => {
        const im = new Image(); im.onload = () => { A.ASSETS[k] = im; layout(true); }; im.src = 'assets/' + k + '.png';
      });
    }
    layout(true);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => layout(false), 120); });
    window.addEventListener('orientationchange', () => { clearTimeout(rt); rt = setTimeout(() => layout(true), 300); });
    boardC.addEventListener('pointerdown', onDown);
    boardC.addEventListener('pointermove', onMove);
    boardC.addEventListener('pointerup', onUp);
    boardC.addEventListener('pointercancel', onUp);
    boardC.addEventListener('lostpointercapture', onUp);
    $('game').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    $('title').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { G.ptr = null; Snd.suspend(); if (!G.noPause) openPause(); } else { Snd.resume(); last = 0; }
    });
    window.addEventListener('blur', () => { G.ptr = null; if (G.dragSp) { G.dragSp.drag = null; G.dragSp = null; } });
    ['pointerdown', 'keydown', 'touchend'].forEach(t => window.addEventListener(t, () => Snd.unlock(), { capture: true, passive: true }));
    $('tip').addEventListener('pointerdown', hideTip);
    // title
    $('btnPlay').addEventListener('click', () => { Snd.click(); startLevel(nextLevelId()); });
    $('btnMap').addEventListener('click', () => { Snd.click(); showScreen('map'); });
    $('btnDaily').addEventListener('click', () => { Snd.click(); startDaily(); });
    $('btnBoil').addEventListener('click', () => { Snd.click(); startBoil(); });
    $('btnThemes').addEventListener('click', () => { Snd.click(); openThemes(); });
    $('thClose').addEventListener('click', () => { Snd.click(); $('themes').classList.add('hidden'); });
    $('btnSound').addEventListener('click', toggleSfx);
    $('btnMusic').addEventListener('click', toggleMusic);
    $('mapHome').addEventListener('click', () => { Snd.click(); showScreen('title'); });
    // game
    $('btnPause').addEventListener('click', () => { Snd.click(); openPause(); });
    $('btnSnd').addEventListener('click', toggleAll);
    $('pResume').addEventListener('click', () => { Snd.click(); closeOverlay(); });
    $('pRestart').addEventListener('click', () => { Snd.click(); if (G.lv.boil) startBoil(); else if (G.lv.daily) startDaily(); else startLevel(G.lv.id); });
    $('pSound').addEventListener('click', toggleSfx);
    $('pMusic').addEventListener('click', toggleMusic);
    $('pMap').addEventListener('click', () => { Snd.click(); showScreen('map'); });
    $('wNext').addEventListener('click', () => { Snd.click(); if (G.lv.boil) startBoil(); else if (G.lv.daily) showScreen('title'); else if (G.lv.id >= LEVELS.length) showScreen('map'); else startLevel(G.lv.id + 1); });
    $('wReplay').addEventListener('click', () => { Snd.click(); if (G.lv.boil) showScreen('title'); else if (G.lv.daily) startDaily(); else startLevel(G.lv.id); });
    $('wMap').addEventListener('click', () => { Snd.click(); showScreen(G.lv.daily ? 'title' : 'map'); });
    $('lRetry').addEventListener('click', () => { Snd.click(); if (G.lv.daily) startDaily(); else startLevel(G.lv.id); });
    $('lMap').addEventListener('click', () => { Snd.click(); showScreen(G.lv.daily ? 'title' : 'map'); });
    updateToggles();
    showScreen('title');
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hooks
  window.__T = {
    start(id, seed) { startLevel(id || 1, seed || 12345); return this.state(); },
    step(ms) { let n = ms || 16; while (n > 0) { const d = Math.min(16, n); tick(d); n -= d; } render(); return this.state(); },
    state() {
      const s = G.s;
      const base = { screen: G.screen, overlay: G.overlay };
      if (!s) return base;
      const board = []; for (let y = 0; y < s.h; y++) { const row = []; for (let x = 0; x < s.w; x++) { const q = s.p[y * s.w + x]; row.push(s.hole[y * s.w + x] ? '#' : !q ? '.' : q.k === K.CONE ? 'C' : q.k === K.BUCKET ? 'B' : q.t + ['', 'r', 'c', 'b'][q.k] + (q.ice ? 'i' + q.ice : '')); } board.push(row.join(' ')); }
      return Object.assign(base, { level: G.lv.id, moves: s.movesLeft, dispMoves: G.dispMoves, score: s.score, goals: s.goals.map(g => ({ type: g.type, t: g.t, n: g.n, got: g.got, left: goalLeft(g, true) })), dispScore: G.dispScore, busy: G.busy, ending: G.ending, won: s.won, lost: s.lost, sel: G.sel, hint: G.hint, idle: Math.round(G.idle), sprites: G.sprites.size, parts: G.parts.length, desyncs: G.desyncs || 0, board, cs: L.cs, bx: L.bx, by: L.by });
    },
    /** client-space centre of cell (x, y) - for synthetic pointer tests */
    cellPos(x, y) { return { x: L.bx + (x + 0.5) * L.cs, y: L.by + (y + 0.5) * L.cs }; },
    swap(a, b) { attemptSwap(a, b); return this.state(); },
    moves() { return R.listMoves(G.s); },
    hint() { return R.hintMove(G.s); },
    win() { G.s.goals.forEach(g => { g.got = g.n; }); if (G.s.goals.some(g => g.type === 'score')) G.s.score = Math.max(G.s.score, G.s.goals.find(g => g.type === 'score').n); G.s.won = true; startWin(); },
    lose() { G.s.movesLeft = 0; G.s.lost = true; G.ending = true; showLose(); },
    give(cell, k) { const q = G.s.p[cell]; q.k = k; if (k === K.CONE) q.t = -1; const sp = G.sprites.get(q.id); sp.k = k; sp.t = q.t; },
    screen(n) { showScreen(n); },
    freeze(on) { G.frozen = on !== false; },
    layout: L, G, R, save,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
