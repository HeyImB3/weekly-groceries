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
    else {
      const item = { id: r.productId, qty, name: r.name };
      if (r.productTitle) item.title = r.productTitle;
      if (r.productPrice > 0) item.price = r.productPrice;
      byId.set(r.productId, item);
    }
  }
  return { items: [...byId.values()], unlinked, skippedDone };
}

// ---------- reading Star Market's own cart copy (localStorage "abCart") ----------
export function readCartSnapshot(json) {
  const map = new Map();
  let data;
  try { data = JSON.parse(json); } catch { return map; }
  if (!data || !Array.isArray(data.cartItems)) return map;
  for (const it of data.cartItems) {
    if (!it || !/^\d+$/.test(String(it.itemId))) continue;
    map.set(String(it.itemId), {
      qty: Number(it.qty) || 0,
      max: Number(it.maxPurchaseQty) || MAX_QTY,
      oos: it.isOOS === true || it.isOOS === 'true',
    });
  }
  return map;
}

// ---------- sizes, unit prices, substitutes ----------
const UNIT = String.raw`(fl\.?\s*oz\.?|fluid\s+ounces?|ounces?|oz|pounds?|lbs?|ct|count)`;
const MULTI_RE = new RegExp(String.raw`(\d+)\s*-\s*(\d+(?:\.\d+)?)\s*${UNIT}(?![a-z])`, 'gi');
const SIZE_RE = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}(?![a-z])`, 'gi');

function toSize(n, rawUnit) {
  const u = rawUnit.toLowerCase().replace(/[\s.]/g, '');
  if (u.startsWith('fl')) return { value: n, unit: 'floz' };
  if (u.startsWith('lb') || u.startsWith('pound')) return { value: n * 16, unit: 'oz' };
  if (u === 'oz' || u.startsWith('ounce')) return { value: n, unit: 'oz' };
  return { value: n, unit: 'ct' };
}

// "… - 2 Lb" -> {value: 32, unit: 'oz'}; "24-16.9 Fl. Oz." -> 24 × 16.9 fl oz.
// Uses the last size in the title.
export function parseSize(title) {
  if (typeof title !== 'string') return null;
  const multi = [...title.matchAll(MULTI_RE)];
  const single = [...title.matchAll(SIZE_RE)];
  const lastMulti = multi[multi.length - 1];
  const lastSingle = single[single.length - 1];
  if (lastMulti && (!lastSingle || lastMulti.index + lastMulti[0].length >= lastSingle.index + lastSingle[0].length)) {
    const s = toSize(Number(lastMulti[2]), lastMulti[3]);
    return { value: Math.round(Number(lastMulti[1]) * s.value * 1000) / 1000, unit: s.unit };
  }
  if (!lastSingle) return null;
  return toSize(Number(lastSingle[1]), lastSingle[2]);
}

const PER = { pound: 'lb', lb: 'lb', ounce: 'oz', oz: 'oz', 'fl oz': 'floz', each: 'ea', ea: 'ea', count: 'ct', ct: 'ct' };

// "price per Pound $4.65 ($4.65 / Pound)" -> {value: 4.65, per: 'lb'}
export function parseUnitPrice(text) {
  const m = typeof text === 'string' && text.match(/\$\s*([\d.]+)\s*\/\s*(fl oz|pound|lb|ounce|oz|each|ea|count|ct)\b/i);
  if (!m) return null;
  return { value: Number(m[1]), per: PER[m[2].toLowerCase()] };
}

const STORE_BRANDS = /\b(signature|lucerne|o organics|open nature|waterfront bistro|primo taglio|value corner|soleil|ready meals)\b/i;
export function isStoreBrand(title) {
  return STORE_BRANDS.test(title || '');
}

const STOP = new Set(['and', 'with', 'the', 'of', 'a', 'an', 'in', 'no', 'box', 'bag', 'count', 'pack', 'fl', 'oz', 'lb', 'lbs', 'ct',
  'signature', 'select', 'farms', 'lucerne', 'o', 'organics', 'open', 'nature', 'each', 'family', 'size']);
function stem(w) {
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);   // tomatoes -> tomato
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'; // berries -> berry
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
function tokens(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z]+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(stem));
}

function stripSize(title) {
  return String(title || '').replace(/\s*-\s*[\d.].*$/, '').trim();
}

export function searchTermFor(item) {
  return item.title ? stripSize(item.title) : item.name;
}

// Price per ounce (or per count) so different sizes compare fairly.
function perBase(c, size) {
  const u = c.unitPrice;
  if (u && u.value > 0) {
    if (u.per === 'lb') return u.value / 16;
    if (u.per === 'oz' || u.per === 'floz') return u.value;
    if (u.per === 'ct' && size && size.unit === 'ct') return u.value;
  }
  if (size && size.value > 0 && c.price > 0) return c.price / size.value;
  return c.price > 0 ? c.price : Infinity;
}

// Pick a good stand-in for a product that couldn't be added. Only when we know
// the original product's title and usual price (otherwise we'd be guessing).
//  - same kind of thing: at least half the words of the original title
//  - similar size (half to double), when both sizes are known
//  - not much pricier than usual: ≤ 1.5× per ounce/count when sizes compare,
//    otherwise ≤ 1.5× the usual price for the package
//  - cheapest per ounce wins; store brands get a 10% nudge
//  - never one of `exclude` (other list items, substitutes already picked)
export function pickSubstitute(orig, candidates, exclude = new Set()) {
  if (!orig || !orig.title || !(orig.price > 0)) return null;
  const titleTok = tokens(stripSize(orig.title));
  if (!titleTok.size) return null;
  const oSize = parseSize(orig.title);
  let best = null, bestScore = Infinity;
  for (const c of candidates || []) {
    if (!c || !c.name || c.id === orig.id || exclude.has(c.id)) continue;
    const ct = tokens(c.name);
    const covered = [...titleTok].filter(w => ct.has(w)).length / titleTok.size;
    if (covered < 0.5) continue;
    const cSize = parseSize(c.name);
    const comparable = oSize && cSize && oSize.unit === cSize.unit;
    if (comparable) {
      const ratio = cSize.value / oSize.value;
      if (ratio < 0.5 || ratio > 2) continue;
      if (perBase(c, cSize) > (orig.price / oSize.value) * 1.5) continue;
    } else if (!(c.price > 0) || c.price > orig.price * 1.5) {
      continue;
    }
    const score = perBase(c, cSize) * (isStoreBrand(c.name) ? 0.9 : 1);
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// Star Market's cart copy can be out of date (e.g. you changed the cart on your
// phone). Only trust it if the site updated it after this page loaded.
export function snapshotIsFresh(json, pageStartMs) {
  let data;
  try { data = JSON.parse(json); } catch { return false; }
  if (!data || typeof data.updatedTime !== 'string') return false;
  const t = Date.parse(data.updatedTime.replace(/^"+|"+$/g, ''));
  return Number.isFinite(t) && t >= pageStartMs - 1000;
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
  return toB64Url(JSON.stringify(items.map(({ id, qty, name, title, price }) => ({ id, qty, name, title, price }))));
}

export function decodeCart(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text.trim())) return null;
  let data;
  try { data = JSON.parse(fromB64Url(text.trim())); } catch { return null; }
  if (!Array.isArray(data)) return null;
  const items = data
    .filter(x => x && /^\d+$/.test(String(x.id)) && Number(x.qty) >= 1)
    .map(x => {
      const item = { id: String(x.id), qty: Math.min(MAX_QTY, Math.floor(Number(x.qty))), name: typeof x.name === 'string' ? x.name.slice(0, 80) : String(x.id) };
      if (typeof x.title === 'string' && x.title) item.title = x.title.slice(0, 140);
      if (Number(x.price) > 0) item.price = Number(x.price);
      return item;
    });
  // Merge repeated product ids so two frames never work on the same product.
  const merged = new Map();
  for (const it of items) {
    const m = merged.get(it.id);
    if (m) m.qty = Math.min(MAX_QTY, m.qty + it.qty); else merged.set(it.id, it);
  }
  return merged.size ? [...merged.values()] : null;
}

// "2 units of Banana in cart. Click to update" -> 2
// (also "collapsed, 1 unit of … in cart" from the bubble shown on page load)
export function inCartQty(label) {
  const m = typeof label === 'string' && label.match(/(?:^|,\s*)(\d+)\s+units?\s+of\b.*\bin cart\b/i);
  return m ? Number(m[1]) : 0;
}

// Find a cart code in a link ("#wgcart=..."), a tab name ("wgcart_..."), or a
// bare pasted code. Returns the code only if it decodes to a real list.
export function findCartCode(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = text.match(new RegExp(`${CART_HASH_KEY}[=_]([A-Za-z0-9_-]+)`));
  const code = m ? m[1] : text.trim();
  return decodeCart(code) ? code : null;
}

// Name for the Star Market tab; survives redirects, unlike the # part.
export function cartWindowName(items) {
  return `${CART_HASH_KEY}_${encodeCart(items)}`;
}

export function cartLink(items) {
  // The cart page keeps the # part (the search page rewrites its address).
  return `https://www.starmarket.com/erums/cart#${CART_HASH_KEY}=${encodeCart(items)}`;
}
