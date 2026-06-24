// 投影頁主程式：背景輪播 + 魚輪替 + 氛圍特效 + WebSocket 即時更新
'use strict';
(async () => {
  const app = new PIXI.Application();
  await app.init({ resizeTo: window, background: '#021a33', antialias: true });
  document.body.appendChild(app.canvas);
  let W = app.screen.width, H = app.screen.height;

  let config = { bgIntervalSec: 45, maxFishOnScreen: 10, fishOnScreenSec: 60, swimSpeed: 1, soundOn: false, volume: 0.5, paused: false };

  // ---- 圖層 ----
  const water = new PIXI.Container();        // 受水波位移影響的部分
  const bgLayer = new PIXI.Container();
  const caustics = new Caustics(W, H);
  const shadowGfx = new PIXI.Graphics();     // 沙地柔影（單一 Graphics 每幀重畫）
  const fishLayerFar = new PIXI.Container();  // 遠景魚（共用一個模糊濾鏡）
  const farBlurFilter = [new PIXI.BlurFilter({ strength: 3 })];
  fishLayerFar.filters = farBlurFilter;
  const fishLayer = new PIXI.Container();
  fishLayer.sortableChildren = true;
  const seaweed = new Seaweed(W, H);         // 程序化前景（蓋在魚前）
  const fgLayer = new PIXI.Container();      // 背景配對的前景圖（蓋在魚前）
  const splashFx = new SplashFX();           // 入水水花（最上層）
  const food = new FoodFX(W, H);             // 飼料
  water.addChild(bgLayer, caustics.container, shadowGfx, fishLayerFar, fishLayer, food.container, seaweed.container, fgLayer, splashFx.container);

  const bubbles = new Bubbles(W, H);
  const rays = new LightRays(W, H);
  const motes = new Motes(W, H);
  const vignette = makeVignette(W, H);
  // 晨昏→深夜色調 overlay（蓋全場做色彩氛圍）
  const dayOverlay = new PIXI.Sprite(PIXI.Texture.WHITE);
  dayOverlay.width = W; dayOverlay.height = H; dayOverlay.alpha = 0;
  app.stage.addChild(water, bubbles.container, rays.container, motes.container, vignette, dayOverlay);

  // 時段循環：dawn→noon→dusk→night→…，config.dayCycleSec 一輪秒數（0=關，固定中午）
  // ponytail: 純色 overlay 做色調；真正的「魚輪廓螢光」需 per-fish glow filter，量大再加
  const DAY_PHASES = [
    { tint: 0xff9a4d, alpha: 0.20 }, // 晨：暖橘
    { tint: 0xffffff, alpha: 0.00 }, // 午：清澈
    { tint: 0xff7a3c, alpha: 0.24 }, // 昏：橘紫
    { tint: 0x05143a, alpha: 0.52 }, // 夜：深藍壓暗
  ];
  function lerpColor(a, b, t) {
    const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
    const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
    return ((ar + (br - ar) * t) & 255) << 16 | ((ag + (bg - ag) * t) & 255) << 8 | ((ab + (bb - ab) * t) & 255);
  }
  function updateDayCycle(tSec) {
    const dur = config.dayCycleSec || 0;
    if (dur <= 0) { dayOverlay.alpha = 0; return; }
    const p = (tSec % dur) / dur * DAY_PHASES.length; // 0..4
    const i = Math.floor(p) % DAY_PHASES.length;
    const j = (i + 1) % DAY_PHASES.length;
    const f = p - Math.floor(p);
    const a = DAY_PHASES[i], b = DAY_PHASES[j];
    dayOverlay.tint = lerpColor(a.tint, b.tint, f);
    dayOverlay.alpha = a.alpha + (b.alpha - a.alpha) * f;
  }

  // 沙地柔影：每隻魚在底部投一抹淡影（單一 Graphics，每幀重畫）
  function drawShadows() {
    shadowGfx.clear();
    const floorY = H * 0.9;
    for (const f of fishMgr.active.values()) {
      if (f.state === 'drop') continue;
      const w = f.texW * Math.abs(f.root.scale.x);
      shadowGfx.ellipse(f.root.x, floorY, w * 0.4, w * 0.1).fill({ color: 0x000000, alpha: 0.16 });
    }
  }

  // 水中晃動（位移濾鏡）
  const noiseSprite = new PIXI.Sprite(Tex.noise());
  noiseSprite.texture.source.addressMode = 'repeat';
  app.stage.addChild(noiseSprite);
  noiseSprite.renderable = false;
  const disp = new PIXI.DisplacementFilter({ sprite: noiseSprite, scale: 12 });
  water.filters = [disp];

  // 背景專屬：可調動感（位移）+ 暗度/對比（前景圖同步套用，色調一致）
  const bgDisp = new PIXI.DisplacementFilter({ sprite: noiseSprite, scale: 0 });
  const bgColor = new PIXI.ColorMatrixFilter();
  bgLayer.filters = [bgDisp, bgColor];
  fgLayer.filters = [bgColor];

  // ---- 背景輪播 ----
  const bg = {
    list: [], idx: -1, timer: 0,
    cur: null, prev: null, fadeT: 1,
    // entry: {file, fg} 或 null（用內建背景）
    async show(entry) {
      let tex, fgTex = null;
      if (entry && entry.file) {
        try { tex = await PIXI.Assets.load('/data/backgrounds/' + entry.file); }
        catch { tex = Tex.defaultBg(W, H); }
        if (entry.fg) {
          try { fgTex = await PIXI.Assets.load('/data/foregrounds/' + entry.fg + '?v=' + Date.now()); }
          catch { fgTex = null; }
        }
      } else tex = Tex.defaultBg(W, H);
      const s = new PIXI.Sprite(tex);
      coverFit(s, tex, W, H);
      s.alpha = 0;
      s._kb = { t: 0, dur: Math.max(config.bgIntervalSec, 20), zoom: 1.06 + Math.random() * 0.05, dx: (Math.random() - 0.5) * 0.04, dy: (Math.random() - 0.5) * 0.03 };
      if (fgTex) {
        // 前景與背景同步 cover-fit + Ken Burns + 淡入淡出
        const f = new PIXI.Sprite(fgTex);
        coverFit(f, fgTex, W, H);
        f.alpha = 0;
        s._fg = f;
        fgLayer.addChild(f);
      }
      this._drop(this.prev);
      this.prev = this.cur;
      this.cur = s;
      this.fadeT = 0;
      bgLayer.addChild(s);
    },
    _drop(s) {
      if (!s) return;
      if (s._fg) { fgLayer.removeChild(s._fg); s._fg.destroy(); }
      bgLayer.removeChild(s);
      s.destroy();
    },
    next() {
      if (!this.list.length) { this.show(null); return; }
      this.idx = (this.idx + 1) % this.list.length;
      this.show(this.list[this.idx]);
    },
    setList(list) {
      const had = this.list.length;
      this.list = list || [];
      if (!had && this.list.length) { this.idx = -1; this.next(); }
      if (!this.list.length && this.cur) this.show(null);
    },
    update(dt) {
      this.timer += dt / 60;
      if (this.timer >= config.bgIntervalSec && this.list.length > 1) { this.timer = 0; this.next(); }
      if (this.fadeT < 1) {
        this.fadeT = Math.min(1, this.fadeT + dt / 90); // 1.5 秒淡入
        if (this.cur) setBgAlpha(this.cur, this.fadeT);
        if (this.prev) setBgAlpha(this.prev, 1 - this.fadeT);
      } else if (this.prev) {
        this._drop(this.prev); this.prev = null;
      }
      // Ken Burns 緩慢縮放平移（前景同步）
      for (const s of [this.cur, this.prev]) {
        if (!s || !s._kb) continue;
        const k = s._kb;
        k.t += dt / 60;
        const p = Math.min(1, k.t / k.dur);
        const z = 1 + (k.zoom - 1) * p;
        const x = W / 2 + W * k.dx * p, y = H / 2 + H * k.dy * p;
        s.scale.set(s._cover * z); s.x = x; s.y = y;
        if (s._fg) { s._fg.scale.set(s._fg._cover * z); s._fg.x = x; s._fg.y = y; }
      }
    },
  };

  function setBgAlpha(s, a) {
    s.alpha = a;
    if (s._fg) s._fg.alpha = a;
  }

  function coverFit(s, tex, w, h) {
    s.anchor.set(0.5);
    s.x = w / 2; s.y = h / 2;
    s._cover = Math.max(w / tex.width, h / tex.height);
    s.scale.set(s._cover);
  }

  // ---- 魚輪替 ----
  const fishMgr = {
    roster: new Map(),   // id → data
    queue: [],           // 等待入場的 id
    active: new Map(),   // id → Fish
    loading: new Set(),
    pendingAnnounce: new Set(), // 排到隊的新魚，入場時才播報

    visible(d) { return d && !d.hidden; },

    sync(list) {
      const ids = new Set(list.map(f => f.id));
      for (const [id, fish] of this.active) {
        if (!ids.has(id)) { fish.destroy(); this.active.delete(id); }
      }
      this.roster.clear();
      for (const d of list) this.roster.set(d.id, d);
      this.queue = list
        .filter(d => this.visible(d) && !this.active.has(d.id) && !this.loading.has(d.id))
        .map(d => d.id);
      this.fill();
    },

    async spawn(id, opts = {}) {
      const d = this.roster.get(id);
      if (!d || !this.visible(d) || this.active.has(id) || this.loading.has(id)) return null;
      this.loading.add(id);
      try {
        const fish = await Fish.create(d, W, H, {
          ratio: sizeToRatio(config.fishSize),
          boost: opts.announce ? 1.6 : 1,   // 新魚放大登場
          drop: !!opts.announce,            // 新魚從上方被丟進魚缸
        });
        fish.onSplash = (x, y) => { splashFx.burst(x, y); Sound.plunge(); };
        fish.bornAt = performance.now();
        fish.onExited = (f) => {
          f.destroy();
          this.active.delete(f.id);
          if (this.roster.has(f.id) && this.visible(this.roster.get(f.id)) &&
              !this.queue.includes(f.id)) this.queue.push(f.id);
          this.fill();
        };
        this.active.set(id, fish);
        // 遠的魚（depth 小）放模糊層 → 景深感
        (fish.depth < 0.35 ? fishLayerFar : fishLayer).addChild(fish.root);
        if (opts.announce && d.name) showBanner(`🐟 ${d.name} 的魚來了！`);
        else if (opts.announce) showBanner('🐟 新的魚游進來了！');
        return fish;
      } catch (e) {
        console.error('魚載入失敗', d.file, e);
        return null;
      } finally {
        this.loading.delete(id);
      }
    },

    fill() {
      if (this.parading) return;
      while (this.queue.length && this.active.size + this.loading.size < config.maxFishOnScreen) {
        const id = this.queue.shift();
        const announce = this.pendingAnnounce.delete(id);
        this.spawn(id, { announce });
      }
    },

    // 輪替：有魚在排隊時，待最久的魚游出去
    rotate() {
      if (!this.queue.length) return;
      const now = performance.now();
      for (const fish of this.active.values()) {
        if (fish.state === 'swim' && now - fish.bornAt > config.fishOnScreenSec * 1000) {
          fish.startExit();
          break; // 一次一隻，避免集體出走
        }
      }
    },

    async onNew(d) {
      this.roster.set(d.id, d);
      if (this.active.size + this.loading.size < config.maxFishOnScreen) {
        await this.spawn(d.id, { announce: true });
        return;
      }
      // 滿了 → 新魚插隊排第一，請最老的讓位，空出位置時播報入場
      this.pendingAnnounce.add(d.id);
      this.queue.unshift(d.id);
      let oldest = null;
      for (const f of this.active.values()) {
        if (f.state === 'swim' && (!oldest || f.bornAt < oldest.bornAt)) oldest = f;
      }
      if (oldest) oldest.startExit();
    },

    onUpdate(d) {
      const old = this.roster.get(d.id);
      this.roster.set(d.id, d);
      if (d.hidden) {
        const f = this.active.get(d.id);
        if (f) f.startExit();
        this.queue = this.queue.filter(x => x !== d.id);
        return;
      }
      const f = this.active.get(d.id);
      if (f) {
        if (old && (d.v || 0) !== (old.v || 0)) {
          // 圖被旋轉 → 重載貼圖（原地換新）
          f.destroy();
          this.active.delete(d.id);
          this.spawn(d.id);
        } else {
          if (!old || d.size !== old.size) f.setUserSize(d.size || 1);
          if (!old || d.headDir !== old.headDir) f.setHeadDir(d.headDir);
        }
      } else if (!this.queue.includes(d.id)) {
        this.queue.push(d.id);
        this.fill();
      }
    },

    onRemove(id) {
      this.roster.delete(id);
      this.queue = this.queue.filter(x => x !== id);
      const f = this.active.get(id);
      if (f) { f.destroy(); this.active.delete(id); }
      this.fill();
    },

    async onFeature(id) {
      let f = this.active.get(id);
      if (!f) {
        this.queue = this.queue.filter(x => x !== id);
        f = await this.spawn(id);
      }
      if (f) {
        f.startFeature();
        const d = this.roster.get(id);
        if (d && d.name) showBanner(`⭐ ${d.name} 的魚`);
      }
    },

    // 群游：每 ~5 秒嘗試讓一隻小魚跟上隊長（隊長最多帶 2 隻，10~25 秒散隊）
    _trySchool() {
      const small = (f) => f.state === 'swim' && f.userSize <= 1.3 && !f.follow;
      const fishes = [...this.active.values()];
      const followers = fishes.filter(small);
      if (followers.length < 2 || Math.random() > 0.6) return;
      const fol = followers[Math.floor(Math.random() * followers.length)];
      const leaders = fishes.filter(f =>
        f !== fol && small(f) && (f._nFollow || 0) < 2 &&
        Math.abs(f.depth - fol.depth) < 0.4);
      if (!leaders.length) return;
      const L = leaders[Math.floor(Math.random() * leaders.length)];
      fol.follow = {
        target: L,
        dx: 90 + Math.random() * 120,
        dy: (Math.random() - 0.5) * 80,
        t: 600 + Math.random() * 900,
      };
      L._nFollow = (L._nFollow || 0) + 1;
    },

    // 獵食秀：最大魚每 40~70 秒追一隻明顯較小的魚 8 秒（追不到 — 獵物會爆衝逃脫）
    hunt: null,
    _huntCd: 1200,
    _tryHunt(dt) {
      const hgt = (f) => f.texH * Math.abs(f.root.scale.y); // 實際顯示高度
      if (this.hunt) {
        const { hunter, prey } = this.hunt;
        const ok = this.active.get(hunter.id) === hunter && hunter.state === 'swim' &&
                   this.active.get(prey.id) === prey && prey.state === 'swim';
        this.hunt.t -= dt;
        if (!ok || this.hunt.t <= 0) {
          hunter._chase = null;
          if (ok) hunter.idle = 2;            // 追完喘口氣
          this.hunt = null;
          this._huntCd = 2400 + Math.random() * 1800;
          return;
        }
        // 快被追上 → 獵物爆衝 + 轉身逃（永遠吃不到）
        const dx = prey.root.x - hunter.root.x;
        const d = Math.hypot(dx, prey.root.y - hunter.root.y);
        if (d < hgt(hunter) * 1.4) {
          prey.burst = 1.0;
          const away = dx >= 0 ? 1 : -1;
          if (prey.dir !== away && !prey.turning) prey._startTurn(away);
          prey.baseY += (prey.root.y >= hunter.root.y ? 1.6 : -1.6) * dt;
        }
        return;
      }
      this._huntCd -= dt;
      if (this._huntCd > 0) return;
      this._huntCd = 2400 + Math.random() * 1800;
      const swimmers = [...this.active.values()].filter(f => f.state === 'swim');
      if (swimmers.length < 3) return;
      swimmers.sort((a, b) => hgt(b) - hgt(a));
      const hunter = swimmers[0];
      const preys = swimmers.filter(f => f !== hunter && hgt(f) < hgt(hunter) * 0.65);
      if (!preys.length) return;   // 沒有明顯大魚 → 不演
      const prey = preys[Math.floor(Math.random() * preys.length)];
      hunter._chase = prey;
      hunter._dropFollow();
      this.hunt = { hunter, prey, t: 480 }; // 默默上演，不出字幕
    },

    // 餵食：每顆飼料吸引最近的魚，靠近嘴邊就吃掉 → 變大一點
    // 規則：飼料沉到畫面上部 ~28% 才可被吃（讓小孩看到掉落過程）；
    //       每隻魚每次餵食最多吃 FEED_LIMIT 顆，避免一隻橫掃。
    FEED_LIMIT: 2,
    _feedLogic() {
      if (!food.pellets.length) return;
      const eatY = H * 0.28;   // 無敵閘：到這條線以上不能吃
      const swimmers = [...this.active.values()].filter(f => f.state === 'swim' && !f._chase);
      for (const p of food.pellets) {
        if (p.eaten) continue;
        const edible = p.sprite.y >= eatY;     // 還沒沉夠 → 全程無敵
        let best = null, bestD = W * 0.45;
        for (const f of swimmers) {
          if ((f._ateThisFeed || 0) >= this.FEED_LIMIT) {   // 這隻吃飽了，讓位
            if (f._foodTarget === p) f._foodTarget = null;
            continue;
          }
          const d = Math.hypot(f.root.x - p.sprite.x, f.root.y - p.sprite.y);
          const mouth = f.texH * Math.abs(f.root.scale.y) * 0.55;
          if (edible && d < mouth) {            // 吃到！
            const top = f.root.y - f.texH * Math.abs(f.root.scale.y) * 0.7;
            food.eat(p);
            f.onEat();                                 // 咬食脈衝 + 閃白
            f._ateThisFeed = (f._ateThisFeed || 0) + 1;
            Sound.nibble();
            f.feedMul = Math.min(p.glow ? 1.6 : 1.35, f.feedMul + (p.grow || 0.05));
            food.heart(f.root.x, top);
            // 吃很多 → 打嗝大泡（D3）
            if (f._fed % 5 === 0) { food.burp(f.root.x, top); Sound.burp(); }
            // 餵飽了 → 有機會生寶寶（成長系統呼應；每隻有冷卻、總數上限 8）
            const nowMs = performance.now();
            if (f.feedMul >= 1.45 && this.babies.size < this.BABY_CAP &&
                nowMs - (f._lastBaby || 0) > 15000 && Math.random() < 0.35) {
              f._lastBaby = nowMs;
              this.spawnBaby(f);
            }
            if (f._foodTarget === p) f._foodTarget = null;
            best = null;
            break;
          }
          if (d < bestD && (!f._foodTarget || f._foodTarget.eaten)) { best = f; bestD = d; }
        }
        // 還沒到可吃線就先不指派目標 → 魚不會提早衝上去攔截
        if (best && edible) best._foodTarget = p;
      }
    },

    // ---- 畢業巡游：全部魚依序列隊游過畫面 + 名字標籤，結束自動恢復 ----
    parading: false,
    paradeFish: new Set(),
    _clearBabies() {
      for (const b of this.babies) b.destroy();
      this.babies.clear();
      for (const f of this.active.values()) f._babyCount = 0;
    },

    // ===== 畢業巡游：瞬間清空 → 三行從右側盡頭列隊往左游過 =====
    async startParadeLine() {
      if (this.parading) return;
      this.parading = 'line';
      this._clearBabies();
      // 瞬間離場：場上的魚立刻消失
      for (const f of this.active.values()) f.destroy();
      this.active.clear();
      this.queue = [];
      for (const f of this.paradeFish) f.destroy();
      this.paradeFish.clear();
      showBanner('🎓 畢業巡游！謝謝每一位小畫家');
      const ids = [...this.roster.values()].filter(d => this.visible(d)).map(d => d.id);
      const ROWS = 3;
      const spacing = W * 0.22;                 // 同一行前後車距
      for (let i = 0; i < ids.length; i++) {
        const row = i % ROWS;                    // 三行交錯分配
        const col = Math.floor(i / ROWS);
        await this._spawnParade(ids[i], {
          x: W + W * 0.12 + col * spacing,       // 從右側盡頭外排隊
          y: H * (0.26 + 0.24 * row),            // 三行：上中下
        });
      }
    },
    async _spawnParade(id, pos) {
      const d = this.roster.get(id);
      if (!d) return;
      try {
        const fish = await Fish.create(d, W, H, { ratio: sizeToRatio(config.fishSize) });
        fish._parade = true;
        fish.state = 'exit';
        fish._exitDir = -1;                       // 往左游
        fish.dir = -1;
        fish._applyFlip();
        fish.speed = 1.35;                        // 齊速莊重（exit 內再 ×1.6）
        fish.root.x = pos.x;
        fish.baseY = pos.y;
        fish.root.y = pos.y;
        if (d.name) {
          const lbl = new PIXI.Text({
            text: d.name,
            style: {
              fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
              fontSize: 34, fill: 0xffffff, fontWeight: '700',
              stroke: { color: 0x06365e, width: 6 },
            },
          });
          lbl.anchor.set(0.5, 0);
          lbl.y = fish.texH / 2 + 16;
          lbl.scale.set(1 / fish.root.scale.x);
          lbl.alpha = 0.8;            // 半透明 → 不全擋後面的魚
          fish.root.addChild(lbl);
        }
        fish.onExited = (f) => { this.paradeFish.delete(f); f.destroy(); };
        this.paradeFish.add(fish);
        fishLayer.addChild(fish.root);
      } catch {}
    },
    _paradeTick(t, dt) {
      for (const f of this.paradeFish) f.update(t, dt, 1);
      if (this.paradeFish.size === 0) {
        this.parading = false;
        showBanner('🌊 謝謝大家，明年見！');
        this.sync([...this.roster.values()]);
      }
    },

    // ===== B 大合照：集合成方陣、秀名字、倒數拍照、再散開 =====
    // batch: 'A'|'B'|'all'；holdSec: 排好後停留秒數（最後 3 秒倒數 3-2-1-📸）
    async startGather(batch = 'all', holdSec = 4) {
      if (this.parading) return;
      this._clearBabies();
      // 依 createdAt 穩定排序，A=前半、B=後半（每次相同）
      let visible = [...this.roster.values()].filter(d => this.visible(d))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (batch === 'A' || batch === 'B') {
        const half = Math.ceil(visible.length / 2);
        visible = batch === 'A' ? visible.slice(0, half) : visible.slice(half);
      }
      const ids = visible.map(d => d.id);
      // 只留這批在場，其餘瞬間清掉；不在場的這批叫出來
      for (const f of [...this.active.values()]) {
        if (!ids.includes(f.id)) { f.destroy(); this.active.delete(f.id); }
      }
      this.queue = [];
      await Promise.all(ids.filter(id => !this.active.has(id)).map(id => this.spawn(id)));
      // 設定全部就緒後，最後才開 parading（避免 ticker 在沒 _slot 時提早進 hold）
      this._assignSlots([...this.active.values()]);
      this._gatherPhase = 'in';
      this._gatherT = 0;
      this._gLabels = [];
      this._lastCd = 99;
      this._gatherHoldSec = Math.max(4, holdSec);
      showBanner('📸 大合照！大家集合～');
      this.parading = 'gather';
    },
    _assignSlots(fishes) {
      const n = fishes.length;
      if (!n) return;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.7)));
      const rows = Math.ceil(n / cols);
      const sx = Math.min(W * 0.84 / cols, 260);
      const sy = Math.min(H * 0.6 / rows, 190);
      const y0 = H * 0.5 - (rows - 1) * sy / 2 - H * 0.02;
      fishes.forEach((f, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const inRow = (r === rows - 1) ? (n - cols * (rows - 1)) : cols;
        const rowX0 = W / 2 - (inRow - 1) * sx / 2;
        const cc = (r === rows - 1) ? c : c;
        f._slot = { x: rowX0 + cc * sx, y: y0 + r * sy };
      });
    },
    _addGatherLabels() {
      for (const f of this.active.values()) {
        const d = this.roster.get(f.id);
        if (!d || !d.name) continue;
        const lbl = new PIXI.Text({
          text: d.name,
          style: { fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
            fontSize: 30, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x06365e, width: 6 } },
        });
        // 疊在自己魚身上、半透明 → 只蓋自己，不擋到隔壁的魚
        lbl.anchor.set(0.5, 0.5);
        lbl.y = f.texH * 0.32;
        lbl.scale.set(1 / Math.max(0.2, Math.abs(f.root.scale.x)));
        lbl.alpha = 0.78;
        f.root.addChild(lbl);
        this._gLabels.push(lbl);
      }
    },
    _finishGather() {
      setCountdown(''); setGInfo('');
      for (const l of this._gLabels) { if (l.parent) l.parent.removeChild(l); l.destroy(); }
      this._gLabels = [];
      for (const f of this.active.values()) { f._slot = null; f.homeY = H * (0.18 + 0.64 * Math.random()); }
      this.parading = false;
      showBanner('🌊 謝謝大家！');
      this.sync([...this.roster.values()]); // 恢復正常輪替（批次模式有清掉非該批的魚）
    },
    _gatherTick(t, dt) {
      const fishes = [...this.active.values()];
      if (this._gatherPhase === 'in') {
        let settled = true;
        for (const f of fishes) {
          if (!f._slot) continue;
          const k = 1 - Math.pow(0.93, dt);
          f.root.x += (f._slot.x - f.root.x) * k;
          f.baseY += (f._slot.y - f.baseY) * k;
          f.root.y = f.baseY + Math.sin(t * 1.2 + f.ph) * 4;
          f.root.rotation = 0;
          const want = (f._slot.x <= W / 2) ? 1 : -1;       // 都朝中央看鏡頭
          f.flip.scale.x = want * f.headDir;
          f._wave(t);
          if (Math.abs(f._slot.x - f.root.x) > 8) settled = false;
        }
        this._gatherT += dt;
        if (settled || this._gatherT > 240) {
          this._gatherPhase = 'hold'; this._lastCd = 99;
          this._holdStart = performance.now();   // 牆上時鐘，不受掉幀影響
          this._addGatherLabels();
        }
      } else if (this._gatherPhase === 'hold') {
        // 魚定住排好，撐到倒數結束才散
        for (const f of fishes) {
          if (f._slot) { f.root.x += (f._slot.x - f.root.x) * 0.1; f.baseY += (f._slot.y - f.baseY) * 0.1; }
          f.root.y = f.baseY + Math.sin(t * 1.2 + f.ph) * 4;
          f._wave(t);
        }
        const remain = this._gatherHoldSec - (performance.now() - this._holdStart) / 1000;
        // 角落剩餘秒數（最後 3 秒交給大字倒數）
        setGInfo(remain > 3 ? '📸 拍照中 ' + Math.ceil(remain) + ' 秒' : '');
        // 最後 3 秒倒數 3→2→1（半透明），數完即散，不顯示相機
        const cd = remain > 0 ? Math.min(3, Math.ceil(remain)) : 0;
        if (cd !== this._lastCd) {
          this._lastCd = cd;
          if (cd > 0 && remain <= 3.05) { setCountdown(String(cd)); Sound.nibble(); }
          else if (cd === 0) setCountdown('');
        }
        if (remain <= 0) this._finishGather();
      }
    },

    // ---- 自動輪流亮相：每 N 秒輪一隻 feature（保證每個小孩有高光時刻）----
    _spotT: 0,
    _spotIdx: 0,
    _autoSpotlight(dt) {
      if (!(config.autoSpotlightSec > 0)) return;
      this._spotT += dt / 60;
      if (this._spotT < config.autoSpotlightSec) return;
      this._spotT = 0;
      const ids = [...this.roster.values()].filter(d => this.visible(d)).map(d => d.id);
      if (!ids.length) return;
      this._spotIdx = (this._spotIdx + 1) % ids.length;
      this.onFeature(ids[this._spotIdx]);
    },

    // ---- 寶寶魚（媽媽縮小版，輕量 Sprite）----
    babies: new Set(),
    BABY_CAP: 8,         // 全場上限
    BABY_PER_MOM: 2,     // 單隻媽媽最多帶幾隻
    spawnBaby(mother) {
      if (this.babies.size >= this.BABY_CAP) return false;
      if (!mother || mother.root.destroyed) return false;
      if ((mother._babyCount || 0) >= this.BABY_PER_MOM) return false;
      const b = new Baby(mother);
      mother._babyCount = (mother._babyCount || 0) + 1;
      this.babies.add(b);
      fishLayer.addChild(b.sprite);
      food.heart(mother.root.x, mother.root.y - mother.texH * Math.abs(mother.root.scale.y) * 0.6);
      return true;
    },
    // admin 觸發：隨機挑幾隻媽媽生寶寶（總數不超過 BABY_CAP）
    spawnBabiesRandom() {
      const moms = [...this.active.values()].filter(f => f.state === 'swim');
      for (let i = moms.length - 1; i > 0; i--) {   // 洗牌
        const j = Math.floor(Math.random() * (i + 1));
        [moms[i], moms[j]] = [moms[j], moms[i]];
      }
      let added = 0;
      for (const m of moms) {
        if (this.babies.size >= this.BABY_CAP) break;
        const n = 1 + (Math.random() < 0.4 ? 1 : 0);
        for (let k = 0; k < n && this.babies.size < this.BABY_CAP; k++) { this.spawnBaby(m); added++; }
      }
      if (added) showBanner('🐣 寶寶魚出生了！');
    },
    _updateBabies(t, dt) {
      for (const b of this.babies) {
        b.update(t, dt);
        if (b.dead) {
          if (b.mother && (b.mother._babyCount || 0) > 0) b.mother._babyCount--;
          b.destroy();
          this.babies.delete(b);
        }
      }
    },

    update(t, dt) {
      if (this.parading === 'gather') { this._gatherTick(t, dt); return; }
      if (this.parading) { this._paradeTick(t, dt); return; }
      this.rotate();
      this._autoSpotlight(dt);
      this._schoolT = (this._schoolT || 0) + dt;
      if (this._schoolT > 300) { this._schoolT = 0; this._trySchool(); }
      this._tryHunt(dt);
      this._feedLogic();
      // 餵食結束（飼料吃光/沉光）→ 全部散開回各自深度，恢復活潑
      const hasFood = food.pellets.length > 0;
      if (this._hadFood && !hasFood) {
        for (const f of this.active.values()) { f._foodTarget = null; f.scatterHome(H); }
      }
      this._hadFood = hasFood;
      for (const fish of this.active.values()) fish.update(t, dt, config.swimSpeed);
      this._updateBabies(t, dt);
    },
  };

  // ---- 大合照倒數（獨立大字，置中，不走橫幅佇列）----
  const cdEl = document.createElement('div');
  cdEl.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'z-index:40;pointer-events:none;font-family:"PingFang TC",sans-serif;font-weight:900;' +
    'font-size:22vmin;color:#fff;text-shadow:0 4px 40px rgba(0,200,255,.9);opacity:0;' +
    'transition:opacity .15s,transform .15s;transform:scale(.6)';
  document.body.appendChild(cdEl);
  // 合照進行中：角落顯示剩餘秒數（長秒數時不會「不知還要等多久」）
  const gInfoEl = document.createElement('div');
  gInfoEl.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:39;' +
    'pointer-events:none;font-family:"PingFang TC",sans-serif;font-size:26px;font-weight:700;color:#fff;' +
    'background:rgba(8,40,80,.5);padding:6px 22px;border-radius:30px;opacity:0;transition:opacity .2s';
  document.body.appendChild(gInfoEl);
  function setGInfo(txt) { gInfoEl.textContent = txt || ''; gInfoEl.style.opacity = txt ? '1' : '0'; }
  function setCountdown(txt) {
    if (txt) {
      cdEl.textContent = txt;
      cdEl.style.opacity = '0.5';   // 半透明，不擋畫面
      cdEl.style.transform = 'scale(1)';
    } else {
      cdEl.style.opacity = '0';
      cdEl.style.transform = 'scale(.6)';
    }
  }

  // ---- 名字橫幅（依序顯示）----
  const bannerEl = document.getElementById('banner');
  const bannerQ = [];
  let bannerBusy = false;
  function showBanner(text) {
    bannerQ.push(text);
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const text = bannerQ.shift();
    if (text === undefined) { bannerBusy = false; return; }
    bannerBusy = true;
    bannerEl.querySelector('.inner').textContent = text;
    bannerEl.classList.add('show');
    setTimeout(() => {
      bannerEl.classList.remove('show');
      setTimeout(nextBanner, 700);
    }, 3500);
  }

  // ---- 設定套用 ----
  const pausedEl = document.getElementById('paused');
  function applyConfig(c) {
    config = { ...config, ...c };
    pausedEl.style.display = config.paused ? 'flex' : 'none';
    seaweed.container.visible = !!config.fgDecor;
    fishLayerFar.filters = (config.farBlur ?? true) ? farBlurFilter : [];
    // 前景遮蔽區（水草叢位置）：魚游進去會放慢 = 躲藏感
    Fish.hideZones = config.fgDecor ? [
      { x: W * 0.095, r: W * 0.085, yMin: H * 0.45 },
      { x: W * 0.86, r: W * 0.09, yMin: H * 0.45 },
    ] : [];
    // 背景暗度/對比
    bgColor.reset();
    bgColor.brightness(config.bgBrightness ?? 0.85, false);
    if ((config.bgContrast ?? 1) !== 1) bgColor.contrast((config.bgContrast ?? 1) - 1, true);
    // 背景動感 → 水紋亮度跟著縮放
    const m = config.bgMotion ?? 1;
    caustics.a.alpha = 0.07 * Math.min(m, 2);
    caustics.b.alpha = 0.05 * Math.min(m, 2);
    if (config.paused) app.ticker.stop(); else app.ticker.start();
    Sound.setVolume(config.volume);
    Sound.setOn(config.soundOn && !config.paused);
    // 基準尺寸即時套用到場上的魚
    const ratio = sizeToRatio(config.fishSize);
    for (const f of fishMgr.active.values()) f.setSizeRatio(ratio);
    fishMgr.fill();
  }

  // 音效需要使用者手勢解鎖：第一次點擊/按鍵時啟用
  const unlock = () => { Sound.setOn(config.soundOn && !config.paused); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // ---- 初始載入 + WebSocket ----
  async function loadState() {
    const s = await (await fetch('/api/state')).json();
    applyConfig(s.config);
    bg.setList(s.backgrounds);
    fishMgr.sync(s.fish);
    if (!s.backgrounds.length) bg.show(null);
  }

  function connectWS() {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'config') applyConfig(m.config);
      else if (m.type === 'fish:new') fishMgr.onNew(m.fish);
      else if (m.type === 'fish:update') fishMgr.onUpdate(m.fish);
      else if (m.type === 'fish:remove') fishMgr.onRemove(m.id);
      else if (m.type === 'fish:feature') fishMgr.onFeature(m.id);
      else if (m.type === 'backgrounds') bg.setList(m.backgrounds);
      else if (m.type === 'bg:next') { bg.timer = 0; bg.next(); }
      else if (m.type === 'feed') {
        for (const f of fishMgr.active.values()) f._ateThisFeed = 0; // 新一輪：每隻吃額重置
        food.drop(W * (0.2 + 0.6 * Math.random()), m.n || 0, m.foodType || 'pellets');
        Sound.scatter();
      }
      else if (m.type === 'parade') fishMgr.startParadeLine();
      else if (m.type === 'gather') fishMgr.startGather(m.batch, m.holdSec);
      else if (m.type === 'gather:skip') { if (fishMgr.parading === 'gather') fishMgr._finishGather(); }
      else if (m.type === 'babies') fishMgr.spawnBabiesRandom();
    };
    ws.onclose = () => setTimeout(connectWS, 2000);   // 自動重連
    ws.onopen = () => loadState();                     // 重連後重新同步
  }

  await loadState();
  if (!bg.cur) bg.next();
  connectWS();
  window.__aq = { bg, fishMgr, getConfig: () => config }; // debug 用

  // ---- 投影頁專用：滑鼠游標自動隱藏 & QR Code 互動面板 ----
  (function initProjectionUI() {
    const body = document.body;
    const container = document.getElementById('qr-container');
    const btn = document.getElementById('qr-btn');
    const drawer = document.getElementById('qr-drawer');
    const qrImg = document.getElementById('qr-display-img');
    const qrUrlEl = document.getElementById('qr-display-url');
    
    if (!container || !btn || !drawer) return;

    // 1. 載入 QR Code 數據
    async function updateQR() {
      try {
        const res = await fetch('/api/qr');
        const data = await res.json();
        qrImg.src = data.dataUrl;
        qrUrlEl.textContent = data.url;
        qrUrlEl.onclick = () => {
          window.open(data.url, '_blank');
        };
      } catch (e) {
        console.error('無法載入 QR Code', e);
        qrUrlEl.textContent = '載入失敗，點此重試';
        qrUrlEl.onclick = updateQR;
      }
    }
    updateQR();

    // 2. 切換面板顯示/隱藏
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      drawer.classList.toggle('open');
    });

    // 點擊面板外部時收合面板
    window.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        drawer.classList.remove('open');
      }
    });

    // 3. 智慧滑鼠游標管理 (3秒無動作自動隱藏)
    let cursorTimer;
    let isHoveringUI = false;

    function showCursor() {
      body.classList.remove('hide-cursor');
      clearTimeout(cursorTimer);
      if (!isHoveringUI) {
        cursorTimer = setTimeout(hideCursor, 3000);
      }
    }

    function hideCursor() {
      if (!isHoveringUI && !drawer.classList.contains('open')) {
        body.classList.add('hide-cursor');
      }
    }

    window.addEventListener('mousemove', showCursor);
    window.addEventListener('mousedown', showCursor);

    // 當移入 QR Code 互動區時，始終保持滑鼠顯示
    container.addEventListener('mouseenter', () => {
      isHoveringUI = true;
      showCursor();
    });

    container.addEventListener('mouseleave', () => {
      isHoveringUI = false;
      showCursor();
    });
    
    // 初始化時隱藏游標的計時器
    showCursor();
  })();

  // ---- 主迴圈 ----
  let t = 0;
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;        // 60fps = 1
    t += ticker.deltaMS / 1000;
    W = app.screen.width; H = app.screen.height;
    const bm = config.bgMotion ?? 1;
    bg.update(dt);
    fishMgr.update(t, dt);
    caustics.update(dt * (0.4 + 0.6 * bm)); // 水紋流速隨動感調整
    splashFx.update(dt);
    food.update(t, dt);
    seaweed.update(t);
    bubbles.update(t, dt);
    rays.update(t);
    motes.update(t, dt);
    updateDayCycle(t);
    dayOverlay.width = W; dayOverlay.height = H;
    drawShadows();
    noiseSprite.x = Math.sin(t * 0.3) * 60 + t * 8;
    noiseSprite.y = Math.cos(t * 0.23) * 50;
    disp.scale.x = 10 + Math.sin(t * 0.5) * 4;
    disp.scale.y = 8 + Math.cos(t * 0.4) * 4;
    // 背景額外水流晃動（可調強度，0 = 靜止）
    bgDisp.scale.x = (14 + Math.sin(t * 0.45) * 6) * bm;
    bgDisp.scale.y = (11 + Math.cos(t * 0.36) * 5) * bm;
  });

  // 雙擊切全螢幕
  window.addEventListener('dblclick', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });

})();
