-- Pivot report (Reports -> Pivot). Apply after upgrade-014. Safe to reapply.
--
-- crm_pivot_key() turns one lead and one field name into the value the pivot groups by.
-- Both report functions run as the caller (security invoker), so row-level security still
-- limits each person to the leads they are allowed to see.
begin;

create or replace function public.crm_pivot_key(l public.leads, d text, tz text) returns text
language sql stable set search_path = public as $$
  select coalesce(case d
    when 'stage'         then coalesce(l.stage_id::text, '')
    when 'sub_stage'     then coalesce(l.sub_stage_id::text, '')
    when 'attempt'       then case when l.attempt_count >= 10 then '10+' else l.attempt_count::text end
    when 'calls'         then case when l.total_calls >= 10 then '10+' else l.total_calls::text end
    when 'created_day'   then to_char(l.created_at at time zone tz, 'YYYY-MM-DD')
    when 'created_month' then to_char(l.created_at at time zone tz, 'YYYY-MM')
    when 'activity_day'  then to_char(l.last_activity_at at time zone tz, 'YYYY-MM-DD')
    when 'followup_day'  then to_char(l.next_followup_at at time zone tz, 'YYYY-MM-DD')
    when 'remark'        then left(btrim(l.remarks), 120)
    when 'source'        then coalesce(l.source_id::text, '')
    when 'owner'         then coalesce(l.owner_id::text, '')
    when 'university'    then coalesce(l.university_id::text, '')
    when 'course'        then coalesce(l.course_id::text, '')
    when 'city'          then initcap(btrim(l.city))
    when 'state'         then initcap(btrim(l.state))
    when 'priority'      then coalesce(nullif(l.other_fields->>'priority', ''), l.priority)
    when 'category'      then l.category
    when 'rechurn'       then case when l.rechurn_count > 0 then 'yes' else 'no' end
    when 'dnd'           then case when l.dnd then 'yes' else 'no' end
    when 'partner'       then coalesce(l.partner_id::text, '')
  end, '')
$$;

-- Counts per combination of the chosen fields, for leads created in [p_from, p_to).
create or replace function public.crm_pivot(p_from timestamptz, p_to timestamptz, p_dims text[], p_tz text default 'Asia/Kolkata')
returns table(keys text[], n bigint)
language sql stable security invoker set search_path = public as $$
  select array(select public.crm_pivot_key(l, u.d, p_tz) from unnest(p_dims) with ordinality u(d, i) order by u.i), count(*)
  from public.leads l
  where l.created_at >= p_from and l.created_at < p_to
  group by 1
$$;

-- The leads behind one cell: every field in p_dims must have the matching value in p_keys.
create or replace function public.crm_pivot_leads(p_from timestamptz, p_to timestamptz, p_dims text[], p_keys text[], p_tz text default 'Asia/Kolkata')
returns setof public.leads
language sql stable security invoker set search_path = public as $$
  select l.* from public.leads l
  where l.created_at >= p_from and l.created_at < p_to
    and cardinality(p_dims) = cardinality(p_keys)
    and not exists (
      select 1 from unnest(p_dims, p_keys) x(d, k)
      where public.crm_pivot_key(l, x.d, p_tz) is distinct from x.k)
  order by l.created_at desc, l.id
$$;

revoke all on function public.crm_pivot_key(public.leads, text, text) from public, anon;
revoke all on function public.crm_pivot(timestamptz, timestamptz, text[], text) from public, anon;
revoke all on function public.crm_pivot_leads(timestamptz, timestamptz, text[], text[], text) from public, anon;
grant execute on function public.crm_pivot_key(public.leads, text, text) to authenticated, service_role;
grant execute on function public.crm_pivot(timestamptz, timestamptz, text[], text) to authenticated, service_role;
grant execute on function public.crm_pivot_leads(timestamptz, timestamptz, text[], text[], text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
