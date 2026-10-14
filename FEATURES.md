# Lead CRM — Feature Overview

This CRM supports an education sales team's workflow from collecting student enquiries to follow-ups, opportunities, enrolments, and fee tracking. It is designed for a single company's internal use.

This inventory reflects the current project implementation, reviewed on 14 October 2026. Features marked as optional require configuration; their presence in the project does not confirm that they are enabled in a deployment.

## 1. Login and access control

- Individual login using a User ID or email and password.
- Optional shared company login before individual login.
- Optional email OTP verification during login; disabled by default.
- Three user roles: Admin, Manager, and Agent.
- Lead visibility based on role, ownership, and reporting relationships.
- Database Row Level Security and server-side permission checks.
- User activation and deactivation, including blocking deactivated accounts.
- Sign out and personal password changes.

| Role | Lead visibility | Main permissions |
| --- | --- | --- |
| Agent | Leads assigned to them | Create and work leads, record calls and messages, manage follow-ups, opportunities, enrolments, and payments within their access |
| Manager | Their own leads, direct team's leads, and unassigned leads | Agent workflows plus CSV upload, distribution, transfers, rechurn, and agent performance reports |
| Admin | All leads | Manager workflows plus user administration, master data, templates, company settings, and lead deletion |

## 2. Dashboard

- Weekly KPIs for new leads, conversations, enrolments, and conversion rate.
- Comparison against the previous week's figures.
- Leads and enrolments trend chart.
- Lead source breakdown.
- Recent workspace activity.
- Upcoming follow-ups and quick links to daily work.
- Data scoped to the signed-in user's access.

## 3. Lead creation and records

- Manually create a student enquiry.
- Unique lead number and duplicate mobile-number protection.
- Edit a lead through separate sections for contact, lead details, qualification, location, team details, and education/work.
- Hot, warm, and cold lead priorities.
- Required-field, contact-format, date, and dropdown relationship validation.
- University-specific course choices and stage-specific sub-stage choices.
- Agents automatically own leads they create; managers and admins can select an owner.

| Information group | Fields provided |
| --- | --- |
| Contact | Student name, mobile, alternate mobile, email, gender, date of birth, Do Not Disturb |
| Lead details | Source, source description, campaign, medium, product, priority |
| Qualification and stage | University, course, funnel selection, stage, sub-stage, remarks |
| Location | Country, state, city, pincode, address |
| Team details | Lead owner, internal notes |
| Education and work | Highest qualification, company, designation, experience in years |
| System tracking | Lead number, creation and allotment information, contact attempts, follow-up information, rechurn count |

## 4. Search and lead list

- Search by student name, mobile, email, or lead number.
- Quick filters for stage and source.
- Advanced filters for product, contact attempts, university, course, priority, and creation date range.
- Owner and unassigned-pool filtering for managers and admins.
- Contact attempt filters: not attempted, one attempt, two attempts, or three or more.
- Sorting on supported columns, including student name, lead number, attempts, next follow-up, and creation date.
- Pagination with 25, 50, or 100 rows per page.
- Column chooser to show or hide available lead information.
- Filter values retained in the URL for bookmarking or sharing, subject to the recipient's access.
- Configurable masking of contact details in the lead list.
- Bulk stage changes.
- Bulk assignment or return to the unassigned pool for managers and admins.
- Bulk deletion for admins, with a confirmation dialog.

## 5. Kanban pipeline

- View leads arranged by stage.
- Move leads between stages using drag and drop.
- Use configured stages and stage colours to understand pipeline progress.
- Open individual leads from the board.

## 6. Bulk CSV upload

- Import up to 5,000 rows per CSV file.
- Download a sample CSV template.
- Preview the first five rows before import.
- Required columns: Name and Mobile.
- Optional columns include email, alternate mobile, city, state, university, course, source, product, campaign, medium, qualification, and remarks.
- Match supported column aliases and existing university, course, and source names.
- Choose a fallback source for rows without a matching source.
- Add imported leads to the unassigned pool.
- Skip duplicate mobiles within the file and those already in the CRM.
- Preserve existing leads when a duplicate is found.
- Show imported, duplicate, invalid, and total row counts, with row-level problems.
- Track upload batches for later distribution.
- Available to managers and admins.

## 7. Lead distribution and data allotment

- Distribute unassigned leads evenly among selected active users using round robin.
- Select how many leads to distribute.
- Restrict distribution by upload batch, source, or stage.
- View each user's current lead load before distribution.
- View allotment summaries showing leads held, untouched leads, overdue follow-ups, and enrolled leads.
- Transfer a selected number of leads between users or back to the pool.
- Optionally transfer only leads that have not been attempted.
- Record assignment activity and allotment timestamps.
- Available to managers and admins.

## 8. Lead workspace and history

- Summary view of contact details, ownership, and lead journey.
- Navigate to the newer or older accessible lead.
- Add notes and edit lead sections.
- Open actions for email, SMS, WhatsApp, calls, follow-ups, assignment, opportunities, and enrolment.
- Timeline of lead creation, edits, assignments, stage changes, calls, notes, messages, tasks, enrolments, and integration posts.
- Dedicated stage history and call log views.
- View tasks, communication status, and integration responses within the lead workspace.
- Track who performed recorded actions and when.

## 9. Calls and contact tracking

- Open the device's dialler from a lead.
- Manually log inbound or outbound calls.
- Record connected, no answer, busy, switched off, callback, and wrong-number outcomes.
- Record call duration and notes.
- Update contact attempt count and last-contacted timestamp.
- Create a callback follow-up while logging a call.
- View call history, call attempts, and connected-call totals.

## 10. Follow-ups and tasks

- Create lead-linked tasks with a title and due date/time.
- Assign tasks to a user, according to available permissions.
- View today's, missed, upcoming, and completed follow-ups.
- Filter the follow-up view by assignee where permitted.
- Mark tasks completed or cancelled.
- Show pending tasks and overdue work in the lead workspace and dashboard.
- Cancel pending follow-ups when a lead is enrolled or rechurned.
- Optional browser push reminders through Firebase, with user permission and a configured scheduler.

## 11. Email, SMS, and WhatsApp

- Compose messages from a lead's workspace.
- Apply reusable templates for email, SMS, and WhatsApp.
- Personalise templates with `{{name}}`, `{{course}}`, `{{university}}`, and `{{agent}}`.
- Record recipient, content, sender, timestamp, and sent/failed/logged status.
- View a central message log filtered by channel.
- Block message actions for leads marked Do Not Disturb.
- Send email from the server when Resend is configured.
- Otherwise log email and provide a link to open the user's mail application.
- Log SMS and WhatsApp messages and provide links to open the device's SMS application or WhatsApp chat for sending.

## 12. Opportunities

- Create opportunities linked to a lead.
- Record title, amount, probability, expected close date, and notes.
- Track open, won, and lost statuses.
- Change an existing opportunity's status from the lead workspace.
- View opportunities across accessible leads and filter by status.
- View pipeline totals and weighted forecast values.
- Record opportunity activity in lead history.

## 13. Enrolments and fee tracking

- Enrol a lead into a university and one of its courses.
- Record enrolment date, enrolment number, fee, paid amount, and notes.
- Update an existing enrolment's details from the lead workspace.
- Move an enrolled lead to a configured won stage.
- Cancel outstanding follow-ups on enrolment.
- View an enrolment register with student, contact, university, course, fee, paid amount, balance, and enrolling user.
- View total fees, collected amounts, and outstanding balances.
- Update the cumulative paid amount.
- Validate that paid amounts stay between zero and the fee.
- Preserve credit to the original enrolling user when correcting enrolment details.

## 14. Lead reports

- Choose a reporting date range.
- Group leads by stage, source, owner, university, or city.
- View lead counts, contacted leads, enrolled leads, lost leads, and conversion percentages.
- Compare groups with visual bars and report totals.
- Download reports as CSV.
- Reports count leads created in the selected period, grouped by their current attributes, and respect the user's lead access.

## 15. Agent performance reports

- Available to managers and admins.
- Select a reporting date range.
- Review leads allotted, calls, connected calls, connection rate, and talk time.
- Review completed follow-ups, enrolments, and collected amounts.
- Identify users by name and User ID.
- Download performance reports as CSV.

## 16. User administration

- Admins can create users with name, email, password, phone, role, and reporting manager.
- Generate a User ID for each account.
- Edit user details, roles, and reporting relationships.
- Activate or deactivate users.
- Reset user passwords.
- Prevent invalid reporting relationships, including users reporting to themselves or circular manager chains.
- Prevent an admin from removing their own admin access.

## 17. Master data and templates

- Admins can create, edit, activate, or deactivate lead sources, universities, courses, funnels, stages, sub-stages, and message templates.
- Link courses to universities and configure course fees.
- Order stage funnels, stages, and sub-stages.
- Configure stage colours.
- Mark stages as won/enrolled or lost.
- Configure channel-specific message templates with email subjects and personalised bodies.

## 18. Company settings and personal profile

- Admins can configure the Lead Post webhook URL.
- Admins can enable contact masking in the lead list.
- Admins can change shared company login credentials.
- Users can update their own name and phone number.
- Users can change their password after verifying the current password.
- Configure application/company names through environment settings and branding colours in the project stylesheet.

## 19. Activity log

- Browse recorded CRM activity across leads the user can access.
- See the actor, event, timestamp, and related lead.
- Open the lead associated with an activity entry.
- Use the individual lead timeline for more detailed field-change history.

## 20. External integrations and availability

| Capability | Current delivery | Requirements or boundary |
| --- | --- | --- |
| Server email | Resend integration | Requires `RESEND_API_KEY` and `EMAIL_FROM`; otherwise uses logged messages and a mail-app link |
| SMS | Message logging and device SMS-app link | Server SMS provider integration would require additional implementation |
| WhatsApp | Message logging and WhatsApp chat link | WhatsApp Business/Cloud API delivery would require additional implementation |
| Calls | Device dialler link and manual call logging | Automated telephony and call recording are not provided |
| Lead Post | Send selected lead details as JSON to an external endpoint; save success/failure, HTTP status, and response | Admin must configure the webhook URL; triggered from a lead |
| Push reminders | Firebase browser notifications for follow-ups | Requires Firebase configuration, user permission, device registration, and a scheduler calling the reminder endpoint |
| Email OTP | Optional emailed login code | Requires enabling OTP and configuring Supabase email delivery/templates; unavailable in the local demo |
| Payments | Fee, cumulative paid amount, and balance tracking | Payment gateway processing and a transaction-by-transaction payment ledger are not provided |

## 21. Demo and operational support

- Local demo with sample data and Admin, Manager, and Agent accounts.
- Persistent local demo data between runs.
- Development mode and an optimised demo mode for browsing.
- Setup guidance screen when required Supabase configuration is missing.
- Supabase-backed authentication and PostgreSQL storage for normal deployment.
- Short-lived dashboard and lookup caching, refreshed after relevant CRM edits.
- Database upgrade scripts for existing installations.

## Implementation references

- [Project overview and setup](README.md)
- [Application modules](src/app/(app))
- [Lead actions](src/app/(app)/leads/actions.ts)
- [Upload, distribution, users, and settings actions](src/app/(app)/ops-actions.ts)
- [Master data definitions](src/lib/masters.ts)
- [Message delivery](src/lib/messaging.ts)
- [Database schema and access policies](supabase/schema.sql)
- [Follow-up reminder endpoint](src/app/api/cron/followup-reminders/route.ts)
