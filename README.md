# 夜航卡舍 · Nightjar Arcana

用自己的 NovelAI 帳號玩 AI 抽卡。每一抽都是 AI 當場畫的新圖，抽到的卡收進卡冊，再到工坊做成會動的 LIVE 卡、能轉動反光的 3D 閃卡。

- 線上版：https://nightjar-gacha.pages.dev
- 玩法介紹：[繁體](https://nightjar-gacha.pages.dev/guide.html) ／ [简体](https://nightjar-gacha.pages.dev/guide.html#hans)

免費、不用註冊，電腦和手機都能玩。沒有 NovelAI 帳號也可以用示範模式試玩完整流程。

## 功能

- **召喚**：SSR / SR / R 稀有度、10 抽保底 SR、60 抽保底 SSR（都可以調）；角色池、場景池、V5 透明素材池；召喚演出。
- **提示詞**：畫師串 / 圖片提示詞 / 隨機詞庫三區；4,889 個附中文名的 Danbooru TAG；隨機規則；打字自動提示 TAG；中文智慧翻譯；完整 NovelAI 參數（V3～V5、多角色、圖生圖、Vibe、角色參考）。
- **卡冊**：多本卡冊、翻頁收藏、卡片詳情、下載含 / 不含生成資訊的原圖。
- **解析圖片**：讀出 NovelAI / Stable Diffusion PNG 裡的提示詞與參數。
- **工坊**：AI 深度 3D、LIVE 部件動態、PSD 式圖層、41 種一鍵風格、46 種粒子、調色與風格化濾鏡、3D 全息閃卡、燙金 / 打凸 / 壓紋等手感工藝；匯出 WebM、GIF、PNG、可轉動的閃卡網頁。
- 手機版版面、日夜配色、繁體 / 简体切換、資料備份與還原。

## 隱私

- 卡片、卡冊、設定都只存在玩家自己的瀏覽器（IndexedDB），不會上傳。
- NovelAI Token 只存在玩家的瀏覽器。線上版生圖時經由同網站的中繼（`relay/`）原封不動轉給 NovelAI；中繼只接受本站請求、只轉送 NovelAI 的三個位址，**不儲存、不記錄任何東西**。
- 備份檔不包含 Token 與任何金鑰。

## 本機執行

需要 [Python 3](https://www.python.org/)（只用標準函式庫，不用另外安裝套件）。

```bash
python server.py
```

Windows 也可以直接雙擊 `啟動抽卡模擬器.cmd`。瀏覽器會打開 http://localhost:8765 。

本機版多了「See-through 自動拆層」（需要另外安裝、需要 NVIDIA 顯卡），其他功能和線上版一樣。

## 部署到 Cloudflare Pages

```bash
python tools/build.py publish --notes "更新說明"
```

會把 `web/` 打包到 `dist/`（加上 `relay/functions` 中繼），再用 wrangler 部署到 Cloudflare Pages。詳見 [部署說明.md](部署說明.md)。

## 專案結構

| 路徑 | 內容 |
|---|---|
| `web/` | 網站本體（純 HTML / CSS / JavaScript ES modules，不需要建置工具） |
| `web/js/views/` | 各頁面：首頁、召喚、卡冊、解析、工坊、設定 |
| `web/data/tags.json` | Danbooru 詞庫 |
| `web/assets/` | 卡背、裝飾等圖片素材 |
| `relay/` | 線上版的 NovelAI 中繼（Cloudflare Pages Functions） |
| `server.py` | 本機伺服器 |
| `tools/` | 打包部署、詞庫產生、繁簡對照表、玩法介紹頁等工具 |
| `使用說明.md` | 各版本的更新紀錄與功能說明 |
| `使用項目與參考.md` | 用到的服務、程式庫、模型、字型與參考來源 |

## 授權

本專案的程式碼與圖片素材以 [MIT License](LICENSE) 釋出。

第三方元件維持各自的授權，完整清單見 [使用項目與參考.md](使用項目與參考.md)，主要有：

- 繁簡對照表（`web/js/t2s-data.js`）由 [OpenCC](https://github.com/BYVoid/OpenCC) 的字典產生，Apache License 2.0。
- 閃卡鐳射材質的公式參考 [RuiC-card-skill](https://github.com/HRuiCcc/RuiC-card-skill)，MIT。
- 深度模型在瀏覽器執行時才下載：Depth Anything V2 Small 為 Apache-2.0，**V2 Base / Large 為 CC BY-NC 4.0（禁止商用）**。
- 字型來自 Google Fonts（SIL Open Font License）。
- 詞庫的 TAG 名稱來自 [Danbooru](https://danbooru.donmai.us/) 的公開分類；中文名為本專案自行翻譯。

用本網站生成的圖片請遵守 [NovelAI 使用條款](https://novelai.net/terms)。本專案與 NovelAI、Danbooru 沒有任何關係。
