// 水底氛圍：光束、氣泡、漂浮微粒、水波光紋、vignette
'use strict';

// 斜射光束（緩慢搖曳、呼吸亮度）
class LightRays {
  constructor(w, h) {
    this.container = new PIXI.Container();
    this.container.blendMode = 'add';
    this.rays = [];
    const tex = Tex.ray();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5, 0);
      s.x = w * (0.08 + 0.84 * (i / (n - 1)) + (Math.random() - 0.5) * 0.06);
      s.y = -20;
      s.rotation = 0.12 + Math.random() * 0.1;
      s.height = h * (0.75 + Math.random() * 0.35);
      s.width = 90 + Math.random() * 200;
      s.alpha = 0.10 + Math.random() * 0.12;
      s._base = s.alpha;
      s._baseRot = s.rotation;
      s._ph = Math.random() * Math.PI * 2;
      s._sp = 0.2 + Math.random() * 0.25;
      this.rays.push(s);
      this.container.addChild(s);
    }
  }
  update(t) {
    for (const s of this.rays) {
      s.alpha = s._base * (0.7 + 0.3 * Math.sin(t * s._sp + s._ph));
      s.rotation = s._baseRot + Math.sin(t * s._sp * 0.6 + s._ph) * 0.025;
    }
  }
}

// 上升氣泡
class Bubbles {
  constructor(w, h, count = 36) {
    this.w = w; this.h = h;
    this.container = new PIXI.Container();
    this.list = [];
    const tex = Tex.bubble();
    for (let i = 0; i < count; i++) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      this.reset(s, true);
      this.list.push(s);
      this.container.addChild(s);
    }
  }
  reset(s, randomY = false) {
    const sc = 0.08 + Math.random() * 0.35;
    s.scale.set(sc);
    s.x = Math.random() * this.w;
    s.y = randomY ? Math.random() * this.h : this.h + 30;
    s.alpha = 0.25 + Math.random() * 0.45;
    s._vy = 0.4 + sc * 2.2;
    s._ph = Math.random() * Math.PI * 2;
    s._wob = 0.4 + Math.random() * 0.9;
  }
  update(t, dt) {
    for (const s of this.list) {
      s.y -= s._vy * dt;
      s.x += Math.sin(t * 1.4 + s._ph) * s._wob * 0.3 * dt;
      if (s.y < -40) this.reset(s);
    }
  }
}

// 漂浮微粒（浮游生物感，分層深度）
class Motes {
  constructor(w, h, count = 60) {
    this.w = w; this.h = h;
    this.container = new PIXI.Container();
    this.list = [];
    const tex = Tex.mote();
    for (let i = 0; i < count; i++) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      s.x = Math.random() * w;
      s.y = Math.random() * h;
      const depth = Math.random();
      s.scale.set(0.08 + depth * 0.22);
      s.alpha = 0.12 + depth * 0.3;
      s._vx = (0.05 + depth * 0.25) * (Math.random() < 0.5 ? -1 : 1);
      s._ph = Math.random() * Math.PI * 2;
      this.list.push(s);
      this.container.addChild(s);
    }
  }
  update(t, dt) {
    for (const s of this.list) {
      s.x += s._vx * dt;
      s.y += Math.sin(t * 0.5 + s._ph) * 0.12 * dt;
      if (s.x < -20) s.x = this.w + 20;
      if (s.x > this.w + 20) s.x = -20;
    }
  }
}

// 水波光紋：兩層平鋪緩慢交錯移動
class Caustics {
  constructor(w, h) {
    this.container = new PIXI.Container();
    this.container.blendMode = 'add';
    const tex = Tex.caustics();
    this.a = new PIXI.TilingSprite({ texture: tex, width: w, height: h });
    this.b = new PIXI.TilingSprite({ texture: tex, width: w, height: h });
    this.a.alpha = 0.07;
    this.b.alpha = 0.05;
    this.b.tileScale.set(1.6);
    this.container.addChild(this.a, this.b);
  }
  update(dt) {
    this.a.tilePosition.x += 0.10 * dt;
    this.a.tilePosition.y += 0.05 * dt;
    this.b.tilePosition.x -= 0.07 * dt;
    this.b.tilePosition.y += 0.03 * dt;
  }
}

// 入水水花：氣泡放射爆發 + 白沫噴濺 + 擴散漣漪
class SplashFX {
  constructor() {
    this.container = new PIXI.Container();
    this.parts = [];   // {sprite, vx, vy, life, maxLife, kind}
    this.ripples = []; // {gfx, age}
    this._bubbleTex = Tex.bubble();
    this._moteTex = Tex.mote();
  }

  burst(x, y) {
    // 白沫往上噴（重力落回）
    for (let i = 0; i < 14; i++) {
      const s = new PIXI.Sprite(this._moteTex);
      s.anchor.set(0.5);
      s.x = x + (Math.random() - 0.5) * 30;
      s.y = y;
      s.scale.set(0.25 + Math.random() * 0.45);
      s.tint = 0xeaf8ff;
      this.container.addChild(s);
      this.parts.push({
        sprite: s, kind: 'foam',
        vx: (Math.random() - 0.5) * 5.5,
        vy: -(4 + Math.random() * 7),
        life: 0, maxLife: 45 + Math.random() * 25,
      });
    }
    // 氣泡放射爆發（往下沉者慢慢上浮）
    for (let i = 0; i < 22; i++) {
      const s = new PIXI.Sprite(this._bubbleTex);
      s.anchor.set(0.5);
      s.x = x; s.y = y + 10;
      s.scale.set(0.1 + Math.random() * 0.3);
      s.alpha = 0.85;
      this.container.addChild(s);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      this.parts.push({
        sprite: s, kind: 'bubble',
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.8,
        life: 0, maxLife: 60 + Math.random() * 50,
      });
    }
    // 兩圈擴散漣漪
    for (let i = 0; i < 2; i++) {
      const g = new PIXI.Graphics();
      g.ellipse(0, 0, 30, 11).stroke({ width: 4 - i, color: 0xd8f1ff, alpha: 0.8 });
      g.x = x; g.y = y;
      this.container.addChild(g);
      this.ripples.push({ gfx: g, age: -i * 8 }); // 第二圈延遲
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      if (p.kind === 'foam') p.vy += 0.22 * dt;     // 白沫受重力
      else p.vy -= 0.06 * dt;                        // 氣泡漸轉上浮
      p.vx *= Math.pow(0.97, dt);
      p.sprite.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        this.container.removeChild(p.sprite);
        p.sprite.destroy();
        this.parts.splice(i, 1);
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      if (r.age < 0) continue;
      const k = r.age / 50;
      r.gfx.scale.set(1 + k * 5);
      r.gfx.alpha = Math.max(0, 0.8 - k);
      if (k >= 1) {
        this.container.removeChild(r.gfx);
        r.gfx.destroy();
        this.ripples.splice(i, 1);
      }
    }
  }
}

// 飼料：三種餌（顆粒/薄片/特別餌），緩沉散開、被魚吃會冒泡，特別餌吃掉冒火花
const FOOD_TYPES = {
  pellets: { tex: 'pellet', tint: 0xffb347, n: 8,  scale: [0.18, 0.12], vy: [0.5, 0.4], wob: [0.3, 0.5], grow: 0.05 },
  flakes:  { tex: 'flake',  tint: 0xc98a4b, n: 16, scale: [0.20, 0.14], vy: [0.18, 0.22], wob: [0.9, 1.0], grow: 0.04, flutter: true },
  treat:   { tex: 'pellet', tint: 0x6fe6ff, n: 5,  scale: [0.24, 0.10], vy: [0.32, 0.25], wob: [0.4, 0.5], grow: 0.11, glow: true },
};

class FoodFX {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.container = new PIXI.Container();
    this.pellets = [];
    this.pops = [];
    this.ripples = [];
    this._tex = { pellet: Tex.pellet(), flake: Tex.flake(), mote: Tex.mote() };
    this._bubbleTex = Tex.bubble();
  }

  // 撒一把飼料：type = pellets|flakes|treat
  drop(x, n, type = 'pellets') {
    const cfg = FOOD_TYPES[type] || FOOD_TYPES.pellets;
    const count = n || cfg.n;
    const spread = type === 'flakes' ? 0.42 : 0.26;   // 薄片撒更廣
    // 水面入水漣漪（A2）：沿撒料寬度開幾圈
    for (let i = 0; i < 3; i++) {
      this.ripple(x + (Math.random() - 0.5) * this.w * spread, this.h * 0.04 + Math.random() * 20);
    }
    for (let i = 0; i < count; i++) {
      const s = new PIXI.Sprite(this._tex[cfg.tex]);
      s.anchor.set(0.5);
      s.tint = cfg.tint;
      s.blendMode = cfg.glow ? 'add' : 'normal';
      s.scale.set(cfg.scale[0] + Math.random() * cfg.scale[1]);
      s.x = x + (Math.random() - 0.5) * this.w * spread;
      s.y = -10 - Math.random() * 50;
      this.container.addChild(s);
      this.pellets.push({
        sprite: s, eaten: false, type,
        grow: cfg.grow, glow: !!cfg.glow, flutter: !!cfg.flutter,
        vy: cfg.vy[0] + Math.random() * cfg.vy[1],
        ph: Math.random() * Math.PI * 2,
        wob: cfg.wob[0] + Math.random() * cfg.wob[1],
        rot: (Math.random() - 0.5) * 0.1,
        baseScale: s.scale.x,
      });
    }
  }

  // 入水漣漪
  ripple(x, y) {
    const g = new PIXI.Graphics();
    g.ellipse(0, 0, 24, 9).stroke({ width: 3, color: 0xcdeeff, alpha: 0.7 });
    g.x = x; g.y = y;
    this.container.addChild(g);
    this.ripples.push({ gfx: g, age: 0 });
  }

  // 吃飽愛心：魚頭上冒出 ❤️ 緩升淡出
  heart(x, y) {
    if (!this._heartTex) this._heartTex = Tex.heart();
    const s = new PIXI.Sprite(this._heartTex);
    s.anchor.set(0.5);
    s.x = x; s.y = y;
    s.scale.set(0.55);
    this.container.addChild(s);
    this.pops.push({ sprite: s, life: 0, kind: 'heart' });
  }

  // 火花爆（特別餌）
  sparkle(x, y) {
    if (!this._sparkTex) this._sparkTex = Tex.sparkle();
    const s = new PIXI.Sprite(this._sparkTex);
    s.anchor.set(0.5);
    s.x = x; s.y = y;
    s.scale.set(0.2);
    s.blendMode = 'add';
    this.container.addChild(s);
    this.pops.push({ sprite: s, life: 0, kind: 'spark' });
  }

  // 打嗝大泡（D3）
  burp(x, y) {
    const b = new PIXI.Sprite(this._bubbleTex);
    b.anchor.set(0.5);
    b.x = x; b.y = y;
    b.scale.set(0.15);
    this.container.addChild(b);
    this.pops.push({ sprite: b, life: 0, kind: 'burp' });
  }

  eat(p) {
    if (p.eaten) return;
    p.eaten = true;
    const x = p.sprite.x, y = p.sprite.y;
    // 吃掉 → 小泡泡 pop
    const b = new PIXI.Sprite(this._bubbleTex);
    b.anchor.set(0.5);
    b.x = x; b.y = y;
    b.scale.set(0.12);
    this.container.addChild(b);
    this.pops.push({ sprite: b, life: 0, kind: 'pop' });
    if (p.glow) this.sparkle(x, y);        // 特別餌 → 火花
    this.container.removeChild(p.sprite);
    p.sprite.destroy();
  }

  update(t, dt) {
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const p = this.pellets[i];
      if (p.eaten) { this.pellets.splice(i, 1); continue; }
      p.sprite.y += p.vy * dt;
      p.sprite.x += Math.sin(t * 1.2 + p.ph) * p.wob * 0.25 * dt;
      if (p.flutter) {                       // 薄片：翻飄 + 自轉
        p.sprite.rotation += p.rot * dt;
        p.sprite.scale.x = p.baseScale * (0.5 + 0.5 * Math.abs(Math.cos(t * 2 + p.ph)));
      }
      if (p.glow) {                          // 特別餌：發光呼吸
        p.sprite.alpha = 0.7 + 0.3 * Math.sin(t * 6 + p.ph);
      }
      if (p.sprite.y > this.h * 0.93) {      // 沉到底 → 淡出消失
        p.sprite.alpha -= 0.02 * dt;
        if (p.sprite.alpha <= 0) {
          this.container.removeChild(p.sprite);
          p.sprite.destroy();
          p.eaten = true;
          this.pellets.splice(i, 1);
        }
      }
    }
    // 漣漪擴散
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const k = r.age / 45;
      r.gfx.scale.set(1 + k * 4);
      r.gfx.alpha = Math.max(0, 0.7 - k * 0.7);
      if (k >= 1) { this.container.removeChild(r.gfx); r.gfx.destroy(); this.ripples.splice(i, 1); }
    }
    // 各種彈出物
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const o = this.pops[i];
      o.life += dt;
      let dur = 35;
      if (o.kind === 'heart') { dur = 60; o.sprite.y -= 1.1 * dt; o.sprite.scale.set(0.55 + o.life * 0.004); }
      else if (o.kind === 'spark') { dur = 28; o.sprite.scale.set(0.2 + o.life * 0.02); o.sprite.rotation += 0.08 * dt; }
      else if (o.kind === 'burp') { dur = 55; o.sprite.y -= 1.4 * dt; o.sprite.scale.set(0.15 + o.life * 0.006); }
      else { o.sprite.y -= 0.8 * dt; o.sprite.scale.set(0.12 + o.life * 0.004); }
      o.sprite.alpha = Math.max(0, 1 - o.life / dur);
      if (o.life >= dur) { this.container.removeChild(o.sprite); o.sprite.destroy(); this.pops.splice(i, 1); }
    }
  }
}

// 前景水草/岩石剪影（蓋在魚前面，魚游過被遮 → 立體感）
class Seaweed {
  constructor(w, h) {
    this.container = new PIXI.Container();
    this.blades = [];
    const bladeTex = Tex.blade();
    const rockTex = Tex.rock();
    // 左右下角兩叢 + 岩石，避開中央
    const clusters = [
      { x: w * 0.06, n: 4, hMax: 0.55 },
      { x: w * 0.13, n: 2, hMax: 0.32 },
      { x: w * 0.90, n: 4, hMax: 0.6 },
      { x: w * 0.82, n: 2, hMax: 0.3 },
    ];
    for (const rx of [0.04, 0.93]) {
      const r = new PIXI.Sprite(rockTex);
      r.anchor.set(0.5, 1);
      r.x = w * rx; r.y = h + 8;
      r.width = w * 0.22; r.height = h * 0.13;
      this.container.addChild(r);
    }
    for (const cl of clusters) {
      for (let i = 0; i < cl.n; i++) {
        const s = new PIXI.Sprite(bladeTex);
        s.anchor.set(0.5, 1);             // 底部錨定，搖曳像長在地上
        s.x = cl.x + (Math.random() - 0.5) * w * 0.05;
        s.y = h + 5;
        s.height = h * (cl.hMax * (0.6 + Math.random() * 0.4));
        s.width = s.height * 0.22;
        if (Math.random() < 0.5) s.scale.x *= -1;
        s._ph = Math.random() * Math.PI * 2;
        s._sp = 0.35 + Math.random() * 0.3;
        s._amp = 0.05 + Math.random() * 0.05;
        this.blades.push(s);
        this.container.addChild(s);
      }
    }
  }
  update(t) {
    for (const s of this.blades) {
      s.rotation = Math.sin(t * s._sp + s._ph) * s._amp;
      s.skew.x = Math.sin(t * s._sp * 0.7 + s._ph) * s._amp * 0.8;
    }
  }
}

function makeVignette(w, h) {
  const s = new PIXI.Sprite(Tex.vignette());
  s.width = w; s.height = h;
  return s;
}
