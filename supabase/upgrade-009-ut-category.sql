-- Run after upgrade-008. Adds UT without changing existing categories or assignments.
begin;
alter table public.leads drop constraint if exists leads_category_check;
alter table public.leads add constraint leads_category_check
  check (category in ('A', 'B', 'C', 'D', 'UT'));

insert into public.lead_sources(name)
select 'UT' where not exists (select 1 from public.lead_sources where lower(name) = 'ut')
on conflict do nothing;
update public.lead_sources set is_active = true where lower(name) = 'ut';

-- Target only the verified Trustive workbook import, preserving all other leads.
update public.leads
set category = 'UT', source_id = (select id from public.lead_sources where lower(name) = 'ut')
where upload_batch_id = 'b1c3a75f-39ba-5d01-93ce-424989fa7c2b'::uuid
  and source_desc = 'Trustive bhai.xlsx'
  and (category is distinct from 'UT'
    or source_id is distinct from (select id from public.lead_sources where lower(name) = 'ut'));

notify pgrst, 'reload schema';
commit;
