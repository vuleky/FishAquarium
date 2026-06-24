// 水族箱投影系統伺服器：靜態頁 + 上傳 API + WebSocket 推播
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');
const state = require('./state');
const { processFish } = require('./fishProcess');

const PORT = process.env.PORT || 3000;
state.load();
fs.mkdirSync(state.FISH_DIR, { recursive: true });
fs.mkdirSync(state.BG_DIR, { recursive: true });
fs.mkdirSync(state.FG_DIR, { recursive: true });

const app = express();
app.use(express.json());
// 投影/控制/上傳頁與 JS 不快取 → 改檔後重整就生效，免被瀏覽器留舊版
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  setHeaders(res, p) {
    if (/\.(html|js)$/i.test(p)) res.setHeader('Cache-Control', 'no-store');
  },
}));
app.use('/data', express.static(state.DATA_DIR, { maxAge: '1h' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ---- WebSocket ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}

// ---- API ----
app.get('/api/state', (req, res) => {
  res.json({
    config: state.getConfig(),
    fish: state.listFish(),
    backgrounds: state.listBackgrounds(),
  });
});

app.patch('/api/config', (req, res) => {
  const config = state.setConfig(req.body || {});
  broadcast({ type: 'config', config });
  res.json(config);
});

// 去背預覽：回傳處理結果，不儲存（手機端確認用）
app.post('/api/fish/preview', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '沒有收到照片' });
    // 預覽一律去背（這支端點本來就是去背預覽用）
    const png = await processFish(req.file.buffer, { strength: req.body.strength, removeBg: true });
    res.json({ ok: true, image: 'data:image/png;base64,' + png.toString('base64') });
  } catch (e) {
    res.status(422).json({ error: e.message || '處理失敗，請重拍一張' });
  }
});

// 上傳魚（5+ 手機併發 OK：multer 各自處理，sharp 各自非同步）
app.post('/api/fish', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '沒有收到照片' });
    if (!String(req.body.name || '').trim()) {
      return res.status(422).json({ error: '請輸入魚的名字' });
    }
    const png = await processFish(req.file.buffer, {
      strength: req.body.strength,
      removeBg: req.body.removeBg === 'true' || req.body.removeBg === true,
    });
    const id = crypto.randomBytes(6).toString('hex');
    const file = `${id}.png`;
    fs.writeFileSync(path.join(state.FISH_DIR, file), png);
    const fish = state.addFish({
      id, name: req.body.name, file,
      headDir: Number(req.body.headDir) === -1 ? -1 : 1,
    });
    broadcast({ type: 'fish:new', fish });
    res.json({ ok: true, fish });
  } catch (e) {
    res.status(422).json({ error: e.message || '處理失敗，請重拍一張' });
  }
});

// 批次操作：hide / show / delete
app.post('/api/fish/bulk', (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || !['hide', 'show', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'ids 陣列 + action(hide|show|delete) 必填' });
  }
  let n = 0;
  for (const id of ids) {
    if (action === 'delete') {
      if (state.removeFish(id)) { broadcast({ type: 'fish:remove', id }); n++; }
    } else {
      const fish = state.updateFish(id, { hidden: action === 'hide' });
      if (fish) { broadcast({ type: 'fish:update', fish }); n++; }
    }
  }
  res.json({ ok: true, count: n });
});

app.patch('/api/fish/:id', (req, res) => {
  const fish = state.updateFish(req.params.id, req.body || {});
  if (!fish) return res.status(404).json({ error: 'not found' });
  broadcast({ type: 'fish:update', fish });
  res.json(fish);
});

app.delete('/api/fish/:id', (req, res) => {
  if (!state.removeFish(req.params.id)) return res.status(404).json({ error: 'not found' });
  broadcast({ type: 'fish:remove', id: req.params.id });
  res.json({ ok: true });
});

// 旋轉魚圖 90 度（dir: 1 = 順時針, -1 = 逆時針）
app.post('/api/fish/:id/rotate', async (req, res) => {
  try {
    const f = state.getFish(req.params.id);
    if (!f) return res.status(404).json({ error: 'not found' });
    const sharp = require('sharp');
    const file = path.join(state.FISH_DIR, f.file);
    const deg = (req.body && req.body.dir === -1) ? -90 : 90;
    const buf = await sharp(file).rotate(deg).png().toBuffer();
    fs.writeFileSync(file, buf);
    const fish = state.touchFish(f.id);
    broadcast({ type: 'fish:update', fish });
    res.json({ ok: true, fish });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 主打某隻魚：游到中央放大亮相（手機「呼叫我的魚」也走這裡）
app.post('/api/fish/:id/feature', (req, res) => {
  const f = state.getFish(req.params.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  broadcast({ type: 'fish:feature', id: f.id });
  res.json({ ok: true });
});

// 畢業巡游（列隊）：全部魚列隊游過畫面謝幕
app.post('/api/parade', (req, res) => {
  broadcast({ type: 'parade' });
  res.json({ ok: true });
});

// 大合照：集合方陣、秀名字、倒數。body: { batch:'A'|'B'|'all', holdSec }
app.post('/api/gather', (req, res) => {
  const b = req.body || {};
  const batch = ['A', 'B', 'all'].includes(b.batch) ? b.batch : 'all';
  const holdSec = Math.min(300, Math.max(4, Number(b.holdSec) || 4));
  broadcast({ type: 'gather', batch, holdSec });
  res.json({ ok: true });
});

// 強制結束大合照、立刻散開（可馬上開下一批）
app.post('/api/gather/skip', (req, res) => {
  broadcast({ type: 'gather:skip' });
  res.json({ ok: true });
});

// 生寶寶：隨機挑幾隻魚生小魚（總數上限由投影端控管）
app.post('/api/babies', (req, res) => {
  broadcast({ type: 'babies' });
  res.json({ ok: true });
});

// 背景圖管理
app.post('/api/backgrounds', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '沒有收到圖片' });
    const sharp = require('sharp');
    const buf = await sharp(req.file.buffer).rotate()
      .resize(2560, 1440, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 }).toBuffer();
    const file = `bg_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(state.BG_DIR, file), buf);
    broadcast({ type: 'backgrounds', backgrounds: state.listBackgrounds() });
    res.json({ ok: true, file });
  } catch (e) {
    res.status(422).json({ error: e.message });
  }
});

app.delete('/api/backgrounds/:file', (req, res) => {
  const f = path.basename(req.params.file); // 防路徑跳脫
  try { fs.unlinkSync(path.join(state.BG_DIR, f)); } catch {}
  try { fs.unlinkSync(path.join(state.FG_DIR, path.parse(f).name + '.png')); } catch {}
  broadcast({ type: 'backgrounds', backgrounds: state.listBackgrounds() });
  res.json({ ok: true });
});

// 背景的前景圖（去背 PNG，蓋在魚前面 → 立體遮擋感）
app.post('/api/backgrounds/:file/foreground', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '沒有收到圖片' });
    const bgFile = path.basename(req.params.file);
    const base = path.parse(bgFile).name;
    const sharp = require('sharp');
    // 拉成跟背景「完全相同尺寸」→ 投影端疊上去自動對齊（前景來源尺寸不必相同）
    const bgMeta = await sharp(path.join(state.BG_DIR, bgFile)).metadata();
    const buf = await sharp(req.file.buffer).rotate()
      .resize(bgMeta.width, bgMeta.height, { fit: 'fill' })
      .png().toBuffer();
    fs.writeFileSync(path.join(state.FG_DIR, base + '.png'), buf);
    broadcast({ type: 'backgrounds', backgrounds: state.listBackgrounds() });
    res.json({ ok: true });
  } catch (e) {
    res.status(422).json({ error: e.message });
  }
});

app.delete('/api/backgrounds/:file/foreground', (req, res) => {
  const base = path.parse(path.basename(req.params.file)).name;
  try { fs.unlinkSync(path.join(state.FG_DIR, base + '.png')); } catch {}
  broadcast({ type: 'backgrounds', backgrounds: state.listBackgrounds() });
  res.json({ ok: true });
});

// 手動切下一張背景
app.post('/api/backgrounds/next', (req, res) => {
  broadcast({ type: 'bg:next' });
  res.json({ ok: true });
});

// 餵食：廣播到投影頁撒飼料（全域 2 秒冷卻防灌爆）
const FOOD_KINDS = ['pellets', 'flakes', 'treat'];
let lastFeedAt = 0;
app.post('/api/feed', (req, res) => {
  const now = Date.now();
  if (now - lastFeedAt < 2000) {
    return res.status(429).json({ error: '魚還在吃，等牠們吃完再餵！' });
  }
  lastFeedAt = now;
  const foodType = FOOD_KINDS.includes((req.body || {}).foodType) ? req.body.foodType : 'pellets';
  broadcast({ type: 'feed', foodType });
  res.json({ ok: true, foodType });
});

// 上傳頁 QR Code：優先用請求的 host（支援 tunnel/雲端網域），本機開才退回區網 IP
app.get('/api/qr', async (req, res) => {
  const host = req.headers.host || '';
  const isLocal = /^(localhost|127\.0\.0\.1)/.test(host);
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url = isLocal
    ? `http://${lanIP()}:${PORT}/upload/`
    : `${proto}://${host}/upload/`;
  const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 1 });
  res.json({ url, dataUrl });
});

function lanIP() {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

//server.listen(PORT, () => {
//  console.log('');
//  console.log('🐟 水族箱投影系統啟動！');
//  console.log(`   入口頁   http://localhost:${PORT}/       （先選投影、上傳或管理台）`);
//  console.log(`   投影頁   http://localhost:${PORT}/display/   （按 F11 全螢幕）`);
//  console.log(`   控制台   http://localhost:${PORT}/admin/`);
//  console.log(`   手機上傳 http://${lanIP()}:${PORT}/upload/   （或掃控制台的 QR Code）`);
//  console.log('');
//});
