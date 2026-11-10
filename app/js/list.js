// Turns the week's plan into one merged shopping list.
import { SECTIONS, searchUrl } from './model.js';
import { DAYS } from './seed.js';

const round2 = n => Math.round(n * 100) / 100;

function sectionIndex(section) {
  const i = SECTIONS.indexOf(section);
  return i === -1 ? SECTIONS.length : i;
}

function makeRow({ key, name, section, product, amount = null, unit = null, packs, source, done }) {
  return {
    key, name, section, amount, unit, packs,
    unitMismatch: false,
    link: product ? product.url : searchUrl(name),
    linked: !!product,
    productId: product ? product.id : null,
    productTitle: product && product.title ? product.title : null,
    productPrice: product && product.price > 0 ? product.price : null,
    done: !!done,
    source,
  };
}

export function buildShoppingList(state) {
  const { ingredients, meals, week, checks } = state;
  const done = checks?.done ?? {};
  const staplesNeeded = checks?.staplesNeeded ?? {};
  const regularsIncluded = checks?.regularsIncluded ?? {};

  // Sum meal ingredient amounts across the week, scaled by servings.
  const totals = new Map(); // ingredientId -> amount
  let anyMeal = false;
  for (const day of DAYS) {
    const plan = week?.[day];
    if (!plan) continue;
    const meal = meals[plan.mealId];
    if (!meal) continue;
    anyMeal = true;
    const scale = (Number(plan.servings) || 2) / 2;
    for (const item of meal.items) {
      if (!ingredients[item.ingredientId]) continue;
      totals.set(item.ingredientId, (totals.get(item.ingredientId) ?? 0) + (Number(item.amount) || 0) * scale);
    }
  }

  // Staples: those used this week plus household staples.
  const stapleIds = new Set();
  for (const id of totals.keys()) if (ingredients[id].staple) stapleIds.add(id);
  for (const id of state.householdStaples ?? []) if (ingredients[id]) stapleIds.add(id);
  const staples = [...stapleIds]
    .map(id => ({ ingredientId: id, name: ingredients[id].name, needed: !!staplesNeeded[id] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const toBuy = [];
  for (const [id, total] of totals) {
    if (stapleIds.has(id)) continue;
    const ing = ingredients[id];
    const amount = round2(total);
    const p = ing.product;
    let packs = null, unitMismatch = false;
    if (p) {
      if (p.packUnit === ing.unit && Number(p.packSize) > 0) {
        packs = Math.max(1, Math.ceil(round2(total / Number(p.packSize))));
      } else {
        packs = 1;
        unitMismatch = true;
      }
    }
    const key = `ing:${id}`;
    const row = makeRow({ key, name: ing.name, section: ing.section, product: p, amount, unit: ing.unit, packs, source: 'meal', done: done[key] });
    row.unitMismatch = unitMismatch;
    toBuy.push(row);
  }

  for (const s of staples) {
    if (!s.needed) continue;
    const ing = ingredients[s.ingredientId];
    const key = `ing:${ing.id}`;
    toBuy.push(makeRow({ key, name: ing.name, section: ing.section, product: ing.product, packs: 1, source: 'staple', done: done[key] }));
  }

  const regulars = (state.regulars ?? []).map(r => ({ id: r.id, name: r.name, included: !!regularsIncluded[r.id] }));
  for (const r of state.regulars ?? []) {
    if (!regularsIncluded[r.id]) continue;
    const key = `reg:${r.id}`;
    toBuy.push(makeRow({ key, name: r.name, section: r.section, product: r.product, packs: Math.max(1, Math.round(Number(r.qty) || 1)), source: 'regular', done: done[key] }));
  }

  for (const o of state.oneOffs ?? []) {
    const key = `one:${o.id}`;
    toBuy.push(makeRow({ key, name: o.name, section: o.section, product: o.product, packs: Math.max(1, Number(o.qty) || 1), source: 'oneoff', done: done[key] }));
  }

  toBuy.sort((a, b) => sectionIndex(a.section) - sectionIndex(b.section) || a.name.localeCompare(b.name));

  const empty = !anyMeal && toBuy.length === 0;
  return { empty, noMeals: !anyMeal, staples, regulars, toBuy };
}
