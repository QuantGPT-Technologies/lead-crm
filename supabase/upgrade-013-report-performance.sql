-- Apply after upgrade-012. Fixes report timeouts without bypassing row-level security.
-- Does not update leads, assignments, activities, or counters.
begin;

-- Refresh the same admin/all, manager/active-team, and agent/own read boundaries
-- from upgrade-008. Older policies can still call can_access_lead once per lead.
alter policy profiles_read on public.profiles using (
  case (select public.app_role())
    when 'admin' then true
    when 'manager' then id=(select auth.uid()) or (manager_id=(select auth.uid()) and is_active)
    when 'agent' then id=(select auth.uid())
    else false end
);
alter policy leads_select on public.leads using (
  case (select public.app_role())
    when 'admin' then true
    when 'manager' then owner_id=(select auth.uid()) or owner_id in (
      select p.id from public.profiles p where p.manager_id=(select auth.uid()) and p.is_active)
    when 'agent' then owner_id=(select auth.uid())
    else false end
);

-- Fixed caller roles are statement constants, including the FOR ALL policies which
-- also participate in SELECT. Avoid repeatedly looking up the same role per row.
do $$
declare tbl text;
begin
  foreach tbl in array array['lead_sources','universities','courses','stage_funnels','stages','sub_stages','message_templates'] loop
    execute format('alter policy %I on public.%I using ((select public.app_role()) is not null)',tbl || '_read',tbl);
    execute format('alter policy %I on public.%I using ((select public.app_role()) = ''admin'') with check ((select public.app_role()) = ''admin'')',tbl || '_admin',tbl);
  end loop;
end $$;

create index if not exists leads_source_created_idx on public.leads(source_id,created_at);
create index if not exists leads_stage_created_idx on public.leads(stage_id,created_at);
create index if not exists lead_activities_actor_created_idx on public.lead_activities(actor_id,created_at,lead_id);
create index if not exists call_logs_user_called_idx on public.call_logs(user_id,called_at,lead_id);
create index if not exists tasks_completed_by_date_idx on public.tasks(completed_by,completed_at,lead_id) where status='done';
create index if not exists enrollments_creator_date_idx on public.enrollments(created_by,created_at,lead_id);

create or replace function public.crm_lead_report(
 p_from timestamptz,p_to timestamptz,p_dim text default 'stage',p_owner uuid default null,
 p_source uuid default null,p_stage uuid default null,p_attempt text default '',p_churn text default ''
) returns table(label text,total bigint,attempts bigint,calls bigint,contacted bigint,enrolled bigint,lost bigint,statuses jsonb)
language sql stable security invoker set search_path=public as $$
 with stage_data as materialized (
  select id,name,is_won,is_lost from public.stages
 ), maps as materialized (
  select
   (select coalesce(jsonb_object_agg(id::text,jsonb_build_object('name',name,'won',is_won,'lost',is_lost)),'{}'::jsonb) from stage_data) stage_meta,
   case p_dim
    when 'source' then (select jsonb_object_agg(id::text,name) from public.lead_sources)
    when 'owner' then (select jsonb_object_agg(id::text,full_name) from public.profiles)
    when 'university' then (select jsonb_object_agg(id::text,name) from public.universities)
    when 'course' then (select jsonb_object_agg(id::text,name) from public.courses)
    when 'sub_stage' then (select jsonb_object_agg(id::text,name) from public.sub_stages)
    else (select jsonb_object_agg(id::text,name) from stage_data)
   end dimension_names
 ), grouped as materialized (
  -- No label joins and no wide lead payloads in the scan of the lead cohort.
  select
   case p_dim when 'source' then l.source_id when 'owner' then l.owner_id
    when 'university' then l.university_id when 'course' then l.course_id when 'sub_stage' then l.sub_stage_id
    when 'city' then null::uuid when 'priority' then null::uuid when 'category' then null::uuid
    when 'attempt' then null::uuid when 'rechurn' then null::uuid else l.stage_id end dimension_id,
   case p_dim when 'source' then nullif(l.other_fields->>'source_id','')
    when 'owner' then null::text
    when 'university' then nullif(l.other_fields->>'university_id','')
    when 'course' then nullif(l.other_fields->>'course_id','')
    when 'sub_stage' then nullif(l.other_fields->>'sub_stage_id','')
    when 'city' then nullif(l.city,'')
    when 'priority' then coalesce(nullif(l.other_fields->>'priority',''),l.priority)
    when 'category' then l.category
    when 'attempt' then case when l.attempt_count=0 then '0 attempts' when l.attempt_count=1 then '1 attempt' when l.attempt_count=2 then '2 attempts' else '3+ attempts' end
    when 'rechurn' then case when l.rechurn_count>0 then 'Rechurned' else 'Never rechurned' end
    else nullif(l.other_fields->>'stage_id','') end dimension_text,
   l.stage_id,nullif(l.other_fields->>'stage_id','') custom_status,
   count(*) n,coalesce(sum(l.attempt_count),0)::bigint attempts,coalesce(sum(l.total_calls),0)::bigint calls,
   count(*) filter(where l.attempt_count>0) contacted
  from public.leads l
  where l.created_at>=p_from and l.created_at<p_to
   and (p_owner is null or l.owner_id=p_owner) and (p_source is null or l.source_id=p_source)
   and (p_stage is null or l.stage_id=p_stage)
   and (p_attempt='' or (p_attempt='3+' and l.attempt_count>=3) or (p_attempt in ('0','1','2') and l.attempt_count::text=p_attempt))
   and (p_churn='' or (p_churn='yes' and l.rechurn_count>0) or (p_churn='no' and l.rechurn_count=0))
  group by 1,2,3,4
 ), resolved as (
  select coalesce(g.dimension_text,m.dimension_names->>g.dimension_id::text,'(none)') label,
   coalesce(g.custom_status,m.stage_meta->g.stage_id::text->>'name','No status') status,
   g.n,g.attempts,g.calls,g.contacted,
   case when coalesce((m.stage_meta->g.stage_id::text->>'won')::boolean,false) then g.n else 0 end enrolled,
   case when coalesce((m.stage_meta->g.stage_id::text->>'lost')::boolean,false) then g.n else 0 end lost
  from grouped g cross join maps m
 ), by_status as (
  select label,status,sum(n)::bigint n,sum(attempts)::bigint attempts,sum(calls)::bigint calls,
   sum(contacted)::bigint contacted,sum(enrolled)::bigint enrolled,sum(lost)::bigint lost
  from resolved group by label,status
 )
 select label,sum(n)::bigint,sum(attempts)::bigint,sum(calls)::bigint,sum(contacted)::bigint,
  sum(enrolled)::bigint,sum(lost)::bigint,jsonb_object_agg(status,n)
 from by_status group by label order by sum(n) desc,label
$$;

create or replace function public.crm_employee_report(
 p_from timestamptz,p_to timestamptz,p_period text default 'day',p_owner uuid default null,
 p_source uuid default null,p_stage uuid default null,p_tz text default 'Asia/Kolkata'
) returns table(agent_id uuid,agent text,emp_code text,period text,leads bigint,attempts bigint,calls bigint,connected bigint,talk_seconds bigint,followups_done bigint,enrolled bigint,revenue numeric,statuses jsonb)
language sql stable security invoker set search_path=public as $$
 with buckets as (
  select generate_series(date_trunc(case when p_period in ('week','month') then p_period else 'day' end,p_from at time zone p_tz),
   date_trunc(case when p_period in ('week','month') then p_period else 'day' end,(p_to-interval '1 microsecond') at time zone p_tz),
   case p_period when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 day' end) bucket
 ), people as materialized (select id,full_name,emp_code from public.profiles where is_active and (p_owner is null or id=p_owner)),
 scoped_leads as materialized (
  select id,owner_id,stage_id,allotted_at,nullif(other_fields->>'stage_id','') custom_status
  from public.leads where (p_source is null or source_id=p_source) and (p_stage is null or stage_id=p_stage)
 ), stage_data as materialized (select id,name from public.stages),
 attempts_by as (
  select a.actor_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,a.created_at at time zone p_tz) bucket,count(*) n
  from public.lead_activities a join scoped_leads l on l.id=a.lead_id
  where a.created_at>=p_from and a.created_at<p_to and public.is_attempt_activity(a.type) group by 1,2
 ), calls_by as (
  select c.user_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,c.called_at at time zone p_tz) bucket,
   count(*) n,count(*) filter(where outcome='connected') connected,coalesce(sum(c.duration_sec),0)::bigint talk_seconds
  from public.call_logs c join scoped_leads l on l.id=c.lead_id where c.called_at>=p_from and c.called_at<p_to group by 1,2
 ), allotted as (
  select l.owner_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,l.allotted_at at time zone p_tz) bucket,count(*) n
  from scoped_leads l where l.allotted_at>=p_from and l.allotted_at<p_to group by 1,2
 ), followups as (
  select t.completed_by,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,t.completed_at at time zone p_tz) bucket,count(*) n
  from public.tasks t join scoped_leads l on l.id=t.lead_id where t.status='done' and t.completed_at>=p_from and t.completed_at<p_to group by 1,2
 ), enrollments_by as (
  select e.created_by,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,e.created_at at time zone p_tz) bucket,count(*) n,coalesce(sum(e.paid_amount),0) revenue
  from public.enrollments e join scoped_leads l on l.id=e.lead_id where e.created_at>=p_from and e.created_at<p_to group by 1,2
 ), status_counts as (
  select owner_id,bucket,jsonb_object_agg(status,n) counts from (
   select l.owner_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,l.allotted_at at time zone p_tz) bucket,
    coalesce(l.custom_status,s.name,'No status') status,count(*) n
   from scoped_leads l left join stage_data s on s.id=l.stage_id
   where l.allotted_at>=p_from and l.allotted_at<p_to group by 1,2,3
  ) x group by 1,2
 )
 select p.id,p.full_name,p.emp_code,to_char(b.bucket,'YYYY-MM-DD'),coalesce(l.n,0),coalesce(a.n,0),coalesce(c.n,0),coalesce(c.connected,0),
  coalesce(c.talk_seconds,0),coalesce(f.n,0),coalesce(e.n,0),coalesce(e.revenue,0),coalesce(sc.counts,'{}'::jsonb)
 from people p cross join buckets b left join allotted l on l.owner_id=p.id and l.bucket=b.bucket
 left join attempts_by a on a.actor_id=p.id and a.bucket=b.bucket left join calls_by c on c.user_id=p.id and c.bucket=b.bucket
 left join followups f on f.completed_by=p.id and f.bucket=b.bucket left join status_counts sc on sc.owner_id=p.id and sc.bucket=b.bucket
 left join enrollments_by e on e.created_by=p.id and e.bucket=b.bucket
 order by b.bucket desc,p.full_name,p.id
$$;

revoke all on function public.crm_lead_report(timestamptz,timestamptz,text,uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.crm_employee_report(timestamptz,timestamptz,text,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.crm_lead_report(timestamptz,timestamptz,text,uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.crm_employee_report(timestamptz,timestamptz,text,uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
