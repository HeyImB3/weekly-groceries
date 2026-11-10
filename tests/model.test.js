import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductLink, searchUrl, SECTIONS, newId } from '../app/js/model.js';

test('parseProductLink extracts id and canonical url', () => {
  assert.deepEqual(
    parseProductLink('https://www.starmarket.com/shop/product-details.970555123.html?x=1'),
    { id: '970555123', url: 'https://www.starmarket.com/shop/product-details.970555123.html' });
});

test('parseProductLink accepts the newer /shop/pd/<slug>/<id> links', () => {
  assert.deepEqual(
    parseProductLink('https://www.starmarket.com/shop/pd/o-organics-tofu-silken-16-oz/960098954'),
    { id: '960098954', url: 'https://www.starmarket.com/shop/product-details.960098954.html' });
  assert.deepEqual(
    parseProductLink('Check this out https://www.starmarket.com/shop/pd/banana/184060007?x=1'),
    { id: '184060007', url: 'https://www.starmarket.com/shop/product-details.184060007.html' });
});

test('parseProductLink rejects other urls', () => {
  assert.equal(parseProductLink('https://example.com/foo'), null);
  assert.equal(parseProductLink('https://example.com/shop/product-details.123.html'), null);
  assert.equal(parseProductLink(''), null);
  assert.equal(parseProductLink(undefined), null);
});

test('searchUrl encodes term', () => {
  assert.equal(searchUrl('silken tofu'),
    'https://www.starmarket.com/shop/search-results.html?q=silken%20tofu');
});

test('SECTIONS order', () => {
  assert.equal(SECTIONS[0], 'Produce');
  assert.equal(SECTIONS.at(-1), 'Other');
});

test('newId is unique-ish string', () => {
  const a = newId(), b = newId();
  assert.equal(typeof a, 'string');
  assert.notEqual(a, b);
});
