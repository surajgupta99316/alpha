# Alpha Male D2C — Module 1

Module 1 of the Alpha Male MERN assignment: an admin-managed campaign landing page, a mobile-first product story, a one-step order-request form, and first-touch UTM attribution saved with each order.

## Project layout

```text
Alpha/
├── backend/
│   ├── config/          MongoDB connection
│   ├── controllers/     Request handling and validation
│   ├── models/          Mongoose schemas
│   ├── routes/          API endpoint definitions
│   ├── utils/           Shared backend helpers
│   ├── index.js         Express server and startup
│   └── seed.js          Sample products and campaign
├── frontend/
│   ├── src/             React pages, API client, styles
│   ├── index.html
│   └── vite.config.js
├── package.json         Install and run commands
└── .env                 Local database and port settings
```

The root `package.json` runs both folders so the project can be started with one command. The root `.env` is shared by the backend and frontend development proxy.

## Requirements

- Node.js 20 or newer
- MongoDB running locally (default: `mongodb://localhost:27017/alpha`)

## Run locally

```powershell
cd C:\Alpha
npm install
Copy-Item .env.example .env
npm run dev
```

To verify first-touch attribution, open a campaign URL such as:

```text
http://localhost:5173/lp/alpha-bold?utm_source=instagram&utm_medium=paid-social&utm_campaign=launch
```

The first non-empty UTM source, medium, and campaign are kept in the browser and submitted with an order request. Admin order requests show this attribution. The API sets the order amount from the product price in MongoDB, not from the browser.

## Build

```powershell
npm run build
```

The production frontend build is written to `frontend/dist`.

## API routes

- `GET /api/health`
- `GET /api/products`
- `GET /api/landing-pages/:slug` — published landing page
- `GET /api/admin/landing-pages` — campaign studio
- `POST /api/admin/landing-pages` — create a campaign
- `PUT /api/admin/landing-pages/:id` — edit or publish a campaign
- `GET /api/admin/orders` — latest 100 order requests and their attribution
- `POST /api/orders` — create an order request from a published campaign

Admin routes are intentionally unauthenticated for this local assignment module. Add authentication and role checks before exposing the admin/API publicly. Payments, address serviceability, full checkout, and customer accounts belong to later modules and are not implemented here.

Overall module 1
1.campaign landing page at http://localhost:5173/lp/alpha-bold
2.admin campaign studio at http://localhost:5173/admin
3.You can also create a campaign with a new URL slug, save it as a draft, then publish it and visit http://localhost:5173/lp/your-slug

