-- 0005: customer email-code 2FA and rate limiting.
-- Everything here is service-role only. Browsers never touch these tables or functions.

-- ---------------------------------------------------------------- email codes
create table public.email_otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  purpose     text not null check (purpose in ('login','enable','disable')),
  code_hash   text not null,                      -- sha256(code + user + purpose + pepper); the code itself is never stored
  attempts    int  not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index email_otp_lookup on public.email_otp_challenges (user_id, purpose, created_at desc);
alter table public.email_otp_challenges enable row level security;   -- no policies: nobody but service_role
revoke all on public.email_otp_challenges from anon, authenticated;

-- Issue a new code. Older live codes for the same user+purpose are voided.
-- Returns false (and sends nothing) if the previous one was issued under p_cooldown_seconds ago.
create or replace function public.otp_issue(p_user uuid, p_purpose text, p_hash text, p_ttl_seconds int, p_cooldown_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare last_at timestamptz;
begin
  select max(created_at) into last_at from email_otp_challenges
   where user_id = p_user and purpose = p_purpose and consumed_at is null;
  if last_at is not null and last_at > now() - make_interval(secs => p_cooldown_seconds) then
    return false;
  end if;
  update email_otp_challenges set consumed_at = now()
   where user_id = p_user and purpose = p_purpose and consumed_at is null;
  insert into email_otp_challenges (user_id, purpose, code_hash, expires_at)
  values (p_user, p_purpose, p_hash, now() + make_interval(secs => p_ttl_seconds));
  delete from email_otp_challenges where created_at < now() - interval '2 days';
  return true;
end $$;

-- Check a code. Result: 'ok' | 'wrong' | 'expired' | 'locked' | 'none'.
-- A wrong guess burns an attempt; after p_max_attempts the code is dead and a new one must be requested.
create or replace function public.otp_verify(p_user uuid, p_purpose text, p_hash text, p_max_attempts int)
returns text language plpgsql security definer set search_path = public as $$
declare c email_otp_challenges;
begin
  select * into c from email_otp_challenges
   where user_id = p_user and purpose = p_purpose and consumed_at is null
   order by created_at desc limit 1 for update;
  if not found then return 'none'; end if;
  if c.expires_at < now() then
    update email_otp_challenges set consumed_at = now() where id = c.id;
    return 'expired';
  end if;
  if c.attempts >= p_max_attempts then
    update email_otp_challenges set consumed_at = now() where id = c.id;
    return 'locked';
  end if;
  if c.code_hash = p_hash then
    update email_otp_challenges set consumed_at = now() where id = c.id;
    return 'ok';
  end if;
  update email_otp_challenges set attempts = attempts + 1 where id = c.id;
  return case when c.attempts + 1 >= p_max_attempts then 'locked' else 'wrong' end;
end $$;

-- The only way the email-2FA flag changes: after a verified code, via the server.
create or replace function public.otp_set_enabled(p_user uuid, p_enabled boolean)
returns void language sql security definer set search_path = public as $$
  update profiles set email_otp_2fa = p_enabled where id = p_user;
$$;

-- ---------------------------------------------------------------- rate limits
-- Fixed-window counters. One atomic upsert per hit, so concurrent requests cannot slip past the limit.
create table public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, retry_after int) language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into n;
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;
  allowed := n <= p_limit;
  retry_after := greatest(1, ceil(extract(epoch from (w + make_interval(secs => p_window_seconds) - now())))::int);
  return next;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'otp_issue(uuid,text,text,int,int)',
    'otp_verify(uuid,text,text,int)',
    'otp_set_enabled(uuid,boolean)',
    'rate_limit_hit(text,int,int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
