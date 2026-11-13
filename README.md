# JAS2024

HubSpot CMS theme for **The John Ankerberg Show** (ATRI) website. It began as the [HubSpot CMS Boilerplate](https://developers.hubspot.com/docs/cms/building-blocks/themes/hubspot-cms-boilerplate) and has been extended with ATRI page templates, custom modules, donation checkout, and the Christmas 2026 campaign (merch, gifts, and a cart).

The theme label in HubSpot is **"The John Ankerberg Show 2024"** (see `theme.json`).

## Contents

| Path | What's there |
| --- | --- |
| `theme.json` | Theme metadata: label, preview template, responsive breakpoints |
| `fields.json` | Theme settings shown in the page editor (colors, fonts, spacing, buttons, etc.) |
| `templates/` | Page templates (`home`, `about-us`, `donate`, `podcasts`, `guests`, `the-john-ankerberg-show`, `christmas-2026`, …) |
| `templates/layouts/` | Base HTML layouts: `base.html` and `base-audio-bible.html` |
| `templates/partials/` | Global header and footer partials (`header-v2.html` is the current site header) |
| `templates/system/` | HubSpot system pages: 404, 500, search results, membership, subscriptions, password prompt |
| `sections/` | Reusable drag-and-drop sections (hero banner, cards, CTA, pricing, multi-column/row content) |
| `modules/` | Custom modules. Each `*.module/` folder holds `module.html`, `module.css`, `module.js`, `fields.json`, `meta.json` |
| `css/` | Theme stylesheets in ITCSS order, compiled through `css/main.css` |
| `js/main.js` | Site-wide JS: mobile nav, language switcher, and search toggles |
| `js/cart.js` | Client-side cart (`window.ATRICart`) for the Christmas campaign |
| `json/` | Country and US state lists used by forms |
| `fonts/`, `images/` | Lato font files, template/section preview screenshots, campaign imagery |

### CSS structure

`css/main.css` pulls the partials in with HubL `{% include %}`, in this order:

1. `generic/`: reset and normalize
2. `_variables.css`, `_custom_rules.css`
3. `objects/`: layout and drag-and-drop container classes
4. `elements/`: base styles for typography, buttons, forms, tables
5. `components/`: header, footer, default modules
6. `utilities/`: helper classes

`theme-overrides.css` loads after `main.css` and maps the editor settings in `fields.json` onto the theme. Template-specific styles live in `css/templates/`.

### Notable modules

- **Headers:** `HeaderV2` (current), `Header`, `Header DEV`, and the Christmas headers (`XmassHeader`, `2026-x-mass-header`)
- **Donations:** `one-time-donations-nbd-2025`, `one-time-donations-markus-2025`, `donations-nbd-2025-v1`, `Donation and Calendar Option`. See `modules/README.md` for setting up the donation checkout.
- **Christmas 2026 campaign:** `x-mass-*` modules (hero, merch, products, cart drawer, newsletter, footer, …) and `2026-x-mass-pop-up-form`
- **Content:** blog listings and recent posts, podcast cards, video gallery and playlists, tabs, accordion, testimonials, guests, streaming services
- **Search:** `search_input`, `search_results`, `dev-site-search`

Folders ending in `v1-backup`, `DEV`, or a person's name (e.g. `button Mark`, `search_input mark-d`) are working copies or experiments, not production modules.

## External services

The theme calls these backends:

| Service | Used by | Purpose |
| --- | --- | --- |
| `one-time-donations-…herokuapp.com` | Donation modules | Stripe publishable key (`GET /`) and PaymentIntent creation (`POST /create-payment-intent`) |
| `atri-api-platform-…herokuapp.com` | `HeaderV2` (configurable field) | ATRI API platform |
| `evening-hamlet-…herokuapp.com` | `search_input mark-d` | Product search |

Pages also load jQuery, Splide (carousels), Oswald from Google Fonts, and Lato from cdnjs (see `templates/layouts/base.html`).

## Cart (`js/cart.js`)

`js/cart.js` keeps the Christmas campaign cart in `localStorage` under the key `atri_cart_v1` and exposes it as `window.ATRICart`:

```js
ATRICart.add({ type: 'product', sku: 'EXAMPLE-SKU', unit_cents: 2500, quantity: 1 });
ATRICart.add({ type: 'gift', frequency: 'once', amount_cents: 5000, fund: 'general' });

ATRICart.items();          // all line items
ATRICart.count();          // total units, used for header badges
ATRICart.subtotalCents();
ATRICart.setQuantity(id, 2); // products only; < 1 removes the line
ATRICart.remove(id);
ATRICart.clear();

const redirectUrl = await ATRICart.checkout(endpoint, { email });
```

Each change fires an `atri:cart` event on `window` with `{ detail: { items } }`. Changes made in other tabs fire it too, so the badges and cart drawer stay in sync.

## Local development

This repo has no build step. Files go to HubSpot's Design Manager as they are, using the [HubSpot CLI](https://developers.hubspot.com/docs/cms/developer-reference/local-development-cli).

```bash
# One-time setup
npm install -g @hubspot/cli
hs init            # authenticate; creates hubspot.config.yml (do not commit it)

# Pull the current theme from the portal (if needed)
hs fetch JAS2024 .

# Push local changes once
hs upload . JAS2024

# Or watch and upload on save
hs watch . JAS2024
```

Replace `JAS2024` with the theme's folder name in Design Manager if it's different.

### Tips

- Uploads go straight to the live portal. Try changes on `templates/dev-test.html` / `qa-test.html` or a draft page before touching production templates.
- When you add a template, set the annotation comment at the top (`templateType`, `label`, `isAvailableForNewContent`, `screenshotPath`) so it appears in the page editor.
- Editors set module options in `fields.json`, so edit them there rather than hard-coding values in `module.html`.

## License

See `license.txt` (still the boilerplate placeholder).
