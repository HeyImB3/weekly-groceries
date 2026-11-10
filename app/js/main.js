import { loadState, saveState } from './store.js';
import * as meals from './ui/meals.js';
import * as week from './ui/week.js';
import * as list from './ui/list.js';

const screens = { meals, week, list };
let state = loadState(localStorage);
let current = 'week';
try { current = sessionStorage.getItem('wg-tab') || 'week'; } catch {}
if (!screens[current]) current = 'week';

export function getState() { return state; }

export function replaceState(next) {
  state = next;
  saveState(localStorage, state);
  render();
}

export function update(mutator) {
  mutator(state);
  saveState(localStorage, state);
  render();
}

export function showTab(name) {
  current = name;
  try { sessionStorage.setItem('wg-tab', name); } catch {}
  window.scrollTo(0, 0);
  render();
}

// Save a change without redrawing the screen (used while typing, so the
// keyboard and focus stay put on iPhone).
export function save(mutator) {
  mutator(state);
  saveState(localStorage, state);
}

const ctx = { getState, update, save, replaceState, showTab };

function render() {
  const root = document.getElementById('screen');
  const y = window.scrollY;
  root.innerHTML = '';
  try {
    screens[current].render(root, ctx);
  } catch (err) {
    console.error(err);
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Something went wrong showing this screen. Your data is still saved.';
    const fix = document.createElement('button');
    fix.className = 'btn secondary';
    fix.textContent = 'Clean up saved data and retry';
    fix.addEventListener('click', () => {
      try { localStorage.setItem('weekly-groceries-v1-rescue', JSON.stringify(state)); } catch {}
      replaceState(loadState({ getItem: () => JSON.stringify(state) }));
    });
    root.append(p, fix);
  }
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === current);
  window.scrollTo(0, y);
}

for (const b of document.querySelectorAll('#tabs button')) {
  b.addEventListener('click', () => {
    if (b.dataset.tab === current && screens[current].reset) screens[current].reset();
    showTab(b.dataset.tab);
  });
}

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
