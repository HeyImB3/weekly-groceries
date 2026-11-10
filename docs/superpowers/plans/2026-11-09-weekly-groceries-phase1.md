# Weekly Groceries Phase 1 (Meals → Shopping List) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An iPhone home-screen web app with My Meals, This Week and Shopping List screens that turns a week of meals into a merged Star Market shopping list with product links.

**Architecture:** Static site in `app/` (plain HTML/CSS/ES modules, no build step). Pure logic modules (`model`, `list`, `store`) are unit-tested with Node's built-in test runner. UI modules render from one state object and save after each change. Deployed to GitHub Pages by a GitHub Actions workflow that publishes `app/`.

**Tech Stack:** HTML, CSS, JavaScript ES modules; Node 24 `node --test` for tests (dev only, no npm dependencies); GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-09-weekly-groceries-design.md`

## Global Constraints

- No build step, no runtime dependencies. Everything in `app/` is served as-is.
- Single user; all data in the phone's `localStorage` under key `weekly-groceries-v1`.
- The app never asks for or stores Star Market credentials or payment details.
- Amounts in meals are **per 2 servings**; servings per day default to `2`.
- Ingredients live in one shared catalog; meals reference ingredients by id.
- Staples go to the list only when ticked "need". Saved regulars go only when ticked "include". Ticked-off items stay visible but marked done.
- Store-section order: `Produce, Meat & Seafood, Dairy & Eggs, Bakery, Frozen, Pantry, Household, Other`.
- Dark UI that matches the approved mockup `.superpowers/mockup-screens.png`, with a bottom tab bar `Meals | Week | List`.
- Must be usable at 375px wide (iPhone) with no horizontal scroll.

## Review Focus

1. Empty week (no meals picked): the List shows "Pick some meals on the Week tab" and doesn't crash. Test in Task 3.
2. A meal or ingredient deleted while still referenced by the week or a meal: it's skipped silently, and the list still builds. Test in Task 3.
3. Ingredient with no linked product: it still appears, with a "Search Star Market" link instead of "Open in Star Market". Test in Task 3 (`product: null` → `link` is a search URL).
4. Fractional and scaled amounts (0.5 squash × 3 servings): amounts show at most 2 decimals and pack counts round up. Test in Task 3.
5. Corrupt or foreign backup file on Import: rejected with a message, and current data is untouched. Test in Task 4.

---

### Task 1: Project setup + product link parsing

**Files:**
- Create: `.gitignore` (contents: `.superpowers/`, `node_modules/`)
- Create: `package.json` (`{"name":"weekly-groceries","private":true,"type":"module","scripts":{"test":"node --test tests/"}}`)
- Create: `app/js/model.js`
- Test: `tests/model.test.js`

**Interfaces:**
- Produces:
  - `SECTIONS: string[]` (exact order from Global Constraints)
  - `parseProductLink(url: string) -> { id: string, url: string } | null`: accepts any URL containing `product-details.<digits>.html` on starmarket.com. Returns the id and the canonical `https://www.starmarket.com/shop/product-details.<id>.html`.
  - `searchUrl(term: string) -> string`: `https://www.starmarket.com/shop/search-results.html?q=<encodeURIComponent(term)>`
  - `newId() -> string` (short random id)

- [ ] **Step 1:** `git init` in the project root and create `.gitignore` and `package.json` as above.
- [ ] **Step 2: Write failing tests** in `tests/model.test.js`:
```js
assert.deepEqual(parseProductLink('https://www.starmarket.com/shop/product-details.970555123.html?x=1'),
  { id: '970555123', url: 'https://www.starmarket.com/shop/product-details.970555123.html' });
assert.equal(parseProductLink('https://example.com/foo'), null);
assert.equal(parseProductLink(''), null);
assert.equal(searchUrl('silken tofu'), 'https://www.starmarket.com/shop/search-results.html?q=silken%20tofu');
assert.equal(SECTIONS[0], 'Produce'); assert.equal(SECTIONS.at(-1), 'Other');
```
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `app/js/model.js`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit `feat: project setup and product link parsing`.

### Task 2: State shape + starter meals

**Files:**
- Create: `app/js/seed.js`
- Test: `tests/seed.test.js`

**Interfaces:**
- Consumes: `newId`, `SECTIONS` from `model.js`
- Produces: `createInitialState() -> State`, where
```js
State = {
  version: 1,
  ingredients: { [id]: { id, name, unit, section, staple: boolean,
                         product: null | { id, url, packSize: number, packUnit: string } } },
  meals: { [id]: { id, name, items: [{ ingredientId, amount: number }] } },  // amount per 2 servings
  week: { mon|tue|wed|thu|fri|sat|sun: null | { mealId, servings: number } },
  householdStaples: [ingredientId],
  regulars: [{ id, name, section, product: null|{...same as above} }],
  oneOffs: [{ id, name, section, qty: number, product: null|{...} }],
  checks: { staplesNeeded: {[ingredientId]: true}, regularsIncluded: {[regularId]: true}, done: {[listKey]: true} }
}
```
- Starter meals (my draft for 2 servings; the owner corrects them in the app). Units: `ea, oz, lb, cup, slice, bunch, tbsp`. Staples marked (S).
  - Ramen with hard boiled eggs: ramen noodles 2 ea, eggs 4 ea, green onions 0.5 bunch, soy sauce 2 tbsp (S)
  - Grilled cheese and butternut squash: bread 4 slice, cheddar slices 4 slice, butter 2 tbsp (S), butternut squash 1 ea, olive oil 1 tbsp (S)
  - Omelettes and home fries: eggs 6 ea, shredded cheese 0.5 cup, bell pepper 1 ea, potatoes 1.5 lb, onion 1 ea, butter 1 tbsp (S), olive oil 2 tbsp (S)
  - Pesto pasta with silken tofu: pasta 8 oz, pesto 4 oz, silken tofu 16 oz, parmesan 0.25 cup
  - Stir fry veggies, eggs and noodles: lo mein noodles 8 oz, eggs 3 ea, frozen stir fry vegetables 16 oz, soy sauce 3 tbsp (S), sesame oil 1 tbsp (S), garlic 2 ea (S)
  - Eggs, soy sauce, butter and olive oil are each **one** catalog ingredient shared across meals. All `product: null`. `week` is all null. Other lists are empty.

- [ ] **Step 1: Write failing tests:** 5 meals. Exactly one ingredient named `Eggs`, used by 3 meals. Every meal item's `ingredientId` exists in `ingredients`. Every ingredient's `section` is in `SECTIONS`. `Object.keys(week)` equals `['mon','tue','wed','thu','fri','sat','sun']`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `createInitialState()`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: state shape and starter meals`.

### Task 3: Shopping list builder

**Files:**
- Create: `app/js/list.js`
- Test: `tests/list.test.js`

**Interfaces:**
- Consumes: `State`, `searchUrl`, `SECTIONS`
- Produces: `buildShoppingList(state: State) -> { empty: boolean, staples: StapleRow[], regulars: RegularRow[], toBuy: Row[] }`
  - `StapleRow = { ingredientId, name, needed: boolean }`: staple ingredients used by this week's meals, plus `householdStaples`, de-duplicated and sorted by name.
  - `RegularRow = { id, name, included: boolean }`
  - `Row = { key: string, name, section, amount: number|null, unit: string|null, packs: number|null, unitMismatch: boolean, link: string, linked: boolean, done: boolean, source: 'meal'|'staple'|'regular'|'oneoff' }`
  - Meal ingredients: `amount = Σ item.amount × servings / 2`, rounded to 2 decimals. `packs = ceil(amount / packSize)` when the product exists and `packUnit === unit`. Otherwise `packs = linked ? 1 : null` and `unitMismatch = linked && packUnit !== unit`.
  - Needed staples, included regulars and one-offs are added as rows (staples and regulars `packs: 1`; one-offs `packs: qty`). A staple that is needed is **not** also summed as a meal row.
  - `key`: `ing:<id>`, `reg:<id>`, `one:<id>`. `done` comes from `checks.done[key]`. `link` is `product.url`, or `searchUrl(name)` when there's no product.
  - Sorted by section index, then name. `empty` is true when no day has a meal and no regulars or one-offs are included.

- [ ] **Step 1: Write failing tests** (build small states by hand):
  - `eggs merge`: Wed omelettes (6), Sun omelettes (6) and Mon ramen (4), all 2 servings, with eggs linked `packSize 18, packUnit 'ea'` → one row, `amount 16`, `packs 1`.
  - `servings scale`: squash 0.5 ea at servings 3 → `amount 0.75`. Tofu 16 oz with pack 16 oz at servings 4 → `packs 2`.
  - `unlinked`: `product null` → `linked false`, `packs null`, `link === searchUrl(name)`.
  - `unit mismatch`: unit `slice`, packUnit `loaf` → `packs 1`, `unitMismatch true`.
  - `staples`: soy sauce (staple) used this week, not ticked → in `staples` with `needed false` and absent from `toBuy`. Ticked → one `toBuy` row with `source 'staple'`.
  - `regulars and one-offs`: an un-included regular is absent from `toBuy`. An included one is present. A one-off with qty 2 → `packs 2`.
  - `done flag`: `checks.done['ing:<eggsId>'] = true` → that row has `done true`.
  - `empty week` → `empty true`, `toBuy []`.
  - `dangling refs`: week points at a deleted meal, and a meal item at a deleted ingredient → no throw, and they're skipped.
  - `order`: a Produce row comes before a Dairy & Eggs row.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `buildShoppingList`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: shopping list builder`.

### Task 4: Persistence + backup

**Files:**
- Create: `app/js/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `createInitialState`
- Produces:
  - `STORAGE_KEY = 'weekly-groceries-v1'`
  - `loadState(storage) -> State`: `storage` is anything with `getItem/setItem` (pass `localStorage` in the app, a fake in tests). Missing or unparseable data → `createInitialState()`.
  - `saveState(storage, state) -> void`
  - `exportBackup(state) -> string`: JSON `{ app: 'weekly-groceries', exportedAt: ISO string, state }`
  - `importBackup(text: string) -> { ok: true, state } | { ok: false, error: string }`: requires `app === 'weekly-groceries'`, `state.version === 1`, and objects for `ingredients`, `meals` and `week`. Never throws.
  - `resetWeek(state) -> State`: new state with every `week` day null and `checks` emptied. Meals, ingredients and regulars are kept.

- [ ] **Step 1: Write failing tests:** round-trip save→load is deep-equal. Empty storage → 5 starter meals. Storage holding `'{bad'` → starter state, no throw. `importBackup(exportBackup(s))` → `{ok:true}` and deep-equal. `importBackup('nope')`, `importBackup('{"app":"other"}')` and `importBackup('{"app":"weekly-groceries","state":{"version":2}}')` → `ok false` with a non-empty `error`. `resetWeek` clears the week and checks and keeps the meal count.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `store.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: persistence and backup`.

### Task 5: App shell + My Meals screen

**Files:**
- Create: `app/index.html`, `app/styles.css`, `app/js/main.js`, `app/js/ui/meals.js`
- Create: `.claude/launch.json` with config `app`: `npx http-server app -p 5173 -c-1`, or `python -m http.server 5173 -d app` if python is available. Check before choosing.

**Interfaces:**
- Consumes: `loadState`, `saveState`, `newId`, `SECTIONS`, `parseProductLink`, `searchUrl`
- Produces in `main.js`: `getState() -> State`, `update(mutator: (draft: State) => void) -> void` (applies the mutation, saves, re-renders the current tab), `showTab('meals'|'week'|'list')`. Each screen module exports `render(root: HTMLElement, ctx: { getState, update, showTab })`.
- `index.html`: viewport meta with `viewport-fit=cover`, `apple-mobile-web-app-capable`, dark theme color `#000`, `<main id="screen">` and a bottom `<nav>` with three tab buttons.
- My Meals: a list of meals plus "+ Add a meal". Tapping a meal opens an editor in the same tab:
  - Rename the meal, delete it (with confirm).
  - Ingredient rows: name, amount, unit (edit amount inline; remove row).
  - "+ Ingredient": pick from the catalog (search by name) or create a new one (name, unit, section, staple toggle).
  - Tapping an ingredient's name opens the ingredient editor (shared across meals; the screen says "Used in N meals"): unit, section, staple, plus a **Star Market product** block with:
    - a "Find on Star Market" link (`searchUrl(name)`, opens in a new tab)
    - a paste field for the product link (validated with `parseProductLink`; shows an error if invalid)
    - pack size and pack unit
    - "Remove link"
  - Below the meals list: a "Household staples" editor (add or remove catalog ingredients) and "Saved regulars" (name, section, optional product link and pack, delete).
  - Footer: "Export backup" downloads `weekly-groceries-backup-YYYY-MM-DD.json`. "Import backup" uses a file input and `importBackup`. It shows the error on failure and asks for confirmation before replacing data on success.

- [ ] **Step 1:** Build the shell and tab switching. Start the preview server and open it in the browser pane at the mobile preset (375×812). Expected: three tabs switch, and the Meals tab lists the 5 starter meals.
- [ ] **Step 2:** Build the meal editor and the ingredient editor. Verify in the browser:
  - Add "Toast" with new ingredient "Bread", reusing the existing catalog item.
  - Paste `https://www.starmarket.com/shop/product-details.123.html` into Eggs, set pack 18 ea, and reload. Expected: the link persists.
  - Paste `hello`. Expected: an error is shown and nothing is saved.
- [ ] **Step 3:** Build the household staples, regulars, and Export/Import controls. Verify Export downloads a file and Import of that file restores the data. Verify that importing a text file with junk shows an error and leaves the data untouched.
- [ ] **Step 4:** Run `npm test` (still PASS) and commit `feat: app shell and My Meals screen`.

### Task 6: This Week screen

**Files:**
- Create: `app/js/ui/week.js`

**Interfaces:**
- Consumes: `render` contract and `update` from Task 5, `resetWeek`.
- Mon–Sun rows as in the mockup:
  - Tapping a row opens a meal picker (list of meals plus "No meal").
  - The green servings pill opens a stepper from 1 to 12.
  - The same meal is allowed on several days.
- "Start new week" button: confirm, then `resetWeek`.

- [ ] **Step 1:** Implement. Verify in the browser pane at 375px: enter the owner's example week (Mon ramen; Tue grilled cheese; Wed omelettes; Thu and Fri pesto pasta; Sat stir fry at 4 servings; Sun omelettes). Reload and confirm it persists.
- [ ] **Step 2:** Commit `feat: This Week screen`.

### Task 7: Shopping List screen

**Files:**
- Create: `app/js/ui/list.js`

**Interfaces:**
- Consumes: `buildShoppingList`, the `render` contract and `update`.
- Layout (top to bottom):
  - If `empty`: "Pick some meals on the Week tab".
  - "Do you have these? (tick if you need)": staples checklist, which toggles `checks.staplesNeeded`.
  - "Regulars": a checklist that toggles `checks.regularsIncluded`.
  - "To buy": grouped by section headers. Each row shows:
    - a done checkbox (`checks.done[key]`; done rows are dimmed and struck through)
    - the name
    - `x<packs>` when packs is known, and `<amount> <unit>` underneath
    - a "⚠ check pack size" note when `unitMismatch`
    - "Open in Star Market ↗" (linked) or "Search Star Market ↗" (unlinked), opening in a new tab
  - "+ Add extra item": one-off with name, qty, section and optional product link, stored in `oneOffs` with a delete control.
  - A counter at the top: "N items · M linked".

- [ ] **Step 1:** Implement. Verify against the example week from Task 6: eggs appear once with amount **22** (Mon 4 + Wed 6 + Sun 6 + Sat stir fry 3 × 4/2 = 6), and stir fry vegetables show 32 oz (16 × 4/2). Tick soy sauce. Expected: it appears under Pantry. Tick an item done, reload, and confirm it stays done.
- [ ] **Step 2:** Run `npm test` (still PASS) and commit `feat: Shopping List screen`.

### Task 8: Home-screen app + GitHub Pages deploy

**Files:**
- Create: `app/manifest.webmanifest` (`name: "Weekly Groceries"`, `short_name: "Groceries"`, `display: "standalone"`, `background_color` and `theme_color` `#000000`, `start_url: "./"`, icons 192 and 512)
- Create: `app/icons/icon-192.png`, `app/icons/icon-512.png`, `app/icons/apple-touch-icon.png` (180). Generate a simple green basket or cart glyph on black with a script in the scratchpad; don't commit the script.
- Create: `app/sw.js` (cache-first for the app's own files, with a versioned cache name `wg-v1`; links to Star Market are not cached)
- Modify: `app/index.html` (manifest link, apple-touch-icon, service worker registration)
- Create: `.github/workflows/pages.yml` (on push to `main`: `actions/upload-pages-artifact` with `path: app`, then `actions/deploy-pages`)

- [ ] **Step 1:** Add the manifest, icons and service worker. Verify in the browser pane:
  - the manifest loads with no console errors
  - the service worker registers
  - after one load, stopping the server and reloading still shows the app
- [ ] **Step 2:** Commit `feat: home-screen app support`.
- [ ] **Step 3:** Deploy. The owner signs in to GitHub themself:
  - The owner creates a GitHub account (if needed) and runs `gh auth login` in their own terminal.
  - Create a **public** repo `weekly-groceries` with `gh repo create` (free Pages needs a public repo; the spec and plan in `docs/` become public too, and they contain no personal data).
  - Push `main` and enable Pages with source "GitHub Actions".
  - Verify the workflow succeeds and the Pages URL loads.
- [ ] **Step 4:** Give the owner the URL and the iPhone steps. Open it in Safari → Share → Add to Home Screen. (Chrome on iPhone also has Add to Home Screen in its share menu.) Each phone browser keeps its own data, so they should pick one. Safari is recommended, since phase 2 uses a Safari bookmark.

---

Phase 2 (Build my Star Market cart) gets its own plan after a recon session where the owner signs in to Star Market themself and we watch what "Add" does.
