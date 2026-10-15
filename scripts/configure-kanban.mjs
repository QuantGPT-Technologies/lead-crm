// node scripts/configure-kanban.mjs --target=local|prod --apply
// Updates master data only. Refuses to retire a stage containing leads.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(path.join(root, 'supabase/kanban-stages.json'), 'utf8'));
const marker = 'kanban_columns_v1';
const funnelName = 'Lead Pipeline';

function plan(stages) {
  const retained = new Set();
  const desired = config.map((definition, index) => {
    const matches = stages.filter(s => s.name === definition.name);
    if (!matches.length && definition.previous_name) matches.push(...stages.filter(s => s.name === definition.previous_name));
    if (matches.length > 1) throw new Error(`Multiple stages match ${definition.name}; reconcile them before applying`);
    const existing = matches[0];
    if (existing) retained.add(existing.id);
    return { id: existing?.id, name: definition.name, color: definition.color, sort_order: index + 1,
      is_active: true, is_won: definition.is_won ?? false, is_lost: definition.is_lost ?? false };
  });
  return { desired, retired: stages.filter(s => !retained.has(s.id)).map(s => s.id) };
}

function verify(stages) {
  assert.deepEqual(stages.map(s => s.name), config.map(s => s.name));
  for (const [index, stage] of stages.entries()) {
    assert.equal(stage.sort_order, index + 1);
    assert.equal(stage.is_won, config[index].is_won ?? false);
    assert.equal(stage.is_lost, config[index].is_lost ?? false);
  }
}

export async function configureLocalKanban(db, { once = false } = {}) {
  if (once && (await db.query('select 1 from public.app_settings where key=$1', [marker])).rowCount) return;
  await db.query('begin');
  try {
    const before = (await db.query('select * from public.stages')).rows;
    const { desired, retired } = plan(before);
    const used = await db.query('select count(*) from public.leads where stage_id=any($1::uuid[])', [retired]);
    if (Number(used.rows[0].count)) throw new Error('A stage to retire contains leads; no changes applied');
    const total = Number((await db.query('select count(*) from public.leads')).rows[0].count);
    const funnel = (await db.query("insert into public.stage_funnels(name,sort_order,is_active) values ($1,1,true) on conflict(name) do update set sort_order=1,is_active=true returning id", [funnelName])).rows[0].id;
    for (const stage of desired) {
      const values = [funnel, stage.name, stage.sort_order, stage.color, stage.is_won, stage.is_lost];
      if (stage.id) await db.query('update public.stages set funnel_id=$1,name=$2,sort_order=$3,color=$4,is_won=$5,is_lost=$6,is_active=true where id=$7', [...values, stage.id]);
      else await db.query('insert into public.stages(funnel_id,name,sort_order,color,is_won,is_lost) values ($1,$2,$3,$4,$5,$6)', values);
    }
    await db.query('update public.stages set is_active=false where id=any($1::uuid[])', [retired]);
    await db.query('update public.sub_stages set is_active=false where stage_id=any($1::uuid[])', [retired]);
    await db.query('update public.stage_funnels set is_active=false where id<>$1', [funnel]);
    const active = (await db.query('select * from public.stages where is_active order by sort_order')).rows;
    verify(active);
    assert.equal(Number((await db.query('select count(*) from public.leads')).rows[0].count), total);
    await db.query("insert into public.app_settings(key,value) values ($1,'true') on conflict(key) do update set value='true',updated_at=now()", [marker]);
    await db.query('commit');
    console.log(JSON.stringify({ target: 'local', stages: active.map(s => s.name), leadsPreserved: total }));
  } catch (error) { await db.query('rollback'); throw error; }
}

async function production() {
  loadEnvFile(path.join(root, '.env.local'));
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = result => { if (result.error) throw new Error(result.error.message); return result.data; };
  const snapshot = {};
  for (const table of ['stages', 'stage_funnels', 'sub_stages']) snapshot[table] = check(await db.from(table).select('*'));
  const { desired, retired } = plan(snapshot.stages);
  const totalResult = await db.from('leads').select('id', { count: 'exact', head: true }); check(totalResult);
  if (retired.length) {
    const used = await db.from('leads').select('id', { count: 'exact', head: true }).in('stage_id', retired); check(used);
    if (used.count) throw new Error('A stage to retire contains leads; no changes applied');
  }
  const backupDir = path.join(root, '.migration', 'backups', `kanban-prod-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(path.join(backupDir, 'masters.json'), JSON.stringify(snapshot));
  const existingFunnel = snapshot.stage_funnels.find(f => f.name === funnelName);
  const funnel = existingFunnel
    ? check(await db.from('stage_funnels').update({ is_active: true, sort_order: 1 }).eq('id', existingFunnel.id).select('id').single()).id
    : check(await db.from('stage_funnels').insert({ name: funnelName, sort_order: 1 }).select('id').single()).id;
  for (const stage of desired) {
    const { id, ...values } = stage;
    if (id) check(await db.from('stages').update({ ...values, funnel_id: funnel }).eq('id', id));
    else check(await db.from('stages').insert({ ...values, funnel_id: funnel }));
  }
  if (retired.length) {
    check(await db.from('stages').update({ is_active: false }).in('id', retired));
    check(await db.from('sub_stages').update({ is_active: false }).in('stage_id', retired));
  }
  check(await db.from('stage_funnels').update({ is_active: false }).neq('id', funnel));
  const active = check(await db.from('stages').select('*').eq('is_active', true).order('sort_order'));
  verify(active);
  const after = await db.from('leads').select('id', { count: 'exact', head: true }); check(after);
  assert.equal(after.count, totalResult.count);
  const lookups = check(await db.rpc('crm_lookups'));
  assert.deepEqual(lookups.stages.map(s => s.name), config.map(s => s.name));
  check(await db.from('app_settings').upsert({ key: marker, value: true }, { onConflict: 'key' }));
  console.log(JSON.stringify({ target: 'prod', stages: active.map(s => s.name), leadsPreserved: after.count, backupDir }));
}

async function local() {
  const settings = { host: '127.0.0.1', port: 54329, database: 'crm', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 3000 };
  const databaseDir = path.join(root, '.demo/pg');
  const pgCtl = path.join(root, 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
  let db = new pg.Client(settings);
  let started = false;
  try {
    try { await db.connect(); }
    catch {
      await db.end().catch(() => {});
      mkdirSync(path.join(root, '.migration'), { recursive: true });
      execFileSync(pgCtl, ['-D', databaseDir, '-l', path.join(root, '.migration/pg-maintenance.log'), '-o', '-p 54329 -h localhost', '-w', '-t', '20', 'start'], { windowsHide: true, stdio: 'ignore' });
      started = true;
      db = new pg.Client(settings); await db.connect();
    }
    const backupDir = path.join(root, '.migration/backups', `kanban-local-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    mkdirSync(backupDir, { recursive: true });
    for (const table of ['stages', 'stage_funnels', 'sub_stages']) writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify((await db.query(`select * from public.${table}`)).rows));
    await configureLocalKanban(db);
  } finally {
    await db.end().catch(() => {});
    if (started) execFileSync(pgCtl, ['-D', databaseDir, '-m', 'fast', '-w', '-t', '20', 'stop'], { windowsHide: true, stdio: 'ignore' });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply to update Kanban stage configuration');
  const target = process.argv.find(value => value.startsWith('--target='))?.split('=')[1];
  if (!['local', 'prod'].includes(target)) throw new Error('Specify --target=local or --target=prod');
  await (target === 'local' ? local() : production());
}
