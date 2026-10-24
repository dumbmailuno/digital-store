-- =====================================================================
-- 0003: two-factor enforced in RLS, storage buckets + policies,
--       wallet address validation/immutability, avatar verification
-- =====================================================================

-- ---------- 1. Admin/developer powers require a verified TOTP session (AAL2) --------
-- A stolen password alone is not enough: even with a valid session, the database
-- treats an admin/developer who has not passed TOTP as an ordinary nobody.
create or replace function public.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = r
  ) and (r = 'customer' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

-- ---------- 2. Wallet addresses: format-checked per network, then immutable --------
alter table public.payment_wallets drop constraint if exists wallet_address_format;
alter table public.payment_wallets add constraint wallet_address_format check (
  case network
    when 'bitcoin'  then address ~ '^(bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$'
    when 'tron'     then address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
    when 'solana'   then address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    else                 address ~ '^0x[0-9a-fA-F]{40}$'       -- ethereum, bsc, polygon
  end
);

-- Changing where money goes is done by adding a NEW wallet and deactivating the old
-- one, never by editing in place. Old payments therefore always point at a wallet
-- row that still says exactly what the customer was told.
create or replace function public.wallet_immutable() returns trigger
language plpgsql as $$
begin
  if new.asset is distinct from old.asset or new.network is distinct from old.network
     or new.address is distinct from old.address then
    raise exception 'wallet_immutable: add a new wallet and deactivate this one';
  end if;
  return new;
end $$;
drop trigger if exists trg_wallet_immutable on public.payment_wallets;
create trigger trg_wallet_immutable before update on public.payment_wallets
  for each row execute function public.wallet_immutable();

-- ---------- 3. Avatars: only after email verification, only approved ones ---------
create or replace function public.guard_avatar() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.avatar_id is distinct from old.avatar_id and new.avatar_id is not null then
    if not exists (select 1 from auth.users u where u.id = new.id and u.email_confirmed_at is not null) then
      raise exception 'avatar_requires_verified_email';
    end if;
    if not exists (select 1 from public.avatar_assets a where a.id = new.avatar_id and a.status = 'active') then
      raise exception 'avatar_unavailable';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_avatar on public.profiles;
create trigger trg_guard_avatar before update on public.profiles
  for each row execute function public.guard_avatar();

-- Customer email-OTP 2FA is reserved for a later release. Until enforcement exists
-- the column must not be user-editable, or it would imply protection that isn't there.
revoke update (email_otp_2fa) on public.profiles from authenticated;
grant  update (full_name, avatar_id) on public.profiles to authenticated;

-- ---------- 4. Storage ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true,  5242880,   array['image/png','image/jpeg','image/webp']),
  ('store-assets',   'store-assets',   true,  2097152,   array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon']),
  ('avatar-assets',  'avatar-assets',  true,  102400,    array['image/svg+xml']),
  ('product-files',  'product-files',  false, 524288000, array['application/zip','application/x-zip-compressed'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets are readable by URL without a policy. All WRITES, and any read of
-- the private bucket, require the admin (customers receive files only through
-- short-lived signed URLs minted by the server after a purchase check).
drop policy if exists store_media_admin_write on storage.objects;
create policy store_media_admin_write on storage.objects for all
  using (bucket_id in ('product-images','store-assets','avatar-assets','product-files') and public.is_admin())
  with check (bucket_id in ('product-images','store-assets','avatar-assets','product-files') and public.is_admin());
