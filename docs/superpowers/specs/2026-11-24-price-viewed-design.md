# Price filter and "Viewed" badge — design

Date: 2026-11-24 · Branch: `feat/price-viewed-drops`

## Why

To beat MarketClean on features. Price min/max matches what they offer for
free. The "Viewed" badge is something they don't have. Everything stays local
to the browser, which is our main privacy advantage.

## Goals

1. **Price min / max.** Hide listings priced outside a range set in the popup.
2. **Viewed badge.** A small eye badge on the photo of any listing you have
   opened before.

## Non-goals

- A price-drop tag. It was considered and dropped because it only works for
  listings you saw before and can't be made reliable.
- The visual rebrand (amber logo, theme, eye-button popup). It gets its own
  branch.
- Hiding viewed listings. This change only adds the badge.
- Syncing viewed history between browsers.

## Anti-goals

- Any network request. All the data stays in `chrome.storage`.
- Hiding a listing whose price can't be read.

## How each one works

**Price filter.** Card lines are `[Just listed] · price · title · location`.
The extension parses the price line: `$1,200` becomes 1200, `Free` becomes 0,
and other currencies or unreadable text count as unknown. When a card shows
two prices (Facebook's crossed-out markdown), the first, current price is
used. New settings `priceMin` and `priceMax` are stored in sync storage, and
`null` means no limit. A card outside the range gets a new verdict, `price`,
and is hidden. Ads and shipping-only verdicts come first. A card with an
unknown price is always kept. The popup gets two number fields and an
"Outside price range" count.

**Viewed.** "Viewed" means you opened the listing. The content script already
runs on every facebook.com page, and Facebook moves between pages without
reloading. On each pass, if `location.pathname` is
`/marketplace/item/<id>`, that ID is recorded as viewed. This covers both a
full listing page and the overlay Facebook opens over the feed. Feed cards
whose ID has been viewed get a small eye badge with "Viewed" over the photo.

**Storage.** One `chrome.storage.local` key, `viewed`: `{ [id]: day }`. Writes
are batched with a short debounce. It's capped at 20,000 entries and the
oldest are pruned first. It's loaded once at page start, in parallel with the
settings.

**Badge.** One injected element positioned absolutely over the card's image
container. It carries a `data-mlf-*` marker so `reset()` removes it along
with the other markers. It uses the current teal theme for now; the rebrand
branch recolours it.

## Approaches considered

1. **Pure logic in a new `lib/listing.js`; DOM work in `content.js`.** Picked.
   It follows the existing `lib/geo.js` pattern: a classic script that loads
   in the page, the popup and Node, so price parsing, range checks and
   pruning get unit tests.
2. **Put everything in `lib/geo.js`.** Rejected because that file is about
   location.
3. **A background service worker owning the viewed list.** Rejected because
   the manifest deliberately has no worker, and the content script can write
   storage directly.

## Left to the builder

- Exactly where the badge sits (photo corner, size).
- How the price fields are validated in the popup (for example, min greater
  than max).
- Debounce timing and pruning details within the limits above.
