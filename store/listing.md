# Chrome Web Store submission

Everything to paste into the Developer Dashboard, field by field.
Upload file: run `npm run package` and upload `dist/marketplace-declutter-<version>.zip`.

## Store listing tab

**Name** (taken from the manifest): Marketplace Declutter

**Summary** (from the manifest `description`, 132 characters max):

> Hides Facebook Marketplace listings that are outside your radius, shipping-only, or seller ads.

**Description:**

```
Facebook Marketplace lets you set a location and radius, then fills your feed with listings that ship from across the country, listings far outside your radius, and ads from sellers. Marketplace Declutter hides them, so you see what you can actually go and pick up.

WHAT IT HIDES
• Listings whose city is farther away than your radius
• Shipping-only listings ("Ships to you") – can be turned off
• Ads from sellers – can be turned off
• Listings whose city can't be placed – only if you turn this on

NO SETUP NEEDED
The extension uses the location and radius you already set in Marketplace's own location filter. Because Facebook's location isn't exact, towns up to 15 miles past your radius are kept by default; you can turn that off in the popup.

SEE WHAT WAS HIDDEN
The popup shows how many listings were hidden on the current page and why. Listings with a city the extension doesn't recognise are always left visible.

PRIVATE BY DESIGN
• Everything runs in your browser
• No accounts, analytics, tracking or ads
• Nothing is sent to the developer or anyone else
• Works only on facebook.com/marketplace pages

GOOD TO KNOW
• United States only for now
• Distance is measured between cities, not exact addresses
• Facebook changes its pages often; if filtering stops working, an update will follow

City data: GeoNames (CC BY 4.0) and US Census Bureau.

Marketplace Declutter is an independent project and is not affiliated with, endorsed by, or sponsored by Meta or Facebook.
```

**Category:** Lifestyle › Shopping

**Language:** English (United States)

**Graphic assets** (all in `store/`):

| Field | File |
| --- | --- |
| Store icon (128×128) | `icons/icon128.png` |
| Screenshots (1280×800) | `store/screenshot-1.png`, `store/screenshot-2.png`, `store/screenshot-3.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | Optional; not made |

## Privacy practices tab

**Single purpose:**

```
Hides Facebook Marketplace listings that are outside the user's chosen radius, shipping-only, or ads from sellers, so the feed shows only local listings.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's settings (on/off, the 15-mile grace margin, which listing types to hide) and the last location read from Marketplace's location filter, so the next page is filtered immediately. |
| `activeTab` | When the user opens the popup, reads the current tab's address to tell them whether they are on Marketplace and whether the tab needs refreshing before filtering can start. |
| Host permission (`https://www.facebook.com/*`, via content script) | The content script runs on Facebook Marketplace pages to read each listing card's location line and Marketplace's location filter, and to hide listings that are out of range, shipping-only, or seller ads. It does nothing on other Facebook pages. |

**Are you using remote code?** No, I am not using remote code.

**Data usage – what user data do you collect?** Leave every box unticked. The
extension stores settings and reads page content only on the user's device and
never transmits them, so nothing is collected by the developer.

**Certifications:** tick all three (data is not sold to third parties, not
used for purposes unrelated to the single purpose, not used for
creditworthiness or lending).

**Privacy policy URL:** a public page containing `PRIVACY.md`. Fill in the
contact email first.

## Distribution tab

- **Visibility:** Public (or Unlisted to share a link before going public).
- **Regions:** United States only matches what the extension supports; all
  regions is also fine.
- **Pricing:** Free.

## Before each submission

1. Raise `version` in `manifest.json`.
2. `npm test`
3. `npm run package`
4. Load the unzipped `dist` build as an unpacked extension and check a live
   Marketplace page.
5. Upload the zip in the dashboard's Package tab and submit for review.
