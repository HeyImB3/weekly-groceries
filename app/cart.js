// Weekly Groceries cart filler. Runs on www.starmarket.com (loaded by the
// "Fill cart" bookmark) while you're signed in. It uses Star Market's own
// Add / + buttons inside a hidden frame, one product at a time, and tops each
// item up to the amount on your list (it never removes anything).
// Load the shared helpers fresh each time so updates apply right away.
const { CART_HASH_KEY, decodeCart, inCartQty } = await import(`./cart-core.js?v=${Date.now()}`);

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
  const m = location.hash.match(new RegExp(`${CART_HASH_KEY}=([A-Za-z0-9_-]+)`));
  if (m) {
    const items = decodeCart(m[1]);
    if (items) return items;
  }
  ui.status('Reading your list from the clipboard… (tap Paste if asked)');
  try {
    const clip = await Promise.race([
      navigator.clipboard.readText(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    const items = decodeCart((clip.match(new RegExp(`${CART_HASH_KEY}=([A-Za-z0-9_-]+)`)) || [])[1] || clip);
    if (items) return items;
  } catch { /* clipboard not allowed; ask instead */ }
  const pasted = prompt('Paste the cart code from the Weekly Groceries app:');
  if (!pasted) return null;
  return decodeCart((pasted.match(new RegExp(`${CART_HASH_KEY}=([A-Za-z0-9_-]+)`)) || [])[1] || pasted);
}

// Load Star Market's search page for one product in the hidden frame.
async function openProduct(frame, id) {
  frame.src = `/shop/search-results.html?q=${id}&wg=${Date.now()}`;
  return waitFor(() => {
    const d = frame.contentDocument;
    if (!d || d.readyState === 'loading') return null;
    const add = d.getElementById(`addButton_${id}`);
    const qty = d.getElementById(`qtyInfo_${id}`) || d.getElementById(`bubble_qtyInfo_${id}`);
    if (add || qty) return { d, add, qty };
    return null;
  }, 20000);
}

// Items already in the cart show a collapsed "bubble"; the stepper shows qtyInfo.
function currentQty(d, id) {
  const el = d.getElementById(`qtyInfo_${id}`) || d.getElementById(`bubble_qtyInfo_${id}`);
  return inCartQty(el?.getAttribute('aria-label'));
}

async function incButton(d, id) {
  let inc = d.getElementById(`inc_qtyInfo_${id}`);
  if (inc) return inc;
  d.getElementById(`bubble_qtyInfo_${id}`)?.click();
  inc = await waitFor(() => d.getElementById(`inc_qtyInfo_${id}`), 5000);
  return inc;
}

async function topUp(frame, item) {
  const found = await openProduct(frame, item.id);
  if (!found) return { state: 'notfound' };
  const { d, add } = found;
  if (add && /sign in/i.test(add.getAttribute('aria-label') || '')) return { state: 'signedout' };
  let cur = currentQty(d, item.id);
  const had = cur;
  if (cur >= item.qty) return { state: 'already', had };
  if (cur === 0) {
    d.getElementById(`addButton_${item.id}`)?.click();
    const ok = await waitFor(() => currentQty(d, item.id) >= 1, 10000);
    if (!ok) return { state: 'failed', had };
    cur = currentQty(d, item.id);
  }
  while (cur < item.qty) {
    const inc = await incButton(d, item.id);
    if (!inc || inc.disabled) break;
    const before = cur;
    inc.click();
    const ok = await waitFor(() => currentQty(d, item.id) > before, 10000);
    if (!ok) break;
    cur = currentQty(d, item.id);
    await wait(250);
  }
  return { state: cur >= item.qty ? 'added' : 'partial', had, now: cur };
}

export async function run() {
  if (!/(^|\.)starmarket\.com$/.test(location.hostname)) {
    alert('Open www.starmarket.com (signed in), then tap the Fill cart bookmark again.');
    return;
  }
  if (document.getElementById(PANEL_ID)) return; // already running
  const ui = panel();
  const items = await getItems(ui);
  if (!items) { ui.status("Couldn't find a cart list. In the app, tap “Build my Star Market cart” first."); return; }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1200px;border:0;opacity:0;pointer-events:none';
  document.body.append(frame);

  const results = { added: [], already: [], problems: [] };
  for (let i = 0; i < items.length; i++) {
    if (ui.cancelled) break;
    const it = items[i];
    ui.status(`Adding ${i + 1} of ${items.length}…`);
    const line = ui.line(`… ${it.name} ×${it.qty}`, '#8e8e93');
    let r;
    try { r = await topUp(frame, it); } catch { r = { state: 'failed' }; }
    if (r.state === 'signedout') {
      line.textContent = '⚠ You are signed out. Sign in to Star Market, then tap the bookmark again.';
      line.style.color = '#ffb340';
      break;
    }
    if (r.state === 'added') { line.textContent = `✓ ${it.name}: ${r.had ? `had ${r.had}, now ` : ''}${r.now}`; line.style.color = '#30d158'; results.added.push(it); }
    else if (r.state === 'already') { line.textContent = `✓ ${it.name}: already ${r.had} in cart`; line.style.color = '#30d158'; results.already.push(it); }
    else if (r.state === 'partial') { line.textContent = `⚠ ${it.name}: only got to ${r.now} of ${it.qty}`; line.style.color = '#ffb340'; results.problems.push(it); }
    else if (r.state === 'notfound') { line.textContent = `✕ ${it.name}: not found (maybe out of stock)`; line.style.color = '#ff453a'; results.problems.push(it); }
    else { line.textContent = `✕ ${it.name}: couldn't add`; line.style.color = '#ff453a'; results.problems.push(it); }
  }
  frame.remove();
  if (!ui.cancelled) {
    ui.status(`Done: ${results.added.length} added, ${results.already.length} already there, ${results.problems.length} need a look.`);
    history.replaceState(null, '', location.pathname + location.search);
    const a = document.createElement('a');
    a.href = '/erums/cart';
    a.textContent = 'Open my cart →';
    a.style.cssText = 'display:block;margin-top:10px;padding:10px;text-align:center;background:#30b45c;color:#fff;border-radius:10px;font-weight:600;text-decoration:none';
    ui.append(a);
  }
}

run();
