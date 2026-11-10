import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadState, saveState, exportBackup, importBackup, resetWeek } from '../app/js/store.js';
import { createInitialState } from '../app/js/seed.js';

function fakeStorage(init = {}) {
  const data = { ...init };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('key name', () => assert.equal(STORAGE_KEY, 'weekly-groceries-v1'));

test('save then load round-trips', () => {
  const st = fakeStorage();
  const s = createInitialState();
  s.week.mon = { mealId: Object.keys(s.meals)[0], servings: 3 };
  saveState(st, s);
  assert.deepEqual(loadState(st), s);
});

test('empty storage gives starter state', () => {
  assert.equal(Object.keys(loadState(fakeStorage()).meals).length, 5);
});

test('corrupt storage gives starter state without throwing', () => {
  assert.equal(Object.keys(loadState(fakeStorage({ [STORAGE_KEY]: '{bad' })).meals).length, 5);
});

test('backup round-trips', () => {
  const s = createInitialState();
  const r = importBackup(exportBackup(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
  const parsed = JSON.parse(exportBackup(s));
  assert.equal(parsed.app, 'weekly-groceries');
  assert.ok(!Number.isNaN(Date.parse(parsed.exportedAt)));
});

test('bad backups rejected with message', () => {
  for (const text of ['nope', '{"app":"other"}', '{"app":"weekly-groceries","state":{"version":2}}',
                      '{"app":"weekly-groceries","state":{"version":1,"meals":{}}}', '']) {
    const r = importBackup(text);
    assert.equal(r.ok, false, text);
    assert.ok(r.error.length > 0);
  }
});

test('damaged entries in a backup are dropped, not crash-causing', () => {
  const s = createInitialState();
  const ingId = Object.keys(s.ingredients)[0];
  s.meals.bad = { name: 'X' };                       // no items
  s.meals.noname = { id: 'noname', items: [] };      // no name
  s.meals.badItems = { id: 'badItems', name: 'Y', items: [null, { ingredientId: ingId, amount: 'x' }, { ingredientId: ingId, amount: 2 }] };
  s.ingredients.broken = { id: 'broken' };           // no name
  s.ingredients[ingId].product = { id: '1', url: 'javascript:alert(1)', packSize: 1, packUnit: 'ea' };
  s.week.mon = 'nonsense';
  s.regulars = [{ id: 'r', name: 'Coffee', section: 'Pantry', product: { url: 'javascript:alert(1)' } }, null];
  s.oneOffs = [{ nope: 1 }];
  const r = importBackup(exportBackup(s));
  assert.equal(r.ok, true);
  assert.equal(r.state.meals.bad, undefined);
  assert.equal(r.state.meals.noname, undefined);
  assert.deepEqual(r.state.meals.badItems.items, [{ ingredientId: ingId, amount: 2 }]);
  assert.equal(r.state.ingredients.broken, undefined);
  assert.equal(r.state.ingredients[ingId].product, null);
  assert.equal(r.state.week.mon, null);
  assert.equal(r.state.regulars.length, 1);
  assert.equal(r.state.regulars[0].product, null);
  assert.deepEqual(r.state.oneOffs, []);
});

test('valid product links survive normalize', () => {
  const s = createInitialState();
  const ingId = Object.keys(s.ingredients)[0];
  s.ingredients[ingId].product = { id: '5', url: 'https://www.starmarket.com/shop/product-details.5.html', packSize: 12, packUnit: 'ea' };
  const r = importBackup(exportBackup(s));
  assert.deepEqual(r.state.ingredients[ingId].product, s.ingredients[ingId].product);
});

test('resetWeek clears week and checks, keeps meals', () => {
  const s = createInitialState();
  s.week.mon = { mealId: Object.keys(s.meals)[0], servings: 2 };
  s.checks.done['ing:x'] = true;
  s.oneOffs = [{ id: 'o', name: 'Chips', section: 'Pantry', qty: 1, product: null }];
  const r = resetWeek(s);
  assert.ok(Object.values(r.week).every(d => d === null));
  assert.deepEqual(r.checks, { staplesNeeded: {}, regularsIncluded: {}, done: {} });
  assert.deepEqual(r.oneOffs, []);
  assert.equal(Object.keys(r.meals).length, 5);
  assert.equal(s.week.mon.servings, 2, 'original not mutated');
});
