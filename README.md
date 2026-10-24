# Digital store: setup

One store, one admin, one developer. Next.js + Supabase (Postgres, Auth, Storage) + Resend. Customers pay in crypto (BTC, ETH, USDT, SOL) and receive a signed ZIP download link by email.

## 1. Supabase
1. Create a project. In **Authentication → Providers**, keep Email on. In **Authentication → URL Configuration**, set the Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` to Redirect URLs.
2. In **Authentication → Multi-Factor**, make sure TOTP is enabled.
3. Run the eight files in `supabase/migrations/` **in order** in the SQL editor (0001 → 0008). 0003 also creates the storage buckets.
4. Storage: the `product-files` bucket allows 500 MB per file, but your Supabase plan may cap uploads lower (the free plan is 50 MB).

## 2. Environment
Copy `.env.example` to `.env.local` and fill it in. `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `CRON_SECRET` are secrets: never prefix them with `NEXT_PUBLIC_`, and set them only in your host's server environment. `OTP_COOKIE_SECRET` (32+ random characters, `openssl rand -hex 32`) is also required: it signs the "email code verified" cookie, and without it customers who turned on email codes cannot sign in. Use your own Ethereum / Solana / TronGrid provider URLs for reliable payment checks.

## 3. Create the two privileged accounts
1. Sign up through the site as the developer and as the admin, and verify both emails.
2. In the SQL editor (use the real user IDs from **Authentication → Users**):
   ```sql
   insert into user_roles values ('<developer-user-id>', 'developer');
   insert into user_roles values ('<admin-user-id>', 'admin');
   ```
   **They must be two different accounts** (two emails, two passwords, two authenticator entries). The database refuses to give one account both roles. To check what you have: `select u.email, r.role from user_roles r join auth.users u on u.id = r.user_id order by 2;`
3. Each of them signs in and is sent to **/account/security** to set up an authenticator app. Until they do, the database gives them no admin or developer access at all.

## 4. Background job (required)
Call this every 5 minutes (Vercel Cron, GitHub Actions, cron-job.org, ...):
```
POST https://YOUR-DOMAIN/api/cron/payments
Authorization: Bearer <CRON_SECRET>
```
It expires unpaid quotes, re-checks slow payments, retries failed download emails, and emails the developer renewal reminders. The developer overview shows whether it is running.

## 5. Before launch
- Open **/admin/legal** and replace the template wording (have a lawyer review it).
- Add payout wallets in **/admin/wallets** and make a small test purchase of every coin you enable. Chain verification has not been run against live networks.
- Upload a product (images + ZIP), publish it, and buy it end to end.

## Who can see what
| | Store admin (your client) | Developer (you) |
|---|---|---|
| `/admin` dashboard, orders, payments, customers, wallets, products, branding, legal | yes (can change) | **no** by default (404). **Read-only** while the admin switches on *Developer view* in Store settings |
| Approve or reject payments, edit anything in the store | yes | **never** |
| `/dev` console: subscription, lock, flags, verification settings | **no** (404) | yes |
| Store audit log | yes | only while Developer view is on |
| Platform audit log (subscription, flags, settings) | no | yes |
| The Developer view switch | can turn on/off (logged in the audit log) | cannot change it |

This is enforced three times: in the middleware, in each page and API route, and in the database policies, so skipping the app does not get around it. Each role signs in with its own account and its own authenticator, and lands on its own dashboard.

## SQL injection and input safety
- The app never builds SQL text. Every query goes through the Supabase client or a database function with bound parameters, so user input is data, never code. No database function uses dynamic SQL (`EXECUTE`), and every `SECURITY DEFINER` function pins its `search_path`. Both facts are checked by the test suite.
- Search boxes pass a bound value with `%` and `_` escaped (`lib/search.ts`). There are no filter strings assembled from input, which is the injection trick specific to the Supabase/PostgREST API.
- Inputs are validated with zod on the server; IDs, page numbers and enum values are matched against strict patterns.
- `npm test` includes tripwires that fail if someone later adds a string-built filter, a raw SQL entry point, `dangerouslySetInnerHTML`/`eval`, or uses the service-role key outside `lib/supabase/admin.ts`.
- Uploads are identified by their first bytes, not their file name. Avatar SVGs go through a strict allow-list (no scripts, links or embedded content) and are only shown through `<img>`.
- No tool can promise zero vulnerabilities. Keep dependencies updated (`npm audit`), keep the service-role key server-side, and have the finished site independently tested before it handles real money.

## Email codes and rate limits
- Customers can turn on **email verification** under Account → Security. After their password they must enter a 6-digit code we email (expires in 10 min, 5 tries, one use, 30 s between sends). Turning it on or off also needs a code. Admin and developer use the authenticator app instead.
- Sign-in, sign-up and password reset now go through the server (`/api/auth/*`) so they are limited per IP **and** per email. Checkout, quotes, transaction hashes, downloads and admin actions are limited per user or IP. Limits live in `rate_limits` (database), so they hold across serverless instances.
- Limits are only as good as the IP the host reports. On Vercel/Cloudflare it is reliable; behind a proxy that passes `X-Forwarded-For` through untouched it can be spoofed (the per-email and per-user limits still hold).
- Attackers can still call Supabase's own auth URL directly with your public anon key, which skips our limiter. In Supabase → Authentication, keep its built-in rate limits on and turn on **CAPTCHA protection**.
- The email-code check is enforced by the app (middleware and API routes). A customer's own session token talking straight to Supabase is not stopped by it, so it protects the shop and checkout, not raw database reads. Staff are protected by TOTP at the database level.

## Commands
`npm run dev` · `npm run build` · `npm run verify` (typecheck + unit tests + database/security tests)
