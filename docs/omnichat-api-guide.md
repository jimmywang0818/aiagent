# Omnichat Open API 完整整合文件

> 適用情境：透過第三方 AI Agent（如 Cyber AI Agent）處理顧客訊息，必要時轉接真人客服  
> 最後更新：2026-04-21  
> 文件來源：https://developers.omnichat.ai

---

## 目錄

1. [前置準備與認證](#1-前置準備與認證)
2. [整合流程總覽](#2-整合流程總覽)
3. [接收訊息（Webhook）](#3-接收訊息webhook)
4. [發送訊息（Agent Message API）](#4-發送訊息agent-message-api)
5. [聊天室管理（Agent Rooms APIs）](#5-聊天室管理agent-rooms-apis)
   - 5.1 轉接真人（To Human Agent）
   - 5.2 關閉對話（Close Case）
   - 5.3 觸發自動分派（Trigger Auto Assign）
6. [聯絡人 APIs（Contacts APIs）](#6-聯絡人-apicsontacts-apis)
   - 6.1 查詢聯絡人（Get Contacts）
   - 6.2 更新聯絡人（Upsert a Contact）
7. [頻道 APIs（Channels APIs）](#7-頻道-apischannels-apis)
8. [錯誤代碼總整理](#8-錯誤代碼總整理)
9. [完整整合範例流程](#9-完整整合範例流程)

---

## 1. 前置準備與認證

### 所需模組（擇一）

- **Raccoon AI Add-on**，或
- **Open API - 3rd-party AI Agent Module**

### 認證方式：Bearer Token

所有 API 請求須在 HTTP Header 加入：

```
Authorization: Bearer {YOUR_API_TOKEN}
```

API Token 由 Omnichat 後台提供。

### Base URL

```
https://open-api.omnichat.ai
```

### 在 Omnichat Portal 設定 AI Agent Endpoint

1. 登入 Omnichat Portal
2. 前往 AI Agent 設定頁面
3. 填入你的 Webhook Endpoint URL（Omnichat 會將顧客訊息 POST 到此 URL）
4. 儲存設定後，當聊天室進入 AI Chat 模式，訊息會自動推送到你的 Endpoint

---

## 2. 整合流程總覽

```
顧客傳訊息
    │
    ▼
Omnichat Webhook → POST 到你的 AI Agent Endpoint
    │
    ▼
AI Agent 解析訊息 (team.id, room.id, content.text)
    │
    ├── AI 可以處理 ──→ 呼叫 Agent Message API 回覆
    │
    └── AI 無法處理 ──→ 呼叫 To Human Agent API 轉真人
                              │
                              ▼
                         人工客服接手對話
                              │
                              ▼
                         呼叫 Close Case API 關閉案件
```

### 聊天室狀態流轉

| 狀態 | 說明 | 如何觸發 |
|------|------|----------|
| **AI Chat** | AI Agent 處理中 | 預設進入狀態 |
| **Open（人工）** | 等待人工客服接手 | 呼叫 `to-human-agent` |
| **In Progress** | 客服處理中 | 呼叫 `trigger-auto-assign` |
| **Closed** | 對話已關閉 | 呼叫 `close` |

---

## 3. 接收訊息（Webhook）

> 在 Omnichat Portal 設定 Endpoint 後，Omnichat 會主動推送事件到你的伺服器

### Webhook 事件類型

| event.type | 說明 | 是否推送後續訊息 |
|---|---|---|
| `ai-session:open` | AI 對話開始 | ✅ 之後訊息會推送 |
| `message:new` | 顧客傳送一則訊息 | ✅ |
| `ai-session:close` | AI 對話結束 | ❌ 不再推送 |

### Webhook Payload 完整結構

```json
{
  "team": {
    "id": "TEAM_ID",        // 必存，後續 API 呼叫都需要
    "locale": "zh-Hant"
  },
  "events": [
    {
      "id": "EVENT_ID",
      "createdAt": "2025-04-17T09:26:16.167Z",  // ISO 8601
      "type": "message:new",
      "payload": {
        "channel": {
          "id": "CHANNEL_ID",
          "externalId": "ACTUAL_PLATFORM_CHANNEL_ID",
          "currentUrl": "https://...",  // 僅 webchat 有效，可得知顧客當前頁面
          "platform": "webchat",        // webchat | line
          "metadata": {}
        },
        "room": {
          "id": "ROOM_ID",              // 必存，後續 API 呼叫都需要
          "type": "individual",         // 目前只有 individual（1對1）
          "metadata": {}
        },
        "message": {
          "id": "MESSAGE_ID",
          "replyToken": "LINE_REPLY_TOKEN",  // LINE 必填，其他平台可忽略
          "createdAt": "2025-04-17T09:26:16.167Z",
          "sender": {
            "id": "SENDER_ID",
            "externalId": "OMNICHAT_USER_ID",  // 可用來查詢聯絡人資訊
            "type": "customer",                // customer | agent | bot
            "senderName": "顧客姓名",
            "metadata": {}
          },
          "content": {
            "type": "text",       // text | image
            "text": "顧客訊息",   // type=text 時有值
            "url": null,          // type=image 時有值（圖片 URL）
            "metadata": {}
          }
        }
      }
    }
  ]
}
```

### 從 Webhook 提取關鍵資訊

```javascript
// Node.js 範例
app.post('/webhook', (req, res) => {
  const { team, events } = req.body;
  
  const teamId     = team.id;                            // Team ID
  const event      = events[0];
  const roomId     = event.payload.room.id;              // 聊天室 ID
  const platform   = event.payload.channel.platform;    // webchat or line
  const replyToken = event.payload.message.replyToken;  // LINE 專用
  const senderType = event.payload.message.sender.type; // customer / agent / bot
  const msgType    = event.payload.message.content.type;
  const msgText    = event.payload.message.content.text;
  
  // 只處理顧客訊息，忽略 agent/bot 訊息
  if (senderType !== 'customer') return res.sendStatus(200);
  
  // 交給 AI Agent 處理...
  res.sendStatus(200);
});
```

---

## 4. 發送訊息（Agent Message API）

### Endpoint

```
POST https://open-api.omnichat.ai/v1/agent-messages
```

### Request Body

| 欄位 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `team` | String | ✅ | Team ID（從 Webhook 的 `team.id` 取得） |
| `roomId` | String | ✅ | 聊天室 ID（從 Webhook 的 `room.id` 取得） |
| `messages` | Array | ✅ | 訊息陣列，**最多 5 則** |
| `replyToken` | String | LINE 必填 | LINE 的 Reply Token（從 Webhook 取得） |

### 訊息類型（Message Object）

| type | 說明 | 必填欄位 | 備註 |
|---|---|---|---|
| `text` | 文字訊息 | `text` | 最常用 |
| `image` | 圖片訊息 | `url` | 圖片直連 URL |
| `video` | 影片訊息 | `video.url` | LINE 需加 `video.thumbnailUrl` |
| `audio` | 音訊訊息 | `url` | ❌ 不支援 Webchat |
| `quick_reply` | 快速回覆選項 | `quick_reply.text`、`quick_reply.replies` | 提供選項讓顧客點選 |
| `google_map` | Google 地圖 | `googleMap.staticUrl`、`googleMap.embeddingUrl` | ✅ 僅支援 Webchat |

### 發送範例

#### 文字訊息

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "messages": [
    { "type": "text", "text": "您好，我是 AI 助理，請問有什麼需要幫忙的？" }
  ]
}
```

#### 圖片訊息

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "messages": [
    { "type": "image", "url": "https://example.com/image.png" }
  ]
}
```

#### 影片訊息

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "messages": [
    {
      "type": "video",
      "video": {
        "url": "https://example.com/video.mp4",
        "thumbnailUrl": "https://example.com/thumbnail.jpg"
      }
    }
  ]
}
```

#### 快速回覆（Quick Reply）

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "messages": [
    {
      "type": "quick_reply",
      "quick_reply": {
        "text": "請問您需要什麼協助？",
        "replies": [
          { "text": "查詢訂單" },
          { "text": "退換貨" },
          { "text": "轉接真人客服" }
        ]
      }
    }
  ]
}
```

#### Google 地圖（僅 Webchat）

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "messages": [
    {
      "type": "google_map",
      "googleMap": {
        "staticUrl": "https://maps.googleapis.com/maps/api/staticmap?...",
        "embeddingUrl": "https://www.google.com/maps/embed/v1/place?...",
        "appUrl": "https://goo.gl/maps/..."
      }
    }
  ]
}
```

#### LINE 訊息（需帶 replyToken）

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "replyToken": "LINE_REPLY_TOKEN",
  "messages": [
    { "type": "text", "text": "感謝您的來訊！" }
  ]
}
```

### 成功回應（200 OK）

```json
{
  "messageIds": ["461230966842064897"]
}
```

> 若某則訊息發送失敗，對應位置的 `messageId` 會回傳 `null`

### 失敗回應

| HTTP Code | errorCode | 說明 |
|---|---|---|
| 400 | `INVALID_REQUEST_BODY` | 未啟用 AI Agent 功能、缺少必填欄位、超過 5 則訊息、roomId 找不到 |
| 424 | `LINE_API_EXCEPTION` | LINE Reply Token 無效或過期 |

---

## 5. 聊天室管理（Agent Rooms APIs）

### 5.1 轉接真人（To Human Agent）⭐ 最常用

將聊天室狀態從 **AI Chat** 轉為 **Open（等待人工客服）**

#### Endpoint

```
POST https://open-api.omnichat.ai/v1/rooms/to-human-agent
```

#### Request Body

| 欄位 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `roomId` | String | ✅ | 聊天室 ID |
| `team` | String | ✅ | Team ID |

```json
{
  "roomId": "ROOM_ID",
  "team": "TEAM_ID"
}
```

#### 回應

| HTTP Code | 說明 |
|---|---|
| **204** | ✅ 成功轉接，聊天室狀態改為 Open |
| 400 | 此聊天室不允許轉接真人（`NOT_ALLOWED_ASSIGN_TO_HUMAN`） |
| 404 | 聊天室不存在（`ROOM_NOT_FOUND`） |

---

### 5.2 關閉對話（Close Case）

將聊天室狀態從 **AI Chat** 轉為 **Closed**

#### Endpoint

```
POST https://open-api.omnichat.ai/v1/rooms/close
```

#### Request Body

```json
{
  "roomId": "ROOM_ID",
  "team": "TEAM_ID"
}
```

#### 回應

| HTTP Code | 說明 |
|---|---|
| **204** | ✅ 成功關閉 |
| 400 | 聊天室無法被關閉（非 AI Chat 狀態，或有人工客服協作中） |
| 404 | 聊天室不存在 |

---

### 5.3 觸發自動分派（Trigger Auto Assign）

將聊天室狀態從 **AI Chat** 轉為 **In Progress**，並依規則自動指派客服

#### Endpoint

```
POST https://open-api.omnichat.ai/v1/rooms/trigger-auto-assign
```

#### Request Body

| 欄位 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `team` | String | ✅ | Team ID |
| `roomId` | String | ✅ | 聊天室 ID |
| `ruleId` | String | ✅ | 自動分派規則 ID（在 Omnichat Portal 設定） |

```json
{
  "team": "TEAM_ID",
  "roomId": "ROOM_ID",
  "ruleId": "AUTO_ASSIGN_RULE_ID"
}
```

#### 回應

| HTTP Code | 說明 |
|---|---|
| **204** | ✅ 成功觸發自動分派 |
| 400 | 聊天室無法觸發（非 AI Chat、有協作中客服）或規則無法使用（頻道不支援、規則類型錯誤、規則已停用） |
| 404 | 聊天室不存在 |

---

## 6. 聯絡人 APIs（Contacts APIs）

> 所需模組：CS / Marketing / OMO Sales / Social CDP Cloud CRM Open API Module，Raccoon AI Add-on，或 3rd-party AI Agent Open API Module  
> 3rd-party AI Agent 模組僅支援 `line` 與 `web` 平台

### 6.1 查詢聯絡人（Get Contacts）

#### Endpoint

```
GET https://open-api.omnichat.ai/v1/contacts
```

#### Query Parameters

| 欄位 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `platform` | String | ✅ | 平台：`line` | `facebook` | `whatsapp` | `instagram` | `wechat` | `webchat` |
| `channelId` | String | ✅ | 頻道 ID（LINE Channel ID / Facebook Page ID 等，webchat 填 `webchat`） |
| `userId` | String | 查特定人必填 | 用戶 ID（LINE User ID / Facebook PSID / Webchat User ID 等） |
| `memberId` | String | 否 | 會員 ID |
| `phone` | String | 否 | 電話號碼 |
| `email` | String | 否 | Email |
| `updatedAfter` | Long | 列表查詢必填 | 起始時間（Unix ms，含） |
| `updatedBefore` | Long | 列表查詢必填 | 結束時間（Unix ms，不含） |
| `page` | Integer | 列表查詢必填 | 頁碼，預設 1 |
| `pageSize` | Integer | 列表查詢必填 | 每頁筆數，預設 20，最大 100 |

#### 請求範例

```bash
# 查詢特定 LINE 用戶
curl -H "Authorization: Bearer TOKEN" \
  "https://open-api.omnichat.ai/v1/contacts?platform=line&channelId=165000000&userId=Uxxxx"

# 查詢特定 Webchat 用戶（從 Webhook 的 sender.externalId 取得 userId）
curl -H "Authorization: Bearer TOKEN" \
  "https://open-api.omnichat.ai/v1/contacts?platform=webchat&channelId=webchat&userId=USER_ID"

# 列表查詢（依時間範圍）
curl -H "Authorization: Bearer TOKEN" \
  "https://open-api.omnichat.ai/v1/contacts?platform=line&channelId=165000000&page=1&pageSize=20&updatedAfter=1652371200000&updatedBefore=1653580800000"
```

#### 成功回應（200）

```json
{
  "content": [
    {
      "channel": { "platform": "line", "channelId": "165000000" },
      "id": "Uxxxx",
      "name": "顧客姓名",
      "lastMessageTime": 1604650656053,
      "subscribedAt": 1604650656053,
      "status": true,
      "email": "test@email.com",
      "phone": "886966633355",
      "memberId": "9431",
      "note": "備註",
      "tags": ["VIP", "Sports"],
      "customAttributes": [
        { "key": "MEMBER_TIER", "value": "GOLD", "type": "text", "displayName": "Member Tier" }
      ],
      "agentName": null,
      "agentEmployeeCode": null,
      "agentBindTime": null,
      "agentLocationName": null,
      "agentLocationCode": null
    }
  ],
  "totalElements": 1
}
```

---

### 6.2 更新聯絡人（Upsert a Contact）

#### Endpoint

```
POST https://open-api.omnichat.ai/v1/contacts/{platform}?channelId={channelId}&userId={userId}
```

#### Request Body（所有欄位皆非必填，填哪個更新哪個）

| 欄位 | 類型 | 說明 |
|---|---|---|
| `name` | String | 姓名 |
| `status` | Boolean | 訂閱狀態 |
| `email` | String | Email |
| `phone` | String | 電話 |
| `memberId` | String | 會員 ID |
| `note` | String | 備註 |
| `tags` | Array of String | **取代**現有標籤（不可與 tagsToAdd/tagsToRemove 共用） |
| `tagsToAdd` | Array of String | 新增標籤（不可與 tags 共用） |
| `tagsToRemove` | Array of String | 移除標籤（不可與 tags 共用） |
| `customAttributes` | Array | 自訂屬性 |
| `agentEmployeeCode` | String | 綁定業務員工編號（OMO Sales Cloud） |
| `agentLocationCode` | String | 綁定門市代碼（OMO Sales Cloud） |

#### 自訂屬性（customAttributes）格式

| type | value 格式 | 清空方式 |
|---|---|---|
| `text` | 字串 | 傳入空字串 `""` |
| `number` | 數字（integer/float） | 傳入 `0` |
| `boolean` | `true` / `false` | 傳入 `false` |
| `date` | `"YYYY-MM-DD"` | 傳入空字串 `""` |
| `datetime` | `"2022-11-01T14:16:00"` (ISO 8601) | 傳入空字串 `""` |

#### 範例

```json
// POST https://open-api.omnichat.ai/v1/contacts/line?channelId=165000000&userId=Uxxxx
{
  "name": "顧客姓名",
  "email": "example@example.com",
  "phone": "886912345678",
  "memberId": "M00001",
  "tagsToAdd": ["VIP", "已購買"],
  "tagsToRemove": ["新顧客"],
  "customAttributes": [
    { "key": "MemberTier", "value": "GOLD" },
    { "key": "Points", "value": 2031 },
    { "key": "AcceptedMarketing", "value": true },
    { "key": "LastPurchaseDate", "value": "2026-04-21" }
  ]
}
```

#### 回應

| HTTP Code | 說明 |
|---|---|
| **204** | ✅ 成功更新 |
| 4xx/5xx | 失敗，附 errorCode 說明 |

---

## 7. 頻道 APIs（Channels APIs）

### 查詢頻道清單（Get Team Channels Info）

#### Endpoint

```
GET https://open-api.omnichat.ai/v1/channels
```

> 不需要任何 Query Parameter，回傳該 Team 所有頻道  
> 3rd-party AI Agent 模組僅支援 `line` 和 `web` 平台

#### 成功回應（200）

```json
[
  {
    "platform": "webchat",
    "channelId": "webchat",
    "channelName": "Team 名稱"
  },
  {
    "platform": "line",
    "channelId": "1657703186",
    "channelName": "LINE 頻道名稱"
  }
]
```

---

## 8. 錯誤代碼總整理

### 通用錯誤代碼（Contacts APIs）

| errorCode | 說明 |
|---|---|
| `INVALID_REQUEST_PARAMETERS` | 缺少必填 query params |
| `INVALID_REQUEST_PARAMETER` | 參數格式違反約束（如 platform 為 null） |
| `INVALID_REQUEST_BODY` | Request body 驗證失敗 |
| `INVALID_FORMAT` | 屬性格式無效（如無效的 enum 值） |
| `MISMATCH_TYPE` | 參數型別不符（如傳入無效的 platform、非整數的 page） |
| `MISSING_URL_PARAMETER` | 缺少必要 URL 參數 |
| `USER_ID_NOT_FOUND` | 查詢特定用戶但找不到 |
| `UNEXPECTED_ERROR` | 未預期的執行錯誤 |

### Agent Message API 錯誤代碼

| HTTP | errorCode | 說明 |
|---|---|---|
| 400 | `INVALID_REQUEST_BODY` | 未開啟 AI Agent 功能 / 缺少 roomId / 超過 5 則 / roomId 不存在 / quick_reply.text 缺失 |
| 424 | `LINE_API_EXCEPTION` | LINE Reply Token 無效或過期 |

### Agent Rooms APIs 錯誤代碼

| API | HTTP | errorCode | 說明 |
|---|---|---|---|
| To Human Agent | 400 | `NOT_ALLOWED_ASSIGN_TO_HUMAN` | 不允許轉接真人 |
| To Human Agent | 404 | `ROOM_NOT_FOUND` | 聊天室不存在 |
| Close Case | 400 | `INVALID_REQUEST_BODY` | 聊天室非 AI Chat 狀態，或有協作中客服 |
| Close Case | 404 | `NOT_FOUND` | 聊天室不存在 |
| Trigger Auto Assign | 400 | `INVALID_REQUEST_BODY` | 聊天室無法觸發，或規則不可用 |
| Trigger Auto Assign | 404 | `NOT_FOUND` | 聊天室不存在 |

---

## 9. 完整整合範例流程

以下為 Cyber AI Agent 搭配 Omnichat 的完整整合邏輯（Node.js 偽代碼）：

```javascript
const OMNICHAT_TOKEN = process.env.OMNICHAT_API_TOKEN;
const BASE_URL = 'https://open-api.omnichat.ai/v1';

const headers = {
  'Authorization': `Bearer ${OMNICHAT_TOKEN}`,
  'Content-Type': 'application/json'
};

// ─────────────────────────────────────────
// 1. 接收 Omnichat Webhook
// ─────────────────────────────────────────
app.post('/omnichat-webhook', async (req, res) => {
  res.sendStatus(200); // 先回 200，避免 timeout
  
  const { team, events } = req.body;
  const teamId = team.id;
  
  for (const event of events) {
    if (event.type !== 'message:new') continue;
    
    const { room, message, channel } = event.payload;
    const roomId     = room.id;
    const platform   = channel.platform;
    const replyToken = message.replyToken;   // LINE 需要
    const sender     = message.sender;
    const content    = message.content;
    
    // 只處理顧客訊息
    if (sender.type !== 'customer') continue;
    // 只處理文字訊息（可擴展支援圖片）
    if (content.type !== 'text') continue;
    
    await handleCustomerMessage({
      teamId, roomId, platform, replyToken,
      userId: sender.externalId,
      userText: content.text
    });
  }
});

// ─────────────────────────────────────────
// 2. AI Agent 處理訊息
// ─────────────────────────────────────────
async function handleCustomerMessage({ teamId, roomId, platform, replyToken, userId, userText }) {
  // 呼叫 Cyber AI Agent 取得回應
  const aiResult = await cyberAI.getResponse(userText);
  
  if (aiResult.canHandle) {
    // AI 可以回答 → 發送訊息
    await sendMessage({ teamId, roomId, replyToken, platform, text: aiResult.reply });
  } else {
    // AI 無法處理 → 先告知顧客，再轉真人
    await sendMessage({
      teamId, roomId, replyToken, platform,
      text: '感謝您的耐心等候，我將為您轉接真人客服，請稍候...'
    });
    await transferToHuman({ teamId, roomId });
  }
}

// ─────────────────────────────────────────
// 3. 發送訊息
// ─────────────────────────────────────────
async function sendMessage({ teamId, roomId, replyToken, platform, text }) {
  const body = {
    team: teamId,
    roomId,
    messages: [{ type: 'text', text }]
  };
  
  // LINE 需要 replyToken
  if (platform === 'line' && replyToken) {
    body.replyToken = replyToken;
  }
  
  const res = await fetch(`${BASE_URL}/agent-messages`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const err = await res.json();
    console.error('發送訊息失敗:', err);
  }
}

// ─────────────────────────────────────────
// 4. 轉接真人
// ─────────────────────────────────────────
async function transferToHuman({ teamId, roomId }) {
  const res = await fetch(`${BASE_URL}/rooms/to-human-agent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ team: teamId, roomId })
  });
  
  if (res.status === 204) {
    console.log(`聊天室 ${roomId} 已成功轉接真人客服`);
  } else {
    const err = await res.json();
    console.error('轉接失敗:', err.errorCode, err.message);
  }
}

// ─────────────────────────────────────────
// 5. 關閉對話（對話結束後呼叫）
// ─────────────────────────────────────────
async function closeRoom({ teamId, roomId }) {
  await fetch(`${BASE_URL}/rooms/close`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ team: teamId, roomId })
  });
}
```

---

## 附錄：支援平台一覽

| 平台 | platform 值 | channelId 說明 | AI Agent 支援 |
|---|---|---|---|
| LINE | `line` | LINE Channel ID | ✅ |
| Webchat | `webchat` | 固定值 `webchat` | ✅ |
| Facebook Messenger | `facebook` | Facebook Page ID | ❌（非 AI Agent 模組） |
| WhatsApp | `whatsapp` | WhatsApp Business Phone Number | ❌ |
| Instagram | `instagram` | Instagram Business Account ID | ❌ |
| WeChat | `wechat` | WeChat ID | ❌ |

---

*文件整理自 [Omnichat Developer Guide](https://developers.omnichat.ai)*
