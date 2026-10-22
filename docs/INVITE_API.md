# Valuation request API (for the buyer-qualification system)

Send one request per buyer per listing, once the buyer has had the listing's materials for 1 to 2 weeks.
PriceAFirm onboards the listing if its URL is new, creates the buyer's account if needed, and emails the buyer
a link that signs them in and opens that listing's valuation form.

## Request

```
POST https://<APP_URL>/api/invites
Authorization: Bearer <INVITE_API_SECRET>
Content-Type: application/json

{
  "buyer_name": "Jane Doe",
  "buyer_email": "jane@fund.com",
  "listing_url": "https://www.synergybb.com/listings/12345",
  "information_level": "cim",            // optional: "cim" (default, buyer has materials) or "listing"
  "request_id": "crm-buyer-881-listing-12345",   // optional but recommended: makes retries safe
  "resend": false                         // optional: true re-sends with a fresh link if an open request exists
}
```

## Responses (JSON, always has `status` and `message`)

| HTTP | status | Meaning | Email sent? |
|---|---|---|---|
| 200 | `sent` | Email delivered to the provider. Includes `invite_url` / `inviteUrl`, `inviteId`, `userId`, `snapshotId`, `listingStatus` (`existing` or `created`) | Yes |
| 200 | `captured` | Email sending not configured yet; recorded in Admin > Invites outbox. Includes the link | No |
| 200 | `held` | Listing was new and its facts need review (Admin > Review). Email goes out automatically on approval | Later |
| 200 | `already_invited` | Open request exists (or same `request_id` seen before). Use `resend: true` to send again | No |
| 200 | `already_valued` | Buyer already valued this business | No |
| 200 | `exposed` | Buyer saw crowd figures for this business in Find Deals; a scored valuation is impossible | No |
| 400 | `invalid` | Bad JSON, missing fields, or unusable URL. `issues` lists fields | No |
| 401 | `unauthorized` | Missing or wrong bearer secret | No |
| 422 | `listing_rejected` | URL is on an excluded site (e.g. BizBuySell) or the publisher was removed on complaint | No |
| 502 | `email_failed` | Provider rejected the email; safe to retry with `resend: true` | No |
| 500 | `error` | Internal error; safe to retry with the same `request_id` | No |

## Notes
- The same buyer email can appear in any number of requests for different listings; it is one account.
- Listings are identified by URL. Tracking parameters and `www.` are ignored, so the same page always maps to the same listing.
- Links last `INVITE_TTL_DAYS` (default 30) and can be opened more than once until then. A resend replaces the link.
- Buyers can later sign in with an email link or a password they set under Account.

## Make.com setup (HTTP > Make a request)
URL `https://<APP_URL>/api/invites`, method POST, header `Authorization: Bearer <secret>`, body type Raw / JSON,
content as above. Map `request_id` to a stable key such as `<buyer row id>-<listing id>`. Route on `status`.

## Test with curl
```
curl -sS -X POST "$APP_URL/api/invites" -H "Authorization: Bearer $INVITE_API_SECRET" -H "Content-Type: application/json" \
  -d '{"buyer_name":"Test Buyer","buyer_email":"you+buyer1@example.com","listing_url":"https://www.synergybb.com/listings/dev-xxxxxxxx","request_id":"test-1"}'
```
