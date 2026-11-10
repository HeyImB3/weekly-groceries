// Shopping List tab.
import { h, fmt, openSheet, select } from './dom.js';
import { buildShoppingList } from '../list.js';
import { SECTIONS, newId } from '../model.js';
import { productBlock } from './meals.js';
import { cartItemsFromList, cartLink } from '../../cart-core.js';

const APP_BASE = new URL('../../', import.meta.url).href; // .../weekly-groceries/
export const BOOKMARKLET = `javascript:(function(){var s=document.createElement('script');s.type='module';s.src='${APP_BASE}cart.js?v='+Date.now();document.body.appendChild(s);})()`;

function setupSheet() {
  openSheet('Set up the Fill cart bookmark (once)', close => {
    const msg = h('div', { class: 'sub', style: 'margin-top:6px' });
    const code = h('input', { value: BOOKMARKLET, readOnly: true, onclick: e => e.target.select() });
    return [
      h('ol', { style: 'padding-left:20px;margin:0 0 10px' },
        h('li', {}, 'Tap “Copy bookmark code” below.'),
        h('li', {}, 'In Safari, open any page (e.g. starmarket.com), tap the Share button → Add Bookmark. Name it “Fill cart” and save.'),
        h('li', {}, 'Tap the Bookmarks (book) icon → Edit → tap “Fill cart”, delete its address, paste the code, tap Done.')),
      code,
      h('button', { class: 'btn', onclick: async () => {
        try { await navigator.clipboard.writeText(BOOKMARKLET); msg.textContent = 'Copied! Now paste it as the bookmark’s address.'; }
        catch { code.select(); msg.textContent = 'Select the text above and copy it.'; }
      } }, 'Copy bookmark code'),
      msg,
      h('div', { class: 'sub', style: 'margin-top:10px' }, 'Chrome on iPhone works too (edit a bookmark’s URL the same way), but to run it you type “Fill cart” in the address bar and pick the bookmark.'),
      h('button', { class: 'btn secondary', onclick: close }, 'Done'),
    ];
  });
}

function buildCart(list) {
  const { items, unlinked, skippedDone } = cartItemsFromList(list);
  openSheet('Build my Star Market cart', close => {
    if (!items.length) {
      return [h('div', {}, 'Nothing to add: no linked, un-ticked items on the list.'), h('button', { class: 'btn secondary', onclick: close }, 'OK')];
    }
    const link = cartLink(items);
    const msg = h('div', { class: 'sub' });
    return [
      h('div', {}, `${items.length} products (${items.reduce((n, i) => n + i.qty, 0)} items) ready to add. Items already in your cart are topped up, never doubled.`),
      unlinked.length ? h('div', { class: 'warn', style: 'margin-top:8px' }, `Not linked, add by hand: ${unlinked.join(', ')}`) : null,
      skippedDone.length ? h('div', { class: 'sub', style: 'margin-top:6px' }, `Skipping ticked-off: ${skippedDone.join(', ')}`) : null,
      h('ol', { style: 'padding-left:20px' },
        h('li', {}, 'Tap “Open Star Market” (signed in, in Safari).'),
        h('li', {}, 'Tap your “Fill cart” bookmark and wait for the green checks.'),
        h('li', {}, 'Review the cart and check out for pickup.')),
      h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener', onclick: () => {
        navigator.clipboard?.writeText(link).catch(() => {});
        msg.textContent = 'If Star Market opened inside this app, tap the Safari/compass icon to open it in Safari so your bookmark is there. (The list is also copied, so the bookmark can paste it.)';
      } }, 'Open Star Market'),
      msg,
      h('button', { class: 'linkbtn', onclick: () => { close(); setupSheet(); } }, 'First time? Set up the Fill cart bookmark'),
    ];
  });
}

function addOneOff(ctx) {
  openSheet('Add extra item', close => {
    const name = h('input', { placeholder: 'e.g. Chips' });
    const qty = h('input', { type: 'number', inputMode: 'numeric', min: '1', value: '1' });
    let section = 'Other';
    let product = null;
    const prodWrap = h('div');
    const drawProd = () => { prodWrap.innerHTML = ''; prodWrap.append(productBlock(product, name.value || 'item', 'pack', p => { product = p; drawProd(); })); };
    drawProd();
    name.addEventListener('change', drawProd);
    const err = h('div', { class: 'err' });
    return [
      h('label', { class: 'field' }, h('span', {}, 'Item'), name),
      h('div', { class: 'inline' },
        h('label', { class: 'field', style: 'flex:1' }, h('span', {}, 'How many'), qty),
        h('label', { class: 'field', style: 'flex:2' }, h('span', {}, 'Store section'), select(SECTIONS, section, v => { section = v; }))),
      prodWrap, err,
      h('button', { class: 'btn', onclick: () => {
        const n = name.value.trim();
        if (!n) { err.textContent = 'Give it a name.'; return; }
        ctx.update(st => { st.oneOffs.push({ id: newId(), name: n, section, qty: Math.max(1, Number(qty.value) || 1), product }); });
        close();
      } }, 'Add to list'),
    ];
  });
}

export function render(root, ctx) {
  const s = ctx.getState();
  const list = buildShoppingList(s);
  root.append(h('h1', {}, 'Shopping List'));

  if (list.noMeals) {
    root.append(h('div', { class: 'empty' }, 'Pick some meals on the Week tab.'),
      h('button', { class: 'btn', onclick: () => ctx.showTab('week') }, 'Go to This Week'));
  }

  const linked = list.toBuy.filter(r => r.linked).length;
  const left = list.toBuy.filter(r => !r.done).length;
  if (list.toBuy.length) {
    root.append(h('div', { class: 'sub' }, `${list.toBuy.length} items · ${linked} linked · ${left} left to add`));
    root.append(h('button', { class: 'btn', onclick: () => buildCart(list) }, '🛒 Build my Star Market cart'));
  }

  if (list.staples.length) {
    root.append(h('h2', {}, 'Do you have these? (tick if you need)'),
      h('div', { class: 'card' }, list.staples.map(st => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.needed, onchange: e => ctx.update(x => {
          if (e.target.checked) x.checks.staplesNeeded[st.ingredientId] = true;
          else delete x.checks.staplesNeeded[st.ingredientId];
        }) }),
        h('span', {}, st.name)))));
  }

  if (list.regulars.length) {
    root.append(h('h2', {}, 'Regulars (tick to buy)'),
      h('div', { class: 'card' }, list.regulars.map(r => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: r.included, onchange: e => ctx.update(x => {
          if (e.target.checked) x.checks.regularsIncluded[r.id] = true;
          else delete x.checks.regularsIncluded[r.id];
        }) }),
        h('span', {}, r.name)))));
  }

  if (list.toBuy.length) {
    root.append(h('h2', {}, 'To buy'));
    let lastSection = null;
    for (const r of list.toBuy) {
      if (r.section !== lastSection) {
        root.append(h('div', { class: 'sub', style: 'margin:14px 2px 6px;font-weight:600' }, r.section));
        lastSection = r.section;
      }
      const detail = r.amount !== null ? `${fmt(r.amount)} ${r.unit}` : (r.source === 'staple' ? 'staple' : r.source === 'regular' ? 'regular' : 'extra');
      root.append(h('div', { class: 'row' + (r.done ? ' done' : '') },
        h('input', { type: 'checkbox', checked: r.done, 'aria-label': 'Added', onchange: e => ctx.update(x => {
          if (e.target.checked) x.checks.done[r.key] = true;
          else delete x.checks.done[r.key];
        }) }),
        h('div', { class: 'grow' },
          h('div', { class: 'name' }, r.name),
          h('div', { class: 'sub' }, detail),
          r.unitMismatch ? h('div', { class: 'warn' }, '⚠ check pack size') : null,
          h('a', { href: r.link, target: '_blank', rel: 'noopener', style: 'font-size:14px' },
            r.linked ? 'Open in Star Market ↗' : 'Search Star Market ↗')),
        r.packs !== null ? h('span', { class: 'qty' }, `x${r.packs}`) : null,
        r.source === 'oneoff' ? h('button', { 'aria-label': 'Remove', style: 'color:var(--danger);padding:4px 6px', onclick: () =>
          ctx.update(x => { x.oneOffs = x.oneOffs.filter(o => `one:${o.id}` !== r.key); delete x.checks.done[r.key]; }) }, '✕') : null));
    }
  }

  root.append(h('button', { class: 'btn secondary', onclick: () => addOneOff(ctx) }, '+ Add extra item'));
  root.append(h('button', { class: 'linkbtn', style: 'display:block;margin:6px auto', onclick: setupSheet }, 'Set up the Fill cart bookmark'));
}
