-- Pivot report filters (e.g. only one employee). Apply after upgrade-015. Safe to reapply.
--
-- p_filters is a JSON object of field -> list of allowed values, for example
-- {"owner": ["<employee id>"], "stage": ["<stage id>", "<stage id>"]}. A lead is counted only
-- when, for every field listed, its value is one of the allowed values. Field names and values
-- are the same as crm_pivot_key() returns.
begin;

drop function if exists public.crm_pivot(timestamptz, timestamptz, text[], text);
drop function if exists public.crm_pivot_leads(timestamptz, timestamptz, text[], text[], text);

create or replace function public.crm_pivot_match(l public.leads, p_filters jsonb, tz text) returns boolean
language sql stable set search_path = public as $$
  select p_filters is null or p_filters = '{}'::jsonb or not exists (
    select 1 from jsonb_each(p_filters) f(d, allowed)
    where not (allowed ? public.crm_pivot_key(l, f.d, tz)))
$$;

create or replace function public.crm_pivot(p_from timestamptz, p_to timestamptz, p_dims text[], p_tz text default 'Asia/Kolkata', p_filters jsonb default '{}')
returns table(keys text[], n bigint)
language sql stable security invoker set search_path = public as $$
  select array(select public.crm_pivot_key(l, u.d, p_tz) from unnest(p_dims) with ordinality u(d, i) order by u.i), count(*)
  from public.leads l
  where l.created_at >= p_from and l.created_at < p_to
    and public.crm_pivot_match(l, p_filters, p_tz)
  group by 1
$$;

create or replace function public.crm_pivot_leads(p_from timestamptz, p_to timestamptz, p_dims text[], p_keys text[], p_tz text default 'Asia/Kolkata', p_filters jsonb default '{}')
returns setof public.leads
language sql stable security invoker set search_path = public as $$
  select l.* from public.leads l
  where l.created_at >= p_from and l.created_at < p_to
    and cardinality(p_dims) = cardinality(p_keys)
    and public.crm_pivot_match(l, p_filters, p_tz)
    and not exists (
      select 1 from unnest(p_dims, p_keys) x(d, k)
      where public.crm_pivot_key(l, x.d, p_tz) is distinct from x.k)
  order by l.created_at desc, l.id
$$;

revoke all on function public.crm_pivot_match(public.leads, jsonb, text) from public, anon;
revoke all on function public.crm_pivot(timestamptz, timestamptz, text[], text, jsonb) from public, anon;
revoke all on function public.crm_pivot_leads(timestamptz, timestamptz, text[], text[], text, jsonb) from public, anon;
grant execute on function public.crm_pivot_match(public.leads, jsonb, text) to authenticated, service_role;
grant execute on function public.crm_pivot(timestamptz, timestamptz, text[], text, jsonb) to authenticated, service_role;
grant execute on function public.crm_pivot_leads(timestamptz, timestamptz, text[], text[], text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
