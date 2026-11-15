/* Maple Match - code-drawn art. Every image has an ASSETS key; drop a PNG into assets/<key>.png and load
 * the page with ?art=1 to use painted art instead (see IMAGE-PROMPTS.md). */
(function (root) {
  'use strict';
  const INK = '#2b1610';
  // main colour per piece type, used for particles and UI chips
  const COLORS = ['#a35ad6', '#ecd3ac', '#d9301c', '#ffc62e', '#69c23a', '#3aa6e0'];
  const LIGHT = ['#e7c4ff', '#fff6e6', '#ffa08a', '#fff1a8', '#d6ffb0', '#c9ecff'];
  const ASSETS = {}; // key -> HTMLImageElement once loaded

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(s[0], s[1])); return g; }
  function rg(c, x, y, r0, r1, stops, x1, y1) { const g = c.createRadialGradient(x, y, r0, x1 === undefined ? x : x1, y1 === undefined ? y : y1, r1); stops.forEach(s => g.addColorStop(s[0], s[1])); return g; }
  function ink(c, w) { c.lineWidth = w || 0.075; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  function shadow(c, y, rx) { c.save(); c.beginPath(); c.ellipse(0, y, rx, rx * 0.22, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(20,6,0,.28)'; c.fill(); c.restore(); }
  function shine(c, x, y, rx, ry, rot, a) { c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); c.fillStyle = `rgba(255,255,255,${a || 0.55})`; c.fill(); c.restore(); }
  // deterministic sprinkle positions
  function prand(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------------------------------------------------------------- pieces (unit space: -1..1 fills the cell)
  function creemee(c) {
    shadow(c, 0.9, 0.34);
    // waffle cone
    c.beginPath(); c.moveTo(-0.44, 0.06); c.lineTo(0.44, 0.06); c.lineTo(0.04, 0.94); c.quadraticCurveTo(0, 0.98, -0.04, 0.94); c.closePath();
    c.fillStyle = lg(c, -0.4, 0, 0.4, 0.9, [[0, '#f4c27a'], [0.6, '#d58f42'], [1, '#a9662a']]); c.fill();
    c.save(); c.clip(); c.strokeStyle = 'rgba(120,60,20,.55)'; c.lineWidth = 0.045;
    for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(k * 0.18 - 0.5, 0); c.lineTo(k * 0.18 + 0.5, 1); c.stroke(); c.beginPath(); c.moveTo(k * 0.18 + 0.5, 0); c.lineTo(k * 0.18 - 0.5, 1); c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(-0.44, 0.06); c.lineTo(0.44, 0.06); c.lineTo(0.04, 0.94); c.quadraticCurveTo(0, 0.98, -0.04, 0.94); c.closePath(); ink(c);
    // soft-serve swirl, three tiers and a curl
    const tier = (y, rx, ry) => { c.beginPath(); c.ellipse(0, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = lg(c, 0, y - ry, 0, y + ry, [[0, '#dcaaf5'], [0.55, '#a35ad6'], [1, '#6e2f9c']]); c.fill(); ink(c); };
    tier(0.0, 0.6, 0.2);
    tier(-0.27, 0.47, 0.18);
    tier(-0.5, 0.32, 0.15);
    c.beginPath(); c.moveTo(-0.14, -0.6); c.quadraticCurveTo(-0.02, -0.92, 0.18, -0.8); c.quadraticCurveTo(0.12, -0.66, 0.12, -0.6); c.closePath();
    c.fillStyle = lg(c, 0, -0.9, 0, -0.6, [[0, '#e6c0fb'], [1, '#9b4fc9']]); c.fill(); ink(c);
    shine(c, -0.28, -0.04, 0.16, 0.05, -0.15, 0.6); shine(c, -0.2, -0.31, 0.12, 0.04, -0.15, 0.6); shine(c, -0.1, -0.53, 0.08, 0.03, -0.2, 0.6);
    // black raspberry seeds
    c.fillStyle = 'rgba(70,20,90,.55)';
    [[0.25, 0.02], [0.4, -0.03], [0.18, -0.28], [0.32, -0.25], [0.12, -0.5]].forEach(p => { c.beginPath(); c.arc(p[0], p[1], 0.03, 0, 7); c.fill(); });
  }
  function donut(c) {
    shadow(c, 0.86, 0.6);
    const ring = (ro, ri) => { c.beginPath(); c.arc(0, 0, ro, 0, Math.PI * 2); c.moveTo(ri, 0); c.arc(0, 0, ri, 0, Math.PI * 2, true); };
    ring(0.82, 0.27);
    c.fillStyle = rg(c, -0.2, -0.25, 0.1, 0.95, [[0, '#f0bf86'], [0.6, '#cf8645'], [1, '#93531f']]); c.fill('evenodd');
    // cinnamon-sugar crust, speckled
    c.save(); ring(0.76, 0.32); c.clip('evenodd');
    c.fillStyle = rg(c, -0.25, -0.3, 0.05, 0.9, [[0, 'rgba(255,250,238,.95)'], [0.65, 'rgba(250,232,205,.85)'], [1, 'rgba(240,215,180,.5)']]); c.fillRect(-1, -1, 2, 2);
    for (let i = 0; i < 60; i++) {
      const a = prand(i) * Math.PI * 2, r = 0.32 + prand(i + 99) * 0.44;
      c.fillStyle = i % 3 ? 'rgba(255,255,255,.95)' : 'rgba(150,80,30,.75)';
      c.fillRect(Math.cos(a) * r, Math.sin(a) * r, 0.035, 0.035);
    }
    c.restore();
    ring(0.82, 0.27); c.lineWidth = 0.075; c.strokeStyle = INK; c.stroke();
    // hole lip shading
    c.beginPath(); c.arc(0, 0, 0.33, Math.PI * 0.1, Math.PI * 0.95); c.strokeStyle = 'rgba(90,40,10,.45)'; c.lineWidth = 0.08; c.stroke();
    c.beginPath(); c.arc(0, 0, 0.68, Math.PI * 1.1, Math.PI * 1.55); c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = 0.08; c.stroke();
  }
  const LEAF_R = [[0, -0.95], [0.12, -0.6], [0.3, -0.7], [0.22, -0.32], [0.6, -0.52], [0.56, -0.36], [0.92, -0.3], [0.66, -0.1], [0.8, 0.04], [0.44, 0.14], [0.5, 0.4], [0.06, 0.3]];
  const LEAF = LEAF_R.concat(LEAF_R.slice().reverse().map(p => [-p[0], p[1]]).filter(p => p[0] !== 0));
  function leafPath(c, sx, sy, s) {
    c.beginPath();
    LEAF.forEach((p, i) => { const x = sx + p[0] * s, y = sy + p[1] * s; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.closePath();
  }
  function leaf(c) {
    shadow(c, 0.88, 0.4);
    c.save(); c.translate(0, 0.04);
    c.beginPath(); c.moveTo(0, 0.25); c.quadraticCurveTo(0.02, 0.6, 0.12, 0.86); c.lineWidth = 0.2; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
    c.lineWidth = 0.08; c.strokeStyle = '#8a2a10'; c.stroke();
    leafPath(c, 0, 0, 1);
    c.fillStyle = rg(c, -0.25, -0.35, 0.05, 1.1, [[0, '#ff7a5c'], [0.45, '#d9301c'], [1, '#9c1a0c']]); c.fill();
    c.lineWidth = 0.075; c.strokeStyle = INK; c.lineJoin = 'miter'; c.miterLimit = 3; c.stroke();
    c.strokeStyle = 'rgba(90,10,4,.55)'; c.lineWidth = 0.045; c.lineCap = 'round';
    [[0, -0.72], [0.74, -0.26], [-0.74, -0.26], [0.42, 0.3], [-0.42, 0.3]].forEach(p => { c.beginPath(); c.moveTo(0, 0.24); c.lineTo(p[0], p[1]); c.stroke(); });
    shine(c, -0.3, -0.3, 0.16, 0.06, -0.7, 0.45);
    c.restore();
  }
  function jug(c) {
    shadow(c, 0.9, 0.5);
    // handle loop
    c.beginPath(); c.moveTo(0.18, -0.42); c.bezierCurveTo(0.45, -0.85, 0.9, -0.6, 0.55, -0.12);
    c.lineWidth = 0.26; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 0.13; c.strokeStyle = '#f2b326'; c.stroke();
    // body
    c.beginPath();
    c.moveTo(-0.18, -0.5); c.lineTo(-0.18, -0.42); c.quadraticCurveTo(-0.6, -0.36, -0.6, -0.05);
    c.lineTo(-0.6, 0.72); c.quadraticCurveTo(-0.6, 0.9, -0.42, 0.9); c.lineTo(0.42, 0.9); c.quadraticCurveTo(0.6, 0.9, 0.6, 0.72);
    c.lineTo(0.6, -0.05); c.quadraticCurveTo(0.6, -0.36, 0.18, -0.42); c.lineTo(0.18, -0.5); c.closePath();
    c.fillStyle = lg(c, -0.6, 0, 0.6, 0, [[0, '#c9780c'], [0.3, '#ffd451'], [0.55, '#ffc22a'], [1, '#b8660a']]); c.fill(); ink(c);
    // plain cream label with one dark line
    rr(c, -0.4, 0.12, 0.8, 0.5, 0.1); c.fillStyle = '#fff3d6'; c.fill(); c.lineWidth = 0.05; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(-0.22, 0.37); c.lineTo(0.22, 0.37); c.lineWidth = 0.07; c.lineCap = 'round'; c.strokeStyle = 'rgba(43,22,16,.8)'; c.stroke();
    // cap
    rr(c, -0.24, -0.78, 0.48, 0.3, 0.07); c.fillStyle = lg(c, 0, -0.78, 0, -0.48, [[0, '#c44a2a'], [1, '#7c2412']]); c.fill(); ink(c, 0.065);
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 0.03; for (let k = -0.15; k <= 0.16; k += 0.1) { c.beginPath(); c.moveTo(k, -0.74); c.lineTo(k, -0.53); c.stroke(); }
    shine(c, -0.42, -0.02, 0.06, 0.22, 0, 0.6);
  }
  function apple(c) {
    shadow(c, 0.88, 0.55);
    c.beginPath(); c.moveTo(0, -0.5);
    c.bezierCurveTo(0.42, -0.82, 0.98, -0.5, 0.86, 0.12);
    c.bezierCurveTo(0.76, 0.66, 0.36, 0.92, 0.12, 0.8); c.quadraticCurveTo(0, 0.76, -0.12, 0.8);
    c.bezierCurveTo(-0.36, 0.92, -0.76, 0.66, -0.86, 0.12);
    c.bezierCurveTo(-0.98, -0.5, -0.42, -0.82, 0, -0.5); c.closePath();
    c.fillStyle = rg(c, -0.3, -0.25, 0.05, 1.1, [[0, '#e9ffb0'], [0.35, '#86d443'], [0.8, '#3f9420'], [1, '#2d7414']]); c.fill(); ink(c);
    // red blush so it still reads as an apple
    c.save(); c.clip(); c.beginPath(); c.ellipse(0.45, 0.35, 0.4, 0.32, 0.4, 0, 7); c.fillStyle = 'rgba(200,60,30,.22)'; c.fill(); c.restore();
    c.beginPath(); c.moveTo(0, -0.45); c.quadraticCurveTo(0.02, -0.75, 0.12, -0.9); c.lineWidth = 0.17; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 0.07; c.strokeStyle = '#7a4a1e'; c.stroke();
    c.beginPath(); c.moveTo(0.08, -0.7); c.quadraticCurveTo(0.35, -1.0, 0.62, -0.78); c.quadraticCurveTo(0.35, -0.58, 0.08, -0.7); c.closePath();
    c.fillStyle = lg(c, 0.1, -0.9, 0.6, -0.7, [[0, '#6ad04a'], [1, '#2e8a22']]); c.fill(); ink(c, 0.06);
    shine(c, -0.42, -0.2, 0.13, 0.22, 0.5, 0.6);
  }
  function pinecone(c) {
    shadow(c, 0.9, 0.42);
    // plain fat teardrop, round at the top and pointing down
    const body = () => { c.beginPath(); c.moveTo(0, 0.95); c.bezierCurveTo(-0.32, 0.62, -0.74, 0.2, -0.72, -0.22); c.bezierCurveTo(-0.7, -0.92, 0.7, -0.92, 0.72, -0.22); c.bezierCurveTo(0.74, 0.2, 0.32, 0.62, 0, 0.95); c.closePath(); };
    body(); c.fillStyle = lg(c, 0, -0.8, 0, 0.95, [[0, '#5cbcf0'], [0.55, '#3aa6e0'], [1, '#1f78b4']]); c.fill();
    // three rows of big overlapping scales (2, 3, 2), painted bottom-up so each row tucks under the one above
    c.save(); body(); c.clip();
    const scale = (x, y, w) => {
      const h = w * 1.5;
      c.beginPath(); c.moveTo(x - w, y - 0.3); c.lineTo(x - w, y); c.quadraticCurveTo(x - w * 0.95, y + h * 0.9, x, y + h); c.quadraticCurveTo(x + w * 0.95, y + h * 0.9, x + w, y); c.lineTo(x + w, y - 0.3); c.closePath();
      c.fillStyle = lg(c, 0, y - 0.1, 0, y + h, [[0, '#2f96d2'], [0.55, '#4fb6ec'], [1, '#c9ecff']]); c.fill();
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.95, y + h * 0.9, x, y + h); c.quadraticCurveTo(x + w * 0.95, y + h * 0.9, x + w, y);
      c.lineWidth = 0.07; c.strokeStyle = 'rgba(12,48,84,.9)'; c.lineCap = 'round'; c.stroke();
    };
    [[-0.25, 0.18], [0.25, 0.18]].forEach(([x, y]) => scale(x, y, 0.26));
    [[-0.5, -0.22], [0, -0.22], [0.5, -0.22]].forEach(([x, y]) => scale(x, y, 0.26));
    [[-0.26, -0.62], [0.26, -0.62]].forEach(([x, y]) => scale(x, y, 0.27));
    c.restore();
    body(); ink(c, 0.09);
    // light rim on the upper left so it reads on dark boards
    c.save(); body(); c.clip();
    c.beginPath(); c.arc(0, -0.2, 0.62, Math.PI * 0.95, Math.PI * 1.55); c.lineWidth = 0.1; c.strokeStyle = '#c9ecff'; c.stroke();
    c.restore();
  }
  /** The maple-vanilla twist cone (match-5 special). */
  function twistCone(c) {
    shadow(c, 0.9, 0.34);
    c.beginPath(); c.moveTo(-0.42, 0.1); c.lineTo(0.42, 0.1); c.lineTo(0.04, 0.95); c.quadraticCurveTo(0, 0.99, -0.04, 0.95); c.closePath();
    c.fillStyle = lg(c, -0.4, 0, 0.4, 0.9, [[0, '#f8cf8a'], [0.6, '#dc9a4c'], [1, '#ad6a2c']]); c.fill();
    c.save(); c.clip(); c.strokeStyle = 'rgba(120,60,20,.5)'; c.lineWidth = 0.045;
    for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(k * 0.18 - 0.5, 0); c.lineTo(k * 0.18 + 0.5, 1); c.stroke(); c.beginPath(); c.moveTo(k * 0.18 + 0.5, 0); c.lineTo(k * 0.18 - 0.5, 1); c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(-0.42, 0.1); c.lineTo(0.42, 0.1); c.lineTo(0.04, 0.95); c.quadraticCurveTo(0, 0.99, -0.04, 0.95); c.closePath(); ink(c);
    // tall twist: alternating vanilla and maple bands
    c.save();
    const swirlPath = () => { c.beginPath(); c.moveTo(-0.58, 0.12); c.quadraticCurveTo(-0.66, -0.2, -0.42, -0.42); c.quadraticCurveTo(-0.34, -0.72, -0.08, -0.86); c.quadraticCurveTo(0.06, -1.0, 0.1, -0.86); c.quadraticCurveTo(0.42, -0.72, 0.44, -0.42); c.quadraticCurveTo(0.66, -0.2, 0.58, 0.12); c.quadraticCurveTo(0, 0.24, -0.58, 0.12); c.closePath(); };
    swirlPath();
    c.fillStyle = '#fff4dc'; c.fill();
    c.save(); c.clip();
    for (let k = -6; k < 8; k++) {
      c.beginPath(); c.moveTo(-1, k * 0.22 - 0.3); c.quadraticCurveTo(0, k * 0.22 - 0.05, 1, k * 0.22 - 0.42); c.lineTo(1, k * 0.22 - 0.3); c.quadraticCurveTo(0, k * 0.22 + 0.06, -1, k * 0.22 - 0.2); c.closePath();
      c.fillStyle = k % 2 ? '#e09a3a' : '#c8741e'; c.fill();
    }
    c.fillStyle = rg(c, -0.25, -0.4, 0.05, 0.9, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(-1, -1, 2, 2);
    c.restore();
    swirlPath(); ink(c);
    c.restore();
    shine(c, -0.3, -0.25, 0.08, 0.2, 0.4, 0.7);
    // golden maple-leaf topper
    c.save(); c.translate(0.12, -0.9); c.rotate(0.25);
    leafPath(c, 0, 0, 0.36); c.fillStyle = lg(c, 0, -0.35, 0, 0.2, [[0, '#fff3a0'], [1, '#f0a818']]); c.fill();
    c.lineWidth = 0.06; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }
  /** Sap bucket (goal item): galvanised pail with a peaked lid and a spout. */
  function bucket(c) {
    shadow(c, 0.9, 0.55);
    // spout
    c.beginPath(); c.moveTo(-0.05, -0.62); c.lineTo(-0.05, -0.92); c.lineWidth = 0.17; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 0.08; c.strokeStyle = '#c9d2d8'; c.stroke();
    // pail
    c.beginPath(); c.moveTo(-0.62, -0.3); c.lineTo(0.62, -0.3); c.lineTo(0.48, 0.86); c.quadraticCurveTo(0, 0.94, -0.48, 0.86); c.closePath();
    c.fillStyle = lg(c, -0.6, 0, 0.6, 0, [[0, '#7c8a96'], [0.3, '#e6eef2'], [0.55, '#b6c3cc'], [1, '#69767f']]); c.fill(); ink(c);
    c.strokeStyle = 'rgba(60,70,80,.55)'; c.lineWidth = 0.05;
    [0.05, 0.5].forEach(y => { c.beginPath(); c.moveTo(-0.6 + y * 0.12, y); c.quadraticCurveTo(0, y + 0.07, 0.6 - y * 0.12, y); c.stroke(); });
    // sap drop badge
    c.beginPath(); c.moveTo(0, 0.02); c.bezierCurveTo(0.2, 0.25, 0.22, 0.42, 0, 0.48); c.bezierCurveTo(-0.22, 0.42, -0.2, 0.25, 0, 0.02); c.closePath();
    c.fillStyle = lg(c, 0, 0, 0, 0.5, [[0, '#ffe08a'], [1, '#e08a0c']]); c.fill(); ink(c, 0.05);
    // peaked lid
    c.beginPath(); c.moveTo(-0.78, -0.24); c.lineTo(0, -0.7); c.lineTo(0.78, -0.24); c.closePath();
    c.fillStyle = lg(c, 0, -0.7, 0, -0.24, [[0, '#f2f6f8'], [1, '#8796a1']]); c.fill(); ink(c);
    shine(c, -0.36, 0.2, 0.06, 0.25, 0.1, 0.6);
  }
  const DRAW = [creemee, donut, leaf, jug, apple, pinecone];

  /** Draw a piece centred on (x, y) at cell size s. key: 0-5 type, 'cone', 'bucket'. */
  function drawPiece(c, key, x, y, s) {
    const img = ASSETS[typeof key === 'number' ? 'piece' + key : key];
    c.save(); c.translate(x, y);
    if (img && img.naturalWidth) c.drawImage(img, -s / 2, -s / 2, s, s);
    else {
      c.scale(s * 0.43, s * 0.43);
      if (key === 'cone') twistCone(c); else if (key === 'bucket') bucket(c); else DRAW[key](c);
    }
    c.restore();
  }

  /** Pre-rendered sprites at a given cell size (CSS px) and dpr: { 0..5, cone, bucket } */
  function makeSprites(s, dpr) {
    const out = {}, N = Math.ceil(s * 1.2 * dpr);
    [0, 1, 2, 3, 4, 5, 'cone', 'bucket'].forEach(k => {
      const cv = document.createElement('canvas'); cv.width = cv.height = N;
      const c = cv.getContext('2d'); c.scale(dpr, dpr);
      drawPiece(c, k, N / dpr / 2, N / dpr / 2, s);
      out[k] = cv;
    });
    out.size = N / dpr;
    return out;
  }

  // ---------------------------------------------------------------- special overlays (drawn live: they pulse)
  /** Behind the piece. k: 1 row, 2 col, 3 burst. t: seconds. */
  function specialUnder(c, k, x, y, s, t, type) {
    c.save(); c.translate(x, y);
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    if (k === 1 || k === 2) {
      // nothing under a line clearer: the piece itself stays clean (chevrons are drawn on top)
    } else if (k === 3) {
      c.rotate(t * 0.8);
      const n = 10, r0 = s * 0.3, r1 = s * (0.5 + 0.04 * p);
      c.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, r = i % 2 ? r0 : r1; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath();
      c.fillStyle = rg(c, 0, 0, r0 * 0.5, r1, [[0, 'rgba(255,240,170,1)'], [0.7, 'rgba(255,190,50,.95)'], [1, 'rgba(230,130,20,.9)']]); c.fill();
      c.lineWidth = s * 0.025; c.strokeStyle = 'rgba(120,60,10,.8)'; c.stroke();
    } else if (k === 4) {
      // rainbow-ish shimmer ring behind the twist cone
      c.rotate(-t * 1.2);
      for (let i = 0; i < 12; i++) {
        c.rotate(Math.PI / 6);
        c.beginPath(); c.ellipse(s * 0.38, 0, s * 0.1, s * 0.035, 0, 0, 7);
        c.fillStyle = `hsla(${(i * 30 + t * 80) % 360},90%,72%,${0.55 + 0.35 * p})`; c.fill();
      }
    }
    c.restore();
  }
  /** On top of the piece. */
  function specialOver(c, k, x, y, s, t) {
    c.save(); c.translate(x, y);
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    if (k === 1 || k === 2) {
      // two solid cream arrowheads at the cell edges, 0.16 cell deep, pointing the way it clears; outside the
      // (slightly shrunk) piece. A slow pulse once a second, anchored at the tip so it never grows into the piece.
      if (k === 2) c.rotate(Math.PI / 2);
      const z = s * 0.16, q = 1 + 0.08 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
      c.lineJoin = 'round';
      [-1, 1].forEach(d => {
        const ex = d * s * 0.5;
        c.save(); c.translate(ex, 0); c.scale(q, q);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-d * z, -z * 1.05); c.lineTo(-d * z * 0.8, 0); c.lineTo(-d * z, z * 1.05); c.closePath();
        c.fillStyle = '#fff3c4'; c.fill(); c.lineWidth = s * 0.03; c.strokeStyle = INK; c.stroke();
        c.restore();
      });
    } else if (k === 3) {
      c.globalAlpha = 0.5 + 0.4 * p;
      c.beginPath(); c.arc(0, 0, s * 0.44, 0, 7); c.lineWidth = s * 0.05; c.strokeStyle = '#fff3b0'; c.stroke();
    } else if (k === 4) {
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + i * 2.1, r = s * 0.4;
        sparkle(c, Math.cos(a) * r, Math.sin(a) * r * 0.8 - s * 0.05, s * (0.06 + 0.03 * Math.sin(t * 7 + i)));
      }
    }
    c.restore();
  }
  function sparkle(c, x, y, r) {
    c.save(); c.translate(x, y); c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr_ = i % 2 ? r * 0.3 : r; c.lineTo(Math.cos(a) * rr_, Math.sin(a) * rr_); }
    c.closePath(); c.fillStyle = '#fffbe0'; c.fill(); c.restore();
  }

  /** Goal icon for frost levels: an empty ice block with a snowflake. */
  function iceBlock(c, x, y, s) {
    c.save(); c.translate(x, y);
    const h = s * 0.42;
    rr(c, -h, -h, 2 * h, 2 * h, s * 0.14);
    c.fillStyle = lg(c, 0, -h, 0, h, [[0, '#eaf8ff'], [1, '#8fc8ec']]); c.fill();
    c.lineWidth = s * 0.06; c.strokeStyle = INK; c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = s * 0.07; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, r = s * 0.27; c.beginPath(); c.moveTo(-Math.cos(a) * r, -Math.sin(a) * r); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.stroke(); }
    c.strokeStyle = '#4f9bd0'; c.lineWidth = s * 0.03;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, r = s * 0.27; c.beginPath(); c.moveTo(-Math.cos(a) * r, -Math.sin(a) * r); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.stroke(); }
    c.restore();
  }
  /** Frost over a frozen piece. n: 1 thin, 2 thick. crack: 0..1 freshly hit. */
  function drawIce(c, x, y, s, n) {
    c.save(); c.translate(x, y);
    const h = s * 0.46;
    rr(c, -h, -h, 2 * h, 2 * h, s * 0.16);
    c.fillStyle = n >= 2 ? 'rgba(205,236,255,.22)' : 'rgba(205,236,255,.12)'; c.fill();
    c.lineWidth = s * 0.07; c.strokeStyle = '#bfe4ff'; c.stroke();
    if (n >= 2) { const g = s * 0.12; rr(c, -h + g, -h + g, 2 * (h - g), 2 * (h - g), s * 0.1); c.lineWidth = s * 0.05; c.stroke(); }
    c.save(); rr(c, -h, -h, 2 * h, 2 * h, s * 0.16); c.clip();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = s * 0.022; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-h * 0.75, -h * 0.45); c.lineTo(-h * 0.25, -h * 0.05); c.lineTo(-h * 0.35, h * 0.4); c.moveTo(-h * 0.25, -h * 0.05); c.lineTo(h * 0.3, h * 0.1); c.stroke();
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- seasonal scenes (backgrounds and map)
  const SCENE = {
    march: { sky: ['#5b7fa8', '#c7d6e6', '#f4e3cf'], hill: ['#eef4f8', '#d3e1ea', '#b7cad8'], ground: '#93a9bb' },
    mud: { sky: ['#7d9cae', '#c3d3cf', '#e9e4cf'], hill: ['#8a9a5b', '#6f7f43', '#6b4f33'], ground: '#4a3220' },
    summer: { sky: ['#3d8fd6', '#8fcff0', '#e6f6ff'], hill: ['#4f8f5a', '#3f7d4e', '#2f6a42'], ground: '#1f4a30' },
    october: { sky: ['#e8834a', '#f7c08a', '#fde6c5'], hill: ['#c4521f', '#a8401a', '#7a3a1c'], ground: '#4a2412' },
  };
  function orb(c, x, y, r, core, glow) {
    c.fillStyle = rg(c, x, y, r * 0.6, r * 3.2, [[0, glow], [1, 'rgba(255,255,255,0)']]); c.beginPath(); c.arc(x, y, r * 3.2, 0, 7); c.fill();
    c.fillStyle = rg(c, x - r * 0.3, y - r * 0.3, 0, r, [[0, '#ffffff'], [1, core]]); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  function hills(c, w, h, base, amp, color, seed) {
    c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 10) { const y = base + Math.sin(x / w * 5 + seed) * amp + Math.sin(x / w * 13 + seed * 2) * amp * 0.35; c.lineTo(x, y); }
    c.lineTo(w, h); c.closePath(); c.fillStyle = color; c.fill();
  }
  function tree(c, x, y, s, season, k) {
    // trunk
    c.fillStyle = '#4a2c18'; c.fillRect(x - s * 0.05, y - s * 0.5, s * 0.1, s * 0.5);
    if (season === 'march') { // bare branches + a sap bucket
      c.strokeStyle = '#4a2c18'; c.lineWidth = s * 0.04; c.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.45; c.beginPath(); c.moveTo(x, y - s * 0.45); c.lineTo(x + Math.cos(a) * s * 0.45, y - s * 0.45 + Math.sin(a) * s * 0.45); c.stroke(); }
      c.fillStyle = '#b8c4cc'; c.fillRect(x - s * 0.08, y - s * 0.3, s * 0.12, s * 0.12);
      return;
    }
    const cols = { mud: ['#9cc46a', '#b8d67a'], summer: ['#2f7d3a', '#3f9548'], october: [['#e8501f', '#f2a51c', '#d4321a', '#f7c531'][k % 4], '#ffd36a'] }[season];
    // a clumpy crown: shadowed back blobs, lit front blobs, a few leaf flecks
    const blobs = [[0, -0.66, 0.3], [-0.24, -0.5, 0.24], [0.24, -0.5, 0.24], [-0.12, -0.82, 0.2], [0.15, -0.8, 0.19], [0, -0.42, 0.22]];
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); for (const [bx, by, br] of blobs) { c.moveTo(x + bx * s + br * s + s * 0.04, y + by * s + s * 0.04); c.arc(x + bx * s + s * 0.04, y + by * s + s * 0.04, br * s, 0, 7); } c.fill();
    c.fillStyle = cols[0]; c.beginPath(); for (const [bx, by, br] of blobs) { c.moveTo(x + bx * s + br * s, y + by * s); c.arc(x + bx * s, y + by * s, br * s, 0, 7); } c.fill();
    c.fillStyle = cols[1]; c.globalAlpha = 0.55; c.beginPath(); for (const [bx, by, br] of blobs.slice(0, 4)) { c.moveTo(x + (bx - 0.06) * s + br * 0.5 * s, y + (by - 0.06) * s); c.arc(x + (bx - 0.06) * s, y + (by - 0.06) * s, br * 0.5 * s, 0, 7); } c.fill(); c.globalAlpha = 1;
    if (season === 'october') { for (let i = 0; i < 5; i++) { c.fillStyle = ['#ffd36a', '#c42a12'][i % 2]; c.beginPath(); c.arc(x + (prand(i + k * 9) - 0.5) * s * 0.7, y - s * (0.4 + prand(i + k) * 0.5), s * 0.035, 0, 7); c.fill(); } }
  }
  function drawScene(c, season, w, h, opts) {
    opts = opts || {};
    const S = SCENE[season] || SCENE.march;
    const img = ASSETS['bg_' + season];
    if (img && img.naturalWidth) {
      const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      c.drawImage(img, (w - img.naturalWidth * r) / 2, (h - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r);
      return;
    }
    c.fillStyle = lg(c, 0, 0, 0, h, [[0, S.sky[0]], [0.55, S.sky[1]], [1, S.sky[2]]]); c.fillRect(0, 0, w, h);
    const u = Math.min(w, h * 0.8);
    if (season === 'summer') { // sun + lake + far mountains across the water
      orb(c, w * 0.78, h * 0.16, u * 0.08, '#fff2b0', 'rgba(255,240,170,.45)');
      hills(c, w, h, h * 0.5, h * 0.035, '#7d9fc2', 1.3);
      c.fillStyle = lg(c, 0, h * 0.55, 0, h * 0.72, [[0, '#4aa3dc'], [1, '#2a78b8']]); c.fillRect(0, h * 0.55, w, h * 0.2);
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const x = prand(i) * w, y = h * 0.58 + prand(i + 5) * h * 0.12; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18, y); c.stroke(); }
      hills(c, w, h, h * 0.74, h * 0.02, S.hill[0], 3.1);
    } else {
      if (season === 'march') orb(c, w * 0.2, h * 0.14, u * 0.055, '#f4f1e6', 'rgba(255,250,235,.35)');
      if (season === 'october') orb(c, w * 0.75, h * 0.2, u * 0.08, '#ffd98a', 'rgba(255,200,120,.45)');
      hills(c, w, h, h * 0.5, h * 0.05, S.hill[0], 0.4);
      hills(c, w, h, h * 0.62, h * 0.04, S.hill[1], 2.2);
    }
    // a row of trees
    const n = Math.max(5, Math.round(w / 70));
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (prand(i + 20) - 0.5) * 0.6) * w / n, s = u * (0.16 + prand(i + 40) * 0.08);
      tree(c, x, h * (season === 'summer' ? 0.77 : 0.68) + prand(i) * h * 0.03, s, season, i);
    }
    if (season === 'march') { // sugar shack with steam
      const x = w * 0.72, y = h * 0.74, s = u * 0.22;
      c.fillStyle = '#7a3f22'; c.fillRect(x - s * 0.5, y - s * 0.45, s, s * 0.45);
      c.beginPath(); c.moveTo(x - s * 0.62, y - s * 0.42); c.lineTo(x, y - s * 0.78); c.lineTo(x + s * 0.62, y - s * 0.42); c.closePath(); c.fillStyle = '#f2f6f8'; c.fill();
      c.fillStyle = '#5a2c16'; c.fillRect(x - s * 0.12, y - s * 0.95, s * 0.24, s * 0.22);
      c.fillStyle = '#ffd77a'; c.fillRect(x - s * 0.3, y - s * 0.3, s * 0.16, s * 0.14); c.fillRect(x + s * 0.14, y - s * 0.3, s * 0.16, s * 0.14);
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + Math.sin(i * 1.7) * s * 0.12, y - s * (1.05 + i * 0.16), s * (0.1 + i * 0.03), 0, 7); c.fillStyle = `rgba(255,255,255,${0.75 - i * 0.12})`; c.fill(); }
    }
    hills(c, w, h, h * (season === 'summer' ? 0.84 : 0.78), h * 0.03, S.hill[2], 4.5);
    if (season === 'mud') { // puddles
      for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(prand(i + 7) * w, h * (0.86 + prand(i + 9) * 0.1), u * 0.12, u * 0.025, 0, 0, 7); c.fillStyle = 'rgba(150,175,190,.7)'; c.fill(); }
    }
    if (season === 'march') { // snow
      c.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(prand(i + 3) * w, prand(i + 33) * h * 0.9, 1 + prand(i) * 2, 0, 7); c.fill(); }
    }
    if (season === 'october' && !opts.calm) { // drifting leaves (not behind a live board: they look like the leaf piece)
      for (let i = 0; i < 14; i++) { c.save(); c.translate(prand(i + 3) * w, prand(i + 13) * h * 0.85); c.rotate(prand(i) * 6); leafPath(c, 0, 0, u * 0.025); c.fillStyle = ['#e8501f', '#f2a51c', '#d4321a'][i % 3]; c.fill(); c.restore(); }
    }
    if (opts.extendTo > h) { // ground continues below the scene (the board sits on it)
      c.fillStyle = lg(c, 0, h, 0, opts.extendTo, [[0, S.hill[2]], [1, S.ground]]); c.fillRect(0, h - 1, w, opts.extendTo - h + 1);
    }
    if (opts.dim) { c.fillStyle = `rgba(30,12,4,${opts.dim})`; c.fillRect(0, 0, w, Math.max(h, opts.extendTo || 0)); }
  }

  root.MMArt = { SCENE, COLORS, LIGHT, INK, ASSETS, rr, lg, rg, drawPiece, makeSprites, specialUnder, specialOver, drawIce, iceBlock, drawScene, leafPath, sparkle, prand };
})(typeof self !== 'undefined' ? self : this);
