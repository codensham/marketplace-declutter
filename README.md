<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Marketplace Declutter logo" />
</p>

# Marketplace Declutter

A Chrome and Edge extension that makes Facebook Marketplace show what you asked
for: listings near you. Marketplace pads the feed with shipped items, listings
outside your radius, and seller ads. Marketplace Declutter hides all three.

<p align="center">
  <img src="docs/images/popup-v2.png" width="300" alt="The popup, showing Facebook's location, the 15-mile grace toggle, and how many listings were hidden" />
</p>

## What it hides

| Listing | Hidden when |
| --- | --- |
| Out of range | Its city is more than your radius + 15 miles from your centre (the 15-mile grace can be turned off) |
| Shipping-only | It is marked "Ships to you" (can be turned off) |
| Seller ad | It is marked "Ad from seller" (can be turned off) |
| Unknown city | Off by default; hidden only if you turn on "Hide unknown cities" |

A listing is only hidden when the extension is sure. If a city is not
recognised, the listing stays visible and is counted as "unknown city";
the popup can list those cities. An unrecognised city in a state that lies
entirely outside your radius is treated as out of range.

## Install

The extension is not on the Chrome Web Store yet, so load it from source:

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the repository folder.
5. Open or refresh Facebook Marketplace.

## Using it

By default there is nothing to set up. The extension reads the location and
radius from Marketplace's own location filter and applies them properly. To
change the area, change it in Marketplace.

Because Facebook's location isn't exact and distances are measured in a
straight line between town centres, towns up to 15 miles past the radius are
kept. Turn off **Allow 15 mi past the radius** in the popup to cut off at the
radius exactly.

The popup also shows how many listings were hidden on the current page and why.

## Privacy

- Everything runs in your browser. The extension makes no network requests
  other than loading its own bundled city table.
- It reads the Marketplace page only to find listing cards and the location
  filter. Nothing about you or your browsing leaves your machine.
- Settings are saved with Chrome's extension storage.

Full details are in the [privacy policy](PRIVACY.md).

## Limitations

- United States only.
- Distance is measured city to city, not from the exact listing address.
- It hides listings after Facebook has loaded them; it does not change what
  Facebook sends. When most of a batch is hidden, the page loads more for you.
- Facebook changes its pages often, which can break detection until the
  extension is updated.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3; no background worker |
| `content.js` | Finds listing cards, hides them, watches for new ones |
| `lib/geo.js` | Pure logic: parsing, city lookup, distance, suggestions |
| `popup.html`, `popup.js` | Settings and hidden counts |
| `data/places.json` | About 50,000 US cities with coordinates |
| `data/aliases.json` | About 114,000 neighborhoods and communities the city table lacks |
| `scripts/build-places.mjs` | Regenerates the city table (development only) |
| `scripts/build-aliases.mjs` | Regenerates the aliases from GeoNames plus `scripts/manual-aliases.json` |

There is no build step and no runtime dependency. The reasoning behind the
design is in [docs/design.md](docs/design.md).

## Development

Requires Node 20 or later, used only for tests and for regenerating the city table.

```
npm test
```

To regenerate `data/places.json` or `data/aliases.json`, see [NOTICE.md](NOTICE.md) for the source
files and the command.

After changing code, click the reload icon for the extension at
`chrome://extensions`, then refresh the Marketplace tab.

## Publishing

```
npm run package
```

builds `dist/marketplace-declutter-<version>.zip` containing only the files
the extension loads. Store listing text, permission justifications and
images are in [store/](store/listing.md); the privacy policy is
[PRIVACY.md](PRIVACY.md).

## Data sources

City data comes from GeoNames (CC BY 4.0) and the US Census Bureau (public
domain). Details are in [NOTICE.md](NOTICE.md).

## License

[MIT](LICENSE). The bundled city data keeps its own terms; see
[NOTICE.md](NOTICE.md).

## Disclaimer

This is an independent project. It is not affiliated with, endorsed by, or
sponsored by Meta or Facebook.
