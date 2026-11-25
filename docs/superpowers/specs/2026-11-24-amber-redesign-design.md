# Forest redesign — design

Date: 2026-11-24 · Branch: `feat/amber-redesign` (name kept from the first pass) (from `feat/price-viewed-drops`)

Agreed through mockups on 2026-11-24. The first pass used an amber theme and a
concentric-ring logo; the user rejected both. Final choices: the **Forest**
theme, the **pin-in-radius** logo, the eye-button popup, and the name staying
"Marketplace Declutter". The 15-mile margin is always on, so there is no
cut-off choice.

## Why

To look nothing like MarketClean (no toggle switches) and to give the
extension a recognisable, more modern look.

## What changes

- **Icon** (`icons/icon.svg` and PNGs at 16, 32, 48 and 128): a forest-green
  tile `#2F5D3A` with a cream `#F4F1E8` map pin carrying a green tick,
  standing in a sage `#8FAE8B` ring for "within your radius". The PNGs are
  rendered from the SVG with headless Chrome by `scripts/render-icons.mjs`.
- **Promo tile** `store/promo-small-440x280.png`: re-rendered in the new
  colours.
- **Popup**, 340 px wide:
  - Header: logo, name, and a round green power button (replaces the switch).
  - A hero card: "N listings hidden on this page".
  - **Area · from Facebook:** an eye row "Outside <city> · <r> mi" with its
    count, and a note that 15 extra miles are always included.
  - **Listings:** eye rows for shipping-only, seller ads and unknown cities,
    each with a count ("9 hidden" / "3 shown"). The existing far-city and
    unknown-city lists open from their counts.
  - **Price:** the Min/Max fields, the hint, and a count.
  - Footer: "Runs only in your browser · Free", plus the city-data credit,
    which the licence requires.
  - Eye buttons are native checkboxes styled as buttons (eye-off = hidden,
    green), so keyboard and screen-reader behaviour stay as they are.
- **New setting `hideFar`** (default `true`): the eye on the distance row can
  turn off distance filtering without turning off the whole extension.
- **`getCounts`** gains `hidden`, the number of cards actually hidden. It
  drives the hero card.
- **Viewed badge:** green `#2F5D3A` with cream text.
- **15-mile margin always on:** the `grace` setting is removed and a stored
  `grace: false` is ignored.

## Non-goals

- Renaming the extension.
- Store screenshots 1–3. They need the live Facebook feed, so the user
  retakes them after testing.
- Any change to the filtering logic beyond `hideFar`.

## Approaches

1. **Rewrite `popup.html` / `popup.js` in place, keeping the element IDs and
   checkbox state model.** Picked: the smallest change that delivers the
   approved mockup, and the storage and messaging code is unchanged.
2. A component library or framework. Rejected: the project has no build step
   or dependencies.
