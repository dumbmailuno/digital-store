-- =====================================================================
-- 0004: dashboard analytics, developer helpers, publish guards,
--       cron heartbeat, starter legal content
-- Analytics functions run as the CALLER (security invoker), so row-level
-- security still decides who can see what: staff with a verified TOTP
-- session get numbers, everyone else gets empty results.
-- Revenue basis everywhere: orders whose payment reached 'approved'.
-- Days are bucketed in UTC.
-- =====================================================================

-- ---------- cron heartbeat (so the developer can see the jobs are running) -------------
alter table public.platform_settings add column if not exists last_cron_at timestamptz;

-- ---------- analytics ------------------------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language sql stable as $$
  with approved as (
    select distinct on (p.order_id) p.order_id, o.total_usd, e.created_at as at
    from public.payment_events e
    join public.payments p on p.id = e.payment_id
    join public.orders o on o.id = p.order_id
    where e.to_status = 'approved'
    order by p.order_id, e.created_at
  )
  select case when not public.is_staff() then '{}'::jsonb else jsonb_build_object(
    'revenue_total',    coalesce((select sum(total_usd) from approved), 0),
    'revenue_30d',      coalesce((select sum(total_usd) from approved where at >= now() - interval '30 days'), 0),
    'orders_total',     (select count(*) from public.orders),
    'orders_paid',      (select count(*) from approved),
    'customers',        (select count(*) from public.profiles p
                         where not exists (select 1 from public.user_roles r
                                           where r.user_id = p.id and r.role in ('admin','developer'))),
    'pending_review',   (select count(*) from public.payments where status = 'admin_review'),
    'awaiting_payment', (select count(*) from public.payments where status = 'awaiting_payment'),
    'products_active',  (select count(*) from public.products where status = 'active')
  ) end
$$;

create or replace function public.admin_revenue_series(p_days int default 30)
returns table (day date, revenue numeric, orders bigint)
language sql stable as $$
  with n as (select least(greatest(coalesce(p_days, 30), 1), 365) as n),
  days as (
    select ((now() at time zone 'UTC')::date - g)::date as d
    from n, generate_series(0, (select n from n) - 1) g
  ),
  approved as (
    select distinct on (p.order_id) p.order_id, o.total_usd, e.created_at as at
    from public.payment_events e
    join public.payments p on p.id = e.payment_id
    join public.orders o on o.id = p.order_id
    where e.to_status = 'approved'
    order by p.order_id, e.created_at
  )
  select days.d, coalesce(sum(a.total_usd), 0)::numeric, count(a.order_id)
  from days left join approved a on (a.at at time zone 'UTC')::date = days.d
  where public.is_staff()
  group by days.d order by days.d
$$;

create or replace function public.admin_customer_growth(p_days int default 30)
returns table (day date, signups bigint)
language sql stable as $$
  with n as (select least(greatest(coalesce(p_days, 30), 1), 365) as n),
  days as (
    select ((now() at time zone 'UTC')::date - g)::date as d
    from n, generate_series(0, (select n from n) - 1) g
  )
  select days.d, count(p.id)
  from days
  left join public.profiles p on (p.created_at at time zone 'UTC')::date = days.d
       and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('admin','developer'))
  where public.is_staff()
  group by days.d order by days.d
$$;

create or replace function public.admin_top_products(p_limit int default 5)
returns table (product_id uuid, name text, units bigint, revenue numeric)
language sql stable as $$
  select oi.product_id, max(oi.product_name_snap), count(*), sum(oi.unit_price_usd)
  from public.order_items oi
  join public.payments p on p.order_id = oi.order_id
  where public.is_staff()
    and exists (select 1 from public.payment_events e where e.payment_id = p.id and e.to_status = 'approved')
  group by oi.product_id
  order by sum(oi.unit_price_usd) desc, count(*) desc
  limit least(greatest(coalesce(p_limit, 5), 1), 50)
$$;

create or replace function public.admin_customers(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, public_id text, full_name text, email text, is_active boolean, created_at timestamptz,
               avatar_path text, orders_paid bigint, total_spent numeric, total_count bigint)
language sql stable as $$
  with spent as (
    select o.customer_id, count(*) as c, sum(o.total_usd) as s
    from public.orders o where o.status in ('paid','fulfilled') group by o.customer_id
  )
  select p.id, p.public_id, p.full_name, p.email, p.is_active, p.created_at, a.svg_path,
         coalesce(s.c, 0), coalesce(s.s, 0), count(*) over ()
  from public.profiles p
  left join spent s on s.customer_id = p.id
  left join public.avatar_assets a on a.id = p.avatar_id
  where public.is_staff()
    and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('admin','developer'))
    and (nullif(trim(p_search), '') is null
         -- plain substring match: no LIKE wildcards to escape
         or position(lower(trim(p_search)) in lower(p.full_name)) > 0
         or position(lower(trim(p_search)) in lower(p.email)) > 0
         or position(lower(trim(p_search)) in lower(p.public_id)) > 0)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.admin_payment_activity()
returns table (status payment_status, n bigint)
language sql stable as $$
  select p.status, count(*) from public.payments p
  where public.is_staff()
  group by p.status order by count(*) desc
$$;

-- ---------- subscription notice for the admin (no fee, no developer notes) --------------
create or replace function public.store_notice() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then
    (select jsonb_build_object(
        'status', s.status, 'maintenance_forced', s.maintenance_forced,
        'expires_at', s.expires_at, 'grace_days', s.grace_days,
        'days_left', ceil(extract(epoch from (s.expires_at - now())) / 86400)::int)
     from public.platform_subscription s)
  end
$$;

-- ---------- developer: atomic extension -----------------------------------------------------
create or replace function public.dev_extend_subscription(p_days int) returns timestamptz
language plpgsql as $$
declare v timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 366 then raise exception 'invalid_days'; end if;
  -- extends from whichever is later: the current expiry or now (so a lapsed store gets a full period)
  update public.platform_subscription
     set expires_at = greatest(expires_at, now()) + make_interval(days => p_days),
         status = 'active'
  returning expires_at into v;
  return v;   -- NULL when the caller is not the developer: RLS hid the row
end $$;

-- ---------- nothing goes on sale without a file ----------------------------------------------
create or replace function public.product_publish_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and not exists (select 1 from public.product_files f where f.product_id = new.id) then
    raise exception 'product_needs_file: upload the ZIP before publishing';
  end if;
  return new;
end $$;
drop trigger if exists trg_product_publish_guard on public.products;
create trigger trg_product_publish_guard before insert or update of status on public.products
  for each row execute function public.product_publish_guard();

create or replace function public.product_file_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.products p where p.id = old.product_id and p.status = 'active') then
    raise exception 'cannot_remove_file: unpublish the product first, or replace the file instead';
  end if;
  return old;
end $$;
drop trigger if exists trg_product_file_guard on public.product_files;
create trigger trg_product_file_guard before delete on public.product_files
  for each row execute function public.product_file_guard();

-- ---------- starter legal pages (templates: the owner must review and edit) ----------------------
insert into public.legal_documents (slug, title, body_md) values
('terms', 'Terms and Conditions', $t$TEMPLATE: replace the wording below with your own and have it reviewed by a qualified lawyer before launch.

1. ABOUT THESE TERMS
By creating an account or buying from this store you agree to these terms. If you do not agree, please do not use the store.

2. ACCOUNTS
You must provide accurate information and keep your password and any two-factor device secure. You are responsible for activity on your account. We may suspend accounts used for fraud or abuse.

3. DIGITAL PRODUCTS AND LICENCE
Everything sold here is a digital download delivered as a ZIP file. Your purchase gives you a personal, non-transferable licence to use the product. You may not resell, redistribute, or share the files or your download links unless the product page says otherwise.

4. PRICES AND PAYMENT
Prices are shown in US dollars and are paid in cryptocurrency. When you start a payment we calculate the exact crypto amount and hold that price for one hour. Network and exchange fees are your responsibility and must not reduce the amount we receive. See the Crypto Payment Policy for details.

5. DELIVERY
After your payment is verified and approved, download links are emailed to the address on your account. Each product page states how many downloads are allowed and how long the link stays valid.

6. ALL SALES ARE FINAL
Because digital goods cannot be returned and cryptocurrency payments are irreversible, we do not offer refunds. If a file is damaged or was not delivered, contact us and we will fix or re-deliver it. See the Refund Policy.

7. AVAILABILITY
We may take the store offline for maintenance or if the service is suspended. Existing orders and payments are not lost during maintenance.

8. LIABILITY
To the extent permitted by law, we are not liable for indirect or consequential loss, or for loss caused by sending funds to the wrong address or network. Nothing in these terms limits rights you have under law that cannot be limited.

9. CHANGES
We may update these terms. The latest version is always on this page. Continued use after a change means you accept it.

10. CONTACT
Questions about these terms? Use the contact details on the Contact page.$t$),

('privacy', 'Privacy Policy', $t$TEMPLATE: replace the wording below with your own and have it reviewed by a qualified lawyer before launch.

WHAT WE COLLECT
- Account details: your full name and email address.
- Order and payment records: what you bought, amounts, payment status, and the blockchain transaction hash you submit.
- Technical data needed to keep the service secure (for example sign-in and security logs).
We do not ask you for, or store, your own crypto wallet address. Transactions you make are recorded on public blockchains, which we do not control.

HOW WE USE IT
To create and secure your account, process and deliver your orders, send transactional emails (verification, payment updates, download links), prevent fraud, and meet legal obligations.

WHO HANDLES IT
We use service providers to run the store, such as hosting and database services and an email delivery service. They process data only to provide those services.

COOKIES AND STORAGE
We use only essential cookies to keep you signed in. Your cart is kept in your own browser storage. We do not use advertising cookies.

HOW LONG WE KEEP IT
Order and payment records are kept as long as needed for accounting and legal reasons. You can ask us to delete your account where the law allows.

YOUR RIGHTS
You can ask to see, correct, or delete your personal data. Contact us using the details on the Contact page.

SECURITY
Access is restricted by role, sensitive actions are logged, and administrator accounts require two-factor authentication. No system is perfectly secure, so please use a strong, unique password.$t$),

('refund-policy', 'Refund Policy', $t$TEMPLATE: replace the wording below with your own and have it reviewed by a qualified lawyer before launch.

ALL SALES ARE FINAL
Digital products are delivered immediately after payment is approved and cannot be returned. Cryptocurrency payments cannot be reversed. For these reasons we do not offer refunds, and we do not cancel orders once a payment has been approved.

WHAT WE WILL DO
- If a file is damaged, incomplete, or was never delivered, contact us with your order number and we will repair it or send a fresh download link.
- If you were charged but your order was not completed because of an error on our side, we will resolve it by completing the order.

PAYMENTS WE CANNOT APPROVE
If a payment cannot be approved (for example the amount was too low or it arrived long after the price expired), the order is not fulfilled. See the Crypto Payment Policy for how these cases are handled.$t$),

('shipping-policy', 'Delivery Policy', $t$TEMPLATE: replace the wording below with your own and have it reviewed by a qualified lawyer before launch.

DIGITAL DELIVERY ONLY
Nothing we sell is shipped physically. After your payment is verified and approved, an email with your download links is sent to the address on your account, usually within minutes.

DOWNLOAD LIMITS
Each product page shows how many times you can download the file and how long the link stays valid. Keep the email safe: anyone with the link can use your remaining downloads.

NOT RECEIVED?
Check your spam folder, then contact us with your order number and we will resend your link.$t$),

('crypto-payment-policy', 'Crypto Payment Policy', $t$TEMPLATE: replace the wording below with your own and have it reviewed by a qualified lawyer before launch.

HOW PAYMENT WORKS
1. At checkout you choose a coin and network. We calculate the amount in that coin from the US dollar price and hold it for ONE HOUR.
2. You send exactly that coin, on exactly that network, to the address shown.
3. You paste your transaction hash on the payment page. We check it on the blockchain.
4. When the payment is verified and approved, your download links are emailed to you.

IMPORTANT RULES
- Send only the coin and network shown. Funds sent on a different network or in a different coin may be lost permanently and we cannot recover them.
- Send at least the amount shown. Network, withdrawal, and exchange fees are yours to cover: if your exchange deducts a fee, add it on top so the full amount arrives.
- Payments are irreversible. We do not offer refunds.

LATE, LOW, OR UNUSUAL PAYMENTS
- Payments that arrive long after the one-hour price expired, payments below the required amount, and payments that cannot be matched clearly to one order are held for manual review and may be rejected.
- If you send too little we cannot fulfil the order. Contact us with your transaction hash.
- Overpayments are not automatically refunded.

CONFIRMATIONS
A payment is only approved after the network has confirmed it. This can take from minutes to longer during congestion.

SUPPORT
If something goes wrong, contact us with your order number and transaction hash.$t$),

('faq', 'Frequently Asked Questions', $t$TEMPLATE: edit these answers to match how your store works.

How do I pay?
Choose a coin and network at checkout, send the exact amount to the address shown within one hour, then paste your transaction hash on the payment page.

How long until I get my download?
Usually minutes after the network confirms your payment. The links are emailed to you.

I did not get the email.
Check spam, then contact us with your order number.

Can I get a refund?
No. All sales are final. See the Refund Policy.

I sent the wrong amount or the wrong network.
Contact us right away with your transaction hash. Funds sent on the wrong network may be unrecoverable.

How many times can I download?
It is shown on each product page.

Can I buy a product again?
Yes. Open My Orders and choose Buy again on any product that is still available.$t$),

('about', 'About', $t$Tell customers who you are and what you sell. Edit this page from the admin dashboard.$t$)
on conflict (slug) do nothing;
