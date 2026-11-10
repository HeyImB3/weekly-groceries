// Shared by the app (to send the list) and the Star Market cart filler (to read it).

export const CART_HASH_KEY = 'wgcart';
export const MAX_QTY = 50;

// From buildShoppingList(): linked rows that aren't ticked off, summed per product.
export function cartItemsFromList(list) {
  const byId = new Map();
  const unlinked = [];
  const skippedDone = [];
  for (const r of list.toBuy) {
    if (r.done) { skippedDone.push(r.name); continue; }
    if (!r.linked || !r.productId) { unlinked.push(r.name); continue; }
    const qty = Math.max(1, Number(r.packs) || 1);
    const cur = byId.get(r.productId);
    if (cur) cur.qty += qty;
    else byId.set(r.productId, { id: r.productId, qty, name: r.name });
  }
  return { items: [...byId.values()], unlinked, skippedDone };
}

function toB64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export function encodeCart(items) {
  return toB64Url(JSON.stringify(items.map(({ id, qty, name }) => ({ id, qty, name }))));
}

export function decodeCart(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text.trim())) return null;
  let data;
  try { data = JSON.parse(fromB64Url(text.trim())); } catch { return null; }
  if (!Array.isArray(data)) return null;
  const items = data
    .filter(x => x && /^\d+$/.test(String(x.id)) && Number(x.qty) >= 1)
    .map(x => ({ id: String(x.id), qty: Math.min(MAX_QTY, Math.floor(Number(x.qty))), name: typeof x.name === 'string' ? x.name.slice(0, 80) : String(x.id) }));
  return items.length ? items : null;
}

// "2 units of Banana in cart. Click to update" -> 2
// (also "collapsed, 1 unit of … in cart" from the bubble shown on page load)
export function inCartQty(label) {
  const m = typeof label === 'string' && label.match(/(?:^|,\s*)(\d+)\s+units?\s+of\b.*\bin cart\b/i);
  return m ? Number(m[1]) : 0;
}

export function cartLink(items) {
  // The cart page keeps the # part (the search page rewrites its address).
  return `https://www.starmarket.com/erums/cart#${CART_HASH_KEY}=${encodeCart(items)}`;
}
