import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartItemsFromList, encodeCart, decodeCart, inCartQty, CART_HASH_KEY, cartLink, findCartCode } from '../app/cart-core.js';

const row = (o) => ({ key: 'k', name: 'X', section: 'Other', amount: null, unit: null, packs: 1, unitMismatch: false,
  link: '', linked: true, done: false, source: 'meal', productId: '1', ...o });

test('cart items: linked, not done, summed by product id', () => {
  const list = { toBuy: [
    row({ name: 'Eggs', productId: '970055145', packs: 2 }),
    row({ name: 'Extra eggs', productId: '970055145', packs: 1, source: 'oneoff' }),
    row({ name: 'Tofu', productId: '960098954', packs: 2, done: true }),
    row({ name: 'Garlic', linked: false, productId: null, packs: null }),
    row({ name: 'Squash', productId: '184560042', packs: 1 }),
  ] };
  const r = cartItemsFromList(list);
  assert.deepEqual(r.items, [
    { id: '970055145', qty: 3, name: 'Eggs' },
    { id: '184560042', qty: 1, name: 'Squash' },
  ]);
  assert.deepEqual(r.unlinked, ['Garlic']);
  assert.deepEqual(r.skippedDone, ['Tofu']);
});

test('encode/decode round trip, url-safe', () => {
  const items = [{ id: '970055145', qty: 2, name: 'Eggs & “stuff”' }];
  const enc = encodeCart(items);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCart(enc), items);
});

test('decodeCart rejects junk', () => {
  for (const bad of ['', 'nope!!', encodeCart([{ id: 'abc', qty: 1 }]).slice(0, 3), 'W10']) {
    assert.deepEqual(decodeCart(bad), null, bad);
  }
  // valid base64 but wrong shape
  assert.equal(decodeCart(Buffer.from('{"a":1}').toString('base64url')), null);
});

test('decodeCart drops bad entries and caps qty', () => {
  const raw = Buffer.from(JSON.stringify([{ id: '1', qty: 2, name: 'a' }, { id: 'x', qty: 1 }, { id: '2', qty: 0 }, { id: '3', qty: 500, name: 'c' }])).toString('base64url');
  assert.deepEqual(decodeCart(raw), [{ id: '1', qty: 2, name: 'a' }, { id: '3', qty: 50, name: 'c' }]);
});

test('inCartQty reads the site label', () => {
  assert.equal(inCartQty('1 unit of O Organics Tofu Silken - 16 Oz in cart. Click to update'), 1);
  assert.equal(inCartQty('12 units of Banana in cart. Click to update'), 12);
  assert.equal(inCartQty('collapsed, 1 unit of O Organics Tofu Silken - 16 Oz in cart. Click to update'), 1);
  assert.equal(inCartQty('expanded, 3 units of Banana in cart. Click to update'), 3);
  assert.equal(inCartQty('Add 1 unit of Banana'), 0);
  assert.equal(inCartQty(''), 0);
  assert.equal(inCartQty(null), 0);
});

test('findCartCode pulls the code out of a link, a tab name, or a bare code', () => {
  const items = [{ id: '1', qty: 2, name: 'a' }];
  const code = encodeCart(items);
  assert.equal(findCartCode(cartLink(items)), code);
  assert.equal(findCartCode(`${CART_HASH_KEY}_${code}`), code);
  assert.equal(findCartCode(code), code);
  assert.equal(findCartCode(''), null);
  assert.equal(findCartCode(null), null);
  assert.equal(findCartCode('some random window name'), null);
});

test('cartLink puts the list after # on a Star Market page', () => {
  const link = cartLink([{ id: '1', qty: 1, name: 'a' }]);
  assert.ok(link.startsWith('https://www.starmarket.com/'));
  assert.ok(link.includes('#' + CART_HASH_KEY + '='));
  const enc = link.split(CART_HASH_KEY + '=')[1];
  assert.deepEqual(decodeCart(enc), [{ id: '1', qty: 1, name: 'a' }]);
});
