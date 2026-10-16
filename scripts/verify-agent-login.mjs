// Local PostgreSQL integration checks. Fixtures/settings roll back; production is never used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, '.demo/pg');
const pgCtl = path.join(root, 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
const config = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'crm', connectionTimeoutMillis: 3000 };
let db = new pg.Client(config), started = false;
try {
  try { await db.connect(); } catch {
    await db.end().catch(() => {}); mkdirSync(path.join(root, '.migration'), { recursive: true });
    execFileSync(pgCtl, ['-D', directory, '-l', path.join(root, '.migration/agent-db.log'), '-o', '-p 54329 -h localhost', '-w', '-t', '20', 'start'], { stdio: 'ignore', windowsHide: true });
    started = true; db = new pg.Client(config); await db.connect();
  }
  await db.query(readFileSync(path.join(root, 'supabase/upgrade-006-firebase-agent-login.sql'), 'utf8'));
  await db.query('begin');
  const users = (await db.query('select id,role from profiles where is_active')).rows;
  const agent = users.find(u => u.role === 'agent'), admin = users.find(u => u.role === 'admin');
  assert.ok(agent && admin);
  const session = randomUUID(), lead = randomUUID(), phone = '+15551234567';
  await db.query('update profiles set phone=$1 where id=$2', [phone, agent.id]);
  await db.query("insert into leads(id,student_name,mobile,owner_id) values($1,'OTP verification',$2,$3)", [lead, `VERIFY-${lead}`, agent.id]);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const login = async (user, sid = session) => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user.id, role: 'authenticated', session_id: sid })]);
    await db.query('set local role authenticated');
  };
  const denied = async (sql, args, code) => {
    await db.query('savepoint denied'); let error;
    try { await db.query(sql, args); } catch (e) { error = e; }
    await db.query('rollback to savepoint denied'); assert.equal(error?.code, code);
  };
  await login(agent);
  assert.equal((await one('select app_role() role')).role, 'agent');
  await db.query('reset role');
  await db.query("update app_settings set value='\"firebase\"'::jsonb where key='agent_auth_mode'");
  await login(agent);
  assert.equal((await one('select app_role() role')).role, null);
  assert.equal((await db.query('select id from leads where id=$1', [lead])).rowCount, 0);
  await denied('select * from firebase_agent_sessions', [], '42501');
  await denied('select * from firebase_otp_attempts', [], '42501');
  await denied('select * from agent_login_profile($1)', [phone], '42501');
  await denied("insert into firebase_agent_sessions(session_id,user_id,firebase_uid,phone_e164,firebase_auth_time,expires_at) values($1,$2,'forged',$3,now(),now()+interval '1 hour')", [session, agent.id, phone], '42501');
  await db.query('reset role');
  await db.query("insert into firebase_agent_sessions(session_id,user_id,firebase_uid,phone_e164,firebase_auth_time,expires_at) values($1,$2,'verified',$3,now(),now()+interval '1 hour')", [session, agent.id, phone]);
  await login(agent);
  assert.equal((await one('select app_role() role')).role, 'agent');
  assert.equal((await db.query('select id from leads where id=$1', [lead])).rowCount, 1);
  await login(agent, randomUUID());
  assert.equal((await one('select app_role() role')).role, null);
  await login(admin);
  assert.equal((await one('select app_role() role')).role, 'admin');
  await db.query('reset role');
  await db.query("update firebase_agent_sessions set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where session_id=$1", [session]);
  await login(agent);
  assert.equal((await one('select app_role() role')).role, null);
  await db.query('reset role');
  await db.query("update firebase_agent_sessions set expires_at=now()+interval '1 hour' where session_id=$1", [session]);
  await db.query("update profiles set phone='+15557654321' where id=$1", [agent.id]);
  await login(agent);
  assert.equal((await one('select app_role() role')).role, null);
  await db.query('reset role');
  await db.query('update profiles set phone=$1,is_active=false where id=$2', [phone, agent.id]);
  await login(agent);
  assert.equal((await one('select app_role() role')).role, null);
  await db.query('reset role');
  await db.query("insert into firebase_otp_attempts values('verified',123,$1,now())", [agent.id]);
  await denied("insert into firebase_otp_attempts values('verified',123,$1,now())", [agent.id], '23505');
  const other = users.find(u => u.role === 'agent' && u.id !== agent.id);
  if (other) {
    await db.query('update profiles set is_active=true where id=$1', [agent.id]);
    await denied('update profiles set phone=$1 where id=$2', [phone, other.id], '23505');
  }
  await db.query('rollback');
  console.log('Passed: OTP proof required for RLS, verified session access, private tables/RPC, forged proof denied, other session denied, expiry/phone/deactivation denied, admin access, replay prevention and duplicate phone guard. Fixtures rolled back.');
} finally {
  await db.query('rollback').catch(() => {}); await db.end().catch(() => {});
  if (started) execFileSync(pgCtl, ['-D', directory, '-m', 'fast', '-w', '-t', '20', 'stop'], { stdio: 'ignore', windowsHide: true });
}
