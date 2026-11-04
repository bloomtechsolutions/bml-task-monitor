-- Full activity log per task: creation, reassignment, priority, checklist, files, sub-tasks.
-- Status / progress / due-date changes and their notes stay in task_updates; comments in task_comments.
create table if not exists public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  kind        text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events (task_id, created_at);
create index if not exists task_events_actor_idx on public.task_events (actor_id);

alter table public.task_events enable row level security;
drop policy if exists open_access on public.task_events;
create policy open_access on public.task_events for all to anon, authenticated using (true) with check (true);
grant select, insert on public.task_events to anon;

-- Every new task (from the app or from a recurring rule) logs its creation.
create or replace function private.log_task_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_events (task_id, actor_id, kind, detail, created_at)
  values (new.id, new.assigned_by, 'created',
          jsonb_build_object('assignee_id', new.assignee_id, 'due_date', new.due_date, 'priority', new.priority,
                             'recurring', new.recurrence_rule_id is not null, 'requires_approval', new.requires_approval),
          new.created_at);
  return new;
end $$;
revoke execute on function private.log_task_created() from public;

drop trigger if exists tasks_log_created on public.tasks;
create trigger tasks_log_created after insert on public.tasks
  for each row execute function private.log_task_created();

-- Backfill creation events for existing tasks.
insert into public.task_events (task_id, actor_id, kind, detail, created_at)
select t.id, t.assigned_by, 'created',
       jsonb_build_object('assignee_id', t.assignee_id, 'due_date', t.due_date, 'priority', t.priority,
                          'recurring', t.recurrence_rule_id is not null, 'requires_approval', t.requires_approval),
       t.created_at
  from public.tasks t
 where not exists (select 1 from public.task_events e where e.task_id = t.id and e.kind = 'created');
