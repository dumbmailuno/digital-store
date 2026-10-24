-- 0008: optional READ-ONLY support access for the developer, controlled by the store admin.
--
-- Default is OFF: the developer sees no store data (see 0007). The admin can switch it on in
-- Store settings so the developer can open the same dashboard and look at the same data while
-- chasing a bug, and switch it off again. The developer can never change the switch, and even
-- while it is on every WRITE policy still requires the admin, so the view is strictly read-only.

alter table public.store_settings
  add column if not exists developer_support_access boolean not null default false;

-- Record every change to store settings (including this switch) in the store audit log.
drop trigger if exists aud_store_settings on public.store_settings;
create trigger aud_store_settings after update on public.store_settings
  for each row execute function public.audit_row();

-- "Staff" = anyone allowed to LOOK at store data: the admin, or the developer while the switch is on.
-- Used only by SELECT policies and read-only analytics functions. Writes use is_admin().
create or replace function public.is_staff() returns boolean
language sql stable as $$
  select public.has_role('admin')
      or (public.has_role('developer')
          and coalesce((select s.developer_support_access from public.store_settings s limit 1), false))
$$;

-- Avatars: the old single "for all" policy let any staff WRITE. Split it so only the admin writes.
drop policy if exists avatars_admin on public.avatar_assets;
create policy avatars_staff_read on public.avatar_assets for select using (public.is_staff());
create policy avatars_admin_write on public.avatar_assets for all
  using (public.is_admin()) with check (public.is_admin());
-- (for all + the select policy above is fine: SELECT is allowed to staff, every write needs is_admin)

-- Read access for the support view to tables whose policies were admin-only.
create policy wallets_staff_read on public.payment_wallets for select using (public.is_staff());
create policy pfile_staff_read   on public.product_files   for select using (public.is_staff());

-- Store audit log: visible to whoever may view the store (admin, or developer with the switch on).
-- The platform half (subscription, flags, settings, roles) stays developer-only.
drop policy if exists audit_admin on public.audit_logs;
create policy audit_store on public.audit_logs for select
  using (public.is_staff() and resource_type not in ('platform_subscription','platform_settings','feature_flags','user_roles'));
