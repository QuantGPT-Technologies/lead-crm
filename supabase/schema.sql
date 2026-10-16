-- =============================================================================
-- Lead CRM - full database schema (single tenant)
-- Run this whole file ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run
-- Then run:  npm run setup:admin   (creates the first admin user + global login)
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- users -----
create type user_role as enum ('admin', 'manager', 'agent');

create sequence emp_code_seq start 1;

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  emp_code    text unique not null default 'EA' || lpad(nextval('emp_code_seq')::text, 8, '0'),
  full_name   text not null,
  email       text unique not null,
  phone       text,
  role        user_role not null default 'agent',
  manager_id  uuid references profiles (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Role of the logged-in user (null when inactive / unknown). SECURITY DEFINER so
-- it can be used inside RLS policies without recursion.
create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() in ('admin', 'manager'), false)
$$;

-- Global (company level) login - step 1 of the sign-in flow.
create table global_login (
  id            int primary key default 1 check (id = 1),
  email         text not null,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

create or replace function verify_global_login(p_email text, p_password text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from global_login
    where lower(email) = lower(trim(p_email))
      and password_hash = crypt(p_password, password_hash)
  )
$$;

create or replace function set_global_login(p_email text, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(p_password) < 8 then
    raise exception 'Global password must be at least 8 characters';
  end if;
  insert into global_login (id, email, password_hash)
  values (1, lower(trim(p_email)), crypt(p_password, gen_salt('bf', 10)))
  on conflict (id) do update
    set email = excluded.email, password_hash = excluded.password_hash, updated_at = now();
end $$;

-- -------------------------------------------------------------- masters -----
create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table universities (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  name text not null,
  fee numeric(12, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (university_id, name)
);

create table stage_funnels (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references stage_funnels (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  color text not null default '#6366f1',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (funnel_id, name)
);

create table sub_stages (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (stage_id, name)
);

-- names are unique whatever their case ("Website" and "website" are the same source)
create unique index lead_sources_name_ci on lead_sources (lower(name));
create unique index universities_name_ci on universities (lower(name));
create unique index courses_name_ci on courses (university_id, lower(name));
create unique index stage_funnels_name_ci on stage_funnels (lower(name));
create unique index stages_name_ci on stages (funnel_id, lower(name));
create unique index sub_stages_name_ci on sub_stages (stage_id, lower(name));

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  name text not null,
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table upload_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  total_rows int not null default 0,
  inserted_rows int not null default 0,
  duplicate_rows int not null default 0,
  invalid_rows int not null default 0,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- leads -----
create sequence lead_no_seq start 1;

create table leads (
  id                uuid primary key default gen_random_uuid(),
  lead_no           text unique not null
                    default to_char(now(), 'YYMM') || lpad(nextval('lead_no_seq')::text, 10, '0'),
  -- client
  student_name      text not null,
  mobile            text not null,
  alt_mobile        text,
  email             text,
  gender            text check (gender in ('male', 'female', 'other')),
  dob               date,
  dnd               boolean not null default false,
  -- lead
  source_id         uuid references lead_sources (id) on delete set null,
  source_desc       text,
  campaign          text,
  medium            text,
  product           text,
  priority          text not null default 'warm' check (priority in ('hot', 'warm', 'cold')),
  -- stage
  university_id     uuid references universities (id) on delete set null,
  course_id         uuid references courses (id) on delete set null,
  stage_id          uuid references stages (id) on delete set null,
  sub_stage_id      uuid references sub_stages (id) on delete set null,
  remarks           text,
  -- location
  country           text default 'India',
  state             text,
  city              text,
  pincode           text,
  address           text,
  -- professional
  qualification     text,
  company           text,
  designation       text,
  experience_years  numeric(4, 1),
  -- internals
  owner_id          uuid references profiles (id) on delete set null,
  allotted_at       timestamptz,
  internal_notes    text,
  attempt_count     int not null default 0,
  last_contacted_at timestamptz,
  next_followup_at  timestamptz,
  rechurn_count     int not null default 0,
  last_rechurned_at timestamptz,
  upload_batch_id   uuid references upload_batches (id) on delete set null,
  created_by        uuid references profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index leads_owner_idx on leads (owner_id);
create index leads_stage_idx on leads (stage_id);
create index leads_source_idx on leads (source_id);
create index leads_created_idx on leads (created_at desc);
create index leads_followup_idx on leads (next_followup_at) where next_followup_at is not null;
create index leads_name_idx on leads (lower(student_name));

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger leads_touch before update on leads for each row execute function touch_updated_at();

-- Signed-in users calling the database directly may edit the business fields of the leads they
-- can see, but not the bookkeeping the app maintains (numbers, counters, dates), and only
-- managers and admins may change who owns a lead. The app sets these with the service role.
create or replace function protect_lead_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.created_at := now();
      new.updated_at := now();
      new.created_by := auth.uid();
      new.attempt_count := 0;
      new.last_contacted_at := null;
      new.rechurn_count := 0;
      new.last_rechurned_at := null;
      new.next_followup_at := null;
    else
      new.id := old.id;
      new.lead_no := old.lead_no;
      new.created_at := old.created_at;
      new.created_by := old.created_by;
      new.attempt_count := old.attempt_count;
      new.last_contacted_at := old.last_contacted_at;
      new.rechurn_count := old.rechurn_count;
      new.last_rechurned_at := old.last_rechurned_at;
      new.next_followup_at := old.next_followup_at;
      new.upload_batch_id := old.upload_batch_id;
      if not is_staff() then
        new.owner_id := old.owner_id;
        new.allotted_at := old.allotted_at;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger leads_protect before insert or update on leads for each row execute function protect_lead_columns();

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  type text not null,             -- created, updated, stage_change, assigned, note, call, email, sms, whatsapp, task, rechurn, enrolled, opportunity, post
  summary text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index lead_activities_lead_idx on lead_activities (lead_id, created_at desc);
create index lead_activities_created_idx on lead_activities (created_at desc);

create table call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  outcome text not null check (outcome in ('connected', 'no_answer', 'busy', 'switched_off', 'wrong_number', 'callback')),
  duration_sec int not null default 0,
  notes text,
  called_at timestamptz not null default now()
);
create index call_logs_lead_idx on call_logs (lead_id, called_at desc);
create index call_logs_user_idx on call_logs (user_id, called_at desc);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  assigned_to uuid references profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid references profiles (id) on delete set null,
  reminded_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index tasks_due_idx on tasks (assigned_to, status, due_at);
create index tasks_lead_idx on tasks (lead_id);

-- keep leads.next_followup_at = earliest pending task
create or replace function sync_next_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  update leads set next_followup_at =
    (select min(due_at) from tasks where lead_id = v_lead and status = 'pending')
  where id = v_lead;
  return null;
end $$;
create trigger tasks_sync after insert or update or delete on tasks
  for each row execute function sync_next_followup();

create table messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'logged' check (status in ('sent', 'failed', 'logged')),
  provider_ref text,
  error text,
  sent_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_lead_idx on messages (lead_id, created_at desc);
create index messages_created_idx on messages (created_at desc);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads (id) on delete cascade,
  enrollment_no text,
  university_id uuid references universities (id) on delete set null,
  course_id uuid references courses (id) on delete set null,
  fee_amount numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  enrolled_on date not null default current_date,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint enrollments_amounts_check check (fee_amount >= 0 and paid_amount >= 0 and paid_amount <= fee_amount)
);
create index enrollments_date_idx on enrollments (enrolled_on desc);

-- who enrolled a lead, and which lead an enrolment belongs to, cannot be rewritten directly
create or replace function protect_enrollment_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.lead_id := old.lead_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger enrollments_protect before update on enrollments for each row execute function protect_enrollment_columns();

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null default 0,
  probability int not null default 50 check (probability between 0 and 100),
  expected_close date,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index opportunities_lead_idx on opportunities (lead_id);

create table lead_posts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  target text not null,
  status text not null check (status in ('success', 'failed')),
  http_status int,
  response text,
  posted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index lead_posts_lead_idx on lead_posts (lead_id, created_at desc);

create table push_tokens (
  token text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================ security =====
alter table profiles          enable row level security;
alter table global_login      enable row level security;  -- no policies: service role only
alter table lead_sources      enable row level security;
alter table universities      enable row level security;
alter table courses           enable row level security;
alter table stage_funnels     enable row level security;
alter table stages            enable row level security;
alter table sub_stages        enable row level security;
alter table message_templates enable row level security;
alter table app_settings      enable row level security;
alter table upload_batches    enable row level security;
alter table leads             enable row level security;
alter table lead_activities   enable row level security;
alter table call_logs         enable row level security;
alter table tasks             enable row level security;
alter table messages          enable row level security;
alter table enrollments       enable row level security;
alter table opportunities     enable row level security;
alter table lead_posts        enable row level security;
alter table push_tokens       enable row level security;

-- profiles: everyone signed in can read names and roles (see the column grant at the end);
-- every write goes through the app server with the service role
create policy profiles_read on profiles for select to authenticated using (app_role() is not null);

-- masters + settings: read for all active users, write for admins
do $$
declare t text;
begin
  foreach t in array array['lead_sources', 'universities', 'courses', 'stage_funnels', 'stages',
                           'sub_stages', 'message_templates', 'app_settings'] loop
    execute format('create policy %I on %I for select to authenticated using (app_role() is not null)', t || '_read', t);
    execute format('create policy %I on %I for all to authenticated using (app_role() = ''admin'') with check (app_role() = ''admin'')', t || '_admin', t);
  end loop;
end $$;

create policy upload_batches_staff on upload_batches for all to authenticated
  using (is_staff()) with check (is_staff());

-- leads: admin = all, manager = own + team + unassigned, agent = own only
create or replace function can_access_lead(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case app_role()
    when 'admin' then true
    when 'manager' then p_owner is null or p_owner = auth.uid()
      or exists (select 1 from profiles where id = p_owner and manager_id = auth.uid())
    when 'agent' then p_owner = auth.uid()
    else false
  end
$$;

create policy leads_select on leads for select to authenticated using (can_access_lead(owner_id));
create policy leads_insert on leads for insert to authenticated with check (can_access_lead(owner_id));
create policy leads_update on leads for update to authenticated
  using (can_access_lead(owner_id)) with check (app_role() is not null);
create policy leads_delete on leads for delete to authenticated using (app_role() = 'admin');

-- Child tables follow the visibility of their lead. A row can only be written in the writer's
-- own name. History, call logs, messages and lead posts are records and are never edited;
-- follow-ups, enrolments and opportunities stay editable.
do $$
declare r record;
begin
  for r in select * from (values
    ('lead_activities', 'actor_id', false), ('call_logs', 'user_id', false), ('tasks', 'created_by', true), ('messages', 'sent_by', false),
    ('enrollments', 'created_by', true), ('opportunities', 'created_by', true), ('lead_posts', 'posted_by', false)) as v (tbl, who, editable)
  loop
    execute format('create policy %I on %I for select to authenticated using (exists (select 1 from leads l where l.id = lead_id))', r.tbl || '_select', r.tbl);
    execute format('create policy %I on %I for insert to authenticated with check (%I = auth.uid() and exists (select 1 from leads l where l.id = lead_id))', r.tbl || '_insert', r.tbl, r.who);
    if r.editable then
      execute format('create policy %I on %I for update to authenticated using (exists (select 1 from leads l where l.id = lead_id))', r.tbl || '_update', r.tbl);
    end if;
    execute format('create policy %I on %I for delete to authenticated using (app_role() = ''admin'')', r.tbl || '_delete', r.tbl);
  end loop;
end $$;

create policy push_tokens_own on push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================= reports =====
-- All report functions are SECURITY INVOKER, so row level security still applies.

create or replace function report_leads_by(p_dim text, p_from timestamptz, p_to timestamptz)
returns table (label text, total bigint, contacted bigint, enrolled bigint, lost bigint)
language sql stable as $$
  select coalesce(case p_dim
           when 'source' then s.name
           when 'stage' then st.name
           when 'owner' then p.full_name
           when 'university' then u.name
           when 'city' then nullif(l.city, '')
         end, '(none)') as label,
         count(*) as total,
         count(*) filter (where l.attempt_count > 0) as contacted,
         count(*) filter (where st.is_won) as enrolled,
         count(*) filter (where st.is_lost) as lost
  from leads l
  left join lead_sources s on s.id = l.source_id
  left join stages st on st.id = l.stage_id
  left join profiles p on p.id = l.owner_id
  left join universities u on u.id = l.university_id
  where l.created_at >= p_from and l.created_at < p_to
  group by 1
  order by 2 desc
$$;

create or replace function report_agent_performance(p_from timestamptz, p_to timestamptz)
returns table (agent_id uuid, agent text, emp_code text, leads bigint, calls bigint, connected bigint,
               talk_seconds bigint, followups_done bigint, enrolled bigint, revenue numeric)
language sql stable as $$
  select p.id, p.full_name, p.emp_code,
    (select count(*) from leads l where l.owner_id = p.id and l.allotted_at >= p_from and l.allotted_at < p_to),
    (select count(*) from call_logs c where c.user_id = p.id and c.called_at >= p_from and c.called_at < p_to),
    (select count(*) from call_logs c where c.user_id = p.id and c.outcome = 'connected' and c.called_at >= p_from and c.called_at < p_to),
    (select coalesce(sum(c.duration_sec), 0) from call_logs c where c.user_id = p.id and c.called_at >= p_from and c.called_at < p_to),
    (select count(*) from tasks t where t.completed_by = p.id and t.status = 'done' and t.completed_at >= p_from and t.completed_at < p_to),
    (select count(*) from enrollments e where e.created_by = p.id and e.created_at >= p_from and e.created_at < p_to),
    (select coalesce(sum(e.paid_amount), 0) from enrollments e where e.created_by = p.id and e.created_at >= p_from and e.created_at < p_to)
  from profiles p
  where p.is_active
  order by 4 desc, 2
$$;

create or replace function report_daily(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Kolkata')
returns table (day date, leads bigint, enrolled bigint)
language sql stable as $$
  with days as (
    select generate_series((p_from at time zone p_tz)::date, ((p_to - interval '1 second') at time zone p_tz)::date, interval '1 day')::date as day
  )
  select d.day,
    (select count(*) from leads l where (l.created_at at time zone p_tz)::date = d.day),
    (select count(*) from enrollments e where (e.created_at at time zone p_tz)::date = d.day)
  from days d
  order by d.day
$$;

create or replace function allotment_summary()
returns table (agent_id uuid, agent text, emp_code text, role user_role, total bigint, untouched bigint,
               due_followups bigint, enrolled bigint)
language sql stable as $$
  select p.id, p.full_name, p.emp_code, p.role,
    count(l.id),
    count(l.id) filter (where l.attempt_count = 0),
    count(l.id) filter (where l.next_followup_at < now()),
    count(l.id) filter (where st.is_won)
  from profiles p
  left join leads l on l.owner_id = p.id
  left join stages st on st.id = l.stage_id
  where p.is_active
  group by p.id
  order by p.full_name
$$;

create or replace function enrollment_totals(p_from date, p_to date)
returns table (fee numeric, paid numeric)
language sql stable as $$
  select coalesce(sum(fee_amount), 0), coalesce(sum(paid_amount), 0)
  from enrollments where enrolled_on between p_from and p_to
$$;

create or replace function opportunity_totals()
returns table (status text, deals bigint, amount numeric, weighted numeric)
language sql stable as $$
  select o.status, count(*), coalesce(sum(o.amount), 0), coalesce(sum(o.amount * o.probability / 100.0), 0)
  from opportunities o group by o.status
$$;

-- ============================================================== grants =====
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- Colleagues' names and roles are needed everywhere (owner names, history); their email and
-- phone are not. The app reads full profiles with the service role after checking the caller.
revoke all on table profiles from anon, authenticated;
grant select (id, emp_code, full_name, role, manager_id, is_active) on table profiles to authenticated;
revoke all on table global_login from anon, authenticated;
revoke execute on function verify_global_login(text, text) from public, anon, authenticated;
revoke execute on function set_global_login(text, text) from public, anon, authenticated;
grant execute on function verify_global_login(text, text) to service_role;
grant execute on function set_global_login(text, text) to service_role;

-- ================================================================ seed =====
insert into lead_sources (name) values
  ('Website'), ('Facebook'), ('Instagram'), ('Google Ads'), ('Referral'), ('Walk-in'), ('Agent'), ('Bulk Upload');

insert into stage_funnels (name, sort_order) values
  ('Lead Pipeline', 1);

insert into stages (funnel_id, name, sort_order, color, is_won, is_lost)
select f.id, v.name, v.sort_order, v.color, v.is_won, v.is_lost
from (values
  ('Lead Pipeline', 'Not Contacted',                       1, '#64748b', false, false),
  ('Lead Pipeline', 'Phone Switched Off / Ringing',         2, '#f59e0b', false, false),
  ('Lead Pipeline', 'Contacted',                           3, '#0ea5e9', false, false),
  ('Lead Pipeline', 'Interested',                          4, '#6366f1', false, false),
  ('Lead Pipeline', 'Not Interested',                      5, '#ef4444', false, true),
  ('Lead Pipeline', 'DND / Wrong No. / Not In Service',     6, '#78716c', false, true),
  ('Lead Pipeline', 'Counselling Done',                    7, '#14b8a6', false, false),
  ('Lead Pipeline', 'Application Started',                 8, '#a855f7', false, false),
  ('Lead Pipeline', 'Registration Done',                   9, '#16a34a', true,  false),
  ('Lead Pipeline', 'Application Drop',                   10, '#f97316', false, true),
  ('Lead Pipeline', 'Qualified',                          11, '#0284c7', false, false)
) as v (funnel, name, sort_order, color, is_won, is_lost)
join stage_funnels f on f.name = v.funnel;

insert into sub_stages (stage_id, name, sort_order)
select s.id, v.name, v.sort_order
from (values
  ('Not Contacted', 'Fresh Lead', 1), ('Not Contacted', 'Rechurned', 2),
  ('Contacted', 'Call Back', 1), ('Contacted', 'Ringing - No Response', 2),
  ('Contacted', 'Switched Off', 3), ('Contacted', 'Busy', 4),
  ('Interested', 'Details Shared', 1), ('Interested', 'Counselling Done', 2), ('Interested', 'Follow Up', 3),
  ('Application Started', 'Documents Pending', 1), ('Application Started', 'Form Filled', 2),
  ('Application Started', 'Payment Link Shared', 3), ('Application Started', 'Partial Payment', 4),
  ('Registration Done', 'Fee Paid', 1),
  ('Not Interested', 'Fee Issue', 1), ('Not Interested', 'Joined Elsewhere', 2), ('Not Interested', 'Not Eligible', 3),
  ('DND / Wrong No. / Not In Service', 'Invalid Number', 1), ('DND / Wrong No. / Not In Service', 'Duplicate', 2), ('DND / Wrong No. / Not In Service', 'Wrong Number', 3)
) as v (stage, name, sort_order)
join stages s on s.name = v.stage;

insert into universities (name) values ('Sample University');
insert into courses (university_id, name, fee)
select id, c.name, c.fee from universities,
  (values ('MBA', 150000), ('BBA', 90000), ('MCA', 120000), ('BCA', 80000)) as c (name, fee)
where universities.name = 'Sample University';

insert into message_templates (channel, name, subject, body) values
  ('email', 'Course details', 'Details for {{course}} at {{university}}',
   E'Hi {{name}},\n\nThank you for your interest in {{course}} at {{university}}. I would be happy to walk you through the fees, eligibility and admission process.\n\nRegards,\n{{agent}}'),
  ('whatsapp', 'First contact', null,
   'Hi {{name}}, this is {{agent}}. You enquired about {{course}}. Is this a good time to talk?'),
  ('sms', 'Missed call', null,
   'Hi {{name}}, we tried reaching you about {{course}}. Please call back at your convenience. - {{agent}}');

insert into app_settings (key, value) values
  ('lead_post_webhook', '""'::jsonb),
  ('mask_contacts_in_list', 'true'::jsonb);

-- Lead categories (also available separately for existing databases).
-- Idempotent. Apply to production in the Supabase SQL Editor.
begin;
alter table public.leads add column if not exists category text
  check (category in ('A', 'B', 'C'));
create index if not exists leads_category_created_idx on public.leads(category, created_at desc);

-- Enforce the privilege even for direct REST/database writes.
create or replace function public.guard_lead_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (tg_op = 'INSERT' and new.category is not null)
      or (tg_op = 'UPDATE' and new.category is distinct from old.category) then
      if public.app_role() is distinct from 'admin'::public.user_role then
        raise exception 'Only admins can change lead categories' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_category_guard on public.leads;
create trigger leads_category_guard before insert or update on public.leads
  for each row execute function public.guard_lead_category();

-- Category changes and their history commit together.
create or replace function public.audit_lead_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.category is distinct from old.category then
    insert into public.lead_activities(lead_id, actor_id, type, summary, details)
    values (new.id, auth.uid(), 'category_change',
      'Category changed to ' || coalesce(new.category, 'Uncategorized'),
      jsonb_build_object('fields', jsonb_build_object('Category',
        coalesce(old.category, 'Uncategorized') || ' → ' || coalesce(new.category, 'Uncategorized'))));
  end if;
  return null;
end $$;
drop trigger if exists leads_category_audit on public.leads;
create trigger leads_category_audit after update on public.leads
  for each row execute function public.audit_lead_category();
notify pgrst, 'reload schema';
commit;

-- Independent spreadsheet rows, including repeated phone numbers.
-- Run after upgrade-003. Keep independent lead records even when phones repeat.
begin;
alter table public.leads drop constraint if exists leads_category_check;
alter table public.leads add constraint leads_category_check check (category in ('A', 'B', 'C', 'D'));
alter table public.leads drop constraint if exists leads_mobile_key;
create index if not exists leads_mobile_idx on public.leads(mobile);
-- Existing category permission and audit triggers remain in effect.
notify pgrst, 'reload schema';
commit;

-- Google Calendar meetings, lead history and reminders.
-- Run once after upgrade-004. Idempotent; existing leads are preserved.
begin;
create table if not exists public.google_calendar_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  refresh_token_encrypted text not null,
  connected_at timestamptz not null default now()
);
alter table public.google_calendar_accounts enable row level security;
revoke all on public.google_calendar_accounts from public, anon, authenticated;
grant all on public.google_calendar_accounts to service_role;

create table if not exists public.lead_meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  organizer_id uuid references public.profiles(id) on delete set null,
  organizer_email text not null,
  attendee_email text not null,
  title text not null check (length(title) between 1 and 200),
  agenda text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'scheduled' check (status in ('scheduled','completed','no_show','cancelled')),
  sync_state text not null default 'syncing' check (sync_state in ('syncing','synced','failed')),
  sync_started_at timestamptz,
  google_event_id text unique,
  meet_url text,
  calendar_url text,
  attendee_response text not null default 'needsAction' check (attendee_response in ('needsAction','accepted','declined','tentative')),
  last_synced_at timestamptz,
  last_error text,
  outcome_notes text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (ends_at > starts_at),
  check (meet_url is null or meet_url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$')
);
create index if not exists lead_meetings_lead_start_idx on public.lead_meetings(lead_id, starts_at desc);
create index if not exists lead_meetings_organizer_start_idx on public.lead_meetings(organizer_id, starts_at) where status = 'scheduled';
alter table public.lead_meetings enable row level security;
drop policy if exists lead_meetings_read on public.lead_meetings;
create policy lead_meetings_read on public.lead_meetings for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
-- Every mutation is authorized by the app server; clients cannot forge outcomes or organizers.
revoke all on public.lead_meetings from public, anon, authenticated;
grant select on public.lead_meetings to authenticated;
grant all on public.lead_meetings to service_role;

alter table public.tasks add column if not exists meeting_id uuid unique references public.lead_meetings(id) on delete cascade;

create or replace function public.guard_meeting_task_link() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') and (
    (tg_op='INSERT' and new.meeting_id is not null) or
    (tg_op='UPDATE' and new.meeting_id is distinct from old.meeting_id)) then
    raise exception 'Meeting reminder links are maintained by the server' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists tasks_meeting_link_guard on public.tasks;
create trigger tasks_meeting_link_guard before insert or update on public.tasks
for each row execute function public.guard_meeting_task_link();

create or replace function public.touch_lead_meeting() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;
drop trigger if exists lead_meetings_touch on public.lead_meetings;
create trigger lead_meetings_touch before update on public.lead_meetings
for each row execute function public.touch_lead_meeting();

-- History and the follow-up reminder commit in the same transaction as the meeting.
create or replace function public.track_lead_meeting() returns trigger
language plpgsql set search_path = public as $$
declare event_type text; event_summary text;
begin
  if new.sync_state = 'syncing' then return null; end if;
  if new.sync_state = 'failed' then
    if old.sync_state is distinct from 'failed' then
      event_type := 'meeting_sync_failed'; event_summary := 'Meeting update needs attention';
    end if;
  elsif new.status is distinct from old.status then
    event_type := 'meeting_' || new.status;
    event_summary := case new.status when 'completed' then 'Meeting marked completed'
      when 'no_show' then 'Lead marked as a meeting no-show' when 'cancelled' then 'Meeting cancelled' else 'Meeting scheduled' end;
  elsif old.google_event_id is null and new.google_event_id is not null then
    event_type := 'meeting_scheduled'; event_summary := 'Google Meet scheduled';
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    event_type := 'meeting_rescheduled'; event_summary := 'Meeting rescheduled';
  elsif new.attendee_response is distinct from old.attendee_response then
    event_type := 'meeting_rsvp'; event_summary := 'Meeting RSVP: ' || new.attendee_response;
  elsif new.outcome_notes is distinct from old.outcome_notes then
    event_type := 'meeting_notes'; event_summary := 'Meeting outcome notes updated';
  end if;
  if event_type is not null then
    insert into public.lead_activities(lead_id,actor_id,type,summary,details)
    values(new.lead_id,new.updated_by,event_type,event_summary,
      jsonb_build_object('meeting_id',new.id,'fields',jsonb_build_object('Meeting',new.title,
      'Starts',new.starts_at,'Ends',new.ends_at,'Previous start',old.starts_at,
      'Attendee',new.attendee_email,'Status',new.status,'RSVP',new.attendee_response),
      'text',case when new.sync_state='failed' then new.last_error else new.outcome_notes end));
  end if;
  if new.sync_state = 'synced' and new.google_event_id is not null and
    (old.google_event_id is null or new.status is distinct from old.status or
     new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or
     new.title is distinct from old.title or new.organizer_id is distinct from old.organizer_id) then
    if new.status = 'scheduled' and new.organizer_id is not null then
      insert into public.tasks(lead_id,title,due_at,assigned_to,created_by,meeting_id)
      values(new.lead_id,'Google Meet: ' || new.title,new.starts_at,new.organizer_id,new.organizer_id,new.id)
      on conflict(meeting_id) do update set title=excluded.title,due_at=excluded.due_at,
        assigned_to=excluded.assigned_to,status='pending',completed_at=null,completed_by=null,reminded_at=null;
    else
      update public.tasks set status=case when new.status='cancelled' then 'cancelled' else 'done' end,
        completed_at=now(),completed_by=new.updated_by where meeting_id=new.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists lead_meetings_track on public.lead_meetings;
create trigger lead_meetings_track after update on public.lead_meetings
for each row execute function public.track_lead_meeting();

create or replace function public.guard_lead_meeting_deletion() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists(select 1 from public.lead_meetings where lead_id=old.id and status='scheduled') then
    raise exception 'Cancel scheduled meetings before deleting this lead';
  end if;
  return old;
end $$;
drop trigger if exists leads_meeting_delete_guard on public.leads;
create trigger leads_meeting_delete_guard before delete on public.leads
for each row execute function public.guard_lead_meeting_deletion();
notify pgrst, 'reload schema';
commit;

-- Firebase sales-agent login
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
