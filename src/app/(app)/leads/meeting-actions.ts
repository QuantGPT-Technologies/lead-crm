'use server';

import { createHash, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { setSigned } from '@/lib/signed-cookie';
import { meetingInstant } from '@/lib/meeting-time';
import type { ActionResult } from '@/lib/types';
import type { LeadMeeting } from '@/lib/meeting-types';
import { CALENDAR_SCOPE, GOOGLE_STATE_COOKIE, googleCredentials, googleCalendarConfigured, googleAccessToken,
  createGoogleMeeting, findGoogleMeeting, cancelGoogleMeeting, rescheduleGoogleMeeting, googleEventFields, GoogleCalendarError } from '@/lib/google-calendar';

const scheduleSchema = z.object({ id: z.uuid(), lead_id: z.uuid(), title: z.string().trim().min(1).max(200),
  attendee_email: z.email().max(254), agenda: z.string().trim().max(4000), starts_local: z.string(), duration: z.number().int().min(15).max(480) });

function timeRange(local: string, minutes: number, timezone = env.timezone) {
  const starts_at = meetingInstant(local, timezone);
  if (Date.parse(starts_at) < Date.now() + 60_000) throw new Error('Schedule the meeting at least one minute from now.');
  return { starts_at, ends_at: new Date(Date.parse(starts_at) + minutes * 60_000).toISOString() };
}

function done(leadId: string, message: string): ActionResult {
  updateTag('crm-dashboard');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/followups');
  return { message };
}

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Meeting update failed. Please retry.';

async function leadContext(leadId: string) {
  if (!z.uuid().safeParse(leadId).success) throw new Error('Lead not found.');
  const session = await getSession();
  const { data, error } = await session.supabase.from('leads').select('id,dnd').eq('id', leadId).maybeSingle();
  if (error || !data) throw new Error('Lead not found or you do not have access.');
  return { ...session, lead: data };
}

async function meetingContext(id: string) {
  if (!z.uuid().safeParse(id).success) throw new Error('Meeting not found.');
  const session = await getSession();
  const { data, error } = await session.supabase.from('lead_meetings').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Meeting not found or you do not have access.');
  const meeting = data as LeadMeeting;
  if (meeting.organizer_id !== session.profile.id && session.profile.role !== 'admin')
    throw new Error('Only the organizer or an admin can update this meeting.');
  return { ...session, meeting };
}

export async function connectGoogleCalendar(leadId: string): Promise<void> {
  const { profile } = await leadContext(leadId);
  const credentials = googleCredentials();
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  await setSigned(GOOGLE_STATE_COOKIE, { state, verifier, userId: profile.id, leadId }, 600);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const params = { client_id: credentials.client_id, redirect_uri: credentials.redirect_uri, response_type: 'code',
    scope: `openid email ${CALENDAR_SCOPE}`, access_type: 'offline', prompt: 'consent', state,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  redirect(url.toString());
}

async function claim(meeting: LeadMeeting, actorId: string) {
  if (meeting.sync_state === 'syncing' && meeting.sync_started_at && Date.parse(meeting.sync_started_at) > Date.now() - 5 * 60_000)
    throw new Error('This meeting is being updated. Refresh shortly.');
  const { data, error } = await createAdminClient().from('lead_meetings').update({ sync_state: 'syncing', sync_started_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', meeting.id).eq('version', meeting.version).select('*').maybeSingle();
  if (error) throw new Error('Could not start the meeting update.');
  if (!data) throw new Error('This meeting changed. Refresh and try again.');
  return data as LeadMeeting;
}

async function perform(meeting: LeadMeeting, actorId: string, operation: (token: string) => Promise<Record<string, unknown>>) {
  try {
    if (!meeting.organizer_id) throw new Error('The organizer account is no longer available.');
    const token = await googleAccessToken(meeting.organizer_id, meeting.organizer_email);
    const updates = await operation(token);
    const { error, data } = await createAdminClient().from('lead_meetings')
      .update({ ...updates, updated_by: actorId }).eq('id', meeting.id).eq('version', meeting.version).select('id').maybeSingle();
    if (error || !data) throw new Error('Calendar may have been updated, but saving to the CRM failed. Use Refresh from Google to recover.');
    if (updates.sync_state === 'failed') {
      revalidatePath(`/leads/${meeting.lead_id}`);
      return { error: String(updates.last_error), id: meeting.id };
    }
    return { ...done(meeting.lead_id, 'Meeting saved.'), id: meeting.id };
  } catch (error) {
    const message = errorText(error);
    await createAdminClient().from('lead_meetings').update({ sync_state: 'failed', sync_started_at: null, last_error: message, updated_by: actorId })
      .eq('id', meeting.id).eq('version', meeting.version);
    revalidatePath(`/leads/${meeting.lead_id}`);
    return { error: message, id: meeting.id };
  }
}

export async function scheduleMeeting(input: z.infer<typeof scheduleSchema>): Promise<ActionResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const value = parsed.data;
  const { lead, profile } = await leadContext(value.lead_id);
  if (lead.dnd) return { error: 'This lead is marked Do Not Disturb.' };
  if (!googleCalendarConfigured()) return { error: 'Google Calendar is not configured. Ask your admin to enable it.' };
  try {
    const range = timeRange(value.starts_local, value.duration);
    const admin = createAdminClient();
    const { data: account, error: accountError } = await admin.from('google_calendar_accounts').select('email').eq('user_id', profile.id).maybeSingle();
    if (accountError || !account) return { error: 'Connect Google Calendar before scheduling a meeting.' };
    const { data: inserted, error } = await admin.from('lead_meetings').insert({
      id: value.id, lead_id: value.lead_id, organizer_id: profile.id, organizer_email: account.email,
      attendee_email: value.attendee_email.toLowerCase(), title: value.title, agenda: value.agenda,
      ...range, timezone: env.timezone, updated_by: profile.id, sync_state: 'syncing', sync_started_at: new Date().toISOString(),
    }).select('*').single();
    let meeting = inserted as LeadMeeting | null;
    if (error?.code === '23505') {
      const context = await meetingContext(value.id);
      if (context.meeting.lead_id !== value.lead_id || context.meeting.organizer_id !== profile.id) return { error: 'Meeting request is not valid.' };
      if (context.meeting.google_event_id) return done(value.lead_id, 'This meeting has already been scheduled.');
      meeting = await claim(context.meeting, profile.id);
    } else if (error || !meeting) return { error: 'Could not save the meeting. Ask your admin to check meeting setup.' };
    const current = meeting!;
    return await perform(current, profile.id, async token => googleEventFields(await createGoogleMeeting(token, current), current));
  } catch (error) { return { error: errorText(error) }; }
}

export async function rescheduleMeeting(id: string, startsLocal: string, duration: number): Promise<ActionResult> {
  const { meeting, profile } = await meetingContext(id);
  if (meeting.status !== 'scheduled' || !meeting.google_event_id) return { error: 'Only scheduled Calendar meetings can be rescheduled.' };
  const { lead } = await leadContext(meeting.lead_id);
  if (lead.dnd) return { error: 'This lead is marked Do Not Disturb.' };
  try {
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) throw new Error('Duration must be between 15 and 480 minutes.');
    const range = timeRange(startsLocal, duration, meeting.timezone);
    const locked = await claim(meeting, profile.id);
    return await perform(locked, profile.id, async token => googleEventFields(await rescheduleGoogleMeeting(token, locked, range.starts_at, range.ends_at), locked));
  } catch (error) { return { error: errorText(error) }; }
}

export async function cancelMeeting(id: string): Promise<ActionResult> {
  const { meeting, profile } = await meetingContext(id);
  if (meeting.status !== 'scheduled') return { error: 'This meeting has already been closed.' };
  try {
    const locked = await claim(meeting, profile.id);
    return await perform(locked, profile.id, async token => {
      // Also checks the deterministic event ID after an interrupted creation.
      await cancelGoogleMeeting(token, locked);
      return { status: 'cancelled', sync_state: 'synced', sync_started_at: null, last_error: null, last_synced_at: new Date().toISOString() };
    });
  } catch (error) { return { error: errorText(error) }; }
}

export async function refreshMeeting(id: string): Promise<ActionResult> {
  const { meeting, profile } = await meetingContext(id);
  try {
    const locked = await claim(meeting, profile.id);
    return await perform(locked, profile.id, async token => {
      let event;
      try { event = await findGoogleMeeting(token, locked); }
      catch (error) {
        if (!(error instanceof GoogleCalendarError) || ![404, 410].includes(error.status)) throw error;
        if (!locked.google_event_id && locked.status === 'scheduled') {
          const { lead } = await leadContext(locked.lead_id);
          if (lead.dnd) throw new Error('This lead is marked Do Not Disturb. Cancel the meeting attempt instead.');
          event = await createGoogleMeeting(token, locked);
        } else return { status: locked.status === 'scheduled' ? 'cancelled' : locked.status, sync_state: 'synced', sync_started_at: null, last_error: null, last_synced_at: new Date().toISOString() };
      }
      return { ...googleEventFields(event, locked), ...(locked.status !== 'scheduled' ? { status: locked.status } : {}) };
    });
  } catch (error) { return { error: errorText(error) }; }
}

export async function recordMeetingOutcome(id: string, status: 'completed' | 'no_show', notes: string): Promise<ActionResult> {
  const { meeting, profile } = await meetingContext(id);
  if (!['completed', 'no_show'].includes(status) || typeof notes !== 'string' || notes.length > 4000) return { error: 'Enter a valid outcome and notes up to 4000 characters.' };
  if (!meeting.google_event_id || meeting.status === 'cancelled' || Date.parse(meeting.starts_at) > Date.now()) return { error: 'Record an outcome after the meeting starts.' };
  if (meeting.sync_state !== 'synced') return { error: 'Refresh from Google before recording an outcome.' };
  const { data, error } = await createAdminClient().from('lead_meetings').update({ status, outcome_notes: notes.trim(), updated_by: profile.id,
    sync_state: 'synced', last_error: null }).eq('id', id).eq('version', meeting.version).select('id').maybeSingle();
  return error || !data ? { error: 'Meeting changed or could not be saved. Refresh and retry.' } : done(meeting.lead_id, 'Meeting outcome recorded.');
}
