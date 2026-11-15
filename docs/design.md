# Marketplace Local Filter — Design

Date: 2026-11-14

## Intent

Facebook Marketplace ignores the location + radius the user sets: it pads the
feed with shipped listings and listings outside the radius. This extension
hides both, so the grid shows only local listings within the chosen radius.

## Goals

- Hide listings that are shipping-only.
- Hide "Ad from seller" cards.
- Hide listings whose city is farther than the user's radius from their centre.
- Stay very lightweight: no background worker, no network calls, no vendor,
  no framework, no build step for the extension itself.
- Scale to any number of users at zero cost (the reason the bundled table was
  chosen).

## Non-goals (MVP)

- Countries other than the US.
- Firefox / Safari / mobile.
- Exact per-listing distance (accuracy is city-level).

## Anti-goals

- Hiding a listing that is actually local. When unsure, leave it visible.
- Sending anything about the user or their browsing off the machine.

## Approaches considered

1. **Bundled US city table — chosen.** Ship a static city → coordinates table
   and compute distance locally. No vendor, no limits, no cost at any user
   count. Trade-off: ~0.5 MB of data in the package, US only, city-level
   accuracy.
2. **Geocode on demand + cache (Nominatim).** No shipped data and works in
   any country, but free keyless services are not meant to back a widely
   distributed extension, and a keyed service exposes the key.
3. **Read Facebook's own response data.** Potentially exact coordinates, but
   unverified that the feed carries them, and the most fragile option.

The user picked 1 because it is the option that scales.

## Design

### Files

```
manifest.json            Manifest V3
content.js               detection, filtering, observer
lib/geo.js               pure functions: parse, lookup, distance
popup.html / popup.js    settings + hidden counts
data/places.json         generated city table
scripts/build-places.mjs one-off generator (dev only, not shipped)
test/geo.test.mjs        unit tests for lib/geo.js
```

### Manifest

- Manifest V3, Chrome and Edge.
- Permissions: `storage` only. Host match: `https://www.facebook.com/*`.
- No background service worker.
- `data/places.json` listed under `web_accessible_resources` for facebook.com.

### Settings (popup, saved in `chrome.storage.sync`)

- Enabled on/off.
- Centre: typed as "City, ST", validated against the table.
- Radius in miles.
- Hide shipping-only: on by default.
- Shows how many listings were hidden on the current page, split by reason,
  plus how many had an unrecognised city.

### Location source (added after the MVP)

The extension matches Facebook's own location filter whenever it can read it.
The sidebar's location button carries an aria-label of the form
"Location: Springfield, Illinois, Within 40 mi" on browse and search pages.
If that parses and the city is in the table, its city and radius are used and
the popup shows "Matching Facebook: …". Otherwise the popup's city and radius
apply. Pages without the filter keep the last value read in that tab. The
label is English-only and kilometres are converted to miles.

### Content script

- Facebook is a single-page app, so the script matches all of facebook.com
  but does nothing unless the path starts with `/marketplace`. It re-checks on
  navigation.
- The city table is fetched lazily, once, the first time a Marketplace page
  is active.
- A listing card is found by its link (`a[href*="/marketplace/item/"]`), never
  by class name. The card's text lines give price, title and location.
- One `MutationObserver` on the feed handles infinite scroll, with processing
  batched per animation frame. Each card is processed once and tagged.
- Hiding sets `display: none` on the card's grid cell, so the grid reflows
  without gaps. Turning the extension off restores everything without reload.

### Front-end only, and the stall it can cause

The extension only hides rendered cards. Facebook still sends the same
listings; no requests are modified. If most of a batch is hidden, the page
can end up too short to trigger Facebook's next load. After each batch, if
the visible feed no longer extends past the bottom of the viewport, the
script nudges the scroll position (or dispatches a scroll event) so the next
batch loads. This is capped at a small number of consecutive attempts so it
cannot loop when the feed is genuinely exhausted.

### Rules, in order

0. Location line is "Ad from seller" → hide as an ad (setting, on by
   default).
1. Location line is a shipping marker (e.g. "Ships to you") → hide as
   shipping-only.
2. Location line parses as "City, ST" and is found in the table → hide if
   the distance from the centre exceeds the radius.
3. Anything else (unparseable, unknown city) → leave visible and count it.

A listing in range that also offers shipping stays visible.

### City table

- **Revised during the build.** A live sample of 178 cards showed Facebook
  labels listings with postal city names ("Henrico, VA", "Kents Store, VA").
  Census alone matched 24 of 37 names; USGS GNIS matched all but mislocated
  ambiguous names (Henrico was 92 miles off). Postal names matched 37 of 37
  with plausible distances.
- Primary source: GeoNames US postal-code file (CC BY 4.0, attribution in the
  popup and `NOTICE.md`). A city's point is the mean of its ZIP centroids.
- Fallback source: US Census Bureau Gazetteer files (public domain): Places,
  plus County Subdivisions, for names that are not postal cities. Legal names
  get everyday aliases ("Nashville-Davidson metropolitan government" →
  "Nashville").
- Result: about 50,600 names, 1.6 MB.
- `scripts/build-places.mjs` converts them to
  `{ "city|ST": [lat, lon] }`, lower-cased names, coordinates rounded to
  three decimals. Committed output; regenerate only when Census updates.
- Name normalisation (case, "St."/"Saint", suffixes like "city"/"township")
  lives in `lib/geo.js` and is shared by the generator and the lookup.

### Aliases

- Facebook also labels listings with neighborhoods ("Hollywood, CA") that no
  postal or Census list has. `data/aliases.json` fills these from the
  GeoNames gazetteer's populated places: about 114,000 names, 3.9 MB, about
  40 ms to parse. Aliases never overwrite the city table.
- A name found at points more than 10 miles apart in one state is left out:
  an unknown card stays visible by default, while a wrong point could hide a
  local listing. Trailer parks, apartment complexes and subdivisions are left
  out too.
- `scripts/manual-aliases.json` adds names GeoNames lacks ("SoMa", "Bed-Stuy")
  and removes ones where a famous neighborhood shares its name with a smaller
  GeoNames place ("Wynwood, FL", "Lakeview, IL").
- City suggestions in the popup use the city table only, so hamlets don't
  crowd out towns; a typed alias is still accepted.

### Testing

- `lib/geo.js` is pure and unit-tested with Node's built-in test runner:
  location-line parsing, name normalisation, lookup, haversine distance,
  the hide/keep decision.
- Card detection and the exact shipping marker text are verified by hand
  against the live Marketplace page before the rules are finalised.

## Calls made by the designer (not yet confirmed by the user)

- Centre and radius are typed into the popup, not read from Facebook.
- Unknown cities stay visible rather than hidden.
- Radius is applied as entered, with no extra tolerance, measured to the
  city's centre point.
- Hidden cards are removed from the layout, not dimmed.
- Chrome/Edge only.

## Left to the builder

- The exact DOM walk from a listing link up to its grid cell.
- The exact shipping marker strings, confirmed on the live page.
- Popup layout and styling.
