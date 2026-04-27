'use strict';

require('dotenv').config();

const BASE_URL = 'https://app-store-api.cyberbiz.io';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.CYBERBIZ_API_TOKEN}`,
    'Accept': 'application/json',
  };
}

// In-memory product cache
let productCache = [];
let cacheLoadedAt = null;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // refresh every 2 hours

function simplify(p) {
  const variant = p.product_variants?.[0];
  const inStock = variant
    ? !(variant.inventory_management && variant.inventory_quantity <= 0)
    : true;

  return {
    id: p.id,
    title: p.title || '',
    url: p.product_url?.startsWith('//') ? `https:${p.product_url}` : (p.product_url || ''),
    price: variant?.price ?? p.price,
    originalPrice: variant?.compare_at_price || null,
    inStock,
    brief: p.brief_text || '',
    type: p.product_type || '',
    tags: p.tags || [],
  };
}

/**
 * Fetch all published products from Cyberbiz (paginated).
 */
async function loadAllProducts() {
  const all = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${BASE_URL}/v1/products?page=${page}&per_page=20`, { headers: getHeaders() });
    if (!res.ok) {
      console.error(`[cyberbiz] loadAllProducts failed on page ${page}: ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!batch.length) break;
    all.push(...batch.filter(p => p.published));
    if (batch.length < 100) break;
    page++;
  }

  productCache = all.map(simplify);
  cacheLoadedAt = Date.now();
  console.log(`[cyberbiz] Product cache loaded: ${productCache.length} products`);
}

async function ensureCache() {
  if (!cacheLoadedAt || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadAllProducts();
  }
}

/**
 * Full-text local search across title, brief, tags, type.
 * Falls back to Cyberbiz search API if cache is empty.
 */
async function searchProducts(keyword, limit = 5) {
  await ensureCache();

  const kw = keyword.toLowerCase();

  const results = productCache.filter(p => {
    return (
      p.title.toLowerCase().includes(kw) ||
      p.brief.toLowerCase().includes(kw) ||
      p.type.toLowerCase().includes(kw) ||
      p.tags.some(t => typeof t === 'string' && t.toLowerCase().includes(kw))
    );
  });

  // If local search finds nothing, fall back to API search
  if (!results.length) {
    console.log(`[cyberbiz] Local search empty for "${keyword}", trying API search`);
    const url = `${BASE_URL}/v1/products/search?q=${encodeURIComponent(keyword)}&limit=${limit}&filter_published=true`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) return [];
    const products = await res.json();
    return products.map(simplify).slice(0, limit);
  }

  return results.slice(0, limit);
}

/**
 * Get a single product by ID.
 */
async function getProduct(productId) {
  const res = await fetch(`${BASE_URL}/v1/products/${productId}`, { headers: getHeaders() });
  if (!res.ok) return null;
  return res.json();
}

// ── Order status translations ──────────────────────
const FULFILLMENT_STATUS = {
  fulfilled:   '已出貨',
  unfulfilled: '備貨中（尚未出貨）',
  partial:     '部分出貨',
  restocked:   '已退貨入庫',
  null:        '備貨中（尚未出貨）',
};
const FINANCIAL_STATUS = {
  paid:              '已付款',
  unpaid:            '未付款',
  pending:           '付款確認中',
  refunded:          '已退款',
  partially_refunded:'部分退款',
  voided:            '已作廢',
};

function simplifyOrder(o) {
  const fulfillment = o.fulfillments?.[0];
  return {
    orderNumber:      o.order_number || o.name || String(o.id),
    status:           o.status === 'cancelled' ? '已取消' : '處理中',
    financialStatus:  FINANCIAL_STATUS[o.financial_status] || o.financial_status || '未知',
    fulfillmentStatus:FULFILLMENT_STATUS[o.fulfillment_status] || o.fulfillment_status || '備貨中',
    createdAt:        o.created_at ? o.created_at.slice(0, 10) : null,
    shippingMethod:   o.shipping_lines?.[0]?.title || null,
    trackingCompany:  fulfillment?.tracking_company || null,
    trackingNumber:   fulfillment?.tracking_number || null,
    trackingUrl:      fulfillment?.tracking_url || null,
    lineItems:        (o.line_items || []).map(i => `${i.title} x${i.quantity}`),
    totalPrice:       o.total_price,
  };
}

/**
 * Look up order(s) by order number, email, or customer name.
 * Returns array of simplified orders, or null on failure.
 *
 * Flow:
 *  orderNumber → GET /v1/orders/get_order_id?order_numbers=N → GET /v1/orders/{id}
 *  email       → GET /v1/customers/get_customer_id?customer_emails=X → GET /v1/customers/{id}/orders
 */
async function getOrderStatus({ orderNumber, email, name }) {
  try {
    // ── Lookup by order number ────────────────────
    if (orderNumber) {
      // Strip non-numeric prefix (e.g. "DA", "#") — API expects numeric order number
      const clean = String(orderNumber).replace(/^[^0-9]+/, '').trim();
      console.log(`[cyberbiz] get_order_id: order_numbers=${clean}`);

      const idRes = await fetch(
        `${BASE_URL}/v1/orders/get_order_id?order_numbers=${encodeURIComponent(clean)}`,
        { headers: getHeaders() }
      );
      if (!idRes.ok) {
        console.error(`[cyberbiz] get_order_id failed: ${idRes.status}`);
        return null;
      }
      const idData = await idRes.json();
      if (!Array.isArray(idData) || !idData.length) return [];

      // Fetch full order for each matched ID (max 3)
      const orders = await Promise.all(
        idData.slice(0, 3).map(async ({ order_id }) => {
          const res = await fetch(`${BASE_URL}/v1/orders/${order_id}`, { headers: getHeaders() });
          if (!res.ok) return null;
          const o = await res.json();
          return simplifyOrder(o);
        })
      );
      return orders.filter(Boolean);
    }

    // ── Lookup by email ───────────────────────────
    if (email) {
      console.log(`[cyberbiz] get_customer_id: email=${email}`);
      const cidRes = await fetch(
        `${BASE_URL}/v1/customers/get_customer_id?customer_emails=${encodeURIComponent(email)}`,
        { headers: getHeaders() }
      );
      if (!cidRes.ok) {
        console.error(`[cyberbiz] get_customer_id failed: ${cidRes.status}`);
        return null;
      }
      const cidData = await cidRes.json();
      if (!Array.isArray(cidData) || !cidData.length) return [];

      const customerId = cidData[0].customer_id;
      const ordRes = await fetch(
        `${BASE_URL}/v1/customers/${customerId}/orders?per_page=3`,
        { headers: getHeaders() }
      );
      if (!ordRes.ok) {
        console.error(`[cyberbiz] customer orders failed: ${ordRes.status}`);
        return null;
      }
      const orders = await ordRes.json();
      const list = Array.isArray(orders) ? orders : (orders.orders || []);
      return list.slice(0, 3).map(simplifyOrder);
    }

    // Name search not supported by API — return null so AI asks for order# or email
    return null;

  } catch (err) {
    console.error(`[cyberbiz] getOrderStatus error: ${err.message}`);
    return null;
  }
}

module.exports = { searchProducts, getProduct, getOrderStatus, loadAllProducts };
