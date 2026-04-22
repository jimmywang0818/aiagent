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

module.exports = { searchProducts, getProduct, loadAllProducts };
