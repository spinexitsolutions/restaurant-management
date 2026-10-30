# DineFlow: Restaurant Management SaaS

QR menu, WhatsApp ordering, POS billing, kitchen and waiter panels with GST invoicing, built as a multi-restaurant SaaS.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS · PostgreSQL (Supabase) · Prisma · Vitest

## What's built (Phase 1)

| Area | Features |
|---|---|
| Onboarding | Restaurant signup with 14-day trial, optional sample menu, 6 default tables |
| Auth & roles | Owner, Manager, Cashier, Waiter, Chef, Super admin. Role/deactivation takes effect immediately |
| Menu | Categories (reorder, hide), items with veg/non-veg/egg, variants (Half/Full), add-on groups with min/max, item-wise GST, bestseller, spice level, sold-out toggle |
| Tables & QR | Bulk create (e.g. R1–R10), areas, per-table QR, download, print-all sheet, regenerate QR |
| Staff | Add staff with login, change role, reset password, deactivate |
| Settings | Restaurant profile & FSSAI; GST (GSTIN validation, inclusive/exclusive, default rate, service charge, invoice prefix) with a live bill preview |
| Payments | UPI ID → UPI QR. Add Razorpay keys (verified, stored AES-256-GCM encrypted) and Razorpay takes over; remove keys to fall back to UPI QR |
| Customer QR menu | Mobile-first menu at `/m/<slug>?t=<table>`: search, veg filter, category tabs, variant/add-on picker, cart with GST bill, **Order on WhatsApp** |
| Super admin | `/admin`: list all restaurants, suspend/activate |
| GST engine | `src/lib/gst.ts`: paise-accurate CGST/SGST, inclusive/exclusive, proportional discounts, taxed service charge, round-off (unit tested) |

## Roadmap

- **Phase 2:** QR in-app ordering → Kitchen Display (realtime) → Waiter app → POS billing → GST invoice (print/PDF/WhatsApp) → payments (UPI QR / Razorpay checkout, split payments)
- **Phase 3:** Offline POS (PWA), split/merge tables, discounts with approval, reports, day-end closing
- **Phase 4:** Inventory & recipes, CRM & loyalty, reservations, attendance
- **Phase 5:** Multi-outlet, subscription billing, aggregator integrations, AI insights

## Local setup

Requires Node 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET, ENCRYPTION_KEY
npm run db:migrate          # create tables
npm run db:seed             # create the super admin from .env
npm run dev                 # http://localhost:3000
```

### Using Supabase (free tier)

1. Create a project at supabase.com.
2. **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = *Transaction pooler* URL (port 6543) + `?pgbouncer=true`
   - `DIRECT_URL` = *Session pooler / direct* URL (port 5432)
3. Run `npm run db:deploy` to apply migrations.

Note: free Supabase projects pause after a period of inactivity. Use a paid plan for restaurants that are live.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (GST, cart, payments) |
| `npm run typecheck` / `lint` | Static checks |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Database |

## Security notes

- Every query is scoped by `restaurantId` from the server-side session; nothing trusts a restaurant id from the client.
- Sessions are signed JWTs in httpOnly cookies. User role and active status are re-checked against the database on each request.
- Razorpay secrets are encrypted with `ENCRYPTION_KEY` and never sent to the browser. Changing `ENCRYPTION_KEY` makes saved secrets unreadable.
