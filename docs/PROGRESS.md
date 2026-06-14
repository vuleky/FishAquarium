# 開發進度（接手開發必讀）

> 規則：每完成一項就勾選並加一行備註。接手時從第一個未勾選項目繼續。
> 架構見 `docs/ARCHITECTURE.md`。

## 狀態：✅ 全部完成（2026-06-11），可進行現場彩排

## Milestones

- [x] M0 專案初始化：package.json、目錄結構、CLAUDE.md、下載 pixi.min.js 到 public/vendor/ ✓ pixi v8.18.3
- [x] M1 伺服器骨架：Express 靜態檔 + /api/fish 上傳(multer) + /api/state + WebSocket 廣播 + state.json 讀寫 ✓ 已測 API
- [x] M2 圖片處理管線：sharp 白底去背 → 裁邊 → 縮圖 → PNG 透明（fishProcess.js，含已去背 PNG 直通）✓ 測試圖去背成功
- [x] M3 投影頁基礎：PixiJS 全螢幕、背景輪播（交叉淡化 + Ken Burns、秒數可設）✓ 無背景時有內建深海漸層
- [x] M4 魚游動引擎：正弦游動、尾擺變形(MeshPlane)、轉向翻面、深度分層、漂浮感 ✓ 瀏覽器實測通過
- [x] M5 魚輪替系統：佇列輪替、新魚插隊入場 + 名字橫幅 + feature 模式 ✓ 26 隻壓測留到 M9
- [x] M6 水底氛圍：光束、氣泡、微粒、caustics、vignette、位移濾鏡水晃、WebAudio 合成音效 ✓ 截圖驗證
- [x] M7 手機上傳頁：選照片、拖框裁切、名字輸入、上傳、成功畫面、拍照小技巧 ✓
- [x] M8 控制台：背景管理、輪播秒數、魚清單隱藏/刪除/主打、QR Code、暫停 ✓ 截圖驗證
- [x] M9 整合測試 ✓ 25 張×5 併發 1 秒完成；26 隻輪替 35 秒換手 4 隻、總數守恆零重複；背景 15 秒輪播+手動切換 OK
- [x] M10 RUNBOOK.md：活動當天操作手冊 ✓

## 備註 / 決策紀錄

- 2026-06-11：架構設計完成，使用者確認 ✓（音效：要、含開關）。
- 修正 1：魚大小改為螢幕高度比例（fish.js FISH_TARGET_H_RATIO=0.15），不再固定 150px。
- 修正 2：新魚湧入會超過同場上限 → onNew 滿員時改排隊首 + pendingAnnounce，入場時才播報。
- server `/` 302 → `/display/`。
- 修正 3：sync/onExited 防止佇列重複（loading 中的魚被二次入隊）。
- 測試資料：26 隻魚 + 2 張背景在 data/，活動前清法見 RUNBOOK「想全部重來」。
- 投影頁 window.__aq 為 debug hook（bg / fishMgr / getConfig）。

## 第二輪功能（2026-06-11，已完成並實測）

- [x] 批次管理：admin 魚清單勾選 + 全選 + 批次隱藏/顯示/刪除（POST /api/fish/bulk {ids, action}）
- [x] 去背預覽：上傳頁「✨去背預覽」→ 格紋透明預覽 → 強度 弱/中/強 重試（/api/fish/preview，strength=low|medium|high → TOL 36/52/72）→ 確認才送出（送處理後 PNG，伺服器直通不重做）
- [x] 前景圖層（立體遮擋）：
  - 每張背景可配同名前景 PNG（data/foregrounds/<base>.png），蓋在魚前面，與背景同步 cover-fit/Ken Burns/淡入淡出
  - API：POST/DELETE /api/backgrounds/:file/foreground；/api/state backgrounds 變物件 [{file, fg}]
  - 程序化前景水草/岩石剪影（Seaweed in effects.js），config.fgDecor 開關，左右下角搖曳，避開中央
- AI 自動前後景分割：評估後不內建（深度模型太重），改用「事先做前景 PNG」流程，資源見 RUNBOOK

## 第三輪功能（2026-06-11，已完成並實測）

- [x] 背景可調參數（admin 滑桿，即時生效）：
  - bgBrightness 0.3–1.2（預設 0.85）：ColorMatrixFilter 壓暗背景讓魚突出
  - bgContrast 0.7–1.5（預設 1.0）
  - bgMotion 0–3（預設 1.0）：背景專屬 DisplacementFilter 晃動 + caustics 亮度/流速連動，0 = 靜止
  - 濾鏡掛在 bgLayer；bgColor 同時掛 fgLayer（前景圖色調與背景一致）；魚不受影響保持鮮豔
- 前景 PNG 製作流程（Photopea）已寫入 RUNBOOK；前景 PNG 畫布需與背景圖同尺寸才會對位

## 第四輪功能（2026-06-11，已完成並實測）

- [x] 魚尺寸系統：
  - config.fishSize 1~5 號（admin 滑桿 step 0.5，預設 3）；號數→比例為幾何級距 sizeToRatio()：1=10%、3≈16%、5=25% 螢幕高
  - 改尺寸即時生效：場上魚 setSizeRatio() 平滑 tween 到新尺寸
  - 新魚（announce）以 1.6 倍 boost 登場，sizeMul 每秒 -0.015 約 40 秒縮回基準
  - 深度縮放範圍收窄 0.55~1.3 → 0.78~1.15（depthF），遠的魚也清楚
  - 輪替回鍋的魚用基準尺寸（放大是新魚特權）；⭐ 主打仍為 1.8 倍至中央

## 第五輪功能（2026-06-11，已完成並實測）

- [x] 個別魚縮放：fish.size 0.35x~4x（admin ➖/➕ 對數級距 ×1.33，×4=鯨魚）；大魚游速/尾擺 ÷√size 有鯨魚慢游感；PATCH /api/fish/:id {size}
- [x] 旋轉 90°：admin ↻ 按鈕 + 上傳頁預覽步驟 ⟲/⟳（client 端轉 previewData）；POST /api/fish/:id/rotate {dir:±1} sharp 改檔 + fish.v++ → 投影頁偵測 v 變更原地重載貼圖
- [x] 名字強制：前端（預覽前+送出前擋）+ 伺服器 422 雙重驗證；每次上傳完清空欄位（綁魚不綁手機）；admin 點魚名可改名

## 第六輪功能（2026-06-11，已完成並實測）

- [x] 華麗進場「從天而降」：新魚（announce）改為 drop 狀態 — 空中重力加速 + 微翻滾 → 入水觸發 onSplash（SplashFX.burst：14 白沫拋射 + 22 氣泡放射 + 雙圈擴散漣漪；Sound.plunge：低頻 thump + bandpass 噪音水花）→ 水中阻力減速、搖晃收斂 → 穩住轉 swim。輪替回鍋仍走側邊游入。截圖驗證 OK
- 殘留改善點（未做）：真實照片（非白紙畫）去背不掉 → 建議用手機「拷貝主體」先去背；美術展質感選項（標籤模式/晨昏/鯨魚剪影/真實水聲）討論過待指示

## 第七輪功能（2026-06-12，已完成並以快轉模擬實測）

- [x] 群游（boids-lite）：fishMgr._trySchool 每 ~5 秒抽小魚（userSize≤1.3）跟隊長；隊長最多帶 2 隻、深度差 <0.4；follower 對齊方向（用慣性轉向）、貼齊 baseY+offset、落後加速/超前減速（gap/220）；10~25 秒散隊；exit/destroy 自動釋放 _nFollow
- [x] 前景互動：Fish.hideZones（水草叢兩區，fgDecor 開才有）；魚在區內游速 ×0.45 = 躲藏感。實測減速比 0.45 ✓
- [x] 慣性轉向：_startTurn → flip.scale.x 餘弦翻面 + _bank 側傾 + 減速（0.3~1.0），過半才換 dir；大魚轉更慢（÷√userSize）；邊緣/群游對齊都走此機制，exit 維持即時轉。模擬軌跡 1→0.61→-0.16→-0.84→-1 ✓
- ⚠️ 測試備忘：preview 面板 hidden 時瀏覽器暫停 rAF → 動畫凍結，非 bug；驗證用 fishMgr.update 快轉模擬
- 2026-06-12：/api/qr 改為依請求 host 出 URL（支援 cloudflared/ngrok tunnel 與雲端部署），localhost 才退回區網 IP。遠端測試建議 cloudflared quick tunnel；Vercel/Netlify 不適用（WebSocket + 檔案系統儲存）；admin 無密碼，公開測試期間注意連結外流

## 第八輪功能（2026-06-12，已完成並實測）

- [x] 魚頭方向系統（修「倒退游」根因 — 系統原本假設圖中魚頭一律朝右）：
  - fish.headDir（1=右、-1=左）存 metadata；翻面公式 flip.scale.x = dir × headDir（慣性轉向同步乘 headDir）
  - 上傳頁：預覽步驟有醒目金框「魚頭朝哪個方向？」⬅️⬆️➡️⬇️ 四鈕；選上/下自動順轉 90° 轉橫並設好 headDir；另保留 ⟲⟳ 微調
  - admin：魚卡片 🐟➡️/🐟⬅️ 切換鈕（倒退游一鍵修正），投影端 setHeadDir 即時翻面不重載
- [x] 獵食秀：最大魚追小魚（fishMgr._tryHunt）— 每 40~70 秒，若場上最大魚比某些魚大 1.54 倍以上（hgt×0.65 門檻），追隨機小魚 8 秒（橫幅「🦈 大魚出擊！」）；獵物被逼近（< 獵人身高 1.4 倍）就爆衝 2.6x + 轉身逃 + 垂直閃避，永遠吃不到；結束獵人 idle 2 秒喘息。模擬驗證：153px 追 81px、收場無傷亡
- [x] 投影頁 QR 浮動面板（使用者自加 HTML+JS）：修掉我重複接線造成的開關打架，保留使用者版（含點外關閉、游標 3 秒自動隱藏）

- 2026-06-12：新增雙擊啟動「啟動水族箱.command」（自動清 port、起伺服器、開投影頁）與「停止水族箱.command」，已實測。EADDRINUSE 常見原因 = 舊程序沒關，啟動腳本會自動處理
- 2026-06-12：cloudflared 二進位在專案 bin/（使用者自下載）；quick tunnel 網址每次隨機、程序死了舊網址不可復原。新增「分享水族箱到網路.command」雙擊開通道、自動顯示+複製新網址。官方文件核對後，ngrok 免費帳號提供 1 個自動配發且固定的 Dev Domain（不能自選名稱）；新增「設定固定網址_ngrok.command」與「固定網址分享水族箱.command」，固定網址優先、cloudflared 臨時網址備援

## 第八輪功能（2026-06-12，已完成）

- [x] 邊界硬限制：swim 狀態 root.x 夾在 [lo, w-lo]（lo=min(halfW×0.5, w×0.45)，鯨魚也安全）；baseY 全域夾 h×0.08~0.9 — 追逐/群游/覓食再快都不出畫面
- [x] 獵食不出字幕（移除「大魚出擊」banner，默默上演）
- [x] 後台魚卡片放大：寬 132→190、縮圖高 72→104、按鈕 17px/9px padding、勾選框 26px
- [x] 餵食系統 v1：
  - POST /api/feed（全域 2 秒冷卻 429）→ WS broadcast feed → FoodFX 撒 6 顆橘色飼料緩沉 + 水花音
  - _feedLogic：每顆飼料吸引最近的 swim 魚（獵食中不搶食）；嘴邊（顯示高×0.55）吃掉 → 泡泡 pop
  - 吃一顆 feedMul +0.05（上限 1.35），每 frame 緩慢消退（約幾分鐘）→ 持續餵=保持大、不餵=縮回
  - 入口：上傳頁 step1 + 完成頁「🍤 餵魚」鈕（冷卻提示）、admin「🍤 餵食」鈕
  - 純投影端視覺成長，不寫入 fish.size（與 admin 個別縮放互不干擾）
- 註：tunnel 重啟網址又換 → https://batch-worldcat-further-gas.trycloudflare.com（驗證 200 + feed ok）

## 第九輪功能（2026-06-12，已完成；display 端以邏輯覆核+語法檢查驗證，現場請重整投影頁）

- [x] 呼叫我的魚：上傳成功 → {id,name} 存手機 localStorage（最多 10 隻）；上傳頁出現「🔍 找『名字』」鈕 → POST /api/fish/:id/feature（魚游到中央亮相）；404 自動從清單移除；6 秒冷卻
- [x] 自動輪流亮相：config.autoSpotlightSec（預設 180，0=關，admin 滑桿 0~600/30）；display 輪 roster 可見魚依序 feature — 每個小孩保證有高光時刻
- [x] 吃飽愛心：魚吃到飼料 → 頭上 ❤️ 緩升淡出（Tex.heart + FoodFX.heart）
- [x] 畢業巡游：admin「🎓 畢業巡游」（confirm）→ POST /api/parade → 場上魚先游出（feature 中會先解除，否則卡死 — 已修）→ 全部可見魚依序從左進場、三泳道交錯、齊速游過、魚下方掛名字標籤（PIXI.Text，scale 反向補償）→ 結束 banner「謝謝大家，明年見！」→ sync 自動恢復正常輪替。巡游期間 fill() 停用、獵食/群游/餵食邏輯暫停
- /api/fish/:id/feature 補 404 檢查

- 2026-06-12：ngrok 固定網址方案驗收（另一 AI 建置）：token 已設、網域 reach-reoccur-manicotti.ngrok-free.dev 已配發。抓到關鍵缺陷：腳本沒帶 --domain → 免費版會拿隨機網址。已修：固定網域存 .ngrok-domain，腳本自動帶 --domain。tunnel 已實際開通驗證（/api/state + QR 網域 ✓）。注意：ngrok 免費版手機首次開啟有「Visit Site」提示頁，按一下即可

- 2026-06-13：團隊本機打包方案。sharp 是原生模組（sharp-darwin-arm64）→ node_modules 不可跨平台，故打包**原始碼 ZIP（不含 node_modules）**，啟動器首次自動 npm install 抓對應平台 sharp。
  - 跨平台啟動器：啟動水族箱.command（Mac，強化：偵測 node 缺失→開 nodejs.org、首次自動 npm install）、啟動水族箱-Windows.bat、停止水族箱-Windows.bat
  - scripts/打包給團隊.command：rsync 排除 node_modules/.git/data 內容/tunnel binaries → 桌面 ZIP（實測僅 321KB，保留空 data 子夾）
  - 安裝教學.txt（root，素人步驟：解壓→雙擊→裝 Node→等自動安裝→F11，含 Gatekeeper/SmartScreen 排錯）
  - 驗收：clean unzip→npm install→PORT=3999 啟動，三頁 200 + sharp 去背 + 上傳管線全通

- 2026-06-13：控制台 UI/UX 重構（admin/index.html 整檔重寫，功能與 API 全保留）。資訊架構從「1 張擠 11 滑桿的卡」拆成：📱上傳入口 / 🎬現場控制（大動作鈕+自動亮相）/ 🐠魚群節奏 / 🎨畫面氛圍（分背景輪播·讓魚突出·聲音三小節）/ 🖼背景圖庫 / 🐟魚清單。魚卡片重構：縮圖上浮 checkbox+尺寸 badge+隱藏旗標，主動作「⭐游到中央亮相」獨立大鈕，尺寸 stepper 帶「大小」標籤，次要動作改 icon+文字（頭朝右/轉90°/隱藏/刪除）。滑桿改 label+填色軌道+帶單位值（fmt()：秒/隻/號/%/×）。checkbox 改 switch。驗證：JS 語法 ✓、JS 引用 id 與 HTML 全對應 ✓、API 呼叫不變（使用者婉拒 computer use 故未截圖，請重整 admin 確認）

- 2026-06-13：餵食體驗強化（選定 B2+A2+C1+C2+D1+D3）。
  - B2 飼料種類：FOOD_TYPES{pellets 顆粒/flakes 薄片散更廣翻飄/treat 特別餌發光+成長×多}；/api/feed 收 foodType（白名單，bogus 退 pellets）；upload+admin 各 3 顆飼料鈕
  - A2 撒料：FoodFX.ripple 入水漣漪 + Sound.scatter 灑落聲（取代原 splash）
  - C1 搶食騷動：覓食 v×1.7、_wave eager×1.6 尾擺更急、接近飼料 burst 撲咬
  - C2 咬食：Fish.onEat → _gulp 縮放脈衝 + Sound.nibble；飼料消失冒泡
  - D1 加亮：_flash 吃到閃白（lerp baseTint→白）+ ❤️；treat 吃掉冒火花 sparkle
  - D3 飽足：每吃 5 口 food.burp 大泡 + Sound.burp
  - 新材質 Tex.pellet/flake/sparkle；新音效 Sound.scatter/nibble/burp
  - 驗證：5 檔 node --check ✓、3 種類+fallback+冷卻 API ✓、資料流交叉檢查 ✓。⚠️ Chrome MCP 無法附著 eval、使用者婉拒 computer-use → 未取動態畫面，請重整投影頁實際撒一次確認

- 2026-06-13：餵食手感微調。(1) 飼料無敵閘：_feedLogic eatY=H*0.28，飼料沉到畫面上部 ~1/4 前不可吃、且魚不指派目標（不提早攔截）→ 看得到掉落過程＋愛心出現在上方。慢沉的薄片/特別餌 ~5 秒可見。(2) 每隻魚單次餵食上限 FEED_LIMIT=2：吃滿讓位、棄置目標換別隻；每次 feed 廣播時全場 _ateThisFeed 歸零。數量配比：顆粒8/薄片16/特別餌5 顆，夠多魚分食。語法 ✓ API ✓（動態畫面待使用者重整投影頁確認）

- 2026-06-13：餵食後散開 + 亮相置頂。
  - (1) Fish.homeY 常駐深度：沒追飼料時 baseY 緩回 homeY（pow .993）→ 餵食把魚拉到同一條線後會各自散回。fishMgr 偵測 food.pellets 由有→無（_hadFood）→ 全部 scatterHome(H) 重抽深度 + 小衝刺。
  - (2) startFeature 設 root.zIndex=1000 浮到最前（fishLayer.sortableChildren 已開），feature 結束還原 depth + 換 homeY。
  - 待辦討論：寶寶魚跟隨（效能評估給使用者，未實作）。語法 ✓

- 2026-06-13：寶寶魚系統。Baby class（輕量 PIXI.Sprite 用媽媽 mesh.texture，不做網格變形 → 效能無虞）：跟在媽媽後方、延遲拖尾(pow .88)、同向翻面、sin 擺動、淡入；媽媽離場→淡出自刪。fishMgr.babies Set 上限 BABY_CAP=8。觸發：(a) admin「🐣 生寶寶」→ POST /api/babies → spawnBabiesRandom（洗牌挑媽媽、每隻 1~2 隻、到上限）；(b) 餵食成長呼應：_feedLogic 吃到後 feedMul≥1.45 + 每隻 15 秒冷卻 + 35% 機率自動生。巡游前清空寶寶。語法 ✓ API ✓

- 2026-06-13：寶寶上限改 — BABY_PER_MOM=8（單隻媽媽）、BABY_CAP=40（全場，輕量 sprite 安全）；mother._babyCount 追蹤、寶寶死亡時遞減。
- 2026-06-13：謝幕拆兩種按鈕。
  - A 修密版列隊 startParadeLine（/api/parade）：起手預放 7 隻散佈全寬消除空檔、間隔 60 幀(~1s)進一隻、速度 1.45、四泳道交錯 → 一大群浩浩蕩蕩。WS parade→startParadeLine。
  - B 大合照 startGather（/api/gather, WS gather）：叫齊全部可見魚（不受同場上限）→ _assignSlots 方陣（cols=ceil√(n·1.7)）→ phase in 聚攏朝中央 → hold 加名字標籤 + 倒數 3-2-1-📸 → _finishGather 清標籤、重抽 homeY、resync。排版驗證 n=1..26 全在畫面內無重疊。
  - parading 改三態 false|'line'|'gather'，update() 分支。
  - admin 現場控制新增 📸 大合照、🐣 生寶寶、🎓 畢業巡游三鈕（皆 confirm）。
  - 語法 ✓ 端點 ✓ 排版邏輯 ✓（動態畫面待重整投影頁實測）

- 2026-06-13：Windows .bat 修復 + 打包結構整理。
  - bug 根因：舊 .bat 是 LF 換行（Mac 寫出）→ Windows cmd 誤判多位元組中文行、ASCII 尾巴(play/3000)外漏成指令、且沒跑到 npm install → express MODULE_NOT_FOUND。
  - 修法：重寫 .bat 為 CRLF；chcp 65001；中文與 ASCII 分行（URL 獨立純 ASCII echo，亂碼也不漏指令）；node_modules\express 雙重檢查；裝失敗明確提示。停止 .bat 也轉 CRLF。
  - 打包結構整理：頂層只留「安裝教學.txt + 啟動水族箱.command + 啟動水族箱-Windows.bat」，其餘收進「系統檔案_請勿更動」。兩個啟動器改 ROOT 偵測（同層有 package.json 用同層，否則進子資料夾）→ 同一支在 repo 與打包後都能用。
  - 驗證：打包→解壓頂層 4 項 ✓、子層 clean npm install ✓、PORT=3998 子層啟動 200 ✓、bat CRLF ✓。
  - ⚠️ 使用者手上那包是舊版（flat+LF）→ 請重跑「打包給團隊」產新 zip 送出。
- 2026-06-13：針對 Windows `ERR_INVALID_PACKAGE_CONFIG`（壞掉或跨平台帶過來的 `node_modules\express\package.json`）加固啟動與打包。
  - 新增 `scripts/check-deps.js`，Mac / Windows 啟動前會實際載入 express/multer/qrcode/sharp/ws，確認元件可用，不再只看資料夾是否存在。
  - 若偵測到舊包殘留、雲端同步損壞、或 Mac 依賴被搬到 Windows，啟動檔會先 `npm install` 修復；仍失敗就刪除 `node_modules` 後重新安裝。
  - `scripts/打包給團隊.command` 產 ZIP 前後都檢查不得包含 `node_modules`，避免再次把平台專屬元件交給 PC / Mac 使用者。
- 2026-06-13：Windows 仍在 Google Drive 路徑 `I:\我的雲端硬碟\...` 讀到壞掉的 `node_modules\express\package.json`。再加固：Windows 啟動檔先用 robocopy 將系統檔案同步到 `%LOCALAPPDATA%\MiaSchoolFishtank\app`，並在本機資料夾執行 `npm ci` / `npm install`，避開雲端同步磁碟造成的 node_modules 損壞；用 `.deps-ok-windows` 標記避免後續每次重裝。
- 2026-06-13：PC 端診斷顯示 Windows 批次檔在中文路徑下 `HERE/ROOT/SOURCE_ROOT` 變空，robocopy 回 `ERROR 123`。交付 ZIP 改全 ASCII 結構：`FishAquarium_YYYYMMDD.zip`、外層 `FishAquarium_YYYYMMDD/`、系統資料夾 `app_files/`、啟動檔 `start-windows.bat` / `start-mac.command`、教學 `INSTALL.txt`。Windows 啟動檔新增 `app_files\package.json` 明確檢查，robocopy 失敗時輸出 debug info 並顯示 `%TEMP%\MiaSchoolFishtank-robocopy.log` 原始內容。
- 2026-06-13：PC 端再測 robocopy 顯示來源/目標被黏在一起（`app_files" C:\Users\Ben\...`），根因是 robocopy 對 quoted path 結尾反斜線解析不穩。Windows 啟動檔改為 `HERE`、`ROOT`、`SOURCE_ROOT`、`CACHE_ROOT` 全部不以 `\` 結尾；robocopy 使用 `robocopy "%SOURCE_ROOT%" "%CACHE_ROOT%" ...`。
- 2026-06-13：PC 端回報英文 ZIP + robocopy 無尾斜線版啟動成功。啟動體驗調整：Mac/Windows 啟動檔改為自動開入口頁 `http://localhost:3000/`，不再直接開 `/display/`；入口頁改成三個明顯卡片入口（投影水族箱、管理台、上傳 QR），移除手機自動跳 `/upload/`，並移除首頁 Google Fonts CDN 依賴以維持離線可用。

## Backlog：家族餵魚系統（活動後再做，使用者已提需求）

- 分組：4~5 學生一「家族」，魚以家族為單位（fish.familyId）
- 手機端「餵魚」按鈕 → 投影顯示飼料從上灑下（粒子）、該家族的魚游過去搶食（有動作可看）
- 持續餵 → 魚的 size 緩慢成長；久沒餵 → 緩慢縮小（上下限保護，建議 0.7x~2x，避免餓死感太強）
- 需做：family CRUD（admin）、上傳頁選家族、feed API + 冷卻防灌、餵食粒子 + 搶食行為、size 衰減排程（state.json 記 lastFedAt）
