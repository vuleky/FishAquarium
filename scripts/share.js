const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');

const PORT = 3000;
const BIN_DIR = path.join(__dirname, '..', 'bin');
const CLOUDFLARED_PATH = path.join(BIN_DIR, 'cloudflared');

// 顏色輔助
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m'
};

// 確保 bin 目錄存在
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

// 支援重定向的下載輔助函數
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    function get(targetUrl) {
      const protocol = targetUrl.startsWith('https') ? https : http;
      protocol.get(targetUrl, (response) => {
        // 處理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          get(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`下載失敗，狀態碼: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }
    
    get(url);
  });
}

// 檢查全域或本地是否有 cloudflared
function getCloudflaredCommand() {
  // 1. 檢查系統全域 cloudflared
  try {
    execSync('which cloudflared', { stdio: 'ignore' });
    return 'cloudflared';
  } catch (e) {}

  // 2. 檢查本專案 bin 目錄下的 cloudflared
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    try {
      const stats = fs.statSync(CLOUDFLARED_PATH);
      // 合法的 cloudflared 二進位檔至少 > 10MB
      if (stats.size > 10 * 1024 * 1024) {
        return CLOUDFLARED_PATH;
      } else {
        console.log(`${colors.yellow}⚠️ 檢測到損壞或不完整的本地 cloudflared 檔案，將重新下載...${colors.reset}`);
        fs.unlinkSync(CLOUDFLARED_PATH);
      }
    } catch (e) {
      try { fs.unlinkSync(CLOUDFLARED_PATH); } catch (err) {}
    }
  }

  return null;
}

// 自動下載 cloudflared
async function ensureCloudflared() {
  const cmd = getCloudflaredCommand();
  if (cmd) return cmd;

  console.log(`${colors.cyan}ℹ 未檢測到 cloudflared。系統將自動為您準備可攜式通道工具...${colors.reset}`);
  
  if (process.platform !== 'darwin') {
    throw new Error('自動下載目前僅支援 macOS。若您使用 Windows/Linux，請手動下載安裝 cloudflared。');
  }

  const isArm = process.arch === 'arm64';
  const archName = isArm ? 'arm64' : 'amd64';
  const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${archName}.tgz`;
  const tgzPath = CLOUDFLARED_PATH + '.tgz';

  console.log(`${colors.yellow}👉 正在為您下載 macOS (${isArm ? 'Apple Silicon M1/M2/M3' : 'Intel'}) 專用版本...${colors.reset}`);
  console.log(`${colors.yellow}   下載網址: ${downloadUrl}${colors.reset}`);
  console.log(`${colors.yellow}   這通常需要 10-30 秒，請稍候...${colors.reset}`);

  try {
    // 確保之前若有殘留的 tgz 先刪掉
    if (fs.existsSync(tgzPath)) {
      fs.unlinkSync(tgzPath);
    }
    
    await downloadFile(downloadUrl, tgzPath);
    
    console.log(`${colors.yellow}📦 正在解壓縮檔案...${colors.reset}`);
    execSync(`tar -xzf "${tgzPath}" -C "${BIN_DIR}"`);
    
    // 刪除壓縮檔
    try { fs.unlinkSync(tgzPath); } catch (e) {}

    // 賦予執行權限
    fs.chmodSync(CLOUDFLARED_PATH, '755');
    console.log(`${colors.green}✔ 下載與解壓完成，並成功授權！${colors.reset}\n`);
    return CLOUDFLARED_PATH;
  } catch (err) {
    // 發生錯誤時清理
    try { if (fs.existsSync(tgzPath)) fs.unlinkSync(tgzPath); } catch (e) {}
    try {
      if (fs.existsSync(CLOUDFLARED_PATH)) {
        const s = fs.statSync(CLOUDFLARED_PATH);
        if (s.size < 10 * 1024 * 1024) fs.unlinkSync(CLOUDFLARED_PATH);
      }
    } catch (e) {}
    
    console.error(`${colors.red}❌ 下載或安裝失敗: ${err.message}${colors.reset}`);
    console.log(`${colors.yellow}💡 建議嘗試手動安裝: 執行 brew install cloudflared${colors.reset}`);
    process.exit(1);
  }
}

// 啟動 Express 本地伺服器
function startServer() {
  console.log(`${colors.cyan}▶ 正在啟動水族箱本地伺服器...${colors.reset}`);
  const serverProc = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
    stdio: 'inherit' // 伺服器日誌輸出直接導向到當前終端機
  });

  serverProc.on('error', (err) => {
    console.error(`${colors.red}❌ 啟動伺服器出錯: ${err.message}${colors.reset}`);
    process.exit(1);
  });

  return serverProc;
}

// 啟動 Tunnel 並獲取公開網址
function startTunnel(cloudflaredBin) {
  console.log(`${colors.cyan}▶ 正在建立公網安全通道 (Cloudflare Tunnel)...${colors.reset}`);
  
  const tunnelProc = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${PORT}`]);
  let tunnelUrl = null;

  // Cloudflare Tunnel 的日誌輸出主要在 stderr
  tunnelProc.stderr.on('data', (data) => {
    const output = data.toString();
    
    // 用正則表達式尋找 trycloudflare 網址
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      printSuccessMessage(tunnelUrl);
      
      // 自動在瀏覽器打開本地首頁以查看 QR Code
      setTimeout(() => {
        try {
          console.log(`${colors.cyan}▶ 正在為您自動開啟本地瀏覽器首頁...${colors.reset}`);
          execSync(`open http://localhost:${PORT}`);
        } catch (e) {}
      }, 1500);
    }
  });

  tunnelProc.on('error', (err) => {
    console.error(`${colors.red}❌ 建立通道出錯: ${err.message}${colors.reset}`);
  });

  tunnelProc.on('close', (code) => {
    console.log(`${colors.yellow}ℹ 通道已關閉 (代碼: ${code})${colors.reset}`);
  });

  return tunnelProc;
}

function printSuccessMessage(url) {
  console.log('\n' + '='.repeat(64));
  console.log(`${colors.bright}${colors.green}🎉 水族箱分享成功！通道已安全建立！${colors.reset}`);
  console.log('='.repeat(64));
  console.log(`\n ${colors.bright}請複製以下網址傳給您的團隊夥伴：${colors.reset}`);
  console.log(` 🔗 ${colors.bright}${colors.cyan}${url}${colors.reset}`);
  console.log(`\n ${colors.yellow}💡 貼心提醒：${colors.reset}`);
  console.log(`   - 夥伴使用${colors.bright}手機${colors.reset}打開這網址：會${colors.bright}直接進入畫魚畫板${colors.reset}`);
  console.log(`   - 夥伴使用${colors.bright}電腦${colors.reset}打開這網址：會進入首頁，並顯示 ${colors.bright}QR Code${colors.reset} 可掃描`);
  console.log(`   - 您本地的瀏覽器即將自動打開，您也可以在網頁上直接看到大大的 QR Code`);
  console.log(`   - 測試期間，請${colors.bright}保持這個終端機視窗開啟${colors.reset}，關閉視窗即停止分享。`);
  console.log('='.repeat(64) + '\n');
}

async function main() {
  console.log(`${colors.bright}${colors.bgBlue} 🐟 虛擬水族箱 - 團隊測試一鍵分享工具 🐟 ${colors.reset}\n`);
  
  try {
    const cloudflaredBin = await ensureCloudflared();
    const serverProc = startServer();
    
    // 等伺服器稍微啟動後再跑 Tunnel
    setTimeout(() => {
      const tunnelProc = startTunnel(cloudflaredBin);
      
      // 處理程序退出事件，確保子進程也被乾淨地關閉
      const cleanup = () => {
        console.log(`\n${colors.cyan}▶ 正在關閉所有程序...${colors.reset}`);
        try { tunnelProc.kill(); } catch (e) {}
        try { serverProc.kill(); } catch (e) {}
        process.exit();
      };
      
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    }, 1000);

  } catch (err) {
    console.error(`${colors.red}❌ 初始化失敗: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
