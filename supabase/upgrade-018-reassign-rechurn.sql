-- Reassigning counts as a rechurn. Apply after upgrade-017. Safe to reapply.
--
-- When a lead that already has an owner is given to a DIFFERENT person, it is counted as
-- rechurned (rechurn_count + 1, last_rechurned_at = now), so it moves to the Rechurned tab.
-- Not counted: first assignment of an unassigned lead, moving a lead to the unassigned pool,
-- and the Re-engage action (which counts the rechurn itself).
-- The trigger name sorts after leads_protect, so it runs after that guard and applies to every
-- way an owner can change (app, assignments page, direct database calls).
begin;

create or replace function public.count_reassign_as_rechurn() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.owner_id is not null and new.owner_id is not null and new.owner_id <> old.owner_id
     and new.rechurn_count = old.rechurn_count then
    new.rechurn_count := old.rechurn_count + 1;
    new.last_rechurned_at := now();
  end if;
  return new;
end $$;
drop trigger if exists leads_zz_reassign_rechurn on public.leads;
create trigger leads_zz_reassign_rechurn before update of owner_id on public.leads
  for each row execute function public.count_reassign_as_rechurn();

notify pgrst, 'reload schema';
commit;
