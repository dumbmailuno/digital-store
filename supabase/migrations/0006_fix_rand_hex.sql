-- 0006: hotfix for projects that already ran 0001 before it was corrected.
-- Sign-up failed with "Database error saving new user" because rand_hex() needed pgcrypto's
-- gen_random_bytes(), which is not visible inside the sign-up trigger on Supabase.
-- The table defaults call public.rand_hex() by name, so replacing it fixes every public ID.
-- Safe to run more than once, and safe to run on a fresh install.
create or replace function public.rand_hex(n int) returns text
language sql volatile set search_path = pg_catalog as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, n))
$$;
