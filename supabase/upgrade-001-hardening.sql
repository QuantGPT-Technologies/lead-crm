-- =============================================================================
-- Upgrade for databases created from an earlier supabase/schema.sql.
-- New projects do not need this: schema.sql already contains everything below.
-- Run once in Supabase Dashboard -> SQL Editor. Safe to run again.
-- =============================================================================

-- Master names are unique whatever their case ("Website" and "website" are the same source).
create unique index if not exists lead_sources_name_ci on lead_sources (lower(name));
create unique index if not exists universities_name_ci on universities (lower(name));
create unique index if not exists courses_name_ci on courses (university_id, lower(name));
create unique index if not exists stage_funnels_name_ci on stage_funnels (lower(name));
create unique index if not exists stages_name_ci on stages (funnel_id, lower(name));
create unique index if not exists sub_stages_name_ci on sub_stages (stage_id, lower(name));

-- An enrolment can never be paid beyond its fee.
alter table enrollments drop constraint if exists enrollments_amounts_check;
alter table enrollments add constraint enrollments_amounts_check
  check (fee_amount >= 0 and paid_amount >= 0 and paid_amount <= fee_amount);

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
drop trigger if exists leads_protect on leads;
create trigger leads_protect before insert or update on leads for each row execute function protect_lead_columns();

-- Who enrolled a lead, and which lead an enrolment belongs to, cannot be rewritten directly.
create or replace function protect_enrollment_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.lead_id := old.lead_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists enrollments_protect on enrollments;
create trigger enrollments_protect before update on enrollments for each row execute function protect_enrollment_columns();

-- History, call logs, messages and lead posts are records: written once, in the writer's own
-- name, and never edited. Follow-ups, enrolments and opportunities stay editable.
drop policy if exists lead_activities_update on lead_activities;
drop policy if exists call_logs_update on call_logs;
drop policy if exists messages_update on messages;
drop policy if exists lead_posts_update on lead_posts;

do $$
declare r record;
begin
  for r in select * from (values
    ('lead_activities', 'actor_id'), ('call_logs', 'user_id'), ('tasks', 'created_by'), ('messages', 'sent_by'),
    ('enrollments', 'created_by'), ('opportunities', 'created_by'), ('lead_posts', 'posted_by')) as v (tbl, who)
  loop
    execute format('drop policy if exists %I on %I', r.tbl || '_insert', r.tbl);
    execute format('create policy %I on %I for insert to authenticated with check (%I = auth.uid() and exists (select 1 from leads l where l.id = lead_id))', r.tbl || '_insert', r.tbl, r.who);
  end loop;
end $$;

-- Colleagues' names and roles are needed everywhere (owner names, history); their email and
-- phone are not. The app reads full profiles with the service role after checking the caller.
drop policy if exists profiles_admin on profiles;
revoke all on table profiles from anon, authenticated;
grant select (id, emp_code, full_name, role, manager_id, is_active) on table profiles to authenticated;
