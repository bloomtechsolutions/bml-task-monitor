# Retail Task Monitor

This app is for assigning, tracking and following up on tasks across the BML Retail Banking units.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS) · Vercel (Mumbai `bom1`)

## Roles

| Role | Access |
|---|---|
| Head of Retail | Sees and manages everything. Manages people and units. |
| Unit manager | Assigns and manages tasks in their own unit. Sees the team dashboard. |
| Staff | Updates their own tasks. Can add tasks for themselves. |

All access rules are enforced in Postgres with row-level security. Hiding something in the UI is never what protects it. A new sign-in has no access until the Head places that person in a unit on **People**.

## Screens (Phase 1)

- **My tasks** (`/`) shows tasks assigned to you or assigned by you, grouped by Overdue, Blocked, Due in 7 days and Later.
- **Task** (`/tasks/[id]`) lets you post a progress update (status, % and note), add comments and sub-tasks, and see the full audit trail. Managers can also change the due date, priority or assignee, or cancel the task.
- **Assign** (`/tasks/new`) creates a task or a sub-task.
- **Team** (`/team`) shows open, overdue and blocked counts, the on-time rate, a breakdown by unit and workload per person.
- **People** (`/admin`) manages units (name, code, active) and people (unit, role, active). Add units first.

## Environment variables

| Name | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser-safe |

Never prefix the service-role key with `NEXT_PUBLIC_`. When Phase 3 adds reminders, they will run in a Supabase Edge Function, and secrets will stay there.

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Schema changes go in `supabase/migrations/`. After each change, regenerate `src/lib/database.types.ts`.

## Database

Supabase project `ylpzyypgiovqxdaoqius` (Mumbai, `ap-south-1`). Migrations, in order:

1. `20261104070000_baseline_schema.sql` creates the tables, enums, triggers (completion bookkeeping, audit trail), indexes and the `task_overview` view.
2. `20261104071500_open_access_no_login.sql` sets open-access policies and the `post_task_update` / `update_task_as` RPCs, and seeds the Head of Retail.

Both are applied to the project. To rebuild a fresh project, run them in the SQL editor in this order.
