# Amber redesign — design

Date: 2026-11-24 · Branch: `feat/amber-redesign` (from `feat/price-viewed-drops`)

All of the following was agreed through mockups in the conversation of
2026-11-24: icon variant A, the eye-button popup v2, and the name staying
"Marketplace Declutter".

## Why

To look nothing like MarketClean (no toggle switches) and to give the
extension a recognisable, more modern look.

## What changes

- **Icon** (`icons/icon.svg` and PNGs at 16, 32, 48 and 128): an amber tile
  `#EF9F27` with dark-brown concentric rings `#412402` / `#633806`, a centre
  dot, and a cream "outside" dot `#FAEEDA` at top right. The PNGs are
  rendered from the SVG with headless Chrome, by a script kept in
  `scripts/`.
- **Promo tile** `store/promo-small-440x280.png`: re-rendered in the new
  colours.
- **Popup**, 340 px wide:
  - Header: logo, name, and a round amber power button (replaces the switch).
  - A hero card: "N listings hidden on this page".
  - **Area · from Facebook:** an eye row "Outside <city> · <r> mi" with its
    count, and an "Exact / +15 mi" segmented choice for the grace margin.
  - **Listings:** eye rows for shipping-only, seller ads and unknown cities,
    each with a count ("9 hidden" / "3 shown"). The existing far-city and
    unknown-city lists open from their counts.
  - **Price:** the Min/Max fields, the hint, and a count.
  - Footer: "Runs only in your browser · Free", plus the city-data credit,
    which the licence requires.
  - Eye buttons are native checkboxes styled as buttons (eye-off = hidden,
    amber), so keyboard and screen-reader behaviour stay as they are.
- **New setting `hideFar`** (default `true`): the eye on the distance row can
  turn off distance filtering without turning off the whole extension.
- **`getCounts`** gains `hidden`, the number of cards actually hidden. It
  drives the hero card.
- **Viewed badge:** amber `#EF9F27` with dark-brown text.

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
