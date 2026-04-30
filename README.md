# Omnichat AI Agent

達摩本草 LINE 客服 AI 機器人 + 蝦皮評論回覆系統

---

## 目錄

- [系統概覽](#系統概覽)
- [架構圖](#架構圖)
- [專案結構](#專案結構)
- [環境需求](#環境需求)
- [安裝與部署](#安裝與部署)
- [環境變數](#環境變數)
- [管理後台](#管理後台)
- [API 文件](#api-文件)
- [蝦皮評論回覆流程](#蝦皮評論回覆流程)
- [資料庫結構](#資料庫結構)
- [安全機制](#安全機制)
- [常見問題](#常見問題)

---

## 系統概覽

本系統提供兩個主要功能：

### 1. LINE 客服 AI（透過 Omnichat）
顧客透過 LINE 傳訊息給達摩本草官方帳號，訊息由 Omnichat 轉發至本系統的 Webhook，AI 自動回覆後再透過 Omnichat 發送回 LINE。

主要能力：
- 商品推薦與搜尋（即時從 Cyberbiz 取得庫存與售價）
- 產品成分、認證、使用方法詳細查詢
- 訂單狀態查詢（已出貨 / 備貨中 / 物流追蹤）
- 貨到付款訂單資料收集後轉接真人
- 檢驗報告連結提供
- 複雜問題、客訴、退換貨自動轉接真人客服
- 每個對話房間保留獨立上下文記憶

### 2. 蝦皮評論自動回覆
本機 n8n 爬取蝦皮評論 → 呼叫本系統 API 生成回覆草稿 → 寫入 Google Sheet → 客服確認 → n8n 回寫蝦皮。

---

## 架構圖

```
LINE 顧客
  │
  ▼
Omnichat（SaaS）
  │  Webhook POST
  ▼
Express Server（GCP VM, PM2）
  │
  ├─ src/index.js        訊息路由、安全過濾
  ├─ src/agent.js        Gemini AI + Function Calling
  ├─ src/cyberbiz.js     商品/訂單 API（含本地快取）
  ├─ src/db.js           SQLite 資料庫（規則/FAQ/產品資料）
  ├─ src/review.js       蝦皮評論回覆邏輯
  ├─ src/admin.js        管理後台（Web UI）
  └─ src/omnichat.js     Omnichat 發訊/轉接 API

AI Model: Google Gemini 2.0 Flash（Vertex AI，ADC 認證）
DB:       SQLite（data/agent.db，存放於 VM 本地）
```

---

## 專案結構

```
omnichat-ai-agent/
├── src/
│   ├── index.js        主程式：Express Server、Webhook handler、API endpoints
│   ├── agent.js        AI 核心：Gemini 對話、function calling、retry 機制
│   ├── db.js           資料庫：SQLite schema、CRUD 操作、自動 migration
│   ├── cyberbiz.js     Cyberbiz 電商 API：商品搜尋、訂單查詢、2hr 快取
│   ├── omnichat.js     Omnichat API：發訊息、轉接真人、關閉對話
│   ├── review.js       蝦皮評論：模板比對、AI 草稿、Google Chat 通知
│   └── admin.js        管理後台 HTML/CSS/JS（Server-side rendered）
├── scripts/
│   ├── import-excel-qa.js      從 Excel 產品資料表批次匯入產品資訊
│   ├── update-lab-report-urls.js  批次設定產品檢驗報告 URL
│   └── ocr_triage.py           圖片 OCR 分類器（EasyOCR/pytesseract，備用）
├── docs/
│   ├── omnichat-api-guide.md
│   └── cyberbiz-product-feed-api.md
├── data/               SQLite 資料庫目錄（自動建立，不進 git）
├── .env.example        環境變數範本
├── package.json
└── README.md
```

---

## 環境需求

| 項目 | 版本 |
|------|------|
| Node.js | 18+ |
| npm | 8+ |
| GCP VM | 建議 e2-micro 以上，Ubuntu 22.04 |
| Python（選用） | 3.8+（OCR 功能才需要） |

GCP 服務需求：
- Vertex AI API 已啟用
- VM 綁定 Service Account，具備 `roles/aiplatform.user` 權限
- Application Default Credentials (ADC) 已設定（VM 上預設即可）

---

## 安裝與部署

### 本地開發

```bash
git clone <repo-url>
cd omnichat-ai-agent
npm install

cp .env.example .env
# 編輯 .env 填入各項 token

npm run dev   # nodemon 自動重啟
```

### GCP VM 部署

```bash
# 1. 拉最新代碼
git pull

# 2. 安裝/更新依賴
npm install

# 3. 確認 .env 存在且正確
cat .env

# 4. 用 PM2 啟動（首次）
pm2 start src/index.js --name omnichat-agent
pm2 save
pm2 startup   # 設定開機自動啟動

# 4b. 已在運行時重啟
pm2 restart omnichat-agent

# 5. 查看 log
pm2 logs omnichat-agent --lines 100
```

### 產品資料匯入（首次或更新時）

```bash
# 從 Excel 產品資料表匯入（放置於 inbox/ 目錄）
node scripts/import-excel-qa.js

# 強制覆蓋所有欄位（預設只填空白欄位）
node scripts/import-excel-qa.js --force

# 批次更新檢驗報告 URL
node scripts/update-lab-report-urls.js
```

---

## 環境變數

複製 `.env.example` 為 `.env` 並填入以下設定：

| 變數 | 說明 | 必填 |
|------|------|------|
| `OMNICHAT_API_TOKEN` | Omnichat Open API Token | ✅ |
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID | ✅ |
| `VERTEX_LOCATION` | Vertex AI 區域，預設 `us-central1` | ✅ |
| `CYBERBIZ_API_TOKEN` | Cyberbiz API Token | ✅ |
| `BRAND_ID` | 預設品牌 ID（達摩 = 7） | ✅ |
| `PORT` | 伺服器 port，預設 3000 | |
| `WEBHOOK_PATH` | Webhook 路徑，預設 `/omnichat-webhook` | |
| `ADMIN_PASSWORD` | 管理後台登入密碼 | ✅ |
| `SESSION_SECRET` | Express session 密鑰（隨機字串） | ✅ |
| `SHOPEE_API_KEY` | 蝦皮評論 API 驗證金鑰（給 n8n 用） | ✅ |
| `INTERNAL_API_KEY` | 內部 `/api/ask` 驗證金鑰 | |
| `SERPER_API_KEY` | Serper.dev Google 搜尋 API（`/api/ask` 的 web_search） | |
| `GOOGLE_CHAT_WEBHOOK` | Google Chat Webhook URL（需人工處理時通知） | |
| `USE_PYTHON_OCR` | 設為 `true` 啟用 Python OCR 圖片分類（預設停用） | |
| `PYTHON_BIN` | Python 執行檔路徑，預設 `python3` | |

---

## 管理後台

路徑：`https://your-domain/tsa-ai-agent-manage`

登入後可管理：

### 品牌管理
- 查看所有品牌（11 個），設定是否開啟 Omnichat / 蝦皮整合

### 規則管理（Rules）
- **全域規則**：套用所有品牌
- **類別規則**：套用特定類別（保健品 / 寵物品牌 / 保養品 / 個人清潔用品）
- **品牌規則**：僅套用特定品牌

### FAQ 知識庫
- 三層結構同規則（全域 / 類別 / 品牌）
- AI 回覆時優先參考 FAQ 內容

### 產品資料庫
- 每個品牌的完整產品資訊（成分、認證、FAQ、檢驗報告連結等）
- 支援 CSV 匯入（可用中文 header 欄位名稱）
- CSV 中文欄位對照：商品名稱、品號、劑型、規格、保存期限、原產地、飲食限制、售價、主要成分、全部成分、營養標示、認證、注意事項、使用方法、適用族群、食用時機、銷售賣點、關鍵字、公開FAQ、客服QA、備注、檢驗報告連結、排序

### 評論模板管理
- 66 個預設模板（通用 / 保健品 / 保養品 / 寵物 / 清潔用品）
- 可編輯文字、啟用/停用

### 對話記錄
- 查看所有對話房間（依平台/品牌篩選）
- 查看單一對話完整訊息記錄

### AI 沙盒測試
- 直接在後台測試 AI 回覆效果，不影響正式對話

---

## API 文件

### Webhook（Omnichat 呼叫）

```
POST /omnichat-webhook
```

由 Omnichat 自動呼叫，不需手動使用。

訊息處理規則：
- `file` / `video` / `audio` → 回覆安全提示（不開啟外部檔案）
- `image` → 靜默忽略（0 token）
- `text` 含 URL → 回覆安全提示（不開啟外部連結）
- `text` 為 menu trigger（`menu-5` 等）→ 靜默忽略
- `text` 正常訊息 → 送 AI 處理

---

### 蝦皮評論 API

```
POST /api/shopee-review
Content-Type: application/json
```

**Request body：**

```json
{
  "reviewText": "顧客評論文字（可為空，純五星無文字時）",
  "brandId": 7,
  "rating": 5,
  "hasImage": false,
  "apiKey": "your_shopee_api_key"
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `reviewText` | string | 評論文字，純五星無文字時可傳空字串或省略 |
| `brandId` | number | 品牌 ID（對應 brands 表） |
| `rating` | number | 星等 1–5（必填其一：reviewText 或 rating） |
| `hasImage` | boolean | 評論是否包含圖片 |
| `apiKey` | string | 驗證金鑰，對應 `SHOPEE_API_KEY` 環境變數 |

**Response：**

```json
{
  "reply": "感謝您給予五星好評！⭐⭐⭐⭐⭐ ...",
  "templateId": "T001",
  "source": "template",
  "needsHuman": false,
  "reason": null
}
```

| 欄位 | 說明 |
|------|------|
| `reply` | 建議回覆文字（`needsHuman=true` 時為 null） |
| `templateId` | 使用的模板 ID（非模板時為 null） |
| `source` | `template` / `custom` / `needs_human` |
| `needsHuman` | `true` = 需要人工處理 |
| `reason` | 需人工時的原因說明 |

**回覆來源判斷邏輯：**

```
rating=5 且 reviewText 為空 且 hasImage=false
  └─ 直接選用模板（0 AI token）

其他情況（有文字 / 有圖 / 非五星）
  └─ 呼叫 Gemini AI
       ├─ 找到對應模板 → source: template
       ├─ 無模板但正面 → source: custom（AI 撰寫）
       └─ 客訴/退換/負評 → source: needs_human（通知 Google Chat）
```

---

### 內部 Ask API

```
POST /api/ask
Content-Type: application/json
```

單次 AI 問答，供 n8n 或外部系統使用。

**Request body：**

```json
{
  "prompt": "問題或指令",
  "systemPrompt": "（選填）系統提示",
  "model": "gemini-2.0-flash",
  "enableSearch": false,
  "apiKey": "your_internal_api_key"
}
```

`enableSearch=true` 時 AI 可呼叫 Google 搜尋（需設定 `SERPER_API_KEY`）並讀取網頁內容。

**Response：**

```json
{ "reply": "AI 回覆文字" }
```

---

### 健康檢查

```
GET /health
→ { "status": "ok" }
```

---

## 蝦皮評論回覆流程

### 完整流程

```
本機 n8n 爬蟲
  └─ 輸出 reviews.json
       │
       ▼
  n8n Workflow 1（草稿產生）
       ├─ 用 review_id 查 Google Sheet 是否已存在（防重複）
       ├─ POST /api/shopee-review
       └─ 寫入 Google Sheet（status = pending）
              │
              ▼
         客服確認回覆後將 P 欄改為 confirmed
              │
              ▼
  n8n Workflow 2（定時掃描，每 5 分鐘）
       ├─ 讀取 status = confirmed 的列
       ├─ POST 蝦皮回覆 API
       └─ 更新 status = posted，寫入 posted_time
```

### Google Sheet 欄位結構

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | review_id | 蝦皮評論 ID（唯一鍵） |
| B | shop_id | 蝦皮店鋪 ID |
| C | brand_id | 品牌 ID |
| D | product_name | 商品名稱 |
| E | rating | 星等 1–5 |
| F | has_image | TRUE / FALSE |
| G | review_text | 顧客原文 |
| H | reviewer_name | 顧客暱稱 |
| I | review_time | 評論時間 |
| J | ai_reply | AI / 模板建議回覆 |
| K | template_id | 使用的模板 ID |
| L | source | template / custom / needs_human |
| M | needs_human | TRUE / FALSE |
| N | human_reason | 需人工的原因 |
| O | confirmed_reply | 客服最終確認的回覆（可覆蓋 J 欄） |
| P | status | **觸發欄位**：pending → confirmed → posted |
| Q | posted_time | 成功回覆蝦皮的時間 |

### 爬蟲輸出 JSON 格式

```json
[
  {
    "review_id": "123456789",
    "shop_id": "987",
    "brand_id": 7,
    "product_name": "達摩本草 B群",
    "rating": 5,
    "has_image": false,
    "content": "",
    "reviewer_name": "匿名用戶",
    "review_time": "2026-04-29T10:00:00+08:00"
  }
]
```

---

## 資料庫結構

資料庫：`data/agent.db`（SQLite，由 `db.js` 管理，自動建立 & migration）

### brands — 品牌

| 欄位 | 說明 |
|------|------|
| id | 主鍵 |
| name | 品牌名稱 |
| category | 保健品 / 寵物品牌 / 保養品 / 個人清潔用品 |
| has_omnichat | 是否啟用 LINE 客服 |
| has_shopee | 是否啟用蝦皮評論 |
| enabled | 是否啟用 |

預設品牌（共 11 個）：達摩、御熹堂、大島、毛孩、奧沛、優固倍、愛旺斯、芙木、Tryme、XXS、PH

### rules — 客服規則

| 欄位 | 說明 |
|------|------|
| brand_id | NULL = 全域，有值 = 品牌專屬 |
| category | NULL = 全域，有值 = 類別專屬 |
| title / content | 規則標題與內容 |
| enabled | 是否生效 |

### faqs — 知識庫

結構同 rules。AI 回覆時優先參考，格式為 Q / A 對。

### product_info — 產品資料庫

主要欄位：

| 欄位 | 說明 |
|------|------|
| brand_id | 所屬品牌 |
| product_code | 品號（SKU） |
| product_name | 商品名稱 |
| product_url | 商品頁面網址 |
| key_ingredients | 主要成分 |
| all_ingredients | 完整成分表 |
| nutrition | 營養標示 |
| certifications | 認證（如小綠人） |
| precautions | 注意事項 |
| target_groups | 適用族群 |
| supplement_timing | 食用時機 |
| marketing_copy | 銷售賣點 |
| faq_public | 公開 FAQ |
| faq_internal | 客服內部 QA |
| lab_report_url | 檢驗報告連結 |
| priority | 排序（數字越小越優先） |

### review_templates — 評論回覆模板

66 個預設模板，分類：

| 類別 | 情境 |
|------|------|
| 通用 | 五星無評論、出貨快、包裝完整、有建議、肯定產品、行銷活動 |
| 保健品 | 五星無評論、回購、吃了有用、剛吃不確定、魚油 |
| 保養品 | 喜歡味道、用了有用、剛用不確定、回購、包裝 |
| 寵物 | 五星無評論、回購、肯定品質 |
| 清潔用品 | 五星無評論、清潔效果好、回購 |

### conversation_logs — 對話記錄

所有進出訊息完整記錄，含 brand_id、room_id、platform、role（user / agent）、message、created_at（台北時間）。

---

## 安全機制

### 訊息過濾

- **檔案 / 影片 / 音訊**：回覆安全提示，告知無法開啟外部檔案
- **圖片**：靜默忽略，不消耗 AI token
- **含 URL 的文字**：回覆安全提示，告知無法開啟外部連結
- **LINE 選單觸發字串**（`menu-5`、`menu_1` 等）：靜默忽略

### AI 回覆保護

- 嚴禁揭露資料庫、API、系統、後台等內部資訊
- 嚴禁出現「從資料庫」、「工具回傳」等內部用語
- 商品名稱、功效、價格、連結只能來自工具回傳的真實資料
- Vertex AI 429/503 錯誤：指數退避重試（1s、2s、4s、8s，最多 4 次）

### API 驗證

- `/api/shopee-review`：需 `SHOPEE_API_KEY`
- `/api/ask`：需 `INTERNAL_API_KEY`
- 管理後台：Session-based 密碼登入（8 小時有效）

---

## 常見問題

**Q: AI 一直說「從資料庫找到以下資訊」？**
確認 `src/agent.js` 的 SYSTEM_PROMPT 嚴禁事項包含相關禁止語句，並重啟 PM2。

**Q: 商品搜尋找不到產品？**
1. 查看 PM2 log，確認 Cyberbiz 快取是否正常載入
2. 嘗試用不同關鍵字（如「魚油」而非完整商品名）
3. 確認 `CYBERBIZ_API_TOKEN` 有效

**Q: Vertex AI 回傳 429 錯誤？**
已有自動 retry，通常 8–16 秒後恢復。若持續發生，確認 GCP 配額是否需要申請提升。

**Q: 如何新增品牌的客服規則？**
登入管理後台 → 選擇品牌 → 規則 → 新增。規則即時生效，不需重啟。

**Q: 產品資料如何更新？**
- 少量更新：管理後台 → 產品資料庫 → 直接編輯
- 批次更新：準備 Excel 或 CSV → 放入 inbox/ 目錄 → 執行 `node scripts/import-excel-qa.js`

**Q: 蝦皮評論 `needs_human` 但沒收到 Google Chat 通知？**
確認 `.env` 的 `GOOGLE_CHAT_WEBHOOK` 已設定正確的 Webhook URL。
