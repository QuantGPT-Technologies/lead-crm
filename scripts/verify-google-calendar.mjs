// Offline provider integration checks. All HTTP traffic is simulated; no invitations are sent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const events = new Map();
let created = 0, cancelled = 0, lostResponse = false, encrypted;
const fakeDatabase = { from() { return { select() { return { eq() { return { async maybeSingle() {
  return { data: { email: 'organizer@example.com', refresh_token_encrypted: encrypted }, error: null };
} }; } }; } }; } };
const http = async (input, init = {}) => {
  const url = new URL(input);
  const method = init.method ?? 'GET';
  if (url.href === 'https://oauth2.googleapis.com/token') {
    assert.equal(init.body.get('refresh_token'), 'offline-refresh-token');
    return Response.json({ access_token: 'access-token' });
  }
  assert.equal(url.origin, 'https://www.googleapis.com');
  assert.equal(init.headers.Authorization, 'Bearer access-token');
  const prefix = '/calendar/v3/calendars/primary/events';
  assert.ok(url.pathname.startsWith(prefix));
  const id = url.pathname.slice(prefix.length + 1);
  if (method !== 'GET') {
    assert.equal(url.searchParams.get('sendUpdates'), 'all');
    assert.equal(url.searchParams.get('conferenceDataVersion'), '1');
  }
  if (method === 'POST') {
    const body = JSON.parse(init.body);
    assert.match(body.id, /^[0-9a-v]{5,1024}$/);
    assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    assert.equal(body.attendees[0].email, 'lead@example.com');
    const event = { ...body, status: 'confirmed', hangoutLink: 'https://meet.google.com/abc-defg-hij',
      htmlLink: 'https://calendar.google.com/calendar/event?eid=fixture' };
    events.set(body.id, event); created++;
    if (lostResponse) { lostResponse = false; throw new Error('Simulated lost response after Google accepted the event'); }
    return Response.json(event);
  }
  if (!events.has(id)) return Response.json({}, { status: 404 });
  if (method === 'PATCH') { events.set(id, { ...events.get(id), ...JSON.parse(init.body) }); }
  if (method === 'DELETE') { cancelled++; events.set(id, { id, status: 'cancelled' }); return new Response(null, { status: 204 }); }
  return Response.json(events.get(id));
};

function load(source) {
  const output = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const context = { exports, Buffer, URL, URLSearchParams, AbortSignal, fetch: http,
    process: { env: { APP_SECRET: 'verification-only-secret-not-used-in-production', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/google-calendar/callback' } },
    require(name) { if (name === 'server-only') return {}; if (name === '@/lib/supabase/server') return { createAdminClient: () => fakeDatabase }; return require(name); },
  };
  vm.runInNewContext(output, context, { filename: source });
  return exports;
}

const api = load('src/lib/google-calendar.ts');
const time = load('src/lib/meeting-time.ts');
encrypted = api.encryptGoogleToken('offline-refresh-token');
assert.ok(!encrypted.includes('offline-refresh-token'));
assert.equal(await api.googleAccessToken(randomUUID(), 'organizer@example.com'), 'access-token');
await assert.rejects(() => api.googleAccessToken(randomUUID(), 'different@example.com'));
assert.equal(time.meetingInstant('2026-10-17T10:00', 'Asia/Kolkata'), '2026-10-17T04:30:00.000Z');
assert.equal(time.meetingLocalTime('2026-10-17T04:30:00.000Z', 'Asia/Kolkata'), '2026-10-17T10:00');
assert.throws(() => time.meetingInstant('2026-02-31T10:00', 'Asia/Kolkata'));
assert.throws(() => time.meetingInstant('2026-03-08T02:30', 'America/New_York'));

const meeting = { id: randomUUID(), lead_id: randomUUID(), title: 'Counselling', agenda: 'Course discussion',
  starts_at: '2026-10-17T04:30:00.000Z', ends_at: '2026-10-17T05:00:00.000Z', timezone: 'Asia/Kolkata', attendee_email: 'lead@example.com' };
const first = await api.createGoogleMeeting('access-token', meeting);
assert.equal(api.googleEventFields(first, meeting).meet_url, 'https://meet.google.com/abc-defg-hij');
await api.createGoogleMeeting('access-token', meeting);
assert.equal(created, 1, 'Retry must not send another invitation');
const second = { ...meeting, id: randomUUID() };
lostResponse = true;
await assert.rejects(() => api.createGoogleMeeting('access-token', second));
await api.createGoogleMeeting('access-token', second);
assert.equal(created, 2, 'Recover an accepted event after a lost response without duplicating it');
await api.rescheduleGoogleMeeting('access-token', meeting, '2026-10-18T04:30:00.000Z', '2026-10-18T05:00:00.000Z');
assert.equal((await api.findGoogleMeeting('access-token', meeting)).start.dateTime, '2026-10-18T04:30:00.000Z');
const event = events.get(api.googleEventId(meeting.id));
event.attendees[0].responseStatus = 'accepted';
assert.equal(api.googleEventFields(event, meeting).attendee_response, 'accepted');
const unsafe = { ...event, hangoutLink: 'https://meet.google.com.evil.test/abc-defg-hij', htmlLink: 'javascript:alert(1)' };
assert.equal(api.googleEventFields(unsafe, meeting).meet_url, null);
assert.equal(api.googleEventFields(unsafe, meeting).calendar_url, null);
await api.cancelGoogleMeeting('access-token', meeting);
await api.cancelGoogleMeeting('access-token', meeting);
assert.equal(cancelled, 1, 'Cancel retry must not send a duplicate cancellation');
await api.cancelGoogleMeeting('access-token', { ...meeting, id: randomUUID() });
console.log('Passed: encrypted token refresh, organizer account matching, India/DST date conversion, unique Meet links, invitation flags, retry recovery without duplicate events, rescheduling, RSVP extraction, URL safety, and cancellation retries. No real Google requests were made.');
