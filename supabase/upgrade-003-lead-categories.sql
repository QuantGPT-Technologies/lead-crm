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
