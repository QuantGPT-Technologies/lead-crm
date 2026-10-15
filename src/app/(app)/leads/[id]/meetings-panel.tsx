'use client';

import { useState, useTransition } from 'react';
import { CalendarDays, ExternalLink, RefreshCw, Video } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Modal, Select, btn } from '@/components/ui';
import { notify } from '@/components/toast';
import { meetingLocalTime } from '@/lib/meeting-time';
import type { Lead, Role } from '@/lib/types';
import type { LeadMeeting, MeetingConnection } from '@/lib/meeting-types';
import { cancelMeeting, connectGoogleCalendar, recordMeetingOutcome, refreshMeeting, rescheduleMeeting, scheduleMeeting } from '../meeting-actions';

const STATUS = { scheduled: 'Scheduled', completed: 'Completed', no_show: 'No-show', cancelled: 'Cancelled' };
const COLORS = { scheduled: '#0284c7', completed: '#16a34a', no_show: '#d97706', cancelled: '#64748b' };
const RSVP = { needsAction: 'Awaiting RSVP', accepted: 'Invite accepted', declined: 'Invite declined', tentative: 'Tentative' };

export function MeetingsPanel({ lead, meetings, connection, me, timezone, now }: {
  lead: Lead; meetings: LeadMeeting[]; connection: MeetingConnection;
  me: { id: string; role: Role }; timezone: string; now: string;
}) {
  const [pending, start] = useTransition();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const enabled = connection.available && connection.configured && !!connection.email && !lead.dnd;
  const completed = meetings.filter(meeting => meeting.status === 'completed').length;
  const upcoming = meetings.filter(meeting => meeting.status === 'scheduled' && Date.parse(meeting.starts_at) >= Date.parse(now)).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Card className="self-start p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Video size={20} /> Schedule Google Meet</h2>
        <p className="mt-2 text-xs text-muted">Create a Calendar event, generate a new Meet link, and email the lead an invitation.</p>
        {connection.notice === 'connected' && <p role="status" className="mt-3 text-sm text-emerald-700">Google Calendar connected.</p>}
        {connection.notice === 'error' && <p role="alert" className="mt-3 text-sm text-red-600">Google Calendar could not be connected. Try connecting again and allow Calendar access.</p>}
        {!connection.available ? <p role="alert" className="mt-4 text-sm text-muted">Meeting tracking is unavailable. Ask your admin to finish setup or try again shortly.</p>
          : !connection.configured ? <p className="mt-4 text-sm text-muted">Google Calendar scheduling has not been enabled yet. Ask your admin to enable it.</p>
          : <div className="my-4 rounded-lg bg-soft p-3 text-xs">
            {connection.email && <p className="mb-2 break-all">Calendar: <strong>{connection.email}</strong></p>}
            <form action={connectGoogleCalendar.bind(null, lead.id)}>
              <Button variant="outline" type="submit">{connection.email ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</Button>
            </form>
          </div>}
        {lead.dnd && <p className="my-3 text-sm text-red-600">This lead is marked Do Not Disturb. New meeting invitations are disabled.</p>}
        <form className="mt-4 space-y-3" onSubmit={event => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          start(async () => {
            const result = await scheduleMeeting({ id: requestId, lead_id: lead.id,
              title: String(data.get('title')), attendee_email: String(data.get('email')), agenda: String(data.get('agenda') ?? ''),
              starts_local: String(data.get('starts')), duration: Number(data.get('duration')) });
            notify(result);
            if (result.id || !result.error) { setRequestId(crypto.randomUUID()); form.reset(); }
          });
        }}>
          <fieldset disabled={!enabled || pending} className="space-y-3 disabled:opacity-60">
            <Field label="Meeting title" required><input name="title" required maxLength={200} defaultValue={`Counselling with ${lead.student_name}`.slice(0, 200)} className="input" /></Field>
            <Field label="Lead's email" required><input name="email" type="email" required maxLength={254} defaultValue={lead.email ?? ''} className="input" /></Field>
            <Field label={`Date and time (${timezone})`} required><input name="starts" type="datetime-local" min={meetingLocalTime(new Date(Date.parse(now) + 60_000), timezone)} required className="input" /></Field>
            <Field label="Duration in minutes" required><input name="duration" type="number" min={15} max={480} defaultValue={30} required className="input" /></Field>
            <Field label="Agenda"><textarea name="agenda" rows={3} maxLength={4000} className="input" placeholder="What will you discuss?" /></Field>
            <Button type="submit" disabled={!enabled || pending}>{pending ? 'Scheduling…' : 'Schedule and send invite'}</Button>
          </fieldset>
        </form>
      </Card>
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-6 p-4">
          <h2 className="mr-auto text-lg font-semibold">Meeting history</h2>
          <span className="text-sm"><strong>{upcoming}</strong> upcoming</span>
          <span className="text-sm"><strong>{completed}</strong> completed</span>
          <span className="text-sm text-muted">{meetings.length} total</span>
        </Card>
        <p className="text-xs text-muted">Refresh from Google to check RSVPs and Calendar changes. Completion and no-show outcomes are recorded by your team.</p>
        {!meetings.length && <Card className="p-6"><Empty>No meetings scheduled for this lead yet.</Empty></Card>}
        {meetings.map(meeting => <MeetingCard key={`${meeting.id}:${meeting.version}`} meeting={meeting}
          canManage={me.role === 'admin' || meeting.organizer_id === me.id} now={now} />)}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, canManage, now }: { meeting: LeadMeeting; canManage: boolean; now: string }) {
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const scheduled = meeting.status === 'scheduled';
  const busy = meeting.sync_state === 'syncing' && !!meeting.sync_started_at && Date.parse(meeting.sync_started_at) > Date.parse(now) - 5 * 60_000;
  const needsOutcome = scheduled && Date.parse(meeting.ends_at) < Date.parse(now);
  const formatter = new Intl.DateTimeFormat('en-IN', { timeZone: meeting.timezone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const when = (instant: string) => formatter.format(new Date(instant));
  const run = (action: () => Promise<{ error?: string; message?: string }>) => start(async () => { notify(await action()); });

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="mr-auto font-semibold">{meeting.title}</h3>
        <Badge color={COLORS[meeting.status]}>{STATUS[meeting.status]}</Badge>
        {scheduled && <Badge>{RSVP[meeting.attendee_response]}</Badge>}
        {needsOutcome && <Badge color="#d97706">Needs outcome</Badge>}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm"><CalendarDays size={15} /> {when(meeting.starts_at)} – {when(meeting.ends_at)} <span className="text-xs text-muted">({meeting.timezone})</span></p>
      <p className="break-all text-xs text-muted">Organizer: {meeting.organizer_email} · Lead: {meeting.attendee_email}</p>
      {meeting.agenda && <p className="whitespace-pre-wrap text-sm">{meeting.agenda}</p>}
      {meeting.outcome_notes && <p className="whitespace-pre-wrap rounded-lg bg-soft p-3 text-sm"><strong>Outcome: </strong>{meeting.outcome_notes}</p>}
      {meeting.sync_state === 'failed' && <p role="alert" className="text-sm text-red-600">{meeting.last_error ?? 'Calendar update failed. Refresh to retry.'}</p>}
      {busy && <p role="status" className="text-sm text-muted">Updating Calendar… Refresh this page shortly.</p>}
      {!meeting.meet_url && meeting.google_event_id && scheduled && meeting.sync_state === 'synced' && <p className="text-xs text-muted">Google is generating the Meet link. Refresh from Google in a moment.</p>}
      <div className="flex flex-wrap gap-2">
        {meeting.meet_url && scheduled && <a href={meeting.meet_url} target="_blank" rel="noopener noreferrer" className={btn()}><Video size={15} /> Join Google Meet</a>}
        {meeting.calendar_url && <a href={meeting.calendar_url} target="_blank" rel="noopener noreferrer" className={btn('outline')}><ExternalLink size={14} /> View Calendar event</a>}
        {canManage && <Button variant="outline" disabled={pending || busy} onClick={() => run(() => refreshMeeting(meeting.id))}><RefreshCw size={14} /> {meeting.google_event_id ? 'Refresh from Google' : 'Retry scheduling'}</Button>}
        {canManage && scheduled && <Button variant="danger" disabled={pending || busy} onClick={() => setConfirmCancel(true)}>Cancel meeting</Button>}
      </div>
      {meeting.last_synced_at && <p className="text-[11px] text-muted">Last checked: {when(meeting.last_synced_at)}</p>}
      {canManage && scheduled && meeting.google_event_id && <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-semibold">Reschedule meeting</summary>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          run(() => rescheduleMeeting(meeting.id, String(data.get('starts')), Number(data.get('duration'))));
        }}>
          <Field label={`New date and time (${meeting.timezone})`} required><input name="starts" type="datetime-local" required className="input" defaultValue={meetingLocalTime(meeting.starts_at, meeting.timezone)} /></Field>
          <Field label="Minutes" required><input name="duration" type="number" min={15} max={480} required className="input !w-24" defaultValue={Math.round((Date.parse(meeting.ends_at) - Date.parse(meeting.starts_at)) / 60_000)} /></Field>
          <Button type="submit" disabled={pending || busy}>Reschedule and notify</Button>
        </form>
      </details>}
      {canManage && meeting.google_event_id && meeting.status !== 'cancelled' && Date.parse(meeting.starts_at) <= Date.parse(now) && <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-semibold">Record meeting outcome</summary>
        <form className="mt-3 space-y-3" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          run(() => recordMeetingOutcome(meeting.id, String(data.get('outcome')) as 'completed' | 'no_show', String(data.get('notes') ?? '')));
        }}>
          <Field label="Outcome"><Select name="outcome" placeholder={null} defaultValue={meeting.status === 'no_show' ? 'no_show' : 'completed'} options={[{ value: 'completed', label: 'Completed' }, { value: 'no_show', label: 'Lead did not attend' }]} /></Field>
          <Field label="Notes"><textarea name="notes" maxLength={4000} rows={3} defaultValue={meeting.outcome_notes} className="input" /></Field>
          <Button type="submit" disabled={pending || busy || meeting.sync_state !== 'synced'}>Save outcome</Button>
        </form>
      </details>}
      {confirmCancel && <Modal title="Cancel meeting" onClose={() => setConfirmCancel(false)}>
        <p>Cancel this Calendar event and notify the lead? Its history will stay in the CRM.</p>
        <div className="mt-4 flex gap-2"><Button variant="danger" disabled={pending} onClick={() => { setConfirmCancel(false); run(() => cancelMeeting(meeting.id)); }}>Cancel and notify</Button><Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep meeting</Button></div>
      </Modal>}
    </Card>
  );
}
