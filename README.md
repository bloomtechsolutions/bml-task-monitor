# Retail Task Monitor

This app is for assigning, tracking and following up on tasks across the BML Retail Banking units.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS) · Vercel (Mumbai `bom1`)

## Sign-in and roles

People sign in with their **staff number and a password**. The Head sets a temporary password on **People & units**; the person must choose their own at first sign-in. Five wrong attempts lock a staff number for 15 minutes (resetting the password unlocks it). Sessions last 12 hours; resetting a password or deactivating someone signs them out everywhere.

| Role | Can |
|---|---|
| Head of Retail | Everything: all units, people & units, settings, reports for every unit. |
| Unit manager | Assign and manage work in their unit, approve sign-offs, team overview, recurring tasks, templates, projects and reports for their unit. |
| Staff | Work on their own tasks, add tasks for themselves, record their own leave. |

Roles are enforced on the server in every page and action. Password hashes live in a `private` database schema the API can't read.

## Screens

- **Dashboard** (`/`): greeting, counts, priority tasks, quick links, and work waiting on your follow-up or sign-off.
- **My tasks** (`/tasks`): assigned to me / assigned by me, grouped by urgency, including "Waiting for sign-off".
- **Board** (`/board`): Kanban by status; drag a card or use its "Move to…" menu (keyboard and phone friendly).
- **Calendar** (`/calendar`): month view of due dates with team leave; agenda list on phones.
- **Task** (`/tasks/[id]`): progress updates, checklist, evidence files (PDF, images, Office, CSV; 4 MB), sub-tasks, comments, sign-off (approve / send back), full audit trail.
- **Assign** (`/tasks/new`): start from a template, choose project, checklist, "needs my sign-off"; each person shows open-task count and upcoming leave.
- **Projects**, **Recurring tasks** (daily Sun–Thu / weekly / monthly / quarterly), **Templates**, **Leave**.
- **Team overview** (`/team`): unit and per-person workload with overload and leave flags.
- **Reports** (`/reports`): created, completed, on-time rate, average delay, overdue; weekly chart; by unit and by person; CSV export (opens in Excel) and print to PDF.
- **Notifications** (bell): assignments, sign-off requests and results, comments, blocked tasks, due tomorrow/today, overdue, escalations, weekly digest.
- **People & units**, **Settings** (Head only), **Account** (change password).

## Automations (pg_cron, times in Maldives time)

| Job | When | What |
|---|---|---|
| `tm-recurring` | 00:05 daily | Creates recurring tasks inside their lead time. |
| `tm-reminders` | 08:00 daily | Due tomorrow/today and overdue reminders; escalates to the unit manager after N days overdue and to the Head after 2N (N in Settings). |
| `tm-digest` | 07:30 Sunday | Weekly summary notification for everyone with open work. |

Email for the weekly digest is optional: set `RESEND_API_KEY` and `DIGEST_FROM` in Vercel and the Sunday cron (`/api/cron/digest`, protected by `CRON_SECRET`) emails it too.

## Environment variables (server-side only)

| Name | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Database access. Never exposed to the browser. |
| `SESSION_SECRET` | Signs session cookies (32+ chars). Changing it signs everyone out. |
| `CRON_SECRET` | Protects the digest cron endpoint. |
| `RESEND_API_KEY`, `DIGEST_FROM`, `APP_URL` | Optional: weekly digest email. |

## Development

```bash
cp .env.example .env.local   # fill in the variables above
npm install
npm run dev
```

Schema changes go in `supabase/migrations/`. After each change, regenerate `src/lib/database.types.ts`.

## Database

Supabase project `ylpzyypgiovqxdaoqius` (Mumbai, `ap-south-1`). Migrations, in order:

1. `20261104070000_baseline_schema.sql` creates the tables, enums, triggers (completion bookkeeping, audit trail), indexes and the `task_overview` view.
2. `20261104071500_open_access_no_login.sql` adds the `post_task_update` / `update_task_as` RPCs and seeds the Head of Retail. (The database trusts the app server; the app enforces sign-in and roles.)

3. `20261104090000_enum_values.sql` adds `submitted` and `daily`.
4. `20261104090500_phase2_features.sql` adds sign-in, approvals, checklists, templates, evidence storage, leave, notifications, recurring generation, reminders/escalation, digest and the cron schedules.

All are applied to the project. To rebuild a fresh project, run them in the SQL editor in this order.
