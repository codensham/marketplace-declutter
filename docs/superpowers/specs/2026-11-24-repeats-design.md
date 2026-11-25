# Hide repeated listings — design

Date: 2026-11-24 · Approved by the user in chat.

## Why

The browse feed often shows the same listing twice (user's screenshot:
"Omada TP-Link ER605" and "Women's small color block dress", each twice).
A live check of the Richmond feed found 11 of 340 cards (about 3%) were a
second copy of a listing already on the page, with the same item ID.

## Goal

Hide every card whose listing ID is already shown in another card on the
page. The first copy always stays.

## Non-goals

- Separate listings that only look alike (same title, price and city). On a
  live "couch" search, five such matches were five different couches.
- Matching photos: Facebook gives each upload its own image URL, and
  comparing pixels would need new network requests.

## Anti-goals

- Hiding the only copy of a listing.
- Any network request.

## Approaches

1. **Same listing ID — chosen.** Certain, no false positives, no new data.
2. Same title + price + city: catches cross-posts too, but hides different
   items with generic titles.
3. Photo comparison: most reliable for reposts, but needs the extension to
   download thumbnails, breaking the "no network requests" promise.

## Design

- New verdict `repeat`, applied after the other checks to a card that would
  otherwise be kept or unknown, when an earlier card on the page with the
  same listing ID is still kept (not hidden for another reason).
- Setting `hideRepeats`, default on. Popup: "Repeats" row in Listings with an
  eye switch and an "N hidden" count.
- Counted in the popup's total like the other reasons.
