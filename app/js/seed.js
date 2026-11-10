// Starter data: the owner's usual meals, drafted for 2 servings.
import { newId } from './model.js';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// [name, unit, section, staple]
const INGREDIENTS = [
  ['Ramen noodles', 'ea', 'Pantry', false],
  ['Eggs', 'ea', 'Dairy & Eggs', false],
  ['Green onions', 'bunch', 'Produce', false],
  ['Soy sauce', 'tbsp', 'Pantry', true],
  ['Bread', 'slice', 'Bakery', false],
  ['Cheddar slices', 'slice', 'Dairy & Eggs', false],
  ['Butter', 'tbsp', 'Dairy & Eggs', true],
  ['Butternut squash', 'ea', 'Produce', false],
  ['Olive oil', 'tbsp', 'Pantry', true],
  ['Shredded cheese', 'cup', 'Dairy & Eggs', false],
  ['Bell pepper', 'ea', 'Produce', false],
  ['Potatoes', 'lb', 'Produce', false],
  ['Onion', 'ea', 'Produce', false],
  ['Pasta', 'oz', 'Pantry', false],
  ['Pesto', 'oz', 'Pantry', false],
  ['Silken tofu', 'oz', 'Produce', false],
  ['Parmesan', 'cup', 'Dairy & Eggs', false],
  ['Lo mein noodles', 'oz', 'Pantry', false],
  ['Frozen stir fry vegetables', 'oz', 'Frozen', false],
  ['Sesame oil', 'tbsp', 'Pantry', true],
  ['Garlic', 'ea', 'Produce', true],
];

// [meal name, [[ingredient name, amount per 2 servings], ...]]
const MEALS = [
  ['Ramen with hard boiled eggs', [['Ramen noodles', 2], ['Eggs', 4], ['Green onions', 0.5], ['Soy sauce', 2]]],
  ['Grilled cheese and butternut squash', [['Bread', 4], ['Cheddar slices', 4], ['Butter', 2], ['Butternut squash', 1], ['Olive oil', 1]]],
  ['Omelettes and home fries', [['Eggs', 6], ['Shredded cheese', 0.5], ['Bell pepper', 1], ['Potatoes', 1.5], ['Onion', 1], ['Butter', 1], ['Olive oil', 2]]],
  ['Pesto pasta with silken tofu', [['Pasta', 8], ['Pesto', 4], ['Silken tofu', 16], ['Parmesan', 0.25]]],
  ['Stir fry veggies, eggs and noodles', [['Lo mein noodles', 8], ['Eggs', 3], ['Frozen stir fry vegetables', 16], ['Soy sauce', 3], ['Sesame oil', 1], ['Garlic', 2]]],
];

export function emptyWeek() {
  return Object.fromEntries(DAYS.map(d => [d, null]));
}

export function emptyChecks() {
  return { staplesNeeded: {}, regularsIncluded: {}, done: {} };
}

export function createInitialState() {
  const ingredients = {};
  const byName = {};
  for (const [name, unit, section, staple] of INGREDIENTS) {
    const id = newId();
    ingredients[id] = { id, name, unit, section, staple, product: null };
    byName[name] = id;
  }
  const meals = {};
  for (const [name, items] of MEALS) {
    const id = newId();
    meals[id] = { id, name, items: items.map(([n, amount]) => ({ ingredientId: byName[n], amount })) };
  }
  return {
    version: 1,
    ingredients,
    meals,
    week: emptyWeek(),
    householdStaples: [],
    regulars: [],
    oneOffs: [],
    checks: emptyChecks(),
  };
}
