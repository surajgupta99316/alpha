# Alpha Male D2C — Modules 1–6

The Alpha Male MERN assignment implemented through Module 6: campaign acquisition, storefront and checkout, test-mode payments, fulfilment operations, post-purchase care, and staff CRM.

## Project layout

```text
Alpha/
├── backend/
│   ├── config/          MongoDB connection
│   ├── controllers/     Request handling and validation
│   ├── models/          Mongoose schemas
│   ├── routes/           API endpoint definitions
│   ├── utils/            Auth, SMS delivery, and shared helpers
│   ├── index.js          Express server and startup
│   └── seed.js           Sample products, pincodes, coupons, campaign
├── frontend/
│   ├── src/              React pages, API client, styles
│   ├── index.html
│   └── vite.config.js
├── package.json          Install and run commands
└── .env                  Local database, ports, and private credentials
```

The root `package.json` runs frontend and backend together. Root `.env` is shared by the backend and the frontend development proxy.

## Requirements and startup

- Node.js 20 or newer
- MongoDB running locally (default: `mongodb://localhost:27017/alpha`)

```powershell
cd C:\Alpha
npm install
Copy-Item .env.example .env
npm run dev
```

Open the frontend URL printed in the terminal (usually `http://localhost:5173`). The API is usually available at `http://localhost:5000/api/health`.

## Module 1

- `/lp/alpha-bold` — published campaign landing page and one-step order request
- `/admin` — campaign studio for creating, editing, and publishing landing pages
- Optional Meta Pixel and Google Analytics 4 ecommerce events, campaign headline A/B assignment, and social preview metadata

To verify first-touch UTM attribution, open a URL such as:

```text
http://localhost:5173/lp/alpha-bold?utm_source=instagram&utm_medium=paid-social&utm_campaign=launch
```

Submit the order form and view its attribution in the campaign studio's order list.

To enable browser analytics, set `VITE_META_PIXEL_ID` and/or `VITE_GA_MEASUREMENT_ID` in `.env`, then restart Vite/rebuild. These are public measurement IDs, not secrets. The app emits page views plus Meta `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` and GA4 `view_item`, `add_to_cart`, `begin_checkout`, `purchase` events. Purchase is sent only once per browser/order and only after payment verification or COD confirmation. Check events in Meta Events Manager Test Events and GA4 DebugView/Realtime; ad blockers and browser privacy settings can prevent external delivery.

For a headline test, edit a campaign at `/admin`, enter an alternate Variant B headline, and save. New browser IDs are split approximately 50/50; their assignment is kept in local storage. Preview either assignment with `/lp/alpha-bold?ab_variant=A` or `?ab_variant=B`. The campaign analytics section at `/admin/analytics` reports unique recorded impressions, order requests, confirmed purchases, purchase rate, and revenue separately for each campaign and variant. Campaigns without a Variant B headline are excluded from the experiment report. The default Alpha Bold seed includes a Variant B headline.

For reliable social-card previews, share the campaign preview endpoint on the public API host: `https://<your-api-host>/api/campaign-preview/alpha-bold`. It returns server-rendered Open Graph and Twitter Card metadata to crawlers, then redirects human visitors to the frontend campaign page. Set `PUBLIC_API_URL` to the public API origin and `CLIENT_PUBLIC_URL` to the public frontend origin. The admin editor provides social preview links for the default headline and Variant B using `VITE_PUBLIC_API_URL`. Browser-rendered campaign pages also update their title, description, canonical URL, and social meta tags. Social platforms cache previews, so use their sharing debugger after changing a campaign.

## Module 2 storefront and checkout

- `/` — storefront home
- `/products` — searchable, filterable, sortable collection
- `/products/:slug` — product details, quantity selection, pincode delivery check
- `/cart` — persistent cart, coupon validation, frequently-bought-together suggestions, free-shipping progress
- `/checkout` — guest or signed-in checkout; pincode-derived city and state
- `/account` — mobile OTP login and customer order history
- `/admin/coupons` — coupon creation and management

The four fragrance products are seeded when the backend starts. Pincode serviceability data and the `WELCOME10` / `ALPHA100` sample coupons are also seeded into MongoDB.

### OTP / Twilio

OTP codes expire after five minutes, allow at most five verification attempts, and can be requested at most once per minute. For SMS delivery, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_PHONE_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` in the ignored root `.env`. Without Twilio credentials, local development prints the code in the backend terminal. Twilio trial accounts can send only to verified recipient numbers. The app sends to Indian mobile numbers using country code `+91`.

Keep Twilio credentials server-side: do not use a `VITE_` prefix and do not commit `.env`. For production, set a persistent random `AUTH_TOKEN_SECRET` of at least 32 characters.

### Checkout, payments, and security boundaries

The checkout API recalculates product prices, discounts, and shipping using MongoDB; browser totals are previews only. Pincode and stock are validated on the backend. Payment uses Razorpay test mode. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` to the ignored root `.env`, then restart the API. The backend creates the Razorpay order using the saved server-calculated order total and verifies checkout signatures before confirming online payments. Configure the Razorpay webhook URL as `https://<your-public-api-host>/api/payments/webhook`, subscribe to `payment.captured` and `payment.failed`, and use the same webhook secret in `.env`. Razorpay cannot deliver webhooks to localhost; use a secure public development tunnel for testing and never expose the key secret in frontend variables.

Cash on delivery is explicitly confirmed and limited to ₹3,000. Inventory is decremented once, only after payment verification or COD confirmation. Failed payments stay retryable. Online prepaid orders receive a 5% server-calculated discount; partial COD takes a 25% online deposit when the remaining COD balance is within the limit, and a confirmed COD order can be converted to prepaid from its confirmation page. Payment keys are blank in `.env.example`; add your own Razorpay test credentials locally.

Customer login sessions are bearer tokens; the frontend stores its token in local storage. Staff admin routes require a separate staff login and role authorization. Configure `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD` in `.env` before first startup to create the initial admin account; these values are only used while the staff collection is empty. Admin credentials are hashed with bcrypt. Keep `AUTH_TOKEN_SECRET` private and stable in production. The Razorpay and courier webhooks are independently authenticated with HMAC signatures.

## Module 4 fulfilment desk

Open `/admin/fulfilment` (also `/admin/orders`) for the operations workspace. Search by order number, customer name, or mobile; filter by fulfilment status, prepaid/COD method, date range, and campaign source; and page through results. Select orders for bulk invoice/label printing, packing, pick lists, and courier manifests. Order details include saved items, customer/address and payment data, attribution, an operator/time status timeline, internal notes, and shipment data.

Fulfilment status is stored separately from the payment status. The operational flow is New → Confirmed → Packed → Shipped → Out for delivery → Delivered, with Cancelled, RTO, and Returned transitions. Confirmed campaign orders and paid/COD-confirmed checkout orders can be packed; pending payments cannot. A courier booking is available after packing. This assignment uses a clearly marked mock courier (automatically selected from the destination pincode zone); it does not create a real Shiprocket booking.

Configure `COMPANY_GSTIN` with the real, valid 15-character GSTIN before issuing invoices. Set the legal company name/address, state, HSN, and GST rate in the backend `.env` as appropriate. Invoice amounts are treated as GST-inclusive; same-state supplies split GST into CGST/SGST, and other-state supplies use IGST. Invoice numbers are assigned from a persistent financial-year sequence. The GSTIN and legal tax configuration are intentionally blank/placeholders where appropriate; the API refuses to issue an invoice until they are configured. Orders without a saved customer state are also blocked rather than assigned an assumed GST jurisdiction.

Shipping labels are generated as 4 × 6 inch PDFs and include a QR code, AWB, address/phone, weight, courier, and COD amount. The signed mock courier webhook is `POST /api/courier/webhook`; configure a private `COURIER_WEBHOOK_SECRET` and send JSON fields `eventId`, `awb`, and `status` (`out_for_delivery`, `delivered`, `rto`, or `ndr`), plus an optional NDR note. Sign the exact raw request body as a SHA-256 HMAC hex digest in `x-courier-signature`. Replayed event IDs are ignored. An NDR event offers operations a reattempt or return-to-origin action. Manifest PDFs group selected courier-booked orders for pickup.

The fulfilment screen is an unauthenticated local assignment tool, and the operator name is an audit label supplied by the browser—not verified identity. Do not expose it publicly without staff authentication, authorization, and an actual courier integration.

## Module 5 post-purchase

- `/track` — public order tracking; customers verify with the order number and checkout mobile number. It shows the status timeline, AWB, courier, and any configured carrier tracking link.
- `/support` — creates a customer support ticket, optionally linked to an order after validating the same order number/mobile pair.
- `/admin/returns` — review return requests, approve or reject, record pickup, and complete a refund.
- `/admin/support` — move tickets between Open, In progress, and Closed; add internal replies; inspect/retry failed order notifications.

Returns are limited to seven days after the recorded Delivered event. Customers can select item quantities, choose a reason, add details, and upload an optional JPEG/PNG/WebP photo up to 1 MB. The photo is stored in MongoDB with the return request. The server prevents duplicate return quantities and calculates the merchandise refund after saved coupon/prepaid discounts. Razorpay refunds require a captured payment and are sent from the backend in the configured Razorpay mode; never use live credentials for this assignment. COD refunds are manual and require an operator-entered refund reference. If a Razorpay request times out, the attempt is held for dashboard reconciliation to avoid accidentally issuing a duplicate refund.

Notifications are recorded once per order event (`order_placed`, `shipped`, `delivered`) and visible in `/admin/support`. Delivery failures are retained and the admin can retry only failed channels. Email uses Resend when configured; in local development, missing Resend settings log the event instead. Set `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` to deliver real email. The secondary message channel is selected with `POST_PURCHASE_MESSAGE_CHANNEL`: `mock` logs locally, `sms` uses the existing Twilio credentials, and `whatsapp` uses a Meta WhatsApp Business Cloud API template. WhatsApp template must have four body parameters, in order: customer name, order number, event status, and tracking URL. Configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_TEMPLATE_NAME`; optional language and Graph API version settings are in `.env.example`. Set `CLIENT_PUBLIC_URL` to the deployed frontend URL for customer tracking links.

For a local check, complete a COD-confirmed or test-mode prepaid order; open its `/track` page using the exact order number/mobile. Pack and book its mock shipment from `/admin/fulfilment` to create the shipped notification, then send a signed courier webhook with status `delivered`. The tracking page will show the delivered event and allow a return request within seven days. Review the request in `/admin/returns` and advance it through Approved → Picked up → Refunded. A captured Razorpay order needs test API credentials for refunding; COD uses a manual refund reference. Create a ticket at `/support` and manage it at `/admin/support`.

Post-purchase admin endpoints require staff authentication. Operations manages returns; Sales/Support manages support tickets and notification retries.

## Module 6 CRM and customer operations

Set `BOOTSTRAP_ADMIN_EMAIL` and a unique 12+ character `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, restart the API, then sign in at `/admin`. Only an admin can create staff accounts from `/admin/staff`. Roles are enforced on every `/api/admin/*` endpoint: Admin can manage all areas, Operations can manage orders/fulfilment/returns, and Sales/Support can manage customer profiles, leads, abandoned carts, and tickets. Sales/Support responses omit order prices, product details, refund amounts, and loyalty balances.

- `/admin/crm` — customer search, customer 360 profiles, tags, private team notes, first-touch UTM, customer segments, and CSV exports.
- `/admin/leads` — callback-request Kanban; customer callback submissions from `/support` are added to this pipeline.
- `/admin/abandoned-carts` — unpaid checkout follow-up status and Resend email state.
- `/admin/analytics` — revenue/order trends, AOV, repeat-customer and RTO rates, campaign attribution, and order CSV.
- `/admin/products` — product details, HSN, availability, stock, and low-stock thresholds.
- `/admin/reviews` — approve/reject verified-purchase reviews. Customers may submit reviews from `/track` after delivery; approved reviews appear on product pages.
- `/admin/staff` — create role-scoped staff accounts.

Checkout and campaign orders preserve first-touch UTM data. Checkout creates a follow-up record; confirmed payments/COD convert it. If Resend credentials are configured, a background worker attempts abandoned-checkout email with limited retries. Set `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, and `CLIENT_PUBLIC_URL`; the customer can resume using the secure checkout link. Delivered courier events award loyalty points once per order and a customer referral code is shown in their account.

To test Module 6, use a delivered order to submit a review, then approve it at `/admin/reviews` and verify it appears on its product page. Submit a callback request from `/support` and move it across columns at `/admin/leads`. Create unpaid checkout data by saving an order without completing payment; inspect the record at `/admin/abandoned-carts`, then complete payment and verify it is marked converted. Search a customer in `/admin/crm`, edit tags/add a note, check segments, then test each staff role against permitted and forbidden pages. Edit stock to a value at/below the low-stock threshold and confirm it is highlighted. Export CSVs and open them in a spreadsheet to verify the exported columns and formula-safe text handling.

Earlier assignment admin tools now also require staff sign-in. Use the Admin role for Module 1 campaign studio, coupons, analytics, product/review management, and staff management; Operations for fulfilment/returns; Sales/Support for customer care and CRM.

## API routes

- `GET /api/health`
- `GET /api/products`
- `GET /api/landing-pages/:slug`
- `GET /api/admin/landing-pages`, `POST /api/admin/landing-pages`, `PUT /api/admin/landing-pages/:id`
- `GET /api/admin/orders`, `POST /api/orders`
- `GET /api/store/products`, `GET /api/store/products/:slug`
- `GET /api/serviceability/:code`
- `GET /api/coupons`, `POST /api/coupons/validate`
- `POST /api/store/checkout`
- `POST /api/payments/order-details`
- `POST /api/payments/razorpay/order`, `POST /api/payments/razorpay/verify`
- `POST /api/payments/cod/confirm`
- `POST /api/payments/webhook` — Razorpay signed raw-body webhook
- `POST /api/tracking`, `POST /api/returns`, `POST /api/support/tickets`
- `GET /api/admin/post-purchase/returns`, `PATCH /api/admin/post-purchase/returns/:id`, `GET /api/admin/post-purchase/returns/:id/photo`
- `GET /api/admin/post-purchase/tickets`, `PATCH /api/admin/post-purchase/tickets/:id`
- `GET /api/admin/post-purchase/notifications`, `POST /api/admin/post-purchase/notifications/:id/retry`
- `GET /api/admin/fulfilment/orders`, `GET /api/admin/fulfilment/orders/:id`
- `PATCH /api/admin/fulfilment/orders/:id/status`, `POST /api/admin/fulfilment/orders/:id/notes`
- `POST /api/admin/fulfilment/orders/:id/shipment`, `POST /api/admin/fulfilment/orders/:id/ndr`
- `GET /api/admin/fulfilment/orders/:id/invoice.pdf`, `GET /api/admin/fulfilment/orders/:id/label.pdf`
- `POST /api/admin/fulfilment/bulk/print`, `/pack`, `/pick-list`, `/manifest`
- `POST /api/courier/webhook` — signed mock courier status webhook
- `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`
- `GET /api/auth/me`, `GET /api/auth/orders`
- `GET /api/admin/coupons`, `POST /api/admin/coupons`, `PUT /api/admin/coupons/:id`
- `POST /api/staff/login`, `GET /api/staff/me`
- `GET /api/admin/crm/dashboard`, `/customers`, `/customers/:id`, `/segments`, `/leads`, `/abandoned-carts`, `/reviews`, `/products`
- `POST /api/leads`, `POST /api/reviews`, `GET /api/reviews/products/:slug`

## Build

```powershell
npm run build
```

The production frontend build is written to `frontend/dist`.

## Module 3 payment check

Use Razorpay **test** keys only. Place a checkout order and choose prepaid, partial COD, or COD confirmation on the order confirmation page. Razorpay checkout opens in test mode; use a test payment method from your Razorpay test account. The backend confirms the payment signature and inventory change. For webhook checks, point a test endpoint at `/api/payments/webhook`, subscribe to `payment.captured` and `payment.failed`, and use the matching webhook secret. COD is capped at ₹3,000, requires an explicit confirmation, and can be converted to prepaid before delivery.

## Module 4 fulfilment check

Open `/admin/fulfilment`, find a paid or COD-confirmed order, and mark it Confirmed, then Packed. Enter package weight and book the mock courier; download its 4 × 6 label and add the shipment to a manifest. Use the order’s internal notes and status timeline to verify operator/time auditing. Invoices require a real `COMPANY_GSTIN` configured in `.env`; printing does not make an external tax filing. Bulk select orders to create combined PDFs and a product-quantity pick list.
