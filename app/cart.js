// Weekly Groceries cart filler. Runs on www.starmarket.com (loaded by the
// "Fill cart" bookmark) while you're signed in. It uses Star Market's own
// Add / + buttons inside hidden frames (a few items at a time) and tops each
// item up to the amount on your list. It never removes anything.
// Load the shared helpers fresh each time so updates apply right away.
const { decodeCart, inCartQty, findCartCode, readCartSnapshot, snapshotIsFresh, parseSize, parseUnitPrice, pickSubstitute, searchTermFor } =
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

// Star Market's own copy of the cart. Only trusted when the site refreshed it
// after this page loaded (it can be stale if you changed the cart elsewhere).
const PAGE_START = Math.round(performance.timeOrigin || Date.now());
// The cart page fetches your cart from Star Market's servers when it loads;
// once that has come back, the copy reflects the real cart.
function cartFetchedThisPage() {
  try {
    return performance.getEntriesByType('resource')
      .some(e => /cartservice\/api\/v2\/cart\/customer\//.test(e.name) && e.responseEnd > 0);
  } catch { return false; }
}
function knownQty(id) {
  try {
    const raw = localStorage.getItem('abCart');
    if (!cartFetchedThisPage() && !snapshotIsFresh(raw, PAGE_START)) return null;
    const snap = readCartSnapshot(raw);
    return snap.has(id) ? snap.get(id).qty : 0;
  } catch { return null; }
}

// Has the page's product search request come back? (Lets us tell "no results"
// apart from "Star Market's search is still loading / not responding".)
function searchDone(frame) {
  try {
    return frame.contentWindow.performance.getEntriesByType('resource')
      .some(e => /pgmsearch\/v1\/search\/products/.test(e.name) && e.responseEnd > 0);
  } catch { return false; }
}

const anyResult = doc => doc.querySelector('[id^="addButton_"], [id^="bubble_qtyInfo_"], [id^="qtyInfo_"]');

// Load a Star Market search page in a hidden frame. Waits for the NEW page
// (never reads the previous one), then until `ready(d)` holds, or until the
// search has come back and settled. Resolves { d, empty } or null if Star
// Market never answered.
async function openSearch(frame, query, ready = () => false) {
  const oldDoc = frame.contentDocument;
  frame.src = `/shop/search-results.html?q=${encodeURIComponent(query)}`;
  let doneAt = 0;
  return waitFor(() => {
    const d = frame.contentDocument;
    if (!d || d === oldDoc || d.readyState === 'loading') return null;
    let q = null;
    try { q = new URL(frame.contentWindow.location.href).searchParams.get('q'); } catch { /* not ready */ }
    if (q !== query) return null;
    if (ready(d)) return { d, empty: false };
    if (searchDone(frame)) {
      doneAt = doneAt || Date.now();
      if (Date.now() - doneAt > 1500) return { d, empty: !anyResult(d) };
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

// How many cart-change requests this frame's page has finished.
function cartWrites(frame) {
  try {
    return frame.contentWindow.performance.getEntriesByType('resource')
      .filter(e => /cartservice\/api\/v2\/cart\/items/.test(e.name) && e.responseEnd > 0).length;
  } catch { return 0; }
}

// Cart changes go one at a time across all frames: when several frames changed
// the cart at once, Star Market's server silently dropped some changes.
let chain = Promise.resolve();
function oneAtATime(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

// Click a cart button and wait until the page shows the change AND Star
// Market's server has answered the request.
function clickAndConfirm(frame, button, check) {
  return oneAtATime(async () => {
    const before = cartWrites(frame);
    button.click();
    const ok = await waitFor(() => check() && cartWrites(frame) > before, 12000);
    await wait(150);
    return !!ok;
  });
}

// Bring one product (already shown on the frame's page) up to `want(had)` units.
// `known` = fresh cart-copy quantity, or null when we don't know.
async function fillOnPage(frame, id, want, known, cancelled) {
  const d = frame.contentDocument;
  const add = addBtn(d, id);
  if (add && /sign in/i.test(add.getAttribute('aria-label') || '')) return { state: 'signedout' };
  // The page briefly shows "Add" before it knows what's in the cart. Unless the
  // cart copy says it's not there, give it a moment so we never double an item.
  if (add && known !== 0) await waitFor(() => qtyEl(d, id), 3000);
  if (!qtyEl(d, id) && known > 0) return { state: 'failed', had: known }; // page and cart disagree: don't guess
  let cur = qtyEl(d, id) ? pageQty(d, id) : 0;
  const had = cur;
  const target = want(had);
  if (cur >= target) return { state: 'already', had, target };
  if (cur === 0) {
    const b = addBtn(d, id);
    if (!b) return { state: 'failed', had, target };
    if (!(await clickAndConfirm(frame, b, () => pageQty(d, id) >= 1))) return { state: 'failed', had, target };
    cur = pageQty(d, id);
  }
  while (cur < target && !cancelled()) {
    const inc = await incButton(d, id);
    if (!inc || inc.disabled) break;
    const before = cur;
    if (!(await clickAndConfirm(frame, inc, () => pageQty(d, id) > before))) break;
    cur = pageQty(d, id);
  }
  return { state: cur >= target ? 'added' : 'partial', had, now: cur, target };
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

const outOfStock = (d, id) => /out of stock/i.test(d.getElementById(`pg${id}container`)?.innerText || '');

// Returns a result; `id`/`target` say which product should end up at what quantity.
// ctx: { claimed: Set of product ids in use (list items + chosen substitutes), cancelled() }
async function topUp(frame, item, ctx) {
  const known = knownQty(item.id);
  if (known != null && known >= item.qty) return { state: 'already', had: known, id: item.id, target: item.qty };

  // Searching by product number shows just that product (or nothing if it's gone).
  const r1 = await openSearch(frame, item.id, doc => shown(doc, item.id) || outOfStock(doc, item.id));
  if (!r1) return { state: 'timeout' };
  if (shown(r1.d, item.id)) {
    const r = await fillOnPage(frame, item.id, () => item.qty, known, ctx.cancelled);
    return { ...r, id: item.id, target: item.qty };
  }
  const oos = outOfStock(r1.d, item.id);
  if (ctx.cancelled()) return { state: 'cancelled' };

  // Not available: look for a fair substitute by name (wait for the full results).
  const r2 = await openSearch(frame, searchTermFor(item));
  if (!r2) return { state: 'timeout' };
  const sub = r2.empty ? null : pickSubstitute(item, candidates(r2.d), ctx.claimed);
  if (!sub) return { state: 'notfound', oos };
  ctx.claimed.add(sub.id); // claim it right away so no other frame touches it
  // Keep about the same amount if the substitute's size differs.
  const oSize = parseSize(item.title), sSize = parseSize(sub.name);
  const qty = oSize && sSize && oSize.unit === sSize.unit
    ? Math.max(1, Math.ceil(item.qty * oSize.value / sSize.value - 0.05))
    : item.qty;
  // Add on top of whatever of the substitute is already in the cart.
  const r = await fillOnPage(frame, sub.id, had => had + qty, knownQty(sub.id), ctx.cancelled);
  return { ...r, sub: { ...sub, qty }, oos, id: sub.id };
}

// Reload the real cart from Star Market (in a frame) and return {id: qty}.
// null if the cart couldn't be loaded.
async function realCart(frame) {
  const oldDoc = frame.contentDocument;
  frame.src = '/erums/cart';
  const ok = await waitFor(() => {
    if (!frame.contentDocument || frame.contentDocument === oldDoc) return false;
    try {
      return frame.contentWindow.performance.getEntriesByType('resource')
        .some(e => /cartservice\/api\/v2\/cart\/customer\//.test(e.name) && e.responseEnd > 0);
    } catch { return false; }
  }, 20000);
  if (!ok) return null;
  await wait(1000);
  return readCartSnapshot(localStorage.getItem('abCart'));
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
    if (r.state === 'added') {
      set(`↻ ${it.name}: ${r.oos ? 'out of stock' : 'not available'}, swapped for ${s.name} ($${s.price.toFixed(2)}) ×${s.qty}`, YELLOW);
      return 'swapped';
    }
    return problem(`✕ ${it.name}: not available; couldn't add substitute ${s.name} `);
  }
  if (r.state === 'added') { set(`✓ ${it.name}: ${r.had ? `had ${r.had}, now ` : ''}${r.now}`, GREEN); return 'added'; }
  if (r.state === 'already') { set(`✓ ${it.name}: already ${r.had} in cart`, GREEN); return 'already'; }
  if (r.state === 'partial') {
    set(`⚠ ${it.name}: stopped at ${r.now} of ${r.target ?? it.qty} (store limit or slow response) `, YELLOW);
    line.append(findLink(it));
    return 'problem';
  }
  if (r.state === 'notfound') return problem(`✕ ${it.name}: ${r.oos ? 'out of stock' : 'not available'}, and no good-value substitute found `);
  if (r.state === 'timeout') return problem(`✕ ${it.name}: Star Market didn't respond `);
  return problem(`✕ ${it.name}: couldn't add `);
}

export async function run() {
  if (!/(^|\.)starmarket\.com$/.test(location.hostname)) {
    alert('Open www.starmarket.com (signed in), then click the Fill cart bookmark again.');
    return;
  }
  if (window.__wgCartRunning) return; // a run is already going (even if its panel was closed)
  window.__wgCartRunning = true;
  try { await fill(); } finally { window.__wgCartRunning = false; }
}

async function fill() {
  const ui = panel();
  const items = await getItems(ui);
  if (!items) { ui.status("Couldn't find a cart list. In the app, click “Build my Star Market cart” first."); return; }

  const lines = items.map(it => ui.line(`… ${it.name} ×${it.qty}`, '#8e8e93'));
  // Every product on the list is "claimed" so a substitute never doubles up on one.
  const ctx = { claimed: new Set(items.map(it => it.id)), cancelled: () => ui.cancelled };
  const results = [];
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
      try { r = await topUp(frame, it, ctx); } catch { r = { state: 'failed' }; }
      if (ui.cancelled) return;
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
      results[i] = r;
      counts[report(line, it, r)]++;
      finished++;
      show();
    }
  }

  const t0 = Date.now();
  await Promise.all(frames.map(worker));

  // Final check: reload the real cart from Star Market and compare with the list.
  // Anything short gets one more try; the panel then shows what's really there.
  let verified = false;
  if (!ui.cancelled && !signedOut && !siteDown) {
    const frame = frames[0];
    const shortOf = cart => results.map((r, i) => ({ r, i }))
      .filter(({ r }) => r && r.id && r.target > 0 && (cart.get(r.id)?.qty || 0) < r.target);
    ui.status('Double-checking your cart with Star Market…');
    let cart = await realCart(frame);
    if (cart) {
      for (const { r, i } of shortOf(cart)) {
        if (ui.cancelled) break;
        lines[i].textContent = `⏳ ${items[i].name}: retrying`;
        const s = await openSearch(frame, r.id, doc => shown(doc, r.id));
        if (s) await fillOnPage(frame, r.id, () => r.target, cart.get(r.id)?.qty || 0, () => ui.cancelled);
      }
      cart = await realCart(frame);
    }
    if (cart) {
      verified = true;
      const missing = new Set(shortOf(cart).map(x => x.i));
      results.forEach((r, i) => {
        if (!r || !r.id || !(r.target > 0)) return;
        const have = cart.get(r.id)?.qty || 0;
        if (missing.has(i)) {
          lines[i].textContent = `⚠ ${items[i].name}: your cart has ${have} of ${r.target} `;
          lines[i].style.color = YELLOW;
          lines[i].append(findLink(items[i]));
        } else if (!r.sub) {
          lines[i].textContent = `✓ ${items[i].name}: ${have} in cart`;
          lines[i].style.color = GREEN;
        }
      });
      const tally = { ok: 0, swapped: 0, problem: 0 };
      results.forEach((r, i) => {
        if (!r || !r.id || !(r.target > 0)) tally.problem++;
        else if (missing.has(i)) tally.problem++;
        else if (r.sub) tally.swapped++;
        else tally.ok++;
      });
      counts.verified = tally;
    }
  }
  frames.forEach(f => f.remove());
  const forget = () => { history.replaceState(null, '', location.pathname + location.search); window.name = ''; };
  if (ui.cancelled) { forget(); return; }
  if (siteDown) {
    ui.status("Star Market's search isn't responding right now, so nothing was changed. This usually clears within the hour (Star Market briefly slows down very busy sessions). Reload this page and try again later, or add items by hand.");
    return;
  }
  if (!ui.cancelled && !signedOut) {
    let parts;
    if (verified) {
      const v = counts.verified;
      parts = [`${v.ok} of ${items.length} in your cart (checked with Star Market)`];
      if (v.swapped) parts.push(`${v.swapped} swapped (yellow, check them)`);
      if (v.problem) parts.push(`${v.problem} need a look`);
    } else {
      parts = [`${counts.added} added`, `${counts.already} already there`];
      if (counts.swapped) parts.push(`${counts.swapped} swapped (yellow, check them)`);
      if (counts.problem) parts.push(`${counts.problem} need a look`);
      parts.push("couldn't double-check the cart, so open it to be sure");
    }
    ui.status(`Done in ${Math.round((Date.now() - t0) / 1000)}s: ${parts.join(', ')}.`);
    forget();
    const a = document.createElement('a');
    a.href = '/erums/cart';
    a.textContent = 'Open my cart →';
    a.style.cssText = 'display:block;margin-top:10px;padding:10px;text-align:center;background:#30b45c;color:#fff;border-radius:10px;font-weight:600;text-decoration:none';
    ui.append(a);
  }
}

run();
