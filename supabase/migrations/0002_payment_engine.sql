-- =====================================================================
-- Payment engine: server-only functions that own every money-related
-- write. The browser (anon/authenticated) can READ its own rows via RLS
-- but can never INSERT/UPDATE/DELETE on these tables or call these functions.
-- Only the service role (our server code) can.
-- =====================================================================

-- ---------- payments remember what the customer was told to pay -------------
alter table public.payments
  add column if not exists asset   crypto_asset,
  add column if not exists network crypto_network;
alter table public.payments alter column asset   set not null;
alter table public.payments alter column network set not null;

-- one live payment per order (prevents double-charging / race conditions)
create unique index if not exists one_live_payment_per_order
  on public.payments (order_id)
  where status in ('created','awaiting_payment','payment_detected',
                   'blockchain_verified','admin_review','approved');

-- one download grant per purchased item (links are rotated, never duplicated)
create unique index if not exists one_grant_per_item
  on public.download_grants (order_item_id);

-- ---------- lock down direct writes from the browser ---------------------------
-- RLS already has no write policies on these; revoking the grant is a second wall.
revoke insert, update, delete on
  public.orders, public.order_items, public.payments, public.payment_quotes,
  public.blockchain_transactions, public.payment_events, public.download_grants,
  public.email_events, public.audit_logs, public.user_roles
from anon, authenticated;

-- the admin used to be able to UPDATE payments directly; that would bypass the
-- state machine. Approvals now go through transition_payment() on the server.
drop policy if exists pay_admin_update on public.payments;

-- ---------- create_order ---------------------------------------------------------
-- Prices come from the database, never from the client.
create or replace function public.create_order(p_customer uuid, p_product_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_total numeric(12,2); v_n int;
begin
  if not public.store_is_open() then raise exception 'store_closed'; end if;
  if p_product_ids is null or cardinality(p_product_ids) = 0
     or cardinality(p_product_ids) > 20 then raise exception 'invalid_cart'; end if;
  if (select count(distinct x) from unnest(p_product_ids) x) <> cardinality(p_product_ids) then
    raise exception 'duplicate_product';
  end if;

  select count(*), coalesce(sum(price_usd), 0) into v_n, v_total
  from public.products where id = any(p_product_ids) and status = 'active';
  if v_n <> cardinality(p_product_ids) then raise exception 'product_unavailable'; end if;
  if v_total <= 0 then raise exception 'free_not_supported'; end if;

  insert into public.orders (customer_id, total_usd) values (p_customer, v_total)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, product_name_snap, unit_price_usd)
  select v_order, id, name, price_usd from public.products where id = any(p_product_ids);

  return v_order;
end $$;

-- ---------- transition_payment: the ONLY way a payment changes status ------------
create or replace function public.transition_payment(
  p_payment uuid, p_to payment_status, p_actor uuid, p_note text default null)
returns payment_status language plpgsql security definer set search_path = public as $$
declare v_from payment_status; v_order uuid; v_ok boolean;
begin
  select status, order_id into v_from, v_order
  from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found'; end if;

  v_ok := case v_from
    when 'created'             then p_to in ('awaiting_payment','expired')
    when 'awaiting_payment'    then p_to in ('payment_detected','expired')
    when 'payment_detected'    then p_to in ('blockchain_verified','admin_review','rejected')
    when 'blockchain_verified' then p_to in ('approved','admin_review','rejected')
    when 'admin_review'        then p_to in ('approved','rejected')
    when 'approved'            then p_to in ('fulfilled')
    else false end;
  if not v_ok then raise exception 'invalid_transition:% -> %', v_from, p_to; end if;

  update public.payments set status = p_to where id = p_payment;
  insert into public.payment_events (payment_id, from_status, to_status, actor_id, note)
  values (p_payment, v_from, p_to, p_actor, p_note);

  if p_to = 'approved'  then update public.orders set status = 'paid'      where id = v_order; end if;
  if p_to = 'fulfilled' then update public.orders set status = 'fulfilled' where id = v_order; end if;
  return p_to;
end $$;

-- ---------- create_payment: price lock for one hour ------------------------------
create or replace function public.create_payment(
  p_order uuid, p_customer uuid, p_wallet uuid, p_rate numeric, p_amount_crypto numeric)
returns table (payment_id uuid, public_id text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders; v_wallet public.payment_wallets;
  v_ttl int; v_pay uuid; v_pub text; v_exp timestamptz; v_old record;
begin
  if not public.store_is_open() then raise exception 'store_closed'; end if;

  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.customer_id <> p_customer then raise exception 'order_not_found'; end if;
  if v_order.status <> 'pending_payment' then raise exception 'order_not_payable'; end if;

  select * into v_wallet from public.payment_wallets where id = p_wallet and is_active;
  if not found then raise exception 'wallet_unavailable'; end if;

  -- an older unpaid quote is replaced; anything already detected/under review blocks a new one
  for v_old in select id, status from public.payments where order_id = p_order
               and status in ('created','awaiting_payment','payment_detected',
                              'blockchain_verified','admin_review','approved') loop
    if v_old.status in ('created','awaiting_payment') then
      perform public.transition_payment(v_old.id, 'expired', null, 'replaced by a new quote');
    else
      raise exception 'payment_in_progress';
    end if;
  end loop;

  select quote_ttl_minutes into v_ttl from public.platform_settings;
  v_exp := now() + make_interval(mins => v_ttl);

  insert into public.payments (order_id, wallet_id, address_snap, asset, network, status)
  values (p_order, p_wallet, v_wallet.address, v_wallet.asset, v_wallet.network, 'awaiting_payment')
  returning id, payments.public_id into v_pay, v_pub;

  insert into public.payment_quotes (payment_id, amount_usd, rate_usd_per_unit, amount_crypto, expires_at)
  values (v_pay, v_order.total_usd, p_rate, p_amount_crypto, v_exp);

  insert into public.payment_events (payment_id, from_status, to_status, note)
  values (v_pay, null, 'awaiting_payment', 'quote created');

  return query select v_pay, v_pub, v_exp;
end $$;

-- ---------- expire quotes nobody paid (called by cron) ------------------------------
create or replace function public.expire_stale_payments(p_submit_grace interval default interval '30 minutes')
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select p.id from public.payments p
    join public.payment_quotes q on q.payment_id = p.id
    where p.status = 'awaiting_payment' and q.expires_at + p_submit_grace < now()
  loop
    perform public.transition_payment(r.id, 'expired', null, 'quote expired unpaid');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- downloads -----------------------------------------------------------------
-- Looking at a link (e.g. an email scanner opening it) must NOT use up a download,
-- so peek and consume are separate.
create or replace function public.peek_download(p_token_hash text)
returns table (product_name text, downloads_left int, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select oi.product_name_snap,
         case when g.max_downloads is null then null else g.max_downloads - g.downloads_used end,
         g.expires_at
  from public.download_grants g
  join public.order_items oi on oi.id = g.order_item_id
  join public.orders o on o.id = oi.order_id
  where g.token_hash = p_token_hash
    and o.status in ('paid','fulfilled')
    and (g.expires_at is null or g.expires_at > now())
    and (g.max_downloads is null or g.downloads_used < g.max_downloads)
$$;

create or replace function public.consume_download(p_token_hash text)
returns table (file_path text) language plpgsql security definer set search_path = public as $$
declare g public.download_grants; v_path text; v_status order_status;
begin
  select * into g from public.download_grants where token_hash = p_token_hash for update;
  if not found then return; end if;
  if g.expires_at is not null and g.expires_at <= now() then return; end if;
  if g.max_downloads is not null and g.downloads_used >= g.max_downloads then return; end if;

  select o.status, pf.path into v_status, v_path
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.product_files pf on pf.product_id = oi.product_id
  where oi.id = g.order_item_id;
  if v_status not in ('paid','fulfilled') or v_path is null then return; end if;

  update public.download_grants set downloads_used = downloads_used + 1 where id = g.id;
  return query select v_path;
end $$;

-- ---------- only the server may call these --------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'create_order(uuid,uuid[])',
    'transition_payment(uuid,payment_status,uuid,text)',
    'create_payment(uuid,uuid,uuid,numeric,numeric)',
    'expire_stale_payments(interval)',
    'peek_download(text)',
    'consume_download(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
