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
