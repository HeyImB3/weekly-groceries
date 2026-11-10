import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartItemsFromList, encodeCart, decodeCart, inCartQty, CART_HASH_KEY, cartLink, findCartCode,
  readCartSnapshot, parseSize, parseUnitPrice, pickSubstitute, isStoreBrand, searchTermFor } from '../app/cart-core.js';

test('items carry product title and usual price through the link', () => {
  const list = { toBuy: [row({ name: 'Green beans', productId: '970026757', packs: 1, productTitle: 'Signature SELECT/FARMS Green Beans - 2 Lb', productPrice: 5.99 })] };
  const { items } = cartItemsFromList(list);
  assert.deepEqual(items, [{ id: '970026757', qty: 1, name: 'Green beans', title: 'Signature SELECT/FARMS Green Beans - 2 Lb', price: 5.99 }]);
  assert.deepEqual(decodeCart(encodeCart(items)), items);
});

test('readCartSnapshot reads Star Market abCart', () => {
  const json = JSON.stringify({ cartItems: [
    { itemId: '184060007', qty: 6, maxPurchaseQty: 20, isOOS: false },
    { itemId: '970055145', qty: '2', maxPurchaseQty: '12', isOOS: 'true' },
  ] });
  const m = readCartSnapshot(json);
  assert.deepEqual(m.get('184060007'), { qty: 6, max: 20, oos: false });
  assert.deepEqual(m.get('970055145'), { qty: 2, max: 12, oos: true });
  assert.equal(readCartSnapshot('{bad').size, 0);
  assert.equal(readCartSnapshot(null).size, 0);
  assert.equal(readCartSnapshot('{"cartItems":"x"}').size, 0);
});

test('parseSize understands Star Market titles', () => {
  assert.deepEqual(parseSize('Signature SELECT/FARMS Green Beans - 2 Lb'), { value: 32, unit: 'oz' });
  assert.deepEqual(parseSize('Signature SELECT/FARMS Green Beans - 12 Oz'), { value: 12, unit: 'oz' });
  assert.deepEqual(parseSize('Lucerne Eggs Cage Free Brown Large Grd A - 18 CT'), { value: 18, unit: 'ct' });
  assert.deepEqual(parseSize('Thai Kitchen Coconut Cream - 13.66 Fl. Oz.'), { value: 13.66, unit: 'floz' });
  assert.deepEqual(parseSize('Momofuku  Sesame Miso Noodles 4 Count - 14.5 Oz'), { value: 14.5, unit: 'oz' });
  assert.equal(parseSize('Banana'), null);
});

test('parseUnitPrice reads the per-unit price line', () => {
  assert.deepEqual(parseUnitPrice('price per Pound $4.65 ($4.65 / Pound)'), { value: 4.65, per: 'lb' });
  assert.deepEqual(parseUnitPrice('price per Lb $3.00 ($3.00 / Lb)'), { value: 3, per: 'lb' });
  assert.deepEqual(parseUnitPrice('price per Ounce $0.31 ($0.31 / Ounce)'), { value: 0.31, per: 'oz' });
  assert.equal(parseUnitPrice(''), null);
});

test('isStoreBrand', () => {
  assert.ok(isStoreBrand('Signature SELECT/FARMS Green Beans - 2 Lb'));
  assert.ok(isStoreBrand('Lucerne Eggs Cage Free Brown Large Grd A - 18 CT'));
  assert.ok(isStoreBrand('O Organics Tofu Silken - 16 Oz'));
  assert.ok(!isStoreBrand('De Cecco Pasta No. 12 Spaghetti Box - 1 Lb'));
});

test('searchTermFor drops the size', () => {
  assert.equal(searchTermFor({ title: 'Signature SELECT/FARMS Green Beans - 2 Lb', name: 'Green beans' }), 'Signature SELECT/FARMS Green Beans');
  assert.equal(searchTermFor({ name: 'Green beans' }), 'Green beans');
});

const cand = (id, name, price, unitPrice, per = 'lb') => ({ id, name, price, unitPrice: unitPrice == null ? null : { value: unitPrice, per } });
const beans = [
  cand('960479694', 'Signature SELECT/FARMS Green Beans - 12 Oz', 3.49, 4.65),
  cand('970003630', 'Beans French 8oz - 8 OZ', 3.99, 7.98),
  cand('960559490', 'Pero Farms Green Beans Organic - 2 Lb', 8.99, 4.50),
  cand('121100014', 'Signature SELECT Beans Green Cut - 14.5 Oz', 1.00, 1.10),
];

test('pickSubstitute: similar product, similar size, best unit price', () => {
  const orig = { id: '970026757', name: 'Green beans', title: 'Signature SELECT/FARMS Green Beans - 2 Lb', price: 6.49 };
  const s = pickSubstitute(orig, beans);
  // 14.5 oz canned (size ratio 0.45) is too far from 32 oz; 12 oz (0.375) too; Pero 2 lb same size → chosen
  assert.equal(s.id, '960559490');
});

test('pickSubstitute rejects anything much pricier than usual', () => {
  const orig = { id: 'x', name: 'Green beans', title: 'Signature SELECT/FARMS Green Beans - 2 Lb', price: 4.00 };
  assert.equal(pickSubstitute(orig, beans), null); // Pero $8.99 > 1.5 × $4.00
});

test('pickSubstitute never picks the missing product itself or unrelated items', () => {
  const orig = { id: '960479694', name: 'Green beans', title: 'Signature SELECT/FARMS Green Beans - 12 Oz', price: 3.49 };
  const s = pickSubstitute(orig, [beans[0], cand('1', 'Signature SELECT Coffee - 12 Oz', 2.0, 2.6)]);
  assert.equal(s, null);
});

test('pickSubstitute prefers store brand when unit price is close', () => {
  const orig = { id: 'x', name: 'Silken tofu', title: 'O Organics Tofu Silken - 16 Oz', price: 2.49 };
  const s = pickSubstitute(orig, [
    cand('a', 'Nasoya Tofu Silken - 16 Oz', 2.39, 2.39),
    cand('b', 'Signature SELECT Tofu Silken - 16 Oz', 2.49, 2.49),
  ]);
  assert.equal(s.id, 'b');
});

test('pickSubstitute works with only an ingredient name (no title)', () => {
  const s = pickSubstitute({ id: 'x', name: 'Silken tofu' }, [
    cand('a', 'Nasoya Tofu Silken - 16 Oz', 2.39, 2.39),
    cand('c', 'Chocolate Bar - 3 Oz', 1, 5.3),
  ]);
  assert.equal(s.id, 'a');
});

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
