-- 0007: strict separation between the store ADMIN (the client) and the DEVELOPER (the platform owner).
--
--   admin      -> the store: products, orders, payments, customers, wallets, branding, legal, store audit log
--   developer  -> the platform: subscription, lock/maintenance, feature flags, verification settings,
--                 platform audit log, and aggregate health counts. NO customer, order, payment or wallet data.
--
-- Before this, "staff" meant admin OR developer, so the developer could open the admin dashboard and read
-- all store data. Now is_staff() means the admin only, so every policy and analytics function that
-- used it becomes admin-only without rewriting each one.

-- 1. One account can never hold both privileged roles (two people, two logins, two authenticators).
do $$
declare bad text;
begin
  select string_agg(user_id::text, ', ') into bad from (
    select user_id from public.user_roles where role in ('admin','developer')
    group by user_id having count(*) > 1) x;
  if bad is not null then
    raise exception 'role_conflict: account(s) % hold BOTH admin and developer. Keep one role per account, e.g.: delete from public.user_roles where user_id = ''<that id>'' and role = ''admin'';', bad;
  end if;
end $$;
create unique index if not exists one_privileged_role_per_user on public.user_roles (user_id)
  where role in ('admin','developer');

-- 2. "Staff" now means the store admin. The developer is deliberately excluded.
create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.has_role('admin') $$;

-- 3. Audit log: each side sees only its own half.
drop policy if exists audit_staff on public.audit_logs;
create policy audit_admin on public.audit_logs for select
  using (public.is_admin() and resource_type not in ('platform_subscription','platform_settings','feature_flags','user_roles'));
create policy audit_dev on public.audit_logs for select
  using (public.is_developer() and resource_type in ('platform_subscription','platform_settings','feature_flags','user_roles'));

-- 4. The developer's health page needs counts, never rows.
create or replace function public.dev_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_developer() then jsonb_build_object(
    'failed_emails_24h', (select count(*) from public.email_events where status = 'failed' and created_at >= now() - interval '24 hours'),
    'stuck_approved',    (select count(*) from public.payments where status = 'approved' and updated_at < now() - interval '15 minutes'),
    'in_review',         (select count(*) from public.payments where status = 'admin_review'),
    'awaiting_payment',  (select count(*) from public.payments where status = 'awaiting_payment')
  ) end
$$;
revoke execute on function public.dev_health() from public, anon;
grant  execute on function public.dev_health() to authenticated;
