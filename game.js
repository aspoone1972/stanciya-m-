/* «Бегалка» — боковой раннер на чистом Canvas + WebAudio.
   Ассеты из папки assets/ (папка «64 бита»). */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540;
  ctx.imageSmoothingEnabled = true;

  const ASSETS = '';
  const FILES = {
    bg:        'Фон.png',
    heroSides: 'Герой со всех сторон .png',
    heroMoves: 'Герой три движения .png',
    health:    'Здоровье.png',
    murk:      'Мутность.png',
    enemy:     'Враг.png',
    bonus:     'Бонус.png',
    start:     'Старт.png'
  };

  const Sound = window.Sound;
  const FONT = '"Press Start 2P", "Pixelify Sans", monospace';

  function log(msg, type) {
    var el = document.getElementById('log');
    if (!el) return;
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.color = type === 'error' ? '#ff6b6b' : '#7ee787';
    d.style.fontFamily = FONT;
    d.style.fontSize = '13px';
    d.style.margin = '2px 0';
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    console.log(msg);
  }
  window.onerror = function (msg, url, line) {
    log('JS ОШИБКА: ' + msg + ' (строка ' + line + ')', 'error');
    return false;
  };

  const images = {};
  let loaded = 0, total = 0;
  let anim = { run: [], jump: [], slide: [] };
  function buildAnimFromSheet(img) {
    const cols = 3, rows = 3;
    const cw = img.naturalWidth / cols;
    const ch = img.naturalHeight / rows;
    const tmp = document.createElement('canvas');
    tmp.width = cw; tmp.height = ch;
    const tctx = tmp.getContext('2d');
    const out = { run: [], jump: [], slide: [] };
    const rowsOrder = ['run', 'jump', 'slide'];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = Math.round(c * cw);
        const sw = Math.round((c + 1) * cw) - sx;
        const sy = Math.round(r * ch);
        const sh = Math.round((r + 1) * ch) - sy;
        tctx.clearRect(0, 0, cw, ch);
        tctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        let frame;
        try { frame = trim(tmp); } catch (e) {
          const fb = document.createElement('canvas');
          fb.width = cw; fb.height = ch;
          fb.getContext('2d').drawImage(tmp, 0, 0);
          frame = { canvas: fb, w: cw, h: ch };
        }
        out[rowsOrder[r]].push(frame);
      }
    }
    return out;
  }

  function trim(cv) {
    const c = cv.getContext('2d', { willReadFrequently: true });
    const w = cv.width, h = cv.height;
    const data = c.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) { return { canvas: cv, w: w, h: h }; }
    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const oc = out.getContext('2d');
    oc.drawImage(cv, minX, minY, tw, th, 0, 0, tw, th);
    return { canvas: out, w: tw, h: th };
  }

  let heroSideFrames = [];
  function sliceFrames(img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, w, h).data;
    // column occupancy
    const colOcc = new Array(w).fill(0);
    const rowOcc = new Array(h).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 20) { colOcc[x] = 1; rowOcc[y] = 1; }
      }
    }
    // find runs
    function runs(arr, minGap) {
      const res = []; let start = -1;
      for (let i = 0; i <= arr.length; i++) {
        const occ = i < arr.length ? arr[i] : 0;
        if (occ && start < 0) start = i;
        else if (!occ && start >= 0) {
          // gap: check if gap long enough
          // collect run end at i-1; push if length > 10
          res.push([start, i - 1]);
          start = -1;
        }
      }
      // merge: remove runs that are separated by small gaps? We'll filter small runs
      // Now group: if gap between runs < minGap, merge
      const merged = [];
      for (const r of res) {
        if (merged.length && r[0] - merged[merged.length-1][1] - 1 < minGap) {
          merged[merged.length-1][1] = r[1];
        } else {
          merged.push([r[0], r[1]]);
        }
      }
      return merged.filter(r => (r[1]-r[0]+1) > 20);
    }
    const colRuns = runs(colOcc, 15);
    const rowRuns = runs(rowOcc, 15);
    const frames = [];
    for (const rr of rowRuns) {
      for (const cr of colRuns) {
        const x0 = cr[0], y0 = rr[0], x1 = cr[1], y1 = rr[1];
        const tw = x1 - x0 + 1, th = y1 - y0 + 1;
        // check non-empty
        let has = false;
        for (let y = y0; y <= y1 && !has; y++)
          for (let x = x0; x <= x1; x++) {
            if (data[(y*w+x)*4+3] > 20) { has = true; break; }
          }
        if (!has) continue;
        const out = document.createElement('canvas');
        out.width = tw; out.height = th;
        const oc = out.getContext('2d');
        oc.drawImage(cv, x0, y0, tw, th, 0, 0, tw, th);
        frames.push({ canvas: out, w: tw, h: th });
      }
    }
    return frames;
  }
  function findRedLine(img) {
    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(img, 0, 0);
      const data = c.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data;
      const w = img.naturalWidth, h = img.naturalHeight;
      const rowRed = new Array(h).fill(0);
      const step = 8;
      for (let y = 0; y < h; y++) {
        let cnt = 0;
        for (let x = 0; x < w; x += step) {
          const idx = (y * w + x) * 4;
          if (data[idx] > 140 && data[idx + 1] < 110 && data[idx + 2] < 110) cnt++;
        }
        rowRed[y] = cnt;
      }
      let bestY = h / 2, bestCount = 0;
      for (let y = 0; y < h; y++) {
        if (rowRed[y] > bestCount) { bestCount = rowRed[y]; bestY = y; }
      }
      return bestCount > 0 ? bestY : null;
    } catch (e) {
      return null;
    }
  }

  function loadAssets() {
    total = Object.keys(FILES).length;
    Object.keys(FILES).forEach(function (key) {
      const im = new Image();
      const bases = [''];
      let tried = 0;
      function tryNext() {
        if (tried >= bases.length) {
          log('ОШИБКА загрузки: ' + FILES[key], 'error');
          loaded++;
          if (loaded === total) initAfterLoad();
          return;
        }
        const base = bases[tried++];
        im.onload = function () {
          // base recorded implicitly in ASSETS (root)
          log('загружено: ' + FILES[key] + ' (' + base + ')');
          loaded++;
          if (key === 'heroSides') { try { heroSideFrames = sliceFrames(im); log('frames: ' + heroSideFrames.length); } catch (e) { log('slice error: ' + e, 'error'); } }
          if (loaded === total) initAfterLoad();
        };
        im.onerror = function () { tryNext(); };
        im.src = base + encodeURIComponent(FILES[key]);
      }
      tryNext();
      images[key] = im;
    });
  }
  function assetUrl(key) { return ASSETS + encodeURIComponent(FILES[key]); }
  // ---------- константы ----------
  const PLAYER_SX = 240;
  const RUN_SPEED = 220;
  const GRAVITY = 1100;
  const JUMP_FORCE = -650;
  const MAX_LIVES = 3;
  const START_LIVES = 3;

  let GROUND_Y = H - 1;
  let BG_SCALE = 1;

  // ---------- состояние ----------
  const state = {
    screen: 'splash', // splash | start | intro | play | paused | gameover
    score: 0, best: 0, lives: START_LIVES,
    camX: 0, shake: 0, murk: 0, drink: 0, inv: 0, stun: 0, time: 0,
    bonus: 0, bonusNext: 0, paused: false,
    introT: 0, introDur: 2.4
  };
  try { state.best = parseInt(localStorage.getItem('begalkaBest') || '0', 10) || 0; } catch (e) {}

  const player = {
    y: GROUND_Y, vy: 0, onGround: true,
    mode: 'run', slideT: 0, frameT: 0, attackT: 0, dir: 1, laserCooldown: 0
  };

  let enemies = [], items = [], floats = [], parts = [], lasers = [];
  let spawnNext = 600, itemNext = 400, rngSeed = 12345;
  let lastHealthSpawn = -60, lastPepperSpawn = -60;
  function rand() { rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0; return (rngSeed >>> 0) / 4294967296; }

  let pendingJump = 0, pendingSlide = 0, pendingAttack = 0;

  function onJump() {
    if (state.screen !== 'play' || state.paused) return;
    doJump();
  }
  function onSlide() {
    if (state.screen !== 'play' || state.paused) return;
    doSlide();
  }
  function onAttack() {
    if (state.screen !== 'play' || state.paused) return;
    doAttack();
  }
  function doJump() {
    if (player.mode === 'jump') return;
    if (player.onGround || Math.abs(player.y - GROUND_Y) < 2) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
      player.mode = 'jump';
      Sound.jump();
    }
  }
  function doSlide() {
    if (player.mode === 'jump') return;
    player.mode = 'slide';
    player.slideT = 0.55;
    Sound.slide();
  }
  function doAttack() {
    if (player.laserCooldown > 0) return;
    player.laserCooldown = 0.3;
    Sound.jump();
    // лазер из глаз: уничтожаем всех врагов на линии огня
    const feet = (player.mode === 'jump') ? player.y : GROUND_Y;
    const eyeY = feet - 100;
    const eyeX = PLAYER_SX + 20;
    const dir = player.dir > 0 ? 1 : -1;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;
      const sx = e.wx - state.camX;
      const ey = e.wy || GROUND_Y;
      const laserY = eyeY;
      // проверяем, попадает ли враг в луч лазера
      if (dir > 0 && sx > eyeX && sx < eyeX + 600 && laserY > ey - e.h / 2 - 20 && laserY < ey + e.h / 2 + 20) {
        destroyEnemy(e, i);
      } else if (dir < 0 && sx < eyeX && sx > eyeX - 600 && laserY > ey - e.h / 2 - 20 && laserY < ey + e.h / 2 + 20) {
        destroyEnemy(e, i);
      }
    }
    // визуальный эффект лазера
    lasers.push({ x: eyeX, y: eyeY, dir: dir, t: 0.3, len: 600 });
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (e.code === 'Space') { e.preventDefault(); onAttack(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); onJump(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); onSlide(); }
    else if ((e.code === 'Enter' || e.code === 'KeyM') && (state.screen === 'splash' || state.screen === 'start')) { startGame(); }
    else if ((e.code === 'Enter' || e.code === 'KeyM') && state.screen === 'gameover') { showStart(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      if (player.mode === 'slide') player.slideT = 0;
    }
  });

  function togglePause() {
    if (state.screen !== 'play') return;
    state.paused = !state.paused;
    var po = document.getElementById('pause');
    if (state.paused) { po.classList.remove('hidden'); Sound.stopMusic && Sound.stopMusic(); }
    else { po.classList.add('hidden'); Sound.start && Sound.start(); }
  }

  const btnStart = document.getElementById('btn-start');
  const btnJump = document.getElementById('btn-jump');
  const btnSlide = document.getElementById('btn-slide');
  const btnFire = document.getElementById('btn-fire');
  const touchCapable = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
  btnStart.addEventListener('click', function () { Sound.unlock(); startGame(); });
  if (btnJump) btnJump.addEventListener('click', onJump);
  if (btnSlide) btnSlide.addEventListener('click', onSlide);
  if (btnFire) btnFire.addEventListener('click', function () { Sound.unlock(); onAttack(); });
  if (touchCapable && btnFire) btnFire.classList.remove('hidden'); else if (btnFire) btnFire.classList.add('hidden');
  canvas.addEventListener('click', function () { if ((state.screen === 'splash' || state.screen === 'start')) { Sound.unlock(); startGame(); } });
  // сенсорное управление жестами (без кнопок)
  let _ts = null;
  canvas.addEventListener('touchstart', function (e) {
    Sound.unlock();
    const t = e.changedTouches[0];
    _ts = { x: t.clientX, y: t.clientY, time: Date.now(), n: e.touches.length };
    if (state.screen === 'splash' || state.screen === 'start') { startGame(); }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (!_ts) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _ts.x;
    const dy = t.clientY - _ts.y;
    const dt = Date.now() - _ts.time;
    const multi = _ts.n >= 2;
    _ts = null;
    if (state.screen !== 'play' || state.paused) return;
    if (multi) { onAttack(); return; }
    if (dy > 40 && Math.abs(dy) > Math.abs(dx)) { onSlide(); }
    else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) { onAttack(); }
    else if (Math.abs(dx) < 24 && Math.abs(dy) < 24 && dt < 400) { onJump(); }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.getElementById('pause').addEventListener('click', function () { if (state.paused) togglePause(); });
  document.getElementById('btn-splash-start').addEventListener('click', function () { Sound.unlock(); startGame(); });

  function spawnEnemy() {
    const type = rand() < 0.5 ? 'stand' : 'ground';
    const wx = state.camX + W + 200 + rand() * 400;
    const h = type === 'stand' ? 180 : 80;
    const wy = GROUND_Y - 70 - rand() * 80;
    enemies.push({ wx: wx, type: type, dead: false, wy: wy,
      w: type === 'stand' ? 110 : 160, h: h });
  }
  function spawnItem() {
    const wx = state.camX + W + 240 + rand() * 500;
    let type;
    if (rand() < 0.4 && (state.time - lastHealthSpawn) >= 60) { type = 'health'; lastHealthSpawn = state.time; }
    else if (rand() < 0.4 && (state.time - lastPepperSpawn) >= 60) { type = 'pepper'; lastPepperSpawn = state.time; }
    else if (rand() < 0.12) { type = 'bonus'; }
    else return;
    const wy = GROUND_Y - 50 - rand() * 130;
    items.push({ wx: wx, wy: wy, type: type, taken: false });
  }

  function hurt() {
    if (state.inv > 0 || state.stun > 0 || state.screen !== 'play') return;
    state.lives--;
    state.inv = 2.0; state.stun = 0.35;
    Sound.hurt();
    addFloat('-1 ЖИЗНЬ', PLAYER_SX, GROUND_Y - 50, '#ff6b6b');
    if (state.lives <= 0) { state.lives = 0; setGameOver(); }
  }

  function destroyEnemy(e, index) {
    e.dead = true;
    const sx = e.wx - state.camX;
    const ey = e.wy || GROUND_Y;
    for (let i = 0; i < 18; i++) spawnPart(sx + (rand() - 0.5) * e.w, ey + (rand() - 0.5) * e.h,
      (rand() - 0.5) * 200, (rand() - 0.5) * 200 - 80, '#9aa0a6', 0.8);
    addFloat('+100', sx, ey - 10, '#ffe14d');
    state.score += 100;
    if (index != null) enemies.splice(index, 1);
  }

  function startDrink(item) {
    if (state.drink > 0) return;
    item.taken = true; state.drink = 2.0;
    Sound.pickup();
    for (let i = 0; i < 4; i++) { setTimeout(function () { Sound.gulp(); }, i * 500); }
    setTimeout(finishDrink, 2000);
  }
  function finishDrink() {
    if (state.screen !== 'play') return;
    if (state.lives < MAX_LIVES) {
      state.lives++;
      addFloat('+1 ЖИЗНЬ', PLAYER_SX, GROUND_Y - 50, '#7ee787');
    }
    Sound.refill();
    state.stun = 0; state.drink = 0;
    for (let i = 0; i < 14; i++) spawnPart(PLAYER_SX + (rand() - 0.5) * 40, GROUND_Y - 50,
      (rand() - 0.5) * 120, (rand() - 0.5) * 120 - 60, '#ffe14d', 0.6);
  }
  function takePepper() {
    state.murk = 5.0;
    addFloat('ПЕРЦОВОЧКА', PLAYER_SX, GROUND_Y - 50, '#c28b4f');
    Sound.murk();
  }
  function takeBonus() {
    if (state.bonus < 5) state.bonus++;
    state.score += 150;
    Sound.pickup();
    addFloat('БОНУС ' + state.bonus + '/5', PLAYER_SX, GROUND_Y - 50, '#ffe14d');
  }
  function addFloat(txt, x, y, color) {
    floats.push({ x: x, y: y, txt: txt, color: color, t: 1.4, vy: -60 });
  }
  function spawnPart(x, y, vx, vy, color, life) {
    parts.push({ x: x, y: y, vx: vx, vy: vy, color: color, life: life, t: 0 });
  }

  function setGameOver() {
    state.screen = 'gameover';
    if (state.score > state.best) { state.best = state.score; try { localStorage.setItem('begalkaBest', String(state.best)); } catch (e) {} }
    Sound.over();
    document.getElementById('ui').classList.remove('hidden');
    document.getElementById('ui-title').textContent = 'ИГРА ОКОНЧЕНА';
    document.getElementById('ui-sub').textContent = 'СЧЁТ ' + Math.floor(state.score) + '   РЕКОРД ' + state.best;
    document.getElementById('btn-start').textContent = 'ЕЩЁ РАЗ';
    document.getElementById('ui-hint').style.display = 'none';
    var _t=document.getElementById('touch'); if(_t) _t.classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('splash').classList.add('hidden');
  }
  function showStart() {
    state.screen = 'start'; state.score = 0; state.camX = 0; state.murk = 0; state.drink = 0;
    state.inv = 0; state.stun = 0; state.shake = 0; state.paused = false;
    state.lives = START_LIVES; state.bonus = 0; state.bonusNext = 0;
    enemies = []; items = []; floats = []; parts = []; lasers = [];
    spawnNext = 400; itemNext = 700; lastHealthSpawn = -60; lastPepperSpawn = -60;
    player.y = GROUND_Y; player.vy = 0; player.onGround = true; player.mode = 'run';
    document.getElementById('ui').classList.remove('hidden');
    document.getElementById('ui-title').textContent = 'Кислый в путь';
    document.getElementById('ui-sub').textContent = 'ПРОБЕЛ — выстрел лазерами из глаз, СТРЕЛКА ВВЕРХ — прыжок, СТРЕЛКА ВНИЗ — подкат, ESC — пауза';
    document.getElementById('btn-start').textContent = 'СТАРТ';
    document.getElementById('ui-hint').style.display = 'block';
    var _t=document.getElementById('touch'); if(_t) _t.classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    var sb = document.getElementById('splash');
    if (images.start && images.start.complete && images.start.naturalWidth > 0) {
      sb.style.backgroundImage = "url('" + assetUrl('start') + "')";
      sb.classList.remove('hidden');
    } else {
      sb.classList.add('hidden');
    }
  }
  function showSplash() {
    state.screen = 'splash';
    document.getElementById('ui').classList.add('hidden');
    var _t=document.getElementById('touch'); if(_t) _t.classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('log').style.display = 'none';
    var sb = document.getElementById('splash');
    if (images.start && images.start.complete && images.start.naturalWidth > 0) {
      sb.style.backgroundImage = "url('" + assetUrl('start') + "')";
      sb.classList.remove('hidden');
    } else {
      sb.classList.add('hidden');
    }
  }
  function startGame() {
    state.screen = 'intro'; state.introT = 0; state.score = 0; state.camX = 0; state.murk = 0; state.drink = 0;
    state.inv = 0; state.stun = 0; state.shake = 0; state.paused = false;
    state.lives = START_LIVES; state.bonus = 0; state.bonusNext = 0;
    enemies = []; items = []; floats = []; parts = []; lasers = [];
    spawnNext = 400; itemNext = 700; lastHealthSpawn = -60; lastPepperSpawn = -60;
    player.y = GROUND_Y; player.vy = 0; player.onGround = true; player.mode = 'run';
    Sound.start();
    document.getElementById('ui').classList.add('hidden');
    document.getElementById('splash').classList.add('hidden');
    var _t=document.getElementById('touch'); if(_t) _t.classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
  }

  function update(dt) {
    var _f = document.getElementById('btn-fire');
    if (_f) {
      if (touchCapable && state.screen === 'play' && !state.paused) _f.classList.remove('hidden');
      else _f.classList.add('hidden');
    }
    if (state.screen === 'intro') {
      state.introT += dt;
      if (state.introT >= state.introDur) {
        state.screen = 'play';
        var _t=document.getElementById('touch'); if(_t) _t.classList.remove('hidden');
        document.getElementById('hud').classList.remove('hidden');
      }
      state.time += dt;
      return;
    }
    if (state.screen !== 'play' || state.paused) return;

    if (state.inv > 0) state.inv = Math.max(0, state.inv - dt);
    if (state.stun > 0) state.stun = Math.max(0, state.stun - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 18);
    if (state.murk > 0) {
      state.murk = Math.max(0, state.murk - dt);
    }
    if (state.drink > 0) state.drink = Math.max(0, state.drink - dt);
    state.time += dt;
    if (player.laserCooldown > 0) player.laserCooldown = Math.max(0, player.laserCooldown - dt);

    // мир всегда движется
    state.camX += RUN_SPEED * dt;
    state.score += Math.floor(RUN_SPEED * dt / 10);

    if (player.mode === 'jump') {
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y; player.vy = 0; player.onGround = true; player.mode = 'run';
      }
    }
    if (player.mode === 'slide') {
      player.slideT = Math.max(0, player.slideT - dt);
      if (player.slideT <= 0) player.mode = 'run';
    }
    if (player.mode === 'attack') {
      player.attackT = Math.max(0, player.attackT - dt);
      if (player.attackT <= 0) player.mode = 'run';
    }

    spawnNext -= RUN_SPEED * dt;
    if (spawnNext <= 0) { spawnEnemy(); spawnNext = RUN_SPEED * 5 + rand() * 300; }

    itemNext -= RUN_SPEED * dt;
    if (itemNext <= 0) { spawnItem(); itemNext = RUN_SPEED * 2.5 + rand() * 400; }

    state.bonusNext -= dt;
    if (state.bonusNext <= 0 && state.bonus < 5) {
      const wx = state.camX + W + 300 + rand() * 600;
      const wy = GROUND_Y - 50 - rand() * 130;
      items.push({ wx: wx, wy: wy, type: 'bonus', taken: false });
      state.bonusNext = 90 + rand() * 90;
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const sx = e.wx - state.camX;
      if (sx < -220) { enemies.splice(i, 1); continue; }
      if (!e.dead && collidePlayerEnemy(e, sx)) {
        const highJump = (player.mode === 'jump' && player.y < (e.wy || GROUND_Y) - e.h / 2 - 10);
        const okStand = e.type === 'stand' && highJump;
        const okGround = e.type === 'ground' && (player.mode === 'slide');
        if (!okStand && !okGround) {
          hurt();
        } else {
          destroyEnemy(e, i);
        }
      }
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const sx = it.wx - state.camX;
      if (sx < -220) { items.splice(i, 1); continue; }
      if (!it.taken && collidePlayerItem(it, sx)) {
        if (it.type === 'health') startDrink(it);
        else if (it.type === 'pepper') { takePepper(); it.taken = true; items.splice(i, 1); continue; }
        else if (it.type === 'bonus') { takeBonus(); it.taken = true; items.splice(i, 1); continue; }
        items.splice(i, 1);
      }
    }

    updateParticles(dt);
    updateFloats(dt);
    // обновление лазеров
    for (let i = lasers.length - 1; i >= 0; i--) {
      lasers[i].t -= dt;
      if (lasers[i].t <= 0) lasers.splice(i, 1);
    }
  }

  function collidePlayerEnemy(e, sx) {
    const ex = sx - e.w / 2, ey = e.wy || GROUND_Y;
    const eTop = ey - e.h / 2, eBot = ey + e.h / 2;
    const feet = (player.mode === 'jump') ? player.y : GROUND_Y;
    let px = PLAYER_SX - 30, py, pw = 60, ph;
    if (player.mode === 'slide') { px = PLAYER_SX - 30; py = feet - 50; ph = 50; }
    else if (player.mode === 'attack') { px = PLAYER_SX + (player.dir > 0 ? 20 : -70); py = feet - 50; pw = 90; ph = 130; }
    else { px = PLAYER_SX - 30; py = feet - 50; ph = 130; }
    // вертикальное пересечение
    if (py + ph <= eTop || py >= eBot) return false;
    return px < ex + e.w && px + pw > ex;
  }

  function collidePlayerItem(it, sx) {
    const feet = (player.mode === 'jump') ? player.y : GROUND_Y;
    const py = feet - 50, ph = 140;
    const px = PLAYER_SX - 40, pw = 80;
    const iw = 70, ih = 70;
    const ix = sx - iw / 2;
    const iy = (it.wy || (GROUND_Y - 50)) - ih / 2;
    // вертикальное пересечение
    if (py + ph <= iy || py >= iy + ih) return false;
    return px < ix + iw && px + pw > ix;
  }

  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.t += dt;
      if (p.t >= p.life) parts.splice(i, 1);
    }
  }
  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.y += f.vy * dt; f.t -= dt;
      if (f.t <= 0) floats.splice(i, 1);
    }
  }

  function drawBg() {
    const im = images.bg; if (!im || !im.complete) return;
    const scale = (H / im.naturalHeight) * 1.0;
    BG_SCALE = scale;
    const drawW = im.naturalWidth * scale;
    const drawH = im.naturalHeight * scale;
    const offset = (state.camX * scale) % drawW;
    ctx.drawImage(im, -offset, 0, drawW, drawH);
    ctx.drawImage(im, -offset + drawW, 0, drawW, drawH);
  }

  function drawPlayer() {
    if (!anim || !anim.run || anim.run.length === 0) return;
    let frames = player.mode === 'jump' ? anim.jump : (player.mode === 'slide' ? anim.slide : anim.run);
    if (!frames || frames.length === 0) frames = anim.run;
    if (!Number.isFinite(player.frameT)) player.frameT = 0;
    let idx = Math.floor(player.frameT) % frames.length;
    if (idx < 0) idx += frames.length;
    const fr = frames[idx];
    if (!fr || !fr.h) return;
    const dtStep = Number.isFinite(dtGlobal) ? dtGlobal : 0;
    player.frameT += dtStep * (player.mode === 'jump' ? 8 : (player.mode === 'slide' ? 16 : (player.mode === 'attack' ? 14 : 10)));

    const targetH = 120;
    const s = targetH / fr.h;
    const drawW = fr.w * s;
    const drawH = fr.h * s;
    const drawX = PLAYER_SX - drawW / 2;
    const drawY = player.mode === 'jump' ? player.y - drawH : GROUND_Y - drawH;

    ctx.save();
    if (state.inv > 0 && Math.floor(performance.now() / 80) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.drawImage(fr.canvas, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  function drawEnemy(e) {
    const im = images.enemy; if (!im || !im.complete) return;
    const sx = e.wx - state.camX, ey = e.wy || GROUND_Y;
    if (e.type === 'stand') {
      const s = 150 / im.naturalHeight;
      ctx.drawImage(im, sx - im.naturalWidth * s / 2, ey - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
    } else {
      const s = 100 / im.naturalHeight, w = im.naturalWidth * s * 1.15, h = im.naturalHeight * s;
      ctx.drawImage(im, sx - w / 2, ey - h / 2, w, h);
    }
  }

  function drawItem(it) {
    const key = it.type === 'health' ? 'health' : it.type === 'pepper' ? 'murk' : 'bonus';
    const im = images[key]; if (!im || !im.complete) return;
    const sx = it.wx - state.camX, ey = it.wy || (GROUND_Y - 50), s = 80 / im.naturalHeight;
    ctx.save();
    if (it.type === 'pepper') ctx.globalAlpha = 0.85 + 0.15 * Math.sin(state.time * 12);
    ctx.drawImage(im, sx - im.naturalWidth * s / 2, ey - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of parts) {
      const a = 1 - p.t / p.life; if (a <= 0) continue;
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawLasers() {
    for (const l of lasers) {
      const a = l.t / 0.3;
      ctx.save();
      ctx.globalAlpha = a;
      // свечение в глазах
      ctx.fillStyle = '#00ffff';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 6, 0, Math.PI * 2);
      ctx.fill();
      // луч
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + l.dir * l.len, l.y);
      ctx.stroke();
      // яркое ядро
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + l.dir * l.len, l.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFloats() {
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, f.t); ctx.fillStyle = f.color;
      ctx.font = '16px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    let html = '<span class="lives">';
    for (let i = 0; i < MAX_LIVES; i++) {
      const alive = i < state.lives;
      var src = assetUrl('health');
      html += '<img class="heart-img' + (alive ? '' : ' dead') + '" src="' + src + '" width="30" height="30" alt="">';
    }
    html += '</span>';
    html += '<span>СЧЁТ ' + Math.floor(state.score) + '</span>';
    var bsrc = assetUrl('bonus');
    html += '<div class="bonus-bar">';
    html += '<img class="bonus-img" src="' + bsrc + '" width="26" height="26" alt="">';
    for (let i = 0; i < 5; i++) {
      html += '<div class="bonus-seg' + (i < state.bonus ? ' filled' : '') + '"></div>';
    }
    html += '</div>';
    document.getElementById('hud').innerHTML = html;
  }

  function applyMurkDistortion() {
    if (state.murk <= 0) return;
    const t = state.time;
    // Эффект "плывущего" экрана: волнообразное смещение + масштабирование
    const wobbleX = Math.sin(t * 2.5) * 10 + Math.sin(t * 6) * 4;
    const wobbleY = Math.cos(t * 2) * 8 + Math.cos(t * 4.5) * 3;
    const scaleX = 1 + Math.sin(t * 3) * 0.04;
    const scaleY = 1 + Math.cos(t * 2.5) * 0.04;
    ctx.translate(wobbleX, wobbleY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-wobbleX * scaleX, -wobbleY * scaleY);
    // Двоение: сдвиг
    ctx.translate(6 * Math.sin(t * 5), 3 * Math.cos(t * 4));
  }

  let dtGlobal = 0, last = performance.now();
  state.flashTimer = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now; dtGlobal = dt;
    update(dt);

    ctx.save();
    ctx.fillStyle = '#070911'; ctx.fillRect(0, 0, W, H);

    if (!state.paused && state.murk > 0) applyMurkDistortion();
    else if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

    drawBg();

    if (state.screen === 'intro') {
      const cx = W / 2, cy = H / 2;
      const frames = heroSideFrames;
      const t = state.introT;
      const dur = state.introDur;
      const n = frames.length || 1;
      const idx = Math.floor((t / dur) * n) % n;
      ctx.save();
      ctx.translate(cx, cy);
      // лёгкое покачивание/масштаб
      const sc = 1 + 0.05 * Math.sin(t * 6);
      ctx.scale(sc, sc);
      if (frames.length && frames[idx]) {
        const f = frames[idx];
        const s = Math.min(W, H) * 0.45 / Math.max(f.w, f.h);
        ctx.drawImage(f.canvas, -f.w * s / 2, -f.h * s / 2, f.w * s, f.h * s);
      } else if (anim.run && anim.run.length) {
        const fr = anim.run[Math.floor(t * 8) % anim.run.length];
        if (fr && fr.h) {
          const s = (H * 0.4) / fr.h;
          ctx.drawImage(fr.canvas, -fr.w * s / 2, -fr.h * s / 2, fr.w * s, fr.h * s);
        }
      }
      ctx.restore();
      // заголовок
      ctx.save();
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 28px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.fillText('Кислый в путь', cx, H - 60);
      ctx.restore();
    } else {
      for (const e of enemies) drawEnemy(e);
      for (const it of items) drawItem(it);
      drawPlayer(); drawParticles(); drawLasers(); drawFloats();
    }

    ctx.restore();

    if (state.flashTimer > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, state.flashTimer) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (state.screen === 'play' && !state.paused) {
      drawHUD();
    }
    requestAnimationFrame(loop);
  }

  function initAfterLoad() {
    if (images.heroMoves && images.heroMoves.complete && images.heroMoves.naturalWidth > 0) {
      try { anim = buildAnimFromSheet(images.heroMoves); }
      catch (e) { log('anim build error: ' + e, 'error'); }
    }
    GROUND_Y = H - 1;
    player.y = GROUND_Y;
    showSplash();
    loop(performance.now());
  }
  loadAssets();
})();
