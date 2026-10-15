// Prepare first: python scripts/prepare-excel-import.py
// Inspect: node scripts/migrate-excel.mjs --target=local|prod
// Replace authorized lead data: add --replace-leads
// Original lead data and dependent records are backed up under ignored .migration/.
import { loadEnvFile } from 'node:process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');
const target = process.argv.find(a => a.startsWith('--target='))?.split('=')[1];
if (!['local', 'prod'].includes(target)) throw new Error('Specify --target=local or --target=prod');
const replace = process.argv.includes('--replace-leads');
const dir = path.join(root, '.migration');
const records = JSON.parse(readFileSync(path.join(dir, 'leads.json'), 'utf8'));
const report = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'));
if (!records.length || records.length !== report.unique_leads) throw new Error('Invalid staging count');
for (const f of report.files) {
  if (createHash('sha256').update(readFileSync(path.join(root, f.file))).digest('hex') !== f.sha256)
    throw new Error(`Workbook changed since preparation: ${f.file}`);
}
if (new Set(records.map(r => r.id)).size !== records.length || records.some(r => !/^[6-9]\d{9}$/.test(r.mobile) || !['A','B','C','D'].includes(r.category)))
  throw new Error('Invalid staged row ID, mobile, or category');
const tables = ['leads', 'lead_activities', 'call_logs', 'tasks', 'messages', 'enrollments', 'opportunities', 'lead_posts'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dir, 'backups', `${target}-${stamp}`);

async function local() {
  const pg = new EmbeddedPostgres({ databaseDir: path.join(root, '.demo', 'pg'), user: 'postgres', password: 'postgres',
    port: 54329, persistent: true, onLog() {}, onError() {} });
  let started = false;
  let db = pg.getPgClient('crm');
  try {
    try { await db.connect(); }
    catch { await pg.start(); started = true; db = pg.getPgClient('crm'); await db.connect(); }
    const before = {};
    for (const table of tables) before[table] = Number((await db.query(`select count(*) from public.${table}`)).rows[0].count);
    console.log(JSON.stringify({ target, before, staged: records.length }));
    if (!replace) return;
    mkdirSync(backupDir, { recursive: true });
    await db.query('begin');
    try {
      await db.query('lock table public.leads in access exclusive mode');
      for (const table of tables) writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify((await db.query(`select * from public.${table}`)).rows));
      await db.query(readFileSync(path.join(root, 'supabase/upgrade-003-lead-categories.sql'), 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, ''));
      await db.query(readFileSync(path.join(root, 'supabase/upgrade-004-separate-sheet-leads.sql'), 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, ''));
      const stage = (await db.query("select id from stages where is_active and not is_won and not is_lost order by sort_order, id limit 1")).rows[0]?.id;
      if (!stage) throw new Error('No initial stage');
      // Replace only the supplied Excel imports. Preserve leads created in the app.
      await db.query("delete from public.leads where medium = 'Excel import' and exists (select 1 from unnest($1::text[]) f where position(f in source_desc) > 0)", [report.files.map(f => f.file)]);
      const source = (await db.query("insert into lead_sources(name) values ('Excel Import') on conflict (name) do update set is_active = true returning id")).rows[0].id;
      const batches = {};
      for (const f of report.files) batches[f.file] = (await db.query('insert into upload_batches(file_name,total_rows,inserted_rows,duplicate_rows,invalid_rows) values ($1,$2,$3,$4,$5) returning id', [f.file,f.total,f.inserted,f.duplicates,f.invalid])).rows[0].id;
      for (let i = 0; i < records.length; i += 250) {
        const rows = records.slice(i, i + 250).map(({ _batch, ...r }) => ({ ...r, stage_id: stage, source_id: source, upload_batch_id: batches[_batch] }));
        await db.query(`insert into public.leads(id,category,student_name,mobile,email,address,city,pincode,country,medium,qualification,source_desc,internal_notes,stage_id,source_id,upload_batch_id)
          select id,category,student_name,mobile,email,address,city,pincode,country,medium,qualification,source_desc,internal_notes,stage_id,source_id,upload_batch_id
          from jsonb_populate_recordset(null::public.leads, $1::jsonb)`, [JSON.stringify(rows)]);
      }
      const after = Number((await db.query('select count(*) from public.leads where id = any($1::uuid[])', [records.map(r => r.id)])).rows[0].count);
      if (after !== records.length) throw new Error('Imported count mismatch');
      await db.query('commit');
      console.log(JSON.stringify({ target, imported: after, backupDir }));
    } catch (e) { await db.query('rollback'); throw e; }
  } finally { await db.end().catch(() => {}); if (started) await pg.stop(); }
}

async function production() {
  loadEnvFile(path.join(root, '.env.local'));
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const check = ({ data, error }) => { if (error) throw new Error(`${error.code}: ${error.message}`); return data; };
  const before = {};
  for (const table of tables) {
    const result = await db.from(table).select('id', { count: 'exact', head: true });
    check(result); before[table] = result.count;
  }
  console.log(JSON.stringify({ target, host: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host, before, staged: records.length }));
  if (!replace) return;
  // Prove D and repeated mobiles work before backing up or deleting any real data.
  const probeIds = [randomUUID(), randomUUID()];
  try {
    check(await db.from('leads').insert(probeIds.map(id => ({ id, lead_no: `SCHEMA-${id}`, mobile: `SCHEMA-${probeIds[0]}`, student_name: 'Temporary schema check', category: 'D' }))));
  } finally {
    check(await db.from('leads').delete().in('id', probeIds));
  }
  const stage = check(await db.from('stages').select('id').eq('is_active', true).eq('is_won', false).eq('is_lost', false).order('sort_order').order('id').limit(1))[0]?.id;
  if (!stage) throw new Error('No initial stage');
  // Back up all related records before the first deletion, and verify pagination counts.
  mkdirSync(backupDir, { recursive: true });
  for (const table of tables) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const page = check(await db.from(table).select('*').order('id').range(offset, offset + 499));
      rows.push(...page); if (page.length < 500) break;
    }
    if (rows.length !== before[table]) throw new Error(`Backup count changed for ${table}; retry during a quiet period`);
    writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(rows));
  }
  const originalIds = JSON.parse(readFileSync(path.join(backupDir, 'leads.json'), 'utf8'))
    .filter(r => r.medium === 'Excel import' && report.files.some(f => r.source_desc?.includes(f.file))).map(r => r.id);
  // Delete only the backed-up IDs; never delete concurrent newly-created leads.
  for (let i = 0; i < originalIds.length; i += 100) check(await db.from('leads').delete().in('id', originalIds.slice(i, i + 100)));
  let sources = check(await db.from('lead_sources').select('id').ilike('name', 'Excel Import'));
  const source = sources[0]?.id ?? check(await db.from('lead_sources').insert({ name: 'Excel Import' }).select('id'))[0].id;
  const batches = {};
  for (const f of report.files) batches[f.file] = check(await db.from('upload_batches').insert({ file_name: f.file, total_rows: f.total, inserted_rows: f.inserted, duplicate_rows: f.duplicates, invalid_rows: f.invalid }).select('id'))[0].id;
  const state = { target, backupDir, batches, source, stage, imported: 0 };
  const statePath = path.join(dir, `prod-run-${stamp}.json`);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  for (let i = 0; i < records.length; i += 200) {
    const rows = records.slice(i, i + 200).map(({ _batch, ...r }) => ({ ...r, source_id: source, stage_id: stage, upload_batch_id: batches[_batch] }));
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await db.from('leads').upsert(rows, { onConflict: 'id' });
      if (!result.error) break;
    }
    check(result);
    state.imported += rows.length;
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }
  // Verify by source-row ID, never by phone: repeated phones are independent leads.
  let verified = 0;
  for (let i = 0; i < records.length; i += 100) {
    const expected = records.slice(i, i + 100);
    const fields = Object.keys(expected[0]).filter(key => key !== '_batch');
    const actual = check(await db.from('leads').select(fields.join(',')).in('id', expected.map(r => r.id)));
    const byId = new Map(actual.map(r => [r.id, r]));
    for (const row of expected) {
      const saved = byId.get(row.id);
      if (fields.some(key => saved?.[key] !== row[key])) throw new Error('Production verification mismatch');
      verified++;
    }
  }
  console.log(JSON.stringify({ target, imported: state.imported, verified, backupDir }));
}

await (target === 'local' ? local() : production());
