-- Run after upgrade-003. Keep independent lead records even when phones repeat.
begin;
alter table public.leads drop constraint if exists leads_category_check;
alter table public.leads add constraint leads_category_check check (category in ('A', 'B', 'C', 'D'));
alter table public.leads drop constraint if exists leads_mobile_key;
create index if not exists leads_mobile_idx on public.leads(mobile);
-- Existing category permission and audit triggers remain in effect.
notify pgrst, 'reload schema';
commit;
