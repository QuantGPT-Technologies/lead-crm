# Lead CRM

In-house lead management CRM for education sales (single company).
Built with **Next.js 16 (App Router) + Supabase (Postgres, Auth, Row Level Security)**, with optional **Firebase** push reminders.

## Setup (about 10 minutes)

You need Node.js 20+ and a free Supabase account.

1. **Install**
   ```bash
   npm install
   ```
2. **Create a Supabase project** at https://supabase.com (New project).
3. **Create the database**: Supabase Dashboard → SQL Editor → New query → paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) → Run. Run it once, on an empty project.
4. **Add your keys**: copy `.env.example` to `.env.local` and fill in:

   | Variable | Where to find it |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → `anon` / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` / secret key (**never share or commit**) |
   | `APP_SECRET` | any long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `SETUP_*` | the first admin's name/email/password and the global (company) email/password |

5. **Create the first admin and the global login**
   ```bash
   npm run setup:admin
   ```
   It prints the admin's User ID (e.g. `EA00000001`).
6. **Run**
   ```bash
   npm run dev          # http://localhost:3000
   # production:
   npm run build && npm start
   ```

If the keys are missing, the app shows a `/setup` page with these same steps instead of crashing.

## Try it without Supabase (local demo)

```bash
npm run demo
```

Starts a real PostgreSQL, PostgREST (the REST layer Supabase uses, downloaded once) and a small stand-in for
Supabase Auth on this machine, loads `supabase/schema.sql` plus sample leads, and runs the app against them at
http://localhost:3000. Sign in with `company@demo.test` / `Demo@1234`, then `EA00000001` / `Demo@1234`
(`EA00000002` is a manager, `EA00000003`-`5` are agents). Data is kept in `.demo/`; `npm run demo -- --reset` wipes it.
The app code is identical in demo and real mode; `.env.local` is ignored while the demo runs. Email OTP is not
available in the demo. It is for viewing and testing only, not for production.

## Signing in

1. **Global Sign In** – the shared company email + password (`SETUP_GLOBAL_*`). Turn off with `AUTH_REQUIRE_GLOBAL_LOGIN=false`.
2. **User Login** – the person's User ID (or email) + their own password.
3. **OTP Validation** – a code emailed to the user. Off by default (`AUTH_REQUIRE_OTP=false`).

**To turn OTP on:** Supabase → Authentication → Email Templates → **Magic Link** → put `{{ .Token }}` in the body
(for example `Your login code is {{ .Token }}`), save, then set `AUTH_REQUIRE_OTP=true`.
Supabase's built-in mailer only sends a few emails per hour; for real use add your own SMTP under
Authentication → SMTP Settings.

After the first login, change both passwords: **Configuration → Settings** (global) and **Others → My Profile** (your own).

## Roles

| Role | Sees | Can do |
| --- | --- | --- |
| Agent | only leads they own | work leads, log calls, follow-ups, messages, enrol |
| Manager | own leads, their team's leads (users whose "Reports to" is them), unassigned leads | + upload, distribute, allot, rechurn, agent report |
| Admin | everything | + users, masters, templates, settings, delete leads |

These rules are enforced in the database (Row Level Security in `schema.sql`), not just hidden in the UI.

## Modules

| Menu | What it does |
| --- | --- |
| Dashboard | 7-day KPIs vs the previous week, leads by source, leads vs enrolments chart, recent activity |
| Search Lead | find a lead by name, mobile, email or lead number |
| Upload | bulk import a CSV into the unassigned pool; duplicates (by mobile) are skipped and reported |
| Distribute | share unassigned leads equally (round robin) between chosen users |
| Data Allotment | per-user load; move leads between users or back to the pool |
| Lead → Kanban / List / Add | drag between stages; filterable, sortable list with bulk actions; add form |
| Lead page | Overview, Client, Lead, Stage, Location, Internals, Professional, Rechurn tabs; history timeline; call history; lead post; email / note / follow-up / assign / opportunity / SMS / call / enrol / WhatsApp |
| Followups | today, missed, upcoming, completed |
| Enrolled | enrolments with fee, collected and outstanding |
| Opportunity | pipeline, weighted forecast, won / lost |
| Reports | leads by stage / source / owner / university / city, agent performance, CSV export |
| Communication | message log and templates (`{{name}} {{course}} {{university}} {{agent}}`) |
| Configuration | users, masters (sources, universities, courses, funnels, stages, sub stages), settings |
| Others | activity log, my profile / change password |

## Optional integrations

- **Email sending** – set `RESEND_API_KEY` and `EMAIL_FROM` (https://resend.com). Without it, emails are saved to the
  lead's history and opened in the user's own mail app.
- **SMS / WhatsApp** – messages are saved to history and opened in the device's SMS app / WhatsApp chat.
  To send from the server, add your provider (MSG91, Twilio, WhatsApp Cloud API…) in `src/lib/messaging.ts`.
- **Calls** – the Dial button uses the device dialler; the agent logs the outcome. There is no telephony integration.
- **Lead Post** – set a URL in Configuration → Settings to POST a lead as JSON to another system.
- **Firebase push reminders** – fill the `FIREBASE_*` keys, users click **Enable reminders** in the top-right account
  menu, and a scheduler calls `GET /api/cron/followup-reminders?secret=CRON_SECRET` every 5–10 minutes.

## Project layout

```
supabase/schema.sql          tables, row level security, report functions, seed data
scripts/setup-admin.mjs      creates the first admin + global login
src/proxy.ts                 session refresh + redirect to /login
src/lib/                     supabase clients, auth, shared queries, masters definition
src/app/login/               3-step sign-in
src/app/(app)/               all signed-in pages
src/app/(app)/leads/actions.ts   every lead mutation (server actions)
src/app/(app)/ops-actions.ts     upload, distribute, users, masters, settings
```

## Branding

Set `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_COMPANY_NAME` in `.env.local`. Colours are the `--brand*` variables at the
top of `src/app/globals.css`. The sidebar logo is in `src/components/sidebar.tsx`.
