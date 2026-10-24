-- =====================================================================
-- Digital-product store: core schema, RLS, subscription gate
-- Roles: customer < admin (one, owns the store) ; developer (owns platform)
-- Target: Supabase / PostgreSQL 15+
-- Rules: 3NF, UUID PKs + human public IDs, soft delete, RLS everywhere.
-- Writes that involve money (orders, quotes, payments) go through the
-- server with the service role; the browser can only read its own rows.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------------------------------------------------
create type app_role            as enum ('customer','admin','developer');
create type store_status        as enum ('active','warning','maintenance','suspended','expired');
create type record_status       as enum ('draft','active','archived');
create type crypto_asset        as enum ('BTC','ETH','USDT','SOL');
create type crypto_network      as enum ('bitcoin','ethereum','tron','solana','bsc','polygon');
create type verification_mode   as enum ('automatic','manual','hybrid');
create type order_status        as enum ('pending_payment','paid','fulfilled','cancelled','expired');
create type payment_status      as enum ('created','awaiting_payment','payment_detected',
                                         'blockchain_verified','admin_review','approved',
                                         'fulfilled','rejected','expired');
create type email_status        as enum ('queued','sent','failed');

-- ---------- helpers --------------------------------------------------
-- Uses gen_random_uuid() (built into Postgres 13+, always on the search path) rather than pgcrypto.
-- On Supabase pgcrypto lives in the "extensions" schema, which security-definer triggers with
-- search_path = public cannot see; that broke sign-up with "Database error saving new user".
create or replace function public.rand_hex(n int) returns text
language sql volatile set search_path = pg_catalog as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, n))
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- identity -------------------------------------------------
create table public.avatar_assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  svg_path    text not null,                       -- path in avatar-assets bucket
  status      record_status not null default 'active',
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  public_id     text not null unique default ('USR-' || public.rand_hex(8)),
  full_name     text not null check (char_length(full_name) between 2 and 100),
  email         text not null unique check (email = lower(email)),
  avatar_id     uuid references public.avatar_assets(id),
  is_active     boolean not null default true,
  email_otp_2fa boolean not null default false,    -- consumer 2FA (opt-in)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- roles live in their own table (3NF, no role column on profiles)
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role    app_role not null,
  primary key (user_id, role)
);
-- exactly one admin and one developer may exist
create unique index one_admin     on public.user_roles (role) where role = 'admin';
create unique index one_developer on public.user_roles (role) where role = 'developer';

-- security-definer helpers: RLS policies call these, never raw role checks
create or replace function public.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;
create or replace function public.is_developer() returns boolean
language sql stable as $$ select public.has_role('developer') $$;
create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.has_role('admin') $$;
create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.has_role('admin') or public.has_role('developer') $$;

-- every new auth user becomes a customer profile automatically
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), 'New customer'),
          lower(new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- platform control plane (developer only) -------------------
create table public.platform_subscription (
  id             boolean primary key default true check (id),   -- singleton row
  status         store_status not null default 'active',
  monthly_fee_usd numeric(12,2) not null default 0 check (monthly_fee_usd >= 0),
  expires_at     timestamptz not null,
  grace_days     int not null default 3 check (grace_days between 0 and 30),
  maintenance_forced boolean not null default false,
  note           text,
  updated_at     timestamptz not null default now()
);
create trigger trg_sub_touch before update on public.platform_subscription
  for each row execute function public.touch_updated_at();

create table public.feature_flags (
  key         text primary key check (key ~ '^[a-z0-9_]+$'),
  enabled     boolean not null default true,
  description text,
  updated_at  timestamptz not null default now()
);
create table public.platform_settings (
  id                boolean primary key default true check (id),
  verification_mode verification_mode not null default 'hybrid',
  quote_ttl_minutes int not null default 60 check (quote_ttl_minutes between 5 and 1440),
  required_confirmations int not null default 1 check (required_confirmations >= 1)
);

-- Effective gate. Server middleware and RLS both use this.
create or replace function public.store_is_open() returns boolean
language sql stable security definer set search_path = public as $$
  select not s.maintenance_forced
     and s.status in ('active','warning')
     and now() <= s.expires_at + make_interval(days => s.grace_days)
  from public.platform_subscription s
$$;

-- ---------- store configuration (admin owns branding) ------------------
create table public.store_settings (
  id            boolean primary key default true check (id),
  store_name    text not null default 'My Store',
  description   text,
  logo_path     text,
  favicon_path  text,
  contact_email text,
  updated_at    timestamptz not null default now()
);
create trigger trg_store_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

create table public.legal_documents (
  slug        text primary key check (slug in
    ('terms','privacy','refund-policy','shipping-policy','crypto-payment-policy','faq','about')),
  title       text not null,
  body_md     text not null,
  updated_at  timestamptz not null default now()
);

-- ---------- catalog -----------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  status     record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  public_id   text not null unique default ('PRD-' || public.rand_hex(6)),
  slug        text not null unique,
  category_id uuid references public.categories(id),
  name        text not null,
  description text not null default '',
  price_usd   numeric(12,2) not null check (price_usd >= 0),
  status      record_status not null default 'draft',
  -- download policy (null = unlimited / never expires)
  download_limit        int check (download_limit is null or download_limit > 0),
  link_expiry_hours     int check (link_expiry_hours is null or link_expiry_hours > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path       text not null,
  position   int not null default 0,
  unique (product_id, position)
);
create table public.product_files (            -- private ZIP
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  path       text not null,                    -- private bucket
  size_bytes bigint not null check (size_bytes > 0),
  version    int not null default 1,
  created_at timestamptz not null default now()
);

-- ---------- wallets ---------------------------------------------------
create table public.payment_wallets (
  id        uuid primary key default gen_random_uuid(),
  asset     crypto_asset not null,
  network   crypto_network not null,
  address   text not null check (char_length(address) between 20 and 120),
  label     text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (asset, network, address)
);

-- ---------- orders ------------------------------------------------------
create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  public_id   text not null unique
              default ('ORD-' || to_char(now(),'YYYYMMDD') || '-' || public.rand_hex(5)),
  customer_id uuid not null references public.profiles(id),
  status      order_status not null default 'pending_payment',
  total_usd   numeric(12,2) not null check (total_usd >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- products are only ever archived (never hard-deleted), so product_id stays valid;
-- the name/price snapshot keeps the receipt accurate even after later edits
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  product_id        uuid not null references public.products(id),
  product_name_snap text not null,
  unit_price_usd    numeric(12,2) not null check (unit_price_usd >= 0),
  unique (order_id, product_id)                 -- digital: one licence per product
);

-- ---------- payments ----------------------------------------------------
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  public_id   text not null unique default ('PAY-' || public.rand_hex(6)),
  order_id    uuid not null references public.orders(id),
  wallet_id   uuid not null references public.payment_wallets(id),
  -- wallet address is frozen so deleting/editing a wallet never rewrites history
  address_snap text not null,
  status      payment_status not null default 'created',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);
create trigger trg_payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

create table public.payment_quotes (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments(id) on delete cascade,
  amount_usd    numeric(12,2) not null,
  rate_usd_per_unit numeric(24,8) not null check (rate_usd_per_unit > 0),
  amount_crypto numeric(36,18) not null check (amount_crypto > 0),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create table public.blockchain_transactions (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments(id),
  network       crypto_network not null,
  tx_hash       text not null,
  amount_crypto numeric(36,18) not null,
  confirmations int not null default 0,
  detected_at   timestamptz not null default now(),
  unique (network, tx_hash)                    -- replay protection
);

create table public.payment_events (            -- append-only state history
  id         bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id) on delete cascade,
  from_status payment_status,
  to_status   payment_status not null,
  actor_id    uuid references public.profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------- downloads & email ---------------------------------------------
create table public.download_grants (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  token_hash    text not null unique,           -- store hash only, never the token
  expires_at    timestamptz,
  max_downloads int,
  downloads_used int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.email_events (
  id         uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id),
  template   text not null,
  status     email_status not null default 'queued',
  provider_id text,
  error      text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles(id),
  action        text not null,
  resource_type text not null,
  resource_id   text,
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz not null default now()
);

-- generic audit trigger for sensitive tables
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, resource_type, resource_id, old_value, new_value)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger aud_wallets  after insert or update or delete on public.payment_wallets
  for each row execute function public.audit_row();
create trigger aud_products after insert or update or delete on public.products
  for each row execute function public.audit_row();
create trigger aud_sub      after update on public.platform_subscription
  for each row execute function public.audit_row();
create trigger aud_payments after update on public.payments
  for each row execute function public.audit_row();

-- =====================================================================
-- Row Level Security: deny by default, then grant narrowly
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: own row, staff read all; users can only edit safe columns
create policy profiles_self_read  on public.profiles for select using (id = auth.uid());
create policy profiles_staff_read on public.profiles for select using (public.is_staff());
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant  update (full_name, avatar_id, email_otp_2fa) on public.profiles to authenticated;

create policy roles_self_read  on public.user_roles for select using (user_id = auth.uid());
create policy roles_staff_read on public.user_roles for select using (public.is_staff());
-- no insert/update/delete policies on user_roles: only service role may change roles

create policy avatars_read on public.avatar_assets for select using (status = 'active');
create policy avatars_admin on public.avatar_assets for all
  using (public.is_staff()) with check (public.is_staff());

-- platform plane: developer only (public may not read it directly; use store_is_open())
create policy sub_dev       on public.platform_subscription for all
  using (public.is_developer()) with check (public.is_developer());
create policy flags_read    on public.feature_flags for select using (true);
create policy flags_dev     on public.feature_flags for all
  using (public.is_developer()) with check (public.is_developer());
create policy pset_dev      on public.platform_settings for all
  using (public.is_developer()) with check (public.is_developer());
create policy pset_staff_read on public.platform_settings for select using (public.is_staff());

-- store config & legal: public read, ADMIN only write (developer deliberately excluded)
create policy store_read  on public.store_settings for select using (true);
create policy store_write on public.store_settings for update
  using (public.is_admin()) with check (public.is_admin());
create policy legal_read  on public.legal_documents for select using (true);
create policy legal_write on public.legal_documents for all
  using (public.is_admin()) with check (public.is_admin());

-- catalog: public sees active items only while the store is open
create policy cat_read  on public.categories for select
  using ((status = 'active' and public.store_is_open()) or public.is_staff());
create policy cat_write on public.categories for all
  using (public.is_admin() and public.store_is_open()) with check (public.is_admin());
create policy prod_read on public.products for select
  using ((status = 'active' and public.store_is_open()) or public.is_staff());
create policy prod_write on public.products for all
  using (public.is_admin() and public.store_is_open()) with check (public.is_admin());
create policy img_read  on public.product_images for select
  using (exists (select 1 from public.products p where p.id = product_id
                 and ((p.status = 'active' and public.store_is_open()) or public.is_staff())));
create policy img_write on public.product_images for all
  using (public.is_admin() and public.store_is_open()) with check (public.is_admin());
-- product_files: no customer policy at all; downloads use server-signed URLs
create policy pfile_admin on public.product_files for all
  using (public.is_admin()) with check (public.is_admin());

-- wallets: admin manages; customers never read the table (server hands out
-- the one wallet chosen for their payment, frozen as address_snap)
create policy wallets_admin on public.payment_wallets for all
  using (public.is_admin() and public.store_is_open()) with check (public.is_admin());

-- orders & payments: customers read their own, staff read all; writes by server only
create policy orders_own    on public.orders for select
  using (customer_id = auth.uid() and public.store_is_open());
create policy orders_staff  on public.orders for select using (public.is_staff());
create policy items_own     on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy items_staff   on public.order_items for select using (public.is_staff());

create policy pay_own   on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy pay_staff on public.payments for select using (public.is_staff());
create policy quote_own on public.payment_quotes for select
  using (exists (select 1 from public.payments p join public.orders o on o.id = p.order_id
                 where p.id = payment_id and o.customer_id = auth.uid()));
create policy quote_staff on public.payment_quotes for select using (public.is_staff());
create policy btx_staff on public.blockchain_transactions for select using (public.is_staff());
create policy pev_staff on public.payment_events for select using (public.is_staff());

-- admin approves/rejects payments in review (everything else via service role)
create policy pay_admin_update on public.payments for update
  using (public.is_admin() and status = 'admin_review')
  with check (public.is_admin() and status in ('approved','rejected'));

-- grants/email/audit
create policy email_own   on public.email_events for select using (recipient_id = auth.uid());
create policy email_staff on public.email_events for select using (public.is_staff());
create policy audit_staff on public.audit_logs   for select using (public.is_staff());
-- download_grants: no policies => server (service role) only

-- ---------- seeds ------------------------------------------------------
insert into public.platform_subscription (expires_at) values (now() + interval '30 days');
insert into public.platform_settings default values;
insert into public.store_settings default values;
insert into public.feature_flags (key, description) values
  ('crypto_payments','Accept crypto checkout'),
  ('customer_registration','Allow new sign-ups'),
  ('email_notifications','Send transactional email'),
  ('consumer_2fa','Offer email OTP to customers'),
  ('totp','Require TOTP for admin/developer'),
  ('auto_verification','Blockchain auto-verification'),
  ('downloads','Allow ZIP downloads');
