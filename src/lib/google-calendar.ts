import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import type { LeadMeeting } from '@/lib/meeting-types';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
export const GOOGLE_STATE_COOKIE = 'crm_google_calendar';

export function googleCalendarConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.APP_SECRET);
}

export function googleCredentials() {
  if (!googleCalendarConfigured()) throw new Error('Google Calendar is not configured. Ask your admin to enable it.');
  const redirect = new URL(process.env.GOOGLE_REDIRECT_URI!);
  if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname)))
    throw new Error('Google Calendar callback must use HTTPS.');
  return { client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirect.toString() };
}

function encryptionKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error('App secret is not configured.');
  return createHash('sha256').update(`google-calendar-refresh-token:${secret}`).digest();
}

export function encryptGoogleToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64url')).join('.');
}

function decryptGoogleToken(value: string) {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export async function exchangeGoogleCode(code: string, verifier: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...googleCredentials(), code, code_verifier: verifier, grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new Error('Could not connect Google Calendar. Please try connecting again.');
  return await response.json() as { access_token: string; refresh_token?: string; scope?: string };
}

export async function googleAccountEmail(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Could not verify the Google account.');
  const info = await response.json() as { email?: string; email_verified?: boolean };
  if (!info.email || !info.email_verified) throw new Error('Use a Google account with a verified email address.');
  return info.email.toLowerCase();
}

export async function googleAccessToken(userId: string, expectedEmail: string) {
  const { data, error } = await createAdminClient().from('google_calendar_accounts').select('email,refresh_token_encrypted').eq('user_id', userId).maybeSingle();
  if (error || !data) throw new Error('The organizer needs to reconnect Google Calendar.');
  if (data.email !== expectedEmail) throw new Error('Reconnect the Google account that originally organized this meeting.');
  const credentials = googleCredentials();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: credentials.client_id, client_secret: credentials.client_secret,
      refresh_token: decryptGoogleToken(data.refresh_token_encrypted), grant_type: 'refresh_token' }),
  });
  if (!response.ok) throw new Error('The organizer needs to reconnect Google Calendar.');
  const tokens = await response.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error('Could not refresh the Google Calendar connection.');
  return tokens.access_token;
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string };
  attendees?: { email: string; responseStatus?: string }[];
  conferenceData?: { createRequest?: { status?: { statusCode?: string } }; entryPoints?: { entryPointType: string; uri: string }[] };
  extendedProperties?: { private?: Record<string, string> };
}

export class GoogleCalendarError extends Error {
  constructor(public status: number) {
    super(status === 401 || status === 403
      ? 'Google Calendar access was denied. The organizer may need to reconnect or enable Google Meet.'
      : status === 429 ? 'Google Calendar is busy. Please retry shortly.' : 'Google Calendar could not complete the update. Please retry.');
  }
}

async function eventRequest(token: string, method: string, id?: string, body?: object): Promise<GoogleEvent | null> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/primary/events${id ? `/${encodeURIComponent(id)}` : ''}`);
  if (method !== 'GET') { url.searchParams.set('sendUpdates', 'all'); url.searchParams.set('conferenceDataVersion', '1'); }
  const response = await fetch(url, { method, cache: 'no-store', signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new GoogleCalendarError(response.status);
  return response.status === 204 ? null : await response.json() as GoogleEvent;
}

export const googleEventId = (id: string) => id.replaceAll('-', '').toLowerCase();

export async function findGoogleMeeting(token: string, meeting: LeadMeeting) {
  const event = await eventRequest(token, 'GET', googleEventId(meeting.id));
  if (event?.status !== 'cancelled' && event?.extendedProperties?.private?.crmMeetingId !== meeting.id)
    throw new Error('This Calendar event does not match the CRM meeting.');
  return event!;
}

export async function createGoogleMeeting(token: string, meeting: LeadMeeting) {
  // A retry finds the same event rather than sending a second invitation.
  try { return await findGoogleMeeting(token, meeting); }
  catch (error) { if (!(error instanceof GoogleCalendarError) || error.status !== 404) throw error; }
  try {
    return (await eventRequest(token, 'POST', undefined, {
      id: googleEventId(meeting.id), summary: meeting.title, description: meeting.agenda,
      start: { dateTime: meeting.starts_at, timeZone: meeting.timezone }, end: { dateTime: meeting.ends_at, timeZone: meeting.timezone },
      attendees: [{ email: meeting.attendee_email }],
      conferenceData: { createRequest: { requestId: meeting.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      extendedProperties: { private: { crmMeetingId: meeting.id, crmLeadId: meeting.lead_id } },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
    }))!;
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.status === 409) return await findGoogleMeeting(token, meeting);
    throw error;
  }
}

export async function rescheduleGoogleMeeting(token: string, meeting: LeadMeeting, startsAt: string, endsAt: string) {
  const existing = await findGoogleMeeting(token, meeting);
  if (existing.status === 'cancelled') throw new Error('This event was cancelled in Google Calendar. Refresh its status first.');
  return (await eventRequest(token, 'PATCH', googleEventId(meeting.id), {
    start: { dateTime: startsAt, timeZone: meeting.timezone }, end: { dateTime: endsAt, timeZone: meeting.timezone },
  }))!;
}

export async function cancelGoogleMeeting(token: string, meeting: LeadMeeting) {
  try {
    const existing = await findGoogleMeeting(token, meeting);
    if (existing.status !== 'cancelled') await eventRequest(token, 'DELETE', googleEventId(meeting.id));
  } catch (error) {
    if (!(error instanceof GoogleCalendarError) || ![404, 410].includes(error.status)) throw error;
  }
}

export function googleEventFields(event: GoogleEvent, meeting: LeadMeeting) {
  if (event.status !== 'cancelled' && (!event.start?.dateTime || !event.end?.dateTime))
    throw new Error('This Calendar event no longer has a meeting time. Restore its start and end times in Google Calendar, then refresh.');
  const candidate = event.hangoutLink ?? event.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video')?.uri;
  const meet_url = candidate && /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(candidate) ? candidate : null;
  const calendar_url = event.htmlLink && /^https:\/\/(calendar\.google\.com|www\.google\.com)\//.test(event.htmlLink) ? event.htmlLink : null;
  const response = event.attendees?.find(attendee => attendee.email.toLowerCase() === meeting.attendee_email.toLowerCase())?.responseStatus;
  const failed = event.conferenceData?.createRequest?.status?.statusCode === 'failure';
  return {
    google_event_id: event.id, meet_url, calendar_url,
    starts_at: event.start?.dateTime ?? meeting.starts_at, ends_at: event.end?.dateTime ?? meeting.ends_at,
    attendee_response: response && ['accepted', 'declined', 'tentative'].includes(response) ? response : 'needsAction',
    ...(event.status === 'cancelled' ? { status: 'cancelled' } : {}),
    last_synced_at: new Date().toISOString(), sync_state: failed ? 'failed' : 'synced', sync_started_at: null,
    last_error: failed ? 'Google could not generate a Meet link. Cancel this event and schedule a new meeting.' : null,
  };
}
