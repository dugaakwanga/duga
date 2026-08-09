# Going Live — Step-by-Step

This guide takes the DUGA monorepo online on **Vercel (free)** with **PostgreSQL + Storage on Supabase (free)**.

**Reality check up front:** the marketing website handles 5,000 visitors fine on Vercel's free tier. The portal works on free too, but **300 students taking CBT at the same time** will likely hit Vercel's free-tier concurrency limits. Plan to upgrade the portal to **Vercel Pro (~$20/mo)** when you run real CBT exams, or move the portal to a small VPS later. For now, deploy free and test.

**Status:** Supabase project is created and the database is already wired up. The portal is connected (verified against `aws-1-eu-west-1.pooler.supabase.com`). Uploads are moved to Supabase Storage. Remaining: GitHub repo + Vercel deploy + seed.

---

## Part A — Database (Supabase, free) — DONE ✔

- Project: `duga-school` (region: **eu-west-1** / Ireland — the default; note the docs earlier said Cape Town but the project was created in Ireland).
- Direct connection host is **IPv6-only**, so the app uses the **shared pooler (Supavisor)** which is IPv4 on every tier:
  ```
  postgresql://postgres.<project-ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
  ```
- The `#` in the DB password must be URL-encoded as `%23` in the connection string.
- Schema is already pushed to Supabase (`prisma db push`) — tables exist and are queryable.

## Part B — GitHub (needed before Vercel) — 10 minutes

1. Go to **https://github.com** → New repository → name it `duga-school` (keep it **Private**).
2. Do **NOT** check "Add a README / .gitignore" — the repo must start empty.
3. Copy the URL (e.g. `https://github.com/you/duga-school.git`).
4. Tell me the URL — I'll init a clean git repo inside `SMS_DUGA` and push it. (Do not use the existing home-folder git repo — it points at an unrelated project.)

## Part C — Vercel deploy — 20 minutes

1. Go to **https://vercel.com** → sign up with your GitHub account.
2. Click **Add New… → Project** → import the `duga-school` repo. Create **two projects** from the same repo:

### Project 1 — the website
- **Root Directory:** `apps/web`
- Framework: Next.js (auto-detected), build: `next build` (set in `apps/web/vercel.json`)
- **Environment Variables**:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` |
| `NEXT_PUBLIC_PORTAL_URL` | `https://<portal-app>.vercel.app` |
| `NEXT_PUBLIC_SCHOOL_NAME` | `De Ultimate Glory Academy` |
| `NEXT_PUBLIC_SCHOOL_SHORT_NAME` | `DUGA` |
| `NEXT_PUBLIC_SCHOOL_PHONE` | your phone |
| `NEXT_PUBLIC_SCHOOL_EMAIL` | your email |
| `NEXT_PUBLIC_SCHOOL_ADDRESS` | your address |

- Click **Deploy**.

### Project 2 — the school portal
- **Root Directory:** `apps/portal`
- Framework: Next.js, build: `npx prisma generate --schema ../../packages/db/prisma/schema.prisma && next build` (set in `apps/portal/vercel.json`)
- **Environment Variables** (critical — the portal won't start without these):

| Name | Value |
|------|-------|
| `DATABASE_URL` | the Supabase pooler string from Part A |
| `JWT_SECRET` | long random string (`openssl rand -hex 32`) |
| `JWT_SECRET_SUPERADMIN` | another long random string (different) |
| `JWT_EXPIRES_IN` | `8h` |
| `JWT_EXPIRES_IN_SUPERADMIN` | `2h` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | anon public key (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role secret (server-side only) |
| `NEXT_PUBLIC_SITE_URL` | `https://<website>.vercel.app` |
| `NEXT_PUBLIC_PORTAL_URL` | `https://<portal>.vercel.app` |
| `NEXT_PUBLIC_SCHOOL_NAME` | `De Ultimate Glory Academy` |
| `NEXT_PUBLIC_SCHOOL_SHORT_NAME` | `DUGA` |
| `PAYSTACK_SECRET_KEY` | your **test** secret key `sk_test_...` |
| `PAYSTACK_PUBLIC_KEY` | your **test** public key `pk_test_...` |
| `PAYSTACK_CALLBACK_URL` | `https://<portal>.vercel.app/portal/payments/callback` |
| `SCHOOL_GPS_LAT` | school latitude |
| `SCHOOL_GPS_LNG` | school longitude |
| `ATTENDANCE_RADIUS_METERS` | `150` |

- Click **Deploy**.

## Part D — Seed the database

After the portal deploys, seed the demo school + superadmin from your machine:

```
$env:DATABASE_URL="<the-pooler-string>"; npx tsx packages/db/scripts/seed.mjs
```

This creates the school "De Ultimate Glory Academy" and the demo accounts (see below). For a clean production DB you may instead create accounts via the superadmin panel.

## Part E — First accounts

1. Open `https://<portal>.vercel.app/superadmin/login` — superadmin: **`creator` / `creator123`** (seed) or whatever you set.
2. From there manage owners, users, and features as usual.

---

## Free-tier limits to know

- **Vercel Hobby (free):** great for the website; portal serverless functions have a concurrency cap — upgrade to **Pro (~$20/mo)** before real simultaneous CBT exams.
- **Supabase free:** 500 MB database, 1 GB storage, daily backups. Plenty for a school (≈10–50 MB/yr of data).
- **Paystack:** **test** keys only for now — live keys require activating your Paystack account.

## Local development (switch back to SQLite)

```
node packages/db/scripts/switch-provider.mjs sqlite
```

And swap `DATABASE_URL` in `packages/db/.env` back to `file:./dev.db`.
