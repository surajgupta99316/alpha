# Alpha Male D2C — Module Design and Verification Guide

The implementation uses JavaScript/JSX throughout. React handles customer and staff interactions; Express validates requests and applies business rules; MongoDB/Mongoose persists products, customers, orders, payments, fulfilment events, support records, and CRM data. Do not trust browser-submitted prices or role names: the server recalculates checkout totals and loads the staff role from the signed-in database account.

## Before running

1. Start MongoDB locally, using `mongodb://localhost:27017/alpha` by default.
2. In the project root, run `npm install`, copy `.env.example` to `.env`, and set the private provider values you intend to test.
3. For the first Module 6 admin login, set `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD` in `.env` before starting the API. The server creates this account only while the staff collection is empty.
4. Run `npm run dev` and open the frontend URL shown in the terminal (usually `http://localhost:5173`). Check API startup at `http://localhost:5000/api/health`.
5. Use Razorpay test credentials, never live credentials, for payment testing. Resend/Twilio/courier webhooks are optional unless testing those integrations.

## Module 1 — Acquisition

**Design:** A published landing page is linked to a product, and the campaign path `/lp/:slug` loads the page data from MongoDB. The browser retains first-touch UTM values and includes them with the order request so campaigns can be connected with later customer and order reports. Optional Meta Pixel and GA4 event dispatch covers page views, product views, add-to-cart, checkout initiation, and confirmed purchase. Headline A/B assignment is random and persistent per browser/campaign; experiment impressions and campaign order outcomes feed a per-campaign analytics report. Campaigns without an alternate headline are not counted as experiment orders. Browser pages update SEO/social metadata, while `/api/campaign-preview/:slug` returns crawler-readable server-rendered Open Graph/Twitter tags and redirects human visitors to the public campaign page.

**Check:** Open `/lp/alpha-bold?utm_source=instagram&utm_medium=paid-social&utm_campaign=launch`. Compare `/lp/alpha-bold?ab_variant=A` with `?ab_variant=B`; a normal visit should retain one assignment. Set `VITE_META_PIXEL_ID` and/or `VITE_GA_MEASUREMENT_ID`, restart Vite, and inspect Meta Test Events or GA4 DebugView while viewing a campaign/product, adding an item to cart, beginning checkout, and confirming payment/COD. Submit the campaign form with valid customer information. Sign in at `/admin`, open the order requests, and verify the order, attribution, and selected headline variant. At `/admin/analytics`, compare A/B impressions, order requests, paid/COD conversions, conversion rate, and revenue. For a crawler-style social preview, open `https://<public-api-host>/api/campaign-preview/alpha-bold` (locally `http://localhost:5000/api/campaign-preview/alpha-bold`) and inspect the returned `og:*` and `twitter:*` tags; a browser should redirect to the frontend campaign. Create or edit a draft campaign and publish it to verify that only published pages are public. Campaign URL slugs must be unique; edit an existing campaign to change its headlines instead of creating another campaign with the same slug.

## Module 2 — Storefront and checkout

**Design:** Products, pincode serviceability, and coupons are server-backed. The cart is stored in the browser for continuity, but the backend reloads product prices, checks stock and serviceability, and recalculates discounts and shipping before saving checkout.

**Check:**

1. Browse `/` and `/products`; open a product detail page and check a seeded serviceable pincode such as `400001`, then try an unseeded pincode.
2. Add products, change quantity, and open `/cart`. Verify coupon validation, the frequently-bought-together suggestion, and the free-shipping progress bar.
3. Continue to `/checkout`; try a valid pincode and an invalid/non-serviceable one. The server should reject unavailable stock or service.
4. Open `/account` to request and verify an OTP. Without Twilio configured, the development code is logged in the API terminal; with a Twilio trial account, only verified recipient numbers can receive SMS.

## Module 3 — Payments

**Design:** Orders and totals are persisted server-side. Razorpay is called only by the backend, which verifies the signed payment response before marking the order paid and deducting stock. COD requires explicit customer confirmation, and partial COD collects a deposit while recording the remaining balance.

**Check:** Place an order and test a Razorpay payment using test credentials. Also test COD on an order within the configured limit and the rejected case above it. Confirm order/payment status and stock changes in MongoDB or the order detail screen. To exercise webhooks, expose the API securely through a development tunnel and configure the matching Razorpay webhook secret and events.

## Module 4 — Fulfilment

**Design:** Payment and fulfilment are distinct state machines. Operations staff search/filter eligible orders, record pack/ship actions and internal notes, and generate fulfilment PDFs. Courier status callbacks require a signature over the exact raw body and deduplicate event IDs.

**Check:** Sign in as Operations. Open `/admin/fulfilment`, advance an eligible order through Confirmed and Packed, book the mock courier, print its label, and create a manifest. Send a correctly signed courier event for the AWB and verify the tracking timeline. Invoice generation requires valid company GST information in `.env`.

## Module 5 — Post-purchase

**Design:** Customers can look up an order using the order number and checkout phone, submit a return request within the return window, and create support tickets. Staff actions and notification delivery attempts are stored for follow-up.

**Check:** Use `/track` with an order number and matching phone. Complete a mock shipment and delivery, then submit a return request while it is eligible. Sign in with Operations at `/admin/returns` to move it through the allowed states. Create a ticket at `/support`; sign in as Sales/Support and manage it at `/admin/support`. If email/message providers are configured, inspect and retry failed notifications there.

## Module 6 — CRM and staff operations

**Design:** `/admin/*` routes require a signed staff session; server-side role checks are applied before all admin handlers. Admin can manage all areas, Operations can manage orders/fulfilment/returns, and Sales/Support can work customer profiles, leads, abandoned carts, tickets, and related exports. Sales/Support CRM responses intentionally omit prices, product details, refund amounts, and loyalty balances. Customer-facing reviews are limited to products purchased in a delivered order and stay hidden until approved.

**Check:**

1. Sign in as the bootstrapped admin at `/admin`; create an Operations and a Sales/Support account at `/admin/staff`. Sign out and test each account against its allowed and forbidden workspaces.
2. Submit a callback request at `/support`, then move it through statuses in the column board at `/admin/leads`.
3. Search for a customer at `/admin/crm`. Inspect orders, first-touch source, returns, and tickets; add a tag and team note. Filter the customer list by a segment and try its CSV export.
4. Complete a checkout but leave payment unconfirmed. Check `/admin/abandoned-carts`; complete payment/COD and verify the cart changes to converted. With Resend configured, allow the worker's one-hour initial delay (or adjust `nextEmailAt` in a local test database) and inspect its send status and resume link.
5. Deliver an order, use `/track` to submit a product review, approve it in `/admin/reviews`, and confirm the approved review appears on that product page.
6. Edit stock and the low-stock threshold at `/admin/products`; make stock fall at/below the threshold and verify the low-stock indicator. Use `/admin/analytics` to inspect campaign/revenue metrics and export orders.

## Role and deployment notes

- A development bootstrap admin is created only when `StaffUser` has no records. If no bootstrap credentials are set, startup succeeds but no staff can sign in until an admin is provisioned.
- Staff passwords are hashed with bcrypt. Staff tokens expire after eight hours; changing the active flag blocks the account on its next request.
- `AUTH_TOKEN_SECRET` must be stable, private, and at least 32 characters in production. Never put provider secrets in frontend variables or commit `.env`.
- The login throttle is in-memory and therefore is not shared between multiple API instances. For a production deployment, use a shared rate limiter and a durable job queue for abandoned-cart email processing.
- The abandoned-cart email worker checks every minute and retries failures a limited number of times. Set `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, and `CLIENT_PUBLIC_URL` to enable real delivery.
- The repository's [README.md](./README.md) contains the complete API setup and provider configuration notes; [files.md](./files.md) maps features to their source files.
