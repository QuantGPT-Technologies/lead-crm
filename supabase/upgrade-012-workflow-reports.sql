-- Apply after upgrade-011. Retains existing leads and assignment permissions.
begin;
alter table public.leads drop constraint if exists leads_priority_check;
alter table public.leads add constraint leads_priority_check check (priority in ('hot','warm','cold','other'));
alter table public.leads add column if not exists last_attempt_at timestamptz;
alter table public.leads add column if not exists total_calls integer not null default 0;
alter table public.leads add column if not exists last_activity_at timestamptz;
alter table public.leads add column if not exists last_activity_summary text;
alter table public.leads add column if not exists other_fields jsonb not null default '{}';
alter table public.call_logs add column if not exists other_outcome text;
alter table public.call_logs drop constraint if exists call_logs_outcome_check;
alter table public.call_logs add constraint call_logs_outcome_check check (outcome in ('connected','no_answer','busy','switched_off','wrong_number','callback','other'));
alter table public.sub_stages add column if not exists color text not null default '#64748b';

create or replace function public.is_attempt_activity(kind text) returns boolean
language sql immutable as $$
  select kind in ('updated','stage_change','category_change','assigned','note','call','email','sms','whatsapp','task','rechurn','enrolled','opportunity','post','meeting','meeting_scheduled','meeting_updated','meeting_rescheduled','meeting_no_show','meeting_notes','meeting_cancelled','meeting_completed')
$$;

create or replace function public.record_lead_activity_metrics() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.leads set
    attempt_count = attempt_count + case when new.actor_id is not null and public.is_attempt_activity(new.type) then 1 else 0 end,
    last_attempt_at = case when new.actor_id is not null and public.is_attempt_activity(new.type) then greatest(last_attempt_at,new.created_at) else last_attempt_at end,
    last_activity_summary = case when last_activity_at is null or new.created_at >= last_activity_at then new.summary || case when coalesce(new.details->>'text','')<>'' then ': ' || left(new.details->>'text',500) when coalesce(new.details->'fields'->>'Notes','N/A')<>'N/A' then ': ' || left(new.details->'fields'->>'Notes',500) else '' end else last_activity_summary end,
    last_activity_at = greatest(last_activity_at,new.created_at)
  where id = new.lead_id;
  return new;
end $$;
drop trigger if exists lead_activity_metrics on public.lead_activities;
create trigger lead_activity_metrics after insert on public.lead_activities
for each row execute function public.record_lead_activity_metrics();

create or replace function public.record_lead_call_metrics() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.leads set total_calls = total_calls + 1,
    last_contacted_at = greatest(last_contacted_at,new.called_at)
  where id = new.lead_id;
  return new;
end $$;
drop trigger if exists lead_call_metrics on public.call_logs;
create trigger lead_call_metrics after insert on public.call_logs
for each row execute function public.record_lead_call_metrics();

-- Protect derived metrics from direct browser writes, just like attempt_count.
create or replace function public.protect_lead_metrics() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      new.attempt_count := 0; new.last_contacted_at := null;
      new.total_calls := 0; new.last_attempt_at := null;
      new.last_activity_at := null; new.last_activity_summary := null;
    else
      new.attempt_count := old.attempt_count; new.last_contacted_at := old.last_contacted_at;
      new.total_calls := old.total_calls; new.last_attempt_at := old.last_attempt_at;
      new.last_activity_at := old.last_activity_at; new.last_activity_summary := old.last_activity_summary;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_protect_metrics on public.leads;
create trigger leads_protect_metrics before insert or update on public.leads
for each row execute function public.protect_lead_metrics();

-- Existing history supplies the initial counters; running this again is safe.
with metrics as (
  select lead_id, count(*) filter (where actor_id is not null and public.is_attempt_activity(type))::int attempts,
    max(created_at) filter (where actor_id is not null and public.is_attempt_activity(type)) last_attempt
  from public.lead_activities group by lead_id
), calls as (
  select lead_id,count(*)::int total,max(called_at) last_call from public.call_logs group by lead_id
), latest as (
  select distinct on (lead_id) lead_id,created_at,summary || case when coalesce(details->>'text','')<>'' then ': ' || left(details->>'text',500) else '' end as summary from public.lead_activities order by lead_id,created_at desc,id desc
)
update public.leads l set attempt_count = greatest(l.attempt_count,coalesce(m.attempts,0)),
  last_attempt_at = greatest(l.last_attempt_at,m.last_attempt,l.last_contacted_at,c.last_call),
  total_calls = coalesce(c.total,0), last_activity_at = a.created_at, last_activity_summary = a.summary
from latest a left join metrics m on m.lead_id=a.lead_id left join calls c on c.lead_id=a.lead_id
where l.id=a.lead_id;
update public.leads l set total_calls = c.total,
  last_attempt_at = greatest(l.last_attempt_at,c.last_call), last_contacted_at = greatest(l.last_contacted_at,c.last_call)
from (select lead_id,count(*)::int total,max(called_at) last_call from public.call_logs group by lead_id) c where l.id=c.lead_id;
create index if not exists leads_last_attempt_idx on public.leads(last_attempt_at desc,id);
create index if not exists leads_rechurn_idx on public.leads(last_rechurned_at desc,id) where rechurn_count > 0;

-- Other options retain real foreign keys; text is saved per lead in other_fields.
insert into public.lead_sources(name) select 'Other' where not exists(select 1 from public.lead_sources where lower(name)='other');
insert into public.universities(name) select 'Other' where not exists(select 1 from public.universities where lower(name)='other');
insert into public.courses(university_id,name)
select u.id,'Other' from public.universities u where not exists(select 1 from public.courses c where c.university_id=u.id and lower(c.name)='other');
insert into public.stages(funnel_id,name,sort_order,color)
select f.id,'Other',999,'#64748b' from public.stage_funnels f where not exists(select 1 from public.stages s where s.funnel_id=f.id and lower(s.name)='other');
insert into public.sub_stages(stage_id,name,sort_order)
select s.id,'Other',999 from public.stages s where not exists(select 1 from public.sub_stages sub where sub.stage_id=s.id and lower(sub.name)='other');

create or replace function public.crm_lead_report(
 p_from timestamptz,p_to timestamptz,p_dim text default 'stage',p_owner uuid default null,
 p_source uuid default null,p_stage uuid default null,p_attempt text default '',p_churn text default ''
) returns table(label text,total bigint,attempts bigint,calls bigint,contacted bigint,enrolled bigint,lost bigint,statuses jsonb)
language sql stable security invoker set search_path = public as $$
 with selected as (
  select l.*,coalesce(nullif(l.other_fields->>'stage_id',''),st.name,'No status') status,st.is_won,st.is_lost,
   coalesce(case p_dim when 'source' then coalesce(nullif(l.other_fields->>'source_id',''),s.name) when 'owner' then p.full_name
    when 'university' then coalesce(nullif(l.other_fields->>'university_id',''),u.name) when 'course' then coalesce(nullif(l.other_fields->>'course_id',''),c.name) when 'city' then nullif(l.city,'')
    when 'priority' then coalesce(nullif(l.other_fields->>'priority',''),l.priority) when 'category' then l.category
    when 'attempt' then case when l.attempt_count=0 then '0 attempts' when l.attempt_count=1 then '1 attempt' when l.attempt_count=2 then '2 attempts' else '3+ attempts' end
    when 'rechurn' then case when l.rechurn_count>0 then 'Rechurned' else 'Never rechurned' end
    when 'sub_stage' then coalesce(nullif(l.other_fields->>'sub_stage_id',''),sub.name) else coalesce(nullif(l.other_fields->>'stage_id',''),st.name) end,'(none)') dimension
  from leads l left join stages st on st.id=l.stage_id left join lead_sources s on s.id=l.source_id
  left join profiles p on p.id=l.owner_id left join universities u on u.id=l.university_id
  left join courses c on c.id=l.course_id left join sub_stages sub on sub.id=l.sub_stage_id
  where l.created_at>=p_from and l.created_at<p_to
   and (p_owner is null or l.owner_id=p_owner) and (p_source is null or l.source_id=p_source)
   and (p_stage is null or l.stage_id=p_stage)
   and (p_attempt='' or (p_attempt='3+' and l.attempt_count>=3) or (p_attempt in ('0','1','2') and l.attempt_count::text=p_attempt))
   and (p_churn='' or (p_churn='yes' and l.rechurn_count>0) or (p_churn='no' and l.rechurn_count=0))
 ), status_counts as (select dimension,jsonb_object_agg(status,n) counts from (select dimension,status,count(*) n from selected group by 1,2) x group by 1)
 select l.dimension,count(*),coalesce(sum(l.attempt_count),0)::bigint,coalesce(sum(l.total_calls),0)::bigint,
  count(*) filter(where l.attempt_count>0),count(*) filter(where l.is_won),count(*) filter(where l.is_lost),sc.counts
 from selected l join status_counts sc on sc.dimension=l.dimension group by l.dimension,sc.counts order by count(*) desc,l.dimension
$$;

create or replace function public.crm_employee_report(
 p_from timestamptz,p_to timestamptz,p_period text default 'day',p_owner uuid default null,
 p_source uuid default null,p_stage uuid default null,p_tz text default 'Asia/Kolkata'
) returns table(agent_id uuid,agent text,emp_code text,period text,leads bigint,attempts bigint,calls bigint,connected bigint,talk_seconds bigint,followups_done bigint,enrolled bigint,revenue numeric,statuses jsonb)
language sql stable security invoker set search_path = public as $$
 with buckets as (
  select generate_series(date_trunc(case when p_period in ('week','month') then p_period else 'day' end,p_from at time zone p_tz),
    date_trunc(case when p_period in ('week','month') then p_period else 'day' end,(p_to-interval '1 microsecond') at time zone p_tz),
    case p_period when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 day' end) bucket
 ), people as (select id,full_name,emp_code from profiles where is_active and (p_owner is null or id=p_owner)),
 scoped_leads as (select * from leads where (p_source is null or source_id=p_source) and (p_stage is null or stage_id=p_stage)),
 attempts_by as (
  select a.actor_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,a.created_at at time zone p_tz) bucket,count(*) n
  from lead_activities a join scoped_leads l on l.id=a.lead_id
  where a.created_at>=p_from and a.created_at<p_to and public.is_attempt_activity(a.type) group by 1,2
 ), calls_by as (
  select c.user_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,c.called_at at time zone p_tz) bucket,count(*) n,count(*) filter(where outcome='connected') connected,coalesce(sum(c.duration_sec),0)::bigint talk_seconds
  from call_logs c join scoped_leads l on l.id=c.lead_id where c.called_at>=p_from and c.called_at<p_to group by 1,2
 ), allotted as (
  select l.owner_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,l.allotted_at at time zone p_tz) bucket,count(*) n
  from scoped_leads l where l.allotted_at>=p_from and l.allotted_at<p_to group by 1,2
 ), followups as (
  select t.completed_by,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,t.completed_at at time zone p_tz) bucket,count(*) n
  from tasks t join scoped_leads l on l.id=t.lead_id where t.status='done' and t.completed_at>=p_from and t.completed_at<p_to group by 1,2
 ), enrollments_by as (
  select e.created_by,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,e.created_at at time zone p_tz) bucket,count(*) n,coalesce(sum(e.paid_amount),0) revenue
  from enrollments e join scoped_leads l on l.id=e.lead_id where e.created_at>=p_from and e.created_at<p_to group by 1,2
 ), status_counts as (
  select owner_id,bucket,jsonb_object_agg(status,n) counts from (
   select l.owner_id,date_trunc(case when p_period in ('week','month') then p_period else 'day' end,l.allotted_at at time zone p_tz) bucket,coalesce(nullif(l.other_fields->>'stage_id',''),s.name,'No status') status,count(*) n from scoped_leads l left join stages s on s.id=l.stage_id
   where l.allotted_at>=p_from and l.allotted_at<p_to group by 1,2,3
  ) x group by 1,2
 )
 select p.id,p.full_name,p.emp_code,to_char(b.bucket,'YYYY-MM-DD'),coalesce(l.n,0),coalesce(a.n,0),coalesce(c.n,0),coalesce(c.connected,0),coalesce(c.talk_seconds,0),coalesce(f.n,0),coalesce(e.n,0),coalesce(e.revenue,0),coalesce(sc.counts,'{}'::jsonb)
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
create or replace function public.crm_opportunity_totals(p_from timestamptz,p_to timestamptz)
returns table(status text,deals bigint,amount numeric,weighted numeric)
language sql stable security invoker set search_path=public as $$
 select o.status,count(*),coalesce(sum(o.amount),0),coalesce(sum(o.amount*o.probability/100.0),0)
 from opportunities o where o.created_at>=p_from and o.created_at<p_to group by o.status
$$;
revoke all on function public.crm_opportunity_totals(timestamptz,timestamptz) from public,anon;
grant execute on function public.crm_opportunity_totals(timestamptz,timestamptz) to authenticated;
create or replace function public.crm_lookups() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'sources', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name from lead_sources where is_active) x),
    'universities', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name from universities where is_active) x),
    'courses', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name, university_id, fee from courses where is_active) x),
    'funnels', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select id, name, sort_order from stage_funnels where is_active) x),
    'stages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select id, name, funnel_id, color, sort_order, is_won, is_lost from stages where is_active) x),
    'subStages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select id, name, stage_id, sort_order, color from sub_stages where is_active) x),
    'users', (select coalesce(jsonb_agg(to_jsonb(x) order by x.full_name), '[]') from (select id, full_name, emp_code, role from profiles where is_active) x),
    'templates', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (select id, name, channel, subject, body from message_templates where is_active) x)
  )
$$;

create or replace function public.crm_allotment_summary(p_from timestamptz default null,p_to timestamptz default null)
returns table(agent_id uuid,agent text,emp_code text,role public.user_role,total bigint,untouched bigint,due_followups bigint,enrolled bigint)
language sql stable security invoker set search_path=public as $$
 select p.id,p.full_name,p.emp_code,p.role,count(l.id),count(l.id) filter(where l.attempt_count=0),
 count(l.id) filter(where l.next_followup_at<now()),count(l.id) filter(where s.is_won)
 from profiles p left join leads l on l.owner_id=p.id and (p_from is null or l.allotted_at>=p_from) and (p_to is null or l.allotted_at<p_to)
 left join stages s on s.id=l.stage_id where p.is_active group by p.id,p.full_name,p.emp_code,p.role order by p.full_name
$$;
revoke all on function public.crm_allotment_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.crm_allotment_summary(timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
