# Cyberbiz Product Feed API — Integration Guide
 
> **Base URL：** `https://app-store-api.cyberbiz.io`  
> **編碼：** UTF-8

---

## Authentication

所有請求需在 header 帶入由 PowerHero 提供的 API Token：

```
Authorization: Bearer <API Token>
```

---

## Endpoints

### 1. 取得所有商品

```
GET /v1/products
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | 頁碼（從 1 開始） |
| `per_page` | integer | 每頁筆數（建議 100） |
| `offset` | integer | 略過筆數 |

**Response（Status 200）**

```json
[
  {
    "id": 12345,
    "title": "商品名稱",
    "english_title": "Product Name",
    "product_url": "https://www.powerhero.com.tw/products/product-handle",
    "published": true,
    "sell_from": "2024-01-01 00:00:00",
    "sell_to": null,
    "product_type": "保健品",
    "slogan": "商品標語",
    "brief_text": "商品簡述純文字",
    "body_html": "<p>商品詳細介紹</p>",
    "price": 990,
    "tags": ["tag1", "tag2"],
    "photos": [
      {
        "id": 1,
        "src": "https://cdn.cyberbiz.co/image.jpg",
        "position": 1
      }
    ],
    "custom_collections": [
      {
        "id": 1,
        "title": "分類名稱",
        "handle": "collection-handle"
      }
    ],
    "product_variants": [
      {
        "id": 99001,
        "name": "款式名稱",
        "sku": "SKU-001",
        "price": 990,
        "compare_at_price": 1200,
        "inventory_quantity": 50,
        "sold": 120
      }
    ],
    "created_at": "2024-01-01 00:00:00",
    "updated_at": "2024-06-01 00:00:00"
  }
]
```

---

### 2. 取得單一商品

```
GET /v1/products/{product_id}
```

回傳格式同上，為單一物件（非陣列）。

---

### 3. 搜尋商品

```
GET /v1/products/search
```

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | 搜尋關鍵字 |
| `limit` | integer | — | 回傳最大筆數 |
| `offset` | integer | 0 | 資料起始索引 |
| `filter_published` | boolean | `true` | 只回傳上架中商品 |
| `order_by` | string | `created_date` | `created_date` 或 `sales_volume` |

---

### 4. 取得商品款式（SKU）

```
GET /v1/products/{product_id}/product_variants
```

**Response（Status 200）**

```json
[
  {
    "id": 99001,
    "product_id": 12345,
    "name": "款式名稱",
    "price": 990,
    "compare_at_price": 1200,
    "option1": "口味A",
    "option2": "60顆",
    "inventory_management": true,
    "inventory_quantity": 50,
    "inventory_policy": "deny",
    "sold": 120,
    "sku": "SKU-001",
    "photo_urls": ["https://cdn.cyberbiz.co/variant-image.jpg"]
  }
]
```

---

### 5. 取得商品圖片

```
GET /v1/products/{product_id}/product_photos
```

**Response（Status 200）**

```json
[
  {
    "id": 1,
    "src": "https://cdn.cyberbiz.co/image.jpg",
    "position": 1,
    "variant_ids": [99001, 99002]
  }
]
```

---

## 建議同步策略

### 全量同步（每日）

```
1. GET /v1/products?page=1&per_page=100
2. 逐頁取得，直到回傳空陣列
3. 每筆商品視需要呼叫：
   - GET /v1/products/{id}/product_variants  → 款式庫存與價格
   - GET /v1/products/{id}/product_photos    → 完整圖片清單
```

### 缺貨判斷

```
inventory_management = true
AND inventory_quantity <= 0
AND inventory_policy = "deny"
→ 視為缺貨
```

---

## 欄位對照：Cyberbiz → Insider

| Insider Field | Cyberbiz 欄位 | 備註 |
|---------------|--------------|------|
| `id` | `products.id` | |
| `name` | `products.title` | |
| `url` | `products.product_url` | 若為 `//` 開頭請補上 `https:` |
| `image_url` | `product_photos[position=1].src` | |
| `price` | `product_variants[].price` | 各款式有各自售價 |
| `original_price` | `product_variants[].compare_at_price` | 0 表示無原價 |
| `currency` | `TWD` | |
| `in_stock` | 參考缺貨判斷邏輯 | |
| `category` | `products.product_type` | |
| `extra.tags` | `products.tags` | 字串陣列 |
| `extra.sku` | `product_variants[].sku` | |
| `extra.sold` | `product_variants[].sold` | 可用於熱銷排序 |

---

## 範例程式碼（Python）

```python
import requests

API_TOKEN = "由 PowerHero 提供"
BASE_URL  = "https://app-store-api.cyberbiz.io"

headers = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Accept": "application/json"
}

# 取得第一頁商品
r = requests.get(f"{BASE_URL}/v1/products",
                 headers=headers,
                 params={"page": 1, "per_page": 100})
products = r.json()

# 取得特定商品款式
product_id = 12345
r = requests.get(f"{BASE_URL}/v1/products/{product_id}/product_variants",
                 headers=headers)
variants = r.json()
```

---

## 注意事項

1. **商品連結：** `product_url` 可能為 `//www.powerhero.com.tw/...` 格式，使用時請補上 `https:`
2. **分頁：** 使用 `page` + `per_page`，無 cursor-based 分頁，建議每頁 100 筆
3. **多款式：** 同一商品可有多個款式，各款式有獨立的價格與庫存，請自行決定以商品或款式為單位建立目錄
4. **Rate limit：** 請實作 retry 機制，建議遇到 429 時以指數退避重試

---

