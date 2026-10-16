-- Install before enabling Firebase agent login. Existing auth remains active until
-- app_settings.agent_auth_mode is changed from "password" to "firebase".
begin;
create or replace function public.crm_phone_e164(value text) returns text
language sql immutable set search_path=public as $$
  with phone as (select regexp_replace(coalesce(value,''),'[^0-9]','','g') digits)
  select case
    when trim(value) like '+%' and digits ~ '^[1-9][0-9]{7,14}$' then '+' || digits
    when digits ~ '^[6-9][0-9]{9}$' then '+91' || digits
    when digits ~ '^91[6-9][0-9]{9}$' then '+' || digits
    when digits ~ '^0[6-9][0-9]{9}$' then '+91' || substring(digits from 2)
    else null end from phone
$$;
-- Do not block installation on legacy duplicate phones. Such accounts cannot sign in
-- until an admin assigns unique numbers; new duplicates are rejected immediately.
create or replace function public.guard_agent_login_phone() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.role='agent' and new.is_active and public.crm_phone_e164(new.phone) is not null and (
    tg_op='INSERT' or new.role is distinct from old.role or new.is_active is distinct from old.is_active or
    public.crm_phone_e164(new.phone) is distinct from public.crm_phone_e164(old.phone)) then
    if exists(select 1 from public.profiles p where p.id<>new.id and p.role='agent' and p.is_active
      and public.crm_phone_e164(p.phone)=public.crm_phone_e164(new.phone)) then
      raise exception 'Each active sales agent needs a unique registered mobile number' using errcode='23505';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_agent_phone_guard on public.profiles;
create trigger profiles_agent_phone_guard before insert or update on public.profiles
for each row execute function public.guard_agent_login_phone();

create table if not exists public.firebase_agent_sessions (
  session_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  firebase_uid text not null,
  phone_e164 text not null,
  firebase_auth_time timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(expires_at > created_at)
);
create index if not exists firebase_agent_sessions_user_idx on public.firebase_agent_sessions(user_id,expires_at);
alter table public.firebase_agent_sessions enable row level security;
revoke all on public.firebase_agent_sessions from public,anon,authenticated;
grant all on public.firebase_agent_sessions to service_role;

create table if not exists public.firebase_otp_attempts (
  firebase_uid text not null,
  firebase_auth_time bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(firebase_uid,firebase_auth_time)
);
alter table public.firebase_otp_attempts enable row level security;
revoke all on public.firebase_otp_attempts from public,anon,authenticated;
grant all on public.firebase_otp_attempts to service_role;

insert into public.app_settings(key,value) values('agent_auth_mode','"password"'::jsonb) on conflict(key) do nothing;

-- Checks the session, rather than trusting the client or a user-editable JWT claim.
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path=public as $$
  select p.role from public.profiles p
  where p.id=auth.uid() and p.is_active and (
    p.role <> 'agent' or
    coalesce((select value from public.app_settings where key='agent_auth_mode'),'"password"'::jsonb) <> '"firebase"'::jsonb or
    exists(select 1 from public.firebase_agent_sessions s where s.user_id=p.id
      and s.session_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
      and s.phone_e164=public.crm_phone_e164(p.phone) and s.expires_at>now())
  )
$$;

create or replace function public.agent_login_profile(p_phone text)
returns table(id uuid,email text,phone text)
language sql stable security definer set search_path=public as $$
  select p.id,p.email,p.phone from public.profiles p
  where p.role='agent' and p.is_active and public.crm_phone_e164(p.phone)=p_phone
$$;
revoke all on function public.agent_login_profile(text) from public,anon,authenticated;
grant execute on function public.agent_login_profile(text) to service_role;
notify pgrst,'reload schema';
commit;
