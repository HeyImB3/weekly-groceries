import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShoppingList } from '../app/js/list.js';
import { searchUrl } from '../app/js/model.js';
import { emptyWeek, emptyChecks } from '../app/js/seed.js';

const prod = (packSize, packUnit, id = '1') =>
  ({ id, url: `https://www.starmarket.com/shop/product-details.${id}.html`, packSize, packUnit });

function base() {
  return {
    version: 1,
    ingredients: {
      eggs: { id: 'eggs', name: 'Eggs', unit: 'ea', section: 'Dairy & Eggs', staple: false, product: prod(18, 'ea') },
      squash: { id: 'squash', name: 'Butternut squash', unit: 'ea', section: 'Produce', staple: false, product: null },
      tofu: { id: 'tofu', name: 'Silken tofu', unit: 'oz', section: 'Produce', staple: false, product: prod(16, 'oz', '2') },
      bread: { id: 'bread', name: 'Bread', unit: 'slice', section: 'Bakery', staple: false, product: prod(1, 'loaf', '3') },
      soy: { id: 'soy', name: 'Soy sauce', unit: 'tbsp', section: 'Pantry', staple: true, product: null },
    },
    meals: {
      omelette: { id: 'omelette', name: 'Omelettes', items: [{ ingredientId: 'eggs', amount: 6 }] },
      ramen: { id: 'ramen', name: 'Ramen', items: [{ ingredientId: 'eggs', amount: 4 }, { ingredientId: 'soy', amount: 2 }] },
      squash: { id: 'squash', name: 'Squash', items: [{ ingredientId: 'squash', amount: 0.5 }] },
      tofu: { id: 'tofu', name: 'Tofu', items: [{ ingredientId: 'tofu', amount: 16 }] },
      toast: { id: 'toast', name: 'Toast', items: [{ ingredientId: 'bread', amount: 4 }] },
    },
    week: emptyWeek(),
    householdStaples: [],
    regulars: [],
    oneOffs: [],
    checks: emptyChecks(),
  };
}
const row = (l, key) => l.toBuy.find(r => r.key === key);

test('eggs merge across meals into one row', () => {
  const s = base();
  s.week.mon = { mealId: 'ramen', servings: 2 };
  s.week.wed = { mealId: 'omelette', servings: 2 };
  s.week.sun = { mealId: 'omelette', servings: 2 };
  const l = buildShoppingList(s);
  assert.equal(l.toBuy.filter(r => r.name === 'Eggs').length, 1);
  const e = row(l, 'ing:eggs');
  assert.equal(e.amount, 16);
  assert.equal(e.packs, 1);
  assert.equal(e.source, 'meal');
  assert.equal(e.linked, true);
});

test('servings scale amounts and packs', () => {
  const s = base();
  s.week.mon = { mealId: 'squash', servings: 3 };
  s.week.tue = { mealId: 'tofu', servings: 4 };
  const l = buildShoppingList(s);
  assert.equal(row(l, 'ing:squash').amount, 0.75);
  assert.equal(row(l, 'ing:tofu').packs, 2);
});

test('amounts round to 2 decimals', () => {
  const s = base();
  s.meals.squash.items[0].amount = 1 / 3;
  s.week.mon = { mealId: 'squash', servings: 2 };
  assert.equal(row(buildShoppingList(s), 'ing:squash').amount, 0.33);
});

test('unlinked ingredient gets search link', () => {
  const s = base();
  s.week.mon = { mealId: 'squash', servings: 2 };
  const r = row(buildShoppingList(s), 'ing:squash');
  assert.equal(r.linked, false);
  assert.equal(r.packs, null);
  assert.equal(r.unitMismatch, false);
  assert.equal(r.link, searchUrl('Butternut squash'));
});

test('unit mismatch defaults to 1 pack and flags', () => {
  const s = base();
  s.week.mon = { mealId: 'toast', servings: 2 };
  const r = row(buildShoppingList(s), 'ing:bread');
  assert.equal(r.packs, 1);
  assert.equal(r.unitMismatch, true);
  assert.equal(r.link, 'https://www.starmarket.com/shop/product-details.3.html');
});

test('staples only bought when ticked', () => {
  const s = base();
  s.week.mon = { mealId: 'ramen', servings: 2 };
  let l = buildShoppingList(s);
  assert.deepEqual(l.staples, [{ ingredientId: 'soy', name: 'Soy sauce', needed: false }]);
  assert.equal(row(l, 'ing:soy'), undefined);
  s.checks.staplesNeeded.soy = true;
  l = buildShoppingList(s);
  const r = row(l, 'ing:soy');
  assert.equal(r.source, 'staple');
  assert.equal(r.packs, 1);
  assert.equal(l.staples[0].needed, true);
});

test('household staples appear even when no meal uses them', () => {
  const s = base();
  s.householdStaples = ['soy'];
  const l = buildShoppingList(s);
  assert.equal(l.staples.length, 1);
});

test('regulars only when included; one-offs use qty', () => {
  const s = base();
  s.regulars = [{ id: 'r1', name: 'Coffee', section: 'Pantry', product: null },
                { id: 'r2', name: 'Paper towels', section: 'Household', product: prod(1, 'pack', '9') }];
  s.oneOffs = [{ id: 'o1', name: 'Chips', section: 'Pantry', qty: 2, product: null }];
  s.checks.regularsIncluded.r2 = true;
  const l = buildShoppingList(s);
  assert.equal(row(l, 'reg:r1'), undefined);
  assert.equal(row(l, 'reg:r2').packs, 1);
  assert.equal(row(l, 'reg:r2').source, 'regular');
  assert.equal(row(l, 'one:o1').packs, 2);
  assert.equal(row(l, 'one:o1').source, 'oneoff');
  assert.deepEqual(l.regulars.map(r => [r.id, r.included]), [['r1', false], ['r2', true]]);
  assert.equal(l.empty, false);
});

test('regulars use their own quantity (e.g. 6 bananas)', () => {
  const s = base();
  s.regulars = [{ id: 'r1', name: 'Bananas', section: 'Produce', qty: 6, product: prod(1, 'ea', '184060007') }];
  s.checks.regularsIncluded.r1 = true;
  assert.equal(row(buildShoppingList(s), 'reg:r1').packs, 6);
});

test('rows carry product title and usual price for substitutes', () => {
  const s = base();
  s.ingredients.eggs.product = { ...prod(18, 'ea', '970055145'), title: 'Lucerne Eggs - 18 CT', price: 4.99 };
  s.week.mon = { mealId: 'omelette', servings: 2 };
  const r = row(buildShoppingList(s), 'ing:eggs');
  assert.equal(r.productId, '970055145');
  assert.equal(r.productTitle, 'Lucerne Eggs - 18 CT');
  assert.equal(r.productPrice, 4.99);
});

test('done flag comes from checks', () => {
  const s = base();
  s.week.mon = { mealId: 'omelette', servings: 2 };
  s.checks.done['ing:eggs'] = true;
  assert.equal(row(buildShoppingList(s), 'ing:eggs').done, true);
});

test('empty week', () => {
  const l = buildShoppingList(base());
  assert.equal(l.empty, true);
  assert.deepEqual(l.toBuy, []);
});

test('noMeals is true when no day has a meal, even with regulars', () => {
  const s = base();
  s.regulars = [{ id: 'r1', name: 'Coffee', section: 'Pantry', product: null }];
  s.householdStaples = ['soy'];
  assert.equal(buildShoppingList(s).noMeals, true);
  s.week.mon = { mealId: 'omelette', servings: 2 };
  assert.equal(buildShoppingList(s).noMeals, false);
});

test('dangling references are skipped', () => {
  const s = base();
  s.week.mon = { mealId: 'gone', servings: 2 };
  s.meals.omelette.items.push({ ingredientId: 'ghost', amount: 1 });
  s.week.tue = { mealId: 'omelette', servings: 2 };
  s.householdStaples = ['ghost'];
  const l = buildShoppingList(s);
  assert.equal(l.toBuy.length, 1);
  assert.equal(l.staples.length, 0);
});

test('sorted by section then name', () => {
  const s = base();
  s.week.mon = { mealId: 'omelette', servings: 2 };
  s.week.tue = { mealId: 'squash', servings: 2 };
  s.week.wed = { mealId: 'tofu', servings: 2 };
  const names = buildShoppingList(s).toBuy.map(r => r.name);
  assert.deepEqual(names, ['Butternut squash', 'Silken tofu', 'Eggs']);
});
