# Google Meet scheduling

The lead detail page has **Schedule Google Meet** and a **Meetings** tab. Each organizer connects
their own Google account. Scheduling creates one Calendar event, generates a unique Meet link,
and sends the lead an email invitation. Retrying an interrupted request recovers the same event.

## Enable the integration

1. Run the final `supabase/upgrade-005-lead-meetings.sql` in the production Supabase SQL Editor.
   It is idempotent. Fresh schemas include it, and the local demo applies it on startup.
2. In [Google Cloud Console](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com),
   enable Google Calendar API for your project.
3. Configure the Google OAuth consent screen. Add your staff as test users while the app is in testing.
   Request `openid`, `email`, and `https://www.googleapis.com/auth/calendar.events.owned`.
   Google may require verification before an external app can be broadly used in production.
4. Create an **OAuth client ID → Web application**. Add the exact authorized redirect URIs:
   - Development: `http://localhost:3000/api/google-calendar/callback`
   - Production: `https://YOUR-CRM-DOMAIN/api/google-calendar/callback`
5. Set these server-only variables in `.env.local`, and in the production hosting environment:

   ```dotenv
   GOOGLE_CLIENT_ID=your-web-oauth-client-id
   GOOGLE_CLIENT_SECRET=your-web-oauth-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
   ```

   Use the production HTTPS callback for the production variable. Retain the existing `APP_SECRET`:
   refresh tokens are encrypted with a key derived from it. Changing it requires reconnecting accounts.
   Never put any of these values in `NEXT_PUBLIC_*` variables, commit secrets, or paste them in chat.
6. Restart the local app or deploy with the production variables. Open a lead → **Schedule Google Meet**
   → **Connect Google Calendar** and grant access. Each staff member connects their own account.

Your Google account and organization must allow Google Meet. Real event/invitation testing requires
OAuth credentials and an organizer's consent. The offline verification script sends no invitations.

## Tracking and permissions

- A lead's existing row-level visibility controls who can read meetings and join links.
- Only the organizer or an active CRM admin can refresh, reschedule, cancel, or record outcomes.
- Calendar reschedules and cancellations notify the lead. **Refresh from Google** retrieves RSVP,
  time changes, generated Meet links, and cancellations made outside the CRM.
- Completed/no-show outcomes and notes are recorded manually; this is not automatic Meet attendance.
- Scheduling creates a follow-up reminder for the organizer. Rescheduling updates that reminder;
  cancellation or an outcome closes it. Existing reminder/push infrastructure handles the task.
- Meeting changes and reminder updates commit with lead activity history in the same transaction.
- API failures remain visible and retryable. An interrupted update can be recovered after five minutes.
- Leads with scheduled meetings must have those meetings cancelled before the lead can be deleted.
- Calendar refresh tokens are encrypted, readable only by the app server, and never sent to the browser.

## Verification

```powershell
node scripts/verify-meetings.mjs
node scripts/verify-google-calendar.mjs
npm run build
```

The first command verifies the local database integration and rolls back all fixtures. The second
simulates Google responses to check event identity, retry recovery, notifications, timezone conversion,
and safe URLs. Neither sends real Google invitations. For an end-to-end check, connect a test organizer
and schedule a meeting with a consenting test recipient, then reschedule and cancel that test event.

Google references: [create Calendar events](https://developers.google.com/workspace/calendar/api/guides/create-events),
[OAuth for web applications](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).
