# Alpha Male D2C — File Map

The project is a JavaScript/JSX MERN application. The backend owns validation, authentication, business rules, and persistence; the frontend contains the storefront and staff interfaces.

## Shared application structure

| Purpose | Main files |
|---|---|
| React entry point and global styles | [frontend/src/main.jsx](./frontend/src/main.jsx), [frontend/src/styles.css](./frontend/src/styles.css), [frontend/src/store.css](./frontend/src/store.css) |
| Browser API client | [frontend/src/api.js](./frontend/src/api.js) |
| Express startup, middleware, webhooks, and worker scheduling | [backend/index.js](./backend/index.js) |
| API route registration and authorization | [backend/routes/api.js](./backend/routes/api.js) |
| MongoDB connection and initial data | [backend/config/database.js](./backend/config/database.js), [backend/seed.js](./backend/seed.js) |
| Local environment template and run instructions | [.env.example](./.env.example), [README.md](./README.md) |

## Module 1 — Acquisition and campaign landing pages

| Feature | Frontend | Backend |
|---|---|---|
| Campaign landing page, campaign form, and UTM capture | [frontend/src/App.jsx](./frontend/src/App.jsx), [frontend/src/attribution.js](./frontend/src/attribution.js), [frontend/src/styles.css](./frontend/src/styles.css) | [backend/controllers/apiController.js](./backend/controllers/apiController.js), [backend/models/LandingPage.js](./backend/models/LandingPage.js), [backend/models/Order.js](./backend/models/Order.js), [backend/models/Customer.js](./backend/models/Customer.js) |
| Meta Pixel / GA4 ecommerce events, persistent headline A/B assignment, and campaign social preview metadata | [frontend/src/analytics.js](./frontend/src/analytics.js), [frontend/src/seo.js](./frontend/src/seo.js), [frontend/src/App.jsx](./frontend/src/App.jsx), [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx), [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx), [frontend/index.html](./frontend/index.html) | [backend/controllers/apiController.js](./backend/controllers/apiController.js), [backend/controllers/paymentController.js](./backend/controllers/paymentController.js), [backend/models/ExperimentExposure.js](./backend/models/ExperimentExposure.js), [backend/models/LandingPage.js](./backend/models/LandingPage.js), [backend/models/Order.js](./backend/models/Order.js), [backend/controllers/crmController.js](./backend/controllers/crmController.js) |
| Campaign creation and editing | [frontend/src/App.jsx](./frontend/src/App.jsx) | [backend/routes/api.js](./backend/routes/api.js), [backend/controllers/apiController.js](./backend/controllers/apiController.js) |
| Seed campaign and sample product | [backend/seed.js](./backend/seed.js) | [backend/models/Product.js](./backend/models/Product.js) |

## Module 2 — Storefront, cart, checkout, and OTP

| Feature | Frontend | Backend |
|---|---|---|
| Collection, product pages, cart, frequently-bought-together, free-shipping progress, and checkout | [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx), [frontend/src/store.css](./frontend/src/store.css) | [backend/controllers/storeController.js](./backend/controllers/storeController.js) |
| Products, stock, coupons, and pincode serviceability | [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx), [frontend/src/CouponAdmin.jsx](./frontend/src/CouponAdmin.jsx) | [backend/models/Product.js](./backend/models/Product.js), [backend/models/Coupon.js](./backend/models/Coupon.js), [backend/models/Pincode.js](./backend/models/Pincode.js), [backend/seed.js](./backend/seed.js) |
| OTP login and customer order history | [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx) | [backend/models/Customer.js](./backend/models/Customer.js), [backend/models/OtpChallenge.js](./backend/models/OtpChallenge.js), [backend/utils/customerAuth.js](./backend/utils/customerAuth.js), [backend/utils/otpDelivery.js](./backend/utils/otpDelivery.js) |

## Module 3 — Payments

| Feature | Frontend | Backend |
|---|---|---|
| Razorpay test checkout, COD, partial COD, and payment confirmation | [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx) | [backend/controllers/paymentController.js](./backend/controllers/paymentController.js), [backend/models/Order.js](./backend/models/Order.js), [backend/index.js](./backend/index.js) |
| Server-side price/stock/payment integrity | [frontend/src/api.js](./frontend/src/api.js) | [backend/controllers/storeController.js](./backend/controllers/storeController.js), [backend/controllers/paymentController.js](./backend/controllers/paymentController.js) |

## Module 4 — Fulfilment

| Feature | Frontend | Backend |
|---|---|---|
| Order queue, packing, shipping, notes, labels, invoices, and manifests | [frontend/src/FulfilmentAdmin.jsx](./frontend/src/FulfilmentAdmin.jsx), [frontend/src/fulfilment.css](./frontend/src/fulfilment.css) | [backend/controllers/fulfilmentController.js](./backend/controllers/fulfilmentController.js), [backend/models/Order.js](./backend/models/Order.js), [backend/models/Sequence.js](./backend/models/Sequence.js) |
| Signed courier status events | — | [backend/index.js](./backend/index.js), [backend/controllers/fulfilmentController.js](./backend/controllers/fulfilmentController.js) |

## Module 5 — Post-purchase support

| Feature | Frontend | Backend |
|---|---|---|
| Order tracking and return requests | [frontend/src/PostPurchase.jsx](./frontend/src/PostPurchase.jsx), [frontend/src/postpurchase.css](./frontend/src/postpurchase.css) | [backend/controllers/postPurchaseController.js](./backend/controllers/postPurchaseController.js), [backend/models/ReturnRequest.js](./backend/models/ReturnRequest.js) |
| Support tickets and replies | [frontend/src/PostPurchase.jsx](./frontend/src/PostPurchase.jsx) | [backend/controllers/postPurchaseController.js](./backend/controllers/postPurchaseController.js), [backend/models/SupportTicket.js](./backend/models/SupportTicket.js) |
| Email/message order notifications and retries | [frontend/src/PostPurchase.jsx](./frontend/src/PostPurchase.jsx) | [backend/utils/orderNotifications.js](./backend/utils/orderNotifications.js), [backend/models/NotificationLog.js](./backend/models/NotificationLog.js) |

## Module 6 — CRM and staff operations

| Feature | Frontend | Backend |
|---|---|---|
| Staff login, role-aware workspace, customers, analytics, Kanban leads, carts, reviews, products, and staff creation | [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx), [frontend/src/crm.css](./frontend/src/crm.css), [frontend/src/App.jsx](./frontend/src/App.jsx) | [backend/utils/staffAuth.js](./backend/utils/staffAuth.js), [backend/routes/api.js](./backend/routes/api.js), [backend/controllers/crmController.js](./backend/controllers/crmController.js) |
| Customer profile, first-touch attribution, tags, notes, loyalty points | [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx), [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx) | [backend/models/Customer.js](./backend/models/Customer.js), [backend/controllers/crmController.js](./backend/controllers/crmController.js) |
| Callback leads and pipeline | [frontend/src/PostPurchase.jsx](./frontend/src/PostPurchase.jsx), [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx) | [backend/models/Lead.js](./backend/models/Lead.js), [backend/controllers/crmController.js](./backend/controllers/crmController.js) |
| Abandoned checkout and follow-up email worker | [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx), [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx) | [backend/models/AbandonedCart.js](./backend/models/AbandonedCart.js), [backend/controllers/crmController.js](./backend/controllers/crmController.js), [backend/controllers/paymentController.js](./backend/controllers/paymentController.js), [backend/index.js](./backend/index.js) |
| Verified reviews and moderation | [frontend/src/Storefront.jsx](./frontend/src/Storefront.jsx), [frontend/src/PostPurchase.jsx](./frontend/src/PostPurchase.jsx), [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx) | [backend/models/ProductReview.js](./backend/models/ProductReview.js), [backend/controllers/crmController.js](./backend/controllers/crmController.js) |
| Product/stock management, CSV exports, customer segments, and dashboard | [frontend/src/CRMAdmin.jsx](./frontend/src/CRMAdmin.jsx) | [backend/controllers/crmController.js](./backend/controllers/crmController.js), [backend/models/Product.js](./backend/models/Product.js), [backend/models/Order.js](./backend/models/Order.js) |

For the rationale, setup prerequisites, and end-to-end checklists, see [module.md](./module.md).
