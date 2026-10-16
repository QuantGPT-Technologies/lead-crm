-- Email/password sign-in for every role. Safe to reapply; preserves users and CRM records.
-- Existing production databases work immediately after agent_auth_mode is set to "password".
-- This migration also removes the obsolete unique-agent-phone trigger.
begin;
insert into public.app_settings(key,value) values('agent_auth_mode','"password"'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();
drop trigger if exists profiles_agent_phone_guard on public.profiles;
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path=public as $$
  select p.role from public.profiles p where p.id=auth.uid() and p.is_active
$$;
notify pgrst,'reload schema';
commit;
