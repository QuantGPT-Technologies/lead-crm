// Local-only workload and permission regression. Temporary function/data changes roll back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const db = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'crm', connectionTimeoutMillis: 5000 });
const old = readFileSync(new URL('../supabase/upgrade-012-workflow-reports.sql', import.meta.url), 'utf8');
const dimensions = ['stage', 'sub_stage', 'source', 'owner', 'university', 'course', 'city', 'priority', 'category', 'attempt', 'rechurn'];
const canonical = rows => JSON.stringify([...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
const results = [];
try {
  await db.connect();
  const before = (await db.query('select count(*)::int n from public.leads')).rows[0].n;
  await db.query(readFileSync(new URL('../supabase/upgrade-013-report-performance.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query('select count(*)::int n from public.leads')).rows[0].n, before);
  await db.query('begin');
  for (const name of ['crm_lead_report', 'crm_employee_report']) {
    const start = old.indexOf(`create or replace function public.${name}(`);
    const end = old.indexOf('$$;', start) + 3;
    await db.query(old.slice(start, end).replace(`public.${name}(`, `public.${name}_baseline(`));
  }
  const profiles = (await db.query("select id,role from public.profiles where is_active order by id")).rows;
  await db.query(`with numbered as (select id,row_number() over(order by id) n from public.leads),
   st as (select array_agg(id order by id) ids from public.stages where is_active),
   src as (select array_agg(id order by id) ids from public.lead_sources where is_active),
   co as (select id,university_id,row_number() over(order by id) n,count(*) over() total from public.courses where is_active)
   update public.leads l set stage_id=st.ids[1+mod(n.n::int-1,array_length(st.ids,1))],
    source_id=src.ids[1+mod(n.n::int-1,array_length(src.ids,1))],course_id=co.id,university_id=co.university_id,
    owner_id=($1::uuid[])[1+mod(n.n::int-1,array_length($1::uuid[],1))],allotted_at='2026-10-15',
    other_fields=case when mod(n.n,7)=0 then '{"stage_id":"Custom status","source_id":"Custom source","course_id":"Custom program"}'::jsonb else '{}'::jsonb end
   from numbered n cross join st cross join src join co on co.n=1+mod(n.n-1,co.total) where l.id=n.id`, [profiles.map(person => person.id)]);
  await db.query(`insert into public.lead_activities(lead_id,actor_id,type,summary,created_at)
    select id,owner_id,'note','Report workload fixture','2026-10-20' from public.leads order by id limit 1000`);
  await db.query(`insert into public.call_logs(lead_id,user_id,outcome,duration_sec,called_at)
    select id,owner_id,'connected',60,'2026-10-20' from public.leads order by id limit 1000`);
  await db.query("set local statement_timeout='3s'");
  const ids = (await db.query('select id,source_id,stage_id,owner_id from public.leads order by id limit 1')).rows[0];
  for (const role of ['admin', 'manager', 'agent']) {
    await db.query('reset role');
    const person = profiles.find(value => value.role === role);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: person.id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
    let maxMs = 0;
    for (const dimension of dimensions) {
      const args = ['2000-01-01', '2100-01-01', dimension];
      const expected = await db.query('select * from public.crm_lead_report_baseline($1,$2,$3)', args);
      const start = performance.now();
      const actual = await db.query('select * from public.crm_lead_report($1,$2,$3)', args);
      maxMs = Math.max(maxMs, Math.round(performance.now() - start));
      assert.equal(canonical(actual.rows), canonical(expected.rows), `${role}/${dimension}: report totals must not change`);
    }
    for (const filters of [[null, ids.source_id, null, '', ''], [ids.owner_id, null, ids.stage_id, '0', 'no'], [null, null, null, '3+', 'yes']]) {
      const args = ['2000-01-01', '2100-01-01', 'source', ...filters];
      const expected = await db.query('select * from public.crm_lead_report_baseline($1,$2,$3,$4,$5,$6,$7,$8)', args);
      const actual = await db.query('select * from public.crm_lead_report($1,$2,$3,$4,$5,$6,$7,$8)', args);
      assert.equal(canonical(actual.rows), canonical(expected.rows), `${role}: filter results must not change`);
    }
    for (const period of ['day', 'week', 'month']) {
      const args = ['2026-10-01', '2026-11-04', period];
      const expected = await db.query('select * from public.crm_employee_report_baseline($1,$2,$3)', args);
      const start = performance.now();
      const actual = await db.query('select * from public.crm_employee_report($1,$2,$3)', args);
      maxMs = Math.max(maxMs, Math.round(performance.now() - start));
      assert.equal(canonical(actual.rows), canonical(expected.rows), `${role}/${period}: employee metrics must not change`);
    }
    results.push({ role, slowestOptimizedQueryMs: maxMs });
  }
  await db.query('reset role');
  await db.query('rollback');
  assert.equal((await db.query('select count(*)::int n from public.leads')).rows[0].n, before);
  console.log(JSON.stringify({ leads: before, dimensions: dimensions.length, reportPeriods: 3, equivalentResults: true, results, fixturesRolledBack: true }));
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
}
