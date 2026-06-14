# Mia School Fishtank — 兒童畫魚水族箱投影系統

**接手開發前必讀：**
1. `docs/ARCHITECTURE.md` — 完整架構設計
2. `docs/PROGRESS.md` — 進度 checklist，從第一個未勾選 milestone 繼續

**規則：**
- 每完成一個 milestone，立刻更新 `docs/PROGRESS.md`（勾選 + 備註）
- 重要決策寫入 PROGRESS.md 的「備註 / 決策紀錄」
- 程式模組保持小檔（<300 行）
- 全離線可用：不可引入 CDN 依賴，library 放 `public/vendor/`

**啟動方式（開發完成後）：** `npm start` → 投影頁 http://localhost:3000 全螢幕(F11)，手機掃 admin 頁 QR code 上傳。
