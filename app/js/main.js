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

const ctx = { getState, update, replaceState, showTab };

function render() {
  const root = document.getElementById('screen');
  const y = window.scrollY;
  root.innerHTML = '';
  screens[current].render(root, ctx);
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
