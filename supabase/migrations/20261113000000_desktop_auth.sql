-- Credentials are SHA-256 hashes of independent, random 256-bit values.
create table public.wms_desktop_challenges (
  scan_hash text primary key,
  poll_hash text not null unique,
  expires_at timestamptz not null default (clock_timestamp() + interval '60 seconds'),
  line_user_id text
);

create table public.wms_desktop_sessions (
  token_hash text primary key,
  line_user_id text not null,
  idle_until timestamptz not null,
  expires_at timestamptz not null
);

create index on public.wms_desktop_challenges (expires_at);
create index on public.wms_desktop_sessions (idle_until);
alter table public.wms_desktop_challenges enable row level security;
alter table public.wms_desktop_sessions enable row level security;
revoke all on public.wms_desktop_challenges, public.wms_desktop_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.wms_desktop_challenges, public.wms_desktop_sessions to service_role;

create function public.wms_redeem_desktop_challenge(p_poll_hash text, p_token_hash text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with redeemed as (
    delete from public.wms_desktop_challenges
    where poll_hash = p_poll_hash and expires_at > clock_timestamp()
      and line_user_id is not null
    returning line_user_id
  ), issued as (
    insert into public.wms_desktop_sessions (token_hash, line_user_id, idle_until, expires_at)
    select p_token_hash, line_user_id, clock_timestamp() + interval '60 seconds',
           clock_timestamp() + interval '8 hours'
    from redeemed
    returning token_hash
  )
  select exists (select 1 from issued);
$$;

create function public.wms_desktop_activity(p_token_hash text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with renewed as (
    update public.wms_desktop_sessions
    set idle_until = least(expires_at, clock_timestamp() + interval '60 seconds')
    where token_hash = p_token_hash and idle_until > clock_timestamp()
      and expires_at > clock_timestamp()
    returning token_hash
  )
  select exists (select 1 from renewed);
$$;

revoke all on function public.wms_redeem_desktop_challenge(text, text),
  public.wms_desktop_activity(text) from public, anon, authenticated;
grant execute on function public.wms_redeem_desktop_challenge(text, text),
  public.wms_desktop_activity(text) to service_role;
