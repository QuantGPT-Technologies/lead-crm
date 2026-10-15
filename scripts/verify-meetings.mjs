// Local integration test. Applies upgrade-005; fixtures and their history roll back.
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
let db = new pg.Client(config);
let started = false;
try {
  try { await db.connect(); }
  catch {
    await db.end().catch(() => {});
    mkdirSync(path.join(root, '.migration'), { recursive: true });
    execFileSync(pgCtl, ['-D', directory, '-l', path.join(root, '.migration/meeting-db.log'), '-o', '-p 54329 -h localhost', '-w', '-t', '20', 'start'], { stdio: 'ignore', windowsHide: true });
    started = true; db = new pg.Client(config); await db.connect();
  }
  await db.query(readFileSync(path.join(root, 'supabase/upgrade-005-lead-meetings.sql'), 'utf8'));
  await db.query('begin');
  const users = (await db.query('select id,role from profiles where is_active')).rows;
  const agent = users.find(user => user.role === 'agent');
  const other = users.find(user => user.role === 'agent' && user.id !== agent.id);
  const admin = users.find(user => user.role === 'admin');
  assert.ok(agent && other && admin);
  const lead = randomUUID(), meeting = randomUUID();
  await db.query("insert into leads(id,student_name,mobile,owner_id) values ($1,'Meeting verification',$2,$3)", [lead, `VERIFY-${lead}`, agent.id]);
  const starts = new Date(Date.now() + 86_400_000).toISOString();
  const ends = new Date(Date.parse(starts) + 1_800_000).toISOString();
  await db.query("insert into lead_meetings(id,lead_id,organizer_id,organizer_email,attendee_email,title,starts_at,ends_at,updated_by) values ($1,$2,$3,'organizer@example.com','lead@example.com','Counselling',$4,$5,$3)", [meeting, lead, agent.id, starts, ends]);
  await db.query("update lead_meetings set google_event_id=$2,meet_url='https://meet.google.com/abc-defg-hij',sync_state='synced' where id=$1", [meeting, meeting.replaceAll('-', '')]);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  let task = await one('select * from tasks where meeting_id=$1', [meeting]);
  assert.equal(task.status, 'pending'); assert.equal(task.assigned_to, agent.id);
  assert.equal(task.due_at.toISOString(), starts);
  assert.equal((await one('select next_followup_at from leads where id=$1', [lead])).next_followup_at.toISOString(), starts);
  assert.equal((await one("select type from lead_activities where lead_id=$1 order by created_at desc limit 1", [lead])).type, 'meeting_scheduled');
  const rescheduled = new Date(Date.parse(starts) + 3_600_000).toISOString();
  await db.query("update lead_meetings set sync_state='syncing' where id=$1", [meeting]);
  await db.query("update lead_meetings set sync_state='synced',starts_at=$2,ends_at=$3 where id=$1", [meeting, rescheduled, new Date(Date.parse(rescheduled) + 1_800_000).toISOString()]);
  task = await one('select * from tasks where meeting_id=$1', [meeting]);
  assert.equal(task.due_at.toISOString(), rescheduled);
  assert.equal(Number((await one('select count(*) from tasks where meeting_id=$1', [meeting])).count), 1);
  const reminded = new Date().toISOString();
  await db.query('update tasks set reminded_at=$2 where meeting_id=$1', [meeting, reminded]);
  await db.query("update lead_meetings set attendee_response='accepted',last_synced_at=now() where id=$1", [meeting]);
  assert.equal((await one('select reminded_at from tasks where meeting_id=$1', [meeting])).reminded_at.toISOString(), reminded);

  const denied = async (sql, params, code) => {
    await db.query('savepoint permission_check'); let error;
    try { await db.query(sql, params); } catch (caught) { error = caught; }
    await db.query('rollback to savepoint permission_check'); assert.equal(error?.code, code);
  };
  const login = async user => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user.id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  for (const user of [agent, admin]) {
    await login(user);
    assert.equal((await db.query('select id from lead_meetings where id=$1', [meeting])).rowCount, 1);
    await denied('select * from google_calendar_accounts', [], '42501');
    await denied("update lead_meetings set status='completed' where id=$1", [meeting], '42501');
    await denied('update tasks set meeting_id=null where id=$1', [task.id], '42501');
  }
  await login(other);
  assert.equal((await db.query('select id from lead_meetings where id=$1', [meeting])).rowCount, 0);
  await db.query('reset role');
  await denied('delete from leads where id=$1', [lead], 'P0001');
  await db.query("update lead_meetings set status='completed',outcome_notes='Discussed next steps' where id=$1", [meeting]);
  assert.equal((await one('select status from tasks where meeting_id=$1', [meeting])).status, 'done');
  assert.equal((await one('select next_followup_at from leads where id=$1', [lead])).next_followup_at, null);
  await db.query("update lead_meetings set status='no_show' where id=$1", [meeting]);
  assert.equal(Number((await one("select count(*) from lead_activities where lead_id=$1 and type='meeting_no_show'", [lead])).count), 1);
  await db.query("update lead_meetings set status='cancelled' where id=$1", [meeting]);
  assert.equal((await one('select status from tasks where meeting_id=$1', [meeting])).status, 'cancelled');
  const failed = randomUUID();
  await db.query("insert into lead_meetings(id,lead_id,organizer_id,organizer_email,attendee_email,title,starts_at,ends_at,updated_by) values ($1,$2,$3,'organizer@example.com','lead@example.com','Failed attempt',$4,$5,$3)", [failed, lead, agent.id, starts, ends]);
  await db.query("update lead_meetings set sync_state='failed',last_error='Provider temporarily unavailable',status='cancelled' where id=$1", [failed]);
  assert.equal(Number((await one('select count(*) from tasks where meeting_id=$1', [failed])).count), 0);
  await db.query('delete from leads where id=$1', [lead]);
  assert.equal(Number((await one('select count(*) from lead_meetings where lead_id=$1', [lead])).count), 0);
  await db.query('rollback');
  console.log('Passed: meeting visibility, private tokens, server-only writes, reminder link protection, scheduling/reschedule/RSVP history, reminder deduplication, outcomes, cancellation, failure tracking, and safe lead deletion. Fixtures rolled back.');
} finally {
  await db.query('rollback').catch(() => {}); await db.end().catch(() => {});
  if (started) execFileSync(pgCtl, ['-D', directory, '-m', 'fast', '-w', '-t', '20', 'stop'], { stdio: 'ignore', windowsHide: true });
}
