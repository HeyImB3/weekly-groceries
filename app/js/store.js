// Saving, loading, and backup files.
import { createInitialState, emptyWeek, emptyChecks, DAYS, KNOWN_PRODUCTS, DEFAULT_REGULAR_QTY } from './seed.js';
import { parseProductLink, SECTIONS } from './model.js';

export const STORAGE_KEY = 'weekly-groceries-v1';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function validState(s) {
  return isObj(s) && s.version === 1 && isObj(s.ingredients) && isObj(s.meals) && isObj(s.week);
}

const isName = v => typeof v === 'string' && v.trim() !== '';
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// Only keep product links that are real Star Market product pages.
function cleanProduct(p) {
  if (!isObj(p)) return null;
  const parsed = parseProductLink(p.url);
  if (!parsed) return null;
  const out = { ...parsed, packSize: isNum(p.packSize) && p.packSize > 0 ? p.packSize : 1, packUnit: isName(p.packUnit) ? p.packUnit : 'ea' };
  const known = KNOWN_PRODUCTS[out.id];
  if (isName(p.title)) out.title = p.title.slice(0, 140); else if (known) out.title = known.title;
  if (isNum(p.price) && p.price > 0) out.price = p.price; else if (known) out.price = known.price;
  return out;
}

// Drop damaged entries and fill in missing parts so the app can never be
// locked up by bad saved data.
function normalize(s) {
  const ingredients = {};
  for (const [id, i] of Object.entries(s.ingredients)) {
    if (!isObj(i) || !isName(i.name)) continue;
    ingredients[id] = {
      id, name: i.name,
      unit: isName(i.unit) ? i.unit : 'ea',
      section: SECTIONS.includes(i.section) ? i.section : 'Other',
      staple: !!i.staple,
      product: cleanProduct(i.product),
    };
  }
  const meals = {};
  for (const [id, m] of Object.entries(s.meals)) {
    if (!isObj(m) || !isName(m.name) || !Array.isArray(m.items)) continue;
    meals[id] = {
      id, name: m.name,
      items: m.items.filter(it => isObj(it) && typeof it.ingredientId === 'string' && isNum(it.amount))
        .map(it => ({ ingredientId: it.ingredientId, amount: it.amount })),
    };
  }
  const week = emptyWeek();
  for (const d of DAYS) {
    const p = s.week[d];
    if (isObj(p) && typeof p.mealId === 'string') week[d] = { mealId: p.mealId, servings: isNum(p.servings) && p.servings > 0 ? p.servings : 2 };
  }
  const extra = (list, withQty) => (Array.isArray(list) ? list : [])
    .filter(x => isObj(x) && isName(x.name) && typeof x.id === 'string')
    .map(x => ({
      id: x.id, name: x.name,
      section: SECTIONS.includes(x.section) ? x.section : 'Other',
      qty: isNum(x.qty) && x.qty > 0 ? x.qty : (DEFAULT_REGULAR_QTY[x.product?.id] || 1),
      product: cleanProduct(x.product),
    }));
  const checks = isObj(s.checks) ? s.checks : {};
  const flags = v => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, b]) => b === true)) : {});
  return {
    version: 1,
    ingredients,
    meals,
    week,
    householdStaples: (Array.isArray(s.householdStaples) ? s.householdStaples : []).filter(id => typeof id === 'string'),
    regulars: extra(s.regulars, false),
    oneOffs: extra(s.oneOffs, true),
    checks: { staplesNeeded: flags(checks.staplesNeeded), regularsIncluded: flags(checks.regularsIncluded), done: flags(checks.done) },
  };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (validState(s)) return normalize(s);
    }
  } catch { /* fall through to starter data */ }
  return createInitialState();
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportBackup(state) {
  return JSON.stringify({ app: 'weekly-groceries', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a Weekly Groceries backup (couldn't read it)." }; }
  if (!isObj(data) || data.app !== 'weekly-groceries') return { ok: false, error: "That file isn't a Weekly Groceries backup." };
  if (!validState(data.state)) return { ok: false, error: 'That backup is from an unsupported version or is damaged.' };
  return { ok: true, state: normalize(data.state) };
}

export function resetWeek(state) {
  return { ...state, week: emptyWeek(), checks: emptyChecks(), oneOffs: [] };
}
