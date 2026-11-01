# DineFlow kaise chalayein (Hinglish guide)

Ye guide do tarike batati hai:

- **A. Apne computer par chalana**: testing aur demo ke liye
- **B. Internet par live karna**: Vercel + Supabase, restaurants ko bechne ke liye

---

## A. Apne computer par chalana (Windows / Mac / Linux)

### 1. Ye cheezein install karein (ek hi baar)

| Software | Kahan se | Note |
|---|---|---|
| Node.js 20 ya 22 (LTS) | https://nodejs.org | Install ke baad terminal mein `node -v` chalakar check karein |
| PostgreSQL 16 | https://www.postgresql.org/download/ | Install karte waqt jo password doge (jaise `postgres`) yaad rakhna |

PostgreSQL install nahi karna chahte? To free **Supabase** database bhi use kar sakte ho (neeche section B ka step 1 dekhein) aur uska URL `.env` mein daal do.

### 2. Zip kholein

Zip ko kisi folder mein extract karein, jaise `D:\dineflow`. Fir us folder mein terminal kholein:

- **Windows:** folder mein address bar mein `cmd` likhkar Enter dabayein.
- **Mac/Linux:** Terminal mein `cd` karke us folder mein jaayein.

### 3. Database banayein

pgAdmin (PostgreSQL ke saath aata hai) mein ek naya database `restaurant` naam se banayein. Ya terminal se ye command chalayein:

```bash
createdb -U postgres restaurant
```

### 4. Settings file (.env) banayein

`.env.example` file ki copy banakar uska naam `.env` rakhein.

- **Windows:** `copy .env.example .env`
- **Mac/Linux:** `cp .env.example .env`

Ab `.env` ko Notepad mein kholkar kam se kam ye bharein:

```
DATABASE_URL="postgresql://postgres:AAPKA_PASSWORD@localhost:5432/restaurant"
DIRECT_URL="postgresql://postgres:AAPKA_PASSWORD@localhost:5432/restaurant"
AUTH_SECRET="...lamba random text..."
ENCRYPTION_KEY="...doosra lamba random text..."
SUPER_ADMIN_EMAIL="aapka@email.com"
SUPER_ADMIN_PASSWORD="koi-strong-password"
OTP_DEV_LOG="1"
```

Random text banane ke liye ye command chalayein, aur do baar chalakar do alag value lein:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`OTP_DEV_LOG="1"` ka matlab hai ki "forgot password" ka OTP SMS ki jagah terminal mein dikhega. Ye sirf testing ke liye hai.

### 5. Install aur setup (ek hi baar)

```bash
npm install
```

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

- `npm install` saari libraries download karta hai.
- `npx prisma migrate deploy` database mein saari tables bana deta hai.
- `npm run db:seed` aapka super admin login bana deta hai (`.env` wala email/password).

### 6. Chalayein

```bash
npm run build
```

```bash
npm start
```

Browser mein **http://localhost:3000** kholein.

Code mein badlav karke turant dekhna ho to `npm run build` aur `npm start` ki jagah `npm run dev` chalayein.

### 7. Pehli baar use karna

1. **http://localhost:3000/signup** par apna restaurant banayein. "Sample menu" wala tick rehne dein, isse demo menu aur 6 tables ban jaate hain.
2. Owner dashboard khul jayega. Yahan se ye sab try kar sakte ho:
   - **Staff** mein waiter, chef aur cashier banayein.
   - **Tables & QR** se QR codes print karein.
   - **POS Billing** se order lein aur bill banayein.
3. **Customer ka QR menu** dekhne ke liye: `http://localhost:3000/m/<restaurant-ka-slug>` (dashboard ke "Your digital menu" mein link hai).
4. **Kitchen screen** ke liye chef ke login se kholein. Kisi doosre tab ya phone par chalayein.
5. **Aapka admin panel:** **http://localhost:3000/login** par super admin email/password se login karein. `/admin` khulega.

### Same WiFi par phone se kholna

Computer ka IP pata karein (Windows: `ipconfig`, jaise `192.168.1.5`). Phir phone ke browser mein `http://192.168.1.5:3000` kholein.

Phone alerts aur "app install" jaise kuch features sirf **https** par chalte hain, isliye ye live server par hi poori tarah kaam karenge.

---

## B. Internet par live karna (restaurants ko bechne ke liye)

Sabse aasaan aur shuruaat mein free tarika hai **Supabase** (database) + **Vercel** (website).

### 1. Supabase (database)

1. https://supabase.com par free project banayein. Region **Mumbai (ap-south-1)** chunein.
2. Project Settings → Database → Connection string mein jayein:
   - **Transaction pooler** (port 6543) wala URL `DATABASE_URL` mein daalein. Uske end mein `?pgbouncer=true` jodein.
   - **Direct / Session** (port 5432) wala URL `DIRECT_URL` mein daalein.

### 2. Code GitHub par daalein

Ye code ek **private** GitHub repository mein push karein.

### 3. Vercel (website)

1. https://vercel.com par "Import Project" karke wo GitHub repo chunein.
2. **Environment Variables** mein `.env.example` ki saari values bharein:
   - `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`: naye random text
   - `NEXT_PUBLIC_APP_URL`: aapka domain, jaise `https://app.dineflow.in`
   - `OTP_DEV_LOG` live par **mat** daalein
3. Deploy karein.

### 4. Database setup (ek baar, apne computer se)

Apne computer ki `.env` mein Supabase wale URL daalein aur ye chalayein:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

### 5. Apna domain

Vercel → Settings → Domains mein apna domain jodein.

Daily automatic kaam (birthday wishes, win-back, daily summary) ka cron `vercel.json` se apne aap chalta hai.

### Live par ye bhi set karein (zaroorat ke hisaab se)

| Kaam | `.env` variable |
|---|---|
| Restaurants se subscription ka paisa lena | `PLATFORM_RAZORPAY_KEY_ID`, `PLATFORM_RAZORPAY_KEY_SECRET`, `PLATFORM_GSTIN` etc. |
| OTP / password reset (koi ek zaroori) | `MSG91_*` (SMS), ya `PLATFORM_WA_*` (WhatsApp), ya `RESEND_API_KEY` (email) |
| Waiter phone alerts | `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Menu photo se AI import + AI insights | `ANTHROPIC_API_KEY` |

Har restaurant apna Razorpay, UPI, WhatsApp aur GST apne dashboard ki **Settings** mein khud daalta hai. Unke liye aapko kuch set nahi karna.

---

## Aam dikkatein

| Dikkat | Hal |
|---|---|
| `Can't reach database server` | PostgreSQL chalu hai? `.env` mein password aur port (5432) sahi hai? |
| `AUTH_SECRET is not set` | `.env` file usi folder mein hai aur naam bilkul `.env` hai (`.env.txt` nahi) |
| Port 3000 busy | `npm start -- -p 3001` chalayein, phir `http://localhost:3001` kholein |
| Login par "too many attempts" | 15 minute ruk jaayein (brute-force suraksha) |
| Forgot password ka OTP nahi aaya | Testing mein `OTP_DEV_LOG="1"` rakhein, OTP terminal mein dikhega |

Developers ke liye poori technical jaankari `README.md` mein hai.
