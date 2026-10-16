-- Team access boundaries. Apply after upgrade-007. Safe to reapply; no CRM data is removed.
begin;
create or replace function public.can_access_lead(p_owner uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select case public.app_role()
    when 'admin' then true
    when 'manager' then p_owner=(select auth.uid()) or exists(
      select 1 from public.profiles p where p.id=p_owner and p.manager_id=(select auth.uid()) and p.is_active)
    when 'agent' then p_owner=(select auth.uid())
    else false end
$$;
-- Replaces the inlined policy from upgrade-002, which included the unassigned pool.
-- Fixed role and team membership are evaluated once per statement, including large pools.
alter policy leads_select on public.leads using(
  case (select public.app_role())
    when 'admin' then true
    when 'manager' then owner_id=(select auth.uid()) or owner_id in(
      select p.id from public.profiles p where p.manager_id=(select auth.uid()) and p.is_active)
    when 'agent' then owner_id=(select auth.uid())
    else false end
);
alter policy leads_insert on public.leads with check(public.can_access_lead(owner_id));
alter policy leads_update on public.leads using(public.can_access_lead(owner_id))
  with check(public.can_access_lead(owner_id));

-- A definer helper avoids recursive profile RLS while returning no private profile data.
create or replace function public.can_access_profile(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select case public.app_role()
    when 'admin' then true
    when 'manager' then p_id=(select auth.uid()) or exists(
      select 1 from public.profiles p where p.id=p_id and p.manager_id=(select auth.uid()) and p.is_active)
    when 'agent' then p_id=(select auth.uid())
    else false end
$$;
revoke all on function public.can_access_profile(uuid) from public,anon;
grant execute on function public.can_access_profile(uuid) to authenticated,service_role;
alter policy profiles_read on public.profiles using(
  case (select public.app_role())
    when 'admin' then true
    when 'manager' then id=(select auth.uid()) or (manager_id=(select auth.uid()) and is_active)
    when 'agent' then id=(select auth.uid())
    else false end
);
alter policy upload_batches_staff on public.upload_batches
  using((select public.app_role())='admin') with check((select public.app_role())='admin');
-- Contact masking is needed by list pages; administrative settings stay private.
alter policy app_settings_read on public.app_settings
  using((select public.app_role())='admin' or (key='mask_contacts_in_list' and (select public.app_role()) is not null));
alter policy lead_posts_select on public.lead_posts using((select public.app_role())='admin');
alter policy lead_posts_insert on public.lead_posts with check(
  (select public.app_role())='admin' and posted_by=(select auth.uid())
  and exists(select 1 from public.leads l where l.id=lead_id));
notify pgrst,'reload schema';
commit;
