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

## What's built (Phase 2): ordering to billing

| Area | Features |
|---|---|
| Customer QR ordering | Customer places the order from the table QR. Staff accepts it first (or turn on auto-accept). Live tracking page with item status, **Order more**, **Call waiter**, **Water** and **Get the bill** |
| Waiter (`/dashboard/waiter`) | Mobile table map (free / running / bill printed), alerts for new QR orders, ready food and customer requests, take orders, accept/reject, mark served |
| Kitchen display (`/dashboard/kitchen`) | Dark TV-friendly KOT board, per-item New → Cooking → Ready, colour timer (10/20 min), kitchen notes, sound alert |
| POS (`/dashboard/pos`) | Table map, takeaway and delivery orders, today's sales, discount (% or ₹), generate bill, reopen bill, cancel items/orders with reason |
| GST invoice | 80 mm thermal-friendly tax invoice with GSTIN, FSSAI, SAC 996331 and rate-wise CGST/SGST. Invoice numbers run per financial year (`INV/26-27/0001`). Print, or share a public link on WhatsApp |
| Payments | Cash (with change calculator), UPI QR with the bill amount, card, other. Split payments. Customers can pay from their phone with a UPI QR, or with Razorpay Checkout once keys are saved. Signature-verified, amount taken from Razorpay, webhook for closed tabs, no double-counting |
| Orders (`/dashboard/orders`) | Day-wise order history with status filter and collection by payment method |
| Live updates | Every screen polls a per-restaurant change counter every 2–5 s and refreshes when something changes. Works on any host with no extra services |

Staff land on their own screen after login: chef → Kitchen, waiter → Tables, cashier → POS.

### Razorpay webhook (optional but recommended)

In Razorpay Dashboard → Webhooks, add `https://<your-domain>/api/webhooks/razorpay/<restaurantId>` (shown in Settings → Razorpay) for the `payment.captured` event, and paste the same secret in Settings. Payments then get recorded even if the customer closes the page.

## What's built (Phase 3): control, reports & resilience

| Area | Features |
|---|---|
| Manager PIN | Owners/managers set a 4–6 digit PIN (Staff page). Cashiers and waiters need it for discounts, reopening bills, cancelling whole orders, and cancelling food the kitchen already started. Wrong PINs are throttled (5 tries, then a 5 min lock). Can be turned off in Settings |
| Audit log | Discounts, cancellations, reopened bills, rejected QR orders, table moves/merges/splits and day closes, with who did it and who approved (Reports → Audit log) |
| Tables | **Move** an order to a free table, **merge** another running table into this bill, **split** chosen items (even part of a quantity) into a separate bill, and "split equally" between N people when collecting payment |
| Reports | Any date range (presets: today, yesterday, 7 days, this month): net sales, bills, average bill, discounts, GST, payment methods, GST rate summary, sales by hour, categories, best-selling items, staff. **Sales register CSV** (invoice-wise, Excel-ready) for the accountant |
| Day close | Collections by payment method, opening cash (carried from the last close), expected vs counted cash with short/excess, cash taken out, note, history, and a WhatsApp summary for the owner |
| Photos | Upload menu photos and logo. Images are resized in the browser (WebP) and stored in the database, so it works on any host without extra storage setup |
| Offline & PWA | Installable app (Add to Home Screen). Pages already opened keep working offline. KOTs and payments made offline are queued on the device and synced automatically when the internet returns, without duplicates (each carries a request id) |

## What's built (Phase 4): inventory, customers, bookings & staff

| Area | Features |
|---|---|
| Inventory (`/dashboard/inventory`) | Ingredients with unit (kg/g/l/ml/pcs), opening stock, low-stock level. **Purchase** (updates weighted average cost, supplier), **wastage**, **physical count**. Stock value, low-stock alert and WhatsApp list, full movement history |
| Recipes & food cost | Per-dish recipe, with optional per-size recipes (Half/Full). Food cost % per dish/size, colour-coded |
| Automatic stock | Ingredients are deducted when items reach the kitchen (KOT accepted), returned if an item is cancelled before cooking, and counted as used if it was already being cooked. Sales are never blocked by stock |
| Customers (`/dashboard/customers`) | Created automatically from the mobile number on a bill. Visits, total spent, average bill, favourite dishes, notes, order history. Search |
| Loyalty points | Earn X points per ₹100 on paid bills, redeem as a discount before tax (min points, ₹ per point configurable). Points are taken at billing, returned if the bill is reopened or cancelled, and shown on the invoice. Full points ledger and manual adjustment with reason (audited) |
| Birthday & anniversary | Upcoming 7 days on the dashboard, one-tap WhatsApp offer from a template |
| Reservations (`/dashboard/reservations`) | Staff bookings, optional public booking page (`/m/<slug>/book`) with request → confirm flow and spam limits, table assignment with capacity warning, "Reserved 8 PM" on the table map, seat & start order, no-show/cancel, WhatsApp confirmation |
| Attendance | Clock in/out for every staff member (sidebar or Overview). Manager view: today's status, month summary of days and hours, close forgotten shifts |

## What's built (Phase 5): chains, SaaS billing, aggregators, automation & AI

| Area | Features |
|---|---|
| Multi-outlet (`/dashboard/outlets`) | Restaurants belong to an organisation. Owners add outlets (settings and menu copied), switch between them from the sidebar, see today/month sales and running orders per outlet, and copy menus between outlets (adds missing items only). Each outlet keeps its own tables, staff, stock, customers and subscription |
| SaaS subscription (`/dashboard/billing`) | Per-outlet plans (monthly / 3 months / yearly, prices in `src/lib/plans.ts`), paid through **your** Razorpay account (`PLATFORM_RAZORPAY_*`). Signature and amount verified with Razorpay, no double credit. Renewals extend from the current expiry. GST tax invoice with CGST+SGST or IGST by place of supply, SAC 998314, series `SUB/26-27/0001`. Warnings 7 days before expiry; after a 3-day grace period new orders are blocked (data stays safe) |
| Super admin (`/admin`) | Paying / trial / expired counts, revenue this month, manual plan extension for cash or bank payments (with invoice), recent subscription payments |
| Zomato & Swiggy | POS buttons to punch aggregator orders with their order ID, so they reach the kitchen, stock and reports. Bills carry no GST or service charge (the platform pays GST under Section 9(5)) and are settled as "Paid by Zomato/Swiggy". Reports show sales by channel with estimated commission |
| WhatsApp Business API | Per-restaurant Meta Cloud API setup (token encrypted). Automatic bill link after payment, booking confirmation, birthday/anniversary wishes (once a year) and the owner's daily summary, all with approved templates. Test button and a message log. Messages are sent after the response, so billing is never slowed down |
| Daily job (`/api/cron/daily`) | Runs at 9 AM IST via Vercel Cron (`vercel.json`, `CRON_SECRET`): wishes, daily summaries, and closing shifts left open for more than 16 hours |
| Insights (`/dashboard/insights`) | Week-on-week sales, average bill, busiest/slowest weekday, peak hour, trending dishes, slow sellers (after 3 weeks of history), high food cost, discount and cancellation alerts. **Stock forecast for tomorrow** from the same weekday over 4 weeks. Optional **AI summary** in Hinglish or English written by Claude (`ANTHROPIC_API_KEY`), cached per outlet per day |

## Security, printing, kitchen stations & B2B

| Area | Features |
|---|---|
| Sign-in protection | Password logins lock for 15 minutes after 5 failures per account (30 per IP), stored in the database. Unknown emails take as long as wrong passwords. Approval PINs use the same database throttling |
| OTP login & forgot password | 6-digit codes by WhatsApp (platform Meta number), SMS (MSG91) or email (Resend), whichever is configured. Codes are hashed, expire in 10 minutes, allow 5 tries, max 3 per 15 minutes, and never reveal whether an account exists. Resetting a password signs the user out on every device; so does a manager resetting a staff password. Super admin can issue an owner a temporary password |
| Kitchen stations (`/dashboard/kitchen-setup`) | Stations like Tandoor / Chinese / Bar. Set per category, override per dish. Each order item remembers its station; the kitchen screen has a tab per station |
| Thermal printing | KOTs print automatically when an order reaches the kitchen (split by station), a cancellation slip prints when a cooked item is cancelled, and bills print on generate. Reprint buttons on every order. Jobs retry up to 5 times |
| Print station (`/dashboard/print-station`) | For printers attached to a PC or tablet: the installed printer (silent with Chrome `--kiosk-printing`), USB (WebUSB) or Bluetooth BLE, 58 or 80 mm |
| Print agent (`print-agent/agent.mjs`) | For network printers (port 9100) or USB device paths: a dependency-free Node script that runs on a PC in the restaurant with the printer's token |
| B2B invoices | Buyer GSTIN (format, state code and check digit validated), business name and address on the tax invoice and printed bill, remembered on the customer. The sales register CSV marks each bill B2B, B2C or Sec 9(5) with buyer GSTIN for GSTR-1 |

## Customer menu experience

| Feature | How it works |
|---|---|
| Split bill from phones | On the bill page each guest can pay the full bill, an equal share (2-20 people), just their dishes (their share of tax/discount included) or any amount, by Razorpay (recorded automatically) or UPI QR (staff confirms). "Share with friends" sends the link on WhatsApp, and everyone sees what's been paid |
| Dish gallery & video | Up to 4 extra photos and a YouTube / .mp4 video per dish. Tapping a dish opens a detail view with photos, video, rating and pairings |
| "Goes well with" | Owner-chosen pairings first, then dishes customers ordered together in the last 60 days (seen in at least 2 orders). Shown after adding a dish, in the dish view and in the cart |
| Order again | The phone remembers its last order per restaurant; next visit it's one tap to add it again (unavailable dishes are skipped). Kept on the device, so no one can look up another person's orders by phone number |
| Thali builder & kids | "Thali template" pre-fills choose-2-sabzi / dal / bread / extras groups; customers see per-group progress. Dishes can be marked kids-friendly, with a Kids filter on the menu |
| Dish ratings | After paying, guests rate each dish (1-5 stars, optional comment) once, within 7 days. The menu shows the average after 3 ratings; owners see ratings in the menu list, comments and poorly rated dishes in Insights |

## Going live (Vercel + Supabase)

1. Create a Supabase project and copy the pooled and direct connection strings into `DATABASE_URL` / `DIRECT_URL`.
2. Import the repository in Vercel and set every variable from `.env.example` (generate `AUTH_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` with `openssl rand -base64 32`; set `NEXT_PUBLIC_APP_URL` to your domain).
3. Apply migrations once: `npm run db:deploy`, then `npm run db:seed` for the super admin.
4. Vercel picks up the daily cron from `vercel.json`.
5. To accept subscription payments, add your own Razorpay keys as `PLATFORM_RAZORPAY_KEY_ID` / `PLATFORM_RAZORPAY_KEY_SECRET` and your GST details as `PLATFORM_*`.

Run the test suite against a separate database: the integration tests create and delete their own data, but they do advance the shared subscription invoice counter.

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
| `npm test` | Unit tests, plus order lifecycle integration tests when `DATABASE_URL` is set |
| `npm run typecheck` / `lint` | Static checks |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Database |

## Security notes

- Every query is scoped by `restaurantId` from the server-side session; nothing trusts a restaurant id from the client.
- Sessions are signed JWTs in httpOnly cookies. User role and active status are re-checked against the database on each request.
- Razorpay secrets are encrypted with `ENCRYPTION_KEY` and never sent to the browser. Changing `ENCRYPTION_KEY` makes saved secrets unreadable.
- Approval PINs are bcrypt-hashed. Money-related actions by non-managers are recorded in the audit log with the approver's name.
- Offline mode only queues new KOTs and payments. Billing, discounts and cancellations need a connection so approvals and invoice numbers stay consistent.
