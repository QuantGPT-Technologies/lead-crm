-- Primary owner. Apply after upgrade-016. Safe to reapply.
--
-- A lead remembers the person it first belonged to (primary_owner_id). When it is transferred
-- or rechurned to someone else, the primary owner can still SEE it (and its history). Only the
-- current owner (and their manager / admins) can change it: the update policy is unchanged.
begin;

alter table public.leads add column if not exists primary_owner_id uuid references public.profiles (id) on delete set null;
create index if not exists leads_primary_owner_idx on public.leads (primary_owner_id) where primary_owner_id is not null;

-- Existing leads: the current owner becomes the primary owner.
update public.leads set primary_owner_id = owner_id where primary_owner_id is null and owner_id is not null;

-- The first owner a lead gets becomes its primary owner. Signed-in users calling the database
-- directly cannot change it; the app sets it only through this trigger or the service role.
create or replace function public.set_primary_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.primary_owner_id := old.primary_owner_id;
  elsif tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    new.primary_owner_id := null;
  end if;
  if new.primary_owner_id is null then new.primary_owner_id := new.owner_id; end if;
  return new;
end $$;
drop trigger if exists leads_primary_owner on public.leads;
create trigger leads_primary_owner before insert or update on public.leads
  for each row execute function public.set_primary_owner();

-- Read access: as before (admin / manager's team / agent's own), plus leads whose primary owner
-- is the caller or, for managers, someone in their active team.
alter policy leads_select on public.leads using (
  case (select public.app_role())
    when 'admin' then true
    when 'manager' then owner_id = (select auth.uid()) or primary_owner_id = (select auth.uid())
      or owner_id in (select p.id from public.profiles p where p.manager_id = (select auth.uid()) and p.is_active)
      or primary_owner_id in (select p.id from public.profiles p where p.manager_id = (select auth.uid()) and p.is_active)
    when 'agent' then owner_id = (select auth.uid()) or primary_owner_id = (select auth.uid())
    else false end
);

notify pgrst, 'reload schema';
commit;
