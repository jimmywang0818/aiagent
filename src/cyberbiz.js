'use strict';

require('dotenv').config();

const BASE_URL = 'https://app-store-api.cyberbiz.io';

const headers = {
  'Authorization': `Bearer ${process.env.CYBERBIZ_API_TOKEN}`,
  'Accept': 'application/json',
};

/**
 * Search products by keyword.
 * Returns a simplified array for AI consumption.
 */
async function searchProducts(keyword, limit = 5) {
  const url = `${BASE_URL}/v1/products/search?q=${encodeURIComponent(keyword)}&limit=${limit}&filter_published=true`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    console.error(`[cyberbiz] searchProducts failed ${res.status}`);
    return [];
  }

  const products = await res.json();

  return products.map(p => {
    const variant = p.product_variants?.[0];
    const inStock = variant
      ? !(variant.inventory_management && variant.inventory_quantity <= 0)
      : true;

    return {
      id: p.id,
      title: p.title,
      url: p.product_url?.startsWith('//') ? `https:${p.product_url}` : p.product_url,
      price: variant?.price ?? p.price,
      originalPrice: variant?.compare_at_price || null,
      inStock,
      brief: p.brief_text || '',
      type: p.product_type || '',
      tags: p.tags || [],
    };
  });
}

/**
 * Get a single product by ID.
 */
async function getProduct(productId) {
  const res = await fetch(`${BASE_URL}/v1/products/${productId}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

module.exports = { searchProducts, getProduct };
