export type MeetingStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled';
export interface LeadMeeting {
  id: string;
  lead_id: string;
  organizer_id: string | null;
  organizer_email: string;
  attendee_email: string;
  title: string;
  agenda: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: MeetingStatus;
  sync_state: 'syncing' | 'synced' | 'failed';
  sync_started_at: string | null;
  google_event_id: string | null;
  meet_url: string | null;
  calendar_url: string | null;
  attendee_response: 'needsAction' | 'accepted' | 'declined' | 'tentative';
  last_synced_at: string | null;
  last_error: string | null;
  outcome_notes: string;
  created_at: string;
  version: number;
}
export interface MeetingConnection {
  configured: boolean;
  email: string | null;
  available: boolean;
  notice?: string;
}
