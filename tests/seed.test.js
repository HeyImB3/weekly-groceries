import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, DAYS } from '../app/js/seed.js';
import { SECTIONS } from '../app/js/model.js';

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
});

test('all references and sections valid', () => {
  const s = createInitialState();
  for (const m of Object.values(s.meals))
    for (const it of m.items) assert.ok(s.ingredients[it.ingredientId], `${m.name} -> ${it.ingredientId}`);
  for (const i of Object.values(s.ingredients)) {
    assert.ok(SECTIONS.includes(i.section), i.name);
    assert.equal(i.product, null);
  }
});

test('week has 7 empty days and empty extras', () => {
  const s = createInitialState();
  assert.deepEqual(Object.keys(s.week), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.deepEqual(DAYS, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.ok(Object.values(s.week).every(d => d === null));
  assert.deepEqual(s.regulars, []);
  assert.deepEqual(s.oneOffs, []);
  assert.deepEqual(s.householdStaples, []);
  assert.deepEqual(s.checks, { staplesNeeded: {}, regularsIncluded: {}, done: {} });
});
