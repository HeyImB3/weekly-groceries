// Shared constants and small helpers.

export const SECTIONS = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery',
  'Frozen', 'Pantry', 'Household', 'Other',
];

export const UNITS = ['ea', 'oz', 'lb', 'cup', 'slice', 'bunch', 'tbsp', 'tsp', 'can', 'jar', 'pack', 'loaf'];

const PRODUCT_RE = /^https?:\/\/(?:www\.)?starmarket\.com\/.*product-details\.(\d+)\.html/i;

export function parseProductLink(url) {
  if (typeof url !== 'string') return null;
  const m = url.trim().match(PRODUCT_RE);
  if (!m) return null;
  return { id: m[1], url: `https://www.starmarket.com/shop/product-details.${m[1]}.html` };
}

export function searchUrl(term) {
  return `https://www.starmarket.com/shop/search-results.html?q=${encodeURIComponent(term)}`;
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
