// 程序化材質：全部用 canvas 畫，不需外部圖檔（離線可用）
'use strict';
const Tex = (() => {

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }

  // 斜射光束：上寬下窄的漸層
  function ray() {
    const [c, g] = canvas(256, 1024);
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, 'rgba(190,230,255,0.55)');
    grad.addColorStop(0.5, 'rgba(150,210,255,0.18)');
    grad.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(78, 0); g.lineTo(178, 0);
    g.lineTo(256, 1024); g.lineTo(0, 1024);
    g.closePath(); g.fill();
    return PIXI.Texture.from(c);
  }

  // 氣泡：圓 + 高光
  function bubble() {
    const [c, g] = canvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.8, 'rgba(200,235,255,0.12)');
    grad.addColorStop(0.95, 'rgba(220,245,255,0.6)');
    grad.addColorStop(1, 'rgba(220,245,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.ellipse(22, 20, 6, 4, -0.6, 0, Math.PI * 2); g.fill();
    return PIXI.Texture.from(c);
  }

  // 漂浮微粒：柔光點
  function mote() {
    const [c, g] = canvas(32, 32);
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0, 'rgba(220,240,255,0.9)');
    grad.addColorStop(1, 'rgba(220,240,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return PIXI.Texture.from(c);
  }

  // 水波光紋（caustics）：隨機弧線網，可平鋪
  function caustics() {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.strokeStyle = 'rgba(180,225,255,0.5)';
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = 18 + Math.random() * 55;
      const a0 = Math.random() * Math.PI * 2;
      g.lineWidth = 1 + Math.random() * 2.2;
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.beginPath();
      g.arc(x, y, r, a0, a0 + 1.1 + Math.random() * 1.6);
      g.stroke();
      // 平鋪接縫：邊緣附近再畫一次位移複本
      if (x < 80 || y < 80) {
        g.beginPath();
        g.arc(x + (x < 80 ? S : 0), y + (y < 80 ? S : 0), r, a0, a0 + 1.4);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    return PIXI.Texture.from(c);
  }

  // 藍色 vignette：中央透明、四周深藍
  function vignette() {
    const [c, g] = canvas(512, 512);
    const grad = g.createRadialGradient(256, 256, 130, 256, 256, 360);
    grad.addColorStop(0, 'rgba(2,12,30,0)');
    grad.addColorStop(0.75, 'rgba(2,12,30,0.25)');
    grad.addColorStop(1, 'rgba(1,8,22,0.72)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    return PIXI.Texture.from(c);
  }

  // 位移噪聲圖：平滑團塊（給 DisplacementFilter 做水中晃動）
  function noise() {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = 25 + Math.random() * 60;
      const v = 128 + (Math.random() * 70 - 35);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${v|0},${v|0},${v|0},0.5)`);
      grad.addColorStop(1, `rgba(${v|0},${v|0},${v|0},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    }
    return PIXI.Texture.from(c);
  }

  // 飼料顆粒（圓粒，實心一點，白底著色用）
  function pellet() {
    const [c, g] = canvas(32, 32);
    const grad = g.createRadialGradient(13, 12, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
    return PIXI.Texture.from(c);
  }

  // 薄片飼料（不規則小片，白底著色用）
  function flake() {
    const [c, g] = canvas(40, 40);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(20, 4);
    g.lineTo(34, 14); g.lineTo(30, 32); g.lineTo(12, 34); g.lineTo(5, 16);
    g.closePath(); g.fill();
    return PIXI.Texture.from(c);
  }

  // 火花/星芒（特別餌吃掉時的閃光）
  function sparkle() {
    const [c, g] = canvas(48, 48);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.translate(24, 24);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, -22); g.lineTo(3, -3); g.lineTo(22, 0); g.lineTo(3, 3);
      g.lineTo(0, 22); g.lineTo(-3, 3); g.lineTo(-22, 0); g.lineTo(-3, -3);
      g.closePath(); g.fill();
      g.rotate(Math.PI / 4);
      g.scale(0.5, 0.5);
    }
    return PIXI.Texture.from(c);
  }

  // 愛心（餵食回饋）
  function heart() {
    const [c, g] = canvas(64, 64);
    g.font = '48px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('❤️', 32, 36);
    return PIXI.Texture.from(c);
  }

  // 前景水草葉片（深色剪影，底部錨定）
  function blade() {
    const W = 120, H = 512;
    const [c, g] = canvas(W, H);
    const grad = g.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, 'rgba(2,22,18,0.97)');
    grad.addColorStop(1, 'rgba(8,52,40,0.88)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(W * 0.5, H);
    // 左緣彎上去、右緣彎回來 → 搖曳葉形
    g.bezierCurveTo(W * 0.05, H * 0.72, W * 0.42, H * 0.45, W * 0.18, H * 0.18);
    g.quadraticCurveTo(W * 0.32, H * 0.02, W * 0.52, H * 0.06);
    g.bezierCurveTo(W * 0.95, H * 0.35, W * 0.55, H * 0.6, W * 0.82, H);
    g.closePath();
    g.fill();
    return PIXI.Texture.from(c);
  }

  // 前景岩石剪影
  function rock() {
    const W = 512, H = 256;
    const [c, g] = canvas(W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(6,26,40,0.92)');
    grad.addColorStop(1, 'rgba(2,12,22,0.98)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, H);
    g.quadraticCurveTo(W * 0.08, H * 0.35, W * 0.3, H * 0.3);
    g.quadraticCurveTo(W * 0.5, H * 0.05, W * 0.7, H * 0.32);
    g.quadraticCurveTo(W * 0.9, H * 0.45, W, H);
    g.closePath();
    g.fill();
    return PIXI.Texture.from(c);
  }

  // 預設背景（沒有上傳背景圖時用）：深海漸層 + 遠景色塊
  function defaultBg(w, h) {
    const [c, g] = canvas(w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a4f86');
    grad.addColorStop(0.5, '#073a6b');
    grad.addColorStop(1, '#031c3d');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // 遠景海床起伏
    g.fillStyle = 'rgba(3,20,45,0.8)';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 40) {
      g.lineTo(x, h - 40 - Math.sin(x * 0.008) * 28 - Math.sin(x * 0.021) * 14);
    }
    g.lineTo(w, h); g.closePath(); g.fill();
    return PIXI.Texture.from(c);
  }

  return { ray, bubble, mote, caustics, vignette, noise, defaultBg, blade, rock, heart, pellet, flake, sparkle };
})();
