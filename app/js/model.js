// Shared constants and small helpers.

export const SECTIONS = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery',
  'Frozen', 'Pantry', 'Household', 'Other',
];

export const UNITS = ['ea', 'oz', 'lb', 'cup', 'slice', 'bunch', 'tbsp', 'tsp', 'can', 'jar', 'pack', 'loaf'];

// Star Market product links come in two shapes:
//   https://www.starmarket.com/shop/product-details.960098954.html
//   https://www.starmarket.com/shop/pd/o-organics-tofu-silken-16-oz/960098954
// Shared links may also have extra text around them.
const PRODUCT_RES = [
  /https?:\/\/(?:www\.)?starmarket\.com\/\S*?product-details\.(\d+)\.html/i,
  /https?:\/\/(?:www\.)?starmarket\.com\/shop\/pd\/[^/\s?#]+\/(\d+)(?=[/?#\s]|$)/i,
];

export function productUrl(id) {
  return `https://www.starmarket.com/shop/product-details.${id}.html`;
}

export function parseProductLink(url) {
  if (typeof url !== 'string') return null;
  for (const re of PRODUCT_RES) {
    const m = url.trim().match(re);
    if (m) return { id: m[1], url: productUrl(m[1]) };
  }
  return null;
}

export function searchUrl(term) {
  return `https://www.starmarket.com/shop/search-results.html?q=${encodeURIComponent(term)}`;
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
