// 環境音效：WebAudio 合成（水底低鳴 + 隨機氣泡聲），不需音檔
'use strict';
const Sound = (() => {
  let ctx = null, master = null, running = false, bubbleTimer = null;
  let volume = 0.5;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume * 0.6;
    master.connect(ctx.destination);

    // 棕色噪音 → lowpass：水底低鳴
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ctx.createGain(); g.gain.value = 0.5;
    // 緩慢起伏
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.18;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
  }

  function blip() {
    if (!ctx || !running) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = 400 + Math.random() * 900;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f0 * (1.8 + Math.random()), ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + 0.2);
  }

  function scheduleBubbles() {
    clearTimeout(bubbleTimer);
    if (!running) return;
    blip();
    if (Math.random() < 0.4) setTimeout(blip, 90 + Math.random() * 120);
    bubbleTimer = setTimeout(scheduleBubbles, 1500 + Math.random() * 5000);
  }

  return {
    // 需在使用者手勢後呼叫（點擊/按鍵）
    setOn(on) {
      running = on;
      if (on) {
        try { ensure(); ctx.resume(); scheduleBubbles(); } catch {}
        if (master) master.gain.value = volume * 0.6;
      } else if (master) {
        master.gain.value = 0;
        clearTimeout(bubbleTimer);
      }
    },
    setVolume(v) {
      volume = v;
      if (master && running) master.gain.value = volume * 0.6;
    },
    splash() { blip(); setTimeout(blip, 80); setTimeout(blip, 170); }, // 小氣泡串

    // 撒料：一串輕脆灑落聲（高頻短噪音粒）
    scatter() {
      if (!ctx || !running) return;
      const t0 = ctx.currentTime;
      for (let i = 0; i < 14; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f0 = 1800 + Math.random() * 2600;
        const dt = i * 0.018 + Math.random() * 0.01;
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, t0 + dt);
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.02, t0 + dt + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.05);
        o.connect(g); g.connect(master);
        o.start(t0 + dt); o.stop(t0 + dt + 0.06);
      }
    },

    // 咬一口：很短的「噗」
    nibble() {
      if (!ctx || !running) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(320 + Math.random() * 180, t0);
      o.frequency.exponentialRampToValueAtTime(140, t0 + 0.07);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.1);
    },

    // 打嗝：低頻往上滑的「咕嚕」
    burp() {
      if (!ctx || !running) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90, t0);
      o.frequency.exponentialRampToValueAtTime(170, t0 + 0.18);
      o.frequency.exponentialRampToValueAtTime(70, t0 + 0.32);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 500;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.36);
    },

    // 入水「撲通」：低頻 thump + 噪音水花
    plunge() {
      if (!ctx || !running) return;
      const t0 = ctx.currentTime;
      // 低頻 thump
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.setValueAtTime(150, t0);
      o.frequency.exponentialRampToValueAtTime(55, t0 + 0.25);
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(og); og.connect(master);
      o.start(t0); o.stop(t0 + 0.45);
      // 噪音水花（高通往低通掃）
      const len = ctx.sampleRate * 0.4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(2400, t0);
      f.frequency.exponentialRampToValueAtTime(500, t0 + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0);
      // 尾隨小氣泡
      setTimeout(blip, 250); setTimeout(blip, 420);
    },
  };
})();
