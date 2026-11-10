// Weekly Groceries cart filler. Runs on www.starmarket.com (loaded by the
// "Fill cart" bookmark) while you're signed in. It uses Star Market's own
// Add / + buttons inside hidden frames (a few items at a time) and tops each
// item up to the amount on your list. It never removes anything.
// Load the shared helpers fresh each time so updates apply right away.
const { decodeCart, inCartQty, findCartCode, readCartSnapshot, parseSize, parseUnitPrice, pickSubstitute, searchTermFor } =
  await import(`./cart-core.js?v=${Date.now()}`);

const WORKERS_MAX = 4;

const PANEL_ID = 'wg-cart-panel';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, ms = 15000, step = 250) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    let v = null;
    try { v = fn(); } catch { /* frame still loading */ }
    if (v) return v;
    await wait(step);
  }
  return null;
}

function panel() {
  document.getElementById(PANEL_ID)?.remove();
  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'left:8px', 'right:8px', 'bottom:8px', 'max-height:70vh', 'overflow:auto',
    'background:#111', 'color:#f2f2f7', 'border-radius:14px', 'padding:14px 16px', 'box-shadow:0 8px 30px rgba(0,0,0,.5)',
    'font:15px/1.4 -apple-system,system-ui,sans-serif',
  ].join(';');
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:17px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
  title.textContent = '🧺 Weekly Groceries';
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'background:none;border:0;color:#8e8e93;font-size:20px';
  title.append(close);
  const status = document.createElement('div');
  status.style.cssText = 'color:#8e8e93;margin-bottom:8px';
  const list = document.createElement('div');
  el.append(title, status, list);
  document.body.append(el);
  let cancelled = false;
  close.onclick = () => { cancelled = true; el.remove(); };
  return {
    status: t => { status.textContent = t; },
    line: (text, color) => {
      const d = document.createElement('div');
      d.style.cssText = `padding:3px 0;border-top:1px solid #2c2c2e;color:${color || '#f2f2f7'}`;
      d.textContent = text;
      list.append(d);
      return d;
    },
    append: node => el.append(node),
    get cancelled() { return cancelled; },
  };
}

async function getItems(ui) {
  // 1) the link's # part, 2) the tab name the app gave this tab (survives redirects)
  for (const source of [location.hash, window.name]) {
    const code = findCartCode(source);
    if (code) return decodeCart(code);
  }
  ui.status('Reading your list from the clipboard… (tap Paste if asked)');
  try {
    const clip = await Promise.race([
      navigator.clipboard.readText(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    const code = findCartCode(clip);
    if (code) return decodeCart(code);
  } catch { /* clipboard not allowed; ask instead */ }
  const pasted = prompt('Paste the cart code from the Weekly Groceries app (Ctrl+V / long-press → Paste):');
  const code = findCartCode(pasted);
  return code ? decodeCart(code) : null;
}

// Star Market's own copy of the cart (kept up to date by the site in this browser).
function cartSnapshot() {
  try { return readCartSnapshot(localStorage.getItem('abCart')); } catch { return new Map(); }
}
function haveSnapshot() {
  try { return !!localStorage.getItem('abCart'); } catch { return false; }
}

// Has the page's product search request come back? (Lets us tell "no results"
// apart from "Star Market's search is still loading / not responding".)
function searchDone(frame) {
  try {
    return frame.contentWindow.performance.getEntriesByType('resource')
      .some(e => /pgmsearch\/v1\/search\/products/.test(e.name) && e.responseEnd > 0);
  } catch { return false; }
}

// Load a Star Market search page in a hidden frame.
// Resolves { d, empty } once `ready(d)` holds (empty=false) or the search came
// back with nothing matching (empty=true); null if Star Market never answered.
async function openSearch(frame, query, ready) {
  frame.src = `/shop/search-results.html?q=${encodeURIComponent(query)}`;
  let doneAt = 0;
  return waitFor(() => {
    const d = frame.contentDocument;
    if (!d || d.readyState === 'loading' || !/search-results/.test(frame.contentWindow.location.href)) return null;
    if (ready(d)) return { d, empty: false };
    if (searchDone(frame)) {
      doneAt = doneAt || Date.now();
      if (Date.now() - doneAt > 1500) return { d, empty: true };
    }
    return null;
  }, 20000);
}

const addBtn = (d, id) => d.getElementById(`addButton_${id}`);
const qtyEl = (d, id) => d.getElementById(`qtyInfo_${id}`) || d.getElementById(`bubble_qtyInfo_${id}`);
const shown = (d, id) => addBtn(d, id) || qtyEl(d, id);

// Items already in the cart show a collapsed "bubble"; the stepper shows qtyInfo.
function pageQty(d, id) {
  return inCartQty(qtyEl(d, id)?.getAttribute('aria-label'));
}

async function incButton(d, id) {
  let inc = d.getElementById(`inc_qtyInfo_${id}`);
  if (inc) return inc;
  d.getElementById(`bubble_qtyInfo_${id}`)?.click();
  return waitFor(() => d.getElementById(`inc_qtyInfo_${id}`), 5000);
}

// Bring one product (already on the loaded page `d`) up to `target`.
// `known` is the quantity Star Market's cart copy says is there (or null).
async function fillOnPage(d, id, target, known) {
  const add = addBtn(d, id);
  if (add && /sign in/i.test(add.getAttribute('aria-label') || '')) return { state: 'signedout' };
  // Without a cart copy, the page briefly shows "Add" before it knows what's in
  // the cart; give it a moment so we never double an item.
  if (known == null && add) await waitFor(() => qtyEl(d, id), 3000);
  let cur = Math.max(pageQty(d, id), known || 0);
  const had = cur;
  if (cur >= target) return { state: 'already', had };
  if (pageQty(d, id) === 0) {
    const b = addBtn(d, id);
    if (!b) return { state: 'failed', had };
    b.click();
    if (!(await waitFor(() => pageQty(d, id) >= 1, 10000))) return { state: 'failed', had };
    cur = pageQty(d, id);
  }
  while (cur < target) {
    const inc = await incButton(d, id);
    if (!inc || inc.disabled) break;
    const before = cur;
    inc.click();
    if (!(await waitFor(() => pageQty(d, id) > before, 10000))) break;
    cur = pageQty(d, id);
  }
  return { state: cur >= target ? 'added' : 'partial', had, now: cur };
}

// Read the products shown on a search page, for picking a substitute.
function candidates(d) {
  const ids = new Set([...d.querySelectorAll('[id^="addButton_"], [id^="bubble_qtyInfo_"], [id^="qtyInfo_"]')]
    .map(e => (e.id.match(/(\d{6,})$/) || [])[1]).filter(Boolean));
  return [...ids].map(id => {
    const priceText = d.getElementById(`pg${id}price`)?.innerText || '';
    const m = priceText.match(/\$\s*([\d.]+)/);
    return {
      id,
      name: (d.getElementById(`pg${id}`)?.innerText || '').trim(),
      price: m ? Number(m[1]) : 0,
      unitPrice: parseUnitPrice(d.getElementById(`pg${id}unitPer`)?.innerText || ''),
    };
  }).filter(c => c.name);
}

const anyResult = doc => doc.querySelector('[id^="addButton_"], [id^="bubble_qtyInfo_"], [id^="qtyInfo_"]');

async function topUp(frame, item) {
  const snap = cartSnapshot();
  const known = snap.has(item.id) ? snap.get(item.id).qty : (haveSnapshot() ? 0 : null);
  if (known != null && known >= item.qty) return { state: 'already', had: known };

  // Searching by product number shows just that product (or nothing if it's gone).
  const r1 = await openSearch(frame, item.id, doc => shown(doc, item.id) || anyResult(doc));
  if (!r1) return { state: 'timeout' };
  if (shown(r1.d, item.id)) return fillOnPage(r1.d, item.id, item.qty, known);

  // Not available: look for a fair substitute by name.
  const r2 = await openSearch(frame, searchTermFor(item), anyResult);
  if (!r2) return { state: 'timeout' };
  if (r2.empty) return { state: 'notfound' };
  const d2 = r2.d;
  await wait(600); // let prices render
  const sub = pickSubstitute(item, candidates(d2));
  if (!sub) return { state: 'notfound' };
  // Keep about the same amount if the substitute's size differs.
  const oSize = parseSize(item.title), sSize = parseSize(sub.name);
  const qty = oSize && sSize && oSize.unit === sSize.unit
    ? Math.max(1, Math.ceil(item.qty * oSize.value / sSize.value - 0.05))
    : item.qty;
  const snap2 = cartSnapshot();
  const subKnown = snap2.has(sub.id) ? snap2.get(sub.id).qty : (haveSnapshot() ? 0 : null);
  const r = await fillOnPage(d2, sub.id, qty, subKnown);
  return { ...r, sub: { ...sub, qty } };
}

// One-click search for an item that couldn't be added.
function findLink(item) {
  const a = document.createElement('a');
  a.href = `/shop/search-results.html?q=${encodeURIComponent(searchTermFor(item))}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Find it ↗';
  a.style.cssText = 'color:#4da3ff;margin-left:6px;text-decoration:underline';
  return a;
}

const GREEN = '#30d158', YELLOW = '#ffd60a', RED = '#ff453a';

// Write the result on the item's line; returns which tally it counts toward.
function report(line, it, r) {
  const set = (text, color) => { line.textContent = text; line.style.color = color; };
  const problem = text => { set(text, RED); line.append(findLink(it)); return 'problem'; };
  if (r.sub) {
    const s = r.sub;
    if (r.state === 'added' || r.state === 'already') {
      set(`↻ ${it.name}: not available, swapped for ${s.name} ($${s.price.toFixed(2)}) ×${s.qty}`, YELLOW);
      return 'swapped';
    }
    return problem(`✕ ${it.name}: not available; couldn't add substitute ${s.name} `);
  }
  if (r.state === 'added') { set(`✓ ${it.name}: ${r.had ? `had ${r.had}, now ` : ''}${r.now}`, GREEN); return 'added'; }
  if (r.state === 'already') { set(`✓ ${it.name}: already ${r.had} in cart`, GREEN); return 'already'; }
  if (r.state === 'partial') {
    set(`⚠ ${it.name}: only got to ${r.now} of ${it.qty} (store limit?) `, YELLOW);
    line.append(findLink(it));
    return 'problem';
  }
  if (r.state === 'notfound') return problem(`✕ ${it.name}: not available, and no good-value substitute found `);
  if (r.state === 'timeout') return problem(`✕ ${it.name}: Star Market didn't respond `);
  return problem(`✕ ${it.name}: couldn't add `);
}

export async function run() {
  if (!/(^|\.)starmarket\.com$/.test(location.hostname)) {
    alert('Open www.starmarket.com (signed in), then click the Fill cart bookmark again.');
    return;
  }
  if (document.getElementById(PANEL_ID)) return; // already running
  const ui = panel();
  const items = await getItems(ui);
  if (!items) { ui.status("Couldn't find a cart list. In the app, click “Build my Star Market cart” first."); return; }

  const lines = items.map(it => ui.line(`… ${it.name} ×${it.qty}`, '#8e8e93'));
  const counts = { added: 0, already: 0, swapped: 0, problem: 0 };
  let next = 0, finished = 0, signedOut = false, answered = 0, timeouts = 0, siteDown = false;
  const show = () => ui.status(`Adding… ${finished} of ${items.length} done`);
  show();

  // A few items at once, each in its own hidden frame. Kept small so we stay a
  // gentle visitor on Star Market's site.
  const frames = Array.from({ length: Math.min(WORKERS_MAX, items.length) }, () => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    // On-screen but invisible: iPhone browsers may not load off-screen frames.
    f.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:2147483646';
    document.body.append(f);
    return f;
  });

  async function worker(frame) {
    while (!ui.cancelled && !signedOut && !siteDown && next < items.length) {
      const i = next++;
      const it = items[i], line = lines[i];
      line.textContent = `⏳ ${it.name} ×${it.qty}`;
      let r;
      try { r = await topUp(frame, it); } catch { r = { state: 'failed' }; }
      if (r.state === 'timeout') timeouts++; else answered++;
      // If Star Market's search isn't answering at all, stop instead of waiting on every item.
      if (timeouts >= 2 && answered === 0) {
        siteDown = true;
        line.textContent = `… ${it.name} ×${it.qty}`;
        line.style.color = '#8e8e93';
        return;
      }
      if (r.state === 'signedout') {
        signedOut = true;
        line.textContent = '⚠ You are signed out. Sign in to Star Market, then click the bookmark again.';
        line.style.color = YELLOW;
        return;
      }
      counts[report(line, it, r)]++;
      finished++;
      show();
    }
  }

  const t0 = Date.now();
  await Promise.all(frames.map(worker));
  frames.forEach(f => f.remove());
  if (siteDown) {
    ui.status("Star Market's search isn't responding right now, so nothing was changed. Try again in a few minutes (reload this page first).");
    return;
  }
  if (!ui.cancelled && !signedOut) {
    const parts = [`${counts.added} added`, `${counts.already} already there`];
    if (counts.swapped) parts.push(`${counts.swapped} swapped (yellow, check them)`);
    if (counts.problem) parts.push(`${counts.problem} need a look`);
    ui.status(`Done in ${Math.round((Date.now() - t0) / 1000)}s: ${parts.join(', ')}.`);
    history.replaceState(null, '', location.pathname + location.search);
    window.name = '';
    const a = document.createElement('a');
    a.href = '/erums/cart';
    a.textContent = 'Open my cart →';
    a.style.cssText = 'display:block;margin-top:10px;padding:10px;text-align:center;background:#30b45c;color:#fff;border-radius:10px;font-weight:600;text-decoration:none';
    ui.append(a);
  }
}

run();
