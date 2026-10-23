/* Звуки игры (Web Audio: осцилляторы + шум, без внешних файлов) */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, endFreq) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol || 0.15;
    src.connect(g); g.connect(master);
    src.start(t);
  }

  const Sound = {
    unlock: function () { ac(); },
    isMuted: function () { return muted; },
    toggleMute: function () { muted = !muted; return muted; },

    // прыжок
    jump: function () { tone(700, 0.09, 'square', 0.10, 1100); },
    // подкат
    slide: function () { tone(220, 0.14, 'sawtooth', 0.10, 70); noise(0.06, 0.10); },
    // глоток из бутылки
    gulp: function () { tone(170, 0.11, 'sawtooth', 0.11, 130); },
    // пополнение здоровья (конец питья)
    refill: function () {
      [520, 690, 920, 1150].forEach(function (f, i) {
        root.setTimeout(function () { tone(f, 0.16, 'square', 0.10); }, i * 110);
      });
    },
    // подбор артефакта / бонуса
    pickup: function () {
      tone(880, 0.08, 'square', 0.10);
      root.setTimeout(function () { tone(1320, 0.12, 'square', 0.10); }, 70);
    },
    // мутность подобрана
    murk: function () {
      tone(260, 0.2, 'sawtooth', 0.12, 110);
      root.setTimeout(function () { noise(0.2, 0.12); }, 120);
    },
    // урон / потеря жизни
    hurt: function () { tone(420, 0.35, 'sawtooth', 0.14, 70); noise(0.25, 0.18); },
    // старт игры
    start: function () {
      tone(523, 0.09, 'square', 0.1);
      root.setTimeout(function () { tone(784, 0.09, 'square', 0.1); }, 90);
      root.setTimeout(function () { tone(1046, 0.16, 'square', 0.1); }, 180);
    },
    // конец игры
    over: function () {
      const notes = [392, 330, 262, 196];
      notes.forEach(function (n, i) {
        root.setTimeout(function () { tone(n, 0.3, 'square', 0.12); }, i * 200);
      });
    }
  };

  root.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
