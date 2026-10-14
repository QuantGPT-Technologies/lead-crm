-- Run once in the production Supabase SQL Editor after schema.sql / upgrade-001.
-- Idempotent. Functions run as the caller: existing RLS and column grants apply.
begin;

create index if not exists profiles_manager_idx on public.profiles(manager_id);
create index if not exists leads_owner_created_idx on public.leads(owner_id, created_at desc);
create index if not exists leads_stage_updated_idx on public.leads(stage_id, updated_at desc);
create index if not exists call_logs_called_idx on public.call_logs(called_at);
create index if not exists enrollments_created_idx on public.enrollments(created_at);

-- Evaluate the caller's fixed role/id once per statement, not once per lead row.
-- Visibility is identical to can_access_lead: admin/all; manager/team + unassigned; agent/own.
alter policy profiles_read on public.profiles using ((select public.app_role()) is not null);
alter policy leads_select on public.leads using (
  case (select public.app_role())
    when 'admin' then true
    when 'manager' then owner_id is null or owner_id = (select auth.uid())
      or owner_id in (select id from public.profiles where manager_id = (select auth.uid()))
    when 'agent' then owner_id = (select auth.uid())
    else false
  end
);

-- Match the application's contains-search across names, emails and phone numbers.
create extension if not exists pg_trgm with schema extensions;
do $$
declare op_schema text; col text;
begin
  select n.nspname into op_schema from pg_opclass o join pg_namespace n on n.oid = o.opcnamespace
    where o.opcname = 'gin_trgm_ops' limit 1;
  foreach col in array array['student_name', 'mobile', 'alt_mobile', 'email', 'lead_no'] loop
    execute format('create index if not exists %I on public.leads using gin (%I %I.gin_trgm_ops)',
      'leads_' || col || '_trgm_idx', col, op_schema);
  end loop;
end $$;

create or replace function public.crm_lookups() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'sources', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name from lead_sources where is_active) x),
    'universities', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name from universities where is_active) x),
    'courses', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name, university_id, fee from courses where is_active) x),
    'funnels', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select id, name, sort_order from stage_funnels where is_active) x),
    'stages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select id, name, funnel_id, color, sort_order, is_won, is_lost from stages where is_active) x),
    'subStages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select id, name, stage_id, sort_order from sub_stages where is_active) x),
    'users', (select coalesce(jsonb_agg(to_jsonb(x) order by x.full_name), '[]') from (select id, full_name, emp_code, role from profiles where is_active) x),
    'templates', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name, channel, subject, body from message_templates where is_active) x)
  )
$$;

create or replace function public.crm_dashboard_counts(p_today timestamptz, p_tomorrow timestamptz)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'leadsNow', l.current_total, 'leadsPrev', l.previous_total,
    'callsNow', c.current_total, 'callsPrev', c.previous_total,
    'enrolledNow', e.current_total, 'enrolledPrev', e.previous_total,
    'dueToday', t.due_today, 'missed', t.overdue
  )
  from (
    select count(*) filter (where created_at >= p_tomorrow - interval '7 days') current_total,
           count(*) filter (where created_at < p_tomorrow - interval '7 days') previous_total
    from leads where created_at >= p_tomorrow - interval '14 days' and created_at < p_tomorrow
  ) l cross join (
    select count(*) filter (where called_at >= p_tomorrow - interval '7 days') current_total,
           count(*) filter (where called_at < p_tomorrow - interval '7 days') previous_total
    from call_logs where called_at >= p_tomorrow - interval '14 days' and called_at < p_tomorrow
  ) c cross join (
    select count(*) filter (where created_at >= p_tomorrow - interval '7 days') current_total,
           count(*) filter (where created_at < p_tomorrow - interval '7 days') previous_total
    from enrollments where created_at >= p_tomorrow - interval '14 days' and created_at < p_tomorrow
  ) e cross join (
    select count(*) filter (where due_at >= p_today) due_today,
           count(*) filter (where due_at < p_today) overdue
    from tasks where assigned_to = (select auth.uid()) and status = 'pending' and due_at < p_tomorrow
  ) t
$$;

-- Aggregate each table once over an indexed date range rather than rescanning per day.
create or replace function public.report_daily(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Kolkata')
returns table(day date, leads bigint, enrolled bigint)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select (p_from at time zone p_tz)::date first_day, ((p_to - interval '1 second') at time zone p_tz)::date last_day
  ), days as (
    select generate_series(first_day, last_day, interval '1 day')::date as day from bounds
  ), lead_counts as (
    select (l.created_at at time zone p_tz)::date as day, count(*) total from leads l cross join bounds b
    where l.created_at >= (b.first_day::timestamp at time zone p_tz)
      and l.created_at < ((b.last_day + 1)::timestamp at time zone p_tz) group by 1
  ), enrollment_counts as (
    select (e.created_at at time zone p_tz)::date as day, count(*) total from enrollments e cross join bounds b
    where e.created_at >= (b.first_day::timestamp at time zone p_tz)
      and e.created_at < ((b.last_day + 1)::timestamp at time zone p_tz) group by 1
  )
  select d.day, coalesce(l.total, 0), coalesce(e.total, 0) from days d
    left join lead_counts l on l.day = d.day left join enrollment_counts e on e.day = d.day order by d.day
$$;

revoke all on function public.crm_lookups() from public, anon;
revoke all on function public.crm_dashboard_counts(timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_lookups() to authenticated, service_role;
grant execute on function public.crm_dashboard_counts(timestamptz, timestamptz) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
