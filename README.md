# 🐟 兒童畫魚水族箱投影系統

小朋友畫魚 → 手機拍照上傳 → 自動去背 → 魚在投影幕上游泳。

## 快速開始

```bash
npm install   # 第一次需要網路
npm start
```

| 頁面 | 網址 | 用途 |
|---|---|---|
| 投影頁 | http://localhost:3000/display/ | 接投影機，F11 全螢幕 |
| 控制台 | http://localhost:3000/admin/ | 背景/魚/參數/QR Code |
| 手機上傳 | 掃控制台 QR Code | 家長手機用，免裝 App |

手機與筆電需在同一個 Wi-Fi（或筆電開熱點）。啟動後完全離線可用。

## 文件

- [活動當天操作手冊](docs/RUNBOOK.md) ← 活動前必讀
- [架構設計](docs/ARCHITECTURE.md)
- [開發進度](docs/PROGRESS.md)
