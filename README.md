# Alpha Male D2C — Modules 1–4

The Alpha Male MERN assignment implemented through Module 4: campaign acquisition, storefront and checkout, test-mode payments, and the operations fulfilment desk.

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

To verify first-touch UTM attribution, open a URL such as:

```text
http://localhost:5173/lp/alpha-bold?utm_source=instagram&utm_medium=paid-social&utm_campaign=launch
```

Submit the order form and view its attribution in the campaign studio's order list.

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

Admin routes are unauthenticated for this local assignment. Add admin authentication and role checks before exposing the API publicly. Customer login sessions are bearer tokens; the frontend stores its token in local storage. The Razorpay webhook is independently authenticated with its HMAC signature.

## Module 4 fulfilment desk

Open `/admin/fulfilment` (also `/admin/orders`) for the operations workspace. Search by order number, customer name, or mobile; filter by fulfilment status, prepaid/COD method, date range, and campaign source; and page through results. Select orders for bulk invoice/label printing, packing, pick lists, and courier manifests. Order details include saved items, customer/address and payment data, attribution, an operator/time status timeline, internal notes, and shipment data.

Fulfilment status is stored separately from the payment status. The operational flow is New → Confirmed → Packed → Shipped → Out for delivery → Delivered, with Cancelled, RTO, and Returned transitions. Confirmed campaign orders and paid/COD-confirmed checkout orders can be packed; pending payments cannot. A courier booking is available after packing. This assignment uses a clearly marked mock courier (automatically selected from the destination pincode zone); it does not create a real Shiprocket booking.

Configure `COMPANY_GSTIN` with the real, valid 15-character GSTIN before issuing invoices. Set the legal company name/address, state, HSN, and GST rate in the backend `.env` as appropriate. Invoice amounts are treated as GST-inclusive; same-state supplies split GST into CGST/SGST, and other-state supplies use IGST. Invoice numbers are assigned from a persistent financial-year sequence. The GSTIN and legal tax configuration are intentionally blank/placeholders where appropriate; the API refuses to issue an invoice until they are configured. Orders without a saved customer state are also blocked rather than assigned an assumed GST jurisdiction.

Shipping labels are generated as 4 × 6 inch PDFs and include a QR code, AWB, address/phone, weight, courier, and COD amount. The signed mock courier webhook is `POST /api/courier/webhook`; configure a private `COURIER_WEBHOOK_SECRET` and send JSON fields `eventId`, `awb`, and `status` (`out_for_delivery`, `delivered`, `rto`, or `ndr`), plus an optional NDR note. Sign the exact raw request body as a SHA-256 HMAC hex digest in `x-courier-signature`. Replayed event IDs are ignored. An NDR event offers operations a reattempt or return-to-origin action. Manifest PDFs group selected courier-booked orders for pickup.

The fulfilment screen is an unauthenticated local assignment tool, and the operator name is an audit label supplied by the browser—not verified identity. Do not expose it publicly without staff authentication, authorization, and an actual courier integration.

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
- `GET /api/admin/fulfilment/orders`, `GET /api/admin/fulfilment/orders/:id`
- `PATCH /api/admin/fulfilment/orders/:id/status`, `POST /api/admin/fulfilment/orders/:id/notes`
- `POST /api/admin/fulfilment/orders/:id/shipment`, `POST /api/admin/fulfilment/orders/:id/ndr`
- `GET /api/admin/fulfilment/orders/:id/invoice.pdf`, `GET /api/admin/fulfilment/orders/:id/label.pdf`
- `POST /api/admin/fulfilment/bulk/print`, `/pack`, `/pick-list`, `/manifest`
- `POST /api/courier/webhook` — signed mock courier status webhook
- `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`
- `GET /api/auth/me`, `GET /api/auth/orders`
- `GET /api/admin/coupons`, `POST /api/admin/coupons`, `PUT /api/admin/coupons/:id`

## Build

```powershell
npm run build
```

The production frontend build is written to `frontend/dist`.

## Module 3 payment check

Use Razorpay **test** keys only. Place a checkout order and choose prepaid, partial COD, or COD confirmation on the order confirmation page. Razorpay checkout opens in test mode; use a test payment method from your Razorpay test account. The backend confirms the payment signature and inventory change. For webhook checks, point a test endpoint at `/api/payments/webhook`, subscribe to `payment.captured` and `payment.failed`, and use the matching webhook secret. COD is capped at ₹3,000, requires an explicit confirmation, and can be converted to prepaid before delivery.

## Module 4 fulfilment check

Open `/admin/fulfilment`, find a paid or COD-confirmed order, and mark it Confirmed, then Packed. Enter package weight and book the mock courier; download its 4 × 6 label and add the shipment to a manifest. Use the order’s internal notes and status timeline to verify operator/time auditing. Invoices require a real `COMPANY_GSTIN` configured in `.env`; printing does not make an external tax filing. Bulk select orders to create combined PDFs and a product-quantity pick list.
