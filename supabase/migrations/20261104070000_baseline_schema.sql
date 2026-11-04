-- Baseline schema for the Retail Task Monitor.
-- Applied before 20261104071500_open_access_no_login.sql, which sets the access policies.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- Enums ----------
create type public.user_role            as enum ('head', 'manager', 'staff');
create type public.task_status          as enum ('not_started', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority        as enum ('low', 'medium', 'high', 'urgent');
create type public.project_status       as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'quarterly');

-- ---------- Helpers ----------
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Units & people ----------
create table public.units (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (char_length(code) between 1 and 20),
  name        text not null unique check (char_length(name) between 2 and 120),
  manager_id  uuid,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  full_name    text check (char_length(full_name) <= 120),
  email        text unique,
  staff_no     text unique,
  designation  text,
  role         public.user_role not null default 'staff',
  unit_id      uuid references public.units(id) on delete set null,
  manager_id   uuid references public.profiles(id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.units
  add constraint units_manager_id_fkey foreign key (manager_id) references public.profiles(id) on delete set null;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------- Projects & recurring work ----------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 200),
  description  text,
  unit_id      uuid not null references public.units(id) on delete restrict,
  owner_id     uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  status       public.project_status not null default 'active',
  start_date   date,
  target_date  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger projects_updated_at before update on public.projects
  for each row execute function private.set_updated_at();

create table public.recurrence_rules (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 3 and 200),
  description    text,
  unit_id        uuid not null references public.units(id) on delete restrict,
  assignee_id    uuid not null references public.profiles(id) on delete restrict,
  created_by     uuid references public.profiles(id) on delete set null,
  frequency      public.recurrence_frequency not null,
  day_of_week    smallint check (day_of_week between 0 and 6),
  day_of_month   smallint check (day_of_month between 1 and 31),
  lead_days      smallint not null default 3 check (lead_days between 0 and 60),
  next_due_date  date not null,
  priority       public.task_priority not null default 'medium',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger recurrence_rules_updated_at before update on public.recurrence_rules
  for each row execute function private.set_updated_at();

-- ---------- Tasks ----------
create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (char_length(title) between 3 and 200),
  description         text,
  unit_id             uuid not null references public.units(id) on delete restrict,
  assignee_id         uuid not null references public.profiles(id) on delete restrict,
  assigned_by         uuid references public.profiles(id) on delete set null,
  project_id          uuid references public.projects(id) on delete set null,
  parent_task_id      uuid references public.tasks(id) on delete cascade,
  recurrence_rule_id  uuid references public.recurrence_rules(id) on delete set null,
  status              public.task_status not null default 'not_started',
  priority            public.task_priority not null default 'medium',
  progress            smallint not null default 0 check (progress between 0 and 100),
  start_date          date,
  due_date            date not null,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tasks_not_own_parent check (parent_task_id is null or parent_task_id <> id)
);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

create or replace function private.task_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at = now(); new.progress = 100;
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at = null;
  end if;
  return new;
end $$;
create trigger tasks_completion before update on public.tasks
  for each row execute function private.task_completion();

-- Audit trail
create table public.task_updates (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  note          text check (char_length(note) <= 2000),
  old_status    public.task_status,
  new_status    public.task_status,
  old_progress  smallint,
  new_progress  smallint,
  old_due_date  date,
  new_due_date  date,
  created_at    timestamptz not null default now()
);

create or replace function private.log_task_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status or new.progress is distinct from old.progress
     or new.due_date is distinct from old.due_date then
    insert into public.task_updates (task_id, author_id, note, old_status, new_status, old_progress, new_progress, old_due_date, new_due_date)
    values (new.id, nullif(current_setting('app.actor', true), '')::uuid,
            nullif(current_setting('app.update_note', true), ''),
            old.status, new.status, old.progress, new.progress, old.due_date, new.due_date);
  end if;
  return new;
end $$;
create trigger tasks_log_change after update on public.tasks
  for each row execute function private.log_task_change();

create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create table public.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  file_name     text not null,
  storage_path  text not null unique,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid references public.profiles(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  kind          text not null,
  channel       text not null,
  sent_at       timestamptz not null default now(),
  read_at       timestamptz
);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Indexes (every FK + the hot filters) ----------
create index on public.units (manager_id);
create index on public.profiles (unit_id);
create index on public.profiles (manager_id);
create index on public.projects (unit_id);
create index on public.projects (owner_id);
create index on public.projects (created_by);
create index on public.recurrence_rules (unit_id);
create index on public.recurrence_rules (assignee_id);
create index on public.recurrence_rules (created_by);
create index on public.tasks (assignee_id, due_date);
create index on public.tasks (assigned_by);
create index on public.tasks (unit_id, status);
create index on public.tasks (project_id);
create index on public.tasks (parent_task_id);
create index on public.tasks (recurrence_rule_id);
create index on public.tasks (due_date) where status not in ('done', 'cancelled');
create index on public.task_updates (task_id, created_at desc);
create index on public.task_updates (author_id);
create index on public.task_comments (task_id, created_at desc);
create index on public.task_comments (author_id);
create index on public.task_attachments (task_id);
create index on public.task_attachments (uploaded_by);
create index on public.notifications (recipient_id, sent_at desc);
create index on public.notifications (task_id);

-- ---------- Row-level security (policies are added by the next migration) ----------
alter table public.units            enable row level security;
alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_updates     enable row level security;
alter table public.task_comments    enable row level security;
alter table public.task_attachments enable row level security;
alter table public.notifications    enable row level security;
alter table public.app_settings     enable row level security;

-- ---------- Read model used by every list screen ----------
-- security_invoker: the view obeys the caller's RLS, never the owner's.
create view public.task_overview with (security_invoker = true) as
select
  t.id, t.title, t.description, t.status, t.priority, t.progress,
  t.start_date, t.due_date, t.completed_at, t.created_at, t.updated_at,
  t.unit_id, u.name as unit_name, u.code as unit_code,
  t.assignee_id, a.full_name as assignee_name,
  t.assigned_by, b.full_name as assigned_by_name,
  t.project_id, p.title as project_title,
  t.parent_task_id, t.recurrence_rule_id,
  (t.status not in ('done', 'cancelled')
     and t.due_date < (now() at time zone 'Indian/Maldives')::date) as is_overdue,
  case when t.status not in ('done', 'cancelled')
            and t.due_date < (now() at time zone 'Indian/Maldives')::date
       then (now() at time zone 'Indian/Maldives')::date - t.due_date
       else 0 end as days_overdue,
  (select count(*) from public.tasks s where s.parent_task_id = t.id and s.status <> 'cancelled')::int as subtask_count
from public.tasks t
join public.units u on u.id = t.unit_id
join public.profiles a on a.id = t.assignee_id
left join public.profiles b on b.id = t.assigned_by
left join public.projects p on p.id = t.project_id;

grant select on public.task_overview to authenticated;
