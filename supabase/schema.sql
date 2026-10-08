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
  mobile            text not null unique,
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
  created_at timestamptz not null default now()
);
create index enrollments_date_idx on enrollments (enrolled_on desc);

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

-- profiles: everyone signed in can read names; only admins write (through the app server)
create policy profiles_read on profiles for select to authenticated using (app_role() is not null);
create policy profiles_admin on profiles for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

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

-- child tables follow the visibility of their lead
do $$
declare t text;
begin
  foreach t in array array['lead_activities', 'call_logs', 'tasks', 'messages', 'enrollments',
                           'opportunities', 'lead_posts'] loop
    execute format('create policy %I on %I for select to authenticated using (exists (select 1 from leads l where l.id = lead_id))', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (exists (select 1 from leads l where l.id = lead_id))', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (exists (select 1 from leads l where l.id = lead_id))', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (app_role() = ''admin'')', t || '_delete', t);
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
revoke all on table global_login from anon, authenticated;
revoke execute on function verify_global_login(text, text) from public, anon, authenticated;
revoke execute on function set_global_login(text, text) from public, anon, authenticated;
grant execute on function verify_global_login(text, text) to service_role;
grant execute on function set_global_login(text, text) to service_role;

-- ================================================================ seed =====
insert into lead_sources (name) values
  ('Website'), ('Facebook'), ('Instagram'), ('Google Ads'), ('Referral'), ('Walk-in'), ('Agent'), ('Bulk Upload');

insert into stage_funnels (name, sort_order) values
  ('Not Contacted Stages', 1), ('Contacted Stages', 2), ('Application Stages', 3),
  ('Enrolled Stages', 4), ('Closed Stages', 5);

insert into stages (funnel_id, name, sort_order, color, is_won, is_lost)
select f.id, v.name, v.sort_order, v.color, v.is_won, v.is_lost
from (values
  ('Not Contacted Stages', 'Not Contacted',       1, '#64748b', false, false),
  ('Contacted Stages',     'Contacted',           1, '#0ea5e9', false, false),
  ('Contacted Stages',     'Interested',          2, '#6366f1', false, false),
  ('Application Stages',   'Application Started', 1, '#a855f7', false, false),
  ('Application Stages',   'Payment Pending',     2, '#f59e0b', false, false),
  ('Enrolled Stages',      'Enrolled',            1, '#16a34a', true,  false),
  ('Closed Stages',        'Not Interested',      1, '#ef4444', false, true),
  ('Closed Stages',        'Junk',                2, '#78716c', false, true)
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
  ('Payment Pending', 'Payment Link Shared', 1), ('Payment Pending', 'Partial Payment', 2),
  ('Enrolled', 'Fee Paid', 1),
  ('Not Interested', 'Fee Issue', 1), ('Not Interested', 'Joined Elsewhere', 2), ('Not Interested', 'Not Eligible', 3),
  ('Junk', 'Invalid Number', 1), ('Junk', 'Duplicate', 2), ('Junk', 'Wrong Number', 3)
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
