// This Week tab: one meal per day with servings.
import { h, openSheet } from './dom.js';
import { DAYS } from '../seed.js';
import { resetWeek } from '../store.js';

const LABEL = { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN' };

function pickMeal(ctx, day) {
  openSheet(`Meal for ${LABEL[day]}`, close => {
    const s = ctx.getState();
    const set = mealId => {
      ctx.update(st => { st.week[day] = mealId ? { mealId, servings: st.week[day]?.servings || 2 } : null; });
      close();
    };
    return [
      ...Object.values(s.meals).sort((a, b) => a.name.localeCompare(b.name)).map(m =>
        h('button', { class: 'row', onclick: () => set(m.id) },
          h('span', { class: 'grow' }, m.name), s.week[day]?.mealId === m.id ? h('span', { style: 'color:var(--accent)' }, '✓') : null)),
      h('button', { class: 'btn secondary', onclick: () => set(null) }, 'No meal'),
    ];
  });
}

function pickServings(ctx, day) {
  openSheet(`Servings for ${LABEL[day]}`, close => {
    const cur = ctx.getState().week[day]?.servings || 2;
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px' });
    for (let n = 1; n <= 12; n++) {
      grid.append(h('button', { class: 'btn small' + (n === cur ? '' : ' secondary'), style: 'width:100%', onclick: () => {
        ctx.update(st => { if (st.week[day]) st.week[day].servings = n; });
        close();
      } }, String(n)));
    }
    return [h('div', { class: 'sub', style: 'margin-bottom:10px' }, '2 = dinner for two. Pick more for leftovers.'), grid];
  });
}

export function render(root, ctx) {
  const s = ctx.getState();
  root.append(h('h1', {}, 'This Week'));
  for (const day of DAYS) {
    const plan = s.week[day];
    const meal = plan && s.meals[plan.mealId];
    root.append(h('div', { class: 'row' },
      h('button', { class: 'grow', style: 'text-align:left', onclick: () => pickMeal(ctx, day) },
        h('div', { class: 'day' }, LABEL[day]),
        meal ? h('div', {}, meal.name) : h('div', { class: 'sub' }, '+ pick a meal')),
      meal ? h('button', { class: 'pill', 'aria-label': 'Servings', onclick: () => pickServings(ctx, day) }, String(plan.servings)) : null));
  }
  root.append(h('div', { class: 'sub' }, 'Green number = servings. Tap it to change.'));
  root.append(h('button', { class: 'btn', onclick: () => ctx.showTab('list') }, 'See shopping list'));
  root.append(h('button', { class: 'btn secondary', onclick: () => {
    if (confirm('Start a new week? This clears the days, ticks, and one-off extras. Your meals stay.')) ctx.replaceState(resetWeek(ctx.getState()));
  } }, 'Start new week'));
}
