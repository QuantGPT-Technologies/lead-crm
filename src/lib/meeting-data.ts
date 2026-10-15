import 'server-only';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { googleCalendarConfigured } from '@/lib/google-calendar';
import type { LeadMeeting, MeetingConnection } from '@/lib/meeting-types';

export async function getLeadMeetings(leadId: string, notice?: string) {
  const { supabase, profile } = await getSession();
  const [history, account] = await Promise.all([
    supabase.from('lead_meetings').select('*').eq('lead_id', leadId).order('starts_at', { ascending: false }).limit(200),
    createAdminClient().from('google_calendar_accounts').select('email').eq('user_id', profile.id).maybeSingle(),
  ]);
  const connection: MeetingConnection = { configured: googleCalendarConfigured(), email: account.data?.email ?? null,
    available: !history.error && !account.error, notice: ['connected', 'error'].includes(notice ?? '') ? notice : undefined };
  return { meetings: (history.data ?? []) as LeadMeeting[], connection };
}
