-- Add university options for new leads. Existing university IDs and programs are retained.
begin;

insert into public.universities (name)
select desired.name
from (values ('Amity'), ('UU'), ('SGT'), ('GLA'), ('SMU'), ('MUJ'), ('NMIMS')) as desired(name)
where not exists (
  select 1 from public.universities existing
  where lower(existing.name) = lower(desired.name)
)
on conflict do nothing;

update public.universities
set is_active = true
where lower(name) in ('amity', 'uu', 'sgt', 'gla', 'smu', 'muj', 'nmims')
  and not is_active;

commit;
