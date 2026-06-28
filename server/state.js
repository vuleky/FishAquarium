// 設定與魚清單的讀寫（data/state.json）
const fs = require('fs');
const path = require('path');

// Railway/雲端：設環境變數 DATA_DIR 指向掛載的 Volume → 更版不洗資料
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
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
  centerX: 0.5,           // 亮相/合照中心 X（投影校正，0~1）
  centerY: 0.5,           // 亮相/合照中心 Y
  bgBrightness: 0.85,     // 背景暗度（<1 變暗，讓魚突出）
  bgContrast: 1.0,        // 背景對比
  bgMotion: 1.0,          // 背景水流動感強度（0=靜止）
};

// 民族國小 115 學年度 美術班家族（官方清單順序）
const FAMILY_NAMES = ['董源', '劉海栗', '廖繼春', '孟克', '莫內', '郭熙', '黃君璧', '李梅樹',
  '米開朗基羅', '林布蘭', '馬遠', '畢卡索', '郭雪湖', '張大千', '蒙德里安', '黃土水', '趙孟頫',
  '董其昌', '梵谷', '林玉山', '拉斐爾', '陳進', '石濤', '陳澄波', '吳昌碩', '沃荷', '達文西'];
const FAMILY_COUNT = FAMILY_NAMES.length; // 27
let state = { config: { ...DEFAULT_CONFIG }, fish: [], families: [], fgAdjust: {} };

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      config: { ...DEFAULT_CONFIG, ...(raw.config || {}) },
      fish: Array.isArray(raw.fish) ? raw.fish : [],
      families: Array.isArray(raw.families) ? raw.families : [],
      fgAdjust: raw.fgAdjust && typeof raw.fgAdjust === 'object' ? raw.fgAdjust : {},
    };
  } catch {
    state = { config: { ...DEFAULT_CONFIG }, fish: [], families: [], fgAdjust: {} };
  }
  // 清掉檔案已不存在的魚
  state.fish = state.fish.filter(f =>
    fs.existsSync(path.join(FISH_DIR, f.file)));
  // 預建家族；名字 = 官方名 + 「家族」。預設名(第N家)或舊裸名才覆蓋，不動手改過的
  for (let i = 1; i <= FAMILY_COUNT; i++) {
    const bare = FAMILY_NAMES[i - 1];
    const official = bare + ' 家族';
    const fam = state.families.find(x => x.id === i);
    if (!fam) state.families.push({ id: i, name: official });
    else if (/^第\d+家$/.test(fam.name) || fam.name === bare) fam.name = official;
  }
  state.families.sort((a, b) => a.id - b.id);
  // 補舊魚的編號
  let next = state.fish.reduce((m, f) => Math.max(m, f.num || 0), 0);
  for (const f of state.fish) if (!f.num) f.num = ++next;
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

// 投影/輪播只看「當前魚」（archived 的是歷史，不顯示）
function listFish() { return state.fish.filter(f => !f.archived); }
function listAllFish() { return state.fish; }

// 上傳：一家一魚。有 familyId → 舊的當前魚轉歷史(archived)，存新魚。
function addFish({ id, name, file, headDir, familyId }) {
  const fam = familyId ? state.families.find(x => x.id === Number(familyId)) : null;
  if (fam) {
    for (const f of state.fish) if (f.familyId === fam.id && !f.archived) f.archived = true;
  }
  const num = fam ? fam.id : state.fish.reduce((m, f) => Math.max(m, f.num || 0), 0) + 1;
  const fish = {
    id, name: name || (fam ? fam.name : ''), file, hidden: false, size: 1, v: 0, num,
    familyId: fam ? fam.id : null, archived: false,
    headDir: headDir === -1 ? -1 : 1,
    createdAt: Date.now(),
  };
  state.fish.push(fish);
  save();
  return fish;
}

function listFamilies() {
  return state.families.map(fam => ({
    ...fam,
    current: state.fish.find(f => f.familyId === fam.id && !f.archived) || null,
    historyCount: state.fish.filter(f => f.familyId === fam.id && f.archived).length,
  }));
}
function renameFamily(id, name) {
  const fam = state.families.find(x => x.id === Number(id));
  if (!fam) return null;
  fam.name = String(name || '').slice(0, 20) || fam.name;
  save();
  return fam;
}
function familyHistory(id) {
  return state.fish.filter(f => f.familyId === Number(id)).sort((a, b) => b.createdAt - a.createdAt);
}
// 還原歷史魚：把它設回當前，同家族其他當前的轉歷史
function restoreFish(fishId) {
  const f = getFish(fishId);
  if (!f || !f.familyId) return null;
  for (const o of state.fish) if (o.familyId === f.familyId && !o.archived) o.archived = true;
  f.archived = false;
  save();
  return f;
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
// fgAdj：前景對位 {x,y}=位移(占畫面比例,-0.5~0.5)、scale=縮放倍率
function listBackgrounds() {
  try {
    return fs.readdirSync(BG_DIR)
      .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
      .sort()
      .map(file => {
        const fg = path.parse(file).name + '.png';
        return {
          file,
          fg: fs.existsSync(path.join(FG_DIR, fg)) ? fg : null,
          fgAdj: state.fgAdjust[file] || { x: 0, y: 0, scale: 1 },
        };
      });
  } catch { return []; }
}
function setFgAdjust(file, patch) {
  const a = state.fgAdjust[file] || { x: 0, y: 0, scale: 1 };
  if (patch.x !== undefined) a.x = Math.max(-0.5, Math.min(0.5, +patch.x || 0));
  if (patch.y !== undefined) a.y = Math.max(-0.5, Math.min(0.5, +patch.y || 0));
  if (patch.scale !== undefined) a.scale = Math.max(0.5, Math.min(2, +patch.scale || 1));
  state.fgAdjust[file] = a;
  save();
  return a;
}

module.exports = {
  DATA_DIR, FISH_DIR, BG_DIR, FG_DIR,
  load, getConfig, setConfig,
  listFish, listAllFish, addFish, updateFish, removeFish, getFish, touchFish,
  listFamilies, renameFamily, familyHistory, restoreFish,
  listBackgrounds, setFgAdjust,
};
