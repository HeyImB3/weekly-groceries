// Starter data: the owner's usual meals for 2 servings, linked to the Star
// Market products from their Nov 9, 2026 order. Store brands are preferred
// (Signature Select / Lucerne / O Organics) to save money, except De Cecco
// spaghetti and Dave's Killer Bread, which the owner chose to keep.
import { newId, productUrl } from './model.js';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const p = (id, packSize, packUnit) => ({ id, url: productUrl(id), packSize, packUnit });

// [name, unit, section, staple, product]
const INGREDIENTS = [
  ['Ramen noodles', 'ea', 'Pantry', false, p('971312518', 4, 'ea')],        // Momofuku Sesame Miso Noodles 4 ct
  ['Eggs', 'ea', 'Dairy & Eggs', false, p('970055145', 18, 'ea')],          // Lucerne Cage Free Brown Large 18 ct
  ['Green onions', 'bunch', 'Produce', false, p('184380096', 1, 'bunch')],  // Green Onions 1 bunch
  ['Soy sauce', 'tbsp', 'Pantry', true, p('960069780', 20, 'tbsp')],        // Signature SELECT Less Sodium Soy Sauce 10 fl oz
  ['Bread', 'slice', 'Bakery', false, p('960038380', 16, 'slice')],         // Dave's Killer Bread 21 Whole Grains 27 oz (owner's pick)
  ['Shredded cheddar', 'oz', 'Dairy & Eggs', false, p('960109671', 7, 'oz')], // Lucerne Finely Shredded Extra Sharp Cheddar 7 oz
  ['Butter', 'tbsp', 'Dairy & Eggs', true, null],
  ['Butternut squash', 'ea', 'Produce', false, p('184560042', 1, 'ea')],
  ['Olive oil', 'tbsp', 'Pantry', true, null],
  ['Fajita vegetables (peppers & onions)', 'oz', 'Frozen', false, p('971076545', 14, 'oz')], // Signature Select Fajita Vegetables 14 oz
  ['Potatoes', 'lb', 'Produce', false, p('184500035', 5, 'lb')],            // Signature Farms Russet Potatoes 5 lb
  ['Spaghetti', 'oz', 'Pantry', false, p('128250110', 16, 'oz')],           // De Cecco No. 12 Spaghetti 1 lb (owner's pick)
  ['Pesto', 'oz', 'Pantry', false, p('970306325', 8.3, 'oz')],              // Signature SELECT Pesto Sauce 8.3 oz
  ['Silken tofu', 'oz', 'Produce', false, p('960098954', 16, 'oz')],        // O Organics Tofu Silken 16 oz
  ['Rice vermicelli noodles', 'pack', 'Pantry', false, p('960436455', 1, 'pack')], // A Taste of Thai Vermicelli 8.8 oz
  ['Extra firm tofu', 'ea', 'Produce', false, p('960027626', 1, 'ea')],    // O Organics Tofu Extra Firm 14 oz
  ['Green beans', 'ea', 'Produce', false, p('184270078', 1, 'ea')],        // sold by weight; 1 = about 1 lb
  ['Vegetable bouillon', 'tbsp', 'Pantry', true, p('960014610', 1, 'tbsp')], // Better Than Bouillon Seasoned Vegetable 8 oz
  ['Coconut cream', 'ea', 'Pantry', false, p('960202723', 1, 'ea')],       // Thai Kitchen Unsweetened Coconut Cream
  ['Sesame oil', 'tbsp', 'Pantry', true, null],
  ['Garlic', 'ea', 'Produce', true, null],
];

// [meal name, [[ingredient name, amount per 2 servings], ...]]
const MEALS = [
  ['Ramen with hard boiled eggs', [['Ramen noodles', 2], ['Eggs', 4], ['Extra firm tofu', 2], ['Green beans', 0.5], ['Vegetable bouillon', 2], ['Green onions', 0.5], ['Soy sauce', 2]]],
  ['Grilled cheese and butternut squash soup', [['Bread', 4], ['Shredded cheddar', 4], ['Butter', 2], ['Butternut squash', 1], ['Coconut cream', 1], ['Vegetable bouillon', 1], ['Olive oil', 1]]],
  ['Omelettes and home fries', [['Eggs', 6], ['Shredded cheddar', 4], ['Fajita vegetables (peppers & onions)', 7], ['Potatoes', 1.5], ['Butter', 1], ['Olive oil', 2]]],
  ['Pesto pasta with silken tofu', [['Spaghetti', 16], ['Pesto', 8.3], ['Silken tofu', 16]]],
  ['Stir fry veggies, eggs and noodles', [['Rice vermicelli noodles', 2], ['Eggs', 3], ['Extra firm tofu', 2], ['Green beans', 0.5], ['Fajita vegetables (peppers & onions)', 14], ['Soy sauce', 3], ['Sesame oil', 1], ['Garlic', 2]]],
];

// Extras from the Nov 9 order that aren't tied to a meal. [name, section, product]
const REGULARS = [
  ['Bananas', 'Produce', p('184060007', 1, 'ea')],
  ['Extra firm tofu (snacks)', 'Produce', p('960027626', 1, 'ea')],        // O Organics Tofu Extra Firm 14 oz
  ['Crushed red pepper', 'Pantry', p('970054745', 1, 'ea')],
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
  for (const [name, unit, section, staple, product] of INGREDIENTS) {
    const id = newId();
    ingredients[id] = { id, name, unit, section, staple, product: product ? { ...product } : null };
    byName[name] = id;
  }
  const meals = {};
  for (const [name, items] of MEALS) {
    const id = newId();
    meals[id] = { id, name, items: items.map(([n, amount]) => ({ ingredientId: byName[n], amount })) };
  }
  const regulars = REGULARS.map(([name, section, product]) => ({ id: newId(), name, section, product: { ...product } }));
  return {
    version: 1,
    ingredients,
    meals,
    week: emptyWeek(),
    householdStaples: [],
    regulars,
    oneOffs: [],
    checks: emptyChecks(),
  };
}
