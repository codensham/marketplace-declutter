# Privacy policy for Marketplace Declutter

Effective date: 24 November 2026

Marketplace Declutter is a browser extension that hides Facebook Marketplace
listings that are outside your chosen radius, shipping-only, or seller ads.
This policy explains what the extension reads, what it stores, and what it
does not do.

## Summary

The extension does not collect, transmit, sell, or share any of your data.
Everything it does happens inside your browser.

## What the extension reads

On pages under `facebook.com/marketplace`, the extension reads:

- the text of listing cards (price, title, and location line), to decide
  whether each listing should be hidden;
- the label of Marketplace's own location filter (for example
  "Location: Springfield, Illinois, Within 40 mi"), so it can use the same
  location and radius you set on Facebook.

When you open the extension's popup, it reads the address of the current tab
only to tell you whether you are on Marketplace.

When you open a listing, it reads the listing's number from the page address,
so it can mark that listing "Viewed" in the feed.

It does not read your messages, profile, friends, or any page outside
Marketplace, and it does not read listing cards for any purpose other than
deciding whether to hide them or mark them as viewed.

## What the extension stores

Using the browser's extension storage, the extension saves:

- your settings: whether it is on; whether to hide listings outside your
  area, shipping-only listings, seller ads, duplicate listings, listings with
  an unknown city, and listings with your removed keywords; the keywords
  themselves; and the price range you set;
- the last location and radius read from Marketplace's location filter, so
  the next page can be filtered without waiting for it;
- the numbers of listings you have opened, each with the day you last opened
  it, so they can be marked "Viewed". At most 20,000 are kept; the oldest
  are removed first.

Settings are saved with `chrome.storage.sync`. If you have turned on sync in
your browser, your browser may copy these settings to your other devices
through your browser account; that is handled by your browser, and the
extension's developer never receives them. The last-read location and the
list of opened listings are saved with `chrome.storage.local` and stay on your
device.

You can delete all stored data at any time by removing the extension.

## What the extension does not do

- It does not send any data to the developer or to any third party.
- It makes no network requests, apart from loading the city list that is
  bundled inside the extension itself.
- It contains no analytics, tracking, advertising, or remotely hosted code.
- It does not sell or transfer data, use it for anything unrelated to hiding
  listings, or use it to determine creditworthiness or for lending.

## Changes to this policy

If this policy changes, the new version will be published at the same
address with a new effective date.

## Contact

Questions about this policy: codensham@gmail.com

Marketplace Declutter is an independent project and is not affiliated with,
endorsed by, or sponsored by Meta or Facebook.
