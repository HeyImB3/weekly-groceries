// Tiny DOM helpers shared by the screens.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function fmt(n) {
  if (n === null || n === undefined) return '';
  return String(Math.round(n * 100) / 100);
}

// Bottom sheet. build(close) returns content; returns close().
export function openSheet(title, build) {
  const root = document.getElementById('sheet-root');
  const close = () => { root.innerHTML = ''; };
  const sheet = h('div', { class: 'sheet' }, h('h3', {}, title));
  const bg = h('div', { class: 'sheet-bg', onclick: e => { if (e.target === bg) close(); } }, sheet);
  sheet.append(...[build(close)].flat().filter(x => x !== null && x !== undefined && x !== false));
  root.innerHTML = '';
  root.append(bg);
  return close;
}

export function select(options, value, onchange) {
  return h('select', { onchange: e => onchange(e.target.value) },
    options.map(o => h('option', { value: o, selected: o === value }, o)));
}

// Save a file. On iPhone, the share sheet (Save to Files) is the reliable way,
// including from the home-screen app; fall back to a normal download.
export async function download(filename, text) {
  const file = typeof File === 'function' ? new File([text], filename, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}
