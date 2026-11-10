# Weekly Groceries App: Design

Date: 2026-11-09
Status: draft, awaiting owner approval. Build phase 1 (list) first; phase 2 (cart) after.

## Why

The owner plans a week of dinners in an iPhone note (one meal per night, cooking for themself and their girlfriend), then works out ingredients and quantities by hand and adds each item to a Star Market pickup order one at a time. Both halves are tedious: turning meals into a combined ingredient list, and filling the Star Market cart. They cook from a small, recurring set of meals, so the app should remember those meals and do the arithmetic and the cart-filling.

Example week (from the owner's note): Ramen with hard boiled eggs; Grilled cheese and butternut squash; Omelettes and home fries (x2); Pesto pasta with silken tofu (x2); Stir fry veggies, eggs and noodles.

Success: on Sunday the owner picks the week's meals on their phone, taps one button, and the Star Market cart is filled with the right products in the right amounts. They review and check out in the Star Market app for pickup.

## Goals

- iPhone-first, as smooth as possible on the phone. No computer needed week to week.
- A saved menu of the owner's meals, each with ingredients, amounts per 2 servings, and the exact Star Market product for each ingredient.
- Plan a week by picking a meal per day from that menu, with servings set per meal (default 2).
- One combined shopping list: same ingredients across meals are merged and amounts summed, then converted into how many packages to buy (e.g. 14 eggs → 1 × 18-count).
- Staples (oil, salt, butter, soy sauce…) appear as a "do you need these?" checklist; only ticked ones go to the cart.
- Extras not tied to a meal (snacks, paper towels), both one-offs and saved regulars.
- Phase 2: a "Build my Star Market cart" button that fills the real cart automatically.

## Non-goals

- Shared use with the girlfriend or sync across devices (single user, data on the owner's phone).
- An App Store app (owner is on Windows; a native iPhone app needs a Mac).
- Checkout, payment, pickup-slot booking. The owner does these in the Star Market app.
- Nutrition, recipes/cooking steps, price comparison, other stores.

## Anti-goals (would be a failure even if it "works")

- The app ever handles the owner's Star Market password or payment details.
- Silent wrong carts: wrong product, or wrong quantity added with no visible summary of what happened.
- Losing the owner's meal menu (all their setup work) because the phone cleared browser data.

## Constraints and facts

- Star Market (Albertsons family) has no public API for outside apps. iPhone apps can't control other apps.
- Cart belongs to the Star Market account, so anything added on starmarket.com shows up in the Star Market iPhone app. Checked: searching works signed out; adding to cart requires signing in ("Sign in to add").
- Observed site internals (2026-11-09, unofficial, can change any time): product search at `/abs/pub/xapi/pgmsearch/v1/search/products?...&q=...&storeid=2576` (store 2576 was the default store for the guest session; the owner's store must come from their account). Product pages look like `/shop/product-details.<id>.html`.
- A web page on another site (the app) can't call starmarket.com's internals directly. Browsers block that. Cart filling must run on starmarket.com itself, in the owner's signed-in browser.
- Hosting: GitHub Pages (free). Owner needs a GitHub account; builder walks them through it.
- Owner mostly uses Chrome on iPhone but will use Safari if that is smoother.

## How it's made (decided)

- **Owner decided:** iPhone use; pick meals from a menu (not pasting notes); servings set per meal; exact Star Market product + link per ingredient; staples as a checklist; extras supported; single user; GitHub Pages; build the list first, cart automation as phase 2, phone-only.
- **My calls (owner can override):**
  - A web app saved to the iPhone home screen (opens full-screen like an app). Plain HTML/CSS/JavaScript, no build step, so it's easy to change.
  - Data stored on the phone in the app's own storage, plus an **Export / Import backup** button (a JSON file the owner can save to Files/iCloud), because of the "losing the menu" anti-goal.
  - Shopping list order: by store section (owner said it doesn't matter; sections are the usual default).
  - Starter meals: I draft ingredient lists for the five meals above, sized for 2; the owner corrects them in the app. Products are left unlinked until the owner picks them.
  - Phase 2 is a **bookmarklet**: a saved bookmark containing a small script. On the phone the owner opens starmarket.com (signed in), taps the bookmark, and the script adds every item to the cart in that signed-in session, then shows a summary: added, failed, out of stock. **Safari** is the recommended browser for this step: bookmarklets run from Safari's bookmarks menu in one tap. In Chrome for iPhone it works but is clunkier (you type the bookmark's name in the address bar and pick it).

## Ingredients are shared (my call)

There is one **ingredient catalog**. Each ingredient (e.g. "Eggs") is defined once: name, unit, store section, staple yes/no, and linked Star Market product with package size. A meal lists catalog ingredients with an amount for 2 servings. When editing a meal you pick an existing ingredient or create a new one. So eggs are linked to a product once, and merging across meals is exact (no matching typed names).

**Staples (my call):** the checklist shows every staple ingredient used by this week's meals, plus a short household staples list the owner can edit (e.g. paper towels if wanted there). Unchecked staples never go to the cart.

## Screens (approved by owner from mockups)

Reference mockup: `.superpowers/mockup-screens.png` (source `.superpowers/brainstorm/125-1794266382/content/screens.html`).

Bottom tab bar with three tabs:

1. **My Meals.** List of saved meals plus "Add a meal". A meal has a name and ingredients. Each ingredient has: name, amount + unit for 2 servings, store section, staple yes/no, and an optional linked Star Market product (product link, package size, e.g. "18 ct" or "16 oz").
2. **This Week.** Mon–Sun, each day: pick a meal from the menu (or leave empty) and a servings number (default 2, tap to change). The same meal can appear on several days.
3. **Shopping List.** "Do you have these?" staples checklist at the top (ticked = need to buy). Then "To buy": merged items with package count, an "Open in Star Market" link, and a tick-off box. Then extras: **saved regulars show as a tick-to-include checklist** (owner decided), and one-off extras can be added for this week. Extras can carry a linked product and package size just like ingredients. Phase 2 adds a **Build my Star Market cart** button here.

## Linking products

The app can't search Star Market itself (browsers block cross-site calls). The way to link a product: in the meal editor, tap "Find on Star Market", which opens a Star Market search for that ingredient. Find the product, use Share → Copy link, come back, and paste the link into the ingredient. The app pulls the product ID out of the link. The builder may find something smoother. A bookmarklet "send this product to my app" is an option to consider.

## Phase 2: Build my cart

- The button on the Shopping List hands the list (product IDs + quantities) to Star Market. Proposed: it opens starmarket.com with the list in the URL's `#` part, which never leaves the phone. The bookmarklet reads it from there. Fallback: copy to clipboard and the bookmarklet asks you to paste. Builder to confirm what survives Star Market's page loads.
- The bookmarklet adds items using the site's own add-to-cart mechanism in the owner's signed-in session, at a modest pace, then shows the summary. Items it can't find or that are out of stock are listed so the owner adds substitutes by hand.
- **Unverified and must be checked first:** the exact add-to-cart call. It can only be observed while signed in. The plan should begin phase 2 with the owner signing in themself (on the PC browser pane or phone) while the builder watches what tapping "Add" does. Do not try to get around sign-in, bot checks, or CAPTCHAs. If the site blocks or rate-limits, fall back to the phase 1 list.
- **Owner decided:** items already in the Star Market cart are **topped up to the list amount** (list says 2, cart has 1 → add 1), never doubled. If the cart can't be read, say so in the summary and ask before adding. Items ticked off on the Shopping List are **skipped** (ticked = already handled).
- Expect this to break sometimes when Star Market changes their site. The phase 1 list (with product links) must always work on its own.

## Left to the builder

- Unit handling and conversions (keep it simple: same unit sums; packages = ceil(amount / package size)); what to show when units don't match.
- Visual design details beyond the approved mockups (dark mode matching iPhone is a good default).
- How the home-screen app is set up (icon, name, offline caching).
- Data format and versioning for the backup file.
