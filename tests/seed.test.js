import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, DAYS } from '../app/js/seed.js';
import { SECTIONS } from '../app/js/model.js';
import { buildShoppingList } from '../app/js/list.js';

test('starter state has 5 meals', () => {
  const s = createInitialState();
  assert.equal(s.version, 1);
  assert.equal(Object.keys(s.meals).length, 5);
});

test('eggs is one shared ingredient used by 3 meals', () => {
  const s = createInitialState();
  const eggs = Object.values(s.ingredients).filter(i => i.name === 'Eggs');
  assert.equal(eggs.length, 1);
  const users = Object.values(s.meals).filter(m => m.items.some(it => it.ingredientId === eggs[0].id));
  assert.equal(users.length, 3);
  assert.equal(eggs[0].product.id, '970055145');
  assert.equal(eggs[0].product.packSize, 18);
});

test('all references and sections valid; non-staples are linked', () => {
  const s = createInitialState();
  for (const m of Object.values(s.meals))
    for (const it of m.items) assert.ok(s.ingredients[it.ingredientId], `${m.name} -> ${it.ingredientId}`);
  for (const i of Object.values(s.ingredients)) {
    assert.ok(SECTIONS.includes(i.section), i.name);
    if (!i.staple) assert.ok(i.product, `${i.name} should be linked`);
    if (i.product) {
      assert.match(i.product.url, /product-details\.\d+\.html$/);
      assert.equal(i.product.packUnit, i.unit, `${i.name} pack unit matches recipe unit`);
    }
  }
});

test('regulars from the Nov 9 order are saved, unticked', () => {
  const s = createInitialState();
  const names = s.regulars.map(r => r.name);
  for (const n of ['Bananas', 'Green beans', 'Extra firm tofu']) assert.ok(names.includes(n), n);
  assert.deepEqual(s.checks.regularsIncluded, {});
});

test("owner's Nov 9 week reproduces the order's package counts", () => {
  const s = createInitialState();
  const id = name => Object.values(s.meals).find(m => m.name.startsWith(name)).id;
  const plan = ['Ramen', 'Grilled', 'Omelettes', 'Pesto', 'Pesto', 'Stir fry', 'Omelettes'];
  DAYS.forEach((d, i) => { s.week[d] = { mealId: id(plan[i]), servings: 2 }; });
  const l = buildShoppingList(s);
  const packs = Object.fromEntries(l.toBuy.map(r => [r.name, r.packs]));
  assert.deepEqual(packs, {
    'Butternut squash': 1, 'Fajita vegetables (peppers & onions)': 2, 'Green onions': 1, 'Potatoes': 1,
    'Silken tofu': 2, 'Eggs': 2, 'Shredded cheddar': 2, 'Bread': 1,
    'Pesto': 2, 'Ramen noodles': 1, 'Rice vermicelli noodles': 2, 'Spaghetti': 2,
  });
  assert.ok(l.toBuy.every(r => r.linked && !r.unitMismatch));
});

test('week has 7 empty days', () => {
  const s = createInitialState();
  assert.deepEqual(Object.keys(s.week), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.ok(Object.values(s.week).every(d => d === null));
  assert.deepEqual(s.oneOffs, []);
  assert.deepEqual(s.checks, { staplesNeeded: {}, regularsIncluded: {}, done: {} });
});
