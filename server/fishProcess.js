// 魚照片處理管線：去背（白紙底）→ 裁邊 → 縮圖 → PNG 透明
// 已去背的 PNG（含透明像素）直接通過，不重複去背。
const sharp = require('sharp');

const MAX_WORK = 1000;  // 去背運算用的最大邊長
const MAX_OUT = 640;    // 輸出魚圖最大邊長

// 去背強度 → 與背景色的距離容忍值
const TOLERANCES = { low: 36, medium: 52, high: 72 };

// opts: { strength, removeBg } — removeBg 預設關，只裁邊縮圖轉 PNG
async function processFish(inputBuffer, opts = {}) {
  const { strength = 'medium', removeBg = false } = opts;
  // EXIF 轉正 + 限制尺寸
  let img = sharp(inputBuffer).rotate()
    .resize(MAX_WORK, MAX_WORK, { fit: 'inside', withoutEnlargement: true });

  const { data, info } = await img.ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  // 已含透明（手機去背的 PNG）→ 直通裁縮；不去背 → 也直接裁縮
  if (hasTransparency(data) || !removeBg) return finalize(data, w, h);

  removeBackground(data, w, h, TOLERANCES[strength] || TOLERANCES.medium);
  featherEdges(data, w, h);
  return finalize(data, w, h);
}

// 是否已含透明像素（>2% 即視為已去背）
function hasTransparency(data) {
  let n = 0;
  const total = data.length / 4;
  for (let i = 3; i < data.length; i += 16 * 4) {
    if (data[i] < 200) n++;
  }
  return n / (total / 16) > 0.02;
}

// 從四邊 flood fill 移除背景（白紙，含輕微陰影/漸層）
function removeBackground(data, w, h, TOL) {
  // 取邊框像素中位色當作背景參考色
  const border = [];
  for (let x = 0; x < w; x += 4) { border.push(px(data, w, x, 0), px(data, w, x, h - 1)); }
  for (let y = 0; y < h; y += 4) { border.push(px(data, w, 0, y), px(data, w, w - 1, y)); }
  const bg = medianColor(border);

  // 亮度/飽和門檻隨強度縮放（白紙上的陰影/反光）
  const lumaMin = 217 - TOL, satMax = TOL * 0.73;
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
    if (d < TOL) return true;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > lumaMin && (mx - mn) < satMax;
  };

  const visited = new Uint8Array(w * h);
  const queue = [];
  for (let x = 0; x < w; x++) { queue.push(x, x + (h - 1) * w); }
  for (let y = 0; y < h; y++) { queue.push(y * w, w - 1 + y * w); }

  while (queue.length) {
    const p = queue.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!isBg(i)) continue;
    data[i + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < w - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - w);
    if (y < h - 1) queue.push(p + w);
  }
}

// 邊緣羽化：與透明區相鄰的不透明像素降 alpha，邊緣柔和
function featherEdges(data, w, h) {
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = data[p * 4 + 3];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (alpha[p] === 0) continue;
      let clear = 0;
      if (!alpha[p - 1]) clear++;
      if (!alpha[p + 1]) clear++;
      if (!alpha[p - w]) clear++;
      if (!alpha[p + w]) clear++;
      if (clear > 0) data[p * 4 + 3] = clear >= 2 ? 90 : 170;
    }
  }
}

function px(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function medianColor(colors) {
  const ch = (k) => colors.map(c => c[k]).sort((a, b) => a - b)[colors.length >> 1];
  return [ch(0), ch(1), ch(2)];
}

// 裁掉透明邊 → 縮圖 → PNG buffer
async function finalize(data, w, h) {
  // 找不透明範圍（留 4px 邊）
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('去背後沒有剩下內容，請重拍（光線均勻、紙攤平）');
  minX = Math.max(0, minX - 4); minY = Math.max(0, minY - 4);
  maxX = Math.min(w - 1, maxX + 4); maxY = Math.min(h - 1, maxY + 4);

  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(MAX_OUT, MAX_OUT, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

module.exports = { processFish };

// ponytail: 一個可跑的自檢，跑 `node server/fishProcess.js`
if (require.main === module) {
  (async () => {
    const assert = require('assert');
    const white = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } })
      .composite([{ input: await sharp({ create: { width: 80, height: 80, channels: 3, background: '#f80' } }).png().toBuffer(), top: 60, left: 60 }])
      .jpeg().toBuffer();
    const transparent = (d) => d.some((v, i) => i % 4 === 3 && v < 200);
    const raw = async (buf) => (await sharp(buf).ensureAlpha().raw().toBuffer());

    assert(!transparent(await raw(await processFish(white, { removeBg: false }))), '不去背應保留白底');
    assert(transparent(await raw(await processFish(white, { removeBg: true }))), '去背應有透明');

    const alreadyClear = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), top: 30, left: 30 }])
      .png().toBuffer();
    assert(transparent(await raw(await processFish(alreadyClear, { removeBg: false }))), '已透明 PNG 應直通保留透明');
    console.log('fishProcess 自檢通過 ✓');
  })().catch(e => { console.error(e); process.exit(1); });
}
