/* Maple Match - WebAudio synth sound effects and a light folksy music loop. No audio files. */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  const S = { sfx: true, music: true, started: false };
  let musicTimer = null, nextNote = 0, step = 0, musicOn = false;

  const PENT = [0, 2, 4, 7, 9]; // major pentatonic
  function nf(i, base) { i = Math.max(0, Math.round(i)); return (base || 293.66) * Math.pow(2, (PENT[i % 5] + 12 * Math.floor(i / 5)) / 12); }

  function init() {
    if (ctx) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = S.music ? 0.26 : 0; musBus.connect(master);
    // a small wooden-room echo: short feedback delay, darkened
    const dl = ctx.createDelay(0.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    dl.delayTime.value = 0.13; fb.gain.value = 0.24; lp.type = 'lowpass'; lp.frequency.value = 2400; wet.gain.value = 0.2;
    dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(master);
    sfxBus.connect(dl); musBus.connect(dl);
    const len = ctx.sampleRate * 0.8;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  /** Call from the first user gesture (iOS needs it). */
  function unlock() {
    init(); if (!ctx) return;
    if (ctx.state !== 'running' && ctx.resume) ctx.resume();
    S.started = true;
    if (S.music) startMusic();
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && S.started && ctx.state !== 'running') ctx.resume(); }

  function tone(f, dur, type, vol, o) {
    if (!ctx || !S.sfx) return; o = o || {};
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + (o.attack || 0.006)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(o.bus || sfxBus); osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function noise(dur, f, q, vol, o) {
    if (!ctx || !S.sfx) return; o = o || {};
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(f, t0);
    if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    fl.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl); fl.connect(g); g.connect(sfxBus); src.start(t0); src.stop(t0 + dur + 0.03);
  }
  function pluck(f, vol, delay, bus, dur) {
    if (!ctx) return; if (bus !== musBus && !S.sfx) return;
    const t0 = ctx.currentTime + (delay || 0); dur = dur || 0.5;
    [[1, 1], [2.0, 0.3], [3.01, 0.1]].forEach(p => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = p[0] === 1 ? 'triangle' : 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime((vol || 0.2) * p[1], t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / p[0]);
      o.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* iOS: no vibrate */ } }

  const A = {
    S, unlock, suspend, resume, haptic,
    swap() { noise(0.1, 1400, 1.2, 0.06, { to: 700 }); tone(330, 0.07, 'sine', 0.05, { to: 420 }); },
    bonk() { tone(150, 0.13, 'square', 0.06, { to: 90 }); noise(0.06, 400, 2, 0.05); },
    /** a match pop: pitch climbs one pentatonic step per cascade */
    pop(cascade, size, type) {
      const i = 4 + Math.min(cascade - 1, 12) * 1, f = nf(i);
      pluck(f, 0.17, 0, null, 0.35);
      pluck(nf(i + 2), 0.08, 0.03, null, 0.3);
      // each piece has its own little accent so the board sounds like its contents
      if (type === 0) { tone(f * 2, 0.5, 'sine', 0.07); tone(f * 5.4, 0.25, 'sine', 0.025); }           // creemee: soft bell
      else if (type === 1) { tone(f * 0.75, 0.07, 'triangle', 0.12, { to: f * 0.6 }); noise(0.05, 1200, 4, 0.06); } // donut: wood block
      else if (type === 2) { noise(0.16, 6500, 1.2, 0.06, { to: 3000 }); }                             // leaf: rustle
      else if (type === 3) { tone(f * 3, 0.35, 'sine', 0.05); tone(f * 4.2, 0.22, 'sine', 0.035, { delay: 0.02 }); } // jug: glass clink
      else if (type === 4) { noise(0.06, 3200, 1.5, 0.09); tone(f * 1.5, 0.08, 'triangle', 0.06); }     // apple: crunch
      else if (type === 5) { tone(f * 0.5, 0.05, 'square', 0.04, { to: f * 0.4 }); noise(0.04, 2200, 6, 0.06); } // pinecone: woody click
      else noise(0.07, 2800 + cascade * 300, 2, 0.05);
      if (size >= 4) pluck(nf(i + 4), 0.1, 0.07, null, 0.4);
    },
    make(k) { // special created
      const base = k === 4 ? 9 : k === 3 ? 7 : 6;
      for (let j = 0; j < 4; j++) pluck(nf(base + j * 2), 0.13, j * 0.05, null, 0.4);
    },
    line() { noise(0.35, 4000, 1.5, 0.12, { to: 600 }); tone(900, 0.25, 'sawtooth', 0.04, { to: 220 }); },
    burst() { tone(110, 0.35, 'sine', 0.3, { to: 45 }); noise(0.4, 900, 0.8, 0.16, { to: 180, type: 'lowpass' }); },
    cone() { for (let j = 0; j < 7; j++) pluck(nf(8 + j), 0.11, j * 0.035, null, 0.35); noise(0.5, 6000, 3, 0.05, { to: 2000 }); },
    combo() { // special + special
      tone(80, 0.6, 'sine', 0.35, { to: 35 }); noise(0.7, 1200, 0.7, 0.2, { to: 120, type: 'lowpass' });
      [0, 4, 7, 12].forEach((s, j) => pluck(293.66 * Math.pow(2, s / 12) * 2, 0.12, 0.08 + j * 0.06, null, 0.7));
    },
    ice() { noise(0.12, 5200, 4, 0.1); tone(2400, 0.05, 'triangle', 0.04, { to: 1800 }); },
    bucket() { pluck(nf(12), 0.18, 0, null, 0.8); pluck(nf(14), 0.14, 0.09, null, 0.8); pluck(nf(17), 0.12, 0.18, null, 1); },
    land() { tone(180, 0.05, 'sine', 0.04, { to: 120 }); },
    goal() { pluck(nf(15), 0.12, 0, null, 0.3); },
    callout(n) { for (let j = 0; j < 3; j++) pluck(nf(6 + n + j * 2), 0.1, j * 0.06, null, 0.5); },
    shuffle() { for (let j = 0; j < 8; j++) noise(0.05, 1500 + j * 300, 3, 0.05, { delay: j * 0.04 }); },
    tick(i) { pluck(nf(7 + (i % 10)), 0.1, 0, null, 0.2); },
    star(i) { for (let j = 0; j < 3; j++) pluck(nf(9 + i * 2 + j * 2), 0.16, j * 0.05, null, 0.6); },
    win() { [0, 2, 4, 5, 7].forEach((n, j) => pluck(nf(5 + n), 0.17, j * 0.09, null, 0.7)); tone(nf(15), 0.8, 'triangle', 0.06, { delay: 0.45 }); },
    lose() { [7, 5, 3, 1].forEach((n, j) => pluck(nf(n), 0.15, j * 0.15, null, 0.8)); },
    cool() { tone(520, 0.3, 'sine', 0.06, { to: 260 }); noise(0.25, 1800, 1, 0.03, { to: 600 }); },
    click() { tone(520, 0.05, 'triangle', 0.08, { to: 700 }); },
    /** test hook: an analyser on the master output (used by the headless sound check) */
    debugTap() { if (!ctx) return null; const an = ctx.createAnalyser(); an.fftSize = 2048; master.connect(an); return an; },
    setSfx(on) { S.sfx = !!on; if (sfxBus) sfxBus.gain.value = on ? 1 : 0; },
    setMusic(on) { S.music = !!on; if (musBus) musBus.gain.value = on ? 0.26 : 0; if (on && S.started) startMusic(); else stopMusic(); },
  };

  // ---- "Sugarbush Jig": an original 16-bar tune in 6/8 (melody, bass, chords, brushes, a low drum).
  // Melody is written as major-scale degrees (0 = tonic), one entry per eighth note; null holds the note.
  const _ = null;
  const TUNE = [
    [0, 2, 4, 7, 4, 2], [3, 5, 3, 1, 3, 5], [4, 2, 4, 7, 6, 7], [8, 6, 4, 4, _, _],
    [0, 2, 4, 7, 4, 2], [3, 5, 7, 5, 3, 1], [2, 4, 2, 1, 0, 1], [0, _, _, 0, _, _],
    [7, 6, 7, 9, 7, 6], [5, 4, 5, 7, 5, 4], [7, 6, 7, 9, 10, 9], [8, _, 7, 6, _, 4],
    [7, 6, 7, 9, 7, 6], [5, 7, 5, 4, 2, 4], [2, 4, 2, 1, 0, 1], [0, _, _, 0, _, _],
  ];
  const CHORD_ROOTS = [0, 3, 0, 4, 0, 3, 4, 0, 0, 3, 0, 4, 5, 3, 4, 0]; // I IV I V ... vi IV V I
  const MAJ = [0, 2, 4, 5, 7, 9, 11];
  const deg = d => MAJ[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  // per-season arrangement: key (semitones above G3), tempo (eighths per minute), melody voice
  const SEASON_MUSIC = {
    march: { key: 0, tempo: 300, voice: 'fiddle' },
    mud: { key: 2, tempo: 288, voice: 'whistle' },
    summer: { key: 5, tempo: 312, voice: 'marimba' },
    october: { key: -3, tempo: 276, voice: 'fiddle' },
  };
  let arr = SEASON_MUSIC.march, pendingArr = null;
  const G3 = 196;
  const hz = semis => G3 * Math.pow(2, (semis + arr.key) / 12);

  function marimba(f, vol, t0, dur) { // bar overtones at about 1 : 3.9 : 9.2, upper ones die fast
    [[1, 1, dur], [3.93, 0.28, dur * 0.25], [9.2, 0.07, dur * 0.08]].forEach(p => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * p[1], t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.05, p[2]));
      o.connect(g); g.connect(musBus); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }
  function voiceNote(f, t0, dur, vol) {
    if (arr.voice === 'marimba') { marimba(f * 2, vol * 1.6, t0, Math.max(0.35, dur * 1.6)); return; }
    if (arr.voice === 'fiddle') vol *= 0.7; // two strings: keep the level the same
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = arr.voice === 'whistle' ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(f * 2, t0);
    let o2 = null;
    if (arr.voice === 'fiddle') { // a second, slightly detuned string and a wooden body resonance
      o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(f * 2, t0); o2.detune.value = 7;
      const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 1150; body.gain.value = 6; body.Q.value = 1.1;
      o2.connect(lp);
      lp.connect(body); body.connect(g);
    }
    // gentle vibrato on longer notes
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = dur > 0.3 ? f * 0.012 : 0;
    lfo.connect(lg); lg.connect(o.frequency);
    lp.type = 'lowpass'; lp.frequency.value = arr.voice === 'whistle' ? 3000 : 2100; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.025);
    g.gain.setValueAtTime(vol * 0.8, t0 + Math.max(0.03, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
    o.connect(lp); if (!o2) lp.connect(g); g.connect(musBus);
    if (o2) { lg.connect(o2.frequency); o2.start(t0); o2.stop(t0 + dur + 0.08); }
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.08); lfo.stop(t0 + dur + 0.08);
  }
  function pluckAt(f, vol, t0, dur) {
    [[1, 1], [2.0, 0.3], [3.01, 0.1]].forEach(p => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = p[0] === 1 ? 'triangle' : 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * p[1], t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / p[0]);
      o.connect(g); g.connect(musBus); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }
  function brush(t0, vol, dur) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(musBus); src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }
  function drum(t0, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + 0.18);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g); g.connect(musBus); o.start(t0); o.stop(t0 + 0.25);
  }
  function startMusic() { if (!ctx || musicOn) return; musicOn = true; step = 0; nextNote = ctx.currentTime + 0.25; musicTimer = setInterval(sched, 100); }
  function stopMusic() { musicOn = false; if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function sched() {
    if (!ctx || !musicOn) return;
    while (nextNote < ctx.currentTime + 0.5) {
      const e = 60 / arr.tempo;
      if (ctx.state === 'running') play(step, nextNote, e);
      nextNote += e; step++;
      if (pendingArr && step % 6 === 0) { arr = pendingArr; pendingArr = null; } // switch season on the next bar line
    }
  }
  // four passes before the arrangement repeats (~80 s): plain, harmony, breakdown + counter-line, full with grace notes
  function play(s, t0, e) {
    const bar = Math.floor(s / 6) % 16, pos = s % 6, pass = Math.floor(s / 96) % 4;
    const notes = TUNE[bar], d = notes[pos];
    const root = deg(CHORD_ROOTS[bar]);
    const minor = CHORD_ROOTS[bar] === 5;
    const breakdown = pass === 2 && bar < 8;
    if (d !== null && !breakdown) { // melody: length until the next note
      let len = 1; while (pos + len < 6 && notes[pos + len] === null) len++;
      const swing = pos % 3 === 0 ? 1.08 : 0.96; // a little lilt
      const vol = pos % 3 === 0 ? 0.075 : 0.06, lift = pass === 1 && arr.voice !== 'fiddle' ? 12 : 0;
      if (pass === 3 && len >= 2) voiceNote(hz(deg(d + 1) + 12), t0 - e * 0.22, e * 0.18, vol * 0.55); // grace note
      voiceNote(hz(deg(d) + 12 + lift), t0, e * len * 0.92 * swing, vol);
      if (pass === 1 || pass === 2) voiceNote(hz(deg(d - 2) + 12 + lift), t0, e * len * 0.9, vol * 0.45); // harmony a third below
    }
    if (breakdown) { // rolling chord-tone counter-line while the tune rests
      const iv = [0, minor ? 3 : 4, 7, 12, 7, minor ? 3 : 4][pos];
      pluckAt(hz(root + iv + 12), pos % 3 === 0 ? 0.08 : 0.055, t0, e * 1.8);
    }
    if (pos === 0) { pluckAt(hz(root - 12), 0.2, t0, e * 3); drum(t0, breakdown ? 0.08 : 0.16); }
    if (pos === 3) { pluckAt(hz(root - 12 + 7), 0.13, t0, e * 3); drum(t0, pass === 3 ? 0.12 : pass ? 0.08 : 0.05); }
    if (pos === 1 || pos === 4) { // off-beat chord strum
      [0, minor ? 3 : 4, 7].forEach((iv, k) => pluckAt(hz(root + iv), 0.045, t0 + k * 0.012, e * 1.6));
    }
    brush(t0, pos % 3 === 0 ? 0.035 : 0.018, pos % 3 === 2 ? 0.09 : 0.05);
  }
  A.setSeason = key => { const a = SEASON_MUSIC[key] || SEASON_MUSIC.march; if (a !== arr) { if (musicOn) pendingArr = a; else arr = a; } };

  root.MMAudio = A;
})(typeof self !== 'undefined' ? self : this);
