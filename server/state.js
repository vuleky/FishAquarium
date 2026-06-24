// 設定與魚清單的讀寫（data/state.json）
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const FISH_DIR = path.join(DATA_DIR, 'fish');
const BG_DIR = path.join(DATA_DIR, 'backgrounds');
const FG_DIR = path.join(DATA_DIR, 'foregrounds');

const DEFAULT_CONFIG = {
  bgIntervalSec: 45,      // 背景輪播秒數
  maxFishOnScreen: 10,    // 同場魚數上限
  fishSize: 3,            // 魚基準尺寸 1~5 號（3≈螢幕高 16%）
  fishOnScreenSec: 60,    // 每隻魚在場秒數
  swimSpeed: 1.0,         // 游速倍率
  soundOn: false,         // 環境音效
  volume: 0.5,
  paused: false,
  fgDecor: true,          // 程序化前景水草/岩石（立體遮擋感）
  autoSpotlightSec: 180,  // 自動輪流亮相間隔秒數（0=關）
  dayCycleSec: 0,         // 晨昏→深夜一輪秒數（0=關，固定中午）
  farBlur: true,          // 遠景魚模糊（景深）
  bgBrightness: 0.85,     // 背景暗度（<1 變暗，讓魚突出）
  bgContrast: 1.0,        // 背景對比
  bgMotion: 1.0,          // 背景水流動感強度（0=靜止）
};

let state = { config: { ...DEFAULT_CONFIG }, fish: [] };

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      config: { ...DEFAULT_CONFIG, ...(raw.config || {}) },
      fish: Array.isArray(raw.fish) ? raw.fish : [],
    };
  } catch {
    state = { config: { ...DEFAULT_CONFIG }, fish: [] };
  }
  // 清掉檔案已不存在的魚
  state.fish = state.fish.filter(f =>
    fs.existsSync(path.join(FISH_DIR, f.file)));
  save();
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getConfig() { return state.config; }

function setConfig(patch) {
  for (const k of Object.keys(DEFAULT_CONFIG)) {
    if (patch[k] !== undefined) state.config[k] = patch[k];
  }
  save();
  return state.config;
}

function listFish() { return state.fish; }

function addFish({ id, name, file, headDir }) {
  const fish = {
    id, name: name || '', file, hidden: false, size: 1, v: 0,
    headDir: headDir === -1 ? -1 : 1,   // 圖中魚頭朝向：1=右、-1=左
    createdAt: Date.now(),
  };
  state.fish.push(fish);
  save();
  return fish;
}

function updateFish(id, patch) {
  const f = state.fish.find(x => x.id === id);
  if (!f) return null;
  if (patch.hidden !== undefined) f.hidden = !!patch.hidden;
  if (patch.name !== undefined) f.name = String(patch.name).slice(0, 30);
  if (patch.size !== undefined) {
    f.size = Math.min(4, Math.max(0.35, Number(patch.size) || 1)); // 個別縮放 0.35x~4x（鯨魚）
  }
  if (patch.headDir !== undefined) {
    f.headDir = patch.headDir === -1 ? -1 : 1;
  }
  save();
  return f;
}

function getFish(id) { return state.fish.find(x => x.id === id) || null; }

// 圖檔被改動（旋轉）→ 版本 +1，前端據此重載貼圖
function touchFish(id) {
  const f = getFish(id);
  if (!f) return null;
  f.v = (f.v || 0) + 1;
  save();
  return f;
}

function removeFish(id) {
  const i = state.fish.findIndex(x => x.id === id);
  if (i === -1) return false;
  const [f] = state.fish.splice(i, 1);
  try { fs.unlinkSync(path.join(FISH_DIR, f.file)); } catch {}
  save();
  return true;
}

// 每張背景可配一張同名前景 PNG（data/foregrounds/<base>.png，蓋在魚前面）
function listBackgrounds() {
  try {
    return fs.readdirSync(BG_DIR)
      .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
      .sort()
      .map(file => {
        const fg = path.parse(file).name + '.png';
        return { file, fg: fs.existsSync(path.join(FG_DIR, fg)) ? fg : null };
      });
  } catch { return []; }
}

module.exports = {
  DATA_DIR, FISH_DIR, BG_DIR, FG_DIR,
  load, getConfig, setConfig,
  listFish, addFish, updateFish, removeFish, getFish, touchFish,
  listBackgrounds,
};
