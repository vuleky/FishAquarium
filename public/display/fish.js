// 魚：網格波動（尾巴擺動）+ 正弦漂浮 + 狀態機（入場/游動/離場/主打）
'use strict';

// 尺寸「號數」1~5 → 螢幕高度比例（幾何級距：1號=10%、3號≈16%、5號=25%）
function sizeToRatio(size) {
  const s = Math.min(5, Math.max(1, size || 3));
  return 0.10 * Math.pow(2.5, (s - 1) / 4);
}

class Fish {
  // data: {id, name, file}; opts: {ratio 高度比例, boost 入場放大倍率}
  static async create(data, w, h, opts = {}) {
    const tex = await PIXI.Assets.load({ src: '/data/fish/' + data.file + '?v=' + (data.v || 0), loadParser: 'loadTextures' });
    return new Fish(data, tex, w, h, opts);
  }

  constructor(data, tex, w, h, opts = {}) {
    this.id = data.id;
    this.name = data.name || '';
    this.w = w; this.h = h;
    this.texH = tex.height;

    // 深度：遠(0)小暗、近(1)大亮（範圍收窄，遠的魚也要看得清楚）
    this.depth = Math.random();
    this.depthF = 0.78 + 0.37 * this.depth;
    this.sizeMul = Math.max(1, opts.boost || 1);  // 新魚入場放大，隨時間縮回 1
    this.ratio = opts.ratio || sizeToRatio(3);    // 全域基準
    this.userSize = data.size || 1;               // 個別縮放（admin 設，鯨魚可到 4x）
    this.baseScale = this._calcScale();

    this.mesh = new PIXI.MeshPlane({ texture: tex, verticesX: 14, verticesY: 4 });
    this.mesh.pivot.set(tex.width / 2, tex.height / 2);
    const buf = this.mesh.geometry.getBuffer('aPosition') || this.mesh.geometry.getBuffer('aVertexPosition');
    this.posBuf = buf;
    this.origPos = Float32Array.from(buf.data);
    this.texW = tex.width;

    this.flip = new PIXI.Container();   // 翻面用
    this.flip.addChild(this.mesh);
    this.root = new PIXI.Container();   // 位置/縮放/深度
    this.root.addChild(this.flip);
    this.root.scale.set(this.baseScale * this.sizeMul);
    this.root.zIndex = this.depth;
    // 遠的魚偏藍偏暗 → 融入水中
    const t = 0.55 + 0.45 * this.depth;
    this.mesh.tint = rgb(150 + 105 * t, 190 + 65 * t, 230 + 25 * t);
    this._baseTint = this.mesh.tint;   // 吃東西閃白後要還原
    this.root.alpha = 0.82 + 0.18 * this.depth;

    // 游動參數（大魚游得慢、擺得緩 → 鯨魚感）
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.speed = (0.55 + Math.random() * 0.7) / Math.sqrt(this.userSize);
    this.bobA = 10 + Math.random() * 18;            // 上下擺幅
    this.bobF = 0.4 + Math.random() * 0.5;
    this.ph = Math.random() * Math.PI * 2;
    this.waveF = (2.2 + Math.random() * 1.4) / Math.sqrt(this.userSize); // 尾擺頻率
    this.waveA = tex.height * (0.05 + Math.random() * 0.04);
    this.baseY = h * (0.18 + 0.64 * Math.random());
    this.homeY = this.baseY;                         // 自己的「常駐深度」，餵食後會回來
    this.driftV = (Math.random() - 0.5) * 0.05;     // 緩慢垂直漂
    this.burst = 0;                                  // 衝刺剩餘
    this.nextWhim = 4 + Math.random() * 8;          // 下次衝刺/發呆倒數(秒)
    this.idle = 0;

    this.onExited = null;
    this.onSplash = null;   // 入水瞬間回呼（水花特效 + 音效）
    this.featureT = 0;
    this.follow = null;     // 群游：{target, dx, dy, t}
    this.turning = null;    // 慣性轉向：{from, to, t}
    this._bank = 0;         // 轉向側傾
    this.headDir = data.headDir === -1 ? -1 : 1; // 圖中魚頭朝向（修倒退游）
    this._chase = null;     // 獵食目標（最大魚專屬）
    this._foodTarget = null; // 飼料目標
    this.feedMul = 1;        // 餵食成長倍率（吃越多越大，慢慢消退）
    this._gulp = 0;          // 咬食縮放脈衝計時
    this._flash = 0;         // 吃到閃白計時
    this._fed = 0;           // 已吃幾口（打嗝用）
    if (opts.drop) {
      // 華麗進場：從上方被丟進魚缸
      this.state = 'drop';
      this.root.x = w * (0.22 + 0.56 * Math.random());
      this.root.y = -tex.height * this.baseScale * this.sizeMul - 40;
      this._dropV = 12 + Math.random() * 4;   // 初始落速
      this._splashed = false;
    } else {
      this.state = 'enter';
      this.root.x = this.dir === 1 ? -tex.width * this.baseScale : w + tex.width * this.baseScale;
      this.root.y = this.baseY;
    }
    this._applyFlip();
  }

  _applyFlip() { this.flip.scale.x = this.dir * this.headDir; }

  setHeadDir(hd) {
    this.headDir = hd === -1 ? -1 : 1;
    if (!this.turning) this._applyFlip();
  }

  _calcScale() {
    return (this.h * this.ratio * this.depthF * this.userSize) / this.texH;
  }

  // admin 改基準尺寸 → 即時重算（feature 中不打斷，結束會 tween 回新尺寸）
  setSizeRatio(ratio) {
    this.ratio = ratio;
    this.baseScale = this._calcScale();
    if (this.state !== 'feature') this._tweenScaleBack = true;
  }

  // admin 改個別縮放
  setUserSize(s) {
    this.userSize = s || 1;
    this.baseScale = this._calcScale();
    if (this.state !== 'feature') this._tweenScaleBack = true;
  }

  startExit() {
    if (this.state === 'feature') return;
    this._dropFollow();
    this.turning = null; this._bank = 0; this._applyFlip();
    this.state = 'exit';
  }

  // 慣性轉向：減速 → 壓身翻面 → 加速（大魚轉得慢）
  _startTurn(to) {
    if (this.turning || to === this.dir) return;
    this.turning = { from: this.dir, to, t: 0 };
  }

  _dropFollow() {
    if (!this.follow) return;
    const L = this.follow.target;
    if (L && !L.root.destroyed) L._nFollow = Math.max(0, (L._nFollow || 0) - 1);
    this.follow = null;
  }

  startFeature() {
    this.state = 'feature';
    this.featureT = 8; // 秒
    this.root.zIndex = 1000; // 亮相時浮到最前面，不被別的魚擋住
  }

  // 換一個新的常駐深度（餵食結束散開、增加活潑感）
  scatterHome(h) {
    this.homeY = h * (0.16 + 0.68 * Math.random());
    this.burst = Math.max(this.burst, 0.4);
  }

  // 吃到一口飼料 → 咬食脈衝 + 閃白
  onEat() {
    this._gulp = 1;
    this._flash = 1;
    this.burst = Math.max(this.burst, 0.3); // 吃到瞬間小衝刺
    this._fed++;
  }

  // t: 秒, dt: frame 倍率(60fps=1), speedMul: 全域速度
  update(t, dt, speedMul) {
    const { w, h } = this;
    this._wave(t);

    // 新魚入場放大 → 約 40 秒平滑縮回基準
    if (this.sizeMul > 1) {
      this.sizeMul = Math.max(1, this.sizeMul - 0.015 * (dt / 60));
    }
    // 餵食成長慢慢消退（約幾分鐘回到原大小 → 持續餵才能保持大）
    if (this.feedMul > 1) {
      this.feedMul = Math.max(1, this.feedMul - 0.00003 * dt);
    }
    // 咬食脈衝（C2）：吃到瞬間身體快速一脹一縮
    let gulpS = 1;
    if (this._gulp > 0) {
      this._gulp = Math.max(0, this._gulp - dt / 14);
      gulpS = 1 + Math.sin(this._gulp * Math.PI) * 0.16;
    }
    if (this.state !== 'feature' && !this._tweenScaleBack) {
      this.root.scale.set(this.baseScale * this.sizeMul * this.feedMul * gulpS);
    }
    // 吃到閃白（D1）
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt / 18);
      const k = this._flash;
      const br = this._baseTint >> 16 & 255, bg = this._baseTint >> 8 & 255, bb = this._baseTint & 255;
      this.mesh.tint = rgb(br + (255 - br) * k, bg + (255 - bg) * k, bb + (255 - bb) * k);
      if (this._flash === 0) this.mesh.tint = this._baseTint;
    }

    const halfW = (this.texW * this.baseScale) / 2;
    let v = this.speed * speedMul;

    // 偶發行為：衝刺 / 漂浮發呆
    this.nextWhim -= dt / 60;
    if (this.nextWhim <= 0) {
      if (Math.random() < 0.5) this.burst = 1.2;
      else this.idle = 1.5 + Math.random();
      this.nextWhim = 5 + Math.random() * 10;
    }
    if (this.burst > 0) { this.burst -= dt / 60; v *= 2.6; }
    if (this.idle > 0) { this.idle -= dt / 60; v *= 0.15; }

    // 慣性轉向進行中：減速、壓身、過半才換方向
    if (this.turning) {
      const tn = this.turning;
      tn.t += dt / (38 * Math.sqrt(this.userSize));
      const tt = Math.min(1, tn.t);
      this.flip.scale.x = tn.from * this.headDir * Math.cos(Math.PI * tt);
      this._bank = Math.sin(Math.PI * tt) * 0.18 * tn.from;
      v *= 0.3 + 0.7 * Math.abs(Math.cos(Math.PI * tt));
      if (tt >= 0.5 && this.dir !== tn.to) this.dir = tn.to;
      if (tt >= 1) { this.turning = null; this._bank = 0; this._applyFlip(); }
    }

    switch (this.state) {
      case 'drop': {
        this.root.y += this._dropV * dt;
        if (!this._splashed) {
          this._dropV += 0.28 * dt;                       // 空中重力加速
          this.root.rotation += 0.012 * this.dir * dt;    // 落下微翻滾
          if (this.root.y > h * 0.04) {
            this._splashed = true;
            if (this.onSplash) this.onSplash(this.root.x, Math.max(this.root.y, h * 0.06));
          }
        } else {
          this._dropV *= Math.pow(0.94, dt);              // 水中阻力減速
          // 搖晃幅度隨速度收斂 → 穩住
          this.root.rotation = Math.sin(t * 5 + this.ph) * Math.min(0.35, this._dropV * 0.05);
          if (this.root.y > h * 0.82) this._dropV = Math.min(this._dropV, 1.2); // 別沉到底
          if (this._dropV < 0.7) {
            this.state = 'swim';
            this.baseY = Math.min(Math.max(this.root.y, h * 0.15), h * 0.8);
            this.root.rotation = 0;
          }
        }
        break;
      }
      case 'enter':
        this.root.x += v * 1.4 * this.dir * dt;
        if (this.root.x > halfW + 30 && this.root.x < w - halfW - 30) this.state = 'swim';
        break;
      case 'swim': {
        // 覓食：游向飼料
        if (this._foodTarget && !this._chase) {
          const p = this._foodTarget;
          if (p.eaten) {
            this._foodTarget = null;
          } else {
            const toward = p.sprite.x > this.root.x ? 1 : -1;
            if (this.dir !== toward) this._startTurn(toward);
            v *= 1.7;
            this.baseY += (p.sprite.y - this.baseY) * (1 - Math.pow(0.985, dt));
            // 搶食騷動（C1）：接近飼料時猛衝撲咬
            const gap = Math.hypot(p.sprite.x - this.root.x, p.sprite.y - this.root.y);
            if (gap < this.texH * this.baseScale * 1.2 && this.burst <= 0) this.burst = 0.35;
          }
        }
        // 獵食：最大魚追小魚（加速衝向獵物）
        if (this._chase) {
          const P = this._chase;
          if (P.root.destroyed || P.state === 'exit') {
            this._chase = null;
          } else {
            const toward = P.root.x > this.root.x ? 1 : -1;
            if (this.dir !== toward) this._startTurn(toward);
            v *= 2.0;
            this.baseY += (P.baseY - this.baseY) * (1 - Math.pow(0.99, dt));
          }
        }
        // 群游：跟著隊長（對齊方向、貼齊深度、保持隊形距離）
        if (this.follow) {
          const L = this.follow.target;
          this.follow.t -= dt;
          if (!L || L.root.destroyed || L.state !== 'swim' || this.follow.t <= 0) {
            this._dropFollow();
          } else {
            if (L.dir !== this.dir) this._startTurn(L.dir);
            const tx = L.root.x - L.dir * this.follow.dx;   // 隊長後方定位
            const gap = (tx - this.root.x) * this.dir;
            v *= Math.max(0.5, Math.min(1.8, 1 + gap / 220)); // 落後加速、超前減速
            this.baseY += ((L.baseY + this.follow.dy) - this.baseY) * (1 - Math.pow(0.985, dt));
          }
        }
        // 前景遮蔽區 → 放慢（躲在水草後的感覺）
        for (const z of Fish.hideZones) {
          if (this.root.y > z.yMin && Math.abs(this.root.x - z.x) < z.r) { v *= 0.45; break; }
        }
        this.root.x += v * this.dir * dt;
        if (!this.turning &&
            ((this.dir === 1 && this.root.x > w - halfW - 30) ||
             (this.dir === -1 && this.root.x < halfW + 30))) {
          this._startTurn(-this.dir);
        }
        break;
      }
      case 'exit': {
        // 游向較近的邊
        if (this._exitDir === undefined) {
          this._exitDir = this.root.x > w / 2 ? 1 : -1;
          if (this._exitDir !== this.dir) { this.dir = this._exitDir; this._applyFlip(); }
        }
        this.root.x += v * 1.6 * this.dir * dt;
        if (this.root.x < -halfW * 2 || this.root.x > w + halfW * 2) {
          if (this.onExited) this.onExited(this);
          return;
        }
        break;
      }
      case 'feature': {
        this.featureT -= dt / 60;
        const k = 1 - Math.pow(0.92, dt);
        // 中心可校正（投影機解析度/overscan 偏移）
        this.root.x += (w * Fish.center.x - this.root.x) * k;
        this.baseY += (h * Fish.center.y - this.baseY) * k;
        const target = this.baseScale * 1.8;
        this.root.scale.x += (target - this.root.scale.x) * k;
        this.root.scale.y = this.root.scale.x;
        if (this.featureT <= 0) {
          this.state = 'swim';
          this._tweenScaleBack = true;
          this.root.zIndex = this.depth;   // 還原深度層級
          this.homeY = h * (0.18 + 0.64 * Math.random()); // 亮相完換個位置游
        }
        break;
      }
    }
    if (this._tweenScaleBack) {
      const target = this.baseScale * this.sizeMul * this.feedMul;
      const k = 1 - Math.pow(0.95, dt);
      this.root.scale.x += (target - this.root.scale.x) * k;
      this.root.scale.y = this.root.scale.x;
      if (Math.abs(this.root.scale.x - target) < target * 0.02) this._tweenScaleBack = false;
    }

    // 邊界硬限制：追逐/群游/覓食再快也不准跑出畫面（swim 限定）
    if (this.state === 'swim') {
      const lo = Math.min(halfW * 0.5, w * 0.45);
      this.root.x = Math.max(lo, Math.min(w - lo, this.root.x));
    }
    this.baseY = Math.max(h * 0.08, Math.min(h * 0.9, this.baseY));

    // 垂直：正弦漂浮 + 緩慢漂移（落水中不套用）
    if (this.state === 'drop') return;
    // 巡游離場：走直線（保持三行整齊），只輕微上下擺
    if (this.state === 'exit' && this._parade) {
      this.root.y = this.baseY + Math.sin(t * this.bobF + this.ph) * this.bobA * 0.5;
      this.root.rotation = this._bank;
      return;
    }
    if (this.state !== 'feature') {
      // 沒在追飼料時，慢慢回到自己的常駐深度 → 餵食後不會全擠同一條水平線
      if (!this._foodTarget && !this._chase) {
        this.baseY += (this.homeY - this.baseY) * (1 - Math.pow(0.993, dt));
      }
      this.baseY += this.driftV * dt;
      const lo = h * 0.12, hi = h * 0.88;
      if (this.baseY < lo || this.baseY > hi) this.driftV *= -1;
      this.root.y = this.baseY + Math.sin(t * this.bobF + this.ph) * this.bobA;
      this.root.rotation = Math.cos(t * this.bobF + this.ph) * 0.04 * this.dir + this._bank;
    } else {
      this.root.y = this.baseY + Math.sin(t * this.bobF + this.ph) * this.bobA * 0.4;
    }
  }

  // 網格波動：越靠尾端擺幅越大
  _wave(t) {
    const d = this.posBuf.data, o = this.origPos;
    // 搶食時尾巴擺更急（C1）
    const eager = (this._foodTarget && !this._foodTarget.eaten) ? 1.6 : 1;
    const speedNow = (this.burst > 0 ? 2.2 : (this.idle > 0 ? 0.5 : 1)) * eager;
    for (let i = 0; i < d.length; i += 2) {
      const xn = o[i] / this.texW;             // 0..1
      const amp = this.waveA * (0.15 + 0.85 * xn);
      d[i + 1] = o[i + 1] + Math.sin(t * this.waveF * speedNow - xn * 4.2 + this.ph) * amp;
      d[i] = o[i] + Math.sin(t * this.waveF * speedNow * 0.5 + this.ph) * 1.5 * xn;
    }
    this.posBuf.update();
  }

  destroy() {
    this._dropFollow();
    this.root.destroy({ children: true });
  }
}

Fish.hideZones = []; // 前景遮蔽區（aquarium 依 fgDecor 設定）
Fish.center = { x: 0.5, y: 0.5 }; // 亮相中心，可被投影校正偏移覆寫

// 寶寶魚：媽媽的縮小版（輕量 Sprite，不做網格變形 → 效能無虞），跟在媽媽身旁
class Baby {
  constructor(mother) {
    this.mother = mother;
    this.rel = 0.28 + Math.random() * 0.14;          // 相對媽媽大小
    const s = new PIXI.Sprite(mother.mesh.texture);
    s.anchor.set(0.5);
    s.tint = mother._baseTint;
    s.alpha = 0;                                      // 淡入
    this.sprite = s;
    this.ph = Math.random() * Math.PI * 2;
    this.bobA = 5 + Math.random() * 7;
    this.bobF = 1.3 + Math.random() * 0.9;
    this.offDist = 0.45 + Math.random() * 0.6;        // 落在媽媽後方多遠（×媽媽寬）
    this.offY = (Math.random() - 0.5) * 0.7;          // 上下偏移（×媽媽高）
    this.x = mother.root.x;
    this.y = mother.baseY;
    this.dead = false;
  }
  update(t, dt) {
    const m = this.mother;
    if (!m || m.root.destroyed || m.state === 'exit') { // 媽媽走了 → 淡出消失
      this.sprite.alpha -= 0.015 * dt;
      this.sprite.y += 0.4 * dt;
      if (this.sprite.alpha <= 0) this.dead = true;
      return;
    }
    const mScale = Math.abs(m.root.scale.y);
    const dispW = m.texW * mScale, dispH = m.texH * mScale;
    const tx = m.root.x - m.dir * dispW * this.offDist;
    const ty = m.baseY + this.offY * dispH;
    const k = 1 - Math.pow(0.88, dt);                 // 跟隨延遲 → 自然拖尾
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.sprite.x = this.x;
    this.sprite.y = this.y + Math.sin(t * this.bobF + this.ph) * this.bobA;
    const sc = mScale * this.rel;
    this.sprite.scale.set(sc);
    this.sprite.scale.x = sc * m.dir * m.headDir;     // 跟媽媽同方向
    this.sprite.rotation = Math.sin(t * this.bobF + this.ph) * 0.14 * m.dir;
    this.sprite.zIndex = m.depth - 0.001;
    if (this.sprite.alpha < 1) this.sprite.alpha = Math.min(1, this.sprite.alpha + 0.04 * dt);
  }
  destroy() { this.sprite.destroy(); }
}

function rgb(r, g, b) {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
