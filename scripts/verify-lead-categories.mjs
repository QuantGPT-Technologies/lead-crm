// Integration check against the persisted local database. All fixture changes roll back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(import.meta.dirname, '..');
const pg = new EmbeddedPostgres({ databaseDir: path.join(root, '.demo/pg'), user: 'postgres', password: 'postgres',
  port: 54329, persistent: true, onLog() {}, onError() {} });
let db = pg.getPgClient('crm');
let started = false;
try {
  try { await db.connect(); }
  catch { await pg.start(); started = true; db = pg.getPgClient('crm'); await db.connect(); }
  const staged = JSON.parse(readFileSync(path.join(root, '.migration/leads.json'), 'utf8'));
  const saved = (await db.query('select * from public.leads')).rows;
  assert.equal(saved.length, staged.length);
    const byId = new Map(saved.map(r => [r.id, r]));
  for (const { _batch, ...record } of staged) {
    void _batch;
      const actual = byId.get(record.id);
    assert.ok(actual);
    for (const [key, value] of Object.entries(record)) assert.equal(actual[key], value, `Mismatch: ${key}`);
      assert.equal(actual.category, record.category);
    assert.equal(actual.owner_id, null);
  }
  await db.query('begin');
  const users = (await db.query('select id,role from profiles where is_active')).rows;
  const admin = users.find(u => u.role === 'admin');
  const agent = users.find(u => u.role === 'agent');
  const manager = users.find(u => u.role === 'manager');
  assert.ok(admin && agent && manager, 'Need local admin, manager, and agent fixtures');
  const lead = saved[0];
  await db.query('update leads set owner_id=$1 where id=$2', [agent.id, lead.id]);
  const login = async user => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user.id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const denied = async (sql, values, code) => {
    await db.query('savepoint permission_test');
    let error;
    try { await db.query(sql, values); } catch (e) { error = e; }
    await db.query('rollback to savepoint permission_test');
    assert.equal(error?.code, code);
  };
  await login(admin);
    for (const category of ['B', 'C', 'D', 'A', null]) {
    const result = await db.query('update leads set category=$1 where id=$2 returning category', [category, lead.id]);
    assert.equal(result.rows[0].category, category);
  }
    assert.equal(Number((await db.query("select count(*) from lead_activities where lead_id=$1 and type='category_change'", [lead.id])).rows[0].count), 5);
    await denied('update leads set category=$1 where id=$2', ['E', lead.id], '23514');
    const duplicate = await db.query("insert into leads(student_name,mobile,category) values ('Repeated phone fixture',$1,'D') returning id", [lead.mobile]);
    assert.equal(duplicate.rowCount, 1);
  for (const user of [manager, agent]) {
    await login(user);
    assert.equal((await db.query('select id from leads where id=$1', [lead.id])).rowCount, 1);
    await denied('update leads set category=$1 where id=$2', ['A', lead.id], '42501');
      await denied('insert into leads(student_name,mobile,owner_id,category) values ($1,$2,$3,$4)', ['Permission fixture', lead.mobile, user.id, 'D'], '42501');
    assert.equal((await db.query('update leads set remarks=$1 where id=$2', ['Permission check', lead.id])).rowCount, 1);
  }
  await db.query('reset role');
  await db.query('rollback');
    console.log(`Verified all fields for ${saved.length} separate imported rows; A/B/C/D transitions, repeated phones, audit history, invalid categories, and manager/agent denial passed. Fixtures rolled back.`);
} finally {
  await db.query('rollback').catch(() => {});
  await db.end().catch(() => {});
  if (started) await pg.stop();
}
