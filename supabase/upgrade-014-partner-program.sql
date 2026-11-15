-- Partner program. Apply after upgrade-013. Safe to reapply; no existing CRM data is changed.
--
-- Partners are outside the staff roles: they have a Supabase Auth login but no row in
-- `profiles`, so app_role() is null for them and every existing row-level-security policy
-- denies them direct database access. The partner portal reads and writes through the
-- server with the service role, always scoped to the signed-in partner's own leads.
begin;

create sequence if not exists public.partner_code_seq start 1;

create table if not exists public.partners (
  id                uuid primary key references auth.users (id) on delete cascade,
  partner_code      text unique not null default 'PT' || lpad(nextval('public.partner_code_seq')::text, 6, '0'),
  full_name         text not null,
  organization      text,
  email             text unique not null,
  phone             text not null,           -- E.164, e.g. +919876543210
  city              text,
  is_active         boolean not null default true,
  email_verified_at timestamptz,            -- set when the partner opens the emailed link and sets a password
  last_login_at     timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
alter table public.partners enable row level security;
revoke all on public.partners from public, anon, authenticated;
grant all on public.partners to service_role;
grant usage on sequence public.partner_code_seq to service_role;

-- The mobile number is stored for contact only (no SMS verification). Remove the phone
-- verification objects an earlier draft of this upgrade created.
drop table if exists public.partner_phone_checks;
drop index if exists public.partners_active_phone_key;

-- Leads a partner submitted, and history entries a partner wrote.
alter table public.leads add column if not exists partner_id uuid references public.partners (id) on delete set null;
create index if not exists leads_partner_created_idx on public.leads (partner_id, created_at desc) where partner_id is not null;
alter table public.lead_activities add column if not exists partner_id uuid references public.partners (id) on delete set null;

-- Staff calling the database directly cannot reattribute a lead or write in a partner's name.
create or replace function public.guard_partner_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_table_name = 'leads' then
      if tg_op = 'INSERT' then new.partner_id := null; else new.partner_id := old.partner_id; end if;
    else
      new.partner_id := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_partner_guard on public.leads;
create trigger leads_partner_guard before insert or update on public.leads
  for each row execute function public.guard_partner_columns();
drop trigger if exists lead_activities_partner_guard on public.lead_activities;
create trigger lead_activities_partner_guard before insert on public.lead_activities
  for each row execute function public.guard_partner_columns();

-- Used by the request proxy: true for an active partner who has verified their email.
create or replace function public.partner_portal_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partners p
    where p.id = auth.uid() and p.is_active and p.email_verified_at is not null)
$$;
alter table public.partners drop column if exists phone_verified_at;
revoke all on function public.partner_portal_access() from public, anon;
grant execute on function public.partner_portal_access() to authenticated, service_role;

-- Partner submissions are tagged with this source so they can be filtered and distributed.
insert into public.lead_sources (name)
select 'Partner Program'
where not exists (select 1 from public.lead_sources where lower(name) = 'partner program');

notify pgrst, 'reload schema';
commit;
