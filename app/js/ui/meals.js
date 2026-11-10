// My Meals tab: meals, ingredient catalog, household staples, regulars, backup.
import { h, openSheet, select, download } from './dom.js';
import { SECTIONS, UNITS, newId, parseProductLink, searchUrl } from '../model.js';
import { exportBackup, importBackup } from '../store.js';
import { DAYS } from '../seed.js';

let view = { name: 'list' }; // {name:'list'} | {name:'meal', id} | {name:'ing', id, from}

export function reset() { view = { name: 'list' }; }

function go(v, ctx) { view = v; window.scrollTo(0, 0); ctx.update(() => {}); }

const byName = (a, b) => a.name.localeCompare(b.name);

// Accepts "1.5" or "1,5"; returns NaN for junk.
export function parseNum(v) {
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function render(root, ctx) {
  const s = ctx.getState();
  if (view.name === 'meal' && s.meals[view.id]) return renderMeal(root, ctx, s.meals[view.id]);
  if (view.name === 'ing' && s.ingredients[view.id]) return renderIngredient(root, ctx, s.ingredients[view.id]);
  view = { name: 'list' };
  renderList(root, ctx);
}

// ---------- shared: Star Market product block ----------
// onChange(product|null, quiet): quiet=true means "save without redrawing".
export function productBlock(product, name, unit, onChange) {
  const box = h('div', { class: 'card', style: 'padding:12px 14px' });
  box.append(h('div', { class: 'sub', style: 'margin-bottom:6px' }, 'Star Market product'));
  if (product) {
    let cur = { ...product };
    box.append(
      h('div', { class: 'inline', style: 'justify-content:space-between' },
        h('span', {}, `Linked · #${product.id}`),
        h('a', { href: product.url, target: '_blank', rel: 'noopener' }, 'Open ↗')),
      h('div', { class: 'inline', style: 'margin-top:10px' },
        h('span', { class: 'sub', style: 'flex:none' }, 'One package ='),
        h('input', { type: 'number', inputMode: 'decimal', min: '0', step: 'any', value: product.packSize, class: 'amt',
          onchange: e => { const n = parseNum(e.target.value); if (n > 0) { cur = { ...cur, packSize: n }; onChange(cur, true); } } }),
        select(UNITS, product.packUnit, v => { cur = { ...cur, packUnit: v }; onChange(cur, false); })),
      h('div', { class: 'sub', style: 'margin-top:6px' }, `e.g. a dozen eggs = 12 ea. Use the same unit as the recipe (${unit || 'ea'}) so the app can count packages.`),
      h('button', { class: 'linkbtn', style: 'color:var(--danger);margin-top:6px', onclick: () => onChange(null) }, 'Remove link'));
  } else {
    const err = h('div', { class: 'err' });
    const input = h('input', { type: 'url', placeholder: 'Paste Star Market product link', autocomplete: 'off' });
    const save = () => {
      const p = parseProductLink(input.value);
      if (!p) { err.textContent = input.value ? "That isn't a Star Market product link (it should contain product-details)." : ''; return; }
      onChange({ ...p, packSize: 1, packUnit: unit || 'ea' });
    };
    input.addEventListener('change', save);
    box.append(
      h('a', { href: searchUrl(name || ''), target: '_blank', rel: 'noopener' }, `Find “${name}” on Star Market ↗`),
      h('div', { class: 'sub', style: 'margin:8px 0' }, 'Open the product, tap Share → Copy link, then paste it here.'),
      h('div', { class: 'inline' }, input, h('button', { class: 'btn small', onclick: save }, 'Link')),
      err);
  }
  return box;
}

// ---------- ingredient picker ----------
function pickIngredient(ctx, title, onPick) {
  openSheet(title, close => {
    const s = ctx.getState();
    const all = Object.values(s.ingredients).sort(byName);
    const listEl = h('div');
    const search = h('input', { type: 'search', placeholder: 'Search or type a new ingredient', autocomplete: 'off' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      listEl.innerHTML = '';
      const matches = all.filter(i => i.name.toLowerCase().includes(q));
      for (const i of matches.slice(0, 40)) {
        listEl.append(h('button', { class: 'row', onclick: () => { close(); onPick(i.id); } },
          h('span', { class: 'grow' }, i.name), h('span', { class: 'sub' }, i.section)));
      }
      const exact = all.some(i => i.name.toLowerCase() === q);
      if (q && !exact) {
        listEl.append(h('button', { class: 'btn', onclick: () => {
          const id = newId();
          const name = search.value.trim();
          ctx.update(st => { st.ingredients[id] = { id, name, unit: 'ea', section: 'Other', staple: false, product: null }; });
          close(); onPick(id, true);
        } }, `+ New ingredient “${search.value.trim()}”`));
      }
    };
    search.addEventListener('input', draw);
    draw();
    setTimeout(() => search.focus(), 50);
    return [search, h('div', { style: 'height:10px' }), listEl];
  });
}

function askName(title, initial, onDone) {
  openSheet(title, close => {
    const input = h('input', { value: initial || '', placeholder: 'Name' });
    const ok = () => { const v = input.value.trim(); if (!v) return; close(); onDone(v); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    setTimeout(() => input.focus(), 50);
    return [input, h('button', { class: 'btn', onclick: ok }, 'Save')];
  });
}

// ---------- list view ----------
function renderList(root, ctx) {
  const s = ctx.getState();
  root.append(h('h1', {}, 'My Meals'));
  for (const m of Object.values(s.meals).sort(byName)) {
    root.append(h('button', { class: 'row', onclick: () => go({ name: 'meal', id: m.id }, ctx) },
      h('span', { class: 'grow' }, m.name, h('div', { class: 'sub' }, `${m.items.length} ingredients`)),
      h('span', { class: 'chev' }, '›')));
  }
  root.append(h('button', { class: 'btn', onclick: () => askName('New meal', '', name => {
    const id = newId();
    ctx.update(st => { st.meals[id] = { id, name, items: [] }; });
    go({ name: 'meal', id }, ctx);
  }) }, '+ Add a meal'));

  // Household staples
  root.append(h('h2', {}, 'Household staples'),
    h('div', { class: 'sub', style: 'margin:-4px 0 8px' }, 'Always asked about on the shopping list, even if no meal uses them.'));
  const staples = s.householdStaples.map(id => s.ingredients[id]).filter(Boolean);
  if (staples.length) {
    root.append(h('div', { class: 'card' }, staples.map(i => h('div', { class: 'check' },
      h('span', { class: 'grow', style: 'flex:1' }, i.name),
      h('button', { class: 'linkbtn', style: 'color:var(--danger)', onclick: () => ctx.update(st => {
        st.householdStaples = st.householdStaples.filter(x => x !== i.id);
      }) }, 'Remove')))));
  }
  root.append(h('button', { class: 'btn secondary', onclick: () => pickIngredient(ctx, 'Add household staple', id => ctx.update(st => {
    if (!st.householdStaples.includes(id)) st.householdStaples.push(id);
    st.ingredients[id].staple = true;
  })) }, '+ Add household staple'));

  // Saved regulars
  root.append(h('h2', {}, 'Saved regulars'),
    h('div', { class: 'sub', style: 'margin:-4px 0 8px' }, 'Extras like coffee or paper towels. Tick them on the list when you need them.'));
  for (const r of [...s.regulars].sort(byName)) {
    root.append(h('button', { class: 'row', onclick: () => editRegular(ctx, r.id) },
      h('span', { class: 'grow' }, r.name, h('div', { class: 'sub' }, `${r.section}${r.product ? ' · linked' : ''}`)),
      h('span', { class: 'chev' }, '›')));
  }
  root.append(h('button', { class: 'btn secondary', onclick: () => askName('New regular', '', name => {
    const id = newId();
    ctx.update(st => { st.regulars.push({ id, name, section: 'Other', product: null }); });
    editRegular(ctx, id);
  }) }, '+ Add regular'));

  // All ingredients
  root.append(h('h2', {}, 'All ingredients'));
  root.append(h('div', { class: 'card' }, Object.values(s.ingredients).sort(byName).map(i =>
    h('button', { class: 'check', style: 'width:100%;text-align:left', onclick: () => go({ name: 'ing', id: i.id, from: null }, ctx) },
      h('span', { style: 'flex:1' }, i.name),
      h('span', { class: 'sub' }, i.product ? 'linked' : 'not linked'),
      h('span', { class: 'chev' }, '›')))));

  // Backup
  root.append(h('h2', {}, 'Backup'),
    h('div', { class: 'sub', style: 'margin:-4px 0 8px' }, 'Your meals live on this phone, inside this app only (Safari, Chrome and the home-screen icon each keep their own copy). Export a backup now and then and save it to Files or iCloud. To move your meals, export here and import there.'));
  const today = new Date().toISOString().slice(0, 10);
  const importErr = h('div', { class: 'err' });
  const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = importBackup(await f.text());
    e.target.value = '';
    if (!r.ok) { importErr.textContent = r.error; return; }
    if (confirm('Replace everything in the app with this backup?')) ctx.replaceState(r.state);
  } });
  root.append(
    h('button', { class: 'btn secondary', onclick: () => download(`weekly-groceries-backup-${today}.json`, exportBackup(ctx.getState())) }, 'Export backup'),
    h('button', { class: 'btn secondary', onclick: () => file.click() }, 'Import backup'),
    file, importErr);
}

function editRegular(ctx, id) {
  const close = openSheet('Regular item', () => {
    const r = ctx.getState().regulars.find(x => x.id === id);
    if (!r) return [];
    const quiet = patch => ctx.save(st => { Object.assign(st.regulars.find(x => x.id === id), patch); });
    const set = patch => { ctx.update(st => { Object.assign(st.regulars.find(x => x.id === id), patch); }); close(); editRegular(ctx, id); };
    return [
      h('label', { class: 'field' }, h('span', {}, 'Name'), h('input', { value: r.name, onchange: e => e.target.value.trim() && quiet({ name: e.target.value.trim() }) })),
      h('label', { class: 'field' }, h('span', {}, 'Store section'), select(SECTIONS, r.section, v => quiet({ section: v }))),
      productBlock(r.product, r.name, r.product?.packUnit || 'pack', (p, q) => (q ? quiet({ product: p }) : set({ product: p }))),
      h('button', { class: 'btn danger', onclick: () => {
        if (!confirm(`Delete “${r.name}”?`)) return;
        ctx.update(st => { st.regulars = st.regulars.filter(x => x.id !== id); delete st.checks.regularsIncluded[id]; });
        close();
      } }, 'Delete regular'),
      h('button', { class: 'btn secondary', onclick: () => { close(); ctx.update(() => {}); } }, 'Done'),
    ];
  });
}

// ---------- meal editor ----------
function renderMeal(root, ctx, meal) {
  const s = ctx.getState();
  root.append(
    h('button', { class: 'back', onclick: () => go({ name: 'list' }, ctx) }, '‹ My Meals'),
    h('label', { class: 'field' }, h('span', {}, 'Meal name'),
      h('input', { value: meal.name, onchange: e => { const v = e.target.value.trim(); if (v) ctx.save(st => { st.meals[meal.id].name = v; }); } })),
    h('h2', {}, 'Ingredients (for 2 servings)'));

  meal.items.forEach((item, idx) => {
    const ing = s.ingredients[item.ingredientId];
    if (!ing) return;
    root.append(h('div', { class: 'row' },
      h('button', { class: 'grow', style: 'text-align:left', onclick: () => go({ name: 'ing', id: ing.id, from: meal.id }, ctx) },
        h('div', {}, ing.name),
        h('div', { class: 'sub' }, `${ing.staple ? 'staple · ' : ''}${ing.product ? 'linked' : 'not linked'} ›`)),
      h('input', { type: 'number', inputMode: 'decimal', min: '0', step: 'any', class: 'amt', value: item.amount,
        onchange: e => {
          const n = parseNum(e.target.value);
          if (!(n >= 0)) { e.target.value = item.amount; return; }
          ctx.save(st => { const it = st.meals[meal.id].items.find(x => x.ingredientId === item.ingredientId); if (it) it.amount = n; });
        } }),
      h('span', { class: 'sub', style: 'width:38px;flex:none' }, ing.unit),
      h('button', { 'aria-label': 'Remove', style: 'color:var(--danger);padding:4px 6px;flex:none', onclick: () =>
        ctx.update(st => { st.meals[meal.id].items.splice(idx, 1); }) }, '✕')));
  });

  root.append(h('button', { class: 'btn', onclick: () => pickIngredient(ctx, 'Add ingredient', (id, isNew) => {
    ctx.update(st => {
      const m = st.meals[meal.id];
      if (!m.items.some(it => it.ingredientId === id)) m.items.push({ ingredientId: id, amount: 1 });
    });
    if (isNew) go({ name: 'ing', id, from: meal.id }, ctx);
  }) }, '+ Ingredient'));

  root.append(h('button', { class: 'btn danger', onclick: () => {
    if (!confirm(`Delete “${meal.name}”?`)) return;
    ctx.update(st => {
      delete st.meals[meal.id];
      for (const d of DAYS) if (st.week[d]?.mealId === meal.id) st.week[d] = null;
    });
    go({ name: 'list' }, ctx);
  } }, 'Delete meal'));
}

// ---------- ingredient editor ----------
function renderIngredient(root, ctx, ing) {
  const s = ctx.getState();
  const usedIn = Object.values(s.meals).filter(m => m.items.some(it => it.ingredientId === ing.id));
  const back = view.from && s.meals[view.from]
    ? h('button', { class: 'back', onclick: () => go({ name: 'meal', id: view.from }, ctx) }, `‹ ${s.meals[view.from].name}`)
    : h('button', { class: 'back', onclick: () => go({ name: 'list' }, ctx) }, '‹ My Meals');
  const set = patch => ctx.update(st => { Object.assign(st.ingredients[ing.id], patch); });

  root.append(back,
    h('label', { class: 'field' }, h('span', {}, 'Ingredient'),
      h('input', { value: ing.name, onchange: e => { const v = e.target.value.trim(); if (v) ctx.save(st => { st.ingredients[ing.id].name = v; }); } })),
    h('div', { class: 'sub' }, usedIn.length ? `Used in ${usedIn.length} meal${usedIn.length > 1 ? 's' : ''}: ${usedIn.map(m => m.name).join(', ')}` : 'Not used in any meal'),
    h('div', { class: 'inline', style: 'margin-top:10px' },
      h('label', { class: 'field', style: 'flex:1;margin:0' }, h('span', {}, 'Recipe unit'), select(UNITS, ing.unit, v => set({ unit: v }))),
      h('label', { class: 'field', style: 'flex:2;margin:0' }, h('span', {}, 'Store section'), select(SECTIONS, ing.section, v => set({ section: v })))),
    h('label', { class: 'check', style: 'margin:10px 0' },
      h('input', { type: 'checkbox', checked: ing.staple, onchange: e => set({ staple: e.target.checked }) }),
      h('span', {}, 'Staple (usually have it — ask before buying)')),
    productBlock(ing.product, ing.name, ing.unit, (p, quiet) =>
      quiet ? ctx.save(st => { st.ingredients[ing.id].product = p; }) : set({ product: p })),
    h('button', { class: 'btn danger', onclick: () => {
      if (!confirm(usedIn.length ? `Delete “${ing.name}”? It will be removed from ${usedIn.length} meal(s).` : `Delete “${ing.name}”?`)) return;
      ctx.update(st => {
        delete st.ingredients[ing.id];
        for (const m of Object.values(st.meals)) m.items = m.items.filter(it => it.ingredientId !== ing.id);
        st.householdStaples = st.householdStaples.filter(x => x !== ing.id);
      });
      go(view.from ? { name: 'meal', id: view.from } : { name: 'list' }, ctx);
    } }, 'Delete ingredient'));
}
