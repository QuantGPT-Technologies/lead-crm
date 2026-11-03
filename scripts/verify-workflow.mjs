// Local database + pure helper regression checks. All fixture changes roll back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import pg from 'pg';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function load(relative) {
  const filename = path.join(root, relative);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, process, Intl, Date, URLSearchParams, require: name => ['server-only', '@/lib/auth', '@/lib/supabase/server'].includes(name) ? {} : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name) });
  return exports;
}
const { filterDates, periodDates, tableSort, leadNeighbor } = load('src/lib/view-filters.ts');
const { otherFields } = load('src/lib/other-fields.ts');
const { reportError } = load('src/lib/report-data.ts');
assert.match(reportError({ code: '57014', message: 'canceling statement due to statement timeout' }), /timed out/);
assert.doesNotMatch(reportError({ code: '57014', message: 'canceling statement due to statement timeout' }), /upgrade-012/);
assert.match(reportError({ code: 'PGRST202', message: 'function not found' }), /function is missing/);
assert.doesNotMatch(reportError({ code: '42501', message: 'permission denied' }), /Apply database/);

const { applyLeadFilters } = load('src/lib/data.ts');
const applied = [];
const leadQuery = Object.fromEntries(['eq','or','is','gte','lt','ilike'].map(method => [method, (...args) => { applied.push([method,...args]); return leadQuery; }]));
applyLeadFilters(leadQuery, { attempt: '1', churn: 'no', from: '2026-11-03', dateField: 'last_attempt_at' });
assert.ok(applied.some(([method,field,value]) => method==='eq' && field==='attempt_count' && value===1));
assert.ok(applied.some(([method,field,value]) => method==='eq' && field==='rechurn_count' && value===0));
assert.ok(applied.some(([method,field]) => method==='gte' && field==='last_attempt_at'));

const filters = [];
const query = { gte: (...args) => { filters.push(['gte', ...args]); return query; }, lt: (...args) => { filters.push(['lt', ...args]); return query; } };
filterDates(query, '2026-11-03', '2026-11-03', 'last_attempt_at');
assert.deepEqual(filters, [['gte', 'last_attempt_at', '2026-11-02T18:30:00.000Z'], ['lt', 'last_attempt_at', '2026-11-03T18:30:00.000Z']]);
assert.equal(periodDates('week', new Date('2026-11-03T12:00:00Z')).from, '2026-11-02');
assert.equal(periodDates('month', new Date('2026-11-03T12:00:00Z')).from, '2026-11-01');
assert.equal(tableSort('DROP TABLE', 'asc', ['created_at'], 'created_at').column, 'created_at');
const nullCursor = leadNeighbor('next_followup_at', null, '00000000-0000-0000-0000-000000000001', false, false);
assert.equal(nullCursor.nullsFirst, true);
assert.match(nullCursor.expression, /next_followup_at.not.is.null/);
const nameCursor = leadNeighbor('student_name', 'Name, with (punctuation)', '00000000-0000-0000-0000-000000000001', true, true);
assert.match(nameCursor.expression, /student_name.gt."Name, with \(punctuation\)"/);
assert.match(nameCursor.expression, /student_name.is.null/);
const { toCsv } = load('src/lib/utils.ts');
assert.equal(toCsv([{ 'Status: Follow-up, later': 2 }]).split('\n')[0], '"Status: Follow-up, later"');

const lookups = { sources: [{ id: 'other', name: 'Other' }], universities: [], courses: [], stages: [], subStages: [] };
assert.ok(otherFields({ source_id: 'other' }, lookups, ['source_id']).error);
assert.equal(otherFields({ source_id: 'other', other_fields: { source_id: 'Referral desk' } }, lookups, ['source_id']).fields.source_id, 'Referral desk');
assert.equal(otherFields({ source_id: null, other_fields: { role: 'admin' } }, lookups, ['source_id'], { course_id: 'Existing program' }).fields.course_id, 'Existing program');
assert.equal(otherFields({ source_id: null, other_fields: { role: 'admin' } }, lookups, ['source_id']).fields.role, undefined);

const db = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'crm', connectionTimeoutMillis: 5000 });
const from = '2026-11-02T18:30:00Z', to = '2026-11-03T18:30:00Z';
try {
  await db.connect();
  const migration = readFileSync(path.join(root, 'supabase/upgrade-012-workflow-reports.sql'), 'utf8');
  const performanceMigration = readFileSync(path.join(root, 'supabase/upgrade-013-report-performance.sql'), 'utf8');
  const countBefore = (await db.query('select count(*)::int n from leads')).rows[0].n;
  await db.query(migration);
  await db.query(performanceMigration);
  const afterFirst = (await db.query('select id,attempt_count,total_calls,last_attempt_at from leads order by id')).rows;
  await db.query(migration);
  await db.query(performanceMigration);
  assert.deepEqual((await db.query('select id,attempt_count,total_calls,last_attempt_at from leads order by id')).rows, afterFirst, 'Migration reruns must not double-count history');
  assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n, countBefore);
  await db.query('begin');
  const admin = (await db.query("select id from profiles where role='admin' and is_active limit 1")).rows[0].id;
  const manager = (await db.query("select id from profiles where role='manager' and is_active limit 1")).rows[0].id;
  const agent = (await db.query("select id from profiles where role='agent' and manager_id=$1 and is_active limit 1", [manager])).rows[0].id;
  const stage = (await db.query('select id from stages where is_active order by sort_order limit 1')).rows[0].id;
  const source = (await db.query('insert into lead_sources(name) values($1) returning id', [`Workflow fixture ${randomUUID()}`])).rows[0].id;
  const ids = [];
  for (const owner of [agent, agent, admin]) ids.push((await db.query('insert into leads(student_name,mobile,source_id,stage_id,owner_id,allotted_at,created_at) values($1,$2,$3,$4,$5,$6,$6) returning id', ['Workflow fixture', '9000000000', source, stage, owner, '2026-11-03T00:00:00Z'])).rows[0].id);
  const activity = async (type, time, details = {}) => db.query('insert into lead_activities(lead_id,actor_id,type,summary,details,created_at) values($1,$2,$3,$4,$5,$6)', [ids[0], agent, type, `Fixture ${type}`, details, time]);
  await activity('updated', '2026-11-03T00:01:00Z');
  await activity('note', '2026-11-03T00:02:00Z', { text: 'Small saved change' });
  await db.query("insert into call_logs(lead_id,user_id,outcome,duration_sec,called_at) values($1,$2,'connected',60,$3)", [ids[0], agent, '2026-11-03T00:03:00Z']);
  await activity('call', '2026-11-03T00:03:00Z');
  let saved = (await db.query('select attempt_count,total_calls,last_attempt_at,last_activity_summary from leads where id=$1', [ids[0]])).rows[0];
  assert.equal(saved.attempt_count, 3);
  assert.equal(saved.total_calls, 1);
  assert.equal(saved.last_attempt_at.toISOString(), '2026-11-03T00:03:00.000Z');
  const report = (await db.query("select * from crm_lead_report($1,$2,'source',null,$3)", [from, to, source])).rows[0];
  assert.equal(Number(report.total), 3);
  assert.equal(Number(report.attempts), 3);
  assert.equal(Number(report.calls), 1);
  for (const period of ['day', 'week', 'month']) {
    const rows = (await db.query('select * from crm_employee_report($1,$2,$3,$4,$5)', [from, to, period, agent, source])).rows;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].attempts), 3);
    assert.equal(Number(rows[0].calls), 1);
    assert.equal(Number(rows[0].talk_seconds), 60);
    assert.equal(Number(rows[0].leads), 2);
    assert.equal(Object.values(rows[0].statuses).reduce((sum, n) => sum + Number(n), 0), 2);
  }
  const login = async id => { await db.query('reset role'); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: 'authenticated' })]); await db.query('set local role authenticated'); };
  await login(agent);
  await db.query("update leads set attempt_count=999,total_calls=999,last_attempt_at='2099-01-01',last_activity_summary='spoof' where id=$1", [ids[0]]);
  saved = (await db.query('select attempt_count,total_calls,last_activity_summary from leads where id=$1', [ids[0]])).rows[0];
  assert.equal(saved.attempt_count, 3); assert.equal(saved.total_calls, 1); assert.notEqual(saved.last_activity_summary, 'spoof');
  await activity('updated', '2026-11-03T00:04:00Z', { text: 'One-character correction' });
  saved = (await db.query('select attempt_count,total_calls,last_activity_summary from leads where id=$1', [ids[0]])).rows[0];
  assert.equal(saved.attempt_count, 4); assert.equal(saved.total_calls, 1);
  assert.match(saved.last_activity_summary, /One-character correction/);
  await login(manager);
  const scoped = (await db.query("select * from crm_lead_report($1,$2,'source',null,$3)", [from, to, source])).rows[0];
  assert.equal(Number(scoped.total), 2, 'Manager report must exclude the admin-owned fixture');
  assert.equal((await db.query('select * from crm_employee_report($1,$2,\'day\',$3,$4)', [from, to, admin, source])).rows.length, 0);
  await db.query('reset role');
  await db.query('rollback');
  console.log(`Workflow checks passed: ${countBefore} existing leads preserved; idempotent migration, independent call/attempt counters, last-log text, metric protection, daily/weekly/monthly reports, source filters, manager visibility, timezone boundaries and Other text validation. Fixtures rolled back.`);
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
}
